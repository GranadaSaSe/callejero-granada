// Juego «Zona de los parques» (paso 2.5): preguntas sobre los pueblos, las salidas de autovía y las carreteras
// de la zona de los parques de bomberos de Granada, y las tarjetas de repaso de esa zona. No usa el
// navegador: se puede probar con Node.
import { puntoEnAnillo } from '../scripts/lib/geo.mjs'
import { textoAcceso } from '../scripts/lib/zona-datos.mjs'
import { barajar as barajarFijo, conOpciones, semilla } from './preguntas-examen.js'

export const MODOS_ZONA = [
  { id: 'donde', nombre: 'Dónde está cada pueblo' },
  { id: 'pueblo', nombre: 'Qué pueblo es' },
  { id: 'salida', nombre: 'Salidas: a dónde llevan' },
  { id: 'coger', nombre: 'Salidas: cuál coger' },
  { id: 'acceso', nombre: 'Cómo se llega a cada pueblo' },
  { id: 'carretera', nombre: 'Qué carretera es' },
  { id: 'une', nombre: 'Qué carretera une dos pueblos' },
  { id: 'red', nombre: 'Tipo de red de cada carretera' },
  { id: 'poligono', nombre: 'Polígonos industriales' },
  { id: 'nucleo', nombre: 'Núcleos y urbanizaciones: de qué pueblo son' },
  { id: 'pasa', nombre: 'Qué carretera pasa por cada pueblo' },
  { id: 'hacia', nombre: 'Hacia qué localidad lleva cada carretera' },
  { id: 'rumbo', nombre: 'Dónde queda cada carretera desde Granada' },
  { id: 'mezcla', nombre: 'Todo mezclado' },
]

// Tipos de red de las carreteras (catálogo de la Junta de Andalucía, del Estado y de la Diputación)
export const TIPOS_RED = [
  'Red de Carreteras del Estado',
  'Red Básica Estructurante',
  'Red Básica de Articulación',
  'Red Intercomarcal',
  'Red Complementaria',
  'Red Complementaria Metropolitana',
  'Red Provincial',
]

// Localidades junto a una carretera (pueblos por cuyo término pasa y núcleos a menos de 300 m) y otras de los términos
// vecinos por los que no pasa: para «la carretera X nos dirige hacia la localidad de...»
export function localidadesDe(codigo, { municipios, nucleos }) {
  const porNombre = new Map(municipios.features.map((f) => [f.properties.nombre, f]))
  const terminos = new Set(municipios.features.filter((f) => f.properties.nombre !== 'Granada' && f.properties.carreteras.includes(codigo)).map((f) => f.properties.nombre))
  const validos = nucleosPreguntables(nucleos)
  const enElla = [...new Set([...terminos, ...validos.filter((n) => n.carreteras.includes(codigo)).map((n) => n.nombre)])]
  const vecinos = [...terminos].flatMap((t) => porNombre.get(t).properties.vecinos).filter((t) => t !== 'Granada' && !terminos.has(t))
  const lejos = [...new Set([...vecinos, ...validos.filter((n) => vecinos.includes(n.municipio) && !n.carreteras.includes(codigo)).map((n) => n.nombre)])].filter(
    (x) => !enElla.includes(x),
  )
  return { enElla, lejos }
}

// Núcleos de los que se puede preguntar: sin nombres repetidos en dos pueblos ni los que llevan el pueblo en el nombre
export function nucleosPreguntables(nucleos = []) {
  return nucleos.filter((n) => !n.repetido && !sinTildes(n.nombre).includes(sinTildes(n.municipio)))
}

// Polígonos de los que se puede preguntar: sin los que parecen erratas, sin nombres repetidos en dos pueblos (hay un
// «La Estación» en Atarfe y otro en Pinos Puente) y sin los que llevan el pueblo en el nombre (se responden solos)
const sinTildes = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function poligonosPreguntables(poligonos = []) {
  const veces = new Map()
  for (const p of poligonos) veces.set(p.nombre, (veces.get(p.nombre) ?? 0) + 1)
  return poligonos.filter((p) => !p.dudoso && veces.get(p.nombre) === 1 && !sinTildes(p.nombre).includes(sinTildes(p.municipio)))
}

// Pueblos vecinos unidos por una sola carretera con código (la que pasa por los dos términos): «¿qué carretera une
// A y B?». Sin las autovías, que pasan por muchos pueblos sin unirlos de verdad.
export function parejasUnidas(municipios, redes = {}) {
  const porNombre = new Map(municipios.features.map((f) => [f.properties.nombre, f]))
  const valida = (c) => redes[c] && !/^(A-44|A-92|A-92G|GR-30|GR-43)$/.test(c)
  const parejas = []
  for (const f of municipios.features) {
    const a = f.properties
    for (const nombre of a.vecinos) {
      const b = porNombre.get(nombre)?.properties
      if (!b || a.nombre >= b.nombre || a.nombre === 'Granada' || b.nombre === 'Granada') continue
      const comunes = a.carreteras.filter((c) => b.carreteras.includes(c) && valida(c))
      if (comunes.length === 1) parejas.push({ a: a.nombre, b: b.nombre, codigo: comunes[0] })
    }
  }
  return parejas
}
export const PARTES_ZONA = ['Toda la zona', 'Capital', 'Norte', 'Este', 'Sur', 'Oeste', 'Valle de Lecrín']

