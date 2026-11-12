// Preguntas con la forma de las de los exámenes de 2020, 2022 y 2025 (paso 3.5), hechas con los datos de la app. Son
// tarjetas como las demás, pero con sus tres opciones escritas (a, b, c, como en el examen): en Tarjetas se ven las
// opciones, en el Kahoot se añade una cuarta ("extra") y en el Test salen tal cual. Las opciones se eligen siempre igual
// para la misma tarjeta (con su id de semilla), para que la tarjeta no cambie de un día a otro.
//
// Solo se pregunta lo que los datos dicen con claridad: calles sin tramos dudosos, sitios con su dirección real (de
// OpenStreetMap o de la lista oficial, no la del portal más cercano)...
// Este archivo no usa nada del navegador, así que se puede probar con Node.

// Números al azar, pero siempre los mismos para el mismo texto
export function semilla(texto) {
  let h = 2166136261
  for (const letra of texto) {
    h ^= letra.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}

export const barajar = (lista, azar) =>
  lista
    .map((x) => [azar(), x])
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x)

// Tarjeta con sus opciones. "falsas": las candidatas por orden de preferencia (se cogen dos, mezcladas entre las más
// parecidas, y una tercera para el Kahoot). "orden": las tres opciones ya escritas, en su orden (como «A y B son correctas»).
export function conOpciones({ id, mazo, distrito = null, enlace, pregunta, buena, falsas = [], orden = null, extra = null, detalle = null }) {
  const azar = semilla(id)
  let opciones = orden
  let cuarta = extra
  if (!opciones) {
    const distintas = [...new Set(falsas)].filter((x) => x && x !== buena)
    if (distintas.length < 2) return null
    // Las dos falsas, de entre las seis primeras candidatas (las más parecidas)
    const [f1, f2, f3] = barajar(distintas.slice(0, 6), azar)
    opciones = barajar([buena, f1, f2], azar)
    cuarta ??= f3 ?? distintas[6] ?? null
  }
  if (!opciones.includes(buena)) return null
  return {
    id,
    mazo,
    distrito,
    enlace,
    pregunta,
    respuesta: buena,
    detalle,
    datos: { opciones, ...(cuarta && { extra: cuarta }), ...(orden && { orden: true }) },
  }
}

const sinTildes = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const TIPO_DE_VIA = /^(calle|avenida|plaza|placeta|plazoleta|paseo|camino|cuesta|callejon|carrera|carril|barranco|pasaje|glorieta)\s+((de|del|de la|de los|de las)\s+)?/
// Si el nombre de un sitio lleva el de su calle («Corrala de Santiago», en Calle Santiago), la pregunta se responde sola
export function nombreLlevaLaCalle(nombre, calle) {
  return sinTildes(nombre).includes(sinTildes(calle).replace(TIPO_DE_VIA, ''))
}

// Sentido de una calle a partir de su reparto ([% doble, % único hacia el final, % hacia el inicio, % peatonal])
function claseDeSentido(c) {
  if (!c.reparto || c.tramosDudosos || c.dudas) return null
  const [doble, final, inicio, peatonal] = c.reparto
  if (peatonal >= 95) return 'peatonal'
  if (peatonal > 2) return null
  if (doble >= 95) return 'doble'
  if (final >= 95) return 'final'
  if (inicio >= 95) return 'inicio'
  if (doble >= 15 && final + inicio >= 15) return 'alternativa'
  return null
}

// «la Calle X», «el Camino X»; «a la» → «al» y «de la» → «del» con los nombres masculinos
const MASCULINOS = /^(Camino|Paseo|Callejón|Carril|Pasaje|Barranco|Lugar|Acceso|Enlace|Puente|Parque|Barrio|Vial)\b/
const masculino = (nombre) => MASCULINOS.test(nombre)
export const el = (nombre) => `${masculino(nombre) ? 'el' : 'la'} ${nombre}`
const El = (nombre) => `${masculino(nombre) ? 'El' : 'La'} ${nombre}`
const aEl = (nombre) => `${masculino(nombre) ? 'al' : 'a la'} ${nombre}`
const deEl = (nombre) => `${masculino(nombre) ? 'del' : 'de la'} ${nombre}`
// Calles que en realidad son carreteras o enlaces: no se pregunta por ellas como calles
const NO_ES_CALLE = new Set(['Autovía', 'Carretera', 'Enlace', 'Acceso', 'Vial', 'Rotonda'])

