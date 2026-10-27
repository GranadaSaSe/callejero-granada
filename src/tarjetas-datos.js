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
      })
    })
  }

  const rango = (l) => (ORDEN_LUGARES.indexOf(l.categoria) + 1 || ORDEN_LUGARES.length + 1)
  for (const l of [...lugares].filter((x) => x.direccion).sort((a, b) => rango(a) - rango(b))) {
    mazos.lugares.push({
      id: `lugares:${l.id}`,
      mazo: 'lugares',
      distrito: l.distrito,
      enlace: `#/mapa?lugar=${l.id}`,
      pregunta: `¿En qué calle está ${l.nombre}?`,
      respuesta: l.direccion,
      detalle: [
        `${l.categoria} · ${[l.distrito, l.barrio].filter(Boolean).join(', ')}`,
        l.direccionSegun !== 'osm' && 'Dirección aproximada (portal más cercano).',
      ]
        .filter(Boolean)
        .join(' '),
    })
  }
  return mazos
}
