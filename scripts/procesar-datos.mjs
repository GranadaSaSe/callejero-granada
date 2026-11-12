// Paso 1.2 del plan: limpia y une los datos descargados en el paso 1.1 y crea los archivos que usará
// la app, en public/datos/:
//
//   zonas.json       distritos y barrios
//   calles.json      cada calle oficial: tipo, distrito, barrios, inicio, fin, cruces, sentido y números
//   tramos.json      cada tramo de calle con su línea y su sentido de circulación
//   lugares.json     edificios y lugares de interés con su dirección, distrito y barrio
//   carreteras.json  carreteras con código de la zona de los parques de Granada
//   salidas.json     salidas de autovía de esa zona con sus destinos en cada sentido
//   municipios.json  municipios de esa zona con su pueblo principal, vecinos, carreteras que pasan y cómo se
//                    llega desde Granada
//   parques.json     línea entre el Parque Norte y el Parque Sur (las calles y los lugares llevan su parque)
//   poligonos.json   polígonos industriales de la zona (lista del PDF de la persona, situados con OpenStreetMap)
//   altos.json       edificios de gran altura de Granada con sus plantas (Catastro)
//
// Los edificios singulares (lista del PDF de la persona) van en lugares.json con la calle del PDF.
//
// Los nombres y los tramos de las calles salen del callejero oficial (CDAU). El sentido de circulación
// sale del CDAU y, donde no lo trae, de OpenStreetMap; si los dos no coinciden, el tramo queda marcado
// como dudoso para revisarlo. Escribe además datos/informe-datos.md con las cifras y datos/informe-zona.md
// con las salidas y los accesos de la zona de los parques de Granada, y datos/informe-material.md con lo que sale
// del material de la persona (parques, polígonos, edificios singulares y de gran altura) para revisarlo.
//
// Uso: `npm run datos:procesar` (después de `npm run datos:descargar`).

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { categoria } from './lib/categorias.mjs'
import {
  aMetros,
  anillosDeRelacion,
  centroDeAnillos,
  centroDeRelacion,
  cosenoEntre,
  crearIndice,
  distancia,
  distanciaASegmento,
  longitud,
  prepararZona,
  puntoEnAnillo,
  redondear,
  simplificar,
} from './lib/geo.mjs'
import { clavesNombre, normalizar } from './lib/nombres.mjs'
import { anadirSegmento, crearRed, nivelDeVia, pasoLimitado } from './lib/red-datos.mjs'
import { direccionesCatastro, partesAltas, TIPOS_CATASTRO, utmALonLat } from './lib/catastro.mjs'
import { EDIFICIOS_SINGULARES } from './lib/edificios-singulares.mjs'
import { incorporaciones } from './lib/incorporaciones.mjs'
import { ladoDeParques, lineaEntreParques } from './lib/parques-datos.mjs'
import { CALLES_LIMITE } from './lib/parques-limite.mjs'
import { POLIGONOS } from './lib/poligonos.mjs'
import { accesosDesdeGranada, codigos, municipiosDeLaZona, salidasDeLaZona, textoAcceso, tiemposDesdeParques } from './lib/zona-datos.mjs'
import { PARQUE_DE_MUNICIPIO, ZONA_PARQUES } from './lib/zona-parques.mjs'

