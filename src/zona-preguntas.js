// Juego «Zona de los parques» (paso 2.5): preguntas sobre los pueblos, las salidas de autovía y las carreteras
// de la zona de los parques de bomberos de Granada. No usa el navegador: se puede probar con Node.
import { puntoEnAnillo } from '../scripts/lib/geo.mjs'

export const MODOS_ZONA = [
  { id: 'donde', nombre: 'Dónde está cada pueblo' },
  { id: 'pueblo', nombre: 'Qué pueblo es' },
  { id: 'salida', nombre: 'Salidas: a dónde llevan' },
  { id: 'coger', nombre: 'Salidas: cuál coger' },
  { id: 'acceso', nombre: 'Cómo se llega a cada pueblo' },
  { id: 'carretera', nombre: 'Qué carretera es' },
  { id: 'mezcla', nombre: 'Todo mezclado' },
]
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
export function preguntasZona({ municipios, salidas, carreteras }, { modo, parte }) {
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
  return lista
}

// Prepara una pregunta para jugarla: el enunciado, cómo se contesta ('tocar' en el mapa o 'elegir' entre 4),
// las opciones ({ texto, buena }) y el texto de la respuesta buena
export function prepararPregunta(p, { municipios, salidas }, azar = Math.random) {
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
