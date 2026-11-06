// Trayectos (paso 3.3): "¿cuál es el mejor itinerario?" desde uno de los dos parques de bomberos hasta un lugar o
// una calle, con todas las calles del camino. La respuesta buena es la ruta de src/rutas.js sin pasar por tramos
// dudosos. Las falsas son de tres clases:
// - con una infracción: va en contra dirección por una calle de sentido único o hace un giro prohibido;
// - con una calle que no conecta con la siguiente;
// - un rodeo: se puede ir así, pero es bastante más largo.
// Cada falsa se comprueba: si su lista de calles se pudiera recorrer de verdad (o, en el rodeo, casi tan corto),
// no vale. Los tramos dudosos cuentan como si se pudieran recorrer en los dos sentidos.
// También están aquí los cruces del juego «Paso a paso». No usa el navegador: se puede probar con Node.
import { calcularRuta, crearCola, esProhibido, giroEntre, itinerario, lineaDeRuta, PARQUES, prepararRed, puntoDeParque, puntoEnRed, salidasDe } from './rutas.js'

export const TIPOS_TRAYECTO = [
  { id: 'mezcla', nombre: 'A lugares y calles', lugares: true, calles: true },
  { id: 'lugares', nombre: 'A lugares de interés', lugares: true },
  { id: 'calles', nombre: 'A calles', calles: true },
]
export const DESDE_PARQUE = [
  { id: 'ambos', nombre: 'Desde los dos parques' },
  { id: 'norte', nombre: 'Desde el Parque Norte' },
  { id: 'sur', nombre: 'Desde el Parque Sur' },
]
const SIN_DESTINO = ['Autovía', 'Enlace', 'Acceso'] // tipos de vía a los que no se pregunta cómo llegar
const RODEO_MINIMO = 1.2 // un rodeo es al menos un 20 % más largo...
const RODEO_METROS = 300 // ...y 300 m más
const RODEO_MAXIMO = 2.5 // y no tan largo que se vea a simple vista
const CERCA_CRUCE = 600 // metros alrededor del cruce en los que se busca una calle que no conecta

const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540
const distancia = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)

const barajar = (lista, azar) =>
  lista
    .map((x) => [azar(), x])
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x)

export const textoKm = (metros) => (metros < 1000 ? `${Math.round(metros / 10) * 10} m` : `${(metros / 1000).toFixed(1).replace('.', ',')} km`)

// Prepara la red y lo que hace falta para las preguntas. `datos`: red.json, calles.json y lugares.json
export function prepararTrayectos({ red: crudo, calles, lugares }) {
  const red = prepararRed(crudo)
  const nodosDe = new Map() // nombre de calle → cruces por los que pasa
  const tramosDe = new Map() // nombre de calle → sus tramos
  for (const t of red.tramos) {
    if (!t.nombre) continue
    if (!nodosDe.has(t.nombre)) {
      nodosDe.set(t.nombre, new Set())
      tramosDe.set(t.nombre, [])
    }
    nodosDe.get(t.nombre).add(t.a).add(t.b)
    tramosDe.get(t.nombre).push(t)
  }
  const salidas = Object.fromEntries(PARQUES.map((p) => [p.id, puntoDeParque(red, p, lugares)]))
  return { red, nodosDe, tramosDe, calleDe: new Map(calles.map((c) => [c.id, c])), salidas, calles, lugares }
}

// Lugares y calles a los que se puede preguntar cómo llegar. `importancia`: la de las calles (1 a 6)
export function destinosTrayecto(base, { tipo = 'mezcla', zona = 'Todos', importancia = 4 } = {}) {
  const ajuste = TIPOS_TRAYECTO.find((t) => t.id === tipo) ?? TIPOS_TRAYECTO[0]
  const enZona = (distritos) => zona === 'Todos' || distritos.includes(zona)
  const lista = []
  if (ajuste.lugares) {
    for (const l of base.lugares) {
      if (!l.via || !l.punto || l.categoria === 'Bomberos' || !enZona([l.distrito])) continue
      lista.push({ id: `l:${l.id}`, clase: 'lugar', nombre: l.nombre, detalle: l.direccion, enlace: `#/mapa?lugar=${l.id}`, lugar: l })
    }
  }
  if (ajuste.calles) {
    for (const c of base.calles) {
      if (c.importancia > importancia || SIN_DESTINO.includes(c.tipo) || !enZona(c.distritos) || !base.tramosDe.has(c.nombre)) continue
      lista.push({ id: `c:${c.id}`, clase: 'calle', nombre: c.nombre, detalle: c.barrios.join(', '), enlace: `#/mapa?calle=${c.id}`, calle: c })
    }
  }
  return lista
}

