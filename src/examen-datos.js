// Preguntas tipo examen (paso 1.7): tres opciones (a, b, c) y una correcta, como en el examen de 2025,
// agrupadas por temas (el Kahoot de las tarjetas sigue con cuatro).
// Mezcla las tarjetas de repaso (con las respuestas falsas de crearOpciones) con preguntas propias de
// examen: "¿qué calle va desde A hasta B?", "¿cuál de estas calles cruza con X?", "¿cuál está en el
// barrio Y?", "¿en qué distrito está tal lugar?" y, de la zona de los parques, "¿cuál de estos pueblos está en
// la zona?" y "¿con cuál limita X?". Y los trayectos desde los parques de bomberos (paso 3.3, src/trayectos-datos.js).
// Con el material de la persona (paso 3.5), las clases de pregunta de los exámenes de otros años: entre qué calles está
// una calle, qué calle da (o no da) acceso a otra, desde qué calle se accede a un edificio, cómo incorporarse a una
// calle, a qué distrito y parque pertenece un sitio, edificios singulares y de gran altura, qué carretera une dos
// pueblos, de qué red es una carretera y en qué pueblo está cada polígono industrial.
// Este archivo no usa nada del navegador, así que se puede probar con Node.
import { PUEBLOS_FUERA } from '../scripts/lib/zona-parques.mjs'
import { poligonosPreguntables, TIPOS_RED } from './zona-preguntas.js'
import { DISTRITOS } from './ejes-lista.js'
import { PARQUES } from './rutas.js'
import { crearOpciones, crearTarjetas, GIROS, nombreLlevaLaCalle } from './tarjetas-datos.js'
import { crearTrayecto, destinosTrayecto, explicarTrayecto } from './trayectos-datos.js'

