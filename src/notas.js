// Notas que se dejan en el mapa (pulsación larga en el móvil o clic derecho en el ordenador) para revisar
// después con Claude: un sentido mal, una calle que es peatonal, un nombre que falta...
// Se guardan en el dispositivo. Para reunirlas, cada persona comparte sus notas en un archivo de texto
// (por WhatsApp, por ejemplo). Quien lo recibe puede abrirlo en su app para verlas en el mapa, o
// guardarlo en la carpeta notas-recibidas/ del proyecto para que Claude las lea (npm run notas).

import { compartirArchivo, paraNombreDeArchivo } from './archivos.js'

const CLAVE = 'callejero-notas'
const CLAVE_AUTOR = 'callejero-autor'
export const MARCA_DATOS = '--- DATOS PARA LA APP (no borrar) ---'

// Para las notas sobre preguntas (tarjetas, test Kahoot y test tipo examen)
export const TIPOS_PREGUNTA = [
  'La respuesta de la app está mal',
  'Hay más de una respuesta buena',
  'La pregunta no se entiende',
  'Las opciones son confusas',
  'Sobra esta pregunta',
  'Otro',
]

export const TIPOS = [
  'Sentido de circulación incorrecto',
  'Debería ser peatonal',
  'No es peatonal',
  'Nombre de calle incorrecto o que falta',
  'Lugar de interés que falta o está mal',
  'Otro',
]

const oyentes = new Set()
export const alCambiarNotas = (funcion) => oyentes.add(funcion)

export function leerNotas() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) ?? []
  } catch {
    return []
  }
}

function guardarNotas(notas) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(notas))
  } catch {
    // Sin almacenamiento (modo privado): las notas duran solo mientras la app esté abierta
  }
  for (const funcion of oyentes) funcion(notas)
}

export function leerAutor() {
  try {
    return localStorage.getItem(CLAVE_AUTOR) ?? ''
  } catch {
    return ''
  }
}

export function guardarAutor(nombre) {
  try {
    localStorage.setItem(CLAVE_AUTOR, nombre.trim().slice(0, 40))
  } catch {
    // Sin almacenamiento: el nombre se pedirá de nuevo
  }
}

export function anadirNota(datos) {
  const nota = {
    id: Date.now().toString(36),
    fecha: new Date().toISOString(),
    autor: leerAutor() || null,
    compartida: null,
    ...datos,
  }
  guardarNotas([...leerNotas(), nota])
  return nota
}

export const borrarNota = (id) => guardarNotas(leerNotas().filter((n) => n.id !== id))

export const describirFecha = (iso) =>
  new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

const sinAcentos = paraNombreDeArchivo

function textoDe(n, i) {
  const lineas = [
    `${i + 1}. ${n.tipo}${n.calle ? ` — ${n.calle.nombre}` : n.lugar ? ` — ${n.lugar.nombre}` : ''}`,
    `   ${n.comentario?.trim() || '(sin comentario)'}`,
  ]
  // Nota sobre una pregunta (tarjetas, test Kahoot o test tipo examen)
  if (n.pregunta) {
    lineas.push(`   En: ${n.pregunta.modo}`, `   Pregunta: ${n.pregunta.texto}`, `   Respuesta de la app: ${n.pregunta.respuesta}`)
    if (n.pregunta.opciones?.length) lineas.push(`   Opciones: ${n.pregunta.opciones.join(' | ')}`)
    if (n.pregunta.elegida) lineas.push(`   Contestó: ${n.pregunta.elegida}`)
  }
  if (n.punto) {
    const [lon, lat] = n.punto.map((x) => x.toFixed(6))
    lineas.push(`   Punto: ${lat}, ${lon} · https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`)
  }
  lineas.push(`   Fecha: ${describirFecha(n.fecha)}`, '')
  return lineas.join('\n')
}

// Archivo de texto con las notas: se lee bien a simple vista y al final lleva los datos para la app
export function archivoDeNotas(notas) {
  const autor = leerAutor() || 'Sin nombre'
  const ahora = new Date().toISOString()
  const contenido = [
    'NOTAS DEL CALLEJERO DE GRANADA',
    `De: ${autor} · ${notas.length} nota${notas.length === 1 ? '' : 's'} · ${describirFecha(ahora)} · versión ${__VERSION__}`,
    '',
    ...notas.map(textoDe),
    MARCA_DATOS,
    JSON.stringify({
      formato: 'callejero-notas',
      version: 1,
      autor,
      fecha: ahora,
      notas: notas.map(({ id, fecha, tipo, comentario, punto, calle, lugar, tramo, pregunta }) => ({
        id, fecha, tipo, comentario, punto, calle, lugar, tramo, pregunta,
      })),
    }),
    '',
  ].join('\n')
  return new File([contenido], `notas-callejero-${sinAcentos(autor) || 'sin-nombre'}-${ahora.slice(0, 10)}.txt`, {
    type: 'text/plain',
  })
}

