// Preguntas tipo examen (paso 1.7): cuatro opciones y una correcta, agrupadas por temas.
// Mezcla las tarjetas de repaso (con las respuestas falsas de crearOpciones) con preguntas propias de
// examen: "¿qué calle va desde A hasta B?", "¿cuál de estas calles cruza con X?", "¿cuál está en el
// barrio Y?", "¿en qué distrito está tal lugar?".
// Este archivo no usa nada del navegador, así que se puede probar con Node.
import { DISTRITOS } from './ejes-lista.js'
import { crearOpciones, crearTarjetas } from './tarjetas-datos.js'

export const TEMAS = [
  { id: 'zonas', nombre: 'Distritos y barrios' },
  { id: 'extremos', nombre: 'Inicio y fin de las calles' },
  { id: 'sentido', nombre: 'Sentido de circulación' },
  { id: 'cruces', nombre: 'Cruces y ejes' },
  { id: 'lugares', nombre: 'Lugares de interés' },
]

// Qué calles pueden salir, según su importancia (1 = vía principal ... 6 = peatonal o sin clasificar)
export const NIVELES = [
  { id: 'principales', nombre: 'Solo calles principales', maximo: 2 },
  { id: 'medio', nombre: 'Principales y de barrio', maximo: 4 },
  { id: 'todas', nombre: 'Todas las calles', maximo: 6 },
]

const barajar = (lista, azar) =>
  lista
    .map((x) => [azar(), x])
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x)

// Pregunta con la respuesta buena y tres falsas (distintas entre sí); null si no hay tres falsas
function pregunta({ id, tema, enunciado, correcta, falsas, explicacion, enlace, tarjeta = null }, azar) {
  const distintas = [...new Set(falsas)].filter((x) => x && x !== correcta)
  if (distintas.length < 3) return null
  const opciones = barajar([correcta, ...barajar(distintas, azar).slice(0, 3)], azar)
  return { id, tema, tarjeta, pregunta: enunciado, opciones, correcta: opciones.indexOf(correcta), explicacion, enlace }
}

const deTarjeta = (t, mazos, tema, azar) => {
  const opciones = crearOpciones(t, mazos, azar)
  if (!opciones) return null
  return {
    id: t.id,
    tema,
    tarjeta: t.id,
    pregunta: t.pregunta,
    opciones,
    correcta: opciones.indexOf(t.respuesta),
    explicacion: [t.respuesta, t.detalle].filter(Boolean).join('. '),
    enlace: t.enlace,
  }
}

