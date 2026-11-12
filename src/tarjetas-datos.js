// Crea las tarjetas de repaso (paso 1.6) a partir de los datos de calles, lugares y ejes, y de la zona de los
// parques de Granada (paso 2.5: sus tarjetas salen de src/zona-preguntas.js). Con el material de la persona
// (paso 3.5): el distrito y el parque de bomberos de cada sitio, los edificios singulares y de gran altura, y
// cómo incorporarse a una calle desde otra (en el mazo de sentidos).
// Cada tarjeta tiene un id fijo (el progreso se guarda por id) y su texto se calcula con los datos del
// momento, así que si se corrige un dato la tarjeta muestra ya la respuesta corregida.
// Este archivo no usa nada del navegador, así que se puede probar con Node.
import { nombreLlevaLaCalle, tarjetasDeExamen } from './preguntas-examen.js'
import { tarjetasZona } from './zona-preguntas.js'

export { nombreLlevaLaCalle }

export const MAZOS = [
  { id: 'zona', nombre: 'Distrito y barrio de cada calle' },
  { id: 'extremos', nombre: 'Dónde empieza y dónde termina cada calle' },
  { id: 'sentido', nombre: 'Sentido de circulación' },
  { id: 'cruces', nombre: 'Cruces de los ejes, en orden' },
  { id: 'lugares', nombre: 'En qué calle está cada lugar' },
  { id: 'carreteras', nombre: 'Pueblos, salidas, carreteras y polígonos de la zona' },
  { id: 'parques', nombre: 'Distrito y parque de bomberos de cada sitio' },
  { id: 'edificios', nombre: 'Edificios singulares y de gran altura' },
]

// Cómo se entra en una calle desde otra (examen de 2022), con las cuatro respuestas del Kahoot
export const GIROS = {
  derecha: 'Girando a la derecha',
  izquierda: 'Girando a la izquierda',
  ambos: 'Girando a derecha o izquierda indistintamente',
}
const SEGUIR_RECTO = 'Siguiendo recto'
const DISTRITOS = ['Albaicín', 'Beiro', 'Centro', 'Chana', 'Genil', 'Norte', 'Ronda', 'Zaidín']
const textoDistritoParque = (distrito, parque) => `Distrito ${distrito}, Parque ${parque}`

// Los lugares más útiles para un bombero, primero
const ORDEN_LUGARES = [
  'Hospitales', 'Bomberos', 'Policía', 'Centros de salud', 'Edificios oficiales', 'Colegios e institutos',
  'Universidad y formación', 'Residencias y centros sociales', 'Monumentos', 'Estatuas y esculturas',
  'Iglesias y templos', 'Cultura', 'Miradores', 'Transporte', 'Instalaciones deportivas', 'Parques y jardines',
  'Centros comerciales y mercados', 'Escuelas infantiles', 'Cementerios', 'Fuentes',
]
// Los edificios singulares (lista oficial) van los primeros
ORDEN_LUGARES.unshift('Edificios singulares')
const LADOS = { i: 'sale a la izquierda', d: 'sale a la derecha', a: 'la atraviesa' }

const juntar = (lista) => (lista.length <= 1 ? lista.join('') : `${lista.slice(0, -1).join(', ')} y ${lista.at(-1)}`)
const juntarO = (lista) => lista.join(' / ')

// Primero las calles importantes con más cruces (suelen ser las del centro), después las largas
const porImportancia = (a, b) => a.importancia - b.importancia || b.cruces.length - a.cruces.length || b.longitud - a.longitud

// Inicio y fin solo sirven si son calles distintas (algunas vías salen y vuelven a la misma carretera)
const extremosClaros = (c) => c.inicio.length > 0 && c.fin.length > 0 && !c.inicio.some((n) => c.fin.includes(n))

