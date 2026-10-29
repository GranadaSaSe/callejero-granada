// Mapa base de Granada, compartido por el mapa de estudio y los juegos de mapa (Fase 2): calles, distritos,
// barrios, fondo (ríos, parques, vías del tren), lugares, nombres y flechas de sentido, y la zona de los
// parques de Granada (paso 2.5: municipios, carreteras y salidas de autovía). Se dibuja solo con los datos de
// la app y las letras de public/fuentes/, así que funciona sin internet.
import { AttributionControl, Map as Mapa, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl'
import urlTrabajador from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(urlTrabajador)

const COLORES_DISTRITO = {
  Albaicín: '#e9a97f',
  Beiro: '#93cbd6',
  Centro: '#f2cc6b',
  Chana: '#b4c995',
  Genil: '#c2a4d8',
  Norte: '#f0a2a2',
  Ronda: '#8db6dd',
  Zaidín: '#a5d39f',
}
export const NADA = ['==', ['get', 'via'], -1]
const VACIO = { type: 'FeatureCollection', features: [] }

// Carreteras de la zona por red, con su color (parecidos a los del plano de carreteras de la provincia)
export const REDES = [
  { id: 'autovia', nombre: 'Autovía', color: '#c62828' },
  { id: 'nacional', nombre: 'Carretera nacional', color: '#ef6c00' },
  { id: 'autonomica', nombre: 'Carretera autonómica', color: '#2e7d32' },
  { id: 'provincial', nombre: 'Carretera provincial', color: '#c49000' },
]
const COLOR_RED = ['match', ['get', 'red'], ...REDES.flatMap((r) => [r.id, r.color]), '#777777']
export const COLOR_MUNICIPIOS = '#c2185b'
// Una carretera elegida (su código puede ir con otro: "N-432 / GR-3417")
export const filtroCarretera = (codigo) => ['in', ` / ${codigo} / `, ['concat', ' / ', ['get', 'codigo'], ' / ']]

// Ancho de las calles según su importancia (1 = vía principal ... 6 = peatonal o sin clasificar) y el zoom
const anchoCalle = (extra = 0) => [
  'interpolate',
  ['exponential', 1.6],
  ['zoom'],
  12,
  ['+', extra * 0.4, ['match', ['get', 'importancia'], 1, 2.6, 2, 2, 3, 1.4, 0.7]],
  15,
  ['+', extra, ['match', ['get', 'importancia'], 1, 8, 2, 7, 3, 5.5, 4, 4, 5, 3.5, 3]],
  18,
  ['+', extra * 1.5, ['match', ['get', 'importancia'], 1, 26, 2, 22, 3, 18, 4, 14, 5, 12, 10]],
]

const TEXTO_CALLE = {
  'symbol-placement': 'line',
  'text-field': ['get', 'nombre'],
  'text-font': ['Noto Sans Regular'],
  'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 14],
  'text-max-angle': 30,
  'symbol-spacing': 300,
  'text-padding': 2,
}
// Los nombres que solo vienen de OpenStreetMap (vías sin nombre en el callejero oficial) van en gris
const HALO = {
  'text-color': ['case', ['get', 'osm'], '#857a70', '#3b332c'],
  'text-halo-color': '#ffffff',
  'text-halo-width': 1.6,
}
const ES_DUDOSO = ['==', ['get', 'dudoso'], true]

// Las flechas de sentido se añaden después de su imagen (ver 'style.load'): si la capa existe antes que
// la imagen, MapLibre se queda un rato esperándola
const CAPA_FLECHAS = {
  id: 'flechas',
  type: 'symbol',
  source: 'tramos',
  minzoom: 15,
  filter: ['==', ['get', 'sentido'], 'unico'],
  layout: {
    'symbol-placement': 'line',
    'symbol-spacing': 70,
    'icon-image': 'flecha',
    'icon-rotation-alignment': 'map',
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.7, 18, 1.1],
  },
}