// A qué punto de la red se va: un lugar, a su calle (la de su dirección); una calle, a cualquier punto de ella
function puntoDestino(base, destino) {
  if (destino.clase === 'calle') return { calle: destino.nombre }
  const via = base.calleDe.get(destino.lugar.via)?.nombre
  const punto = (base.tramosDe.has(via) && puntoEnRed(base.red, destino.lugar.punto, via)) || puntoEnRed(base.red, destino.lugar.punto)
  return punto && punto.metros < 400 ? punto : null
}

// "Avenida" y "Calle" abreviadas, para que las opciones quepan mejor
export const nombreCorto = (nombre) => (nombre || 'calle sin nombre').replace(/^Avenida /, 'Av. ').replace(/^Calle /, 'C/ ')
export const textoGiro = { derecha: 'dcha. ', izquierda: 'izq. ' }
// Un itinerario en una línea: "Av. Juan Pablo II → dcha. Av. Luis Miranda Dávalos → ..."
export const textoItinerario = (partes) => partes.map((p) => `${textoGiro[p.giro] ?? ''}${nombreCorto(p.calle)}`).join(' → ')

// A qué parte del itinerario pertenece cada paso de la ruta
const parteDePaso = (partes) => (i) => {
  let j = 0
  while (j + 1 < partes.length && partes[j + 1].desde <= i) j++
  return j
}