const ES_TODA = {
  doble: 'De doble sentido en toda su longitud',
  unico: 'De sentido único en toda su longitud',
  alternativa: 'De sentido único y doble sentido de forma alternativa',
}
const ES_TIPO = { unico: 'De sentido único', doble: 'De doble sentido', peatonal: 'Peatonal' }
const LAS_DOS_SIN_SALIDA = 'Las dos calles son sin salida'
const A_Y_B = 'A y B son correctas'

// Tarjetas de las calles y los lugares de Granada, por mazo
export function tarjetasDeExamen({ calles, lugares, altos = [] }) {
  const mazos = { zona: [], extremos: [], sentido: [], cruces: [], lugares: [], edificios: [] }
  const anadir = (t) => t && mazos[t.mazo].push(t)
  const enlaceCalle = (c) => `#/mapa?calle=${c.id}`
  const unicaDeNombre = new Map()
  for (const c of calles) unicaDeNombre.set(c.nombre, unicaDeNombre.has(c.nombre) ? null : c)
  const callePorNombre = (n) => unicaDeNombre.get(n) ?? null
  const tocanA = new Map(calles.map((c) => [c.id, new Set([...c.cruces, ...c.inicio, ...c.fin].filter((n) => n !== c.nombre))]))
  const tocaA = (c) => tocanA.get(c.id)
  const delBarrio = new Map()
  const delDistrito = new Map()
  for (const c of calles) {
    for (const b of c.barrios) delBarrio.set(b, [...(delBarrio.get(b) ?? []), c])
    for (const d of c.distritos) delDistrito.set(d, [...(delDistrito.get(d) ?? []), c])
  }
  // Calles de alrededor (mismo barrio y, si no hay bastantes, mismo distrito), sin la propia
  const alrededor = (c) =>
    [...new Set([...(delBarrio.get(c.barrios[0]) ?? []), ...(delDistrito.get(c.distritos[0]) ?? [])])].filter((x) => x.id !== c.id && !NO_ES_CALLE.has(x.tipo) && callePorNombre(x.nombre) === x)

  // Barrio de cada distrito (el de la mayoría de sus calles)
  const distritoDeBarrio = new Map()
  {
    const cuenta = new Map()
    for (const c of calles) {
      if (c.distritos.length !== 1) continue
      for (const b of c.barrios) cuenta.set(`${b}|${c.distritos[0]}`, (cuenta.get(`${b}|${c.distritos[0]}`) ?? 0) + 1)
    }
    for (const [clave, n] of [...cuenta].sort((a, b) => b[1] - a[1])) {
      const [b, d] = clave.split('|')
      if (!distritoDeBarrio.has(b) && n >= 3) distritoDeBarrio.set(b, d)
    }
  }
  const barriosDe = (d) => [...distritoDeBarrio].filter(([, x]) => x === d).map(([b]) => b)

  for (const c of calles) {
    // Dos calles con el mismo nombre en sitios distintos: no se sabe de cuál se habla
    if (callePorNombre(c.nombre) !== c || NO_ES_CALLE.has(c.tipo)) continue
    const base = { distrito: c.distritos[0] ?? null, enlace: enlaceCalle(c) }
    const azar = semilla(`calle:${c.id}`)
    const suyas = alrededor(c)

    // «La calle X, ¿a qué barrio pertenece?» (2022 y 2025): las falsas, barrios de las calles con que se cruza y del distrito
    if (c.barrios.length === 1 && c.distritos.length === 1 && distritoDeBarrio.get(c.barrios[0]) === c.distritos[0]) {
      const deCruces = [...tocaA(c)].map(callePorNombre).filter(Boolean).flatMap((x) => x.barrios)
      anadir(
        conOpciones({
          ...base,
          id: `zona:${c.id}:barrio`,
          mazo: 'zona',
          pregunta: `${El(c.nombre)}, ¿a qué barrio pertenece?`,
          buena: c.barrios[0],
          falsas: [...new Set([...deCruces, ...barajar(barriosDe(c.distritos[0]), azar)])].filter((b) => b !== c.barrios[0]),
          detalle: `Distrito ${c.distritos[0]}.`,
        }),
      )
    }

    // «¿Entre qué calles se encuentra X?» (2020 y 2025)
    if (c.inicio.length === 1 && c.fin.length === 1 && c.inicio[0] !== c.fin[0] && c.cruces.length >= 1) {
      const [i, f] = [c.inicio[0], c.fin[0]]
      const [x, y] = barajar(c.cruces, azar)
      const otra = y ?? barajar([...tocaA(callePorNombre(i) ?? c)].filter((n) => ![i, f, c.nombre, x].includes(n)), azar)[0]
      anadir(
        conOpciones({
          ...base,
          id: `extremos:${c.id}:entre`,
          mazo: 'extremos',
          pregunta: `¿Entre qué calles se encuentra ${el(c.nombre)}?`,
          buena: `Entre ${i} y ${f}`,
          falsas: [`Entre ${i} y ${x}`, otra && `Entre ${otra} y ${f}`, otra && `Entre ${x} y ${otra}`].filter(Boolean),
          detalle: `Por el medio cruza ${c.cruces.length} calle${c.cruces.length > 1 ? 's' : ''}: ${c.cruces.join(', ')}.`,
        }),
      )
    }

    // Sentido, como en el examen de 2022: «La calle X es: de doble sentido en toda su longitud / de sentido único en toda
    // su longitud / alternativa», «es: de sentido único / de doble sentido / peatonal» y «tiene su dirección hacia...»
    const clase = claseDeSentido(c)
    if (clase && clase !== 'peatonal' && c.importancia <= 4 && c.longitud >= 150) {
      const buena = clase === 'doble' ? ES_TODA.doble : clase === 'alternativa' ? ES_TODA.alternativa : ES_TODA.unico
      anadir(
        conOpciones({
          ...base,
          id: `sentido:${c.id}:es`,
          mazo: 'sentido',
          pregunta: `${El(c.nombre)} es:`,
          buena,
          orden: [ES_TODA.doble, ES_TODA.unico, ES_TODA.alternativa],
          extra: 'Peatonal en toda su longitud',
          detalle: `Doble sentido en el ${c.reparto[0]} % de la calle, sentido único en el ${c.reparto[1] + c.reparto[2]} %.`,
        }),
      )
    } else if (clase && clase !== 'alternativa') {
      const tipo = clase === 'peatonal' ? 'peatonal' : clase === 'doble' ? 'doble' : 'unico'
      anadir(
        conOpciones({
          ...base,
          id: `sentido:${c.id}:tipo`,
          mazo: 'sentido',
          pregunta: `${El(c.nombre)} es:`,
          buena: ES_TIPO[tipo],
          orden: [ES_TIPO.unico, ES_TIPO.doble, ES_TIPO.peatonal],
          extra: 'Cambia según el tramo',
        }),
      )
    }
    if (clase && clase !== 'alternativa' && clase !== 'peatonal' && c.inicio.length === 1 && c.fin.length === 1 && c.inicio[0] !== c.fin[0]) {
      const doble = 'Es de doble dirección'
      anadir(
        conOpciones({
          ...base,
          id: `sentido:${c.id}:hacia`,
          mazo: 'sentido',
          pregunta: `${El(c.nombre)} tiene su dirección hacia la calle:`,
          buena: clase === 'doble' ? doble : clase === 'final' ? c.fin[0] : c.inicio[0],
          orden: [c.inicio[0], c.fin[0], doble],
          extra: 'Es peatonal',
          detalle: `Va de ${c.inicio[0]} a ${c.fin[0]}.`,
        }),
      )
    }
    // «¿En cuál de estas calles no puede circular un vehículo?» (2025): la peatonal
    if (clase === 'peatonal') {
      const conCoche = suyas.filter((x) => ['doble', 'final', 'inicio'].includes(claseDeSentido(x)) && x.reparto[3] === 0)
      anadir(
        conOpciones({
          ...base,
          id: `sentido:${c.id}:peatonal`,
          mazo: 'sentido',
          pregunta: '¿Por cuál de estas calles no se puede circular con un vehículo (es peatonal)?',
          buena: c.nombre,
          falsas: barajar(conCoche, azar).map((x) => x.nombre),
          detalle: `${c.nombre} es peatonal; las otras son para coches.`,
        }),
      )
    }
    // «¿Cuál de estas calles es sin salida para vehículos?» (2025), con «Las dos calles son sin salida»
    if (c.salida === 'sin') {
      const conSalida = barajar(
        suyas.filter((x) => x.salida === 'con'),
        azar,
      )[0]
      if (conSalida) {
        const dos = barajar([c.nombre, conSalida.nombre], azar)
        anadir(
          conOpciones({
            ...base,
            id: `sentido:${c.id}:sin-salida`,
            mazo: 'sentido',
            pregunta: '¿Cuál de las calles que a continuación se citan es una calle sin salida para vehículos?',
            buena: c.nombre,
            orden: [...dos, LAS_DOS_SIN_SALIDA],
            extra: 'Ninguna de las dos',
            detalle: `${c.nombre} tiene un extremo al que no llega ninguna otra calle de coches; ${conSalida.nombre} tiene salida por los dos lados.`,
          }),
        )
      }
    }

    // Acceso a una calle (2022): «¿cuál da acceso?», «¿cuál NO da acceso directo?», «A y B son correctas» y «¿a qué
    // localización nos da acceso?». Dar acceso = tocarla: al principio, al final o cruzándola.
    const tocan = [...tocaA(c)]
    const noTocan = suyas.filter((x) => !tocaA(c).has(x.nombre) && !tocaA(x).has(c.nombre) && x.nombre !== c.nombre && callePorNombre(x.nombre)).map((x) => x.nombre)
    if (tocan.length >= 2 && noTocan.length >= 3) {
      const [t1, t2] = barajar(tocan, azar)
      const [n1, n2, n3] = barajar(noTocan.slice(0, 12), azar)
      anadir(
        conOpciones({
          ...base,
          id: `cruces:${c.id}:acceso`,
          mazo: 'cruces',
          pregunta: `¿Cuál de las siguientes calles da acceso ${aEl(c.nombre)}?`,
          buena: t1,
          falsas: [n1, n2, n3],
          detalle: `A ${c.nombre} se llega desde ${tocan.join(', ')}.`,
        }),
      )
      anadir(
        conOpciones({
          ...base,
          id: `cruces:${c.id}:no-acceso`,
          mazo: 'cruces',
          pregunta: `¿Cuál de las siguientes calles NO da acceso directo, ni a pie ni en coche, ${aEl(c.nombre)}?`,
          buena: n1,
          falsas: barajar(tocan, azar),
          detalle: `${n1} no la toca. Las que sí: ${tocan.join(', ')}.`,
        }),
      )
      const ambas = azar() < 0.5
      anadir(
        conOpciones({
          ...base,
          id: `cruces:${c.id}:ayb`,
          mazo: 'cruces',
          pregunta: `${aEl(c.nombre).replace(/^a/, 'A')} podemos acceder directamente a través de:`,
          buena: ambas ? A_Y_B : t1,
          orden: ambas ? [t1, t2, A_Y_B] : barajar([t1, n2], azar).concat(A_Y_B),
          extra: 'Ninguna de las dos',
          detalle: `A ${c.nombre} se llega desde ${tocan.join(', ')}.`,
        }),
      )
    }
    const plazas = tocan.filter((n) => /^(Plaza|Placeta|Plazoleta|Glorieta)\b/.test(n))
    if (plazas.length) {
      // Plazas de alrededor que no la tocan (ni ella a ellas)
      const otrasPlazas = suyas
        .filter((x) => /^(Plaza|Placeta|Plazoleta)\b/.test(x.nombre) && !tocan.includes(x.nombre) && !tocaA(x).has(c.nombre))
        .map((x) => x.nombre)
      anadir(
        conOpciones({
          ...base,
          id: `cruces:${c.id}:localizacion`,
          mazo: 'cruces',
          pregunta: `¿A qué localización nos da acceso ${el(c.nombre)}?`,
          buena: barajar(plazas, azar)[0],
          falsas: barajar(otrasPlazas, azar),
          detalle: `${c.nombre} toca ${tocan.join(', ')}.`,
        }),
      )
    }
  }

  // «¿Cuál de estos barrios no pertenece al distrito X?» (2025)
  const distritos = [...new Set(distritoDeBarrio.values())]
  for (const d of distritos) {
    const suyos = barriosDe(d)
    if (suyos.length < 2) continue
    for (const [ajeno, otro] of distritoDeBarrio) {
      if (otro === d) continue
      anadir(
        conOpciones({
          id: `zona:distrito:${d}:no:${ajeno}`,
          mazo: 'zona',
          distrito: d,
          enlace: '#/mapa',
          pregunta: `¿Cuál de estos barrios no pertenece al distrito ${d}?`,
          buena: ajeno,
          falsas: suyos,
          detalle: `${ajeno} es del distrito ${otro}. Los del distrito ${d}: ${suyos.join(', ')}.`,
        }),
      )
    }
  }

  // Lugares con su dirección real (OpenStreetMap o la lista oficial; no la del portal más cercano)
  const reales = lugares.filter((l) => l.direccion && ['osm', 'material'].includes(l.direccionSegun) && l.via)
  const callePorId = new Map(calles.map((c) => [c.id, c]))
  const porDireccion = new Map()
  const conNumero = [
    ...reales.map((l) => ({ nombre: l.nombre, direccion: l.direccion, id: `lugares:${l.id}:numero`, mazo: 'lugares', distrito: l.distrito, enlace: `#/mapa?lugar=${l.id}`, categoria: l.categoria })),
    ...altos.filter((a) => a.nombre && a.direccion).map((a) => ({ nombre: a.nombre, direccion: a.direccion, id: `edificios:alto:${a.refcat}:numero`, mazo: 'edificios', distrito: a.distrito, enlace: `#/mapa?lugar=${a.id}`, categoria: 'Edificios de gran altura' })),
  ].filter((x) => /, \d+[A-Za-z]?$/.test(x.direccion))
  for (const x of conNumero) porDireccion.set(x.direccion, [...(porDireccion.get(x.direccion) ?? []), x])
  for (const x of conNumero) {
    // Dos sitios en el mismo número no sirven
    if (porDireccion.get(x.direccion).length > 1) continue
    const [calle, numero] = [x.direccion.slice(0, x.direccion.lastIndexOf(',')), x.direccion.slice(x.direccion.lastIndexOf(',') + 2)]
    if (nombreLlevaLaCalle(x.nombre, calle)) continue
    const mismaCalle = conNumero.filter((o) => o !== x && o.direccion.startsWith(`${calle},`)).map((o) => o.nombre)
    const parecidos = conNumero.filter((o) => o !== x && o.categoria === x.categoria && o.distrito === x.distrito).map((o) => o.nombre)
    anadir(
      conOpciones({
        id: x.id,
        mazo: x.mazo,
        distrito: x.distrito,
        enlace: x.enlace,
        pregunta: `¿Qué se encuentra en el número ${numero} ${deEl(calle)}?`,
        buena: x.nombre,
        falsas: [...mismaCalle, ...parecidos],
        detalle: x.direccion,
      }),
    )
  }
  // «¿Desde qué calle se accede a X?» (2020, 2022 y 2025): la calle de su dirección; las falsas, calles que la tocan
  for (const l of reales) {
    const c = callePorId.get(l.via)
    if (!c || nombreLlevaLaCalle(l.nombre, c.nombre)) continue
    const azar = semilla(`lugar:${l.id}`)
    anadir(
      conOpciones({
        id: `lugares:${l.id}:acceso`,
        mazo: 'lugares',
        distrito: l.distrito,
        enlace: `#/mapa?lugar=${l.id}`,
        pregunta: `¿Desde qué calle se accede a ${l.nombre}?`,
        buena: c.nombre,
        falsas: [...barajar([...tocaA(c)], azar), ...alrededor(c).map((x) => x.nombre)],
        detalle: `${l.direccion}${l.direccionSegun === 'material' ? ' (lista oficial de edificios singulares)' : ''}.`,
      }),
    )
  }
  return mazos
}