// Para cada tema, una lista de "recetas": cada una crea una pregunta (o null si no se puede)
function recetas({ calles, lugares, ejes }, { nivel, distrito }, azar) {
  const maximo = NIVELES.find((n) => n.id === nivel)?.maximo ?? 4
  const enZona = (d) => distrito === 'Todos' || d === distrito
  const validas = calles.filter((c) => c.importancia <= maximo && enZona(c.distritos[0]))
  const idsValidas = new Set(validas.map((c) => c.id))
  const mazos = crearTarjetas({ calles, lugares, ejes })
  const deMazo = (mazo) => mazos[mazo].filter((t) => enZona(t.distrito) && (!t.enlace.includes('calle=') || idsValidas.has(Number(t.enlace.split('=')[1]))))
  const algunas = (lista, n) => barajar(lista, azar).slice(0, n)
  const mismoDistrito = (c) => calles.filter((x) => x.id !== c.id && x.distritos[0] === c.distritos[0])
  const lugaresZona = lugares.filter((l) => l.distrito && enZona(l.distrito))
  const r = Object.fromEntries(TEMAS.map((t) => [t.id, []]))

  for (const t of deMazo('zona')) r.zonas.push(() => deTarjeta(t, mazos, 'zonas', azar))
  // "¿Cuál de estas calles está en el barrio...?": las falsas son de otros barrios del mismo distrito
  for (const c of validas.filter((x) => x.barrios.length === 1)) {
    r.zonas.push(() => {
      const barrio = c.barrios[0]
      return pregunta(
        {
          id: `barrio:${c.id}`,
          tema: 'zonas',
          enunciado: `¿Cuál de estas calles está en el barrio ${barrio}?`,
          correcta: c.nombre,
          falsas: algunas(
            mismoDistrito(c).filter((x) => x.importancia <= maximo && !x.barrios.includes(barrio)),
            6,
          ).map((x) => x.nombre),
          explicacion: `${c.nombre} está en el barrio ${barrio} (distrito ${c.distritos[0]}).`,
          enlace: `#/mapa?calle=${c.id}`,
        },
        azar,
      )
    })
  }
  for (const l of lugaresZona) {
    r.zonas.push(() =>
      pregunta(
        {
          id: `lugar-distrito:${l.id}`,
          tema: 'zonas',
          enunciado: `¿En qué distrito está ${l.nombre}?`,
          correcta: l.distrito,
          falsas: DISTRITOS.filter((d) => d !== l.distrito),
          explicacion: `${l.nombre} está en el distrito ${l.distrito}${l.barrio ? `, barrio ${l.barrio}` : ''}${l.direccion ? ` (${l.direccion})` : ''}.`,
          enlace: `#/mapa?lugar=${l.id}`,
        },
        azar,
      ),
    )
  }

  for (const t of deMazo('extremos')) r.extremos.push(() => deTarjeta(t, mazos, 'extremos', azar))
  // "¿Qué calle va desde A hasta B?": las falsas son calles que también tocan A o B, o que la cruzan
  const claras = validas.filter((c) => c.inicio.length && c.fin.length && !c.inicio.some((n) => c.fin.includes(n)))
  for (const c of claras) {
    r.extremos.push(() => {
      const [desde, hasta] = [c.inicio[0], c.fin[0]]
      const tocan = calles.filter(
        (x) => x.id !== c.id && [desde, hasta].some((n) => x.inicio.includes(n) || x.fin.includes(n) || x.cruces.includes(n)),
      )
      const mismasPuntas = (x) => x.inicio.includes(desde) && x.fin.includes(hasta)
      return pregunta(
        {
          id: `une:${c.id}`,
          tema: 'extremos',
          enunciado: `¿Qué calle va desde ${desde} hasta ${hasta}?`,
          correcta: c.nombre,
          falsas: [...algunas(tocan.filter((x) => !mismasPuntas(x)), 4).map((x) => x.nombre), ...algunas(c.cruces, 3)].filter(
            (n) => n !== desde && n !== hasta,
          ),
          explicacion: `${c.nombre} va desde ${desde} hasta ${hasta}.`,
          enlace: `#/mapa?calle=${c.id}`,
        },
        azar,
      )
    })
  }

  for (const t of deMazo('sentido')) r.sentido.push(() => deTarjeta(t, mazos, 'sentido', azar))

  for (const t of mazos.cruces.filter((x) => enZona(x.distrito))) r.cruces.push(() => deTarjeta(t, mazos, 'cruces', azar))
  // "¿Cuál de estas calles cruza con...?": las falsas son del mismo distrito pero no la tocan
  for (const c of validas.filter((x) => x.cruces.length >= 3)) {
    r.cruces.push(() => {
      const cruce = c.cruces[Math.floor(azar() * c.cruces.length)]
      const tocan = new Set([c.nombre, ...c.cruces, ...c.inicio, ...c.fin])
      return pregunta(
        {
          id: `cruza:${c.id}`,
          tema: 'cruces',
          enunciado: `¿Cuál de estas calles se cruza con ${c.nombre}?`,
          correcta: cruce,
          falsas: algunas(mismoDistrito(c).filter((x) => !tocan.has(x.nombre) && !x.cruces.includes(c.nombre)), 6).map(
            (x) => x.nombre,
          ),
          explicacion: `${cruce} se cruza con ${c.nombre}${c.inicio[0] && c.fin[0] ? `, que va de ${c.inicio[0]} a ${c.fin[0]}` : ''}.`,
          enlace: `#/mapa?calle=${c.id}`,
        },
        azar,
      )
    })
  }

  for (const t of mazos.lugares.filter((x) => enZona(x.distrito))) r.lugares.push(() => deTarjeta(t, mazos, 'lugares', azar))
  return r
}

// Un examen de "total" preguntas de los temas elegidos, alternando temas y sin repetir
export function crearExamen(datos, { temas, nivel = 'medio', distrito = 'Todos', total = 20 }, azar = Math.random) {
  const porTema = recetas(datos, { nivel, distrito }, azar)
  const colas = temas.map((t) => barajar(porTema[t] ?? [], azar)).filter((c) => c.length)
  const elegidas = []
  for (let vuelta = 0; elegidas.length < total && colas.some((c) => c.length); vuelta++) {
    const cola = colas[vuelta % colas.length]
    const p = cola.pop()?.()
    if (p && !elegidas.some((e) => e.id === p.id || e.pregunta === p.pregunta)) elegidas.push(p)
  }
  return barajar(elegidas, azar)
}

// Nota sobre 10 como en el examen: cada fallo resta "penalizacion" aciertos; las de en blanco no restan
export function corregir(preguntas, respuestas, penalizacion) {
  let aciertos = 0
  let fallos = 0
  preguntas.forEach((p, i) => {
    if (respuestas[i] == null) return
    if (respuestas[i] === p.correcta) aciertos++
    else fallos++
  })
  const enBlanco = preguntas.length - aciertos - fallos
  const nota = preguntas.length ? ((aciertos - penalizacion * fallos) / preguntas.length) * 10 : 0
  return { aciertos, fallos, enBlanco, nota }
}