// Una pregunta de trayecto desde un parque ("norte" o "sur") hasta un destino de `destinosTrayecto`, o null si no se
// puede (no se llega sin pasar por tramos dudosos, es demasiado corto o no salen tres falsas). Devuelve
// { id, parque, destino, enunciado, ruta, partes, opciones: [{ tipo, partes, texto, motivo, marcas, linea }], correcta }.
// "marcas": las calles de la opción en las que está el fallo (posiciones en "partes").
export function crearTrayecto(base, parqueId, destino, azar = Math.random) {
  const { red } = base
  const parque = PARQUES.find((p) => p.id === parqueId)
  const origen = base.salidas[parqueId]
  const fin = puntoDestino(base, destino)
  if (!origen || !fin || (fin.calle && origen.tramo.nombre === fin.calle)) return null
  const ruta = calcularRuta(red, origen, fin, { sinDudosos: true })
  if (!ruta) return null
  const partes = itinerario(ruta)
  if (partes.length < 3) return null
  const nombres = partes.map((p) => p.calle)

  // Si una lista de calles se puede recorrer de verdad (con `fisico`, aunque sea en contra dirección o con giros
  // prohibidos), el camino más corto que la sigue
  const sePuede = (ps, fisico = false) =>
    calcularRuta(red, origen, fin, { secuencia: ps.map((p) => p.calle), dudososLibres: true, ...(fisico ? { contra: true, sinProhibidos: true } : {}) })

  const vistas = new Set([nombres.join('|')])
  const falsas = { infraccion: [], rodeo: [], conecta: [] }
  const anadir = (clase, opcion) => {
    const clave = opcion.partes.map((p) => p.calle).join('|')
    if (vistas.has(clave)) return
    vistas.add(clave)
    falsas[clase].push(opcion)
  }

  // Rutas con una infracción o con un rodeo: la más corta en contra dirección o con giros prohibidos, y las que
  // evitan alguna de las calles más largas del camino bueno
  const largas = partes
    .slice(1, -1)
    .filter((p) => p.calle)
    .sort((a, b) => b.metros - a.metros)
    .slice(0, 3)
    .map((p) => p.calle)
  // En contra dirección, cada vez que se entra en una calle al revés cuesta un minuto: así lo hace en un solo sitio,
  // donde más se ahorra (si fuera gratis, iría en contra por media ciudad y se vería enseguida)
  const intentos = [
    { contra: 60 },
    { sinProhibidos: true },
    { contra: 20 },
    ...largas.flatMap((calle) => [{ evitar: new Set([calle]) }, { evitar: new Set([calle]), contra: 60 }]),
  ]
  // Ir en contra por la calle de salida (Antonio Dalmases, en el Parque Sur) saldría casi siempre: mejor otra si la hay
  const enMitad = (o) => !o.marcas.includes(0)
  for (const intento of intentos) {
    if (falsas.infraccion.some(enMitad) && falsas.rodeo.length) break
    const r = calcularRuta(red, origen, fin, { sinDudosos: true, ...intento })
    if (!r) continue
    const ps = itinerario(r)
    const deParte = parteDePaso(ps)
    const contra = new Set(r.pasos.flatMap((p, i) => (p.contra ? [deParte(i)] : [])))
    // Un giro prohibido solo se ve en el itinerario si es de una calle a otra
    const prohibidos = r.pasos.slice(1).flatMap((p, i) => {
      if (!esProhibido(red, r.pasos[i], p)) return []
      const [a, b] = [deParte(i), deParte(i + 1)]
      return a !== b ? [[a, b]] : []
    })
    const conGiroMalo = r.pasos.slice(1).some((p, i) => esProhibido(red, r.pasos[i], p))
    if (contra.size || conGiroMalo) {
      if ((!contra.size && !prohibidos.length) || contra.size > 2 || sePuede(ps)) continue
      const marcas = contra.size ? [...contra] : prohibidos.map(([, b]) => b)
      const motivo = contra.size
        ? `Va en contra dirección por ${[...new Set(marcas.map((j) => nombreCorto(ps[j].calle)))].join(' y ')}`
        : `Hace un giro prohibido de ${nombreCorto(ps[prohibidos[0][0]].calle)} a ${nombreCorto(ps[prohibidos[0][1]].calle)}`
      anadir('infraccion', { tipo: contra.size ? 'contra' : 'prohibido', partes: ps, motivo, marcas, linea: lineaDeRuta(r) })
    } else {
      const minimo = sePuede(ps) ?? r
      if (minimo.metros < ruta.metros * RODEO_MINIMO || minimo.metros - ruta.metros < RODEO_METROS || minimo.metros > ruta.metros * RODEO_MAXIMO) continue
      const marcas = ps.flatMap((p, j) => (nombres.includes(p.calle) ? [] : [j]))
      anadir('rodeo', {
        tipo: 'rodeo',
        partes: ps,
        motivo: `Se puede ir así, pero es un rodeo: ${textoKm(minimo.metros)} en vez de ${textoKm(ruta.metros)}`,
        marcas,
        linea: lineaDeRuta(r),
      })
    }
  }

  // Una calle que no conecta: se cambia una calle del camino por otra que cruza la anterior cerca de allí, pero que
  // no toca la siguiente
  for (const i of barajar(
    partes.slice(1, -1).map((_, j) => j + 1),
    azar,
  )) {
    if (falsas.conecta.length >= 3) break
    const antes = partes[i - 1].calle
    const despues = partes[i + 1].calle
    const cruce = red.nodos[ruta.pasos[partes[i].desde - 1].hacia]
    const tocaDespues = base.nodosDe.get(despues) ?? new Set()
    const candidatas = new Set()
    for (const nodo of base.nodosDe.get(antes) ?? []) {
      if (distancia(red.nodos[nodo], cruce) > CERCA_CRUCE) continue
      for (const s of salidasDe(red, nodo)) {
        const calle = s.tramo.nombre
        if (calle && !nombres.includes(calle) && ![...base.nodosDe.get(calle)].some((n) => tocaDespues.has(n))) candidatas.add(calle)
      }
    }
    const calle = barajar([...candidatas], azar)[0]
    if (!calle) continue
    const ps = partes.map((p, j) => (j === i ? { ...p, calle } : p))
    if (sePuede(ps, true)) continue
    anadir('conecta', {
      tipo: 'no-conecta',
      partes: ps,
      motivo: `${nombreCorto(calle)} no conecta con ${nombreCorto(despues)}`,
      marcas: [i],
      linea: null,
      calleFalsa: calle,
    })
  }

  // Si se puede, una de cada clase; el resto, de las que no conectan
  const elegidas = []
  falsas.infraccion = [...falsas.infraccion.filter(enMitad), ...falsas.infraccion.filter((o) => !enMitad(o))].slice(0, 1)
  for (const clase of ['infraccion', 'rodeo', 'conecta']) if (falsas[clase].length) elegidas.push(barajar(falsas[clase], azar)[0])
  const resto = [...barajar(falsas.conecta, azar), ...barajar([...falsas.infraccion, ...falsas.rodeo], azar)].filter((o) => !elegidas.includes(o))
  while (elegidas.length < 3 && resto.length) elegidas.push(resto.shift())
  if (elegidas.length < 3) return null

  const buena = { tipo: 'buena', partes, motivo: '', marcas: [], linea: lineaDeRuta(ruta) }
  const opciones = barajar([buena, ...elegidas], azar).map((o) => ({ ...o, texto: textoItinerario(o.partes) }))
  const hasta = destino.clase === 'lugar' ? `${destino.nombre}${destino.detalle ? ` (${destino.detalle})` : ''}` : destino.nombre
  return {
    id: `${parqueId}>${destino.id}`,
    parque,
    destino,
    hasta,
    enunciado: `Desde el ${parque.nombre} hasta ${hasta}: ¿cuál es el mejor itinerario?`,
    ruta,
    partes,
    opciones,
    correcta: opciones.findIndex((o) => o.tipo === 'buena'),
    llegada: buena.linea.at(-1),
  }
}

