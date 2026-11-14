// Paso 4.2 del plan (reconocer por foto): busca fotos candidatas de cada lugar en Wikimedia Commons,
// donde todas las fotos son libres (se pueden usar diciendo su autor y su licencia).
//
// Para cada lugar de CATEGORIAS_FOTOS mira, por este orden:
// 1. La foto principal de su ficha de Wikidata (el enlace sale de OpenStreetMap o, si no lo trae,
//    de buscar su nombre en Wikidata a menos de 300 m).
// 2. Las fotos de su carpeta (categoría) de Commons.
// 3. Si aún hay pocas: fotos de Commons con su nombre en el título y fotos hechas a menos de 80 m que lo nombran.
//
// Guarda hasta MAX_CANDIDATAS por lugar en datos/fotos-candidatas.json, que se revisa en la página de
// «Revisar fotos.bat». Las respuestas de Wikimedia se guardan en datos/crudos/fotos/ para no repetir preguntas.
//
// Uso: `npm run fotos:buscar`. La primera vez tarda hora y media (Wikimedia pide esperar entre búsquedas); lo que responde se guarda en datos/crudos/fotos/ y las siguientes veces va en segundos.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { distancia } from './lib/geo.mjs'
import { CATEGORIAS_FOTOS, parecido } from './lib/fotos.mjs'

const RAIZ = join(import.meta.dirname, '..')
const CARPETA_CACHE = join(RAIZ, 'datos', 'crudos', 'fotos')
const CACHE = join(CARPETA_CACHE, 'respuestas.json')
const SALIDA = join(RAIZ, 'datos', 'fotos-candidatas.json')
const AGENTE = 'callejero-estudio/1.0 (app de estudio sin fines comerciales)'
const WIKIDATA = 'https://www.wikidata.org/w/api.php'
const COMMONS = 'https://commons.wikimedia.org/w/api.php'

const MAX_CANDIDATAS = 8
const ANCHO_MINIATURA = 640
const POCAS = 4 // con menos candidatas que estas se busca también por nombre y por cercanía
const EXTENSIONES = /\.(jpe?g|png|tiff?|webp)$/i
const NO_SON_FOTOS = /\b(mapa|map|plano|plan|planta|alzado|logo|logotipo|escudo|coat of arms|firma|signature|diagram|esquema|grabado|engraving|dibujo|drawing|sello|stamp|postal|postcard)\b/i

// ---------- Preguntas a Wikimedia, despacio y guardando las respuestas ----------

let cache = {}
try {
  cache = JSON.parse(await readFile(CACHE, 'utf8'))
} catch {}
let nuevas = 0
let ultima = 0
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function guardarCache() {
  await mkdir(CARPETA_CACHE, { recursive: true })
  await writeFile(`${CACHE}.tmp`, JSON.stringify(cache))
  await rename(`${CACHE}.tmp`, CACHE)
}

// Las búsquedas (lento) tienen un límite más estricto en Wikimedia, así que van más espaciadas
async function pedir(base, parametros, { lento = false } = {}) {
  const url = `${base}?${new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...parametros })}`
  if (url in cache) return cache[url]
  for (let intento = 1; intento <= 8; intento++) {
    const pausa = (lento ? 800 : 250) - (Date.now() - ultima)
    if (pausa > 0) await espera(pausa)
    ultima = Date.now()
    try {
      const respuesta = await fetch(url, { headers: { 'User-Agent': AGENTE } })
      const texto = await respuesta.text()
      const json = JSON.parse(texto)
      if (json.error) throw new Error(json.error.code)
      cache[url] = json
      if (++nuevas % 25 === 0) await guardarCache()
      return json
    } catch (error) {
      process.stdout.write(`\n  (Wikimedia pide esperar: ${error.message}; intento ${intento})`)
      await espera(5000 * intento)
    }
  }
  throw new Error(`Wikimedia no responde: ${url}`)
}

// ---------- Wikidata ----------

async function entidades(qids) {
  const resultado = {}
  for (let i = 0; i < qids.length; i += 50) {
    const lote = qids.slice(i, i + 50)
    const json = await pedir(WIKIDATA, { action: 'wbgetentities', ids: lote.join('|'), props: 'claims|labels', languages: 'es' })
    Object.assign(resultado, json.entities)
  }
  return resultado
}

