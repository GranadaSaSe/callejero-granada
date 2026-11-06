// Lista de calles: todas las calles de Granada para ordenarlas y filtrarlas de muchas formas. Aquí están las
// cuentas; la pantalla está en src/vistas/calles.js. No usa el navegador: se puede probar con Node.
import { normalizar } from './crear.js'

export const ORDENES = [
  { id: 'az', nombre: 'De la A a la Z' },
  { id: 'za', nombre: 'De la Z a la A' },
  { id: 'oeste', nombre: 'De izquierda a derecha (oeste → este)' },
  { id: 'este', nombre: 'De derecha a izquierda (este → oeste)' },
  { id: 'norte', nombre: 'De arriba a abajo (norte → sur)' },
  { id: 'sur', nombre: 'De abajo a arriba (sur → norte)' },
  { id: 'importancia', nombre: 'Las principales primero' },
  { id: 'cruces', nombre: 'Las que cruzan más calles primero' },
  { id: 'fallos', nombre: 'Las que más fallo primero' },
]

export const CIRCULACION = [
  { id: 'todas', nombre: 'Peatonales y no peatonales' },
  { id: 'peatonal', nombre: 'Solo peatonales' },
  { id: 'coches', nombre: 'Sin las peatonales' },
  { id: 'doble', nombre: 'Solo de doble sentido' },
  { id: 'unico', nombre: 'Solo de sentido único' },
  { id: 'mixto', nombre: 'Distinto según el tramo' },
]

// Qué calles salen según su importancia (1 = vía principal ... 6 = peatonal o sin clasificar)
export const IMPORTANCIAS = [
  { id: 'todas', nombre: 'Todas las calles', maximo: 6 },
  { id: 'principales', nombre: 'Solo las principales', maximo: 2 },
  { id: 'medio', nombre: 'Principales y de barrio', maximo: 4 },
]

export const PROGRESOS = [
  { id: 'todas', nombre: 'Lo que sepa de ellas, da igual' },
  { id: 'sinver', nombre: 'Las que no he visto' },
  { id: 'empezada', nombre: 'Las que estoy aprendiendo' },
  { id: 'dominada', nombre: 'Las que domino' },
  { id: 'fallos', nombre: 'Las que he fallado alguna vez' },
]

export const AJUSTES_INICIALES = {
  orden: 'az',
  circulacion: 'todas',
  distrito: 'Todos',
  barrio: 'Todos',
  tipo: 'Todos',
  importancia: 'todas',
  progreso: 'todas',
  soloEjes: false,
  texto: '',
}

// Palabras del principio que no cuentan para ordenar: "Calle de los Juncos" va en la J
const ARTICULOS = /^(de los|de las|de la|del|de|los|las|la|el)\s+/i

// Lo que hace falta de cada calle para ordenarla: su nombre sin el tipo de vía y su centro en el mapa
export function prepararLista(calles, tramos) {
  const caja = new Map()
  for (const f of tramos.features) {
    const via = f.properties.via
    if (!caja.has(via)) caja.set(via, [Infinity, Infinity, -Infinity, -Infinity])
    const c = caja.get(via)
    for (const [x, y] of f.geometry.coordinates) {
      c[0] = Math.min(c[0], x)
      c[1] = Math.min(c[1], y)
      c[2] = Math.max(c[2], x)
      c[3] = Math.max(c[3], y)
    }
  }
  return calles
    .filter((c) => caja.has(c.id))
    .map((c) => {
      const sinTipo = c.nombre.startsWith(`${c.tipo} `) ? c.nombre.slice(c.tipo.length + 1) : c.nombre
      const [oeste, sur, este, norte] = caja.get(c.id)
      return {
        calle: c,
        clave: sinTipo.replace(ARTICULOS, ''),
        buscar: normalizar(c.nombre),
        centro: [(oeste + este) / 2, (sur + norte) / 2],
        caja: [
          [oeste, sur],
          [este, norte],
        ],
      }
    })
}