// Paso aproximado de grados a metros, suficiente en la provincia (igual que en scripts/lib/geo.mjs)
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540
const distancia = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)
const longitud = (linea) => linea.slice(1).reduce((suma, p, i) => suma + distancia(linea[i], p), 0)

// Carteles que no sirven para preguntar
const POCO_UTIL = /^(cambio de sentido|área de servicio|vía de servicio|polígonos? industrial(es)?|centro)$/i
const utiles = (destinos) => destinos.filter((d) => !POCO_UTIL.test(d))
// Una carretera corta (un ramal, un trozo de travesía) no merece una pregunta de «¿qué carretera es?»
const CARRETERA_MINIMA_M = 2000

function barajar(lista, azar) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// Tres respuestas falsas distintas de la buena y entre sí, tomadas de "candidatas" por orden
function falsas(buena, candidatas) {
  const vistas = new Set([buena])
  const elegidas = []
  for (const c of candidatas) {
    if (elegidas.length === 3) break
    if (!c || vistas.has(c)) continue
    vistas.add(c)
    elegidas.push(c)
  }
  return elegidas
}

const valor = (numero) => parseFloat(numero) || 0
export const textoSalida = (s) => utiles(s.destinos).slice(0, 3).join(', ')
// Cómo se llega al final del camino desde Granada: la última carretera, o la salida si acaba en una autovía
const ultimoPaso = (acceso) => {
  const p = acceso.pasos.at(-1)
  return p.salida ? `${p.carretera}, salida ${p.salida}` : p.carretera
}

// En qué municipio cae un punto (para el «¿dónde está?»)
export function municipioEn(municipios, punto) {
  return municipios.features.find((f) => f.geometry.coordinates.some((poligono) => puntoEnAnillo(punto, poligono[0]))) ?? null
}