// El camino bueno calle a calle, para dibujarlo con el nombre de cada una: [{ calle, linea }]
export const lineasDeItinerario = (t) =>
  t.partes.map((p, j) => ({ calle: p.calle, linea: lineaDeRuta({ pasos: t.ruta.pasos.slice(p.desde, t.partes[j + 1]?.desde) }) }))

// Las líneas de una calle (todos sus tramos), para enseñar dónde está la que no conecta
export const lineasDeCalle = (base, calle) => (base.tramosDe.get(calle) ?? []).map((t) => t.linea)

// Explicación de la respuesta: la buena y qué tiene de malo cada falsa
// Un motivo dentro de una frase: "Va en contra..." → "va en contra...", pero "C/ Ovidio no conecta..." se queda igual
export const motivoEnFrase = (motivo) => (/^(Va|Hace|Se|Por) /.test(motivo) ? `${motivo[0].toLowerCase()}${motivo.slice(1)}` : motivo)

export function explicarTrayecto(t) {
  const buena = t.opciones[t.correcta]
  const falsas = t.opciones.filter((o) => o.tipo !== 'buena').map((o) => motivoEnFrase(o.motivo))
  return `El mejor camino (${buena.partes.length} calles) mide ${textoKm(t.ruta.metros)}. En las otras: ${falsas.join('; ')}.`
}

// Hacia dónde queda un punto desde otro: "al norte", "al sureste"...
const RUMBOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
export function haciaDonde(desde, hasta) {
  const grados = (Math.atan2((hasta[0] - desde[0]) * M_LON, (hasta[1] - desde[1]) * M_LAT) * 180) / Math.PI
  return { metros: distancia(desde, hasta), rumbo: `al ${RUMBOS[Math.round(((grados + 360) % 360) / 45) % 8]}` }
}

// Un trozo de calle desde un cruce para dibujarlo: el tramo por el que se sale y los que siguen por la misma calle,
// hasta unos 150 m
function trozoDeCalle(red, salida) {
  const linea = salida.aFavor ? [...salida.tramo.linea] : [...salida.tramo.linea].reverse()
  let metros = salida.tramo.m
  let paso = salida
  while (metros < 150) {
    const sig = salidasDe(red, paso.hacia).find((s) => s.tramo !== paso.tramo && s.tramo.nombre === salida.tramo.nombre && Math.abs(giroEntre(paso, s)) < 60)
    if (!sig) break
    linea.push(...(sig.aFavor ? sig.tramo.linea : [...sig.tramo.linea].reverse()).slice(1))
    metros += sig.tramo.m
    paso = sig
  }
  return linea
}

