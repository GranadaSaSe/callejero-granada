// Resumen de los datos descargados en el paso 1.1: cuántas calles, tramos, edificios y carreteras
// hay, y unas comprobaciones rápidas con sitios conocidos de Granada. Uso: `npm run datos:resumen`.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { centroDeRelacion, puntoEnRelacion } from './lib/geo.mjs'

const CARPETA = join(import.meta.dirname, '..', 'datos', 'crudos')
const leer = async (nombre) => JSON.parse(await readFile(join(CARPETA, nombre), 'utf8'))

const normalizar = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const contar = (lista) => {
  const recuento = new Map()
  for (const x of lista) recuento.set(x, (recuento.get(x) ?? 0) + 1)
  return [...recuento].sort((a, b) => b[1] - a[1])
}

const titulo = (texto) => console.log(`\n## ${texto}`)
const miles = (n) => n.toLocaleString('es-ES')

const [limites, calles, restricciones, edificios, carreteras, municipios, viales, tramos, portales] =
  await Promise.all(
    [
      'osm-limites.json',
      'osm-calles.json',
      'osm-restricciones.json',
      'osm-edificios.json',
      'osm-carreteras.json',
      'osm-municipios.json',
      'cdau-viales.json',
      'cdau-tramos.json',
      'cdau-portales.json',
    ].map(leer),
  )

// Distritos y barrios
titulo('Distritos y barrios (OpenStreetMap)')
const relaciones = limites.elements.filter((e) => e.type === 'relation')
const distritos = relaciones.filter((r) => r.tags.admin_level === '9')
const barrios = relaciones.filter((r) => r.tags.admin_level === '10')
const sinDistrito = []
const barriosPorDistrito = new Map(distritos.map((d) => [d.tags.name, []]))
for (const barrio of barrios) {
  const centro = centroDeRelacion(barrio)
  const distrito = centro && distritos.find((d) => puntoEnRelacion(centro, d))
  if (distrito) barriosPorDistrito.get(distrito.tags.name).push(barrio.tags.name)
  else sinDistrito.push(barrio.tags.name)
}
console.log(`${distritos.length} distritos y ${barrios.length} barrios`)
for (const [distrito, suyos] of [...barriosPorDistrito].sort()) {
  console.log(`- ${distrito} (${suyos.length}): ${suyos.sort().join(', ') || '—'}`)
}
if (sinDistrito.length) console.log(`- Sin distrito asignado: ${sinDistrito.join(', ')}`)

// Calles de OpenStreetMap
titulo('Calles (OpenStreetMap)')
const vias = calles.elements.filter((e) => e.type === 'way')
const conNombre = vias.filter((v) => v.tags.name)
const nombresOsm = new Set(conNombre.map((v) => normalizar(v.tags.name)))
const sentidoUnico = vias.filter(
  (v) => ['yes', '-1', '1', 'true'].includes(v.tags.oneway) || v.tags.junction === 'roundabout',
)
console.log(`${miles(vias.length)} tramos de vía, ${miles(conNombre.length)} con nombre`)
console.log(`${miles(nombresOsm.size)} nombres de calle distintos`)
console.log(`${miles(sentidoUnico.length)} tramos de sentido único (incluidas rotondas)`)
console.log(`${miles(restricciones.elements.length)} giros prohibidos u obligatorios`)
console.log('Tipos de vía más frecuentes:')
for (const [tipo, n] of contar(vias.map((v) => v.tags.highway)).slice(0, 10)) console.log(`  ${tipo}: ${miles(n)}`)

// Callejero oficial
titulo('Callejero oficial (CDAU)')
console.log(`${miles(viales.features.length)} vías, ${miles(tramos.features.length)} tramos, ${miles(portales.features.length)} portales`)
console.log('Tipos de vía:')
for (const [tipo, n] of contar(viales.features.map((f) => f.properties.nom_tip_via)).slice(0, 12)) console.log(`  ${tipo}: ${miles(n)}`)
console.log('Circulación de los tramos:')
for (const [valor, n] of contar(tramos.features.map((f) => f.properties.circulacion ?? '(sin dato)'))) console.log(`  ${valor}: ${miles(n)}`)

// Cruce rápido de nombres CDAU ↔ OpenStreetMap
titulo('Coincidencia de nombres CDAU ↔ OpenStreetMap')
const oficiales = viales.features.map((f) => f.properties.nom_normalizado).filter(Boolean)
const sinPareja = oficiales.filter((n) => !nombresOsm.has(normalizar(n)))
const coincidencia = Math.round((100 * (oficiales.length - sinPareja.length)) / oficiales.length)
console.log(`${coincidencia}% de las vías oficiales tienen el mismo nombre en OpenStreetMap`)
console.log(`Ejemplos sin pareja exacta: ${sinPareja.slice(0, 12).join(' · ')}`)