// Todas las preguntas posibles con estos ajustes (sin las respuestas falsas, que cambian cada vez).
// Cada una lleva un id fijo para recordar si se falló.
export function preguntasZona({ municipios, salidas, carreteras, poligonos = [], redes = {}, nucleos = [], rumbos = {} }, { modo, parte }) {
  const parteDe = new Map(municipios.features.map((f) => [f.properties.nombre, f.properties.parte]))
  const enParte = (nombre) => parte === 'Toda la zona' || parteDe.get(nombre) === parte
  const quiero = (tipo) => modo === tipo || modo === 'mezcla'
  const pueblos = municipios.features.filter((f) => f.properties.nombre !== 'Granada' && enParte(f.properties.nombre))
  const lista = []

  if (quiero('donde')) for (const f of pueblos) lista.push({ id: `donde:${f.properties.nombre}`, tipo: 'donde', municipio: f })
  if (quiero('pueblo')) for (const f of pueblos) lista.push({ id: `pueblo:${f.properties.nombre}`, tipo: 'pueblo', municipio: f })
  if (quiero('acceso')) {
    for (const f of pueblos) if (f.properties.acceso?.pasos.length) lista.push({ id: `acceso:${f.properties.nombre}`, tipo: 'acceso', municipio: f })
  }

  const conCarteles = salidas.filter((s) => s.numero && utiles(s.destinos).length && enParte(s.municipio))
  if (quiero('salida')) for (const s of conCarteles) lista.push({ id: `salida:${s.id}`, tipo: 'salida', salida: s })
  if (quiero('coger')) {
    // Solo los destinos que están en una única salida de esa autovía (si no, valdrían dos respuestas)
    const veces = new Map()
    for (const s of salidas) for (const d of utiles(s.destinos)) veces.set(`${s.carretera}|${d}`, (veces.get(`${s.carretera}|${d}`) ?? 0) + 1)
    for (const s of conCarteles) {
      for (const d of utiles(s.destinos)) {
        if (veces.get(`${s.carretera}|${d}`) === 1) lista.push({ id: `coger:${s.carretera}|${d}`, tipo: 'coger', salida: s, destino: d })
      }
    }
  }

  if (quiero('carretera')) {
    const metros = new Map()
    for (const f of carreteras.features) {
      for (const c of f.properties.codigo.split(' / ')) metros.set(c, (metros.get(c) ?? 0) + longitud(f.geometry.coordinates))
    }
    const enLaParte = new Set(municipios.features.filter((f) => enParte(f.properties.nombre)).flatMap((f) => f.properties.carreteras))
    for (const [codigo, m] of metros) {
      if (m >= CARRETERA_MINIMA_M && enLaParte.has(codigo)) lista.push({ id: `carretera:${codigo}`, tipo: 'carretera', codigo })
    }
  }

  // Material de la persona (paso 3.5): qué carretera une dos pueblos, de qué red es cada carretera y en qué
  // pueblo está cada polígono industrial (se toca su término, como en «¿dónde está?»)
  if (quiero('une')) {
    for (const x of parejasUnidas(municipios, redes)) {
      if (enParte(x.a) || enParte(x.b)) lista.push({ id: `une:${x.a}|${x.b}`, tipo: 'une', ...x })
    }
  }
  if (quiero('red')) {
    const enLaParte = new Set(municipios.features.filter((f) => enParte(f.properties.nombre)).flatMap((f) => f.properties.carreteras))
    for (const codigo of Object.keys(redes)) if (enLaParte.has(codigo)) lista.push({ id: `red:${codigo}`, tipo: 'red', codigo })
  }
  // Núcleos, qué carretera pasa por cada pueblo, hacia dónde lleva cada carretera y su rumbo desde Granada (exámenes de 2025)
  const porNombreZona = new Map(municipios.features.map((f) => [f.properties.nombre, f]))
  if (quiero('nucleo')) {
    for (const n of nucleosPreguntables(nucleos)) {
      if (enParte(n.municipio) && porNombreZona.has(n.municipio)) lista.push({ id: `nucleo:${n.nombre}`, tipo: 'nucleo', nucleo: n, municipio: porNombreZona.get(n.municipio) })
    }
  }
  if (quiero('pasa')) {
    for (const f of pueblos) if (f.properties.carreteras.some((c) => redes[c] && !AUTOVIAS.test(c))) lista.push({ id: `pasa:${f.properties.nombre}`, tipo: 'pasa', municipio: f })
  }
  if (quiero('hacia') || quiero('rumbo')) {
    const enLaParte = new Set(municipios.features.filter((f) => enParte(f.properties.nombre)).flatMap((f) => f.properties.carreteras))
    for (const codigo of Object.keys(redes).filter((c) => enLaParte.has(c))) {
      if (quiero('hacia') && !AUTOVIAS.test(codigo) && redes[codigo] !== 'Red de Carreteras del Estado' && localidadesDe(codigo, { municipios, nucleos }).lejos.length >= 3) lista.push({ id: `hacia:${codigo}`, tipo: 'hacia', codigo })
      if (quiero('rumbo') && rumbos[codigo]) lista.push({ id: `rumbo:${codigo}`, tipo: 'rumbo', codigo })
    }
  }
  if (quiero('poligono')) {
    const porNombre = porNombreZona
    for (const p of poligonosPreguntables(poligonos)) {
      if (enParte(p.municipio) && porNombre.has(p.municipio)) {
        lista.push({ id: `poligono:${p.nombre}`, tipo: 'poligono', poligono: p, municipio: porNombre.get(p.municipio) })
      }
    }
  }
  return lista
}