// Los cruces del juego «Paso a paso»: en cada cambio de calle del camino bueno, por qué calles se puede seguir.
// Devuelve [{ punto, hecho, calle, opciones: [{ texto, calle, tipo, motivo, linea }], buena }], donde "hecho" es la
// línea del camino hasta el cruce y "tipo" es buena, otra (se puede, pero no es el mejor camino), contra o
// prohibido. Solo los cruces con dos opciones o más; las calles con el sentido por revisar no salen.
export function crucesPasoAPaso(base, trayecto) {
  const { red } = base
  const { ruta, partes } = trayecto
  const cruces = []
  for (let j = 1; j < partes.length; j++) {
    const i = partes[j].desde
    const llega = ruta.pasos[i - 1]
    const sigue = ruta.pasos[i]
    const sentidoDe = (s) => {
      const g = giroEntre(llega, s)
      return Math.abs(g) <= 35 ? 'recto' : g > 0 ? 'derecha' : 'izquierda'
    }
    // Las salidas del cruce agrupadas por calle y hacia dónde se gira (sin dar la vuelta ni calles sin nombre)
    const grupos = new Map()
    for (const s of salidasDe(red, llega.hacia)) {
      if (s.tramo === llega.tramo || !s.tramo.nombre || Math.abs(giroEntre(llega, s)) > 150) continue
      const clave = `${s.tramo.nombre}|${sentidoDe(s)}`
      if (!grupos.has(clave)) grupos.set(clave, [])
      grupos.get(clave).push(s)
    }
    const claveBuena = `${sigue.tramo.nombre}|${sentidoDe(sigue)}`
    const actual = partes[j - 1].calle
    const opciones = []
    for (const [clave, salidas] of grupos) {
      const [calle, hacia] = clave.split('|')
      const permitida = salidas.find((s) => !s.contra && !s.tramo.dudoso && !esProhibido(red, llega, s))
      let tipo
      let motivo
      if (clave === claveBuena) [tipo, motivo] = ['buena', '']
      else if (permitida) [tipo, motivo] = ['otra', `Por ${nombreCorto(calle)} se puede, pero no es el mejor camino`]
      else if (salidas.some((s) => s.tramo.dudoso)) continue // no se sabe si se puede
      else if (salidas.some((s) => !s.contra)) [tipo, motivo] = ['prohibido', `Desde ${nombreCorto(actual)} no se puede girar a ${nombreCorto(calle)}: está prohibido`]
      else [tipo, motivo] = ['contra', `${nombreCorto(calle)} es de sentido único: por ahí irías en contra dirección`]
      const texto =
        calle === actual && hacia === 'recto'
          ? `Seguir por ${nombreCorto(calle)}`
          : hacia === 'recto'
            ? `Recto por ${nombreCorto(calle)}`
            : `A la ${hacia} por ${nombreCorto(calle)}`
      opciones.push({ texto, calle, hacia, tipo, motivo, linea: trozoDeCalle(red, permitida ?? salidas[0]) })
    }
    if (opciones.length < 2 || !opciones.some((o) => o.tipo === 'buena')) continue
    // De izquierda a derecha, como se ven al llegar al cruce
    const orden = { izquierda: 0, recto: 1, derecha: 2 }
    opciones.sort((a, b) => orden[a.hacia] - orden[b.hacia])
    cruces.push({
      punto: red.nodos[llega.hacia],
      hecho: lineaDeRuta({ pasos: ruta.pasos.slice(0, i) }),
      calle: actual,
      opciones,
      buena: opciones.findIndex((o) => o.tipo === 'buena'),
    })
  }
  return cruces
}

// ---------------------------------------------------------------------------------------------------------------
// Dibujar un trayecto (paso 3.4): desde un parque, se toca en el mapa la calle por la que se sigue y hasta dónde, y
// el camino avanza por esa calle hasta allí, calle a calle. Al llegar se compara con el mejor camino.

