// Mapa de revisión de los tramos dudosos (paso 1.3).
// Enseña cada tramo en el que el callejero oficial (CDAU) y OpenStreetMap no coinciden y guarda lo que
// decide la persona en datos/revisiones.json, a través del servidor local (scripts/servidor-revision.mjs).

import { LngLatBounds, Map as Mapa, NavigationControl, ScaleControl } from '/vendor/maplibre/maplibre-gl.mjs'

const AZUL = '#1d6fd8'
const NARANJA = '#e8710a'
const IMPORTANCIA = {
  1: 'Vía principal',
  2: 'Vía secundaria',
  3: 'Vía de barrio',
  4: 'Calle residencial',
  5: 'Calle de tráfico restringido',
  6: 'Calle peatonal o sin clasificar',
}
const RUMBOS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste']
const FOTO_AEREA =
  'https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&format=image/jpeg' +
  '&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible' +
  '&tilematrix={z}&tilerow={y}&tilecol={x}'

const $ = (id) => document.getElementById(id)
const leer = (url) => fetch(url).then((r) => r.json())

const [dudosos, tramos, revisiones] = await Promise.all([leer('/dudosos.json'), leer('/tramos.json'), leer('/api/revisiones')])
const tramosPorVia = new Map()
for (const f of tramos.features) {
  if (!tramosPorVia.has(f.properties.via)) tramosPorVia.set(f.properties.via, [])
  tramosPorVia.get(f.properties.via).push(f)
}
const revisados = new Set(Object.keys(revisiones.tramos).map(Number))
const saltados = new Set()
const historial = []
let actual = null
let importanciaMaxima = 6

const pendientes = () => dudosos.filter((d) => d.importancia <= importanciaMaxima && !revisados.has(d.id) && !saltados.has(d.id))

// Rumbo de un tramo recorrido de principio a fin (o al revés)
function rumbo(linea, alReves) {
  const [a, b] = alReves ? [linea.at(-1), linea[0]] : [linea[0], linea.at(-1)]
  const x = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180)
  const grados = ((Math.atan2(x, b[1] - a[1]) * 180) / Math.PI + 360) % 360
  return { grados, nombre: RUMBOS[Math.round(grados / 45) % 8] }
}

function describir(sentido, d) {
  if (sentido === 'doble') return 'Doble sentido'
  if (sentido === 'peatonal') return 'Peatonal (sin coches)'
  const alReves = sentido === 'inverso'
  const calles = alReves ? d.callesAlInicio : d.callesAlFinal
  return `Sentido único hacia el ${rumbo(d.linea, alReves).nombre}${calles.length ? `, hacia ${calles.join(' / ')}` : ''}`
}

// Línea paralela a otra, separada `metros` a su izquierda (negativo: a su derecha)
function desplazar(linea, metros) {
  const k = Math.cos((linea[0][1] * Math.PI) / 180) * 111320
  const p = linea.map(([lon, lat]) => [lon * k, lat * 110540])
  return p.map((punto, i) => {
    const antes = p[Math.max(0, i - 1)]
    const despues = p[Math.min(p.length - 1, i + 1)]
    const dx = despues[0] - antes[0]
    const dy = despues[1] - antes[1]
    const largo = Math.hypot(dx, dy) || 1
    return [(punto[0] - (dy / largo) * metros) / k, (punto[1] + (dx / largo) * metros) / 110540]
  })
}

const linea = (coordenadas, propiedades = {}) => ({
  type: 'Feature',
  properties: propiedades,
  geometry: { type: 'LineString', coordinates: coordenadas },
})
const vacio = { type: 'FeatureCollection', features: [] }

function opinion(coordenadas, sentido) {
  const unico = sentido === 'directo' || sentido === 'inverso'
  return linea(sentido === 'inverso' ? [...coordenadas].reverse() : coordenadas, { tipo: unico ? 'unico' : sentido })
}

