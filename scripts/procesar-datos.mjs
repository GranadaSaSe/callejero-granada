// Paso 1.2 del plan: limpia y une los datos descargados en el paso 1.1 y crea los archivos que usará
// la app, en public/datos/:
//
//   zonas.json       distritos y barrios
//   calles.json      cada calle oficial: tipo, distrito, barrios, inicio, fin, cruces, sentido y números
//   tramos.json      cada tramo de calle con su línea y su sentido de circulación
//   lugares.json     edificios y lugares de interés con su dirección, distrito y barrio
//   carreteras.json  carreteras con código de la zona de los parques de Granada
//   salidas.json     salidas de autovía de esa zona con sus destinos en cada sentido
//   municipios.json  municipios de esa zona con su pueblo principal, vecinos y cómo se llega desde Granada
//
// Los nombres y los tramos de las calles salen del callejero oficial (CDAU). El sentido de circulación
// sale del CDAU y, donde no lo trae, de OpenStreetMap; si los dos no coinciden, el tramo queda marcado
// como dudoso para revisarlo. Escribe además datos/informe-datos.md con las cifras y datos/informe-zona.md
// con las salidas y los accesos de la zona de los parques de Granada.
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
import { accesosDesdeGranada, codigos, municipiosDeLaZona, salidasDeLaZona, textoAcceso } from './lib/zona-datos.mjs'
import { ZONA_PARQUES } from './lib/zona-parques.mjs'

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

const [limites, callesOsm, edificiosOsm, carreterasOsm, municipiosOsm, fondoOsm, viales, tramosCdau, portales] =
  await Promise.all(
    [
      'osm-limites',
      'osm-calles',
      'osm-edificios',
      'osm-carreteras',
      'osm-municipios',
      'osm-fondo',
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
  const palabrasTipo = normalizar(p.nom_tip_via ?? '').split(' ')
  const tipo = normalizar(nombre).startsWith(palabrasTipo.join(' '))
    ? nombre.split(' ').slice(0, palabrasTipo.length).join(' ')
    : p.nom_tip_via
  vias.set(p.id_vial, { id: p.id_vial, nombre, tipo, sinNombre: p.nom_tip_via === 'VIA', tramos: [], portales: [] })
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
  const dato = { unico, peatonal: PEATONALES.has(t.highway), nombre: t.name ?? null, clase: t.highway }
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
  if (!mejor) return { sentido: null, nombre: null, clase: null }
  const sentido = mejor.peatonal
    ? 'peatonal'
    : mejor.unico === 0
      ? 'doble'
      : mejor.unico * Math.sign(mejor.cos) > 0
        ? 'directo'
        : 'inverso'
  return { sentido, nombre: mejor.nombre, clase: mejor.clase }
}

const tramos = []
for (const f of tramosCdau.features) {
  const linea = lineas(f.geometry).flat()
  if (linea.length < 2) continue
  const via = viaDelTramo(f.properties.id_tramo, linea)
  const cdau = SENTIDO_CDAU[f.properties.circulacion] ?? null
  const osm = parejaOsm(linea)
  const revisado = revisiones.tramos[f.properties.id_tramo]?.sentido ?? null
  const tramo = {
    id: f.properties.id_tramo,
    via,
    linea,
    cdau,
    osm: osm.sentido,
    nombreOsm: osm.nombre,
    clase: osm.clase,
    revisado,
    sentido: revisado ?? cdau ?? osm.sentido ?? 'desconocido',
    dudoso: !revisado && Boolean(cdau && osm.sentido && cdau !== osm.sentido),
    longitud: longitud(linea),
  }
  tramos.push(tramo)
  vias.get(via)?.tramos.push(tramo)
}

// El CDAU escribe a veces los nombres sin tildes ni artículos ("Camino Ronda"). Si OpenStreetMap llama
// a la misma calle de forma equivalente, se muestra su forma escrita y se guarda también la oficial.
for (const via of vias.values()) {
  if (via.sinNombre) continue
  const claves = new Set(clavesNombre(via.nombre))
  const votos = new Map()
  for (const t of via.tramos) {
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

  return {
    partes: partes.length,
    inicio,
    fin,
    cruces: crucesConLado.map((c) => c.nombre),
    lados: crucesConLado.map((c) => c.lado),
    sentido,
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
await guardar('calles.json', calles)

await guardar(
  'tramos.json',
  coleccion(
    tramos.map((t) => {
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
lugares.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
await guardar('lugares.json', lugares)

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
await guardar('carreteras.json', coleccion(carreteras))

const salidas = salidasDeLaZona(carreterasOsm.elements, municipios)
const accesos = accesosDesdeGranada(carreterasOsm.elements, municipios, salidas)
await guardar(
  'salidas.json',
  salidas.map(({ nodos, sentidos, punto, ...s }) => ({
    ...s,
    sentidos: sentidos.map(({ nodo, ...x }) => x),
    punto: redondear([punto])[0],
  })),
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
        centro: redondear([m.centro])[0],
        acceso: accesos[m.nombre] ?? null,
      },
      geometry: poligono(m.zona, 20),
    })),
  ),
)

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
  `- ${miles(tramos.filter((t) => t.revisado).length)} tramos ya revisados a mano en el mapa de revisión.`,
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
  '## Lugares de interés',
  '',
  `${miles(lugares.length)} lugares (OpenStreetMap); ${miles(lugares.filter((l) => l.direccion).length)} con dirección.`,
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