const valores = (entidad, propiedad) =>
  (entidad?.claims?.[propiedad] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter((v) => v != null)

// Todas las fichas de Wikidata a menos de 9 km del centro de Granada que tienen foto o carpeta en Commons,
// en una sola consulta (buscar lugar a lugar por el nombre es muy lento: Wikidata limita esas búsquedas)
async function sitiosDeWikidata() {
  const consulta = `SELECT ?item ?itemLabel ?coord WHERE {
    SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(-3.6 37.18)"^^geo:wktLiteral. bd:serviceParam wikibase:radius "9". }
    FILTER(EXISTS { ?item wdt:P18 [] } || EXISTS { ?item wdt:P373 [] })
    SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
  }`
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(consulta)}`
  if (!(url in cache)) {
    const respuesta = await fetch(url, { headers: { 'User-Agent': AGENTE, Accept: 'application/sparql-results+json' } })
    if (!respuesta.ok) throw new Error(`Wikidata no responde (${respuesta.status})`)
    cache[url] = await respuesta.json()
  }
  const sitios = new Map()
  for (const fila of cache[url].results.bindings) {
    const [lon, lat] = fila.coord.value.match(/-?[\d.]+/g).map(Number)
    sitios.set(fila.item.value.split('/').pop(), { nombre: fila.itemLabel?.value ?? '', punto: [lon, lat] })
  }
  return sitios
}

// Si OpenStreetMap no trae el enlace: la ficha de Wikidata a menos de 300 m cuyo nombre se parezca más
function buscarEnWikidata(lugar, sitios) {
  let mejor = null
  for (const [id, sitio] of sitios) {
    const metros = distancia(sitio.punto, lugar.punto)
    if (metros > 300) continue
    const nota = parecido(lugar, sitio.nombre)
    if (nota < 0.5) continue
    if (!mejor || nota > mejor.nota || (nota === mejor.nota && metros < mejor.metros)) mejor = { id, nota, metros }
  }
  return mejor?.id ?? null
}

// ---------- Commons ----------

async function archivosDeCategoria(categoria) {
  const json = await pedir(COMMONS, { action: 'query', list: 'categorymembers', cmtitle: `Category:${categoria}`, cmtype: 'file', cmlimit: '40' })
  return (json.query?.categorymembers ?? []).map((m) => m.title)
}

async function buscarEnCommons(lugar) {
  const nombre = lugar.nombre.replace(/\s*\(.*?\)\s*/g, ' ').replace(/[«»"]/g, '').trim()
  const json = await pedir(COMMONS, { action: 'query', list: 'search', srnamespace: '6', srsearch: `${nombre} Granada`, srlimit: '20' }, { lento: true })
  return (json.query?.search ?? []).map((r) => r.title)
}

async function cercanos(lugar) {
  const [lon, lat] = lugar.punto
  const json = await pedir(COMMONS, { action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: '80', gsnamespace: '6', gslimit: '60' })
  return (json.query?.geosearch ?? []).map((r) => ({ titulo: r.title, metros: r.dist }))
}

const sinEtiquetas = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Datos de cada archivo: la miniatura, su tamaño, el autor y la licencia
async function informacion(titulos) {
  const resultado = new Map()
  for (let i = 0; i < titulos.length; i += 50) {
    const lote = titulos.slice(i, i + 50)
    const json = await pedir(COMMONS, {
      action: 'query',
      titles: lote.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(ANCHO_MINIATURA),
      iiextmetadatafilter: 'Artist|LicenseShortName|GPSLatitude|GPSLongitude',
      iiextmetadatalanguage: 'es',
    })
    const normalizados = new Map((json.query?.normalized ?? []).map((n) => [n.to, n.from]))
    for (const pagina of json.query?.pages ?? []) {
      const info = pagina.imageinfo?.[0]
      if (!info) continue
      const meta = info.extmetadata ?? {}
      const gps = meta.GPSLatitude && meta.GPSLongitude ? [+meta.GPSLongitude.value, +meta.GPSLatitude.value] : null
      resultado.set(normalizados.get(pagina.title) ?? pagina.title, {
        titulo: pagina.title,
        miniatura: info.thumburl,
        ancho: info.thumbwidth,
        alto: info.thumbheight,
        anchoOriginal: info.width,
        altoOriginal: info.height,
        mime: info.mime,
        autor: sinEtiquetas(meta.Artist?.value) || 'Autor desconocido',
        licencia: sinEtiquetas(meta.LicenseShortName?.value) || 'Licencia libre',
        enlace: info.descriptionurl,
        gps,
      })
    }
  }
  return resultado
}

// ---------- Programa ----------

const lugares = JSON.parse(await readFile(join(RAIZ, 'public', 'datos', 'lugares.json'), 'utf8'))
const osm = JSON.parse(await readFile(join(RAIZ, 'datos', 'crudos', 'osm-edificios.json'), 'utf8'))
const etiquetas = new Map((osm.elements ?? osm).map((e) => [`${e.type[0]}${e.id}`, e.tags ?? {}]))

const elegidos = lugares
  .filter((l) => CATEGORIAS_FOTOS.includes(l.categoria))
  .sort((a, b) => CATEGORIAS_FOTOS.indexOf(a.categoria) - CATEGORIAS_FOTOS.indexOf(b.categoria) || a.nombre.localeCompare(b.nombre, 'es'))
console.log(`Buscando fotos de ${elegidos.length} lugares en Wikimedia Commons...`)

// 1. Ficha de Wikidata de cada lugar: la de OpenStreetMap o la que se encuentre por el nombre
const qidDe = new Map()
for (const lugar of elegidos) {
  const qid = etiquetas.get(lugar.id)?.wikidata?.split(';')[0].trim()
  if (qid) qidDe.set(lugar.id, qid)
}
const sitios = await sitiosDeWikidata()
for (const lugar of elegidos) {
  if (qidDe.has(lugar.id)) continue
  const qid = buscarEnWikidata(lugar, sitios)
  if (qid) qidDe.set(lugar.id, qid)
}
console.log(`  ${qidDe.size} lugares con ficha en Wikidata (${sitios.size} fichas con foto en Granada)`)
const fichas = await entidades([...new Set(qidDe.values())])

// 2. Títulos de archivo posibles de cada lugar, con su procedencia
const resultado = []
let hechos = 0
for (const lugar of elegidos) {
  const tags = etiquetas.get(lugar.id) ?? {}
  const ficha = fichas[qidDe.get(lugar.id)]
  const posibles = new Map() // título → fuente
  const anadir = (titulo, fuente) => {
    if (!titulo) return
    const sinPrefijo = titulo.replace(/^File:/, '').replace(/_/g, ' ')
    const completo = `File:${sinPrefijo.charAt(0).toUpperCase()}${sinPrefijo.slice(1)}`
    if (!EXTENSIONES.test(completo) || NO_SON_FOTOS.test(completo)) return
    if (!posibles.has(completo)) posibles.set(completo, fuente)
  }
  for (const imagen of valores(ficha, 'P18')) anadir(imagen, 'wikidata')
  const commons = tags.wikimedia_commons
  if (commons?.startsWith('File:')) anadir(commons, 'openstreetmap')
  const categorias = new Set(valores(ficha, 'P373'))
  if (commons?.startsWith('Category:')) categorias.add(commons.slice(9))
  for (const categoria of categorias) {
    for (const titulo of (await archivosDeCategoria(categoria)).slice(0, 12)) anadir(titulo, 'categoria')
  }
  if (posibles.size < POCAS) {
    for (const titulo of await buscarEnCommons(lugar)) {
      if (parecido(lugar, titulo.replace(/^File:/, '').replace(/\.\w+$/, '')) >= 0.75) anadir(titulo, 'nombre')
    }
    for (const { titulo, metros } of await cercanos(lugar)) {
      if (metros <= 80 && parecido(lugar, titulo.replace(/^File:/, '').replace(/\.\w+$/, '')) >= 0.6) anadir(titulo, 'cerca')
    }
  }
  resultado.push({ lugar, qid: qidDe.get(lugar.id) ?? null, posibles })
  process.stdout.write(`\r  Commons: ${++hechos} de ${elegidos.length} lugares`)
}
console.log('')

// 3. Datos de cada archivo y lista final
const todos = [...new Set(resultado.flatMap((r) => [...r.posibles.keys()]))]
const info = await informacion(todos)
await guardarCache()

const salida = []
for (const { lugar, qid, posibles } of resultado) {
  const candidatas = []
  for (const [titulo, fuente] of posibles) {
    const datos = info.get(titulo)
    if (!datos || !datos.miniatura || !/^image\/(jpeg|png|tiff|webp)$/.test(datos.mime)) continue
    if (Math.min(datos.anchoOriginal, datos.altoOriginal) < 300) continue
    // Una foto con su posición que queda lejos no es de este lugar (salvo la de su ficha de Wikidata)
    if (datos.gps && fuente !== 'wikidata' && distancia(datos.gps, lugar.punto) > 1500) continue
    const { gps, mime, anchoOriginal, altoOriginal, ...resto } = datos
    candidatas.push({ ...resto, fuente })
    if (candidatas.length === MAX_CANDIDATAS) break
  }
  salida.push({
    id: lugar.id,
    nombre: lugar.nombre,
    categoria: lugar.categoria,
    direccion: lugar.direccion ?? null,
    barrio: lugar.barrio ?? null,
    distrito: lugar.distrito ?? null,
    punto: lugar.punto,
    qid,
    candidatas,
  })
}

await writeFile(SALIDA, JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), lugares: salida }, null, 1))

const conFoto = salida.filter((l) => l.candidatas.length)
console.log(`\n${conFoto.length} de ${salida.length} lugares tienen alguna foto candidata (${salida.reduce((s, l) => s + l.candidatas.length, 0)} fotos).`)
for (const categoria of CATEGORIAS_FOTOS) {
  const de = salida.filter((l) => l.categoria === categoria)
  console.log(`  ${categoria}: ${de.filter((l) => l.candidatas.length).length} de ${de.length}`)
}
console.log(`Guardado en ${SALIDA}`)