// Une los tramos de cada calle en líneas largas para escribir su nombre: en un tramo corto (casi la mitad
// miden menos de 40 m) no cabe el nombre y el mapa no lo escribe.
export function lineasParaNombres(tramos) {
  const grupos = new Map()
  for (const f of tramos.features) {
    const nombre = f.properties.nombre ?? f.properties.nombreOsm
    if (!nombre) continue
    const clave = f.properties.nombre ? f.properties.via : `osm:${nombre}`
    if (!grupos.has(clave)) grupos.set(clave, { nombre, osm: !f.properties.nombre, importancia: 6, lineas: [] })
    const grupo = grupos.get(clave)
    grupo.importancia = Math.min(grupo.importancia, f.properties.importancia)
    grupo.lineas.push(f.geometry.coordinates)
  }
  const clave = (p) => `${p[0]},${p[1]}`
  const lineas = []
  for (const grupo of grupos.values()) {
    const enPunto = new Map()
    grupo.lineas.forEach((l, i) => {
      for (const p of [l[0], l.at(-1)]) {
        if (!enPunto.has(clave(p))) enPunto.set(clave(p), [])
        enPunto.get(clave(p)).push(i)
      }
    })
    const usadas = new Set()
    // La línea sigue por el único tramo que continúa en ese punto (si la calle se bifurca, se corta ahí)
    const siguiente = (p) => {
      const aqui = enPunto.get(clave(p)) ?? []
      const libres = aqui.filter((i) => !usadas.has(i))
      return aqui.length === 2 && libres.length === 1 ? libres[0] : null
    }
    grupo.lineas.forEach((primera, i) => {
      if (usadas.has(i)) return
      usadas.add(i)
      let linea = [...primera]
      for (let j = siguiente(linea.at(-1)); j !== null; j = siguiente(linea.at(-1))) {
        usadas.add(j)
        const otra = grupo.lineas[j]
        linea = linea.concat(clave(otra[0]) === clave(linea.at(-1)) ? otra.slice(1) : [...otra].reverse().slice(1))
      }
      for (let j = siguiente(linea[0]); j !== null; j = siguiente(linea[0])) {
        usadas.add(j)
        const otra = grupo.lineas[j]
        linea = (clave(otra.at(-1)) === clave(linea[0]) ? otra.slice(0, -1) : [...otra].reverse().slice(0, -1)).concat(linea)
      }
      lineas.push({
        type: 'Feature',
        properties: { nombre: grupo.nombre, importancia: grupo.importancia, osm: grupo.osm },
        geometry: { type: 'LineString', coordinates: linea },
      })
    })
  }
  return { type: 'FeatureCollection', features: lineas }
}

