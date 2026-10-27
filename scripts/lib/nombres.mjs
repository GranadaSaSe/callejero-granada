// Comparación de nombres de calle escritos de formas distintas
// ("Plaza Bib-Rambla" / "Plaza de Bib-Rambla", "Albayzín" / "Albaicín"...).

export const normalizar = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/albayzin/g, 'albaicin')

const ARTICULOS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'd'])
const TIPOS = new Set([
  'calle', 'c', 'avenida', 'av', 'avda', 'plaza', 'pl', 'placeta', 'plazoleta', 'paseo', 'camino', 'carretera',
  'ctra', 'cuesta', 'callejon', 'pasaje', 'carril', 'glorieta', 'ronda', 'travesia', 'barranco', 'vereda',
  'carrera', 'urbanizacion', 'via', 'acera', 'bajada', 'subida', 'rotonda', 'puente', 'paraje', 'lugar', 'senda',
])

const sinArticulos = (palabras) => palabras.filter((p) => !ARTICULOS.has(p)).join(' ')

// Claves con las que se puede reconocer un nombre: entero y sin la palabra del tipo de vía.
export function clavesNombre(nombre) {
  const palabras = normalizar(nombre).split(' ')
  const claves = [sinArticulos(palabras)]
  if (palabras.length > 1 && TIPOS.has(palabras[0])) claves.push(sinArticulos(palabras.slice(1)))
  return claves
}
