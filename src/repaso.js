// Repaso espaciado de las tarjetas (paso 1.6): cada tarjeta vuelve a salir más tarde cuanto mejor te la
// sabes, y enseguida si la fallas. Es una versión sencilla del método SM-2 que usan programas como Anki.
// Este archivo no usa nada del navegador, así que se puede probar con Node.

export const MINUTO = 60 * 1000
export const DIA = 24 * 60 * MINUTO

// Respuestas posibles al destapar una tarjeta
export const RESPUESTAS = [
  { id: 'otra', texto: 'Otra vez' },
  { id: 'dificil', texto: 'Difícil' },
  { id: 'bien', texto: 'Bien' },
  { id: 'facil', texto: 'Fácil' },
]

const nuevoEstado = () => ({ intervalo: 0, facilidad: 2.5, repeticiones: 0, fallos: 0, proxima: 0 })

// Estado de una tarjeta después de contestar. "intervalo" son los días hasta que vuelva a salir y
// "facilidad" cuánto se alarga ese intervalo cada vez que se acierta.
export function calificar(estado, respuesta, ahora = Date.now()) {
  const anterior = estado ?? nuevoEstado()
  let { intervalo, facilidad, repeticiones, fallos } = anterior
  if (respuesta === 'otra') {
    return {
      intervalo: 0,
      facilidad: Math.max(1.3, facilidad - 0.2),
      repeticiones: 0,
      fallos: fallos + 1,
      proxima: ahora + 10 * MINUTO,
      vista: ahora,
    }
  }
  if (respuesta === 'dificil') intervalo = repeticiones === 0 ? 0.5 : Math.max(1, intervalo * 1.2)
  else if (respuesta === 'bien') intervalo = repeticiones === 0 ? 1 : repeticiones === 1 ? 3 : intervalo * facilidad
  else intervalo = repeticiones === 0 ? 4 : repeticiones === 1 ? 6 : intervalo * facilidad * 1.3
  facilidad = Math.min(3, Math.max(1.3, facilidad + { dificil: -0.15, bien: 0, facil: 0.15 }[respuesta]))
  intervalo = Math.round(Math.min(intervalo, 365) * 10) / 10
  return { intervalo, facilidad, repeticiones: repeticiones + 1, fallos, proxima: ahora + intervalo * DIA, vista: ahora }
}

// Cuándo volvería a salir la tarjeta con cada respuesta ("10 min", "1 día", "2 semanas"...)
export function cuandoVuelve(estado, respuesta) {
  if (respuesta === 'otra') return '10 min'
  const dias = calificar(estado, respuesta, 0).intervalo
  if (dias < 1) return `${Math.round(dias * 24)} h`
  if (dias < 1.5) return '1 día'
  if (dias < 30) return `${Math.round(dias)} días`
  if (dias < 60) return `${Math.round(dias / 7)} semanas`
  if (dias < 330) return `${Math.round(dias / 30)} meses`
  return '1 año'
}

// Una tarjeta se considera aprendida cuando ya no vuelve a salir hasta dentro de tres semanas o más
export const aprendida = (estado) => Boolean(estado && estado.intervalo >= 21)

// Tarjetas de la sesión de hoy: primero las que tocan repasar (las más atrasadas antes) y después las
// nuevas que falten para llegar al máximo diario. "candidatas" ya viene ordenada por prioridad.
export function tarjetasDeHoy(candidatas, estados, { nuevasPorDia, nuevasYaHoy }, ahora = Date.now()) {
  const tocan = candidatas
    .filter((t) => estados[t.id] && estados[t.id].proxima <= ahora)
    .sort((a, b) => estados[a.id].proxima - estados[b.id].proxima)
  const nuevas = candidatas.filter((t) => !estados[t.id]).slice(0, Math.max(0, nuevasPorDia - nuevasYaHoy))
  return { tocan, nuevas }
}

// Mezcla varias listas tomando una de cada en turno, para que las tarjetas nuevas no sean todas del mismo tipo
export function intercalar(listas) {
  const resultado = []
  for (let i = 0; listas.some((l) => i < l.length); i++) {
    for (const lista of listas) if (i < lista.length) resultado.push(lista[i])
  }
  return resultado
}