// Prepara una pregunta para jugarla: el enunciado, cómo se contesta ('tocar' en el mapa o 'elegir' entre 4),
// las opciones ({ texto, buena }) y el texto de la respuesta buena
export function prepararPregunta(p, { municipios, salidas, redes = {}, nucleos = [], rumbos = {} }, azar = Math.random) {
  const porNombre = new Map(municipios.features.map((f) => [f.properties.nombre, f]))
  // Municipios más cercanos a uno (sin él ni Granada), primero sus vecinos
  const cercanos = (f) => {
    const vecinos = barajar(f.properties.vecinos.filter((n) => n !== 'Granada'), azar)
    const resto = municipios.features
      .filter((o) => o !== f && o.properties.nombre !== 'Granada' && !vecinos.includes(o.properties.nombre))
      .sort((a, b) => distancia(a.properties.centro, f.properties.centro) - distancia(b.properties.centro, f.properties.centro))
      .map((o) => o.properties.nombre)
    return [...vecinos, ...resto]
  }
  const opciones = (buena, malas) => barajar([buena, ...malas], azar).map((texto) => ({ texto, buena: texto === buena }))

  if (p.tipo === 'donde') {
    const m = p.municipio.properties
    return { enunciado: `¿Dónde está ${m.nombre}?`, contestar: 'tocar', respuesta: m.nombre }
  }
  if (p.tipo === 'poligono') {
    return { enunciado: `¿En qué pueblo está el ${p.poligono.nombre}? Toca su término.`, contestar: 'tocar', respuesta: p.municipio.properties.nombre }
  }
  if (p.tipo === 'nucleo') {
    return { enunciado: `¿En qué municipio está ${p.nucleo.nombre} (${p.nucleo.tipo})? Toca su término.`, contestar: 'tocar', respuesta: p.municipio.properties.nombre }
  }
  if (p.tipo === 'pasa') {
    const m = p.municipio.properties
    const suyas = m.carreteras.filter((c) => redes[c] && !AUTOVIAS.test(c))
    const buena = suyas[Math.floor(azar() * suyas.length)]
    const ajenas = [...new Set(m.vecinos.map((v) => porNombre.get(v)).filter(Boolean).flatMap((o) => o.properties.carreteras))].filter(
      (c) => redes[c] && !m.carreteras.includes(c),
    )
    return {
      enunciado: `Nos avisan de un desprendimiento de tierra en una carretera de ${m.nombre} (en azul). ¿Cuál de estas carreteras pasa por su término?`,
      contestar: 'elegir',
      respuesta: buena,
      opciones: opciones(buena, falsas(buena, barajar(ajenas, azar))),
    }
  }
  if (p.tipo === 'hacia') {
    const { enElla, lejos } = localidadesDe(p.codigo, { municipios, nucleos })
    const buena = enElla[Math.floor(azar() * enElla.length)]
    return {
      enunciado: `La carretera ${p.codigo} (en azul) nos dirige hacia la localidad de:`,
      contestar: 'elegir',
      respuesta: buena,
      opciones: opciones(buena, falsas(buena, barajar([...new Set(lejos)], azar))),
    }
  }
  if (p.tipo === 'rumbo') {
    const i = RUMBOS_ORDEN.indexOf(rumbos[p.codigo])
    const separacion = (r) => Math.min(Math.abs(RUMBOS_ORDEN.indexOf(r) - i), 8 - Math.abs(RUMBOS_ORDEN.indexOf(r) - i))
    const lejos = Object.keys(rumbos).filter((c) => redes[c] && separacion(rumbos[c]) >= 2)
    return {
      enunciado: `¿Cuál de estas carreteras se sitúa al ${rumbos[p.codigo]} de la ciudad de Granada?`,
      contestar: 'elegir',
      respuesta: p.codigo,
      opciones: opciones(p.codigo, falsas(p.codigo, barajar(lejos, azar))),
    }
  }
  if (p.tipo === 'red') {
    const buena = redes[p.codigo]
    return {
      enunciado: `La carretera ${p.codigo} (en azul), ¿de qué red es?`,
      contestar: 'elegir',
      respuesta: buena,
      opciones: opciones(buena, falsas(buena, barajar(TIPOS_RED, azar))),
    }
  }
  if (p.tipo === 'une') {
    // Las falsas: otras carreteras de los dos pueblos y de sus vecinos
    const a = porNombre.get(p.a)
    const b = porNombre.get(p.b)
    const deAlrededor = [a, b, ...[...a.properties.vecinos, ...b.properties.vecinos].map((n) => porNombre.get(n))]
      .filter(Boolean)
      .flatMap((f) => f.properties.carreteras)
      .filter((c) => redes[c] && !(a.properties.carreteras.includes(c) && b.properties.carreteras.includes(c)))
    return {
      enunciado: `¿Qué carretera une ${p.a} y ${p.b}?`,
      contestar: 'elegir',
      respuesta: p.codigo,
      opciones: opciones(p.codigo, falsas(p.codigo, barajar([...new Set(deAlrededor)], azar))),
    }
  }
  if (p.tipo === 'pueblo') {
    const m = p.municipio.properties
    return { enunciado: '¿Qué pueblo es el marcado en azul?', contestar: 'elegir', respuesta: m.nombre, opciones: opciones(m.nombre, falsas(m.nombre, cercanos(p.municipio))) }
  }
  if (p.tipo === 'acceso') {
    const m = p.municipio.properties
    const buena = ultimoPaso(m.acceso)
    // Las falsas, de los pueblos de alrededor, sin las carreteras que están en el camino (confundirían)
    const enElCamino = new Set(m.acceso.pasos.map((x) => x.carretera))
    const otras = cercanos(p.municipio)
      .map((n) => porNombre.get(n).properties.acceso)
      .filter((a) => a?.pasos.length)
      .map(ultimoPaso)
      .filter((t) => !enElCamino.has(t.split(',')[0]))
    return {
      enunciado: `De Granada a ${m.nombre}${m.pueblo ? ` (${m.pueblo})` : ''}: ¿por dónde llegas al pueblo?`,
      contestar: 'elegir',
      respuesta: buena,
      opciones: opciones(buena, falsas(buena, otras)),
    }
  }
  if (p.tipo === 'salida') {
    const s = p.salida
    const buena = textoSalida(s)
    // Las de la misma autovía con el número más cercano, sin la que empieza igual que la buena
    const otras = salidas
      .filter((o) => o.carretera === s.carretera && o !== s && o.numero && utiles(o.destinos).length && utiles(o.destinos)[0] !== utiles(s.destinos)[0])
      .sort((a, b) => Math.abs(valor(a.numero) - valor(s.numero)) - Math.abs(valor(b.numero) - valor(s.numero)))
      .slice(0, 6)
    return {
      enunciado: `${s.carretera}, salida ${s.numero}: ¿a dónde lleva?`,
      contestar: 'elegir',
      respuesta: buena,
      opciones: opciones(buena, falsas(buena, barajar(otras, azar).map(textoSalida))),
    }
  }
  if (p.tipo === 'coger') {
    const s = p.salida
    const sentidos = s.sentidos.filter((x) => x.hacia && x.destinos.includes(p.destino))
    const hacia = sentidos.length ? sentidos[Math.floor(azar() * sentidos.length)].hacia : null
    const otras = salidas
      .filter((o) => o.carretera === s.carretera && o.numero && o.numero !== s.numero && !o.destinos.includes(p.destino))
      .sort((a, b) => Math.abs(valor(a.numero) - valor(s.numero)) - Math.abs(valor(b.numero) - valor(s.numero)))
      .slice(0, 6)
    return {
      enunciado: `Vas por la ${s.carretera}${hacia ? ` hacia ${hacia}` : ''}. ¿Qué salida coges para ${p.destino}?`,
      contestar: 'elegir',
      respuesta: `Salida ${s.numero}`,
      opciones: opciones(`Salida ${s.numero}`, falsas(`Salida ${s.numero}`, barajar(otras, azar).map((o) => `Salida ${o.numero}`))),
    }
  }
  // «¿Qué carretera es?»: las falsas, de las que pasan por los mismos pueblos (y si no hay bastantes, cualquiera)
  const pueblos = municipios.features.filter((f) => f.properties.carreteras.includes(p.codigo))
  const cerca = barajar([...new Set(pueblos.flatMap((f) => f.properties.carreteras))], azar)
  const lejos = barajar([...new Set(municipios.features.flatMap((f) => f.properties.carreteras))], azar)
  return {
    enunciado: '¿Qué carretera es la marcada en azul?',
    contestar: 'elegir',
    respuesta: p.codigo,
    opciones: opciones(p.codigo, falsas(p.codigo, [...cerca, ...lejos])),
  }
}