function estilo(base, { tramos, zonas, fondo, lugares, nombres, notas, municipios, carreteras, salidas, pueblos }) {
  const esNivel = (nivel) => ['==', ['get', 'nivel'], nivel]
  const esFondo = (...tipos) => ['in', ['get', 'tipo'], ['literal', tipos]]
  const esAutovia = ['==', ['get', 'red'], 'autovia']
  const anchoCarretera = (extra = 0) => [
    'interpolate',
    ['linear'],
    ['zoom'],
    9,
    ['+', extra * 0.5, ['match', ['get', 'red'], 'autovia', 2.6, 'provincial', 1, 1.6]],
    14,
    ['+', extra, ['match', ['get', 'red'], 'autovia', 6, 'provincial', 2.6, 4]],
    17,
    ['+', extra * 1.5, ['match', ['get', 'red'], 'autovia', 11, 'provincial', 5, 7]],
  ]
  return {
    version: 8,
    glyphs: `${base}fuentes/{fontstack}/{range}.pbf`,
    sources: {
      tramos: { type: 'geojson', data: tramos },
      zonas: { type: 'geojson', data: zonas },
      fondo: { type: 'geojson', data: fondo },
      lugares: { type: 'geojson', data: lugares },
      nombres: { type: 'geojson', data: nombres },
      notas: { type: 'geojson', data: notas },
      municipios: { type: 'geojson', data: municipios },
      carreteras: { type: 'geojson', data: carreteras },
      salidas: { type: 'geojson', data: salidas },
      pueblos: { type: 'geojson', data: pueblos },
    },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': '#f3efe8' } },
      {
        id: 'barrios-relleno',
        type: 'fill',
        source: 'zonas',
        filter: esNivel('barrio'),
        paint: {
          'fill-color': ['match', ['get', 'distrito'], ...Object.entries(COLORES_DISTRITO).flat(), '#dddddd'],
          'fill-opacity': 0.3,
        },
      },
      // Fondo (paso 2.1): encima del color de los barrios para que el verde y el agua se vean siempre igual
      {
        id: 'fondo-manchas',
        type: 'fill',
        source: 'fondo',
        filter: esFondo('verde', 'cementerio', 'agua'),
        paint: {
          'fill-color': ['match', ['get', 'tipo'], 'agua', '#a9d1ee', 'cementerio', '#d3dbc8', '#c3dfa6'],
          'fill-opacity': 0.9,
        },
      },
      {
        id: 'fondo-rios',
        type: 'line',
        source: 'fondo',
        filter: esFondo('rio'),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#8cc0e6',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 14, 3, 17, 8],
        },
      },
      {
        id: 'fondo-tren',
        type: 'line',
        source: 'fondo',
        filter: esFondo('tren'),
        paint: { 'line-color': '#9d948b', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 3.5] },
      },
      {
        id: 'fondo-tren-traviesas',
        type: 'line',
        source: 'fondo',
        minzoom: 14,
        filter: esFondo('tren'),
        paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 16, 1.6], 'line-dasharray': [3, 3] },
      },
      // Zona de los parques de Granada (paso 2.5): municipios con el límite en rosa, como en el plano, y
      // carreteras debajo de las calles de la capital
      {
        id: 'municipios-relleno',
        type: 'fill',
        source: 'municipios',
        paint: { 'fill-color': COLOR_MUNICIPIOS, 'fill-opacity': 0.04 },
      },
      {
        id: 'municipios-borde',
        type: 'line',
        source: 'municipios',
        paint: {
          'line-color': COLOR_MUNICIPIOS,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 13, 2.2],
          'line-opacity': 0.7,
        },
      },
      {
        id: 'carreteras-borde',
        type: 'line',
        source: 'carreteras',
        filter: esAutovia,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': anchoCarretera(2.5) },
      },
      {
        id: 'carreteras',
        type: 'line',
        source: 'carreteras',
        layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['match', ['get', 'red'], 'autovia', 4, 'nacional', 3, 'autonomica', 2, 1] },
        paint: { 'line-color': COLOR_RED, 'line-width': anchoCarretera() },
      },
      {
        id: 'calles-borde',
        type: 'line',
        source: 'tramos',
        filter: ['!=', ['get', 'sentido'], 'peatonal'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#c6baad', 'line-width': anchoCalle(2) },
      },
      {
        id: 'calles',
        type: 'line',
        source: 'tramos',
        filter: ['!=', ['get', 'sentido'], 'peatonal'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'importancia'], 1, '#f6b955', 2, '#fad88a', '#ffffff'],
          'line-width': anchoCalle(),
        },
      },
      {
        id: 'calles-peatonales',
        type: 'line',
        source: 'tramos',
        filter: ['==', ['get', 'sentido'], 'peatonal'],
        paint: {
          'line-color': '#d9c7b8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 18, 7],
          'line-dasharray': [2, 1],
        },
      },
      {
        id: 'seleccion',
        type: 'line',
        source: 'tramos',
        filter: NADA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#b3261e', 'line-width': anchoCalle(3), 'line-opacity': 0.8 },
      },
      {
        id: 'carretera-elegida',
        type: 'line',
        source: 'carreteras',
        filter: filtroCarretera(''),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1565c0', 'line-width': anchoCarretera(4), 'line-opacity': 0.75 },
      },
      {
        id: 'municipio-elegido',
        type: 'line',
        source: 'municipios',
        filter: ['==', ['get', 'nombre'], ''],
        paint: { 'line-color': COLOR_MUNICIPIOS, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 6] },
      },
      {
        id: 'dudosos-linea',
        type: 'line',
        source: 'tramos',
        minzoom: 14,
        filter: ES_DUDOSO,
        paint: {
          'line-color': '#f57c00',
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 18, 4],
          'line-dasharray': [1, 1.5],
        },
      },
      {
        id: 'barrios-borde',
        type: 'line',
        source: 'zonas',
        filter: esNivel('barrio'),
        paint: { 'line-color': '#857a6e', 'line-width': 1, 'line-dasharray': [3, 2], 'line-opacity': 0.6 },
      },
      {
        id: 'distritos-borde',
        type: 'line',
        source: 'zonas',
        filter: esNivel('distrito'),
        paint: {
          'line-color': '#7a5c45',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 16, 3],
          'line-opacity': 0.7,
        },
      },
      {
        id: 'lugares',
        type: 'circle',
        source: 'lugares',
        minzoom: 14,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3.5, 17, 7],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      },
      {
        id: 'lugar-elegido',
        type: 'circle',
        source: 'lugares',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-radius': 13,
          'circle-stroke-color': '#b3261e',
          'circle-stroke-width': 3,
        },
      },
      {
        id: 'dudosos',
        type: 'symbol',
        source: 'tramos',
        minzoom: 15,
        filter: ES_DUDOSO,
        layout: {
          'symbol-placement': 'line-center',
          'text-field': '?',
          'text-font': ['Noto Sans Bold'],
          'text-size': 16,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-rotation-alignment': 'viewport',
        },
        paint: { 'text-color': '#e65100', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      },
      {
        id: 'rios-nombres',
        type: 'symbol',
        source: 'fondo',
        minzoom: 12,
        filter: ['all', esFondo('rio'), ['has', 'nombre']],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 17, 14],
          'text-letter-spacing': 0.1,
          'text-max-angle': 30,
          'symbol-spacing': 500,
        },
        paint: { 'text-color': '#3a76a6', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
      {
        id: 'nombres-principales',
        type: 'symbol',
        source: 'nombres',
        minzoom: 14,
        filter: ['<=', ['get', 'importancia'], 3],
        layout: TEXTO_CALLE,
        paint: HALO,
      },
      {
        id: 'nombres-resto',
        type: 'symbol',
        source: 'nombres',
        minzoom: 15.5,
        filter: ['>', ['get', 'importancia'], 3],
        layout: TEXTO_CALLE,
        paint: HALO,
      },
      {
        id: 'lugares-nombres',
        type: 'symbol',
        source: 'lugares',
        minzoom: 16,
        layout: {
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-optional': true,
        },
        paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
      {
        id: 'barrios-nombres',
        type: 'symbol',
        source: 'zonas',
        minzoom: 13,
        maxzoom: 16,
        filter: esNivel('etiqueta-barrio'),
        layout: { 'text-field': ['get', 'nombre'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-max-width': 8 },
        paint: { 'text-color': '#6d6157', 'text-halo-color': 'rgba(255, 255, 255, 0.85)', 'text-halo-width': 1.5 },
      },
      {
        id: 'distritos-nombres',
        type: 'symbol',
        source: 'zonas',
        maxzoom: 13.5,
        filter: esNivel('etiqueta-distrito'),
        layout: {
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 15,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
        },
        paint: { 'text-color': '#5b4636', 'text-halo-color': 'rgba(255, 255, 255, 0.9)', 'text-halo-width': 2 },
      },
      // Zona de los parques: códigos de las carreteras, pueblos y salidas de autovía con su número
      {
        id: 'carreteras-codigos',
        type: 'symbol',
        source: 'carreteras',
        minzoom: 9,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 350,
          'symbol-sort-key': ['match', ['get', 'red'], 'autovia', 1, 'nacional', 2, 'autonomica', 3, 4],
          'text-field': ['get', 'codigo'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 15, 13],
          'text-max-angle': 30,
          'text-padding': 4,
        },
        paint: { 'text-color': COLOR_RED, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      },
      {
        id: 'pueblos',
        type: 'circle',
        source: 'pueblos',
        maxzoom: 14,
        filter: ['!=', ['get', 'nombre'], 'Granada'],
        paint: { 'circle-color': '#4a3f38', 'circle-radius': 3.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
      },
      {
        id: 'pueblos-nombres',
        type: 'symbol',
        source: 'pueblos',
        maxzoom: 14,
        filter: ['!=', ['get', 'nombre'], 'Granada'],
        layout: {
          'text-field': ['get', 'nombre'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 13, 14],
          'text-offset': [0, 0.6],
          'text-anchor': 'top',
          'text-max-width': 8,
        },
        paint: { 'text-color': '#7b1450', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      },
      {
        id: 'granada-nombre',
        type: 'symbol',
        source: 'pueblos',
        maxzoom: 11.5,
        filter: ['==', ['get', 'nombre'], 'Granada'],
        layout: { 'text-field': 'GRANADA', 'text-font': ['Noto Sans Bold'], 'text-size': 15, 'text-letter-spacing': 0.1 },
        paint: { 'text-color': '#7b1450', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      },
      {
        id: 'salidas',
        type: 'circle',
        source: 'salidas',
        minzoom: 10.5,
        paint: {
          'circle-color': '#263238',
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10.5, 6, 15, 11],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      },
      {
        id: 'salidas-numeros',
        type: 'symbol',
        source: 'salidas',
        minzoom: 12,
        layout: {
          'text-field': ['coalesce', ['get', 'numero'], '·'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 10,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: { 'text-color': '#ffffff' },
      },
      {
        id: 'salida-elegida',
        type: 'circle',
        source: 'salidas',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'rgba(0, 0, 0, 0)',
          'circle-radius': 16,
          'circle-stroke-color': '#1565c0',
          'circle-stroke-width': 3,
        },
      },
      {
        id: 'notas',
        type: 'circle',
        source: 'notas',
        paint: {
          // Rojo: mía sin compartir · marrón: mía ya compartida · azul: de un compañero
          'circle-color': ['match', ['get', 'estado'], 'ajena', '#1565c0', 'compartida', '#8d6e63', '#b3261e'],
          'circle-radius': 8,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      },
    ],
  }
}

// Flecha apuntando a la derecha: el mapa la gira para que siga la calle en el sentido de la circulación
export function crearFlecha(color = '#6b5f55') {
  const lienzo = document.createElement('canvas')
  lienzo.width = 30
  lienzo.height = 20
  const c = lienzo.getContext('2d')
  c.fillStyle = color
  c.beginPath()
  c.moveTo(4, 4)
  c.lineTo(26, 10)
  c.lineTo(4, 16)
  c.lineTo(9, 10)
  c.closePath()
  c.fill()
  return c.getImageData(0, 0, lienzo.width, lienzo.height)
}

// Crea el mapa en "lienzo". Lo que no se pasa queda vacío: los juegos no llevan nombres, lugares ni notas.
// Orientación del mapa elegida en este dispositivo, en grados (0 = norte arriba, 90 = este arriba)
const CLAVE_ORIENTACION = 'callejero-orientacion'
function leerOrientacion() {
  try {
    return Number(localStorage.getItem(CLAVE_ORIENTACION)) || 0
  } catch {
    return 0
  }
}
function guardarOrientacion(grados) {
  try {
    localStorage.setItem(CLAVE_ORIENTACION, String(Math.round(grados)))
  } catch {
    // Sin almacenamiento (modo privado): el giro dura mientras el mapa esté abierto
  }
}

// Puntos de los pueblos de la zona (el pueblo principal de cada municipio) para escribir su nombre
export const puntosDePueblos = (municipios) => ({
  type: 'FeatureCollection',
  features: municipios.features.map((f) => ({
    type: 'Feature',
    properties: { nombre: f.properties.nombre },
    geometry: { type: 'Point', coordinates: f.properties.centro },
  })),
})

// Salidas de autovía como puntos del mapa
export const puntosDeSalidas = (salidas) => ({
  type: 'FeatureCollection',
  features: salidas.map((s) => ({
    type: 'Feature',
    properties: { id: s.id, numero: s.numero, carretera: s.carretera },
    geometry: { type: 'Point', coordinates: s.punto },
  })),
})

export function crearMapa(
  lienzo,
  { tramos, zonas, fondo, lugares = VACIO, nombres = VACIO, notas = VACIO, municipios = VACIO, carreteras = VACIO, salidas = VACIO, pueblos = VACIO },
) {
  const orientacion = leerOrientacion()
  const mapa = new Mapa({
    container: lienzo,
    style: estilo(`${location.origin}${import.meta.env.BASE_URL}`, {
      tramos,
      zonas,
      fondo,
      lugares,
      nombres,
      notas,
      municipios,
      carreteras,
      salidas,
      pueblos,
    }),
    bounds: [
      [-3.65, 37.15],
      [-3.57, 37.2],
    ],
    // Toda la zona de los parques de Granada, con margen
    maxBounds: [
      [-4.3, 36.72],
      [-2.9, 37.58],
    ],
    // Cada uno gira el mapa como mejor se ubique (dos dedos, o botón derecho del ratón); siempre plano
    bearing: orientacion,
    fitBoundsOptions: { bearing: orientacion },
    maxZoom: 19,
    maxPitch: 0,
    pitchWithRotate: false,
    attributionControl: false,
  })
  mapa.touchPitch.disable()
  // La orientación se recuerda en el dispositivo y la usan el mapa de estudio y los juegos. La brújula
  // vuelve a poner el norte arriba.
  mapa.on('rotateend', () => guardarOrientacion(mapa.getBearing()))
  mapa.addControl(
    new AttributionControl({
      compact: true,
      customAttribution: '© colaboradores de OpenStreetMap · Callejero Digital de Andalucía (Junta de Andalucía)',
    }),
  )
  mapa.addControl(new NavigationControl({ showCompass: true, visualizePitch: false }), 'bottom-right')
  mapa.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
  mapa.on('style.load', () => {
    if (!mapa.hasImage('flecha')) mapa.addImage('flecha', crearFlecha(), { pixelRatio: 2 })
    if (!mapa.getLayer('flechas')) mapa.addLayer(CAPA_FLECHAS, 'lugares')
  })
  return mapa
}