const RAIZ = join(import.meta.dirname, '..')
const CRUDOS = join(RAIZ, 'datos', 'crudos')
const SALIDA = join(RAIZ, 'public', 'datos')
const leer = async (nombre) => JSON.parse(await readFile(join(CRUDOS, nombre), 'utf8'))
const guardar = (nombre, datos) => writeFile(join(SALIDA, nombre), JSON.stringify(datos))
const coleccion = (features) => ({ type: 'FeatureCollection', features })
const clave = ([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`
const medio = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const unicos = (lista) => [...new Set(lista)]
const lineas = (g) => (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates])
const separar = (valor) =>
  (valor ?? '')
    .split(';')
    .map((x) => x.replaceAll('_', ' ').trim())
    .filter(Boolean)
// Plaza del Carmen: sin portales, se supone que la calle empieza en el extremo más cercano al centro
const AYUNTAMIENTO = [-3.5988, 37.1734]

const [limites, callesOsm, restriccionesOsm, edificiosOsm, carreterasOsm, municipiosOsm, fondoOsm, poligonosOsm, rutasOsm, viales, tramosCdau, portales] =
  await Promise.all(
    [
      'osm-limites',
      'osm-calles',
      'osm-restricciones',
      'osm-edificios',
      'osm-carreteras',
      'osm-municipios',
      'osm-fondo',
      'osm-poligonos',
      'osm-rutas',
      'cdau-viales',
      'cdau-tramos',
      'cdau-portales',
    ].map((n) => leer(`${n}.json`)),
  )
// Se puede descargar solo una parte (`npm run datos:descargar -- fondo`): entonces hay varias fechas
const fechasDescarga = (await readdir(CRUDOS)).filter((n) => n.startsWith('descarga-')).sort().map((n) => n.slice(9, 19))
const fechaDescarga =
  fechasDescarga.length > 1 ? `entre el ${fechasDescarga[0]} y el ${fechasDescarga.at(-1)}` : `el ${fechasDescarga[0]}`
// Decisiones tomadas a mano en el mapa de revisión (paso 1.3): mandan sobre el CDAU y OpenStreetMap
const revisiones = await readFile(join(RAIZ, 'datos', 'revisiones.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => ({ tramos: {} }))
await mkdir(SALIDA, { recursive: true })

// 1. Distritos y barrios (OpenStreetMap)
const relaciones = limites.elements.filter((e) => e.type === 'relation')
const distritos = relaciones.filter((r) => r.tags.admin_level === '9').map(prepararZona)
const barrios = relaciones
  .filter((r) => r.tags.admin_level === '10')
  .map((r) => {
    const zona = prepararZona(r)
    const centro = centroDeRelacion(r)
    zona.distrito = distritos.find((d) => d.contiene(centro))?.nombre ?? null
    return zona
  })

function zonaDe(punto) {
  const barrio = barrios.find((b) => b.contiene(punto))
  const distrito = barrio?.distrito ?? distritos.find((d) => d.contiene(punto))?.nombre ?? null
  return { distrito, barrio: barrio?.nombre ?? null }
}

const poligono = (zona, tolerancia) => ({
  type: 'MultiPolygon',
  coordinates: zona.exteriores.map((anillo) => [redondear(simplificar(anillo, tolerancia))]),
})
// Punto donde escribir el nombre de la zona: su centro, o un punto de su borde si el centro cae fuera
const etiqueta = (zona) => {
  const centro = centroDeAnillos(zona.exteriores)
  const punto = centro && zona.contiene(centro) ? centro : zona.exteriores[0][0]
  return { type: 'Point', coordinates: redondear([punto])[0] }
}
await guardar(
  'zonas.json',
  coleccion([
    ...distritos.map((d) => ({ type: 'Feature', properties: { nivel: 'distrito', nombre: d.nombre }, geometry: poligono(d, 3) })),
    ...barrios.map((b) => ({
      type: 'Feature',
      properties: { nivel: 'barrio', nombre: b.nombre, distrito: b.distrito },
      geometry: poligono(b, 3),
    })),
    ...distritos.map((d) => ({ type: 'Feature', properties: { nivel: 'etiqueta-distrito', nombre: d.nombre }, geometry: etiqueta(d) })),
    ...barrios.map((b) => ({ type: 'Feature', properties: { nivel: 'etiqueta-barrio', nombre: b.nombre }, geometry: etiqueta(b) })),
  ]),
)

// 2. Vías oficiales y sus tramos (CDAU)
const vias = new Map()
for (const f of viales.features) {
  const p = f.properties
  let nombre = p.nom_normalizado ?? `${p.nom_tip_via} ${p.nom_via}`
  // Alguna vía viene con las letras rotas por un error de codificación ("AndalucÃ­a" → "Andalucía")
  if (/[ÃÂ]/.test(nombre)) nombre = Buffer.from(nombre, 'latin1').toString('utf8')
  // Y alguna, con un guion invisible detrás de la tilde ("Marí­n"), que se ve raro al escribir el nombre
  nombre = nombre.replace(/­/g, '')
  const palabrasTipo = normalizar(p.nom_tip_via ?? '').split(' ')
  const tipo = normalizar(nombre).startsWith(palabrasTipo.join(' '))
    ? nombre.split(' ').slice(0, palabrasTipo.length).join(' ')
    : p.nom_tip_via
  vias.set(p.id_vial, { id: p.id_vial, nombre, tipo, sinNombre: p.nom_tip_via === 'VIA', tramos: [], tramosPlaza: [], portales: [] })
}
const nombreVia = (id) => {
  const via = vias.get(id)
  return via && !via.sinNombre ? via.nombre : null
}

// A qué vía pertenece cada tramo: por sus extremos, por sus portales o por cercanía
const viaPorExtremos = new Map()
const indiceVias = crearIndice(40)
for (const f of viales.features) {
  for (const linea of lineas(f.geometry)) {
    viaPorExtremos.set(`${clave(linea[0])}|${clave(linea.at(-1))}`, f.properties.id_vial)
    viaPorExtremos.set(`${clave(linea.at(-1))}|${clave(linea[0])}`, f.properties.id_vial)
    for (let i = 1; i < linea.length; i++) indiceVias.anadir(linea[i - 1], linea[i], f.properties.id_vial)
  }
}
const viaPorPortal = new Map(portales.features.map((p) => [p.properties.id_tramo, p.properties.id_vial]))

function segmentoCentral(linea) {
  const i = Math.floor((linea.length - 1) / 2)
  return [linea[i], linea[i + 1]]
}

function viaDelTramo(id, linea) {
  const porExtremos = viaPorExtremos.get(`${clave(linea[0])}|${clave(linea.at(-1))}`)
  if (porExtremos) return porExtremos
  if (viaPorPortal.has(id)) return viaPorPortal.get(id)
  const seg = segmentoCentral(linea)
  const centro = medio(...seg)
  let mejor = null
  for (const c of indiceVias.cercanos(centro)) {
    const d = distanciaASegmento(centro, c.a, c.b)
    if (d < 3 && Math.abs(cosenoEntre(seg, [c.a, c.b])) > 0.9 && (!mejor || d < mejor.d)) mejor = { d, via: c.dato }
  }
  return mejor?.via ?? null
}

// 3. Sentido de circulación: el del CDAU y, donde no lo trae, el de OpenStreetMap
// Códigos del CDAU deducidos comparándolos con OpenStreetMap (ver informe): "directo" = en el sentido
// en que está dibujado el tramo, "inverso" = al contrario.
const SENTIDO_CDAU = { 311: 'directo', 331: 'directo', 322: 'inverso', 332: 'inverso', 333: 'doble', 330: 'peatonal' }
const PEATONALES = new Set(['pedestrian', 'footway', 'steps', 'path', 'cycleway'])
const indiceOsm = crearIndice(40)
for (const w of callesOsm.elements) {
  if (w.type !== 'way') continue
  const t = w.tags
  const unico =
    ['yes', '1', 'true'].includes(t.oneway) || (t.junction === 'roundabout' && t.oneway !== 'no') ? 1 : t.oneway === '-1' ? -1 : 0
  const dato = {
    unico,
    peatonal: PEATONALES.has(t.highway),
    nombre: t.name ?? null,
    clase: t.highway,
    limitado: pasoLimitado(t),
    nivel: nivelDeVia(t),
  }
  const linea = w.geometry.map((p) => [p.lon, p.lat])
  for (let i = 1; i < linea.length; i++) indiceOsm.anadir(linea[i - 1], linea[i], dato)
}

// La vía de OpenStreetMap que corresponde a un tramo: su sentido y cómo escribe el nombre
function parejaOsm(linea) {
  const seg = segmentoCentral(linea)
  const centro = medio(...seg)
  let mejor = null
  for (const c of indiceOsm.cercanos(centro)) {
    const d = distanciaASegmento(centro, c.a, c.b)
    const cos = cosenoEntre(seg, [c.a, c.b])
    if (d < 12 && Math.abs(cos) > 0.8 && (!mejor || d < mejor.d)) mejor = { d, cos, ...c.dato }
  }
  if (!mejor) return { sentido: null, nombre: null, clase: null, limitado: false, nivel: 0 }
  const sentido = mejor.peatonal
    ? 'peatonal'
    : mejor.unico === 0
      ? 'doble'
      : mejor.unico * Math.sign(mejor.cos) > 0
        ? 'directo'
        : 'inverso'
  return { sentido, nombre: mejor.nombre, clase: mejor.clase, limitado: mejor.limitado, nivel: mejor.nivel }
}

// Un bulevar: el callejero dibuja una sola línea por el centro, sin decir el sentido, y OpenStreetMap una calzada de
// sentido único a cada lado, una en cada sentido. Se circula en los dos sentidos. Aquí se mira
// OpenStreetMap; que el callejero no dibuje otra línea al lado (una por calzada) se mira con todos los tramos ya leídos.
function calzadasALosLados(linea) {
  const seg = segmentoCentral(linea)
  const centro = medio(...seg)
  const [ax, ay] = aMetros(seg[0])
  const [bx, by] = aMetros(seg[1])
  const flujos = new Set()
  for (const c of indiceOsm.cercanos(centro)) {
    if (c.dato.peatonal || !c.dato.unico) continue
    const d = distanciaASegmento(centro, c.a, c.b)
    const cos = cosenoEntre(seg, [c.a, c.b])
    if (d < 3 || d > 20 || Math.abs(cos) < 0.8) continue
    const [px, py] = aMetros(medio(c.a, c.b))
    const lado = Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax))
    flujos.add(`${lado},${c.dato.unico * Math.sign(cos)}`)
  }
  return (flujos.has('1,1') && flujos.has('-1,-1')) || (flujos.has('1,-1') && flujos.has('-1,1'))
}

const tramos = []
for (const f of tramosCdau.features) {
  const linea = lineas(f.geometry).flat()
  if (linea.length < 2) continue
  const via = viaDelTramo(f.properties.id_tramo, linea)
  const cdau = SENTIDO_CDAU[f.properties.circulacion] ?? null
  const osm = parejaOsm(linea)
  // Un tramo revisado como "plaza" no es una calle sino parte de una plaza (notas de Gonzalo del 6-11-2026): no
  // se dibuja ni se pregunta como calle y la plaza sale como un punto con su nombre entre los lugares de interés.
  // Por algunas plazas siguen pasando coches: "circulacion" dice cómo (directo, inverso o doble), y así entra en
  // la red de los trayectos; si no lo dice, no se circula por ella (cuenta como peatonal)
  const decision = revisiones.tramos[f.properties.id_tramo] ?? null
  const plaza = decision?.sentido === 'plaza'
  const revisado = plaza ? (decision.circulacion ?? 'peatonal') : (decision?.sentido ?? null)
  const tramo = {
    id: f.properties.id_tramo,
    via,
    linea,
    cdau,
    osm: osm.sentido,
    nombreOsm: osm.nombre,
    clase: osm.clase,
    limitado: osm.limitado,
    nivel: osm.nivel,
    revisado,
    sentido: revisado ?? cdau ?? osm.sentido ?? 'desconocido',
    bulevar: !cdau && !revisado && calzadasALosLados(linea),
    dudoso: !revisado && Boolean(cdau && osm.sentido && cdau !== osm.sentido),
    longitud: longitud(linea),
    plaza,
  }
  tramos.push(tramo)
  vias.get(via)?.[plaza ? 'tramosPlaza' : 'tramos'].push(tramo)
}

const indiceParalelas = crearIndice(40)
for (const t of tramos) {
  if (t.cdau === 'peatonal') continue
  for (let i = 1; i < t.linea.length; i++) anadirSegmento(indiceParalelas, t.linea[i - 1], t.linea[i], t)
}
for (const t of tramos.filter((x) => x.bulevar)) {
  const seg = segmentoCentral(t.linea)
  const centro = medio(...seg)
  t.bulevar = !indiceParalelas
    .cercanos(centro)
    .some((c) => c.dato !== t && distanciaASegmento(centro, c.a, c.b) < 22 && Math.abs(cosenoEntre(seg, [c.a, c.b])) > 0.9)
  if (t.bulevar) t.sentido = 'doble'
}

// El CDAU escribe a veces los nombres sin tildes ni artículos ("Camino Ronda"). Si OpenStreetMap llama
// a la misma calle de forma equivalente, se muestra su forma escrita y se guarda también la oficial.
for (const via of vias.values()) {
  if (via.sinNombre) continue
  const claves = new Set(clavesNombre(via.nombre))
  const votos = new Map()
  for (const t of [...via.tramos, ...via.tramosPlaza]) {
    // Se descartan nombres con letras rotas por un error de codificación ("AndalucÃ­a")
    if (t.nombreOsm && !/[ÃÂ]/.test(t.nombreOsm) && clavesNombre(t.nombreOsm).some((k) => claves.has(k))) {
      votos.set(t.nombreOsm, (votos.get(t.nombreOsm) ?? 0) + t.longitud)
    }
  }
  via.nombreOficial = via.nombre
  if (votos.size) via.nombre = [...votos].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
}
for (const p of portales.features) {
  vias.get(p.properties.id_vial)?.portales.push({
    numero: p.properties.num_por_desde,
    etiqueta: p.properties.etiqueta,
    cp: p.properties.cod_postal,
    punto: p.geometry.coordinates,
  })
}

// 4. Recorrido de cada calle: dónde empieza, dónde termina y qué calles cruza, en orden
const tramosEnNodo = new Map()
for (const t of tramos) {
  if (t.plaza) continue // una plaza no cuenta como calle que empieza, acaba o se cruza
  for (const p of [t.linea[0], t.linea.at(-1)]) {
    const k = clave(p)
    if (!tramosEnNodo.has(k)) tramosEnNodo.set(k, [])
    tramosEnNodo.get(k).push(t)
  }
}
const indiceCalles = crearIndice(60)
for (const t of tramos) {
  if (!nombreVia(t.via)) continue
  for (let i = 1; i < t.linea.length; i++) indiceCalles.anadir(t.linea[i - 1], t.linea[i], vias.get(t.via))
}

// Calles que se juntan en un nodo. Si en el nodo solo hay vías sin nombre (una glorieta, por ejemplo),
// se recorren hasta 80 m para ver a qué calles llevan. Si el extremo no comparte punto con ninguna (pasa a
// veces cuando la otra calle no está cortada ahí), se buscan las que pasan a menos de 8 metros.
function callesEnNodo(k, via) {
  const deOtra = (otra) => otra && otra.id !== via.id && !otra.sinNombre && otra.nombre !== via.nombre
  const juntas = unicos(tramosEnNodo.get(k).map((t) => vias.get(t.via)).filter(deOtra).map((v) => v.nombre))
  if (juntas.length) return juntas

  const sinNombre = (t) => !vias.get(t.via) || vias.get(t.via).sinNombre
  const distancias = new Map([[k, 0]])
  const porVisitar = [k]
  const alcanzadas = []
  while (porVisitar.length) {
    const nodo = porVisitar.shift()
    for (const t of tramosEnNodo.get(nodo) ?? []) {
      const otra = vias.get(t.via)
      if (deOtra(otra)) alcanzadas.push({ d: distancias.get(nodo), nombre: otra.nombre })
      if (!sinNombre(t)) continue
      const otroExtremo = clave(t.linea[0]) === nodo ? clave(t.linea.at(-1)) : clave(t.linea[0])
      const d = distancias.get(nodo) + t.longitud
      if (d <= 80 && (!distancias.has(otroExtremo) || d < distancias.get(otroExtremo))) {
        distancias.set(otroExtremo, d)
        porVisitar.push(otroExtremo)
      }
    }
  }
  if (alcanzadas.length) return unicos(alcanzadas.sort((a, b) => a.d - b.d).map((a) => a.nombre))
  const punto = k.split(',').map(Number)
  return unicos(
    indiceCalles
      .cercanos(punto)
      .map((c) => ({ d: distanciaASegmento(punto, c.a, c.b), via: c.dato }))
      .filter((c) => c.d < 8 && deOtra(c.via))
      .sort((a, b) => a.d - b.d)
      .map((c) => c.via.nombre),
  )
}

function contarValores(lista) {
  const m = new Map()
  for (const x of lista) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

function correlacion(xs, ys) {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
}

function recorrido(via) {
  const grafo = new Map()
  for (const t of via.tramos) {
    const a = clave(t.linea[0])
    const b = clave(t.linea.at(-1))
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!grafo.has(x)) grafo.set(x, [])
      grafo.get(x).push({ tramo: t, otro: y })
    }
  }

  // Trozos sueltos de la calle; se estudia el más largo
  const visto = new Set()
  const partes = []
  for (const inicio of grafo.keys()) {
    if (visto.has(inicio)) continue
    const parte = []
    const pila = [inicio]
    visto.add(inicio)
    while (pila.length) {
      const n = pila.pop()
      parte.push(n)
      for (const { otro } of grafo.get(n)) if (!visto.has(otro)) visto.add(otro), pila.push(otro)
    }
    partes.push(parte)
  }
  const largo = (parte) => parte.reduce((s, n) => s + grafo.get(n).reduce((x, e) => x + e.tramo.longitud, 0), 0)
  const principal = partes.reduce((a, b) => (largo(b) > largo(a) ? b : a))

  // Camino más largo dentro del trozo principal (de un extremo al otro)
  function caminos(origen) {
    const dist = new Map([[origen, 0]])
    const previo = new Map()
    const abiertos = new Set([origen])
    while (abiertos.size) {
      let n = null
      for (const x of abiertos) if (n === null || dist.get(x) < dist.get(n)) n = x
      abiertos.delete(n)
      for (const { tramo, otro } of grafo.get(n)) {
        const d = dist.get(n) + tramo.longitud
        if (!dist.has(otro) || d < dist.get(otro)) {
          dist.set(otro, d)
          previo.set(otro, { desde: n, tramo })
          abiertos.add(otro)
        }
      }
    }
    return { dist, previo }
  }
  const lejano = (dist) => [...dist].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  const extremo = principal.find((n) => grafo.get(n).length === 1) ?? principal[0]
  const a = lejano(caminos(extremo).dist)
  const { dist, previo } = caminos(a)
  const b = lejano(dist)
  let nodos = [b]
  let pasos = []
  for (let n = b; previo.has(n); n = previo.get(n).desde) {
    pasos.unshift({ tramo: previo.get(n).tramo, desde: previo.get(n).desde, hasta: n })
    nodos.unshift(previo.get(n).desde)
  }
  if (!pasos.length) {
    // Calle de un solo tramo cerrado sobre sí mismo (una plaza o una rotonda)
    const t = grafo.get(a)[0].tramo
    pasos = [{ tramo: t, desde: a, hasta: a }]
    nodos = [a, a]
  }

  // Línea de la calle en orden y posición de cada nodo a lo largo de ella
  const construir = () => {
    const linea = []
    const posicion = new Map()
    let s = 0
    posicion.set(nodos[0], 0)
    for (const paso of pasos) {
      const puntos = clave(paso.tramo.linea[0]) === paso.desde ? paso.tramo.linea : [...paso.tramo.linea].reverse()
      paso.aFavor = puntos === paso.tramo.linea
      linea.push(...(linea.length ? puntos.slice(1) : puntos))
      s += paso.tramo.longitud
      if (!posicion.has(paso.hasta)) posicion.set(paso.hasta, s)
    }
    return { linea, posicion, total: s }
  }
  let { linea, posicion, total } = construir()

  // Sentido de la numeración: la calle empieza donde están los números más bajos
  const numerados = via.portales.filter((p) => Number.isFinite(p.numero))
  const enLinea = (punto) => {
    let mejor = 0
    let md = Infinity
    let s = 0
    for (let i = 0; i < linea.length; i++) {
      if (i) s += distancia(linea[i - 1], linea[i])
      const d = distancia(linea[i], punto)
      if (d < md) (md = d), (mejor = s)
    }
    return mejor
  }
  const invertir =
    numerados.length >= 2
      ? correlacion(numerados.map((p) => enLinea(p.punto)), numerados.map((p) => p.numero)) < 0
      : distancia(linea.at(-1), AYUNTAMIENTO) < distancia(linea[0], AYUNTAMIENTO)
  if (invertir) {
    nodos.reverse()
    pasos = pasos.reverse().map((p) => ({ tramo: p.tramo, desde: p.hasta, hasta: p.desde }))
    ;({ linea, posicion, total } = construir())
  }

  // Cruces en orden: los nodos fuera del camino se sitúan junto al nodo del camino más cercano
  const puntoDe = (k) => k.split(',').map(Number)
  const ordenados = principal
    .map((k) => {
      if (posicion.has(k)) return [k, posicion.get(k)]
      const cercano = nodos.reduce((x, y) => (distancia(puntoDe(y), puntoDe(k)) < distancia(puntoDe(x), puntoDe(k)) ? y : x))
      return [k, posicion.get(cercano) + 0.001]
    })
    .sort((x, y) => x[1] - y[1])
  const primero = nodos[0]
  const ultimo = nodos.at(-1)
  const inicio = callesEnNodo(primero, via)
  const fin = primero === ultimo ? [] : callesEnNodo(ultimo, via)

  const segmentosCamino = []
  for (let i = 1, s = 0; i < linea.length; i++) {
    segmentosCamino.push({ a: linea[i - 1], b: linea[i], s })
    s += distancia(linea[i - 1], linea[i])
  }
  const segmentoMasCercano = (punto) =>
    segmentosCamino.reduce((x, y) => (distanciaASegmento(punto, y.a, y.b) < distanciaASegmento(punto, x.a, x.b) ? y : x))

  // Lado por el que sale cada calle que cruza, yendo del inicio al fin: "i" izquierda, "d" derecha,
  // "a" a los dos lados (la atraviesa), "" si no se puede saber
  function ladoEnNodo(k, nombre) {
    const punto = puntoDe(k)
    const { a, b } = segmentoMasCercano(punto)
    const lados = new Set()
    for (const t of tramosEnNodo.get(k)) {
      if (vias.get(t.via)?.nombre !== nombre || t.via === via.id) continue
      const vecino = clave(t.linea[0]) === k ? t.linea[1] : t.linea.at(-2)
      const giro = (b[0] - a[0]) * (vecino[1] - a[1]) - (b[1] - a[1]) * (vecino[0] - a[0])
      if (Math.abs(giro) > 1e-12) lados.add(giro > 0 ? 'i' : 'd')
    }
    return lados.size === 2 ? 'a' : ([...lados][0] ?? '')
  }
  const crucesConLado = []
  for (const [k] of ordenados) {
    if (k === primero || k === ultimo) continue
    for (const nombre of callesEnNodo(k, via)) {
      if (inicio.includes(nombre) || fin.includes(nombre)) continue
      const yaEsta = crucesConLado.find((c) => c.nombre === nombre)
      const lado = ladoEnNodo(k, nombre)
      if (!yaEsta) crucesConLado.push({ nombre, lado })
      else if (lado && yaEsta.lado !== lado) yaEsta.lado = yaEsta.lado ? 'a' : lado
    }
  }

  // Sentido de la calle, mirando de su inicio a su fin. Se mira a trozos de 25 m: si en un trozo se
  // circula en los dos sentidos (calzadas separadas, cada una de sentido único), ese trozo es de doble sentido.
  const TROZO = 25
  const trozos = Array.from({ length: Math.max(1, Math.ceil(total / TROZO)) }, () => new Set())
  for (const t of via.tramos) {
    const puntos = t.sentido === 'inverso' ? [...t.linea].reverse() : t.linea
    for (let i = 1; i < puntos.length; i++) {
      const [a, b] = [puntos[i - 1], puntos[i]]
      if (distancia(a, b) < 0.1) continue // punto repetido: no tiene dirección
      const muestras = Math.max(1, Math.round(distancia(a, b) / 10)) // un punto cada 10 m
      for (let m = 0; m < muestras; m++) {
        const f = (m + 0.5) / muestras
        const punto = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
        let cerca = null
        for (const sc of segmentosCamino) {
          const d = distanciaASegmento(punto, sc.a, sc.b)
          if (!cerca || d < cerca.d) cerca = { d, sc }
        }
        if (!cerca || cerca.d > 40) continue // parte de la calle lejos del recorrido principal
        const unico = t.sentido === 'directo' || t.sentido === 'inverso'
        const valor = unico
          ? cosenoEntre([a, b], [cerca.sc.a, cerca.sc.b]) > 0
            ? 'hacia el final'
            : 'hacia el inicio'
          : t.sentido
        const posicionEnCamino = cerca.sc.s + distancia(cerca.sc.a, punto)
        trozos[Math.min(trozos.length - 1, Math.floor(posicionEnCamino / TROZO))].add(valor)
      }
    }
  }
  const valorDeTrozo = (v) =>
    v.has('doble') || (v.has('hacia el final') && v.has('hacia el inicio'))
      ? 'doble'
      : v.has('hacia el final')
        ? 'hacia el final'
        : v.has('hacia el inicio')
          ? 'hacia el inicio'
          : v.has('peatonal')
            ? 'peatonal'
            : 'desconocido'
  const conDato = trozos.filter((v) => v.size).map(valorDeTrozo)
  const [masComun, veces] = contarValores(conDato)[0] ?? ['desconocido', 0]
  const sentido = conDato.length && veces >= 0.85 * conDato.length ? masComun : 'mixto'
  // Qué parte de la calle (en %) es de doble sentido, de sentido único hacia el final o hacia el inicio y peatonal:
  // para «¿es de doble sentido en toda su longitud, de sentido único o de los dos de forma alternativa?»
  const parte = (valor) => (conDato.length ? Math.round((conDato.filter((v) => v === valor).length / conDato.length) * 100) : 0)
  const reparto = ['doble', 'hacia el final', 'hacia el inicio', 'peatonal'].map(parte)

  return {
    partes: partes.length,
    inicio,
    fin,
    cruces: crucesConLado.map((c) => c.nombre),
    lados: crucesConLado.map((c) => c.lado),
    sentido,
    reparto,
    longitudPrincipal: total,
  }
}

// Importancia de cada tramo según el tipo de vía en OpenStreetMap (1 = vía principal ... 6 = peatonal o
// sin clasificar). Si un tramo no tiene pareja en OSM, toma la de su calle.
const IMPORTANCIA = {
  trunk: 1, primary: 1, primary_link: 1, secondary: 2, secondary_link: 2, tertiary: 3, tertiary_link: 3,
  unclassified: 4, residential: 4, living_street: 5, service: 5, road: 5,
}
const importanciaDeVia = new Map()
for (const via of vias.values()) {
  importanciaDeVia.set(via.id, Math.min(6, ...via.tramos.map((t) => IMPORTANCIA[t.clase] ?? 6)))
}
const importanciaDeTramo = (t) => IMPORTANCIA[t.clase] ?? (t.clase ? 6 : importanciaDeVia.get(t.via) ?? 6)
const longitudDeVia = (via) => via.tramos.reduce((s, t) => s + t.longitud, 0)
// Importancia de una calle: la de la mayor parte de su longitud
function importanciaDeCalle(via) {
  const metros = new Map()
  for (const t of via.tramos) metros.set(importanciaDeTramo(t), (metros.get(importanciaDeTramo(t)) ?? 0) + t.longitud)
  return [...metros].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
}

const simple = (sentido) => (sentido === 'directo' || sentido === 'inverso' ? 'unico' : sentido)

const calles = []
for (const via of vias.values()) {
  if (via.sinNombre || !via.tramos.length) continue
  const r = recorrido(via)
  const porDistrito = new Map()
  const porBarrio = new Map()
  for (const t of via.tramos) {
    const zona = zonaDe(medio(...segmentoCentral(t.linea)))
    if (zona.distrito) porDistrito.set(zona.distrito, (porDistrito.get(zona.distrito) ?? 0) + t.longitud)
    if (zona.barrio) porBarrio.set(zona.barrio, (porBarrio.get(zona.barrio) ?? 0) + t.longitud)
  }
  const ordenar = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([n]) => n)
  const numeros = via.portales.map((p) => p.numero).filter(Number.isFinite)
  calles.push({
    id: via.id,
    nombre: via.nombre,
    ...(via.nombreOficial !== via.nombre && { nombreOficial: via.nombreOficial }),
    tipo: via.tipo,
    importancia: importanciaDeCalle(via),
    distritos: ordenar(porDistrito),
    barrios: ordenar(porBarrio),
    longitud: Math.round(longitudDeVia(via)),
    inicio: r.inicio,
    fin: r.fin,
    cruces: r.cruces,
    lados: r.lados,
    sentido: r.sentido,
    // [% doble, % único hacia el final, % único hacia el inicio, % peatonal]
    reparto: r.reparto,
    numeros: numeros.length ? [Math.min(...numeros), Math.max(...numeros)] : null,
    codigosPostales: unicos(via.portales.map((p) => p.cp).filter(Boolean)).sort(),
    partes: r.partes,
    tramosDudosos: via.tramos.filter((t) => t.dudoso).length,
    // Qué dice cada fuente en los tramos que faltan por revisar ("unico", "doble" o "peatonal")
    ...(via.tramos.some((t) => t.dudoso) && {
      dudas: contarValores(via.tramos.filter((t) => t.dudoso).map((t) => `${simple(t.cdau)}|${simple(t.osm)}`)).map(
        ([par, tramos]) => {
          const [oficial, osm] = par.split('|')
          return { oficial, osm, tramos }
        },
      ),
    }),
  })
}
calles.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

// Parque de bomberos de cada calle (scripts/lib/parques-limite.mjs, del PDF de la persona): al norte de la línea,
// el Parque Norte; al sur, el Sur. Las calles de la propia línea son «límite» y las que la cruzan, «los dos».
const lineaParques = lineaEntreParques((id) => {
  const via = vias.get(id)
  return via ? [...via.tramos, ...via.tramosPlaza].map((t) => t.linea) : []
})
const ladoParques = ladoDeParques(lineaParques)
const callesDelLimite = new Set(CALLES_LIMITE.map(([id]) => id))
for (const c of calles) {
  if (callesDelLimite.has(c.id)) {
    c.parque = 'límite'
    continue
  }
  const metros = { Norte: 0, Sur: 0 }
  let aproximados = 0
  for (const t of vias.get(c.id).tramos) {
    const p = medio(...segmentoCentral(t.linea))
    metros[ladoParques.parque(p)] += t.longitud
    if (ladoParques.aproximado(p)) aproximados += t.longitud
  }
  const total = metros.Norte + metros.Sur || 1
  c.parque = metros.Norte / total >= 0.9 ? 'Norte' : metros.Sur / total >= 0.9 ? 'Sur' : 'los dos'
  if (aproximados > total / 2) c.parqueAproximado = true
}
await guardar(
  'parques.json',
  coleccion([
    { type: 'Feature', properties: { tipo: 'limite' }, geometry: { type: 'LineString', coordinates: redondear(lineaParques.linea) } },
    // Prolongación de la línea más allá de sus puntas (aproximada: el PDF no la dice)
    {
      type: 'Feature',
      properties: { tipo: 'prolongacion' },
      geometry: {
        type: 'MultiLineString',
        coordinates: [redondear([ladoParques.oeste, lineaParques.linea[0]]), redondear([lineaParques.linea.at(-1), ladoParques.este])],
      },
    },
  ]),
)

await guardar(
  'tramos.json',
  coleccion(
    tramos.filter((t) => !t.plaza).map((t) => {
      // La línea se guarda en el sentido de la circulación: "unico" se recorre del primer punto al último
      const unico = t.sentido === 'directo' || t.sentido === 'inverso'
      const linea = t.sentido === 'inverso' ? [...t.linea].reverse() : t.linea
      return {
        type: 'Feature',
        properties: {
          id: t.id,
          via: t.via,
          nombre: nombreVia(t.via),
          // Vías sin nombre en el callejero oficial a las que OpenStreetMap sí pone nombre
          ...(!nombreVia(t.via) && t.nombreOsm && !/[ÃÂ]/.test(t.nombreOsm) && { nombreOsm: t.nombreOsm }),
          importancia: importanciaDeTramo(t),
          sentido: unico ? 'unico' : t.sentido,
          fuente: t.revisado ? 'revision' : t.cdau ? 'cdau' : t.osm ? 'osm' : null,
          ...(t.dudoso && { dudoso: true }),
        },
        geometry: { type: 'LineString', coordinates: redondear(simplificar(linea, 1)) },
      }
    }),
  ),
)

// Red de calles para calcular trayectos (paso 3.1): sentidos, cruces y giros prohibidos
for (const t of tramos) t.importancia = importanciaDeTramo(t)
const { red, informe: informeRed } = crearRed({
  tramos,
  viasOsm: callesOsm.elements.filter((e) => e.type === 'way'),
  restricciones: restriccionesOsm.elements,
  nombreDe: (via) => nombreVia(via) ?? null,
  importanciaDeClase: (clase) => IMPORTANCIA[clase] ?? 6,
})
await guardar('red.json', red)

// «¿Cómo me incorporo a la calle A desde la calle B?»: hacia qué lado se gira al llegar al final de B (examen de 2022)
const giros = incorporaciones(red, calles)
for (const c of calles) if (giros.has(c.id)) c.incorporaciones = giros.get(c.id)

// Calles sin salida para vehículos (examen de 2025): en la red de los trayectos (solo lo que es para coches), un
// extremo de la calle al que no llega ningún otro tramo. Para no dar por cerrada una calle que solo está mal dibujada,
// ese extremo no puede tener otro tramo a menos de 15 m; y solo se pregunta por calles pequeñas sin tramos dudosos.
// "salida": 'sin' (sin salida) o 'con' (se entra y se sale por los dos lados).
{
  const grado = new Map()
  const tramosDeCalle = new Map()
  for (const t of red.tramos) {
    const [, nombre, a, b, , , , marcas] = t
    grado.set(a, (grado.get(a) ?? 0) + 1)
    grado.set(b, (grado.get(b) ?? 0) + 1)
    if (!nombre) continue
    if (!tramosDeCalle.has(nombre)) tramosDeCalle.set(nombre, [])
    tramosDeCalle.get(nombre).push(t)
  }
  const indiceRed = crearIndice(40)
  for (const t of red.tramos) {
    const plano = t[8]
    for (let i = 2; i < plano.length; i += 2) indiceRed.anadir([plano[i - 2], plano[i - 1]], [plano[i], plano[i + 1]], t)
  }
  const otroCerca = (nodo, propios) => {
    const p = red.nodos[nodo]
    for (const c of indiceRed.cercanos(p)) if (!propios.has(c.dato) && distanciaASegmento(p, c.a, c.b) < 15) return true
    return false
  }
  for (const c of calles) {
    const suyos = tramosDeCalle.get(c.nombre)
    if (!suyos || c.tramosDudosos || c.sentido === 'peatonal' || suyos.some((t) => t[7] & 1) || c.importancia < 4 || c.longitud > 600) continue
    // Calles con el mismo nombre en dos sitios: no se sabe de cuál se habla
    if (calles.filter((x) => x.nombre === c.nombre).length > 1) continue
    const propios = new Set(suyos)
    const veces = new Map()
    for (const t of suyos) for (const n of [t[2], t[3]]) veces.set(n, (veces.get(n) ?? 0) + 1)
    const puntas = [...veces].filter(([, v]) => v === 1).map(([n]) => n)
    if (puntas.length !== 2) continue // una calle en varios trozos o en anillo: mejor no preguntar
    const cerradas = puntas.filter((n) => grado.get(n) === 1)
    if (cerradas.some((n) => otroCerca(n, propios))) continue
    if (cerradas.length) c.salida = 'sin'
    // «Con salida» solo si se ve claro: calle de 120 m o más con un cruce de verdad (tres tramos o más) en cada punta.
    // El examen de 2025 da la Calle Vadillo (82 m) como sin salida y en el callejero tiene salida por los dos lados.
    else if (c.longitud >= 120 && puntas.every((n) => grado.get(n) >= 3)) c.salida = 'con'
  }
}
await guardar('calles.json', calles)

// Tramos dudosos para el mapa de revisión, de las calles principales a las secundarias.
// "directo" e "inverso" se refieren al sentido en que está dibujada la línea (del primer punto al último).
const dudosos = tramos
  .filter((t) => t.dudoso)
  .map((t) => {
    const via = vias.get(t.via)
    return {
      id: t.id,
      via: t.via,
      calle: via.sinNombre ? 'Vía sin nombre' : via.nombre,
      importancia: importanciaDeVia.get(t.via),
      longitudCalle: Math.round(longitudDeVia(via)),
      orden: via.tramos.indexOf(t),
      oficial: t.cdau,
      osm: t.osm,
      callesAlInicio: callesEnNodo(clave(t.linea[0]), via),
      callesAlFinal: callesEnNodo(clave(t.linea.at(-1)), via),
      longitud: Math.round(t.longitud),
      linea: redondear(t.linea, 6),
    }
  })
  .sort(
    (a, b) =>
      a.importancia - b.importancia || b.longitudCalle - a.longitudCalle || a.via - b.via || a.orden - b.orden,
  )
await writeFile(join(RAIZ, 'datos', 'dudosos.json'), JSON.stringify(dudosos))

// 5. Lugares de interés (OpenStreetMap) con su dirección
const viasPorClave = new Map()
for (const via of vias.values()) {
  if (via.sinNombre) continue
  for (const k of unicos([...clavesNombre(via.nombre), ...clavesNombre(via.nombreOficial)])) {
    if (!viasPorClave.has(k)) viasPorClave.set(k, [])
    viasPorClave.get(k).push(via)
  }
}
const indicePortales = crearIndice(60)
for (const via of vias.values()) for (const p of via.portales) indicePortales.anadir(p.punto, p.punto, { via, portal: p })

function viaMasCercana(candidatas, punto) {
  let mejor = null
  for (const via of candidatas) {
    for (const t of via.tramos) {
      for (let i = 1; i < t.linea.length; i++) {
        const d = distanciaASegmento(punto, t.linea[i - 1], t.linea[i])
        if (d < 1000 && (!mejor || d < mejor.d)) mejor = { d, via }
      }
    }
  }
  return mejor?.via ?? null
}

function direccion(tags, punto) {
  if (tags['addr:street']) {
    const candidatas = unicos(clavesNombre(tags['addr:street']).flatMap((k) => viasPorClave.get(k) ?? []))
    const via = viaMasCercana(candidatas, punto)
    if (via) return { via, numero: tags['addr:housenumber'] ?? null, fuente: 'osm' }
  }
  let portal = null
  for (const c of indicePortales.cercanos(punto)) {
    const d = distancia(c.a, punto)
    if (d < 60 && (!portal || d < portal.d)) portal = { d, ...c.dato }
  }
  if (portal) return { via: portal.via, numero: portal.portal.etiqueta, fuente: 'portal' }
  let calle = null
  for (const c of indiceCalles.cercanos(punto)) {
    const d = distanciaASegmento(punto, c.a, c.b)
    if (d < 60 && (!calle || d < calle.d)) calle = { d, via: c.dato }
  }
  return calle ? { via: calle.via, numero: null, fuente: 'cercania' } : null
}

const lugares = []
const vistos = []
for (const e of edificiosOsm.elements) {
  const punto = e.type === 'node' ? [e.lon, e.lat] : e.center ? [e.center.lon, e.center.lat] : null
  if (!punto) continue
  const zona = zonaDe(punto)
  if (!zona.distrito) continue
  const cat = categoria(e.tags)
  const n = normalizar(e.tags.name)
  // Un mismo sitio a veces está dos veces (por ejemplo, los dos andenes de una parada de metro)
  if (vistos.some((v) => v.n === n && v.cat === cat && distancia(v.punto, punto) < 150)) continue
  vistos.push({ n, cat, punto })
  const dir = direccion(e.tags, punto)
  lugares.push({
    id: `${e.type[0]}${e.id}`,
    nombre: e.tags.name,
    categoria: cat,
    punto: redondear([punto])[0],
    direccion: dir ? [dir.via.nombre, dir.numero].filter(Boolean).join(', ') : null,
    via: dir?.via.id ?? null,
    direccionSegun: dir?.fuente ?? null,
    ...zona,
  })
}
// Las plazas: un punto por calle con tramos revisados como "plaza", en medio de esos tramos (pesando su largo)
const tramosDePlaza = new Map()
for (const t of tramos.filter((x) => x.plaza && x.via !== null)) {
  if (!tramosDePlaza.has(t.via)) tramosDePlaza.set(t.via, [])
  tramosDePlaza.get(t.via).push(t)
}
for (const [via, suyos] of tramosDePlaza) {
  const total = suyos.reduce((s, t) => s + t.longitud, 0) || 1
  const punto = [0, 1].map((eje) => suyos.reduce((s, t) => s + medio(t.linea[0], t.linea.at(-1))[eje] * t.longitud, 0) / total)
  lugares.push({
    id: `plaza${via}`,
    nombre: vias.get(via).nombre,
    categoria: 'Plazas',
    punto: redondear([punto])[0],
    direccion: null,
    via,
    direccionSegun: null,
    ...zonaDe(punto),
  })
}
// Calle por su nombre: primero la que se llama exactamente así; si hay varias, la más cercana a "cerca"
function viaPorNombre(nombre, cerca = null) {
  const claves = clavesNombre(nombre)
  const exactas = (viasPorClave.get(claves[0]) ?? []).filter((v) => v.tramos.length)
  const candidatas = exactas.length ? exactas : unicos(claves.flatMap((k) => viasPorClave.get(k) ?? [])).filter((v) => v.tramos.length)
  if (candidatas.length > 1 && cerca) return viaMasCercana(candidatas, cerca) ?? candidatas[0]
  return candidatas[0] ?? null
}
const centroDeVia = (via) => {
  const t = via.tramos.reduce((a, b) => (b.longitud > a.longitud ? b : a))
  return medio(...segmentoCentral(t.linea))
}

// Edificios singulares (scripts/lib/edificios-singulares.mjs, del PDF de la persona). Su calle es la del PDF. Si ya
// están en OpenStreetMap (mismo nombre, a menos de 500 m de su calle) se usa ese lugar, con el nombre y la
// dirección del PDF; si no, se añaden en el portal con ese número o en medio de la calle.
const informeSingulares = []
for (const e of EDIFICIOS_SINGULARES) {
  const via = viaPorNombre(e.calle)
  const claves = new Set([e.nombre, ...(e.otros ?? [])].flatMap((n) => clavesNombre(n).slice(0, 1)))
  const deOsm = lugares
    .filter((l) => !l.singular && clavesNombre(l.nombre).some((k) => claves.has(k)))
    .filter((l) => !via || via.tramos.some((t) => t.linea.some((p, i) => i && distanciaASegmento(l.punto, t.linea[i - 1], p) < 500)))
  const lugar = deOsm[0] ?? null
  let punto = lugar?.punto ?? null
  let segun = lugar ? 'osm' : null
  if (!punto && via) {
    const portal = e.numero && via.portales.find((p) => String(p.etiqueta) === e.numero || String(p.numero) === e.numero)
    punto = portal ? portal.punto : centroDeVia(via)
    segun = portal ? 'portal' : 'calle'
  }
  const direccion = via ? [via.nombre, e.numero].filter(Boolean).join(', ') : e.calle
  const datos = {
    nombre: e.nombre,
    categoria: 'Edificios singulares',
    direccion,
    via: via?.id ?? null,
    direccionSegun: 'material',
    singular: true,
    ...(e.notaCalle && { notaCalle: e.notaCalle }),
  }
  if (lugar) {
    Object.assign(lugar, { ...datos, nombreOsm: lugar.nombre !== e.nombre ? lugar.nombre : undefined, direccionOsm: lugar.direccion ?? undefined })
  } else if (punto) {
    lugares.push({ id: `singular${normalizar(e.nombre).replaceAll(' ', '-')}`, ...datos, punto: redondear([punto])[0], ...zonaDe(punto) })
  }
  informeSingulares.push({ ...e, via: via?.nombre ?? null, situado: lugar ? `OpenStreetMap: ${lugar.nombreOsm ?? lugar.nombre}` : segun === 'portal' ? 'portal del CDAU' : segun === 'calle' ? 'centro de la calle (aproximado)' : 'sin situar' })
}

// Parque de bomberos de cada lugar de la ciudad (los que están justo en la línea, a menos de 25 m, son «límite»)
for (const l of lugares) {
  l.parque = ladoParques.metrosALinea(l.punto) < 25 ? 'límite' : ladoParques.parque(l.punto)
  if (ladoParques.aproximado(l.punto)) l.parqueAproximado = true
}
lugares.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
await guardar('lugares.json', lugares)

// Edificios de gran altura (Catastro): los de PLANTAS_GRAN_ALTURA plantas sobre rasante o más (contando la baja), con
// su dirección del Catastro (si da a varias calles, la de la calle más importante) y el nombre que le pone
// OpenStreetMap si lo tiene. Cada edificio tiene partes de distinta altura: cuenta la más alta.
const PLANTAS_GRAN_ALTURA = 12
const carpetaCatastro = join(CRUDOS, 'catastro')
const partesDeEdificios = await partesAltas(join(carpetaCatastro, 'A.ES.SDGC.BU.18900.buildingpart.gml'), PLANTAS_GRAN_ALTURA)
const direccionesDeCatastro = await direccionesCatastro(join(carpetaCatastro, 'A.ES.SDGC.AD.18900.gml'))
const nombresDeEdificios = await leer('osm-nombresEdificios.json').catch(() => ({ elements: [] }))
const edificiosConNombre = nombresDeEdificios.elements
  .filter((e) => e.center && e.tags?.name)
  .map((e) => ({ nombre: e.tags.name, punto: [e.center.lon, e.center.lat] }))
const porRefcat = new Map()
for (const p of partesDeEdificios) {
  const e = porRefcat.get(p.refcat) ?? { refcat: p.refcat, plantas: 0, anillo: null }
  if (p.plantas > e.plantas) Object.assign(e, { plantas: p.plantas, anillo: p.anillo })
  porRefcat.set(p.refcat, e)
}
// "CL PEDRO ANTONIO DE ALARCON" → la calle del callejero, cerca del edificio
const viaDeCatastro = (texto, cerca) => {
  const [tipo, ...resto] = texto.trim().split(/\s+/)
  return viaPorNombre(`${TIPOS_CATASTRO[tipo] ?? tipo} ${resto.join(' ')}`, cerca) ?? viaPorNombre(resto.join(' '), cerca)
}
const altos = []
for (const e of porRefcat.values()) {
  const anillo = e.anillo.map(utmALonLat)
  const punto = [0, 1].map((i) => anillo.reduce((s, p) => s + p[i], 0) / anillo.length)
  const zona = zonaDe(punto)
  if (!zona.distrito) continue
  const metrosA = (via) => Math.min(...via.tramos.flatMap((t) => t.linea.slice(1).map((p, i) => distanciaASegmento(punto, t.linea[i], p))))
  const todas = (direccionesDeCatastro.get(e.refcat) ?? [])
    .filter((d) => d.via)
    .map((d) => {
      const via = viaDeCatastro(d.via, punto)
      return via && { via, numero: /^\d/.test(d.numero) ? d.numero : 's/n', metros: metrosA(via) }
    })
    .filter(Boolean)
  // Las calles a las que da (a menos de 200 m); si no hay ninguna, la más cercana de su dirección (los recintos
  // grandes, como el hospital del Parque Tecnológico, están lejos de su calle)
  const opciones = todas.filter((d) => d.metros < 200)
  if (!opciones.length && todas.length) opciones.push(todas.reduce((a, b) => (b.metros < a.metros ? b : a)))
  opciones.sort((a, b) => (importanciaDeVia.get(a.via.id) ?? 6) - (importanciaDeVia.get(b.via.id) ?? 6) || (a.numero === 's/n') - (b.numero === 's/n'))
  const dir = opciones[0] ?? (() => {
    const d = direccion({}, punto)
    return d && { via: d.via, numero: d.numero }
  })()
  const conNombre = edificiosConNombre.find((x) => puntoEnAnillo(x.punto, anillo) || distancia(x.punto, punto) < 25)
  altos.push({
    id: `alto${e.refcat}`,
    refcat: e.refcat,
    plantas: e.plantas,
    ...(conNombre && { nombre: conNombre.nombre }),
    direccion: dir ? [dir.via.nombre, dir.numero].filter(Boolean).join(', ') : null,
    via: dir?.via.id ?? null,
    punto: redondear([punto])[0],
    ...zona,
    parque: ladoParques.parque(punto),
    ...(ladoParques.aproximado(punto) && { parqueAproximado: true }),
  })
}
altos.sort((a, b) => b.plantas - a.plantas || (a.direccion ?? '').localeCompare(b.direccion ?? '', 'es'))
await guardar('altos.json', altos)

// 6. Zona de los parques de bomberos de Granada (paso 2.5): sus 53 municipios, las carreteras con código
// que pasan por ella, las salidas de autovía y cómo se llega a cada pueblo desde Granada (OpenStreetMap).
// Qué municipios entran está en scripts/lib/zona-parques.mjs; los cálculos, en scripts/lib/zona-datos.mjs.
const { municipios, faltan: municipiosQueFaltan } = municipiosDeLaZona(municipiosOsm.elements)
const enLaZona = (p) => municipios.some((m) => m.zona.contiene(p))
// Red de cada carretera: autovía, nacional (N-), autonómica (A-) o provincial (GR-)
const redDe = (codigo, tipo) =>
  tipo === 'motorway' ? 'autovia' : codigo.startsWith('N-') ? 'nacional' : codigo.startsWith('GR-') ? 'provincial' : 'autonomica'
const carreteras = carreterasOsm.elements
  .filter((w) => w.type === 'way' && w.tags.ref && !w.tags.highway.endsWith('_link'))
  .filter((w) => w.geometry.some((p, i) => i % 3 === 0 && enLaZona([p.lon, p.lat])))
  .map((w) => {
    const codigo = codigos(w.tags).join(' / ')
    return {
      type: 'Feature',
      properties: { codigo, nombre: w.tags.name ?? null, tipo: w.tags.highway, red: redDe(codigo, w.tags.highway) },
      geometry: { type: 'LineString', coordinates: redondear(simplificar(w.geometry.map((p) => [p.lon, p.lat]), 8)) },
    }
  })
// Tipo de red de cada carretera (Red de Carreteras del Estado, Red Básica Estructurante... Provincial): el de las
// rutas de OpenStreetMap, que siguen el catálogo de la Junta de Andalucía y de la Diputación
const NOMBRE_RED = {
  'Red de Carreteras del Estado': 'Red de Carreteras del Estado',
  'ES:A-road': 'Red de Carreteras del Estado',
  'Red Básica Estructurante': 'Red Básica Estructurante',
  'Red Básica de Articulación': 'Red Básica de Articulación',
  'Red Intercomarcal': 'Red Intercomarcal',
  'Red Complementaria Metropolitana de Granada': 'Red Complementaria Metropolitana',
  'Red Complementaria de Granada': 'Red Complementaria',
  'Red Provincial de Granada': 'Red Provincial',
}
const tipoDeRed = new Map()
for (const r of rutasOsm.elements) {
  const tipo = NOMBRE_RED[r.tags?.network]
  if (tipo && r.tags.ref && (!tipoDeRed.has(r.tags.ref) || tipo === 'Red de Carreteras del Estado')) tipoDeRed.set(r.tags.ref, tipo)
}
// Sin ruta en OpenStreetMap: las GR- de cuatro cifras son de la Diputación
const redDeCarretera = (codigo) => tipoDeRed.get(codigo) ?? (/^GR-\d{4}$/.test(codigo) ? 'Red Provincial' : null)
for (const f of carreteras) {
  const tipo = f.properties.codigo.split(' / ').map(redDeCarretera).find(Boolean)
  if (tipo) f.properties.tipoRed = tipo
}
await guardar('carreteras.json', coleccion(carreteras))
// Hacia dónde queda cada carretera desde el centro de Granada (examen de 2025: «¿cuál de estas carreteras se sitúa al
// noroeste de la ciudad?»): el rumbo de sus puntos a más de 2 km del Ayuntamiento; solo si al menos el 85 % caen en el
// mismo de los ocho rumbos. { "GR-3407": "noroeste", ... }
const RUMBOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
const rumbos = {}
{
  const puntosDe = new Map()
  for (const f of carreteras) for (const c of f.properties.codigo.split(' / ')) {
    if (!puntosDe.has(c)) puntosDe.set(c, [])
    puntosDe.get(c).push(...f.geometry.coordinates)
  }
  for (const [codigo, puntos] of puntosDe) {
    if (!/^(A|N|GR)-\d+G?$/.test(codigo)) continue
    const lejos = puntos.filter((p) => distancia(p, AYUNTAMIENTO) > 2000)
    if (lejos.length < 5) continue
    const sector = (p) => {
      const [x, y] = aMetros([p[0] - AYUNTAMIENTO[0], p[1] - AYUNTAMIENTO[1]])
      const grados = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
      return RUMBOS[Math.round(grados / 45) % 8]
    }
    const [masComun, veces] = contarValores(lejos.map(sector))[0]
    if (veces >= 0.85 * lejos.length) rumbos[codigo] = masComun
  }
}
await guardar('rumbos.json', rumbos)

// Lo mismo en un archivo pequeño para las preguntas ({ "A-92": "Red Básica Estructurante", ... }), solo con los
// códigos de verdad (sin ramales como A-395R1 ni travesías antiguas como N-323A)
await guardar(
  'redes.json',
  Object.fromEntries(
    unicos(carreteras.flatMap((f) => f.properties.codigo.split(' / ')))
      .filter((c) => /^(A|N|GR)-\d+G?$/.test(c) && redDeCarretera(c))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      .map((c) => [c, redDeCarretera(c)]),
  ),
)

// Carreteras que pasan por cada municipio: primero las autovías, luego nacionales, autonómicas y provinciales.
// El tipo de cada código es el de la mayoría de sus tramos (la GR-3418 comparte unos metros con la N-432).
const ORDEN_RED = ['autovia', 'nacional', 'autonomica', 'provincial']
const redesDe = new Map()
for (const f of carreteras) {
  for (const c of f.properties.codigo.split(' / ')) {
    if (!redesDe.has(c)) redesDe.set(c, [])
    redesDe.get(c).push(f.properties.red)
  }
}
const redDeCodigo = (c) => contarValores(redesDe.get(c))[0][0]
const carreterasDe = new Map(municipios.map((m) => [m.nombre, new Set()]))
for (const f of carreteras) {
  f.geometry.coordinates.forEach((p, i) => {
    if (i % 2) return
    const m = municipios.find((x) => x.zona.contiene(p))
    for (const c of m ? f.properties.codigo.split(' / ') : []) carreterasDe.get(m.nombre).add(c)
  })
}
const listaCarreteras = (nombre) =>
  [...carreterasDe.get(nombre)].sort(
    (a, b) => ORDEN_RED.indexOf(redDeCodigo(a)) - ORDEN_RED.indexOf(redDeCodigo(b)) || a.localeCompare(b, 'es', { numeric: true }),
  )

const salidas = salidasDeLaZona(carreterasOsm.elements, municipios)
const accesos = accesosDesdeGranada(carreterasOsm.elements, municipios, salidas)
// Qué parque de bomberos atiende cada pueblo (lista confirmada por la persona, PARQUE_DE_MUNICIPIO) y los minutos desde
// cada parque (tiemposDesdeParques). Una salida de autovía es del parque de su pueblo; en el término de Granada, del
// lado de la línea entre parques en que cae y, si eso es aproximado, del que llega antes.
const puertasParques = [
  { nombre: 'Norte', punto: lugares.find((l) => l.id === 'w124393197').punto },
  { nombre: 'Sur', punto: lugares.find((l) => l.id === 'w51730864').punto },
]
const tiemposParques = tiemposDesdeParques(carreterasOsm.elements, municipios, salidas, puertasParques)
const masRapido = (minutos) => (minutos?.Norte != null && minutos?.Sur != null ? (minutos.Norte <= minutos.Sur ? 'Norte' : 'Sur') : null)
const parqueDeSalida = (s) => {
  if (s.municipio !== 'Granada') return { parque: PARQUE_DE_MUNICIPIO[s.municipio] ?? null, segun: 'pueblo' }
  if (!ladoParques.aproximado(s.punto)) return { parque: ladoParques.parque(s.punto), segun: 'línea' }
  return { parque: masRapido(tiemposParques.salidas[s.id]), segun: 'tiempo' }
}
await guardar(
  'salidas.json',
  salidas.map(({ nodos, sentidos, punto, ...s }) => {
    const { parque, segun } = parqueDeSalida({ ...s, punto })
    return {
      ...s,
      sentidos: sentidos.map(({ nodo, ...x }) => x),
      punto: redondear([punto])[0],
      ...(parque && { parque, parqueSegun: segun, minutosParques: tiemposParques.salidas[s.id] }),
    }
  }),
)
await guardar(
  'municipios.json',
  coleccion(
    municipios.map((m) => ({
      type: 'Feature',
      properties: {
        nombre: m.nombre,
        parte: m.parte,
        pueblo: m.pueblo,
        vecinos: m.vecinos,
        carreteras: listaCarreteras(m.nombre),
        centro: redondear([m.centro])[0],
        acceso: accesos[m.nombre] ?? null,
        ...(m.nombre !== 'Granada' && { parque: PARQUE_DE_MUNICIPIO[m.nombre] ?? null, minutosParques: tiemposParques.pueblos[m.nombre] }),
      },
      geometry: poligono(m.zona, 20),
    })),
  ),
)

// Polígonos industriales (scripts/lib/poligonos.mjs, del PDF de la persona): situados con OpenStreetMap. Se apunta
// la carretera con código más cercana y, si el municipio de OpenStreetMap no es el del PDF, se dice en el informe.
const osmPorId = new Map(poligonosOsm.elements.map((e) => [`${e.type[0]}${e.id}`, e]))
const municipioEn = (p) => municipios.find((m) => m.zona.contiene(p))?.nombre ?? null
const carreteraCercana = (p) => {
  let mejor = null
  for (const f of carreteras) {
    const linea = f.geometry.coordinates
    for (let i = 1; i < linea.length; i++) {
      const d = distanciaASegmento(p, linea[i - 1], linea[i])
      if (!mejor || d < mejor.metros) mejor = { codigo: f.properties.codigo.split(' / ')[0], metros: Math.round(d) }
    }
  }
  return mejor && mejor.metros < 1500 ? mejor : null
}
const poligonos = POLIGONOS.map((p, i) => {
  const e = p.osm ? osmPorId.get(p.osm) : null
  const punto = e ? (e.center ? [e.center.lon, e.center.lat] : [e.lon, e.lat]) : (p.punto ?? null)
  const enOsm = punto ? municipioEn(punto) : null
  return {
    id: `poligono${i + 1}`,
    nombre: p.nombre,
    municipio: p.municipio,
    ...(p.nota && { nota: p.nota }),
    ...(p.carretera && { carretera: p.carretera }),
    ...(punto && { punto: redondear([punto])[0], cerca: carreteraCercana(punto) }),
    ...(punto && !e && { aproximado: true }),
    ...(e?.tags.name && e.tags.name !== p.nombre && { nombreOsm: e.tags.name }),
    ...(enOsm && enOsm !== p.municipio && { municipioOsm: enOsm }),
    ...(p.municipio === 'Granada' && punto && { ...zonaDe(punto), parque: ladoParques.parque(punto) }),
    ...(p.municipio !== 'Granada' && PARQUE_DE_MUNICIPIO[p.municipio] && { parque: PARQUE_DE_MUNICIPIO[p.municipio] }),
    ...(p.dudoso && { dudoso: true }),
    ...(p.fuente && { fuente: p.fuente }),
  }
})
await guardar('poligonos.json', poligonos)

// Núcleos de población de la zona (OpenStreetMap: pueblos, aldeas, barriadas y urbanizaciones): en qué municipio está
// cada uno y qué carreteras con código pasan a menos de 300 m. Para «tenemos un incendio en la zona residencial San
// Javier, ¿a qué municipio nos dirigimos?» o «la GR-3415 nos dirige hacia...» (exámenes de 2025). Sin el pueblo
// principal de cada municipio ni los barrios de Granada capital (esos ya están en el callejero).
const nucleosOsm = await leer('osm-nucleos.json').catch(() => ({ elements: [] }))
const TIPOS_NUCLEO = {
  town: 'pueblo',
  village: 'pueblo',
  hamlet: 'aldea',
  suburb: 'barrio',
  quarter: 'barrio',
  neighbourhood: 'barriada',
}
const nucleos = []
{
  const principales = new Set(municipios.flatMap((m) => [m.nombre, m.pueblo].filter(Boolean).map(normalizar)))
  const cercanas = (p) => {
    const codigos = new Set()
    for (const f of carreteras) {
      const linea = f.geometry.coordinates
      for (let i = 1; i < linea.length; i++) {
        if (distanciaASegmento(p, linea[i - 1], linea[i]) < 300) {
          for (const c of f.properties.codigo.split(' / ')) if (/^(A|N|GR)-\d+G?$/.test(c)) codigos.add(c)
          break
        }
      }
    }
    return [...codigos].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
  }
  for (const e of nucleosOsm.elements) {
    const t = e.tags ?? {}
    const punto = e.type === 'node' ? [e.lon, e.lat] : e.center ? [e.center.lon, e.center.lat] : null
    if (!punto || !t.name) continue
    const tipo = TIPOS_NUCLEO[t.place] ?? (t.landuse === 'residential' ? 'urbanización' : null)
    if (!tipo) continue
    const municipio = municipioEn(punto)
    if (!municipio || municipio === 'Granada' || principales.has(normalizar(t.name))) continue
    // El mismo sitio dos veces (punto y área): se queda el primero
    if (nucleos.some((n) => n.nombre === t.name && distancia(n.punto, punto) < 1500)) continue
    nucleos.push({
      nombre: t.name,
      tipo,
      municipio,
      parque: PARQUE_DE_MUNICIPIO[municipio] ?? null,
      punto: redondear([punto])[0],
      carreteras: cercanas(punto),
      osm: `${e.type[0]}${e.id}`,
    })
  }
  // Un nombre que está en dos municipios no sirve para preguntar «¿a qué municipio pertenece?»
  for (const n of nucleos) if (nucleos.some((o) => o !== n && normalizar(o.nombre) === normalizar(n.nombre))) n.repetido = true
  nucleos.sort((a, b) => a.municipio.localeCompare(b.municipio, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
}
await guardar('nucleos.json', nucleos)

// Informe del material de la persona (11-11-2026), para revisar si algo no cuadra
const tabla = (cabecera, filas) => [`| ${cabecera.join(' | ')} |`, `| ${cabecera.map(() => '---').join(' | ')} |`, ...filas.map((f) => `| ${f.join(' | ')} |`)]
const porParque = (lista) => contarValores(lista.map((x) => x.parque)).map(([p, n]) => `${p} ${n}`).join(', ')
const lineasMaterial = [
  '# Material de estudio: parques, polígonos, edificios y carreteras',
  '',
  'Generado por `npm run datos:procesar`. Sale de los PDF que la persona guardó en `material/` el 11-11-2026 (límites de los parques, polígonos industriales y edificios singulares), del Catastro (plantas de los edificios) y de OpenStreetMap (tipo de red de las carreteras). Si algo no coincide con el material oficial, manda el material oficial.',
  '',
  '## Parque Norte y Parque Sur',
  '',
  `Línea entre los dos parques: ${CALLES_LIMITE.map(([, n]) => n).join(', ')}. Al norte, Parque Norte; al sur, Parque Sur.`,
  '',
  `- Calles: ${porParque(calles)}. «límite» = calles de la propia línea; «los dos» = calles que la cruzan.`,
  `- Lugares de interés: ${porParque(lugares)}.`,
  `- ${calles.filter((c) => c.parqueAproximado).length} calles y ${lugares.filter((l) => l.parqueAproximado).length} lugares quedan más allá de las puntas de la línea (el Fargue, el final de Camino de Ronda...): su parque es aproximado y no sale en las preguntas. Falta saber qué parque atiende a cada pueblo de la zona.`,
  '',
  ...tabla(
    ['Distrito', 'Calles del Parque Norte', 'Calles del Parque Sur', 'Límite o los dos'],
    distritos.map((x) => x.nombre).sort((a, b) => a.localeCompare(b, 'es')).map((d) => {
      const suyas = calles.filter((c) => c.distritos[0] === d)
      return [d, suyas.filter((c) => c.parque === 'Norte').length, suyas.filter((c) => c.parque === 'Sur').length, suyas.filter((c) => !['Norte', 'Sur'].includes(c.parque)).length]
    }),
  ),
  '',
  '## Parque de bomberos de cada pueblo',
  '',
  'El que tarda menos en llegar desde su puerta hasta el pueblo principal (calles a 20 km/h en línea recta, carreteras a su velocidad, sin tráfico). Lista confirmada por la persona el 12-11-2026 (`PARQUE_DE_PUEBLO` en `scripts/lib/zona-parques.mjs`); si el cálculo cambia, sale marcado.',
  '',
  ...tabla(
    ['Parte', 'Pueblo', 'Minutos desde el Norte', 'Minutos desde el Sur', 'Parque'],
    Object.entries(ZONA_PARQUES).flatMap(([parte, nombres]) =>
      nombres
        .filter((n) => n !== 'Granada')
        .map((n) => {
          const m = tiemposParques.pueblos[n] ?? {}
          const calculado = masRapido(m)
          const confirmado = PARQUE_DE_MUNICIPIO[n]
          return [parte, n, m.Norte ?? '', m.Sur ?? '', calculado === confirmado ? confirmado : `**${confirmado} (el cálculo da ${calculado})**`]
        }),
    ),
  ),
  '',
  `Salidas de autovía: ${salidas.filter((s) => parqueDeSalida(s).parque === 'Norte').length} del Parque Norte y ${salidas.filter((s) => parqueDeSalida(s).parque === 'Sur').length} del Sur (las de los pueblos, las de su pueblo; las del término de Granada, por la línea o, más allá de sus puntas, por el que llega antes).`,
  '',
  '## Polígonos industriales',
  '',
  `${poligonos.length} polígonos; ${poligonos.filter((p) => p.punto && !p.aproximado).length} situados con su polígono de OpenStreetMap, ${poligonos.filter((p) => p.aproximado).length} en un punto aproximado y ${poligonos.filter((p) => !p.punto).length} sin situar.`,
  '',
  ...tabla(
    ['Municipio', 'Polígono', 'Dónde está', 'Carretera (PDF)', 'Carretera más cercana'],
    poligonos.map((p) => [
      p.municipio + (p.municipioOsm ? ` (OpenStreetMap: ${p.municipioOsm})` : ''),
      p.nombre + (p.nota ? ` (${p.nota})` : '') + (p.dudoso ? ' **¿errata?**' : ''),
      !p.punto ? '**sin situar**' : p.aproximado ? 'aproximado' : `OpenStreetMap${p.nombreOsm ? `: ${p.nombreOsm}` : ''}`,
      p.carretera ?? '',
      p.cerca ? `${p.cerca.codigo} (${p.cerca.metros} m)` : '',
    ]),
  ),
  '',
  '## Edificios singulares',
  '',
  ...tabla(
    ['Edificio', 'Calle (PDF)', 'Calle en el callejero', 'Situado en'],
    informeSingulares.map((e) => [e.nombre, [e.calle, e.numero].filter(Boolean).join(', '), e.via ?? '**no encontrada**', e.situado]),
  ),
  '',
  '## Edificios de gran altura',
  '',
  `${altos.length} edificios de ${PLANTAS_GRAN_ALTURA} plantas o más sobre rasante, según el Catastro (contando la planta baja); ${altos.filter((a) => a.nombre).length} con nombre en OpenStreetMap.`,
  '',
  ...tabla(
    ['Plantas', 'Dirección', 'Nombre', 'Distrito', 'Parque'],
    altos.map((a) => [a.plantas, a.direccion ?? '', a.nombre ?? '', a.distrito, a.parque]),
  ),
  '',
  '## Tipo de red de las carreteras',
  '',
  ...tabla(
    ['Red', 'Carreteras de la zona'],
    contarValores(carreteras.map((c) => c.properties.tipoRed ?? 'sin dato')).map(([red]) => [
      red,
      unicos(carreteras.filter((c) => (c.properties.tipoRed ?? 'sin dato') === red).map((c) => c.properties.codigo)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).join(', '),
    ]),
  ),
  '',
  '## Núcleos de población de la zona',
  '',
  `${nucleos.length} núcleos (pueblos que no son el principal de su municipio, aldeas, barriadas y urbanizaciones) según OpenStreetMap; ${nucleos.filter((n) => n.repetido).length} con un nombre que se repite en otro municipio (no salen en las preguntas).`,
  '',
  ...tabla(
    ['Municipio', 'Núcleos'],
    unicos(nucleos.map((n) => n.municipio)).map((m) => [m, nucleos.filter((n) => n.municipio === m).map((n) => `${n.nombre} (${n.tipo})`).join(', ')]),
  ),
  '',
  '## Calles sin salida para vehículos',
  '',
  `${calles.filter((c) => c.salida === 'sin').length} calles pequeñas sin salida para coches (un extremo al que no llega ninguna otra calle de coches), y ${calles.filter((c) => c.salida === 'con').length} con salida por los dos lados. Solo se miran calles de barrio sin tramos dudosos.`,
  '',
  '## Rumbo de las carreteras desde Granada',
  '',
  ...tabla(
    ['Rumbo', 'Carreteras'],
    RUMBOS.map((r) => [r, Object.keys(rumbos).filter((c) => rumbos[c] === r).join(', ')]).filter(([, c]) => c),
  ),
  '',
  '## Incorporaciones',
  '',
  `${calles.filter((c) => c.incorporaciones).length} calles con «¿cómo me incorporo a la calle de su final?» calculado con la red de los trayectos (girando a la derecha, a la izquierda o a los dos lados).`,
  '',
  'Fuentes: material de la persona · Catastro (Dirección General del Catastro, CC BY 4.0) · © colaboradores de OpenStreetMap (ODbL) · CDAU (Junta de Andalucía, CC BY 4.0).',
  '',
]
await writeFile(join(RAIZ, 'datos', 'informe-material.md'), lineasMaterial.join('\n'))

// Informe para revisar la zona con el material oficial: salidas de cada autovía y cómo se llega a cada pueblo
const lineasZona = [
  '# Zona de los parques de Granada: pueblos, salidas y accesos',
  '',
  `Generado por \`npm run datos:procesar\` con los datos de OpenStreetMap descargados ${fechaDescarga}. Qué municipios entran sale del plano de carreteras de la provincia (diciembre de 2013) guardado en \`material/\`; las salidas y los accesos, de OpenStreetMap. Si algo no coincide con el material oficial, manda el material oficial.`,
  '',
  ...(municipiosQueFaltan.length ? [`**Faltan en OpenStreetMap:** ${municipiosQueFaltan.join(', ')}.`, ''] : []),
  '## Municipios',
  '',
  '| Parte | Municipio | Pueblo principal | Limita con |',
  '| --- | --- | --- | --- |',
  ...Object.entries(ZONA_PARQUES).flatMap(([parte, nombres]) =>
    nombres.map((n) => {
      const m = municipios.find((x) => x.nombre === n)
      return `| ${parte} | ${n} | ${m?.pueblo ?? ''} | ${m?.vecinos.join(', ') ?? 'no encontrado'} |`
    }),
  ),
  '',
  '## Salidas de autovía',
  '',
  'Destinos según los carteles que hay en OpenStreetMap, en cada sentido. Las autovías se recorren hacia donde crecen los números de salida (los kilómetros) o al revés.',
  '',
  ...unicos(salidas.map((s) => s.carretera)).flatMap((carretera) => [
    `### ${carretera}`,
    '',
    '| Salida | Municipio | Destinos |',
    '| --- | --- | --- |',
    ...salidas
      .filter((s) => s.carretera === carretera)
      .map((s) => {
        const porSentido = s.sentidos.length
          ? unicos(s.sentidos.map((x) => `${x.hacia ? `hacia ${x.hacia}: ` : ''}${x.destinos.join(', ')}`)).join('<br>')
          : '**sin destinos**'
        return `| ${s.numero ?? '**sin número**'} | ${s.municipio} | ${porSentido} |`
      }),
    '',
  ]),
  '## Cómo se llega desde Granada',
  '',
  'Camino más rápido desde el centro de Granada por la red de carreteras, calculado con OpenStreetMap: carreteras con código por las que se va y salidas que se cogen. Es una forma de llegar, no la única.',
  '',
  '| Parte | Pueblo | Cómo se llega | Minutos |',
  '| --- | --- | --- | --- |',
  ...Object.entries(ZONA_PARQUES).flatMap(([parte, nombres]) =>
    nombres
      .filter((n) => n !== 'Granada')
      .map((n) => {
        const m = municipios.find((x) => x.nombre === n)
        const nombre = m?.pueblo ? `${n} (${m.pueblo})` : n
        return `| ${parte} | ${nombre} | ${accesos[n] ? textoAcceso(accesos[n]) : '**sin calcular**'} | ${accesos[n]?.minutos ?? ''} |`
      }),
  ),
  '',
  'Fuente: © colaboradores de OpenStreetMap (ODbL).',
  '',
]
await writeFile(join(RAIZ, 'datos', 'informe-zona.md'), lineasZona.join('\n'))

// 7. Fondo del mapa (OpenStreetMap): ríos, agua, zonas verdes, cementerios y vías del tren.
// Se quitan las manchas pequeñas (jardines de casas, fuentes) para que el mapa no se llene de ruido.
const superficie = (anillo) => {
  let doble = 0
  const p = anillo.map(aMetros)
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) doble += p[j][0] * p[i][1] - p[i][0] * p[j][1]
  return Math.abs(doble / 2)
}
const tipoDeFondo = (t) =>
  t.landuse === 'cemetery'
    ? 'cementerio'
    : t.natural === 'water'
      ? 'agua'
      : t.leisure || /^(grass|forest|meadow|recreation_ground|village_green)$/.test(t.landuse) || t.natural === 'wood'
        ? 'verde'
        : null