const capasDeOpinion = (fuente, color) => [
  {
    id: `${fuente}-linea`,
    type: 'line',
    source: fuente,
    filter: ['!=', ['get', 'tipo'], 'peatonal'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': 4 },
  },
  {
    id: `${fuente}-peatonal`,
    type: 'line',
    source: fuente,
    filter: ['==', ['get', 'tipo'], 'peatonal'],
    paint: { 'line-color': color, 'line-width': 4, 'line-dasharray': [1.5, 1.5] },
  },
  {
    id: `${fuente}-flechas`,
    type: 'symbol',
    source: fuente,
    filter: ['==', ['get', 'tipo'], 'unico'],
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 45,
      'icon-image': `flecha-${fuente}`,
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  },
]

const mapa = new Mapa({
  container: 'mapa',
  center: [-3.6, 37.175],
  zoom: 13,
  maxZoom: 20,
  style: {
    version: 8,
    sources: {
      callejero: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© colaboradores de OpenStreetMap',
      },
      foto: {
        type: 'raster',
        tiles: [FOTO_AEREA],
        tileSize: 256,
        maxzoom: 20,
        attribution: 'PNOA cedido por © Instituto Geográfico Nacional',
      },
      calle: { type: 'geojson', data: vacio },
      tramo: { type: 'geojson', data: vacio },
      oficial: { type: 'geojson', data: vacio },
      osm: { type: 'geojson', data: vacio },
    },
    layers: [
      { id: 'callejero', type: 'raster', source: 'callejero' },
      { id: 'foto', type: 'raster', source: 'foto', layout: { visibility: 'none' } },
      {
        id: 'calle',
        type: 'line',
        source: 'calle',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#5f5f5f', 'line-width': 10, 'line-opacity': 0.3 },
      },
      { id: 'tramo', type: 'line', source: 'tramo', paint: { 'line-color': '#111111', 'line-width': 3 } },
      ...capasDeOpinion('oficial', AZUL),
      ...capasDeOpinion('osm', NARANJA),
    ],
  },
})
mapa.addControl(new NavigationControl({ showCompass: false }))
mapa.addControl(new ScaleControl({ unit: 'metric' }))

// Flecha dibujada apuntando a la derecha: el mapa la gira para seguir la línea
function crearFlecha(color) {
  const lienzo = document.createElement('canvas')
  lienzo.width = 36
  lienzo.height = 28
  const c = lienzo.getContext('2d')
  c.fillStyle = color
  c.strokeStyle = '#ffffff'
  c.lineWidth = 3
  c.beginPath()
  c.moveTo(4, 4)
  c.lineTo(32, 14)
  c.lineTo(4, 24)
  c.lineTo(11, 14)
  c.closePath()
  c.stroke()
  c.fill()
  return c.getImageData(0, 0, lienzo.width, lienzo.height)
}

// Las dos opiniones se dibujan a cada lado del tramo, a 6 píxeles, sea cual sea el zoom
function dibujarOpiniones() {
  if (!actual) return
  const metrosPorPixel = (156543.03 * Math.cos((actual.linea[0][1] * Math.PI) / 180)) / 2 ** mapa.getZoom()
  mapa.getSource('oficial').setData(opinion(desplazar(actual.linea, 6 * metrosPorPixel), actual.oficial))
  mapa.getSource('osm').setData(opinion(desplazar(actual.linea, -6 * metrosPorPixel), actual.osm))
}