// Edificios de interés
titulo('Edificios y lugares de interés (OpenStreetMap)')
function categoria(t) {
  if (t.amenity === 'hospital') return 'Hospitales'
  if (t.amenity === 'clinic' || t.healthcare === 'centre') return 'Centros de salud'
  if (t.amenity === 'school') return 'Colegios e institutos'
  if (t.amenity === 'kindergarten') return 'Escuelas infantiles'
  if (t.amenity === 'college' || t.amenity === 'university') return 'Universidad y formación'
  if (t.amenity === 'social_facility' || t.amenity === 'nursing_home') return 'Residencias y centros sociales'
  if (t.amenity === 'fire_station') return 'Bomberos'
  if (t.amenity === 'police') return 'Policía'
  if (['townhall', 'courthouse'].includes(t.amenity) || t.office === 'government') return 'Edificios oficiales'
  if (t.tourism === 'artwork' || ['statue', 'bust'].includes(t.memorial)) return 'Estatuas y esculturas'
  if (t.amenity === 'place_of_worship') return 'Iglesias y templos'
  if (t.tourism === 'museum' || ['theatre', 'cinema', 'library', 'arts_centre'].includes(t.amenity)) return 'Cultura'
  if (t.tourism === 'viewpoint') return 'Miradores'
  if (t.historic || t.tourism === 'attraction') return 'Monumentos'
  if (t.railway || t.amenity === 'bus_station') return 'Transporte'
  if (t.shop === 'mall' || t.amenity === 'marketplace') return 'Centros comerciales y mercados'
  if (['stadium', 'sports_centre'].includes(t.leisure)) return 'Instalaciones deportivas'
  if (['park', 'garden'].includes(t.leisure)) return 'Parques y jardines'
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return 'Cementerios'
  if (t.amenity === 'fountain') return 'Fuentes'
  return 'Otros'
}
const lugares = edificios.elements.map((e) => ({ nombre: e.tags.name, categoria: categoria(e.tags) }))
const porCategoria = new Map()
for (const { nombre, categoria: c } of lugares) {
  if (!porCategoria.has(c)) porCategoria.set(c, new Set())
  porCategoria.get(c).add(nombre)
}
console.log(`${miles(lugares.length)} elementos, ${miles(new Set(lugares.map((l) => l.nombre)).size)} nombres distintos`)
for (const [c, nombres] of [...porCategoria].sort((a, b) => b[1].size - a[1].size)) console.log(`  ${c}: ${nombres.size}`)

// Carreteras del área metropolitana
titulo('Carreteras del área metropolitana (OpenStreetMap)')
const tramosCarretera = carreteras.elements.filter((e) => e.type === 'way' && !e.tags.highway.endsWith('_link'))
const codigos = new Set(tramosCarretera.flatMap((v) => (v.tags.ref ?? '').split(';').map((r) => r.trim()).filter(Boolean)))
const salidas = carreteras.elements.filter((e) => e.type === 'node')
console.log(`${codigos.size} carreteras con código: ${[...codigos].sort().join(', ')}`)
console.log(`${salidas.length} salidas de autovía (${salidas.filter((s) => s.tags.ref).length} con número)`)
const nombresMunicipios = municipios.elements.map((m) => m.tags.name).sort()
console.log(`${nombresMunicipios.length} municipios en la zona: ${nombresMunicipios.join(', ')}`)

// Comprobaciones con sitios conocidos
titulo('Comprobaciones con sitios conocidos')
const calleConocida = (nombre) => nombresOsm.has(normalizar(nombre)) || oficiales.some((o) => normalizar(o) === normalizar(nombre))
for (const calle of [
  'Gran Vía de Colón',
  'Calle Reyes Católicos',
  'Camino de Ronda',
  'Calle Recogidas',
  'Avenida de la Constitución',
  'Calle Pedro Antonio de Alarcón',
  'Calle Carrera del Darro',
  'Avenida de Dílar',
  'Calle San Juan de Dios',
  'Paseo del Salón',
]) {
  console.log(`  ${calleConocida(calle) ? 'sí' : 'NO'}  ${calle}`)
}
const nombresLugares = [...new Set(lugares.map((l) => l.nombre))]
for (const busqueda of ['Virgen de las Nieves', 'San Cecilio', 'Catedral', 'Alhambra', 'San Nicolás', 'Bomberos', 'Ayuntamiento', 'Isabel la Católica']) {
  const encontrados = nombresLugares.filter((n) => normalizar(n).includes(normalizar(busqueda)))
  console.log(`  ${encontrados.length ? 'sí' : 'NO'}  ${busqueda}${encontrados.length ? ` → ${encontrados.slice(0, 3).join(' · ')}` : ''}`)
}
for (const codigo of ['A-44', 'A-92', 'GR-30', 'A-395']) console.log(`  ${codigos.has(codigo) ? 'sí' : 'NO'}  carretera ${codigo}`)