// Superficie mínima en m² para dibujar una mancha sin nombre (los jardines suelen ser de casas particulares)
const MINIMO_FONDO = { garden: 2000, park: 300, agua: 500, otro: 1000 }
const fondo = []
for (const e of fondoOsm.elements) {
  const t = e.tags ?? {}
  const tunel = t.tunnel || t.covered === 'yes'
  if (t.railway === 'rail') {
    // Solo las vías principales y al aire libre: sin apartaderos, playas de vías ni túneles
    if (t.service || tunel || e.type !== 'way') continue
    fondo.push({ type: 'Feature', properties: { tipo: 'tren' }, geometry: { type: 'LineString', coordinates: redondear(simplificar(e.geometry.map((p) => [p.lon, p.lat]), 3)) } })
    continue
  }
  if (t.waterway) {
    // Los ríos al aire libre (el Darro y el Beiro van soterrados en parte); sin barrancos ni acequias
    if (tunel || e.type !== 'way' || !(t.waterway === 'river' || /^Río /.test(t.name ?? ''))) continue
    fondo.push({ type: 'Feature', properties: { tipo: 'rio', nombre: t.name ?? null }, geometry: { type: 'LineString', coordinates: redondear(simplificar(e.geometry.map((p) => [p.lon, p.lat]), 3)) } })
    continue
  }
  const tipo = tipoDeFondo(t)
  if (!tipo) continue
  const exteriores = e.type === 'way' ? [e.geometry.map((p) => [p.lon, p.lat])] : anillosDeRelacion(e, 'outer')
  const interiores = e.type === 'way' ? [] : anillosDeRelacion(e, 'inner')
  const minimo = t.name && tipo !== 'agua' ? 0 : MINIMO_FONDO[tipo === 'agua' ? 'agua' : t.leisure] ?? MINIMO_FONDO.otro
  const poligonos = exteriores
    .filter((anillo) => anillo.length >= 4 && superficie(anillo) >= minimo)
    .map((anillo) => [anillo, ...interiores.filter((h) => puntoEnAnillo(h[0], anillo))].map((a) => redondear(simplificar(a, 2))))
  if (!poligonos.length) continue
  fondo.push({ type: 'Feature', properties: { tipo }, geometry: { type: 'MultiPolygon', coordinates: poligonos } })
}
// Primero el verde y encima el agua (un estanque dentro de un parque se ve)
const ORDEN_FONDO = ['verde', 'cementerio', 'agua', 'rio', 'tren']
fondo.sort((a, b) => ORDEN_FONDO.indexOf(a.properties.tipo) - ORDEN_FONDO.indexOf(b.properties.tipo))
await guardar('fondo.json', coleccion(fondo))