function mostrar(d) {
  actual = d
  $('error').hidden = true
  $('ficha').hidden = !d
  $('terminado').hidden = Boolean(d)
  const quedan = pendientes().length
  $('progreso').textContent = `${revisados.size.toLocaleString('es-ES')} revisados · quedan ${quedan.toLocaleString('es-ES')}`
  $('barra').style.width = `${(100 * revisados.size) / dudosos.length}%`
  $('deshacer').disabled = !historial.length
  if (!d) {
    for (const fuente of ['calle', 'tramo', 'oficial', 'osm']) mapa.getSource(fuente).setData(vacio)
    return
  }

  const deLaCalle = dudosos.filter((x) => x.via === d.via)
  $('importancia').textContent = IMPORTANCIA[d.importancia]
  $('calle').textContent = d.calle
  $('detalle').textContent =
    `Tramo de ${d.longitud} m` +
    (deLaCalle.length > 1 ? ` · ${deLaCalle.indexOf(d) + 1} de ${deLaCalle.length} tramos dudosos de esta calle` : '')
  $('texto-oficial').textContent = describir(d.oficial, d)
  $('texto-osm').textContent = describir(d.osm, d)

  const otras = $('otras-opciones')
  otras.replaceChildren()
  for (const sentido of ['doble', 'directo', 'inverso', 'peatonal']) {
    const boton = document.createElement('button')
    boton.className = 'opcion'
    boton.textContent = describir(sentido, d)
    boton.addEventListener('click', () => decidir(sentido, 'otra'))
    otras.append(boton)
  }
  $('otras').open = false

  const centro = d.linea[Math.floor(d.linea.length / 2)]
  $('street-view').href =
    `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${centro[1]},${centro[0]}` +
    `&heading=${Math.round(rumbo(d.linea).grados)}`

  mapa.getSource('calle').setData({ type: 'FeatureCollection', features: tramosPorVia.get(d.via) ?? [] })
  mapa.getSource('tramo').setData(linea(d.linea))
  const limites = d.linea.reduce((b, p) => b.extend(p), new LngLatBounds(d.linea[0], d.linea[0]))
  mapa.fitBounds(limites, { padding: 120, maxZoom: 18, duration: 600 })
  mapa.once('moveend', dibujarOpiniones)
  dibujarOpiniones()
}

async function guardar(id, sentido, eleccion) {
  const respuesta = await fetch('/api/revisiones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, sentido, eleccion }),
  })
  if (!respuesta.ok) throw new Error((await respuesta.json()).error)
}

async function decidir(sentido, eleccion) {
  if (!actual) return
  try {
    await guardar(actual.id, sentido, eleccion)
  } catch (error) {
    $('error').textContent = `No se ha podido guardar: ${error.message}. ¿Sigue abierta la ventana del servidor?`
    $('error').hidden = false
    return
  }
  revisados.add(actual.id)
  historial.push(actual.id)
  mostrar(pendientes()[0])
}

function saltar() {
  if (!actual) return
  saltados.add(actual.id)
  mostrar(pendientes()[0])
}

async function deshacer() {
  const id = historial.pop()
  if (id === undefined) return
  try {
    await guardar(id, null, null)
  } catch (error) {
    historial.push(id)
    $('error').textContent = `No se ha podido deshacer: ${error.message}`
    $('error').hidden = false
    return
  }
  revisados.delete(id)
  mostrar(dudosos.find((d) => d.id === id))
}

document.querySelectorAll('[data-eleccion]').forEach((boton) =>
  boton.addEventListener('click', () => decidir(actual[boton.dataset.eleccion], boton.dataset.eleccion)),
)
$('saltar').addEventListener('click', saltar)
$('deshacer').addEventListener('click', deshacer)
$('foto').addEventListener('change', (e) => {
  mapa.setLayoutProperty('foto', 'visibility', e.target.checked ? 'visible' : 'none')
  mapa.setLayoutProperty('callejero', 'visibility', e.target.checked ? 'none' : 'visible')
})
$('filtro').addEventListener('change', (e) => {
  importanciaMaxima = Number(e.target.value)
  mostrar(pendientes()[0])
})
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return
  const tecla = e.key.toLowerCase()
  if (tecla === '1') decidir(actual?.oficial, 'oficial')
  else if (tecla === '2') decidir(actual?.osm, 'osm')
  else if (tecla === '3') $('otras').open = !$('otras').open
  else if (tecla === 's') saltar()
  else if (tecla === 'z') deshacer()
})

mapa.on('zoom', dibujarOpiniones)
mapa.on('load', () => {
  mapa.addImage('flecha-oficial', crearFlecha(AZUL), { pixelRatio: 2 })
  mapa.addImage('flecha-osm', crearFlecha(NARANJA), { pixelRatio: 2 })
  mostrar(pendientes()[0])
})