// Un trayecto para dibujar, con el mejor camino para compararlo al final; null si no hay camino sin tramos dudosos
// o es demasiado corto
export function trayectoParaDibujar(base, parqueId, destino) {
  const parque = PARQUES.find((p) => p.id === parqueId)
  const origen = base.salidas[parqueId]
  const fin = puntoDestino(base, destino)
  if (!origen || !fin || (fin.calle && origen.tramo.nombre === fin.calle)) return null
  const ruta = calcularRuta(base.red, origen, fin, { sinDudosos: true })
  if (!ruta) return null
  const partes = itinerario(ruta)
  if (partes.length < 3) return null
  const linea = lineaDeRuta(ruta)
  const hasta = destino.clase === 'lugar' ? `${destino.nombre}${destino.detalle ? ` (${destino.detalle})` : ''}` : destino.nombre
  return { id: `${parqueId}>${destino.id}`, parque, destino, hasta, origen, fin, ruta, partes, linea, llegada: linea.at(-1) }
}

// Metros en línea recta desde un parque hasta un destino (para elegir trayectos cortos o largos)
export function metrosHastaDestino(base, parqueId, destino) {
  const origen = base.salidas[parqueId]
  if (!origen) return Infinity
  const desde = origen.tramo.linea[0]
  if (destino.clase === 'lugar') return distancia(desde, destino.lugar.punto)
  const tramos = base.tramosDe.get(destino.nombre) ?? []
  return tramos.length ? Math.min(...tramos.map((t) => distancia(desde, t.linea[Math.floor(t.linea.length / 2)]))) : Infinity
}

// Un paso por un tramo en un sentido, con la parte que se recorre ([desde, hasta], medida en el sentido de la marcha)
const pasoPor = (tramo, aFavor, trozo = [0, 1]) => ({
  tramo,
  aFavor,
  hacia: aFavor ? tramo.b : tramo.a,
  contra: aFavor ? tramo.s === 'r' : tramo.s === 'd',
  trozo,
  metros: tramo.m * Math.max(0, trozo[1] - trozo[0]),
})
const metrosDe = (pasos) => pasos.reduce((s, p) => s + p.metros, 0)

// Metros de un punto a una línea, y si el punto más cercano cae a lo largo de la línea ("enfrente") y no en uno de
// sus extremos
function metrosALinea(p, l) {
  let mejor = { metros: Infinity, enfrente: false }
  for (let i = 1; i < l.length; i++) {
    const [ax, ay] = [(l[i - 1][0] - p[0]) * M_LON, (l[i - 1][1] - p[1]) * M_LAT]
    const [dx, dy] = [(l[i][0] - l[i - 1][0]) * M_LON, (l[i][1] - l[i - 1][1]) * M_LAT]
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
    const metros = Math.hypot(ax + t * dx, ay + t * dy)
    const enExtremo = (i === 1 && t === 0) || (i === l.length - 1 && t === 1)
    if (metros < mejor.metros) mejor = { metros, enfrente: !enExtremo }
  }
  return mejor
}

// El tramo de la red que se ha tocado, si está a menos de `maxMetros` del dedo: { tramo, f, metros, cerca }.
// "cerca": los tramos de la misma calle que pasan justo enfrente a pocos metros (la otra calzada de una avenida), para
// que dé igual cuál de las dos se toque. Los que siguen a continuación del tocado no cuentan: su punto más cercano es
// su extremo.
export function tramoTocado(base, punto, maxMetros) {
  const p = puntoEnRed(base.red, punto)
  if (!p || p.metros > maxMetros) return null
  const cerca = p.tramo.nombre
    ? (base.tramosDe.get(p.tramo.nombre) ?? []).filter((t) => {
        const m = metrosALinea(punto, t.linea)
        return m.enfrente && m.metros <= p.metros + 30
      })
    : []
  return { ...p, cerca: [...new Set([p.tramo, ...cerca])] }
}