// 8. Informe con las cifras y lo que queda por revisar
const contar = contarValores
const miles = (n) => n.toLocaleString('es-ES')
const porFuente = contar(tramos.map((t) => (t.cdau ? 'callejero oficial (CDAU)' : t.osm ? 'OpenStreetMap' : 'sin dato')))
const lineasInforme = [
  '# Informe de datos',
  '',
  `Generado el ${new Date().toISOString().slice(0, 10)} con los datos descargados ${fechaDescarga}. Se vuelve a crear con \`npm run datos:procesar\`.`,
  '',
  '## Distritos y barrios',
  '',
  `${distritos.length} distritos y ${barrios.length} barrios (OpenStreetMap).`,
  '',
  '| Distrito | Barrios |',
  '| --- | --- |',
  ...distritos
    .map((d) => d.nombre)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((d) => `| ${d} | ${barrios.filter((b) => b.distrito === d).map((b) => b.nombre).sort((a, b) => a.localeCompare(b, 'es')).join(', ')} |`),
  '',
  '## Calles',
  '',
  `- ${miles(calles.length)} calles con nombre oficial (CDAU); ${[...vias.values()].filter((v) => v.sinNombre).length} vías sin nombre aparte.`,
  `- ${miles(tramos.length)} tramos; ${tramos.filter((t) => t.via === null).length} sin calle asignada.`,
  `- Sentido de circulación según: ${porFuente.map(([f, n]) => `${f} ${miles(n)}`).join(', ')}.`,
  `- ${miles(tramos.filter((t) => t.bulevar).length)} tramos sin sentido en el CDAU son de doble sentido por ser bulevares (una calzada de sentido único a cada lado en OpenStreetMap): ${unicos(tramos.filter((t) => t.bulevar).map((t) => nombreVia(t.via)).filter(Boolean)).sort((x, y) => x.localeCompare(y, 'es')).join(', ')}.`,
  `- ${miles(tramos.filter((t) => t.revisado).length)} tramos ya revisados a mano en el mapa de revisión; ${miles(tramos.filter((t) => t.plaza).length)} de ellos son parte de una plaza y no de una calle (${miles(tramosDePlaza.size)} plazas, que salen como lugares de interés).`,
  `- **${miles(tramos.filter((t) => t.dudoso).length)} tramos dudosos**: el CDAU y OpenStreetMap dicen cosas distintas. Hay que revisarlos (paso 1.3).`,
  '',
  '| CDAU dice | OpenStreetMap dice | Tramos dudosos |',
  '| --- | --- | --- |',
  ...contar(
    tramos
      .filter((t) => t.dudoso)
      .map((t) => {
        const texto = (s) => ({ directo: 'sentido único', inverso: 'sentido único', doble: 'doble sentido', peatonal: 'peatonal' })[s]
        const contrarios = ['directo', 'inverso'].includes(t.cdau) && ['directo', 'inverso'].includes(t.osm)
        return contrarios ? 'sentido único | sentido único, pero al revés' : `${texto(t.cdau)} | ${texto(t.osm)}`
      }),
  ).map(([par, n]) => `| ${par} | ${miles(n)} |`),
  '',
  `- Sentido de las calles: ${contar(calles.map((c) => c.sentido)).map(([s, n]) => `${s} ${miles(n)}`).join(', ')}.`,
  `- ${miles(calles.filter((c) => c.partes > 1).length)} calles están en varios trozos separados (se estudia el más largo).`,
  `- ${miles(calles.filter((c) => !c.inicio.length || !c.fin.length).length)} calles no tienen otra calle en alguno de sus extremos (sin salida, o terminan en un camino sin nombre).`,
  '',
  'Códigos de circulación del CDAU, deducidos comparando cada tramo con OpenStreetMap:',
  '',
  '| Código | Significado |',
  '| --- | --- |',
  '| 311, 331 | Sentido único, en el sentido en que está dibujado el tramo |',
  '| 322, 332 | Sentido único, al contrario de como está dibujado |',
  '| 333 | Doble sentido |',
  '| 330 | Peatonal |',
  '',
  '## Red de calles para los trayectos',
  '',
  `- ${miles(informeRed.tramos)} tramos por los que se circula y ${miles(informeRed.cruces)} cruces; ${miles(informeRed.soldados)} cruces unidos porque el callejero no corta la otra calle.`,
  `- ${miles(informeRed.anadidas)} trozos (${miles(informeRed.metrosAnadidos)} m) que no están en el callejero, añadidos desde OpenStreetMap: carreteras, enlaces y caminos de las afueras.`,
  `- ${miles(informeRed.enElTrozoMayor)} cruces (${Math.round((informeRed.enElTrozoMayor / informeRed.cruces) * 100)} %) se comunican todos entre sí respetando los sentidos. El resto son sobre todo calles sin salida de un solo sentido, urbanizaciones y errores de sentido.`,
  `- Giros prohibidos de OpenStreetMap: ${informeRed.giros.aplicados} aplicados de ${informeRed.giros.total} (${informeRed.giros.sinBrazo + informeRed.giros.sinCruce} sin un cruce parecido en el callejero, ${informeRed.giros.fuera} con una calle sin datos, ${informeRed.giros.viaCalle} que pasan por una calle entera, ${informeRed.giros.quitados} que no cuentan: los «excepto autobús» de las calles sin limitación y los de Gran Vía, que es una calle normal).`,
  `- ${miles(informeRed.dudosos)} tramos dudosos o sin sentido conocido: no se usarán en las preguntas de trayectos.`,
  `- ${miles(informeRed.limitados)} tramos con el paso limitado según OpenStreetMap (residentes, autobús y taxi, privados): las rutas solo pasan por ellos si no hay otro camino. Gran Vía, Reyes Católicos, Recogidas y Antonio Dalmases no cuentan: se pasa por ellas sin limitación.`,
  '',
  '## Lugares de interés',
  '',
  `${miles(lugares.length)} lugares (OpenStreetMap y las plazas de la revisión); ${miles(lugares.filter((l) => l.direccion).length)} con dirección.`,
  '',
  '| Tipo | Lugares | Con dirección |',
  '| --- | --- | --- |',
  ...contar(lugares.map((l) => l.categoria)).map(
    ([c, n]) => `| ${c} | ${n} | ${lugares.filter((l) => l.categoria === c && l.direccion).length} |`,
  ),
  '',
  '## Carreteras y salidas',
  '',
  `Zona de los parques de bomberos de Granada (detalle en \`datos/informe-zona.md\`):`,
  '',
  `- ${municipios.length} municipios${municipiosQueFaltan.length ? ` (faltan en OpenStreetMap: ${municipiosQueFaltan.join(', ')})` : ''}; ${Object.values(accesos).filter(Boolean).length} con el camino desde Granada calculado.`,
  `- ${unicos(carreteras.map((c) => c.properties.codigo)).length} carreteras con código.`,
  `- ${salidas.length} salidas de autovía: ${salidas.filter((s) => s.numero).length} con número y ${salidas.filter((s) => s.destinos.length).length} con destinos.`,
  '',
  '## Fondo del mapa',
  '',
  `- Ríos al aire libre: ${unicos(fondo.filter((f) => f.properties.tipo === 'rio').map((f) => f.properties.nombre ?? 'sin nombre')).sort((a, b) => a.localeCompare(b, 'es')).join(', ')}.`,
  `- Manchas: ${contar(fondo.filter((f) => f.geometry.type === 'MultiPolygon').map((f) => f.properties.tipo)).map(([t, n]) => `${t} ${miles(n)}`).join(', ')}.`,
  `- ${fondo.filter((f) => f.properties.tipo === 'tren').length} trozos de vía del tren (solo vías principales al aire libre).`,
  '',
  'Fuentes: © colaboradores de OpenStreetMap (ODbL) · Callejero Digital de Andalucía Unificado, Junta de Andalucía (CC BY 4.0).',
  '',
]
await writeFile(join(RAIZ, 'datos', 'informe-datos.md'), lineasInforme.join('\n'))

// Muestra por pantalla algunas calles conocidas para comprobar el resultado
for (const nombre of [
  'Calle Recogidas',
  'Gran Vía de Colón',
  'Calle Reyes Católicos',
  'Calle Pedro Antonio de Alarcón',
  'Calle Carrera del Darro',
  'Camino de Ronda',
]) {
  const buscadas = clavesNombre(nombre)
  const c = calles.find((x) => clavesNombre(x.nombre).some((k) => buscadas.includes(k)))
  if (!c) {
    console.log(`\n${nombre}: no encontrada`)
    continue
  }
  console.log(`\n${c.nombre} (${c.distritos.join(', ')} · ${c.barrios.join(', ')}) · ${c.longitud} m · sentido: ${c.sentido}`)
  console.log(`  empieza en: ${c.inicio.join(' / ') || '—'}`)
  console.log(`  cruces: ${c.cruces.join(' · ') || '—'}`)
  console.log(`  termina en: ${c.fin.join(' / ') || '—'}`)
  console.log(`  números: ${c.numeros?.join('–') ?? '—'} · CP ${c.codigosPostales.join(', ')} · tramos dudosos: ${c.tramosDudosos}`)
}
console.log(`\nListo: archivos en public/datos/ e informe en datos/informe-datos.md`)
