// Imprimibles (paso 4.3): qué calles llevan número en el mapa mudo de un distrito, dónde va cada número y las filas
// de las fichas de calles y de lugares. El PDF lo crea src/vistas/imprimir.js.
// Este archivo no usa nada del navegador, así que se puede probar con Node.
import { clavesNombre } from '../scripts/lib/nombres.mjs'
import { NO_ES_CALLE } from './preguntas-examen.js'

// Paso aproximado de grados a metros, suficiente dentro de Granada (igual que en scripts/lib/geo.mjs)
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540
const metros = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)
const largo = (linea) => linea.slice(1).reduce((s, p, i) => s + metros(linea[i], p), 0)

// El punto que está a mitad de una línea
export function mitadDe(linea) {
  let falta = largo(linea) / 2
  for (let i = 1; i < linea.length; i++) {
    const tramo = metros(linea[i - 1], linea[i])
    if (tramo >= falta && tramo > 0) {
      const f = falta / tramo
      return [linea[i - 1][0] + f * (linea[i][0] - linea[i - 1][0]), linea[i - 1][1] + f * (linea[i][1] - linea[i - 1][1])]
    }
    falta -= tramo
  }
  return linea.at(-1)
}

// Orden alfabético como en un índice: por el nombre sin el tipo de vía ni los artículos
const claveIndice = (nombre) => clavesNombre(nombre).at(-1)
export const porNombre = (a, b) => claveIndice(a.nombre).localeCompare(claveIndice(b.nombre), 'es') || a.nombre.localeCompare(b.nombre, 'es')

// Calles de una zona ('Todos' = toda Granada) hasta una importancia (1 = vía principal ... 6 = peatonal). Una calle es
// de un distrito si empieza en él (como en «Por zonas» de Tu progreso). Las que se llaman igual dentro de la zona son
// una sola. Sin autovías, carreteras, enlaces ni rotondas.
// Devuelve [{ nombre, calles: [calle], lineas, punto (dónde va su número) }], por orden alfabético.
export function callesDeLaZona({ calles, tramos }, { zona, maximo }) {
  const lineasDe = new Map()
  for (const f of tramos.features) {
    if (!lineasDe.has(f.properties.via)) lineasDe.set(f.properties.via, [])
    lineasDe.get(f.properties.via).push(f.geometry.coordinates)
  }
  const porNombreDeCalle = new Map()
  for (const c of calles) {
    if (c.importancia > maximo || NO_ES_CALLE.has(c.tipo) || !lineasDe.has(c.id)) continue
    if (zona !== 'Todos' && c.distritos[0] !== zona) continue
    if (!porNombreDeCalle.has(c.nombre)) porNombreDeCalle.set(c.nombre, { nombre: c.nombre, calles: [], lineas: [] })
    const grupo = porNombreDeCalle.get(c.nombre)
    grupo.calles.push(c)
    grupo.lineas.push(...lineasDe.get(c.id))
  }
  return [...porNombreDeCalle.values()]
    .map((g) => ({ ...g, punto: mitadDe(g.lineas.reduce((a, b) => (largo(b) > largo(a) ? b : a))) }))
    .sort(porNombre)
}

// Numera de arriba abajo y de izquierda a derecha, por franjas (como se lee): "puestos" son [{ x, y }] en píxeles
// del mapa. Devuelve los índices en orden.
export function ordenDeLectura(puestos, alto = 60) {
  return puestos
    .map((p, i) => ({ i, franja: Math.floor(p.y / alto), x: p.x }))
    .sort((a, b) => a.franja - b.franja || a.x - b.x)
    .map((p) => p.i)
}

// Sentido en pocas palabras, para la ficha
export function sentidoCorto(c) {
  switch (c.sentido) {
    case 'doble':
      return 'Doble sentido'
    case 'peatonal':
      return 'Peatonal'
    case 'hacia el final':
      return c.fin[0] ? `Único, hacia ${c.fin[0]}` : 'Sentido único'
    case 'hacia el inicio':
      return c.inicio[0] ? `Único, hacia ${c.inicio[0]}` : 'Sentido único'
    case 'mixto':
      return 'Según el tramo'
    default:
      return '—'
  }
}

const PARQUE_CORTO = { Norte: 'Norte', Sur: 'Sur', 'límite': 'En la línea', 'los dos': 'Norte y Sur' }

// Ficha de cada calle: nombre, barrio, de dónde a dónde va, sentido y parque de bomberos
export function filasDeCalles(grupos) {
  return grupos.flatMap((g) =>
    g.calles.map((c) => [
      c.nombre,
      c.barrios.join(', '),
      c.inicio[0] && c.fin[0] ? `De ${c.inicio[0]} a ${c.fin[0]}` : c.inicio[0] || c.fin[0] ? `Desde ${c.inicio[0] ?? c.fin[0]}` : '—',
      sentidoCorto(c),
      PARQUE_CORTO[c.parque] ?? '—',
    ]),
  )
}

// Ficha de cada lugar de interés de la zona: nombre, tipo, dirección, barrio y parque. Por tipo y nombre.
export function filasDeLugares(lugares, zona) {
  return lugares
    .filter((l) => l.categoria !== 'Plazas' && (zona === 'Todos' || l.distrito === zona))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es'))
    .map((l) => [l.nombre, l.categoria, l.direccion ?? '—', l.barrio ?? '—', PARQUE_CORTO[l.parque] ?? '—'])
}
