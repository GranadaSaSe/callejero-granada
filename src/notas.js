// Notas que se dejan en el mapa (pulsación larga en el móvil o clic derecho en el ordenador) para revisar
// después con Claude: un sentido mal, una calle que es peatonal, un nombre que falta...
// Se guardan en el dispositivo y se envían como una incidencia ("issue") del repositorio de GitHub del
// proyecto, que Claude puede leer.

const CLAVE = 'callejero-notas'
const REPOSITORIO = 'https://github.com/GranadaSaSe/callejero-granada'
const LARGO_MAXIMO = 7000 // GitHub no admite direcciones mucho más largas

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

export function anadirNota(datos) {
  const nota = { id: Date.now().toString(36), fecha: new Date().toISOString(), enviada: null, ...datos }
  guardarNotas([...leerNotas(), nota])
  return nota
}

export const borrarNota = (id) => guardarNotas(leerNotas().filter((n) => n.id !== id))

const fecha = (iso) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

function textoNota(n, i) {
  const [lon, lat] = n.punto
  const app = `${location.origin}${import.meta.env.BASE_URL}`
  return [
    `### ${i + 1}. ${n.tipo}`,
    n.comentario?.trim() || '(sin comentario)',
    '',
    n.calle ? `- Calle: ${n.calle.nombre} (id ${n.calle.id}) · [ver en la app](${app}#/mapa?calle=${n.calle.id})` : '- Calle: ninguna',
    n.tramo ? `- Tramo: ${n.tramo}` : null,
    n.lugar ? `- Lugar: ${n.lugar.nombre} (${n.lugar.id})` : null,
    `- Punto: ${lat.toFixed(6)}, ${lon.toFixed(6)} · [ver en OpenStreetMap](https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=19/${lat.toFixed(6)}/${lon.toFixed(6)})`,
    `- Fecha: ${fecha(n.fecha)}`,
    '',
  ]
    .filter((linea) => linea !== null)
    .join('\n')
}

function direccion(notas) {
  const titulo =
    notas.length === 1
      ? `Nota: ${notas[0].tipo}${notas[0].calle ? ` en ${notas[0].calle.nombre}` : ''}`
      : `${notas.length} notas desde la app`
  const cuerpo = [`Notas enviadas desde la app (versión ${__VERSION__}).`, '', ...notas.map(textoNota)].join('\n')
  return `${REPOSITORIO}/issues/new?${new URLSearchParams({ title: titulo, body: cuerpo })}`
}

// Abre GitHub con las notas pendientes ya escritas. Si son muchas, se envían las que caben y el resto
// queda para el siguiente envío. Devuelve cuántas se han enviado.
export function enviarNotas() {
  const pendientes = leerNotas().filter((n) => !n.enviada)
  let lote = []
  for (const nota of pendientes) {
    if (lote.length && direccion([...lote, nota]).length > LARGO_MAXIMO) break
    lote.push(nota)
  }
  if (!lote.length) return 0
  window.open(direccion(lote), '_blank', 'noopener')
  const enviadas = new Set(lote.map((n) => n.id))
  const ahora = new Date().toISOString()
  guardarNotas(leerNotas().map((n) => (enviadas.has(n.id) ? { ...n, enviada: ahora } : n)))
  return lote.length
}

export const volverAEnviar = (id) => guardarNotas(leerNotas().map((n) => (n.id === id ? { ...n, enviada: null } : n)))

export const describirFecha = fecha
