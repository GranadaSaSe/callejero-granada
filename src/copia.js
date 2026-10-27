// Copia de seguridad del progreso (paso 1.8): todo lo que la app guarda en este dispositivo (tarjetas,
// tests, ejes, notas y ajustes) en un archivo, para no perderlo al cambiar de móvil o si se borran los
// datos del navegador, y para recuperarlo después en este u otro dispositivo.
import { compartirArchivo } from './archivos.js'

const PREFIJO = 'callejero-'
const CLAVE_ULTIMA = 'callejero-ultima-copia'
const FORMATO = 'callejero-copia'

function clavesGuardadas() {
  const claves = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i)
      if (clave.startsWith(PREFIJO) && clave !== CLAVE_ULTIMA) claves.push(clave)
    }
  } catch {
    // Sin almacenamiento: no hay nada que copiar
  }
  return claves
}

// ¿Hay algo que merezca una copia? (tarjetas repasadas, tests hechos, notas...)
export const hayProgreso = () => clavesGuardadas().some((c) => /tarjetas$|historial|notas$|ejes-|actividad/.test(c))

export function diasDesdeLaUltimaCopia() {
  try {
    const ultima = localStorage.getItem(CLAVE_ULTIMA)
    return ultima ? Math.floor((Date.now() - Date.parse(ultima)) / 86_400_000) : null
  } catch {
    return null
  }
}

export async function guardarCopia() {
  const datos = Object.fromEntries(clavesGuardadas().map((c) => [c, localStorage.getItem(c)]))
  const ahora = new Date().toISOString()
  const contenido = JSON.stringify({ formato: FORMATO, version: 1, fecha: ahora, app: __VERSION__, datos })
  // .txt para que el móvil deje compartirlo por WhatsApp o guardarlo en Archivos o Drive
  const archivo = new File([contenido], `copia-callejero-${ahora.slice(0, 10)}.txt`, { type: 'text/plain' })
  const resultado = await compartirArchivo(archivo, 'Copia de seguridad del callejero')
  if (resultado !== 'cancelado') {
    try {
      localStorage.setItem(CLAVE_ULTIMA, ahora)
    } catch {
      // Sin almacenamiento: no se puede recordar la fecha
    }
  }
  return resultado
}

// Lee un archivo de copia. Devuelve su fecha y cuántos datos trae, sin cambiar nada todavía.
export async function leerCopia(archivo) {
  const copia = JSON.parse(await archivo.text())
  if (copia?.formato !== FORMATO || typeof copia.datos !== 'object') throw new Error('No es una copia de la app')
  const datos = Object.entries(copia.datos).filter(([c, v]) => c.startsWith(PREFIJO) && c !== CLAVE_ULTIMA && typeof v === 'string')
  return { fecha: copia.fecha, app: copia.app, datos }
}

// Sustituye todo lo guardado en este dispositivo por lo de la copia
export function recuperarCopia(datos) {
  for (const clave of clavesGuardadas()) localStorage.removeItem(clave)
  for (const [clave, valor] of datos) localStorage.setItem(clave, valor)
  localStorage.setItem(CLAVE_ULTIMA, new Date().toISOString())
}