export const TEMAS = [
  { id: 'zonas', nombre: 'Distritos y barrios' },
  { id: 'extremos', nombre: 'Inicio y fin de las calles' },
  { id: 'sentido', nombre: 'Sentido de circulación' },
  { id: 'cruces', nombre: 'Cruces y ejes' },
  { id: 'lugares', nombre: 'Lugares de interés' },
  { id: 'carreteras', nombre: 'Pueblos, carreteras y polígonos de la zona' },
  { id: 'trayectos', nombre: 'Trayectos desde los parques' },
  { id: 'parques', nombre: 'Distrito y parque de bomberos' },
  { id: 'edificios', nombre: 'Edificios singulares y de gran altura' },
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

// Respuestas por pregunta: tres, como en el examen de 2025 (decidido el 11-11-2026)
export const OPCIONES_EXAMEN = 3

// Se queda con la buena y otras dos de una lista de opciones, en otro orden
export function recortarOpciones(opciones, correcta, azar) {
  const buena = opciones[correcta]
  const falsas = barajar(
    opciones.filter((_, i) => i !== correcta),
    azar,
  ).slice(0, OPCIONES_EXAMEN - 1)
  const nuevas = barajar([buena, ...falsas], azar)
  return { opciones: nuevas, correcta: nuevas.indexOf(buena) }
}

// Pregunta con la respuesta buena y dos falsas (distintas entre sí); null si no hay bastantes falsas
export function pregunta({ id, tema, enunciado, correcta, falsas, explicacion, enlace, tarjeta = null }, azar) {
  const distintas = [...new Set(falsas)].filter((x) => x && x !== correcta)
  if (distintas.length < OPCIONES_EXAMEN - 1) return null
  const opciones = barajar([correcta, ...barajar(distintas, azar).slice(0, OPCIONES_EXAMEN - 1)], azar)
  return { id, tema, tarjeta, pregunta: enunciado, opciones, correcta: opciones.indexOf(correcta), explicacion, enlace }
}

const deTarjeta = (t, mazos, tema, azar) => {
  // «¿Cómo podemos incorporarnos...?»: las tres respuestas del examen de 2022, siempre en el mismo orden
  if (t.id.includes(':incorporar:')) {
    const opciones = Object.values(GIROS)
    return { id: t.id, tema, tarjeta: t.id, pregunta: t.pregunta, opciones, correcta: opciones.indexOf(t.respuesta), explicacion: [t.respuesta, t.detalle].filter(Boolean).join('. '), enlace: t.enlace }
  }
  const todas = crearOpciones(t, mazos, azar)
  if (!todas) return null
  const { opciones, correcta } = recortarOpciones(todas, todas.indexOf(t.respuesta), azar)
  return {
    id: t.id,
    tema,
    tarjeta: t.id,
    pregunta: t.pregunta,
    opciones,
    correcta,
    explicacion: [t.respuesta, t.detalle].filter(Boolean).join('. '),
    enlace: t.enlace,
  }
}

// Para cada tema, una lista de "recetas": cada una crea una pregunta (o null si no se puede)
function recetas({ calles, lugares, ejes, zona = null, trayectos = null, altos = [] }, { nivel, distrito }, azar) {
  const maximo = NIVELES.find((n) => n.id === nivel)?.maximo ?? 4
  const enZona = (d) => distrito === 'Todos' || d === distrito
  const validas = calles.filter((c) => c.importancia <= maximo && enZona(c.distritos[0]))
  const idsValidas = new Set(validas.map((c) => c.id))
  const mazos = crearTarjetas({ calles, lugares, ejes, zona, altos })
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

  // «¿Entre qué calles se encuentra X?» (exámenes de 2020 y 2025): las falsas cambian una de las dos puntas por una
  // calle que de verdad cruza, o las dos
  for (const c of claras.filter((x) => x.cruces.length >= 2)) {
    r.extremos.push(() => {
      const [desde, hasta] = [c.inicio[0], c.fin[0]]
      const [x, y] = algunas(c.cruces, 2)
      return pregunta(
        {
          id: `entre:${c.id}`,
          tema: 'extremos',
          enunciado: `¿Entre qué calles se encuentra ${c.nombre}?`,
          correcta: `Entre ${desde} y ${hasta}`,
          falsas: [`Entre ${desde} y ${x}`, `Entre ${y} y ${hasta}`, `Entre ${x} y ${y}`],
          explicacion: `${c.nombre} va de ${desde} a ${hasta}. Por el medio cruza ${c.cruces.length} calle${c.cruces.length > 1 ? 's' : ''}.`,
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

  // «¿Cuál de estas calles da acceso a X?» y «¿cuál NO da acceso?» (examen de 2022): dar acceso = tocarla (al
  // principio, al final o cruzándola), a pie o en coche
  const tocaA = (c) => new Set([...c.cruces, ...c.inicio, ...c.fin].filter((n) => n !== c.nombre))
  for (const c of validas.filter((x) => tocaA(x).size >= 2)) {
    const tocan = tocaA(c)
    const noTocan = () =>
      algunas(
        mismoDistrito(c).filter((x) => !tocan.has(x.nombre) && !tocaA(x).has(c.nombre) && x.nombre !== c.nombre),
        6,
      ).map((x) => x.nombre)
    r.cruces.push(() =>
      pregunta(
        {
          id: `acceso:${c.id}`,
          tema: 'cruces',
          enunciado: `¿Cuál de las siguientes calles da acceso a ${c.nombre}?`,
          correcta: algunas([...tocan], 1)[0],
          falsas: noTocan(),
          explicacion: `A ${c.nombre} se llega desde ${[...tocan].join(', ')}.`,
          enlace: `#/mapa?calle=${c.id}`,
        },
        azar,
      ),
    )
    r.cruces.push(() => {
      // Al revés: la buena es la que no la toca, y las dos falsas sí la tocan
      const buena = noTocan()[0]
      if (!buena) return null
      const p = pregunta(
        {
          id: `no-acceso:${c.id}`,
          tema: 'cruces',
          enunciado: `¿Cuál de las siguientes calles NO da acceso directo, ni a pie ni en coche, a ${c.nombre}?`,
          correcta: buena,
          falsas: algunas([...tocan], 3),
          explicacion: `${buena} no toca ${c.nombre}. Las que sí: ${[...tocan].join(', ')}.`,
          enlace: `#/mapa?calle=${c.id}`,
        },
        azar,
      )
      return p
    })
  }

  for (const t of mazos.lugares.filter((x) => enZona(x.distrito))) r.lugares.push(() => deTarjeta(t, mazos, 'lugares', azar))

  // Distrito y parque de bomberos (paso 3.5)
  for (const t of deMazo('parques')) r.parques.push(() => deTarjeta(t, mazos, 'parques', azar))

  // Edificios singulares y de gran altura (paso 3.5): sus tarjetas y «¿desde qué calle se accede a X?» (la calle de
  // la lista oficial; las falsas, calles que la cruzan o están cerca)
  for (const t of mazos.edificios.filter((x) => enZona(x.distrito))) r.edificios.push(() => deTarjeta(t, mazos, 'edificios', azar))
  const callePorId = new Map(calles.map((c) => [c.id, c]))
  for (const l of lugares.filter((x) => x.singular && x.via && enZona(x.distrito))) {
    const calle = callePorId.get(l.via)
    if (!calle || nombreLlevaLaCalle(l.nombre, calle.nombre)) continue
    r.edificios.push(() =>
      pregunta(
        {
          id: `acceso-lugar:${l.id}`,
          tema: 'edificios',
          enunciado: `¿Desde qué calle se accede a ${l.nombre}?`,
          correcta: calle.nombre,
          falsas: [...algunas([...calle.cruces, ...calle.inicio, ...calle.fin], 4), ...algunas(mismoDistrito(calle), 3).map((x) => x.nombre)],
          explicacion: `${l.nombre}: ${l.direccion} (lista oficial de edificios singulares).`,
          enlace: `#/mapa?lugar=${l.id}`,
        },
        azar,
      ),
    )
  }

  // Zona de los parques de Granada (paso 2.5): sus tarjetas, y además "¿cuál de estos pueblos está en la
  // zona?" y "¿con cuál limita?". No es de ningún distrito: solo sale con todos los distritos.
  if (zona && distrito === 'Todos') {
    for (const t of mazos.carreteras) r.carreteras.push(() => deTarjeta(t, mazos, 'carreteras', azar))
    // «Marque la opción correcta. Red Complementaria Metropolitana de Granada:» (examen de 2025)
    const redes = zona.redes ?? {}
    const enLaZona = new Set(zona.municipios.features.flatMap((f) => f.properties.carreteras))
    const codigosZona = Object.keys(redes).filter((c) => enLaZona.has(c))
    for (const tipo of TIPOS_RED) {
      for (const codigo of codigosZona.filter((c) => redes[c] === tipo)) {
        r.carreteras.push(() =>
          pregunta(
            {
              id: `red-cual:${codigo}`,
              tema: 'carreteras',
              enunciado: `¿Cuál de estas carreteras es de la ${tipo}?`,
              correcta: codigo,
              falsas: algunas(
                codigosZona.filter((c) => redes[c] !== tipo),
                6,
              ),
              explicacion: `La ${codigo} es de la ${tipo}.`,
              enlace: `#/mapa?carretera=${encodeURIComponent(codigo)}`,
            },
            azar,
          ),
        )
      }
    }
    // «¿Cuál de estos polígonos industriales no pertenece a X?» (examen de 2025)
    const poligonos = poligonosPreguntables(zona.poligonos ?? [])
    const vecinosDe = new Map(zona.municipios.features.map((f) => [f.properties.nombre, f.properties.vecinos]))
    for (const municipio of [...new Set(poligonos.map((p) => p.municipio))]) {
      const suyos = poligonos.filter((p) => p.municipio === municipio)
      if (suyos.length < 2) continue
      const deVecinos = poligonos.filter((p) => (vecinosDe.get(municipio) ?? []).includes(p.municipio))
      for (const ajeno of deVecinos) {
        r.carreteras.push(() =>
          pregunta(
            {
              id: `poligono-no:${municipio}|${ajeno.nombre}`,
              tema: 'carreteras',
              enunciado: `¿Cuál de estos polígonos industriales no pertenece a ${municipio}?`,
              correcta: ajeno.nombre,
              falsas: algunas(suyos, 3).map((p) => p.nombre),
              explicacion: `El ${ajeno.nombre} está en ${ajeno.municipio}. En ${municipio}: ${suyos.map((p) => p.nombre).join(', ')}.`,
              enlace: `#/mapa?pueblo=${encodeURIComponent(municipio)}`,
            },
            azar,
          ),
        )
      }
    }
    const pueblos = zona.municipios.features.map((f) => f.properties).filter((m) => m.nombre !== 'Granada')
    const metros = (a, b) => Math.hypot((a[0] - b[0]) * 88800, (a[1] - b[1]) * 110540)
    for (const m of pueblos) {
      const enlace = `#/mapa?pueblo=${encodeURIComponent(m.nombre)}`
      r.carreteras.push(() =>
        pregunta(
          {
            id: `en-zona:${m.nombre}`,
            tema: 'carreteras',
            enunciado: '¿Cuál de estos pueblos está en la zona de los parques de Granada?',
            correcta: m.nombre,
            falsas: algunas(PUEBLOS_FUERA, 6),
            explicacion: `${m.nombre} está en la zona (parte ${m.parte.toLowerCase()}). Los otros son de fuera.`,
            enlace,
          },
          azar,
        ),
      )
      // Las falsas, de los pueblos más cercanos que no son vecinos (vale cualquiera, pero así cuesta más)
      const noVecinos = pueblos
        .filter((o) => o.nombre !== m.nombre && !m.vecinos.includes(o.nombre))
        .sort((a, b) => metros(a.centro, m.centro) - metros(b.centro, m.centro))
        .slice(0, 6)
        .map((o) => o.nombre)
      r.carreteras.push(() =>
        pregunta(
          {
            id: `limita:${m.nombre}`,
            tema: 'carreteras',
            enunciado: `¿Con cuál de estos pueblos limita ${m.nombre}?`,
            correcta: algunas(m.vecinos, 1)[0],
            falsas: noVecinos,
            explicacion: `${m.nombre} limita con ${m.vecinos.join(', ')}.`,
            enlace,
          },
          azar,
        ),
      )
    }
  }
  // Trayectos (paso 3.3): desde un parque hasta un lugar o una calle del distrito, con todas las calles del camino.
  // `trayectos` es lo que devuelve prepararTrayectos; cada pregunta se calcula al salir (tarda un poco).
  if (trayectos) {
    for (const destino of destinosTrayecto(trayectos, { zona: distrito, importancia: maximo })) {
      for (const parque of PARQUES) {
        r.trayectos.push(() => {
          const t = crearTrayecto(trayectos, parque.id, destino, azar)
          if (!t) return null
          const { opciones, correcta } = recortarOpciones(
            t.opciones.map((o) => o.texto),
            t.correcta,
            azar,
          )
          return {
            id: `trayecto:${t.id}`,
            tema: 'trayectos',
            tarjeta: null,
            pregunta: t.enunciado,
            opciones,
            correcta,
            explicacion: explicarTrayecto(t),
            enlace: destino.enlace,
          }
        })
      }
    }
  }
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
