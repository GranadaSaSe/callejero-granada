// Estadísticas avanzadas (paso 4.4) de la pantalla Tu progreso: la evolución de la nota en los simulacros (o en
// todos los tests), los temas flojos y un plan de repaso para cada día. Todo sale de lo guardado en el dispositivo
// (historial de tests, actividad por día, estado de las tarjetas y de los juegos).
// Este archivo no usa nada del navegador, así que se puede probar con Node.
import { diasHasta, sumarDias, textoDia } from './actividad.js'
import { TEMAS } from './examen-datos.js'

export const MINIMO_TEMA = 10 // preguntas de un tema en el periodo antes de decir si es flojo
export const PREGUNTAS_TEST_DEL_DIA = 20

// Las notas en orden, de la más antigua a la más reciente
export function serieDeNotas(historial, { soloSimulacros = true } = {}) {
  return historial
    .filter((t) => typeof t?.nota === 'number' && t.fecha && (!soloSimulacros || t.simulacro))
    .map((t) => ({ fecha: t.fecha, nota: t.nota, aciertos: t.aciertos, fallos: t.fallos, enBlanco: t.enBlanco, total: t.total, simulacro: Boolean(t.simulacro) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

const media = (lista) => lista.reduce((s, x) => s + x, 0) / lista.length

// Cómo va la nota: la última, la mejor, la media de las 5 últimas y la de las 5 anteriores (para ver si sube)
export function resumenDeNotas(serie) {
  if (!serie.length) return null
  const notas = serie.map((s) => s.nota)
  const ultimas = notas.slice(-5)
  const anteriores = notas.slice(-10, -5)
  return {
    ultima: notas.at(-1),
    mejor: Math.max(...notas),
    media: media(ultimas),
    mediaAnterior: anteriores.length ? media(anteriores) : null,
  }
}

// Aciertos de cada tema en los últimos "dias" días, del más flojo al más fuerte. Los que tienen menos de
// MINIMO_TEMA preguntas van aparte (no se sabe aún si son flojos).
export function temasFlojos(dias, { hoy = textoDia(new Date()), periodo = 30 } = {}) {
  const desde = sumarDias(hoy, -(periodo - 1))
  const cuentas = {}
  for (const [dia, temas] of Object.entries(dias)) {
    if (dia < desde || dia > hoy) continue
    for (const [tema, [bien, total]] of Object.entries(temas)) {
      const c = (cuentas[tema] ??= { bien: 0, total: 0 })
      c.bien += bien
      c.total += total
    }
  }
  const todos = TEMAS.map((t) => ({ ...t, bien: cuentas[t.id]?.bien ?? 0, total: cuentas[t.id]?.total ?? 0 }))
  const conDatos = todos
    .filter((t) => t.total >= MINIMO_TEMA)
    .map((t) => ({ ...t, porcentaje: Math.round((100 * t.bien) / t.total) }))
    .sort((a, b) => a.porcentaje - b.porcentaje || b.total - a.total)
  const pocoPracticados = todos.filter((t) => t.total < MINIMO_TEMA).sort((a, b) => a.total - b.total)
  return { conDatos, pocoPracticados }
}

// Cada cuántos días toca simulacro: uno por semana, y más seguidos cuando se acerca el examen
export const diasEntreSimulacros = (quedan) => (quedan <= 30 ? 3 : quedan <= 90 ? 5 : 7)

// El plan de hoy: una lista de { id, texto, detalle, enlace, hecho }. Se rehace cada día con lo que haya.
//   tarjetas: { tocan } (tarjetas que tocan repasar hoy)
//   calles: { sinVer, total } (principales y de barrio)
//   zonaFloja: { nombre, porcentaje } (el distrito que menos dominas) o null
export function planDeHoy({ dias, historial, fechaExamen, tarjetas, calles, zonaFloja, hoy = textoDia(new Date()) }) {
  const plan = []
  const deHoy = dias[hoy] ?? {}
  const quedan = diasHasta(fechaExamen, hoy)

  // 1. Repaso de tarjetas: lo primero, porque es lo que se olvida
  plan.push({
    id: 'tarjetas',
    texto: tarjetas.tocan ? `Repasa las ${tarjetas.tocan} tarjetas que tocan hoy` : 'Tarjetas al día: hoy no te toca repasar ninguna',
    detalle: 'Las que fallas vuelven antes; las que sabes, cada vez más tarde.',
    enlace: '#/tarjetas',
    hecho: tarjetas.tocan === 0,
  })

  // 2. Calles nuevas: las que faltan por ver, repartidas hasta dos meses antes del examen (para repasar al final)
  if (calles.sinVer > 0) {
    const diasParaVerlas = Math.max(7, quedan - 60)
    const alDia = Math.max(5, Math.ceil(calles.sinVer / diasParaVerlas))
    plan.push({
      id: 'nuevas',
      texto: `Aprende unas ${alDia} calles nuevas`,
      detalle: `Te quedan ${calles.sinVer} de ${calles.total} calles principales y de barrio sin ver. A ${alDia} al día las habrás visto todas ${quedan > 67 ? 'dos meses antes del examen' : 'antes del examen'}.`,
      enlace: '#/tarjetas',
      hecho: false,
    })
  } else {
    plan.push({ id: 'nuevas', texto: 'Ya has visto todas las calles principales y de barrio', detalle: 'Ahora toca repasar.', enlace: '#/calles', hecho: true })
  }

  // 3. Un test del tema más flojo (o del que menos has practicado)
  const { conDatos, pocoPracticados } = temasFlojos(dias, { hoy })
  const tema = conDatos[0] && (!pocoPracticados.length || conDatos[0].porcentaje < 70) ? conDatos[0] : (pocoPracticados[0] ?? conDatos[0])
  if (tema) {
    const hechas = deHoy[tema.id]?.[1] ?? 0
    plan.push({
      id: 'tema',
      texto: `Test de ${PREGUNTAS_TEST_DEL_DIA} preguntas: ${tema.nombre}`,
      detalle:
        tema.porcentaje !== undefined
          ? `Es tu tema más flojo de los últimos 30 días (${tema.porcentaje} % de aciertos).${hechas ? ` Hoy llevas ${hechas} preguntas.` : ''}`
          : `Es el tema que menos has practicado últimamente.${hechas ? ` Hoy llevas ${hechas} preguntas.` : ''}`,
      enlace: `#/test?tema=${tema.id}`,
      hecho: hechas >= PREGUNTAS_TEST_DEL_DIA,
    })
  }

  // 4. Un juego en el distrito que menos dominas
  if (zonaFloja) {
    plan.push({
      id: 'zona',
      texto: `Juega a «¿Dónde está?» en el distrito ${zonaFloja.nombre}`,
      detalle: `Es el distrito que menos dominas (${zonaFloja.porcentaje} % de sus calles). Elige «${zonaFloja.nombre}» en la zona del juego.`,
      enlace: '#/jugar',
      hecho: false,
    })
  }

  // 5. Simulacro: uno por semana (más seguidos al acercarse el examen)
  const simulacros = historial.filter((t) => t?.simulacro && t.fecha).map((t) => textoDia(new Date(t.fecha))).sort()
  const ultimo = simulacros.at(-1)
  const cada = diasEntreSimulacros(quedan)
  const hace = ultimo ? diasHasta(hoy, ultimo) : null
  if (hace === 0) {
    plan.push({ id: 'simulacro', texto: 'Simulacro hecho hoy', detalle: `El próximo, dentro de ${cada} días.`, enlace: '#/test', hecho: true })
  } else if (hace !== null && hace < cada) {
    plan.push({
      id: 'simulacro',
      texto: `Próximo simulacro: dentro de ${cada - hace} ${cada - hace === 1 ? 'día' : 'días'}`,
      detalle: `El último fue hace ${hace} ${hace === 1 ? 'día' : 'días'}. Toca uno cada ${cada} días.`,
      enlace: '#/test',
      hecho: true,
    })
  } else {
    plan.push({
      id: 'simulacro',
      texto: 'Haz un simulacro de examen',
      detalle: ultimo ? `El último fue hace ${hace} días; toca uno cada ${cada} días.` : 'Aún no has hecho ninguno: 55 preguntas y 50 minutos, como el día del examen.',
      enlace: '#/test',
      hecho: false,
    })
  }
  return plan
}
