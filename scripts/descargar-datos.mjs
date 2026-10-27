// Paso 1.1 del plan: descarga los datos de partida de la app.
//
// - OpenStreetMap: límites (municipio, distritos y barrios), calles con su sentido, giros prohibidos,
//   edificios de interés y carreteras del área metropolitana con sus salidas.
// - CDAU (Callejero Digital de Andalucía Unificado): nombres oficiales de las vías, tramos con su
//   sentido de circulación y portales.
//
// Los archivos se guardan en datos/crudos/ y no se suben a GitHub: se pueden volver a descargar
// cuando se quiera. Uso: `npm run datos:descargar` (todo) o `npm run datos:descargar -- calles edificios`.

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CARPETA = join(import.meta.dirname, '..', 'datos', 'crudos')
const AGENTE = 'callejero-granada-estudio/0.1 (github.com/GranadaSaSe/callejero-granada)'

const SERVIDORES_OSM = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]
const WFS_CDAU = 'https://www.callejerodeandalucia.es/servicios/cdau/wfs'

const RELACION_GRANADA = 344685 // término municipal de Granada en OpenStreetMap
const AREA_GRANADA = 3600000000 + RELACION_GRANADA
const INE_GRANADA = '18087'
// Rectángulo que cubre el área metropolitana: sur, oeste, norte, este
const AREA_METROPOLITANA = '37.00,-3.85,37.32,-3.45'

const VIAS_CON_COCHE =
  'motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|' +
  'tertiary|tertiary_link|unclassified|residential|living_street|road'

const OSM = {
  limites: `[out:json][timeout:180];
rel(${RELACION_GRANADA});
out geom;
area(${AREA_GRANADA})->.g;
rel(area.g)["boundary"="administrative"]["admin_level"~"^(9|10)$"];
out geom;`,

  calles: `[out:json][timeout:300];
area(${AREA_GRANADA})->.g;
(
  way(area.g)["highway"~"^(${VIAS_CON_COCHE})$"];
  way(area.g)["highway"="service"]["service"!~"^(parking_aisle|driveway|drive-through)$"];
  way(area.g)["highway"]["name"];
);
out geom qt;`,

  restricciones: `[out:json][timeout:120];
area(${AREA_GRANADA})->.g;
rel(area.g)["type"="restriction"];
out body qt;`,

  edificios: `[out:json][timeout:300];
area(${AREA_GRANADA})->.g;
(
  nwr(area.g)["amenity"~"^(hospital|clinic|school|kindergarten|college|university|social_facility|nursing_home|fire_station|police|townhall|courthouse|place_of_worship|bus_station|theatre|cinema|library|arts_centre|marketplace|fountain|grave_yard)$"]["name"];
  nwr(area.g)["healthcare"="centre"]["name"];
  nwr(area.g)["office"="government"]["name"];
  nwr(area.g)["historic"]["name"];
  nwr(area.g)["tourism"~"^(artwork|museum|attraction|viewpoint)$"]["name"];
  nwr(area.g)["railway"~"^(station|halt|tram_stop)$"]["name"];
  nwr(area.g)["shop"="mall"]["name"];
  nwr(area.g)["leisure"~"^(stadium|sports_centre|park|garden)$"]["name"];
  nwr(area.g)["landuse"="cemetery"]["name"];
);
out center tags qt;`,

  carreteras: `[out:json][timeout:300][bbox:${AREA_METROPOLITANA}];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link)$"];
  way["highway"="tertiary"]["ref"];
);
out geom qt;
node["highway"="motorway_junction"];
out qt;`,

  municipios: `[out:json][timeout:180][bbox:${AREA_METROPOLITANA}];
rel["boundary"="administrative"]["admin_level"="8"];
out geom qt;`,
}

const CDAU = {
  viales: { capa: 'cdau:v_vial', orden: 'id_vial' },
  tramos: { capa: 'cdau:v_tramo', orden: 'id_tramo' },
  portales: { capa: 'cdau:v_portalpk', orden: 'id_por_pk' },
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function consultarOsm(nombre, consulta) {
  for (let ronda = 1; ronda <= 3; ronda++) {
    for (const servidor of SERVIDORES_OSM) {
      try {
        const respuesta = await fetch(servidor, {
          method: 'POST',
          headers: { 'User-Agent': AGENTE, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: consulta }),
          signal: AbortSignal.timeout(360_000),
        })
        const texto = await respuesta.text()
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
        const datos = JSON.parse(texto)
        if (datos.remark?.includes('error')) throw new Error(datos.remark)
        console.log(`  ${nombre}: ${datos.elements.length} elementos (${new URL(servidor).host})`)
        return datos
      } catch (error) {
        console.log(`  ${nombre}: fallo en ${new URL(servidor).host} (${error.message})`)
      }
    }
    console.log(`  ${nombre}: reintento dentro de ${20 * ronda} s`)
    await espera(20_000 * ronda)
  }
  throw new Error(`No se pudo descargar "${nombre}" de OpenStreetMap`)
}

async function consultarCdau(nombre, { capa, orden }) {
  const tamano = 5000
  const elementos = []
  for (let inicio = 0; ; inicio += tamano) {
    const parametros = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: capa,
      outputFormat: 'application/json',
      CQL_FILTER: `ine_mun='${INE_GRANADA}'`,
      count: String(tamano),
      startIndex: String(inicio),
    })
    if (orden) parametros.set('sortBy', orden)
    const respuesta = await fetch(`${WFS_CDAU}?${parametros}`, {
      headers: { 'User-Agent': AGENTE },
      signal: AbortSignal.timeout(300_000),
    })
    if (!respuesta.ok) throw new Error(`${nombre}: HTTP ${respuesta.status}`)
    const pagina = await respuesta.json()
    elementos.push(...pagina.features)
    if (pagina.features.length < tamano) break
  }
  console.log(`  ${nombre}: ${elementos.length} elementos`)
  return { type: 'FeatureCollection', features: elementos }
}

const pedidos = process.argv.slice(2)
const quiero = (nombre) => pedidos.length === 0 || pedidos.includes(nombre)

await mkdir(CARPETA, { recursive: true })
const resumen = { fecha: new Date().toISOString(), archivos: {} }

console.log('OpenStreetMap (© colaboradores de OpenStreetMap, licencia ODbL)')
for (const [nombre, consulta] of Object.entries(OSM)) {
  if (!quiero(nombre)) continue
  const datos = await consultarOsm(nombre, consulta)
  await writeFile(join(CARPETA, `osm-${nombre}.json`), JSON.stringify(datos))
  resumen.archivos[`osm-${nombre}.json`] = { elementos: datos.elements.length, fechaOsm: datos.osm3s?.timestamp_osm_base }
  await espera(5_000) // un respiro para no saturar el servidor
}

console.log('CDAU (Junta de Andalucía, licencia CC BY 4.0)')
for (const [nombre, capa] of Object.entries(CDAU)) {
  if (!quiero(nombre)) continue
  const datos = await consultarCdau(nombre, capa)
  await writeFile(join(CARPETA, `cdau-${nombre}.json`), JSON.stringify(datos))
  resumen.archivos[`cdau-${nombre}.json`] = { elementos: datos.features.length }
}

await writeFile(join(CARPETA, `descarga-${resumen.fecha.slice(0, 10)}.json`), JSON.stringify(resumen, null, 2))
console.log('Listo. Archivos en datos/crudos/')
