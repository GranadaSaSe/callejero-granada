// "¿Cómo se llama?" (paso 2.3, mapa mudo al revés): opciones parecidas para elegir y comprobación del nombre
// escrito. No usa el navegador: se puede probar con Node.
import { clavesNombre } from '../scripts/lib/nombres.mjs'

export const MODOS_NOMBRE = [
  { id: 'elegir', nombre: 'Elegir entre 4' },
  { id: 'escribir', nombre: 'Escribir el nombre' },
]

// Paso aproximado de grados a metros, suficiente dentro de Granada (igual que en scripts/lib/geo.mjs)
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540
const distancia = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)

// Centro aproximado de una calle (media de sus puntos) o de un lugar
const centros = new WeakMap()
function centro(sitio) {
  if (!centros.has(sitio)) {
    const puntos = [...(sitio.lineas ?? []).flat(), ...(sitio.puntos ?? [])]
    centros.set(sitio, [0, 1].map((i) => puntos.reduce((suma, p) => suma + p[i], 0) / puntos.length))
  }
  return centros.get(sitio)
}

function barajar(lista, azar) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// Cuatro opciones: la buena y tres de las ocho calles (o lugares) más cercanas, que son las que se confunden
export function opcionesCercanas(sitio, lista, azar = Math.random) {
  const aqui = centro(sitio)
  const cercanos = lista
    .filter((otro) => otro.clase === sitio.clase && otro.nombre !== sitio.nombre)
    .map((otro) => ({ otro, metros: distancia(aqui, centro(otro)) }))
    .sort((a, b) => a.metros - b.metros)
    .slice(0, 8)
    .map((x) => x.otro)
  return barajar([sitio, ...barajar(cercanos, azar).slice(0, 3)], azar)
}

// Letras que hay que cambiar para pasar de una palabra a otra
function letrasDistintas(a, b) {
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const fila = [i]
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(anterior[j] + 1, fila[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    anterior = fila
  }
  return anterior[b.length]
}

// Palabras que cuentan de un nombre: sin tildes, sin artículos y sin el tipo de vía (calle, plaza...)
const palabrasDe = (nombre) => clavesNombre(nombre).at(-1).split(' ').filter(Boolean)
// Una palabra larga (5 letras o más) puede tener una letra mal
const parecidas = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && letrasDistintas(a, b) <= 1)

// Prepara la comprobación del nombre escrito con todos los nombres que existen. Vale lo escrito si todas sus
// palabras están en el nombre bueno y son al menos la mitad ("gran via" vale por "Gran Vía de Colón"), salvo
// que sea justo el nombre de otro sitio ("gracia" no vale por "Calle Ancha de Gracia": existe Calle Gracia).
export function comprobadorDeNombres(todos) {
  const nombresPorClave = new Map()
  for (const nombre of todos) {
    const clave = palabrasDe(nombre).join(' ')
    if (!nombresPorClave.has(clave)) nombresPorClave.set(clave, new Set())
    nombresPorClave.get(clave).add(nombre)
  }
  return (escrito, nombre) => {
    const dichas = palabrasDe(escrito)
    if (!dichas.length) return false
    const buenas = palabrasDe(nombre)
    if (dichas.join(' ') === buenas.join(' ')) return true
    if ([...(nombresPorClave.get(dichas.join(' ')) ?? [])].some((otro) => otro !== nombre)) return false
    const encontradas = dichas.filter((d) => buenas.some((b) => parecidas(d, b)))
    return encontradas.length === dichas.length && encontradas.length * 2 >= buenas.length
  }
}