// Tarjetas de repaso de la zona (mazo «carreteras»): cómo se llega a cada pueblo, a dónde lleva cada salida
// y qué salida coger para cada destino, intercaladas. Cada una guarda en "datos.falsas" las respuestas
// falsas más parecidas (las de los pueblos o salidas de alrededor), para el modo test y el examen.
export function tarjetasZona({ municipios, salidas, poligonos = [], redes = {}, nucleos = [], rumbos = {} }) {
  const porNombre = new Map(municipios.features.map((f) => [f.properties.nombre, f]))
  const masCerca = (f) =>
    municipios.features
      .filter((o) => o !== f && o.properties.nombre !== 'Granada')
      .sort((a, b) => {
        const vecino = (o) => (f.properties.vecinos.includes(o.properties.nombre) ? 0 : 1)
        return vecino(a) - vecino(b) || distancia(a.properties.centro, f.properties.centro) - distancia(b.properties.centro, f.properties.centro)
      })
  const enlacePueblo = (nombre) => `#/mapa?pueblo=${encodeURIComponent(nombre)}`
  const enlaceSalida = (s) => `#/mapa?salida=${encodeURIComponent(s.id)}`
  const tarjeta = (id, enlace, pregunta, respuesta, detalle, falsas) => ({
    id: `carreteras:${id}`,
    mazo: 'carreteras',
    distrito: null,
    enlace,
    pregunta,
    respuesta,
    detalle,
    datos: { falsas: [...new Set(falsas)].filter((x) => x && x !== respuesta).slice(0, 6) },
  })
  const datosZona = { municipios, salidas, carreteras: { features: [] } }

  const accesos = municipios.features
    .filter((f) => f.properties.nombre !== 'Granada' && f.properties.acceso)
    .map((f) => {
      const m = f.properties
      return tarjeta(
        `acceso:${m.nombre}`,
        enlacePueblo(m.nombre),
        `¿Cómo se llega desde Granada a ${m.nombre}${m.pueblo ? ` (${m.pueblo})` : ''}?`,
        textoAcceso(m.acceso),
        `Unos ${m.acceso.minutos} minutos desde el centro. Es el camino más rápido según OpenStreetMap; puede haber otros.`,
        masCerca(f).map((o) => o.properties.acceso && textoAcceso(o.properties.acceso)),
      )
    })
  const conCarteles = salidas.filter((s) => s.numero && utiles(s.destinos).length)
  const cercanas = (s, valida) =>
    salidas
      .filter((o) => o.carretera === s.carretera && o !== s && o.numero && valida(o))
      .sort((a, b) => Math.abs(valor(a.numero) - valor(s.numero)) - Math.abs(valor(b.numero) - valor(s.numero)))
  const aDonde = conCarteles.map((s) =>
    tarjeta(
      `salida:${s.id}`,
      enlaceSalida(s),
      `${s.carretera}, salida ${s.numero}: ¿a dónde lleva?`,
      textoSalida(s),
      `Carteles: ${s.destinos.join(', ')}. Está en ${s.municipio}.`,
      cercanas(s, (o) => utiles(o.destinos).length && utiles(o.destinos)[0] !== utiles(s.destinos)[0]).map(textoSalida),
    ),
  )
  const coger = preguntasZona(datosZona, { modo: 'coger', parte: 'Toda la zona' }).map((p) =>
    tarjeta(
      `coger:${p.salida.carretera}|${p.destino}`,
      enlaceSalida(p.salida),
      `Por la ${p.salida.carretera}, ¿qué salida se coge para ${p.destino}?`,
      `Salida ${p.salida.numero}`,
      `La salida ${p.salida.numero} lleva a: ${p.salida.destinos.join(', ')}.`,
      cercanas(p.salida, (o) => !o.destinos.includes(p.destino)).map((o) => `Salida ${o.numero}`),
    ),
  )
  // Material de la persona (paso 3.5): qué carretera une dos pueblos, de qué red es cada carretera y dónde está
  // (y por dónde se llega a) cada polígono industrial
  const une = parejasUnidas(municipios, redes).map((x) => {
    const deAlrededor = [x.a, x.b]
      .map((n) => porNombre.get(n))
      .flatMap((f) => [f, ...f.properties.vecinos.map((v) => porNombre.get(v))])
      .filter(Boolean)
      .flatMap((f) => f.properties.carreteras)
      .filter((c) => redes[c] && c !== x.codigo)
    return tarjeta(
      `une:${x.a}|${x.b}`,
      `#/mapa?carretera=${encodeURIComponent(x.codigo)}`,
      `¿Qué carretera une ${x.a} y ${x.b}?`,
      x.codigo,
      `${x.codigo} pasa por los términos de los dos pueblos (${redes[x.codigo]}).`,
      deAlrededor,
    )
  })
  const red = Object.entries(redes).map(([codigo, tipo]) =>
    tarjeta(
      `red:${codigo}`,
      `#/mapa?carretera=${encodeURIComponent(codigo)}`,
      `¿De qué red es la carretera ${codigo}?`,
      tipo,
      null,
      TIPOS_RED,
    ),
  )
  const preguntables = poligonosPreguntables(poligonos)
  const enPueblo = preguntables
    .filter((p) => porNombre.has(p.municipio))
    .map((p) =>
      tarjeta(
        `poligono:${p.nombre}`,
        p.punto ? `#/mapa?lugar=${p.id}` : enlacePueblo(p.municipio),
        `¿En qué pueblo está el ${p.nombre}?`,
        p.municipio,
        [p.nota, p.carretera && `Se llega por la ${p.carretera}.`].filter(Boolean).join('. ') || null,
        masCerca(porNombre.get(p.municipio)).map((o) => o.properties.nombre),
      ),
    )
  const porCarretera = preguntables
    .filter((p) => p.carretera)
    .map((p) => {
      const f = porNombre.get(p.municipio)
      return tarjeta(
        `poligono-carretera:${p.nombre}`,
        p.punto ? `#/mapa?lugar=${p.id}` : enlacePueblo(p.municipio),
        `¿Por qué carretera se llega al ${p.nombre} (${p.municipio})?`,
        p.carretera,
        p.nota ?? null,
        [f, ...(f ? masCerca(f).slice(0, 4) : [])].filter(Boolean).flatMap((o) => o.properties.carreteras).filter((c) => redes[c]),
      )
    })
  // Con la forma de las preguntas de los exámenes (con sus opciones escritas, src/preguntas-examen.js)
  const examen = tarjetasZonaExamen({ municipios, poligonos, redes, nucleos, rumbos }, { porNombre, masCerca, enlacePueblo })
  // Intercaladas, para que las tarjetas nuevas de cada día sean de todas las clases
  const clases = [accesos, aDonde, coger, enPueblo, une, red, porCarretera, ...examen]
  const todas = []
  for (let i = 0; i < Math.max(...clases.map((c) => c.length)); i++) for (const c of clases) todas.push(c[i])
  return todas.filter(Boolean)
}