// Comparte las notas propias en un archivo: en el móvil abre el menú de compartir (WhatsApp...),
// en el ordenador lo descarga. Devuelve 'compartido', 'descargado', 'cancelado' o 'nada'.
export async function compartirNotas({ todas = false } = {}) {
  const propias = leerNotas().filter((n) => !n.importada && (todas || !n.compartida))
  if (!propias.length) return 'nada'
  const resultado = await compartirArchivo(archivoDeNotas(propias), 'Notas del callejero de Granada')
  if (resultado === 'cancelado') return resultado
  const ids = new Set(propias.map((n) => n.id))
  const ahora = new Date().toISOString()
  guardarNotas(leerNotas().map((n) => (ids.has(n.id) ? { ...n, compartida: ahora } : n)))
  return resultado
}

// Lee los datos de un archivo de notas (el bloque que va tras MARCA_DATOS, o el archivo entero si es JSON)
export function datosDeArchivo(texto) {
  const posicion = texto.indexOf(MARCA_DATOS)
  const datos = JSON.parse(posicion === -1 ? texto : texto.slice(posicion + MARCA_DATOS.length))
  if (datos?.formato !== 'callejero-notas' || !Array.isArray(datos.notas)) throw new Error('No es un archivo de notas')
  return datos
}

const textoSeguro = (valor, largo) => (typeof valor === 'string' ? valor.slice(0, largo) : '')
const referencia = (r) => (r && typeof r.nombre === 'string' ? { id: r.id ?? null, nombre: r.nombre.slice(0, 120) } : null)
const preguntaSegura = (p) =>
  p && typeof p.texto === 'string'
    ? {
        modo: textoSeguro(p.modo, 40),
        texto: p.texto.slice(0, 400),
        respuesta: textoSeguro(p.respuesta, 300),
        elegida: textoSeguro(p.elegida, 300) || null,
        opciones: Array.isArray(p.opciones) ? p.opciones.slice(0, 4).map((o) => textoSeguro(o, 300)) : null,
        id: textoSeguro(p.id, 200),
        enlace: /^#\/(mapa|ejes)\?(calle|lugar|id)=[\w-]+$/.test(p.enlace ?? '') ? p.enlace : null,
      }
    : null

// Añade a este dispositivo las notas de un archivo de otra persona (sin repetir las que ya estén)
export async function importarNotas(archivo) {
  const datos = datosDeArchivo(await archivo.text())
  const autor = textoSeguro(datos.autor, 40) || 'Sin nombre'
  const existentes = leerNotas()
  const yaEstan = new Set(existentes.map((n) => n.id))
  const nuevas = []
  let repetidas = 0
  let estropeadas = 0
  for (const n of datos.notas) {
    // Una nota vale si es sobre un punto del mapa o sobre una pregunta
    const punto = Array.isArray(n?.punto) ? n.punto.map(Number) : []
    const conPunto = punto.length === 2 && punto.every((x) => Number.isFinite(x))
    const pregunta = preguntaSegura(n?.pregunta)
    if ((!conPunto && !pregunta) || typeof n.tipo !== 'string') {
      estropeadas++
      continue
    }
    const id = `${sinAcentos(autor)}-${textoSeguro(n.id, 20)}`
    if (yaEstan.has(id)) {
      repetidas++
      continue
    }
    yaEstan.add(id)
    nuevas.push({
      id,
      fecha: textoSeguro(n.fecha, 30) || new Date().toISOString(),
      tipo: n.tipo.slice(0, 80),
      comentario: textoSeguro(n.comentario, 2000),
      punto: conPunto ? punto : null,
      pregunta,
      calle: referencia(n.calle),
      lugar: referencia(n.lugar),
      tramo: Number.isFinite(n.tramo) ? n.tramo : null,
      autor,
      importada: true,
    })
  }
  guardarNotas([...existentes, ...nuevas])
  return { autor, nuevas: nuevas.length, repetidas, estropeadas }
}
