// Crea las tarjetas de repaso (paso 1.6) a partir de los datos de calles, lugares y ejes.
// Cada tarjeta tiene un id fijo (el progreso se guarda por id) y su texto se calcula con los datos del
// momento, así que si se corrige un dato la tarjeta muestra ya la respuesta corregida.
// Este archivo no usa nada del navegador, así que se puede probar con Node.

export const MAZOS = [
  { id: 'zona', nombre: 'Distrito y barrio de cada calle' },
  { id: 'extremos', nombre: 'Dónde empieza y dónde termina cada calle' },
  { id: 'sentido', nombre: 'Sentido de circulación' },
  { id: 'cruces', nombre: 'Cruces de los ejes, en orden' },
  { id: 'lugares', nombre: 'En qué calle está cada lugar' },
]

// Los lugares más útiles para un bombero, primero
const ORDEN_LUGARES = [
  'Hospitales', 'Bomberos', 'Policía', 'Centros de salud', 'Edificios oficiales', 'Colegios e institutos',
  'Universidad y formación', 'Residencias y centros sociales', 'Monumentos', 'Estatuas y esculturas',
  'Iglesias y templos', 'Cultura', 'Miradores', 'Transporte', 'Instalaciones deportivas', 'Parques y jardines',
  'Centros comerciales y mercados', 'Escuelas infantiles', 'Cementerios', 'Fuentes',
]
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

export function crearTarjetas({ calles, lugares, ejes }) {
  const ordenadas = [...calles].sort(porImportancia)
  const mazos = Object.fromEntries(MAZOS.map((m) => [m.id, []]))

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
        detalle: c.numeros && c.numeros[1] > 1 ? `Números del ${Math.max(1, c.numeros[0])} al ${c.numeros[1]}.` : null,
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
        l.direccionSegun !== 'osm' && 'Dirección aproximada (portal más cercano).',
      ]
        .filter(Boolean)
        .join(' '),
      datos: { categoria: l.categoria, via: l.via },
    })
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
  if (t.mazo === 'zona') {
    falsas = elegir(mazos.zona.map((x) => x.respuesta), 3, correcta, azar)
  } else if (t.mazo === 'extremos') {
    // La buena al revés y mezclas con calles que de verdad cruza
    const { inicio, fin, cruces } = t.datos
    const otras = cruces.length >= 2 ? cruces : mazos.extremos.map((x) => x.datos.inicio[0])
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
    if (falsas.length < 3) falsas.push(...elegir(mazos.cruces.map((x) => x.respuesta), 3 - falsas.length, correcta, azar))
  } else if (t.mazo === 'lugares') {
    const mismoTipo = mazos.lugares.filter((x) => x.datos.categoria === t.datos.categoria && x.datos.via !== t.datos.via)
    falsas = elegir(mismoTipo.map((x) => x.respuesta), 3, correcta, azar)
    if (falsas.length < 3) falsas.push(...elegir(mazos.lugares.map((x) => x.respuesta), 3 - falsas.length, correcta, azar))
  }
  falsas = [...new Set(falsas)].filter((x) => x !== correcta)
  return falsas.length >= 3 ? barajar([correcta, ...falsas.slice(0, 3)], azar) : null
}