// Preguntas de la zona con la forma de las de los exámenes (2020, 2022 y 2025), con sus opciones escritas. Todas salen de
// los datos: qué carreteras pasan por cada término (municipios.json), los núcleos de población (nucleos.json), el tipo
// de red (redes.json), el rumbo desde Granada (rumbos.json) y los polígonos industriales (poligonos.json).
const AUTOVIAS = /^(A-44|A-92|A-92G|GR-30|GR-43)$/
const RUMBOS_ORDEN = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']

function tarjetasZonaExamen({ municipios, poligonos, redes, nucleos, rumbos }, { porNombre, masCerca, enlacePueblo }) {
  const enlaceCarretera = (c) => `#/mapa?carretera=${encodeURIComponent(c)}`
  const pueblos = municipios.features.filter((f) => f.properties.nombre !== 'Granada')
  const pasaPor = (codigo) => pueblos.filter((f) => f.properties.carreteras.includes(codigo)).map((f) => f.properties.nombre)
  const codigos = Object.keys(redes).filter((c) => pasaPor(c).length)
  const tarjeta = (datos) => conOpciones({ mazo: 'carreteras', distrito: null, ...datos })
  const clases = { nucleo: [], hacia: [], pasa: [], rumbo: [], enlaza: [], via: [], redCual: [], poligonoNo: [] }

  // «Tenemos un incendio en la zona residencial San Javier: ¿a qué municipio nos dirigimos?» (2025)
  for (const n of nucleosPreguntables(nucleos)) {
    const f = porNombre.get(n.municipio)
    if (!f) continue
    clases.nucleo.push(
      tarjeta({
        id: `carreteras:nucleo:${n.nombre}`,
        enlace: enlacePueblo(n.municipio),
        pregunta: `${n.nombre} (${n.tipo}), ¿a qué municipio pertenece?`,
        buena: n.municipio,
        falsas: masCerca(f).map((o) => o.properties.nombre),
        detalle: n.carreteras.length ? `Junto a la ${n.carreteras.join(', ')}.` : null,
      }),
    )
  }

  // «La carretera GR-3424 nos dirige hacia la localidad de...» (2025): un pueblo o núcleo junto a ella; los otros, de
  // términos vecinos por los que no pasa
  for (const codigo of codigos.filter((c) => !AUTOVIAS.test(c) && redes[c] !== 'Red de Carreteras del Estado')) {
    const terminos = new Set(pasaPor(codigo))
    const enElla = [...pasaPor(codigo), ...nucleos.filter((n) => !n.repetido && n.carreteras.includes(codigo)).map((n) => n.nombre)]
    const vecinos = [...terminos].flatMap((t) => porNombre.get(t).properties.vecinos).filter((t) => t !== 'Granada' && !terminos.has(t))
    const lejos = [...new Set([...vecinos, ...nucleos.filter((n) => !n.repetido && vecinos.includes(n.municipio) && !n.carreteras.includes(codigo)).map((n) => n.nombre)])]
    const azar = semilla(`hacia:${codigo}`)
    for (const destino of barajarFijo([...new Set(enElla)], azar).slice(0, 2)) {
      clases.hacia.push(
        tarjeta({
          id: `carreteras:hacia:${codigo}:${destino}`,
          enlace: enlaceCarretera(codigo),
          pregunta: `La carretera ${codigo} nos dirige hacia la localidad de:`,
          buena: destino,
          falsas: barajarFijo(lejos, azar),
          detalle: `La ${codigo} pasa por ${pasaPor(codigo).join(', ')}.`,
        }),
      )
    }
  }

  // «Desprendimiento de tierra en Güéjar Sierra: ¿a qué carretera nos estamos refiriendo?» (2025)
  for (const f of pueblos) {
    const m = f.properties
    const suyas = m.carreteras.filter((c) => redes[c] && !AUTOVIAS.test(c))
    if (!suyas.length) continue
    const azar = semilla(`pasa:${m.nombre}`)
    const ajenas = [...new Set(m.vecinos.map((v) => porNombre.get(v)).filter(Boolean).flatMap((o) => o.properties.carreteras))].filter(
      (c) => redes[c] && !m.carreteras.includes(c),
    )
    clases.pasa.push(
      tarjeta({
        id: `carreteras:pasa:${m.nombre}`,
        enlace: enlacePueblo(m.nombre),
        pregunta: `Nos avisan de un desprendimiento de tierra en una carretera del término de ${m.nombre}. ¿Cuál de estas carreteras pasa por él?`,
        buena: barajarFijo(suyas, azar)[0],
        falsas: barajarFijo(ajenas, azar),
        detalle: `Por ${m.nombre} pasan: ${m.carreteras.join(', ')}.`,
      }),
    )
  }

  // «¿Cuál de estas carreteras se sitúa al noroeste de la ciudad de Granada?» (2025): las falsas, a 90° o más
  for (const [codigo, rumbo] of Object.entries(rumbos)) {
    if (!codigos.includes(codigo)) continue
    const i = RUMBOS_ORDEN.indexOf(rumbo)
    const separacion = (r) => Math.min(Math.abs(RUMBOS_ORDEN.indexOf(r) - i), 8 - Math.abs(RUMBOS_ORDEN.indexOf(r) - i))
    const lejos = barajarFijo(
      Object.entries(rumbos)
        .filter(([c, r]) => c !== codigo && codigos.includes(c) && separacion(r) >= 2)
        .map(([c]) => c),
      semilla(`rumbo:${codigo}`),
    )
    clases.rumbo.push(
      tarjeta({
        id: `carreteras:rumbo:${codigo}`,
        enlace: enlaceCarretera(codigo),
        pregunta: `¿Cuál de estas carreteras se sitúa al ${rumbo} de la ciudad de Granada?`,
        buena: codigo,
        falsas: lejos,
        detalle: `La ${codigo} queda al ${rumbo} de Granada.`,
      }),
    )
  }

  // «¿Qué carretera enlaza Armilla, Gabia la Grande y La Malahá?» (2020): tres términos por los que pasa; las falsas pasan
  // como mucho por uno de ellos
  for (const codigo of codigos.filter((c) => !AUTOVIAS.test(c))) {
    const lista = pasaPor(codigo)
    if (lista.length < 3) continue
    const tres = barajarFijo(lista, semilla(`enlaza:${codigo}`)).slice(0, 3).sort((a, b) => lista.indexOf(a) - lista.indexOf(b))
    const otras = codigos.filter((c) => c !== codigo && tres.filter((t) => porNombre.get(t).properties.carreteras.includes(c)).length <= 1)
    const cerca = otras.filter((c) => tres.some((t) => porNombre.get(t).properties.carreteras.includes(c)))
    clases.enlaza.push(
      tarjeta({
        id: `carreteras:enlaza:${codigo}`,
        enlace: enlaceCarretera(codigo),
        pregunta: `¿Qué carretera enlaza ${tres[0]}, ${tres[1]} y ${tres[2]}?`,
        buena: codigo,
        falsas: [...barajarFijo(cerca, semilla(codigo)), ...otras],
        detalle: `La ${codigo} pasa por ${lista.join(', ')}.`,
      }),
    )
  }

  // «El Polígono La Molaina, ¿en qué término está y por qué vía se accede?» (2022): la vía del material o, si no, la
  // carretera con código que pasa a menos de 200 m
  for (const p of poligonosPreguntables(poligonos)) {
    const f = porNombre.get(p.municipio)
    const via = p.carretera ?? (p.cerca && p.cerca.metros <= 200 ? p.cerca.codigo : null)
    if (!f || !via || !redes[via]) continue
    const vecino = masCerca(f)[0]?.properties.nombre
    const otraVia = f.properties.carreteras.find((c) => c !== via && redes[c] && !AUTOVIAS.test(c)) ?? f.properties.carreteras.find((c) => c !== via && redes[c])
    if (!vecino || !otraVia) continue
    const texto = (m, v) => `Término municipal de ${m}, y se accede por la ${v}`
    clases.via.push(
      tarjeta({
        id: `carreteras:poligono-via:${p.nombre}`,
        enlace: p.punto ? `#/mapa?lugar=${p.id}` : enlacePueblo(p.municipio),
        pregunta: `El ${p.nombre}, ¿en qué término municipal se encuentra y por qué vía accedemos a él?`,
        buena: texto(p.municipio, via),
        falsas: [texto(vecino, via), texto(p.municipio, otraVia), texto(vecino, otraVia)],
        detalle: p.carretera ? `Según el material de polígonos: ${p.nota ?? `se llega por la ${via}`}.` : `La ${via} pasa a ${p.cerca.metros} m.`,
      }),
    )
  }

  // «Marque la opción correcta. Red Complementaria Metropolitana de Granada:» (2025)
  for (const codigo of codigos) {
    const tipo = redes[codigo]
    clases.redCual.push(
      tarjeta({
        id: `carreteras:red-cual:${codigo}`,
        enlace: enlaceCarretera(codigo),
        pregunta: `¿Cuál de estas carreteras es de la ${tipo}?`,
        buena: codigo,
        falsas: barajarFijo(
          codigos.filter((c) => redes[c] !== tipo),
          semilla(`red-cual:${codigo}`),
        ),
        detalle: `La ${codigo} es de la ${tipo}.`,
      }),
    )
  }

  // «¿Cuál de estos polígonos industriales no pertenece al municipio de Atarfe?» (2025)
  const preguntables = poligonosPreguntables(poligonos)
  for (const municipio of [...new Set(preguntables.map((p) => p.municipio))]) {
    const suyos = preguntables.filter((p) => p.municipio === municipio)
    const vecinos = porNombre.get(municipio)?.properties.vecinos ?? []
    if (suyos.length < 2) continue
    for (const ajeno of preguntables.filter((p) => vecinos.includes(p.municipio))) {
      clases.poligonoNo.push(
        tarjeta({
          id: `carreteras:poligono-no:${municipio}|${ajeno.nombre}`,
          enlace: enlacePueblo(municipio),
          pregunta: `¿Cuál de estos polígonos industriales no pertenece al municipio de ${municipio}?`,
          buena: ajeno.nombre,
          falsas: suyos.map((p) => p.nombre),
          detalle: `El ${ajeno.nombre} está en ${ajeno.municipio}. En ${municipio}: ${suyos.map((p) => p.nombre).join(', ')}.`,
        }),
      )
    }
  }
  return Object.values(clases).map((lista) => lista.filter(Boolean))
}
