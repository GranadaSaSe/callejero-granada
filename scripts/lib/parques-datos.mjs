// Qué parque de bomberos atiende cada sitio de la ciudad: al norte de la línea de CALLES_LIMITE, el Parque
// Norte; al sur, el Parque Sur. La línea se saca de los tramos de esas calles, en orden, uniendo los huecos
// entre una calle y la siguiente (por ejemplo, de Camino de Camaura a Méndez Núñez) por lo más corto.
//
// La línea del PDF empieza en Camino de Camaura y acaba en Camino Viejo del Fargue; para los sitios que quedan
// más allá de sus puntas se alarga en la misma dirección. Si el lado de un sitio cambia al alargarla torciendo
// 45° a un lado o al otro, depende de esa prolongación y se marca como "aproximado": sale en el mapa, pero no
// en las preguntas.
import { distancia, distanciaASegmento, puntoEnAnillo } from './geo.mjs'
import { CALLES_LIMITE } from './parques-limite.mjs'

const AYUNTAMIENTO = [-3.5988, 37.1734]
const PROLONGACION = 8000 // metros que se alarga la línea por cada punta
const M_LON = 88800
const M_LAT = 110540

// lineasDeVia(id) → lista de líneas ([lon, lat][]) de los tramos de esa calle
export function lineaEntreParques(lineasDeVia) {
  const nodos = []
  const indice = new Map()
  const nodo = (p) => {
    const k = `${p[0].toFixed(6)},${p[1].toFixed(6)}`
    if (!indice.has(k)) {
      indice.set(k, nodos.length)
      nodos.push(p)
    }
    return indice.get(k)
  }
  const vecinos = new Map()
  const unir = (a, b, coste) => {
    if (a === b) return
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      if (!vecinos.has(x)) vecinos.set(x, [])
      vecinos.get(x).push([y, coste])
    }
  }
  const extremos = [] // [nodo, vía]
  const lineasPorVia = new Map()
  for (const [via] of CALLES_LIMITE) {
    const lineas = lineasDeVia(via)
    lineasPorVia.set(via, lineas)
    for (const linea of lineas) {
      for (let i = 1; i < linea.length; i++) unir(nodo(linea[i - 1]), nodo(linea[i]), distancia(linea[i - 1], linea[i]))
      extremos.push([nodo(linea[0]), via], [nodo(linea.at(-1)), via])
    }
  }
  // Puentes entre los extremos de tramos que no se tocan (hasta 500 m): cuestan el triple que ir por la calle
  for (let i = 0; i < extremos.length; i++) {
    for (let j = i + 1; j < extremos.length; j++) {
      const d = distancia(nodos[extremos[i][0]], nodos[extremos[j][0]])
      if (d > 0 && d < 500) unir(extremos[i][0], extremos[j][0], d * 3 + 20)
    }
  }
  // De la punta de Camino de Camaura más lejana al Ayuntamiento a la de Camino Viejo del Fargue más lejana
  const puntaLejana = (via) =>
    lineasPorVia
      .get(via)
      .flatMap((l) => [l[0], l.at(-1)])
      .sort((a, b) => distancia(b, AYUNTAMIENTO) - distancia(a, AYUNTAMIENTO))[0]
  const inicio = nodo(puntaLejana(CALLES_LIMITE[0][0]))
  const fin = nodo(puntaLejana(CALLES_LIMITE.at(-1)[0]))

  // Camino más corto (Dijkstra sencillo: son pocos cientos de puntos)
  const coste = new Map([[inicio, 0]])
  const previo = new Map()
  const abiertos = new Set([inicio])
  while (abiertos.size) {
    let actual = null
    for (const n of abiertos) if (actual === null || coste.get(n) < coste.get(actual)) actual = n
    abiertos.delete(actual)
    if (actual === fin) break
    for (const [v, c] of vecinos.get(actual) ?? []) {
      const nuevo = coste.get(actual) + c
      if (!coste.has(v) || nuevo < coste.get(v)) {
        coste.set(v, nuevo)
        previo.set(v, actual)
        abiertos.add(v)
      }
    }
  }
  if (!previo.has(fin)) throw new Error('No se pudo trazar la línea entre los parques')
  const camino = [fin]
  while (camino[0] !== inicio) camino.unshift(previo.get(camino[0]))
  const linea = camino.map((n) => nodos[n])

  // Dirección de cada punta: la de sus últimos 150 m (en radianes, como un ángulo de los de clase)
  const direccion = (puntos) => {
    const punta = puntos[0]
    let atras = puntos[1]
    for (const p of puntos.slice(1)) {
      atras = p
      if (distancia(p, punta) >= 150) break
    }
    return Math.atan2((punta[1] - atras[1]) * M_LAT, (punta[0] - atras[0]) * M_LON)
  }
  return { linea, haciaOeste: direccion(linea), haciaEste: direccion([...linea].reverse()) }
}

const prolongar = (punta, angulo) => [
  punta[0] + (Math.cos(angulo) * PROLONGACION) / M_LON,
  punta[1] + (Math.sin(angulo) * PROLONGACION) / M_LAT,
]

// Polígono del Parque Norte: la línea alargada y, por encima, hasta muy al norte
function poligonoNorte(linea, oeste, este) {
  return [[oeste[0] - 1, oeste[1]], oeste, ...linea, este, [este[0] + 1, este[1]], [este[0] + 1, 39], [oeste[0] - 1, 39]]
}

// Funciones para saber a qué lado cae un punto
export function ladoDeParques({ linea, haciaOeste, haciaEste }) {
  const oeste = prolongar(linea[0], haciaOeste)
  const este = prolongar(linea.at(-1), haciaEste)
  const norte = poligonoNorte(linea, oeste, este)
  // Otras prolongaciones posibles, torciendo 45° cada punta
  const giro = Math.PI / 4
  const otras = [
    [giro, giro],
    [-giro, -giro],
    [giro, -giro],
    [-giro, giro],
  ].map(([a, b]) => poligonoNorte(linea, prolongar(linea[0], haciaOeste + a), prolongar(linea.at(-1), haciaEste + b)))
  const tramos = linea.slice(1).map((p, i) => [linea[i], p])
  const parque = (p) => (puntoEnAnillo(p, norte) ? 'Norte' : 'Sur')
  return {
    oeste,
    este,
    parque,
    // Metros hasta la línea del PDF
    metrosALinea: (p) => Math.min(...tramos.map(([a, b]) => distanciaASegmento(p, a, b))),
    aproximado: (p) => {
      const dentro = puntoEnAnillo(p, norte)
      return otras.some((poligono) => puntoEnAnillo(p, poligono) !== dentro)
    },
  }
}