function sentidoClaro(c) {
  if (c.dudas || c.tramosDudosos > 0) return null // aún por revisar: mejor no estudiarlo todavía
  if (c.sentido === 'doble') return 'Doble sentido'
  if (c.sentido === 'peatonal') return 'Peatonal'
  if (!extremosClaros(c)) return null
  if (c.sentido === 'hacia el final') return `Sentido único, de ${c.inicio[0]} hacia ${c.fin[0]}`
  if (c.sentido === 'hacia el inicio') return `Sentido único, de ${c.fin[0]} hacia ${c.inicio[0]}`
  return null
}

// Respuestas falsas de «¿a qué distrito y parque pertenece?»: el mismo distrito con el otro parque y los distritos
// de alrededor (los de las calles con las que se cruza) con los dos parques
function falsasDistritoParque(distrito, parque, cercanos) {
  const otro = parque === 'Norte' ? 'Sur' : 'Norte'
  const otros = [...new Set([...cercanos, ...DISTRITOS])].filter((d) => d !== distrito)
  return [textoDistritoParque(distrito, otro), ...otros.slice(0, 3).flatMap((d) => [textoDistritoParque(d, parque), textoDistritoParque(d, otro)])]
}

// "zona" ({ municipios, salidas, poligonos, redes }) es opcional: sin ella, el mazo de la zona queda vacío.
// "altos": los edificios de gran altura (altos.json).
export function crearTarjetas({ calles, lugares, ejes, zona = null, altos = [] }) {
  const ordenadas = [...calles].sort(porImportancia)
  const mazos = Object.fromEntries(MAZOS.map((m) => [m.id, []]))
  if (zona) mazos.carreteras = tarjetasZona(zona)
  const distritoDeCalle = new Map(calles.map((c) => [c.nombre, c.distritos[0]]))

  for (const c of ordenadas) {
    const base = { distrito: c.distritos[0] ?? null, enlace: `#/mapa?calle=${c.id}` }
    if (c.distritos.length) {
      mazos.zona.push({
        ...base,
        id: `zona:${c.id}`,
        mazo: 'zona',
        pregunta: `¿En qué distrito y barrio está ${c.nombre}?`,
        respuesta: `Distrito ${juntar(c.distritos)}`,
        detalle: c.barrios.length ? `Barrio${c.barrios.length > 1 ? 's' : ''}: ${juntar(c.barrios)}` : null,
      })
    }
    if (extremosClaros(c)) {
      mazos.extremos.push({
        ...base,
        id: `extremos:${c.id}`,
        mazo: 'extremos',
        pregunta: `¿Dónde empieza y dónde termina ${c.nombre}?`,
        respuesta: `Empieza en ${juntarO(c.inicio)} y termina en ${juntarO(c.fin)}`,
        datos: { inicio: c.inicio, fin: c.fin, cruces: c.cruces },
      })
    }
    const sentido = sentidoClaro(c)
    if (sentido) {
      mazos.sentido.push({
        ...base,
        id: `sentido:${c.id}`,
        mazo: 'sentido',
        pregunta: `¿Cómo se circula por ${c.nombre}?`,
        respuesta: sentido,
        detalle: extremosClaros(c) ? `Va de ${c.inicio[0]} a ${c.fin[0]}.` : null,
        datos: extremosClaros(c) ? { inicio: c.inicio[0], fin: c.fin[0] } : null,
      })
    }
    // «¿Cómo podemos incorporarnos a A desde B?» (calculado con la red de los trayectos)
    // Si la otra calle está en los dos extremos (una calle en U), no se sabe por cuál se llega: fuera
    const otras = (c.incorporaciones ?? []).map((x) => x.calle)
    for (const x of (c.incorporaciones ?? []).filter((y) => otras.indexOf(y.calle) === otras.lastIndexOf(y.calle))) {
      const respuesta = GIROS[x.giro]
      mazos.sentido.push({
        ...base,
        id: `sentido:${c.id}:incorporar:${x.calle}`,
        mazo: 'sentido',
        pregunta: `¿Cómo podemos incorporarnos a ${x.calle} desde ${c.nombre}?`,
        respuesta,
        detalle: `Al llegar al final de ${c.nombre}, según el sentido de ${x.calle} y los giros permitidos.`,
        datos: { falsas: [...Object.values(GIROS), SEGUIR_RECTO].filter((g) => g !== respuesta) },
      })
    }
    // Distrito y parque de bomberos (paso 3.5: línea del PDF entre el Parque Norte y el Parque Sur)
    if (['Norte', 'Sur'].includes(c.parque) && !c.parqueAproximado && c.distritos.length === 1) {
      const cercanos = [...c.inicio, ...c.fin, ...c.cruces].map((n) => distritoDeCalle.get(n)).filter(Boolean)
      mazos.parques.push({
        ...base,
        id: `parques:c:${c.id}`,
        mazo: 'parques',
        pregunta: `¿A qué distrito y parque de bomberos pertenece ${c.nombre}?`,
        respuesta: textoDistritoParque(c.distritos[0], c.parque),
        detalle: c.barrios.length ? `Barrio${c.barrios.length > 1 ? 's' : ''}: ${juntar(c.barrios)}.` : null,
        datos: { falsas: falsasDistritoParque(c.distritos[0], c.parque, cercanos) },
      })
    }
  }

  // Cruces de los ejes: "después de esta calle, ¿cuál viene?", en el orden de la línea
  for (const eje of [...ejes].sort(porImportancia)) {
    const desde = eje.inicio[0]
    eje.cruces.forEach((cruce, i) => {
      const lado = LADOS[eje.lados?.[i]]
      mazos.cruces.push({
        id: `cruces:${eje.id}:${cruce}`,
        mazo: 'cruces',
        distrito: eje.distritos[0] ?? null,
        enlace: `#/ejes?id=${eje.id}`,
        pregunta:
          i === 0
            ? `${eje.nombre}${desde ? `, saliendo de ${desde}` : ''}: ¿cuál es la primera calle que se encuentra?`
            : `${eje.nombre}${desde ? `, yendo desde ${desde}` : ''}: ¿qué calle viene después de ${eje.cruces[i - 1]}?`,
        respuesta: cruce,
        detalle: lado ? `${cruce} ${lado}.` : null,
        datos: { cruces: eje.cruces, indice: i },
      })
    })
  }

  const rango = (l) => (ORDEN_LUGARES.indexOf(l.categoria) + 1 || ORDEN_LUGARES.length + 1)
  // Fuera los lugares cuya dirección repite su nombre ("Plaza X" en "Plaza X, 11"): se responden solos
  const simple = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const seRespondeSolo = (l) => {
    const calle = simple(l.direccion.split(',')[0])
    return calle.includes(simple(l.nombre)) || simple(l.nombre).includes(calle)
  }
  for (const l of [...lugares].filter((x) => x.direccion && !seRespondeSolo(x)).sort((a, b) => rango(a) - rango(b))) {
    mazos.lugares.push({
      id: `lugares:${l.id}`,
      mazo: 'lugares',
      distrito: l.distrito,
      enlace: `#/mapa?lugar=${l.id}`,
      pregunta: `¿En qué calle está ${l.nombre}?`,
      respuesta: l.direccion,
      detalle: [
        `${l.categoria} · ${[l.distrito, l.barrio].filter(Boolean).join(', ')}.`,
        ['portal', 'cercania'].includes(l.direccionSegun) && 'Dirección aproximada (portal más cercano).',
        l.direccionSegun === 'material' && 'Calle de la lista oficial de edificios singulares.',
      ]
        .filter(Boolean)
        .join(' '),
      datos: { categoria: l.categoria, via: l.via },
    })
  }

  // Distrito y parque de bomberos de cada lugar
  for (const l of [...lugares].sort((a, b) => rango(a) - rango(b))) {
    if (!['Norte', 'Sur'].includes(l.parque) || l.parqueAproximado || !l.distrito) continue
    mazos.parques.push({
      id: `parques:l:${l.id}`,
      mazo: 'parques',
      distrito: l.distrito,
      enlace: `#/mapa?lugar=${l.id}`,
      pregunta: `¿A qué distrito y parque de bomberos pertenece ${l.nombre}?`,
      respuesta: textoDistritoParque(l.distrito, l.parque),
      detalle: [`${l.categoria}.`, l.direccion && `${l.direccion}.`].filter(Boolean).join(' '),
      datos: { falsas: falsasDistritoParque(l.distrito, l.parque, []) },
    })
  }
  // Las calles y los lugares, intercalados (si no, salen primero cientos de calles)
  const callesParque = mazos.parques.filter((t) => t.id.startsWith('parques:c:'))
  const lugaresParque = mazos.parques.filter((t) => t.id.startsWith('parques:l:'))
  mazos.parques = []
  for (let i = 0; i < Math.max(callesParque.length, lugaresParque.length); i++) mazos.parques.push(callesParque[i], lugaresParque[i])
  mazos.parques = mazos.parques.filter(Boolean)

  // Edificios singulares: «¿qué edificio singular está en la calle X?» (si en esa calle solo hay uno)
  const singulares = lugares.filter((l) => l.singular && l.via)
  for (const l of singulares) {
    const calle = l.direccion.split(',')[0]
    if (singulares.filter((x) => x.via === l.via).length > 1 || nombreLlevaLaCalle(l.nombre, calle)) continue
    mazos.edificios.push({
      id: `edificios:singular:${l.id}`,
      mazo: 'edificios',
      distrito: l.distrito,
      enlace: `#/mapa?lugar=${l.id}`,
      pregunta: `¿Qué edificio singular se encuentra en ${calle}?`,
      respuesta: l.nombre,
      detalle: `${l.direccion} · ${[l.distrito, l.barrio].filter(Boolean).join(', ')}.`,
      datos: {
        falsas: [...singulares.filter((x) => x.distrito === l.distrito), ...singulares].map((x) => x.nombre).filter((n) => n !== l.nombre),
      },
    })
  }
  // Edificios de gran altura: «¿cuántas plantas tiene...?» (solo los de dirección con número y sin repetir)
  const vecesDireccion = new Map()
  for (const a of altos) vecesDireccion.set(a.direccion, (vecesDireccion.get(a.direccion) ?? 0) + 1)
  const plantas = (n) => `${n} plantas`
  for (const a of altos) {
    if (!a.direccion || a.direccion.endsWith('s/n') || vecesDireccion.get(a.direccion) > 1) continue
    mazos.edificios.push({
      id: `edificios:alto:${a.refcat}`,
      mazo: 'edificios',
      distrito: a.distrito,
      enlace: `#/mapa?lugar=${a.id}`,
      pregunta: `¿Cuántas plantas tiene el edificio de ${a.direccion}${a.nombre ? ` (${a.nombre})` : ''}?`,
      respuesta: plantas(a.plantas),
      detalle: `Según el Catastro (plantas sobre rasante, contando la baja). Distrito ${a.distrito}, Parque ${a.parque}.`,
      datos: { falsas: [-2, 2, -1, 1, 3, -3, 4].map((d) => a.plantas + d).filter((n) => n > 0).map(plantas) },
    })
  }

  // Preguntas con la forma de las de los exámenes (src/preguntas-examen.js), cada una en su mazo
  // Intercaladas con las de siempre, para que salgan desde el primer día entre las tarjetas nuevas
  for (const [mazo, lista] of Object.entries(tarjetasDeExamen({ calles, lugares, altos }))) {
    const antes = mazos[mazo]
    mazos[mazo] = []
    for (let i = 0; i < Math.max(antes.length, lista.length); i++) mazos[mazo].push(...[antes[i], lista[i]].filter(Boolean))
  }
  return mazos
}