// Por las calles de `nombres` (y los trocitos sin nombre que las unen), el camino más corto desde donde se llega (`ultimo`,
// el último paso) hasta el final de un tramo de esa calle. Se supone que se conduce bien: ir en contra dirección o
// hacer un giro prohibido cuesta muchísimo, así que solo se hace si por esa calle no hay otra forma de llegar
// (y entonces se marca como fallo al corregir).
const MULTA = 100000
function caminoPorCalle(red, ultimo, objetivos, nombres) {
  const vale = (t) => !t.nombre || nombres.has(t.nombre)
  const clave = (p) => p.tramo.i * 2 + (p.aFavor ? 1 : 0)
  const mejor = new Map()
  const previo = new Map()
  const cola = crearCola()
  const probar = (antes, s, coste) => {
    if (!vale(s.tramo) || s.tramo === antes.tramo) return
    const p = pasoPor(s.tramo, s.aFavor)
    const c = coste + p.metros + (p.contra ? MULTA : 0) + (esProhibido(red, antes, s) ? MULTA : 0)
    if (mejor.has(clave(p)) && mejor.get(clave(p)) <= c) return
    mejor.set(clave(p), c)
    previo.set(clave(p), antes === ultimo ? null : antes)
    cola.poner(c, p)
  }
  for (const s of salidasDe(red, ultimo.hacia)) probar(ultimo, s, 0)
  while (!cola.vacia) {
    const { coste, dato: p } = cola.sacar()
    if (coste > mejor.get(clave(p))) continue
    if (objetivos.has(p.tramo)) {
      const pasos = [p]
      for (let a = previo.get(clave(p)); a; a = previo.get(clave(a))) pasos.unshift(a)
      return pasos
    }
    for (const s of salidasDe(red, p.hacia)) probar(p, s, coste)
  }
  return null
}

// Corta el camino donde se llega al destino: en el punto del lugar, o al entrar en la calle
function cortarEnDestino(t, pasos) {
  for (let i = 0; i < pasos.length; i++) {
    const p = pasos[i]
    if (t.fin.calle ? p.tramo.nombre === t.fin.calle : p.tramo === t.fin.tramo) {
      const hasta = t.fin.calle ? p.trozo[0] : Math.max(p.trozo[0], p.aFavor ? t.fin.f : 1 - t.fin.f)
      return { pasos: [...pasos.slice(0, i), pasoPor(p.tramo, p.aFavor, [p.trozo[0], hasta])], llegado: true }
    }
  }
  return { pasos, llegado: false }
}

// Avanza el dibujo hasta el tramo tocado (de `tramoTocado`), por la calle de ese tramo. `pasos`: lo dibujado hasta
// ahora. Devuelve { pasos: los nuevos, llegado, recortar } o { error } si esa calle no sale de donde se está.
// "recortar": cuántos pasos del final de lo dibujado hay que quitar antes de añadir los nuevos. Es por si alguien se
// pasa del cruce donde quería girar: si la calle tocada cruza la calle por la que acaba de ir, se vuelve a ese cruce.
export function avanzarDibujo(base, t, pasos, tocado) {
  const r = avanzarDesde(base, t, pasos, tocado)
  if (!r.error || !pasos.length || tocado.tramo === pasos.at(-1).tramo) return r
  const calle = pasos.at(-1).tramo.nombre
  for (let recortar = 1; recortar < pasos.length && recortar <= 12; recortar++) {
    const quitado = pasos.at(-recortar)
    if (quitado.tramo.nombre && quitado.tramo.nombre !== calle) break // solo hacia atrás por la misma calle
    const otra = avanzarDesde(base, t, pasos.slice(0, -recortar), tocado)
    if (!otra.error) return { ...otra, recortar }
  }
  return r
}

