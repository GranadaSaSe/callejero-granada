// Mapa base de Granada, compartido por el mapa de estudio y los juegos de mapa (Fase 2): calles, distritos,
// barrios, fondo (ríos, parques, vías del tren), lugares, nombres y flechas de sentido. Se dibuja solo con los
// datos de la app y las letras de public/fuentes/, así que funciona sin internet.
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

function estilo(base, { tramos, zonas, fondo, lugares, nombres, notas }) {
  const esNivel = (nivel) => ['==', ['get', 'nivel'], nivel]
  const esFondo = (...tipos) => ['in', ['get', 'tipo'], ['literal', tipos]]
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
export function crearMapa(lienzo, { tramos, zonas, fondo, lugares = VACIO, nombres = VACIO, notas = VACIO }) {
  const mapa = new Mapa({
    container: lienzo,
    style: estilo(`${location.origin}${import.meta.env.BASE_URL}`, { tramos, zonas, fondo, lugares, nombres, notas }),
    bounds: [
      [-3.65, 37.15],
      [-3.57, 37.2],
    ],
    maxBounds: [
      [-3.85, 37.05],
      [-3.4, 37.3],
    ],
    maxZoom: 19,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: false,
  })
  mapa.touchZoomRotate.disableRotation()
  mapa.addControl(
    new AttributionControl({
      compact: true,
      customAttribution: '© colaboradores de OpenStreetMap · Callejero Digital de Andalucía (Junta de Andalucía)',
    }),
  )
  mapa.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
  mapa.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
  mapa.on('style.load', () => {
    if (!mapa.hasImage('flecha')) mapa.addImage('flecha', crearFlecha(), { pixelRatio: 2 })
    if (!mapa.getLayer('flechas')) mapa.addLayer(CAPA_FLECHAS, 'lugares')
  })
  return mapa
}
