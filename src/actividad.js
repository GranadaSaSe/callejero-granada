// Registro de lo estudiado cada día (paso 1.10): cuántas preguntas se contestan y cuántas bien, por tema.
// Con él salen la racha de días seguidos y los aciertos por tema de la pantalla de Progreso.
// Las cuentas (racha, aciertos, días hasta el examen) no usan el navegador: se pueden probar con Node.

const CLAVE = 'callejero-actividad'
const CLAVE_EXAMEN = 'callejero-fecha-examen'
export const FECHA_EXAMEN_PREVISTA = '2027-10-01' // aproximada: el examen se espera hacia octubre de 2027

// Los mazos de tarjetas y los temas del test son los mismos cinco; solo cambia un nombre
export const temaDeMazo = (mazo) => (mazo === 'zona' ? 'zonas' : mazo)

// Los días se guardan como texto AAAA-MM-DD en la hora del móvil
const dosCifras = (n) => String(n).padStart(2, '0')
export const textoDia = (fecha) => `${fecha.getFullYear()}-${dosCifras(fecha.getMonth() + 1)}-${dosCifras(fecha.getDate())}`
export function fechaDeDia(dia) {
  const [ano, mes, numero] = dia.split('-').map(Number)
  return new Date(ano, mes - 1, numero)
}
export function sumarDias(dia, dias) {
  const fecha = fechaDeDia(dia)
  fecha.setDate(fecha.getDate() + dias)
  return textoDia(fecha)
}

function leer(clave, porDefecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? porDefecto
  } catch {
    return porDefecto
  }
}

function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento (modo privado): el registro dura solo mientras la app esté abierta
  }
}

// Antes de la versión 0.9 no había registro: se rehace lo que se pueda con lo que ya estaba guardado
// (el último repaso de cada tarjeta y la fecha de cada test). Esos días cuentan para la racha, sin cifras.
function diasAnteriores() {
  const dias = {}
  for (const estado of Object.values(leer('callejero-tarjetas', {}))) {
    if (estado?.vista) dias[textoDia(new Date(estado.vista))] = {}
  }
  for (const test of leer('callejero-examen-historial', [])) {
    if (test?.fecha) dias[textoDia(new Date(test.fecha))] = {}
  }
  return dias
}

// { dias: { 'AAAA-MM-DD': { tema: [bien, total], ... } } }
export function leerActividad() {
  const guardada = leer(CLAVE, null)
  return guardada?.dias ? guardada : { dias: diasAnteriores() }
}

// Apunta preguntas contestadas: [{ tema, acierto }]
export function apuntar(respuestas, ahora = new Date()) {
  if (!respuestas.length) return
  const actividad = leerActividad()
  const dia = (actividad.dias[textoDia(ahora)] ??= {})
  for (const { tema, acierto } of respuestas) {
    const cuenta = (dia[tema] ??= [0, 0])
    if (acierto) cuenta[0]++
    cuenta[1]++
  }
  guardar(CLAVE, actividad)
}

export const preguntasDelDia = (dia) => Object.values(dia ?? {}).reduce((suma, [, total]) => suma + total, 0)

// Días seguidos estudiando. Si hoy todavía no se ha estudiado, cuenta hasta ayer: la racha sigue viva.
export function racha(dias, hoy = textoDia(new Date())) {
  const estudiado = (dia) => Boolean(dias[dia])
  let actual = 0
  for (let dia = estudiado(hoy) ? hoy : sumarDias(hoy, -1); estudiado(dia); dia = sumarDias(dia, -1)) actual++
  let mejor = 0
  let seguidos = 0
  let anterior = null
  for (const dia of Object.keys(dias).sort()) {
    seguidos = anterior && sumarDias(anterior, 1) === dia ? seguidos + 1 : 1
    mejor = Math.max(mejor, seguidos)
    anterior = dia
  }
  return { actual, mejor, hoy: estudiado(hoy) }
}

// Aciertos de cada tema desde un día (AAAA-MM-DD; vacío = desde siempre)
export function aciertosPorTema(dias, desde = '') {
  const resultado = {}
  for (const [dia, temas] of Object.entries(dias)) {
    if (dia < desde) continue
    for (const [tema, [bien, total]] of Object.entries(temas)) {
      const cuenta = (resultado[tema] ??= { bien: 0, total: 0 })
      cuenta.bien += bien
      cuenta.total += total
    }
  }
  return resultado
}

export const diasHasta = (dia, hoy = textoDia(new Date())) => Math.round((fechaDeDia(dia) - fechaDeDia(hoy)) / 86_400_000)

// Fecha del examen: la que haya puesto la persona o, si no, la prevista
export function leerFechaExamen() {
  const fecha = leer(CLAVE_EXAMEN, null)
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? { fecha, elegida: true } : { fecha: FECHA_EXAMEN_PREVISTA, elegida: false }
}

export function guardarFechaExamen(fecha) {
  if (fecha) guardar(CLAVE_EXAMEN, fecha)
  else {
    try {
      localStorage.removeItem(CLAVE_EXAMEN)
    } catch {
      // Sin almacenamiento: no hay nada que borrar
    }
  }
}