// Modo test (estilo Kahoot): la respuesta buena y tres falsas que se le parezcan, desordenadas.
// Devuelve null si no hay forma de inventar tres respuestas falsas creíbles para esa tarjeta.
const barajar = (lista, azar) =>
  lista
    .map((x) => [azar(), x])
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x)

function elegir(candidatas, cuantas, correcta, azar) {
  const distintas = [...new Set(candidatas)].filter((x) => x && x !== correcta)
  return barajar(distintas, azar).slice(0, cuantas)
}

export function crearOpciones(t, mazos, azar = Math.random) {
  const correcta = t.respuesta
  const algunaDe = (lista) => lista[Math.floor(azar() * lista.length)]
  let falsas = []
  if (t.datos?.opciones) {
    // Tarjetas con sus opciones escritas (como en el examen): esas y una cuarta, si la hay
    const todas = [...t.datos.opciones, ...(t.datos.extra ? [t.datos.extra] : [])]
    return t.datos.orden ? todas : barajar(todas, azar)
  }
  // Las tarjetas de siempre de cada mazo (sin las que traen sus opciones escritas), para sacar de ellas respuestas falsas
  const clasicas = (mazo) => mazos[mazo].filter((x) => !x.datos?.opciones && !x.datos?.falsas)
  if (t.datos?.falsas) {
    // Las tarjetas que ya traen sus respuestas falsas más parecidas (zona, parques, edificios, incorporaciones)
    falsas = elegir(t.datos.falsas, 3, correcta, azar)
  } else if (t.mazo === 'zona') {
    falsas = elegir(clasicas('zona').map((x) => x.respuesta), 3, correcta, azar)
  } else if (t.mazo === 'extremos') {
    // La buena al revés y mezclas con calles que de verdad cruza
    const { inicio, fin, cruces } = t.datos
    const otras = cruces.length >= 2 ? cruces : clasicas('extremos').map((x) => x.datos.inicio[0])
    const [i, f] = [juntarO(inicio), juntarO(fin)]
    falsas = elegir(
      [
        `Empieza en ${f} y termina en ${i}`,
        `Empieza en ${i} y termina en ${algunaDe(otras)}`,
        `Empieza en ${algunaDe(otras)} y termina en ${f}`,
        `Empieza en ${algunaDe(otras)} y termina en ${i}`,
      ],
      3,
      correcta,
      azar,
    )
  } else if (t.mazo === 'sentido') {
    if (!t.datos) return null
    const { inicio, fin } = t.datos
    falsas = elegir(
      ['Doble sentido', 'Peatonal', `Sentido único, de ${inicio} hacia ${fin}`, `Sentido único, de ${fin} hacia ${inicio}`],
      3,
      correcta,
      azar,
    )
  } else if (t.mazo === 'cruces') {
    // Otras calles del mismo eje, de las más cercanas en el orden (sin la que sale en la pregunta)
    const { cruces, indice } = t.datos
    const cercanas = cruces
      .map((c, j) => [Math.abs(j - indice), c, j])
      .filter(([, , j]) => j !== indice && j !== indice - 1)
      .sort((a, b) => a[0] - b[0])
      .slice(0, 6)
      .map(([, c]) => c)
    falsas = elegir(cercanas, 3, correcta, azar)
    if (falsas.length < 3) falsas.push(...elegir(clasicas('cruces').map((x) => x.respuesta), 3 - falsas.length, correcta, azar))
  } else if (t.mazo === 'lugares') {
    const mismoTipo = clasicas('lugares').filter((x) => x.datos.categoria === t.datos.categoria && x.datos.via !== t.datos.via)
    falsas = elegir(mismoTipo.map((x) => x.respuesta), 3, correcta, azar)
    if (falsas.length < 3) falsas.push(...elegir(clasicas('lugares').map((x) => x.respuesta), 3 - falsas.length, correcta, azar))
  } else if (t.mazo === 'carreteras') {
    // Las de los pueblos o salidas de alrededor, que la tarjeta ya trae
    falsas = elegir(t.datos.falsas, 3, correcta, azar)
  }
  falsas = [...new Set(falsas)].filter((x) => x !== correcta)
  return falsas.length >= 3 ? barajar([correcta, ...falsas.slice(0, 3)], azar) : null
}