function avanzarDesde(base, t, pasos, tocado) {
  const objetivo = tocado.tramo
  const { origen } = t
  // Al empezar, por el tramo del parque: hacia donde se ha tocado, o hasta uno de sus dos extremos
  if (!pasos.length && objetivo === origen.tramo) {
    const aFavor = tocado.f >= origen.f
    return cortarEnDestino(t, [pasoPor(objetivo, aFavor, [aFavor ? origen.f : 1 - origen.f, 1])])
  }
  const desde = pasos.length
    ? [{ antes: [], ultimo: pasos.at(-1) }]
    : [true, false].map((aFavor) => {
        const p = pasoPor(origen.tramo, aFavor, [aFavor ? origen.f : 1 - origen.f, 1])
        return { antes: [p], ultimo: p }
      })
  if (pasos.length && objetivo === pasos.at(-1).tramo) return { error: 'Ya has llegado ahí. Toca la calle por la que sigues.' }
  // Si se puede, sin ir en contra dirección ni hacer giros prohibidos; entre los que valen, el más corto
  const multas = (ps) => ps.filter((p, i) => p.contra || (i && esProhibido(base.red, ps[i - 1], p))).length
  const hasta = (objetivos) => {
    let mejor = null
    for (const { antes, ultimo } of desde) {
      // Un trocito sin nombre (un enlace, por ejemplo) se alcanza por cualquiera de las calles que salen de aquí
      const nombres = new Set(objetivo.nombre ? [objetivo.nombre] : salidasDe(base.red, ultimo.hacia).map((x) => x.tramo.nombre).filter(Boolean))
      const camino = caminoPorCalle(base.red, ultimo, objetivos, nombres)
      if (!camino) continue
      const todo = [...antes, ...camino]
      if (!mejor || multas(todo) < multas(mejor) || (multas(todo) === multas(mejor) && metrosDe(todo) < metrosDe(mejor))) mejor = todo
    }
    return mejor
  }
  // Al tramo tocado; y si a ese solo se llega mal, a la otra calzada de enfrente (si la hay)
  let mejor = hasta(new Set([objetivo]))
  const otras = (tocado.cerca ?? []).filter((x) => x !== objetivo)
  if (otras.length && (!mejor || multas(mejor) > 0)) {
    const otro = hasta(new Set(otras))
    if (otro && (!mejor || multas(otro) < multas(mejor))) mejor = otro
  }
  if (!mejor) return { error: 'Esa calle no sale de donde estás. Toca una calle que salga de este cruce, o más adelante en la calle por la que vas.' }
  return cortarEnDestino(t, mejor)
}

// La corrección de un trayecto dibujado: si se puede ir así (sin ir en contra dirección ni hacer giros prohibidos),
// cuánto más largo es que el mejor y los puntos (100 si es tan corto como el mejor). Los tramos con el sentido por
// revisar no cuentan como fallo.
export function evaluarDibujo(base, t, pasos) {
  const ruta = { pasos }
  const partes = itinerario(ruta)
  const deParte = parteDePaso(partes)
  const errores = []
  const sinRevisar = new Set()
  pasos.forEach((p, i) => {
    const calle = nombreCorto(partes[deParte(i)].calle)
    if (p.contra && p.tramo.dudoso) sinRevisar.add(calle)
    else if (p.contra && !errores.some((e) => e.tipo === 'contra' && e.parte === deParte(i))) {
      errores.push({ tipo: 'contra', parte: deParte(i), texto: `Por ${calle} vas en contra dirección` })
    }
    if (i && esProhibido(base.red, pasos[i - 1], p)) {
      const antes = nombreCorto(partes[deParte(i - 1)].calle)
      errores.push({ tipo: 'prohibido', parte: deParte(i), texto: antes === calle ? `En ${calle} das la vuelta donde está prohibido` : `De ${antes} a ${calle} no se puede girar` })
    }
  })
  const metros = Math.round(metrosDe(pasos))
  const mejor = t.ruta.metros
  const vale = errores.length === 0
  const calidad = !vale ? 'mal' : metros <= mejor * 1.03 + 20 ? 'perfecto' : metros <= mejor * 1.25 ? 'bien' : 'rodeo'
  return {
    partes,
    texto: textoItinerario(partes),
    linea: lineaDeRuta(ruta),
    errores,
    sinRevisar: [...sinRevisar],
    metros,
    mejor,
    vale,
    calidad,
    puntos: vale ? Math.round(100 * Math.min(1, (mejor + 20) / Math.max(metros, 1))) : 0,
  }
}

// Los tramos de un camino dibujado en contra dirección (para pintarlos en rojo)
export const lineasEnContra = (pasos) => pasos.filter((p) => p.contra && !p.tramo.dudoso).map((p) => lineaDeRuta({ pasos: [p] }))