// Los tipos de vía que hay, de los más a los menos frecuentes: [{ tipo, calles }]
export function tiposDeVia(lista) {
  const cuenta = new Map()
  for (const { calle } of lista) cuenta.set(calle.tipo, (cuenta.get(calle.tipo) ?? 0) + 1)
  return [...cuenta].map(([tipo, calles]) => ({ tipo, calles })).sort((a, b) => b.calles - a.calles || a.tipo.localeCompare(b.tipo, 'es'))
}

const deCirculacion = {
  todas: () => true,
  peatonal: (c) => c.sentido === 'peatonal',
  coches: (c) => c.sentido !== 'peatonal',
  doble: (c) => c.sentido === 'doble',
  unico: (c) => c.sentido === 'hacia el inicio' || c.sentido === 'hacia el final',
  mixto: (c) => c.sentido === 'mixto',
}

const comparar = new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare

// Las calles que cumplen los filtros, en el orden pedido. `progreso`: Map id → { estado, fallos } (de
// progresoDeCalles); `ejes`: Set con los ids de los ejes de esta persona.
export function filtrarYOrdenar(lista, ajustes, { progreso = new Map(), ejes = new Set() } = {}) {
  const a = { ...AJUSTES_INICIALES, ...ajustes }
  const maximo = IMPORTANCIAS.find((i) => i.id === a.importancia)?.maximo ?? 6
  const texto = normalizar(a.texto ?? '')
  const estadoDe = (c) => progreso.get(c.id)?.estado ?? 'sinver'
  const fallosDe = (c) => progreso.get(c.id)?.fallos ?? 0
  const quedan = lista.filter(({ calle: c, buscar }) => {
    if (!(deCirculacion[a.circulacion] ?? deCirculacion.todas)(c)) return false
    if (a.distrito !== 'Todos' && !c.distritos.includes(a.distrito)) return false
    if (a.barrio !== 'Todos' && !c.barrios.includes(a.barrio)) return false
    if (a.tipo !== 'Todos' && c.tipo !== a.tipo) return false
    if (c.importancia > maximo) return false
    if (a.soloEjes && !ejes.has(c.id)) return false
    if (a.progreso === 'fallos' ? fallosDe(c) === 0 : a.progreso !== 'todas' && estadoDe(c) !== a.progreso) return false
    return !texto || buscar.includes(texto)
  })
  const alfabetico = (x, y) => comparar(x.clave, y.clave) || comparar(x.calle.nombre, y.calle.nombre)
  const orden = {
    az: alfabetico,
    za: (x, y) => alfabetico(y, x),
    oeste: (x, y) => x.centro[0] - y.centro[0],
    este: (x, y) => y.centro[0] - x.centro[0],
    norte: (x, y) => y.centro[1] - x.centro[1],
    sur: (x, y) => x.centro[1] - y.centro[1],
    importancia: (x, y) => x.calle.importancia - y.calle.importancia || alfabetico(x, y),
    cruces: (x, y) => y.calle.cruces.length - x.calle.cruces.length || alfabetico(x, y),
    fallos: (x, y) => fallosDe(y.calle) - fallosDe(x.calle) || alfabetico(x, y),
  }[a.orden] ?? alfabetico
  return quedan.sort(orden)
}

// Cómo se circula por una calle, en palabras
export function textoCirculacion(c) {
  const desde = c.inicio[0] ?? 'el principio'
  const hasta = c.fin[0] ?? 'el final'
  return (
    {
      doble: 'Doble sentido',
      peatonal: 'Peatonal',
      'hacia el final': `Sentido único hacia ${hasta}`,
      'hacia el inicio': `Sentido único hacia ${desde}`,
      mixto: 'Sentido distinto según el tramo',
    }[c.sentido] ?? 'Sentido sin datos'
  )
}
