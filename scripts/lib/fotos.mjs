// Fotos de los lugares (paso 4.2): qué lugares llevan foto y cómo se comparan nombres con títulos de archivo.
// Lo usan el programa que busca fotos, la página para revisarlas y la preparación de las fotos para la app.

import { normalizar } from './nombres.mjs'

// Lugares que pueden salir en el examen, decidido por la persona el 14-11-2026. En este orden se revisan.
export const CATEGORIAS_FOTOS = [
  'Edificios singulares',
  'Monumentos',
  'Iglesias y templos',
  'Cultura',
  'Estatuas y esculturas',
  'Edificios oficiales',
  'Hospitales',
]

// Como mucho, cuántas fotos buenas se guardan de cada lugar
export const MAX_FOTOS = 3

const SIN_PESO = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'd', 'en', 'a', 'al', 'granada', 'jpg', 'jpeg', 'png'])

// Palabras que cuentan de un nombre: sin artículos ni «Granada»
export const palabras = (texto) => normalizar(texto).split(' ').filter((p) => p && !SIN_PESO.has(p))

// Nombres con los que se puede reconocer un lugar: el nombre, lo que va entre paréntesis y el de OpenStreetMap
export function nombresDe(lugar) {
  const nombres = [lugar.nombre.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[«»"]/g, '').trim()]
  for (const [, dentro] of lugar.nombre.matchAll(/\(([^)]+)\)/g)) nombres.push(dentro)
  if (lugar.nombreOsm) nombres.push(lugar.nombreOsm)
  return nombres.filter((n) => palabras(n).length)
}

// Qué parte de las palabras del nombre aparece en el texto (0 a 1), con el nombre que mejor encaje
export function parecido(lugar, texto) {
  const delTexto = new Set(palabras(texto))
  let mejor = 0
  for (const nombre of nombresDe(lugar)) {
    const suyas = palabras(nombre)
    const comunes = suyas.filter((p) => delTexto.has(p)).length
    mejor = Math.max(mejor, comunes / suyas.length)
  }
  return mejor
}
