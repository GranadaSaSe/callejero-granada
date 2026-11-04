// Red de calles para calcular trayectos (paso 3.1): cada tramo del callejero por el que se puede circular, con
// su sentido, los cruces que une y los giros prohibidos de OpenStreetMap. Usa los mismos tramos que el resto de
// la app, así que las revisiones del mapa de revisión (paso 1.3) cambian también las rutas. El callejero no trae
// algunas carreteras, enlaces y caminos: esos, y solo esos, se completan con OpenStreetMap.

import { aMetros, cosenoEntre, crearIndice, distancia, distanciaASegmento, longitud, redondear, simplificar } from './geo.mjs'

const clave = ([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`
// Un extremo de calle a menos de estos metros de otra calle es un cruce aunque los datos no los unan: el callejero
// a veces no corta la otra calle ahí. Más lejos suele ser una calle sin salida que termina junto a otra.
const SOLDAR_M = 3
const PEGADOS_M = 0.5
const JUNTOS_M = 1 // dos extremos a menos de esto son el mismo cruce
// Un cruce de OpenStreetMap y uno del callejero son el mismo si están a menos de estos metros
const CRUCE_M = 25
// Metros de calle que se miran desde el cruce para saber de dónde viene o a dónde va, y lo más que puede
// separarse la calle del callejero de la de OpenStreetMap para ser la misma
const MUESTRA_M = 30
const SEPARACION_M = 15
// Una vía de OpenStreetMap "está" en el callejero si al menos la mitad de ella va junto a un tramo (peatonales
// incluidos: si el callejero dice que es peatonal, no se añade por detrás). Las que faltan se enganchan a la calle
// del callejero que tengan a menos de ENGANCHE_M.
const CUBIERTO_M = 12
const ENGANCHE_M = 15
const CLASES_CON_COCHE = /^((motorway|trunk|primary|secondary|tertiary)(_link)?|unclassified|residential)$/

// Calles con el paso limitado según OpenStreetMap (zonas de residentes, autobús y taxi, privadas...)
const LIMITADO = new Set(['no', 'private', 'permit', 'destination', 'designated', 'customers', 'delivery'])
export const pasoLimitado = (tags) =>
  LIMITADO.has(tags.motor_vehicle ?? tags.vehicle ?? tags.access) || tags.psv === 'yes' || tags.bus === 'designated'
// OpenStreetMap las marca así, pero en los trayectos se pasa por ellas sin ninguna limitación (lo ha confirmado la
// persona). Puerta Real va con ellas porque las une: sus giros «excepto autobús» tampoco cuentan. Antonio Dalmases es
// una calle con portales y en ella está el Parque Sur: de ahí salen todos sus trayectos.
const SIN_LIMITE = new Set([
  'Calle Gran Vía de Colón',
  'Calle Reyes Católicos',
  'Calle Recogidas',
  'Calle Puerta Real de España',
  'Calle Antonio Dalmases',
])
// Gran Vía es una calle normal: se puede girar en cualquier cruce (también lo ha confirmado la persona). Lo único que
// se mantiene es no dar la vuelta.
const GRAN_VIA = new Set(['Calle Gran Vía de Colón', 'Gran Vía de Colón'])
// Nivel de la calle: las que pasan por encima o por debajo no se cruzan
export const nivelDeVia = (tags) => Number(tags.layer) || (tags.bridge ? 1 : tags.tunnel ? -1 : 0)

// Añade un segmento a un índice en trozos cortos: el índice lo busca por su centro y uno largo no se encontraría
export function anadirSegmento(indice, a, b, dato) {
  const trozos = Math.ceil(distancia(a, b) / 30) || 1
  const entre = (f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  for (let i = 0; i < trozos; i++) indice.anadir(entre(i / trozos), entre((i + 1) / trozos), dato)
}

// El punto del segmento [a, b] más cercano a p
function proyectar(p, a, b) {
  const [px, py] = aMetros(p)
  const [ax, ay] = aMetros(a)
  const [bx, by] = aMetros(b)
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

// Vías de OpenStreetMap que no están en el callejero, partidas de cruce a cruce y enganchadas a sus calles
function viasQueFaltan(tramos, conCoche, viasOsm, importanciaDeClase) {
  const todos = crearIndice(40)
  for (const t of tramos) for (let i = 1; i < t.linea.length; i++) anadirSegmento(todos, t.linea[i - 1], t.linea[i], t)
  const coche = crearIndice(40)
  for (const t of conCoche) for (let i = 1; i < t.linea.length; i++) anadirSegmento(coche, t.linea[i - 1], t.linea[i], t)
  const vias = viasOsm.filter((w) => CLASES_CON_COCHE.test(w.tags.highway) && !pasoLimitado(w.tags))
  const uso = new Map()
  for (const w of vias) {
    w.nodes.forEach((n, i) => uso.set(n, (uso.get(n) ?? 0) + (i === 0 || i === w.nodes.length - 1 ? 2 : 1)))
  }
  const estaEnElCallejero = (linea) => {
    let total = 0
    let dentro = 0
    for (let j = 1; j < linea.length; j++) {
      const [a, b] = [linea[j - 1], linea[j]]
      const veces = Math.max(1, Math.round(distancia(a, b) / 10))
      for (let k = 0; k < veces; k++) {
        const f = (k + 0.5) / veces
        const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
        total++
        if (todos.cercanos(p).some((c) => distanciaASegmento(p, c.a, c.b) < CUBIERTO_M && Math.abs(cosenoEntre([a, b], [c.a, c.b])) > 0.6)) dentro++
      }
    }
    return dentro / total >= 0.5
  }
  // Primero se ve qué trozos faltan y, en cada punto, si llega alguno que sí está en el callejero
  const faltan = []
  const conCalle = new Set()
  for (const w of vias) {
    const puntos = w.geometry.map((p) => [p.lon, p.lat])
    let ini = 0
    for (let i = 1; i < puntos.length; i++) {
      if (i < puntos.length - 1 && uso.get(w.nodes[i]) < 2) continue
      const linea = puntos.slice(ini, i + 1)
      if (estaEnElCallejero(linea)) conCalle.add(w.nodes[ini]).add(w.nodes[i])
      else faltan.push({ w, linea, nodoA: w.nodes[ini], nodoB: w.nodes[i] })
      ini = i
    }
  }
  const enganche = (p) => {
    let mejor = null
    for (const c of coche.cercanos(p)) {
      const d = distanciaASegmento(p, c.a, c.b)
      if (d < ENGANCHE_M && (!mejor || d < mejor.d)) mejor = { d, punto: proyectar(p, c.a, c.b) }
    }
    return mejor?.punto
  }
  return faltan.map(({ w, linea, nodoA, nodoB }) => {
    // Solo se engancha donde OpenStreetMap dice que hay un cruce con una calle del callejero
    const inicio = conCalle.has(nodoA) ? enganche(linea[0]) : null
    const fin = conCalle.has(nodoB) ? enganche(linea.at(-1)) : null
    const t = w.tags
    const unico = ['yes', '1', 'true'].includes(t.oneway) || (t.junction === 'roundabout' && t.oneway !== 'no')
    return {
      id: `osm${w.id}`,
      via: null,
      nombreOsm: t.name ?? null,
      deOsm: true,
      linea: [...(inicio ? [inicio] : []), ...linea, ...(fin ? [fin] : [])],
      sentido: unico ? 'directo' : t.oneway === '-1' ? 'inverso' : 'doble',
      clase: t.highway,
      importancia: importanciaDeClase(t.highway),
      limitado: false,
      dudoso: false,
      nivel: nivelDeVia(t),
    }
  })
}

// Parte cada tramo donde otra calle termina encima de él sin estar unida
function soldarCruces(tramos) {
  const indice = crearIndice(40)
  const puntos = new Map()
  for (const t of tramos) {
    for (let i = 1; i < t.linea.length; i++) anadirSegmento(indice, t.linea[i - 1], t.linea[i], { tramo: t, i })
    for (const p of [t.linea[0], t.linea.at(-1)]) {
      const k = clave(p)
      if (!puntos.has(k)) puntos.set(k, { p, tramos: [] })
      puntos.get(k).tramos.push(t)
    }
  }
  const cortes = new Map()
  // Dos extremos muy juntos son el mismo cruce: "alias" dice con cuál se queda cada uno
  const alias = new Map()
  const final = (k) => {
    while (alias.has(k)) k = alias.get(k)
    return k
  }
  // Si dos tramos de la misma calle acaban a un paso uno de otro y una tercera pasa por allí, cada uno cortaría a esa
  // tercera en un punto distinto y quedaría entre ellos un trocito: si fuera de sentido único, cortaría la calle
  const indicePuntos = crearIndice(10)
  for (const { p } of puntos.values()) indicePuntos.anadir(p, p, p)
  for (const { p } of puntos.values()) {
    for (const c of indicePuntos.cercanos(p)) {
      if (distancia(c.a, p) < JUNTOS_M && final(clave(p)) !== final(clave(c.a))) alias.set(final(clave(p)), final(clave(c.a)))
    }
  }
  let soldados = 0
  for (const { p, tramos: suyos } of puntos.values()) {
    // Solo los extremos sueltos: los demás ya son un cruce (las vías añadidas aún no están unidas al callejero)
    if (suyos.length > 1 && !suyos.every((t) => t.deOsm)) continue
    const suelto = suyos[0]
    let mejor = null
    for (const c of indice.cercanos(p)) {
      const otro = c.dato.tramo
      if (suyos.includes(otro) || [otro.linea[0], otro.linea.at(-1)].some((f) => final(clave(f)) === final(clave(p)))) continue
      const d = distanciaASegmento(p, c.a, c.b)
      // Si se tocan de verdad da igual lo que diga el nivel: una rampa llega a la autovía aunque esté en un puente
      if (d >= PEGADOS_M && c.dato.tramo.nivel !== suelto.nivel) continue
      if (d < SOLDAR_M && (!mejor || d < mejor.d)) mejor = { d, ...c.dato }
    }
    if (!mejor) continue
    soldados++
    const extremo = [mejor.tramo.linea[0], mejor.tramo.linea.at(-1)].find((f) => distancia(f, p) < SOLDAR_M)
    if (extremo) {
      if (final(clave(p)) !== final(clave(extremo))) alias.set(final(clave(p)), final(clave(extremo)))
      continue
    }
    if (!cortes.has(mejor.tramo)) cortes.set(mejor.tramo, [])
    cortes.get(mejor.tramo).push({ i: mejor.i, p })
  }
  const piezas = []
  for (const t of tramos) {
    const suyos = cortes.get(t)
    if (!suyos) {
      piezas.push({ ...t, linea: t.linea })
      continue
    }
    // Se añaden los puntos de corte a la línea y se parte por ellos
    suyos.sort((x, y) => x.i - y.i || distancia(t.linea[x.i - 1], x.p) - distancia(t.linea[y.i - 1], y.p))
    let actual = [t.linea[0]]
    let siguiente = 0
    for (let i = 1; i < t.linea.length; i++) {
      while (siguiente < suyos.length && suyos[siguiente].i === i) {
        const corte = suyos[siguiente++].p
        if (clave(actual[0]) === clave(corte)) continue
        actual.push(corte)
        piezas.push({ ...t, linea: actual })
        actual = [corte]
      }
      actual.push(t.linea[i])
    }
    piezas.push({ ...t, linea: actual })
  }
  return { piezas: piezas.filter((t) => longitud(t.linea) > 0), soldados, final }
}

// El punto a unos metros del principio de una línea
function puntoEn(linea, metros) {
  let s = 0
  for (let i = 1; i < linea.length; i++) {
    const d = distancia(linea[i - 1], linea[i])
    if (s + d >= metros && d > 0) {
      const f = (metros - s) / d
      return [linea[i - 1][0] + (linea[i][0] - linea[i - 1][0]) * f, linea[i - 1][1] + (linea[i][1] - linea[i - 1][1]) * f]
    }
    s += d
  }
  return linea.at(-1)
}

// Metros de media entre un brazo de un cruce del callejero y una línea de OpenStreetMap que sale del mismo cruce
function separacion(brazo, linea) {
  const largo = Math.min(longitud(brazo), longitud(linea), MUESTRA_M)
  let suma = 0
  for (const parte of [1 / 3, 2 / 3, 1]) {
    const p = puntoEn(brazo, largo * parte)
    let menor = Infinity
    for (let i = 1; i < linea.length; i++) menor = Math.min(menor, distanciaASegmento(p, linea[i - 1], linea[i]))
    suma += menor
  }
  return suma / 3
}

// Une los giros prohibidos de OpenStreetMap (de una vía a otra por un punto) con los tramos del callejero.
// Cada uno es una pareja de direcciones: [tramo por el que se llega, tramo por el que se sale].
function girosProhibidos(restricciones, viasOsm, aristas, nodos) {
  const porId = new Map(viasOsm.map((w) => [w.id, w]))
  const indiceNodos = crearIndice(60)
  nodos.forEach((p, i) => indiceNodos.anadir(p, p, i))
  const salientes = new Map()
  aristas.forEach((e, i) => {
    for (const [nodo, linea] of [[e.a, e.linea], [e.b, [...e.linea].reverse()]]) {
      if (!salientes.has(nodo)) salientes.set(nodo, [])
      salientes.get(nodo).push({ arista: i, linea, puedeSalir: nodo === e.a ? e.s !== 'r' : e.s !== 'd', puedeLlegar: nodo === e.a ? e.s !== 'd' : e.s !== 'r' })
    }
  })

  // Las líneas de una vía de OpenStreetMap que salen del punto "via" (dos si la vía sigue después de él)
  const lineasDesde = (via, ref) => {
    const i = via.nodes.indexOf(ref)
    if (i === -1) return null
    const puntos = via.geometry.map((p) => [p.lon, p.lat])
    return [puntos.slice(0, i + 1).reverse(), puntos.slice(i)].filter((l) => l.length > 1)
  }
  // El brazo del cruce que va por la misma línea
  const brazoDe = (lineas, brazos) => {
    let mejor = null
    for (const b of brazos) {
      for (const l of lineas) {
        const sep = separacion(b.linea, l)
        if (sep < SEPARACION_M && (!mejor || sep < mejor.sep)) mejor = { ...b, sep }
      }
    }
    return mejor
  }

  const prohibidos = new Set()
  const cuenta = { total: restricciones.length, aplicados: 0, viaCalle: 0, fuera: 0, sinCruce: 0, sinBrazo: 0, quitados: 0 }
  for (const r of restricciones) {
    const via = r.members.filter((m) => m.role === 'via')
    if (via.length !== 1 || via[0].type !== 'node') {
      cuenta.viaCalle++ // el giro pasa por una calle entera: muy pocos y no se pueden aplicar con este modelo
      continue
    }
    const desde = porId.get(r.members.find((m) => m.role === 'from')?.ref)
    const hasta = porId.get(r.members.find((m) => m.role === 'to')?.ref)
    const tocaEn = (calles) => calles.has(desde?.tags.name) || calles.has(hasta?.tags.name)
    if ((r.tags.except && tocaEn(SIN_LIMITE)) || (r.tags.restriction !== 'no_u_turn' && tocaEn(GRAN_VIA))) {
      cuenta.quitados++
      continue
    }
    const lineasDe = desde && lineasDesde(desde, via[0].ref)
    const lineasA = hasta && lineasDesde(hasta, via[0].ref)
    if (!lineasDe?.length || !lineasA?.length) {
      cuenta.fuera++
      continue
    }
    // De los cruces cercanos, el que tiene los dos brazos más parecidos a las dos vías
    const punto = lineasDe[0][0]
    const cercanos = indiceNodos.cercanos(punto).filter((c) => salientes.has(c.dato) && distancia(c.a, punto) < CRUCE_M)
    if (!cercanos.length) {
      cuenta.sinCruce++
      continue
    }
    let mejor = null
    for (const c of cercanos) {
      const brazos = salientes.get(c.dato)
      const llega = brazoDe(lineasDe, brazos.filter((b) => b.puedeLlegar))
      const sale = brazoDe(lineasA, brazos.filter((b) => b.puedeSalir))
      if (!llega || !sale) continue
      const nota = llega.sep + sale.sep + distancia(c.a, punto)
      if (!mejor || nota < mejor.nota) mejor = { nota, llega, sale, nodo: c.dato }
    }
    if (!mejor) {
      cuenta.sinBrazo++
      continue
    }
    const { llega, sale, nodo } = mejor
    if ((r.tags.restriction ?? '').startsWith('no_')) prohibidos.add(`${llega.arista},${nodo},${sale.arista}`)
    else {
      for (const b of salientes.get(nodo)) {
        if (b.puedeSalir && b.arista !== sale.arista && b.arista !== llega.arista) prohibidos.add(`${llega.arista},${nodo},${b.arista}`)
      }
    }
    cuenta.aplicados++
  }
  return { prohibidos: [...prohibidos].map((x) => x.split(',').map(Number)), cuenta }
}

// Trozos de la red desde los que se puede ir a cualquier otro punto del mismo trozo respetando los sentidos.
// Devuelve el número de trozo de cada cruce (0 = el mayor) y sus tamaños.
function trozosConectados(nodos, aristas) {
  const ida = nodos.map(() => [])
  const vuelta = nodos.map(() => [])
  for (const e of aristas) {
    if (e.s !== 'r') ida[e.a].push(e.b), vuelta[e.b].push(e.a)
    if (e.s !== 'd') ida[e.b].push(e.a), vuelta[e.a].push(e.b)
  }
  const orden = []
  const visto = new Set()
  for (let ini = 0; ini < nodos.length; ini++) {
    if (visto.has(ini)) continue
    visto.add(ini)
    const pila = [[ini, 0]]
    while (pila.length) {
      const top = pila.at(-1)
      const vecinos = ida[top[0]]
      if (top[1] < vecinos.length) {
        const v = vecinos[top[1]++]
        if (!visto.has(v)) visto.add(v), pila.push([v, 0])
      } else {
        orden.push(top[0])
        pila.pop()
      }
    }
  }
  const grupo = new Array(nodos.length).fill(-1)
  const tamanos = []
  for (const ini of orden.reverse()) {
    if (grupo[ini] !== -1) continue
    const n = tamanos.length
    let cuantos = 0
    const pila = [ini]
    grupo[ini] = n
    while (pila.length) {
      const x = pila.pop()
      cuantos++
      for (const v of vuelta[x]) if (grupo[v] === -1) (grupo[v] = n), pila.push(v)
    }
    tamanos.push(cuantos)
  }
  const orden2 = tamanos.map((t, i) => [t, i]).sort((x, y) => y[0] - x[0])
  const nuevo = new Map(orden2.map(([, i], j) => [i, j]))
  return { grupo: grupo.map((g) => nuevo.get(g)), tamanos: orden2.map(([t]) => t) }
}

// Crea la red. `tramos`: los del callejero con su sentido (directo, inverso, doble, peatonal, desconocido).
// "s" de cada arista: "d" = solo de a a b, "r" = solo de b a a, "x" = en los dos sentidos.
// Un tramo dudoso por revisar entra con lo que diga la mejor fuente y marcado (`dudoso`). Si una fuente dice
// peatonal y la otra que pasan coches, entra con lo que digan los coches: quien pregunte evitará los dudosos.
export function crearRed({ tramos, viasOsm, restricciones, nombreDe, importanciaDeClase }) {
  const sentidoDe = (t) => {
    if (t.sentido !== 'peatonal') return t.sentido
    return t.dudoso && t.osm && t.osm !== 'peatonal' ? t.osm : 'peatonal'
  }
  const conCoche = tramos.filter((t) => sentidoDe(t) !== 'peatonal')
  const anadidas = viasQueFaltan(tramos, conCoche, viasOsm, importanciaDeClase)
  const { piezas, soldados, final } = soldarCruces([...conCoche, ...anadidas])
  const nombreLimpio = (t) => nombreDe(t.via) ?? (t.nombreOsm && !/[ÃÂ]/.test(t.nombreOsm) ? t.nombreOsm : null)
  const indices = new Map()
  const nodos = []
  const nodo = (p) => {
    const k = final(clave(p))
    if (!indices.has(k)) {
      indices.set(k, nodos.length)
      nodos.push(p)
    }
    return indices.get(k)
  }
  const aristas = piezas.map((t) => {
    const sentido = sentidoDe(t)
    return {
      id: t.id,
      nombre: nombreLimpio(t),
      a: nodo(t.linea[0]),
      b: nodo(t.linea.at(-1)),
      s: sentido === 'directo' ? 'd' : sentido === 'inverso' ? 'r' : 'x',
      m: longitud(t.linea),
      linea: t.linea,
      // Importancia para calcular rutas: 0 = autovía, 1 = vía principal ... 6 = sin clasificar
      importancia: t.clase === 'motorway' ? 0 : /^(trunk|motorway_link|trunk_link)$/.test(t.clase) ? 1 : t.importancia,
      dudoso: t.dudoso || sentido === 'desconocido',
      limitado: t.limitado && !SIN_LIMITE.has(nombreLimpio(t)),
    }
  }).filter((e) => e.a !== e.b || e.m >= SOLDAR_M) // sin los trocitos que quedan entre dos cortes del mismo cruce
  const { prohibidos, cuenta } = girosProhibidos(restricciones, viasOsm, aristas, nodos)
  const { grupo, tamanos } = trozosConectados(nodos, aristas)

  return {
    red: {
      nodos: redondear(nodos, 6),
      // Cada tramo: [id, calle, a, b, sentido, metros, importancia, marcas, línea]. Marcas: 1 = dudoso, 2 = paso limitado
      tramos: aristas.map((e) => [
        e.id,
        e.nombre,
        e.a,
        e.b,
        e.s,
        Math.round(e.m),
        e.importancia,
        (e.dudoso ? 1 : 0) + (e.limitado ? 2 : 0),
        redondear(simplificar(e.linea, 1)).flat(),
      ]),
      prohibidos,
      // Cruces desde los que no se puede ir a todas partes o a los que no se puede llegar: un trayecto no empieza ni acaba en ellos
      aislados: nodos.map((_, i) => i).filter((i) => grupo[i] !== 0),
    },
    informe: {
      tramos: aristas.length,
      cruces: nodos.length,
      soldados,
      anadidas: anadidas.length,
      metrosAnadidos: Math.round(anadidas.reduce((s, t) => s + longitud(t.linea), 0)),
      giros: cuenta,
      dudosos: aristas.filter((e) => e.dudoso).length,
      limitados: aristas.filter((e) => e.limitado).length,
      enElTrozoMayor: tamanos[0],
    },
  }
}
