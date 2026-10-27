// Mapa de estudio (paso 1.4): calles con su nombre y su sentido, distritos, barrios y lugares de interés.
// Se dibuja solo con los datos de la app, así que funciona sin internet. Al tocar una calle o un lugar se
// abre su ficha, y el buscador lleva a cualquier calle o lugar.
import {
  AttributionControl,
  LngLatBounds,
  Map as Mapa,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl'
import urlTrabajador from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { crear, miles, normalizar } from '../crear.js'
import { cargar, GRUPOS, grupoDe } from '../datos.js'

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
const CLAVE_AJUSTES = 'callejero-mapa-capas'
const NADA = ['==', ['get', 'via'], -1]

function leerAjustes() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_AJUSTES)) ?? {}
  } catch {
    return {}
  }
}

function guardarAjustes(ajustes) {
  try {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes))
  } catch {
    // Sin almacenamiento (modo privado): se usan los ajustes por defecto la próxima vez
  }
}

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
const HALO = { 'text-color': '#3b332c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 }

function estilo(base, tramos, zonas, lugares) {
  const esNivel = (nivel) => ['==', ['get', 'nivel'], nivel]
  return {
    version: 8,
    glyphs: `${base}fuentes/{fontstack}/{range}.pbf`,
    sources: {
      tramos: { type: 'geojson', data: tramos },
      zonas: { type: 'geojson', data: zonas },
      lugares: { type: 'geojson', data: lugares },
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
        id: 'nombres-principales',
        type: 'symbol',
        source: 'tramos',
        minzoom: 14,
        filter: ['all', ['to-boolean', ['get', 'nombre']], ['<=', ['get', 'importancia'], 3]],
        layout: TEXTO_CALLE,
        paint: HALO,
      },
      {
        id: 'nombres-resto',
        type: 'symbol',
        source: 'tramos',
        minzoom: 15.5,
        filter: ['all', ['to-boolean', ['get', 'nombre']], ['>', ['get', 'importancia'], 3]],
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
    ],
  }
}

// Flecha apuntando a la derecha: el mapa la gira para que siga la calle en el sentido de la circulación
function crearFlecha() {
  const lienzo = document.createElement('canvas')
  lienzo.width = 30
  lienzo.height = 20
  const c = lienzo.getContext('2d')
  c.fillStyle = '#6b5f55'
  c.beginPath()
  c.moveTo(4, 4)
  c.lineTo(26, 10)
  c.lineTo(4, 16)
  c.lineTo(9, 10)
  c.closePath()
  c.fill()
  return c.getImageData(0, 0, lienzo.width, lienzo.height)
}

export async function abrir(contenedor) {
  const aviso = crear('p', { class: 'cargando' }, 'Cargando el mapa de Granada…')
  const lienzo = crear('div', { class: 'mapa-lienzo' })
  const buscador = crear('input', {
    type: 'search',
    placeholder: 'Buscar calle o lugar',
    autocomplete: 'off',
    'aria-label': 'Buscar calle o lugar',
  })
  const resultados = crear('ul', { class: 'resultados', hidden: true })
  const botonCapas = crear('button', { class: 'boton-flotante', 'aria-expanded': 'false' }, 'Capas')
  const panelCapas = crear('div', { class: 'panel-capas', hidden: true })
  const contenidoFicha = crear('div', { class: 'ficha-contenido' })
  const ficha = crear(
    'section',
    { class: 'ficha-mapa', hidden: true, 'aria-live': 'polite' },
    crear('button', { class: 'cerrar', 'aria-label': 'Cerrar ficha', onclick: () => cerrarFicha() }, '×'),
    contenidoFicha,
  )
  contenedor.append(
    crear(
      'div',
      { class: 'mapa-estudio' },
      lienzo,
      crear('div', { class: 'mapa-arriba' }, crear('div', { class: 'buscador' }, buscador, resultados), botonCapas),
      panelCapas,
      ficha,
      aviso,
    ),
  )

  let calles, tramos, zonas, lugares
  try {
    ;[calles, tramos, zonas, lugares] = await Promise.all(['calles', 'tramos', 'zonas', 'lugares'].map(cargar))
  } catch (error) {
    aviso.textContent = `No se han podido cargar los datos del mapa. Abre la app una vez con internet. (${error.message})`
    return {}
  }

  const callePorId = new Map(calles.map((c) => [c.id, c]))
  const lugarPorId = new Map(lugares.map((l) => [l.id, l]))
  const callesPorNombre = new Map()
  for (const c of calles) {
    if (!callesPorNombre.has(c.nombre)) callesPorNombre.set(c.nombre, [])
    callesPorNombre.get(c.nombre).push(c)
  }
  const limitesCalle = new Map()
  for (const f of tramos.features) {
    const [primero] = f.geometry.coordinates
    if (!limitesCalle.has(f.properties.via)) limitesCalle.set(f.properties.via, new LngLatBounds(primero, primero))
    for (const p of f.geometry.coordinates) limitesCalle.get(f.properties.via).extend(p)
  }
  const puntosLugares = {
    type: 'FeatureCollection',
    features: lugares.map((l) => {
      const grupo = grupoDe(l.categoria)
      return {
        type: 'Feature',
        properties: { id: l.id, nombre: l.nombre, grupo: grupo.nombre, color: grupo.color },
        geometry: { type: 'Point', coordinates: l.punto },
      }
    }),
  }

  const mapa = new Mapa({
    container: lienzo,
    style: estilo(`${location.origin}${import.meta.env.BASE_URL}`, tramos, zonas, puntosLugares),
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
  mapa.on('styleimagemissing', (e) => {
    if (e.id === 'flecha') mapa.addImage('flecha', crearFlecha(), { pixelRatio: 2 })
  })

  // Margen para que lo elegido no quede tapado por la ficha
  const margen = () =>
    innerWidth < 900
      ? { top: 80, bottom: Math.min(innerHeight * 0.5, 380) + 16, left: 24, right: 24 }
      : { top: 80, bottom: 40, left: 420, right: 60 }

  function mostrarFicha(hijos) {
    contenidoFicha.replaceChildren(crear('div', {}, hijos))
    ficha.hidden = false
    ficha.scrollTop = 0
  }

  function cerrarFicha() {
    ficha.hidden = true
    mapa.setFilter('seleccion', NADA)
    mapa.setFilter('lugar-elegido', ['==', ['get', 'id'], ''])
  }

  const dato = (titulo, valor) => [crear('dt', {}, titulo), crear('dd', {}, valor)]

  function calleCercana(nombre, desde) {
    const candidatas = callesPorNombre.get(nombre) ?? []
    if (candidatas.length <= 1) return candidatas[0]
    const centro = limitesCalle.get(desde.id).getCenter()
    const distancia = (c) => limitesCalle.get(c.id).getCenter().distanceTo(centro)
    return candidatas.reduce((a, b) => (distancia(b) < distancia(a) ? b : a))
  }

  function chipCalle(nombre, desde) {
    const destino = calleCercana(nombre, desde)
    return destino
      ? crear('button', { class: 'chip', onclick: () => elegirCalle(destino, true) }, nombre)
      : crear('span', { class: 'chip chip-mudo' }, nombre)
  }

  const listaCalles = (nombres, desde) =>
    nombres.length ? crear('span', { class: 'chips' }, nombres.map((n) => chipCalle(n, desde))) : 'No sale a otra calle'

  function textoSentido(c) {
    const desde = c.inicio[0] ?? 'el principio'
    const hasta = c.fin[0] ?? 'el final'
    switch (c.sentido) {
      case 'doble':
        return 'Doble sentido'
      case 'peatonal':
        return 'Peatonal'
      case 'hacia el final':
        return `Sentido único: de ${desde} hacia ${hasta}`
      case 'hacia el inicio':
        return `Sentido único: de ${hasta} hacia ${desde}`
      case 'mixto':
        return 'Cambia según el tramo (mira las flechas del mapa)'
      default:
        return 'Sin datos'
    }
  }

  function elegirCalle(c, centrar = false) {
    mapa.setFilter('seleccion', ['==', ['get', 'via'], c.id])
    mapa.setFilter('lugar-elegido', ['==', ['get', 'id'], ''])
    const aqui = lugares.filter((l) => l.via === c.id)
    mostrarFicha([
      crear('p', { class: 'ficha-tipo' }, [c.tipo, ...c.distritos].join(' · ')),
      crear('h2', {}, c.nombre),
      c.nombreOficial && crear('p', { class: 'ficha-nota' }, `Nombre oficial: ${c.nombreOficial}`),
      crear(
        'dl',
        { class: 'ficha-datos' },
        dato(c.barrios.length > 1 ? 'Barrios' : 'Barrio', c.barrios.join(', ') || '—'),
        dato('Empieza en', listaCalles(c.inicio, c)),
        dato('Termina en', listaCalles(c.fin, c)),
        dato('Sentido', textoSentido(c)),
        c.numeros && dato('Números', `del ${c.numeros[0]} al ${c.numeros[1]}`),
        c.codigosPostales.length > 0 && dato('Código postal', c.codigosPostales.join(', ')),
        dato('Longitud', `${miles(c.longitud)} m`),
      ),
      c.cruces.length > 0 && [
        crear('h3', {}, `Calles que cruza, en orden (${c.cruces.length})`),
        crear('div', { class: 'chips' }, c.cruces.map((n) => chipCalle(n, c))),
      ],
      aqui.length > 0 && [
        crear('h3', {}, 'En esta calle'),
        crear(
          'div',
          { class: 'chips' },
          aqui.map((l) => crear('button', { class: 'chip chip-lugar', onclick: () => elegirLugar(l, true) }, l.nombre)),
        ),
      ],
      c.tramosDudosos > 0 &&
        crear('p', { class: 'ficha-nota' }, `Sentido pendiente de revisar en ${c.tramosDudosos} tramo${c.tramosDudosos > 1 ? 's' : ''}.`),
    ])
    if (centrar) mapa.fitBounds(limitesCalle.get(c.id), { padding: margen(), maxZoom: 17, duration: 700 })
  }

  function elegirLugar(l, centrar = false) {
    const calle = callePorId.get(l.via)
    mapa.setFilter('lugar-elegido', ['==', ['get', 'id'], l.id])
    mapa.setFilter('seleccion', calle ? ['==', ['get', 'via'], calle.id] : NADA)
    mostrarFicha([
      crear('p', { class: 'ficha-tipo' }, [l.categoria, l.distrito].join(' · ')),
      crear('h2', {}, l.nombre),
      crear(
        'dl',
        { class: 'ficha-datos' },
        dato('Dirección', l.direccion ?? 'Sin dirección'),
        dato('Barrio', l.barrio ?? '—'),
      ),
      l.direccion && l.direccionSegun !== 'osm' && crear('p', { class: 'ficha-nota' }, 'Dirección aproximada: la del portal más cercano.'),
      calle && crear('button', { class: 'chip', onclick: () => elegirCalle(calle, true) }, `Ver ${calle.nombre}`),
    ])
    if (centrar) mapa.easeTo({ center: l.punto, zoom: Math.max(mapa.getZoom(), 16.5), padding: margen(), duration: 700 })
  }

  mapa.on('click', (e) => {
    resultados.hidden = true
    const caja = [
      [e.point.x - 8, e.point.y - 8],
      [e.point.x + 8, e.point.y + 8],
    ]
    const lugar = mapa.queryRenderedFeatures(caja, { layers: ['lugares'] })[0]
    if (lugar) return elegirLugar(lugarPorId.get(lugar.properties.id))
    const tramo = mapa
      .queryRenderedFeatures(caja, { layers: ['calles', 'calles-peatonales'] })
      .find((f) => callePorId.has(f.properties.via))
    if (tramo) return elegirCalle(callePorId.get(tramo.properties.via))
    cerrarFicha()
  })
  for (const capa of ['lugares', 'calles', 'calles-peatonales']) {
    mapa.on('mouseenter', capa, () => (mapa.getCanvas().style.cursor = 'pointer'))
    mapa.on('mouseleave', capa, () => (mapa.getCanvas().style.cursor = ''))
  }

  // Buscador de calles y lugares
  const indice = [
    ...calles.map((c) => ({
      tipo: 'calle',
      dato: c,
      texto: normalizar(`${c.nombre} ${c.nombreOficial ?? ''}`),
      detalle: [c.tipo, c.distritos[0]].filter(Boolean).join(' · '),
    })),
    ...lugares.map((l) => ({ tipo: 'lugar', dato: l, texto: normalizar(l.nombre), detalle: `${l.categoria} · ${l.distrito}` })),
  ]
  function buscar(consulta) {
    const q = normalizar(consulta)
    if (q.length < 2) return []
    const palabras = q.split(' ')
    // Primero lo que empieza por lo buscado (sin contar "Calle", "Plaza"...), las calles antes que los
    // lugares, y después lo más corto
    const puntos = (x) => {
      const nombre = normalizar(x.dato.nombre)
      const empieza = nombre.startsWith(q) || nombre.split(' ').slice(1).join(' ').startsWith(q)
      return (empieza ? 0 : 1000) + (x.tipo === 'lugar' ? 200 : 0) + nombre.length
    }
    return indice
      .filter((x) => palabras.every((p) => x.texto.includes(p)))
      .sort((a, b) => puntos(a) - puntos(b))
      .slice(0, 8)
  }
  function irA(x) {
    resultados.hidden = true
    buscador.value = x.dato.nombre
    buscador.blur()
    if (x.tipo === 'calle') elegirCalle(x.dato, true)
    else elegirLugar(x.dato, true)
  }
  buscador.addEventListener('input', () => {
    const lista = buscar(buscador.value)
    resultados.replaceChildren(
      ...(lista.length
        ? lista.map((x) =>
            crear('li', {}, crear('button', { onclick: () => irA(x) }, crear('strong', {}, x.dato.nombre), crear('span', {}, x.detalle))),
          )
        : [crear('li', { class: 'sin-resultados' }, 'No hay ninguna calle ni lugar con ese nombre')]),
    )
    resultados.hidden = normalizar(buscador.value).length < 2
  })
  buscador.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const primero = buscar(buscador.value)[0]
      if (primero) irA(primero)
    }
    if (e.key === 'Escape') resultados.hidden = true
  })

  // Panel de capas: qué se ve en el mapa (se recuerda en este dispositivo)
  const ajustes = { zonas: true, sentidos: true, grupos: GRUPOS.map((g) => g.nombre), ...leerAjustes() }
  function aplicarAjustes() {
    guardarAjustes(ajustes)
    const visible = (si) => (si ? 'visible' : 'none')
    for (const capa of ['barrios-relleno', 'barrios-borde', 'distritos-borde', 'barrios-nombres', 'distritos-nombres']) {
      mapa.setLayoutProperty(capa, 'visibility', visible(ajustes.zonas))
    }
    mapa.setLayoutProperty('flechas', 'visibility', visible(ajustes.sentidos))
    const filtro = ['in', ['get', 'grupo'], ['literal', ajustes.grupos]]
    mapa.setFilter('lugares', filtro)
    mapa.setFilter('lugares-nombres', filtro)
  }
  const casilla = (texto, marcada, alCambiar, color) =>
    crear(
      'label',
      { class: 'casilla' },
      crear('input', { type: 'checkbox', checked: marcada, onchange: (e) => alCambiar(e.target.checked) }),
      color && crear('span', { class: 'punto', style: `background: ${color}` }),
      texto,
    )
  panelCapas.append(
    crear('h3', {}, 'Qué ver en el mapa'),
    casilla('Distritos y barrios', ajustes.zonas, (si) => {
      ajustes.zonas = si
      aplicarAjustes()
    }),
    casilla('Flechas de sentido', ajustes.sentidos, (si) => {
      ajustes.sentidos = si
      aplicarAjustes()
    }),
    crear('h3', {}, 'Lugares de interés'),
    GRUPOS.map((g) =>
      casilla(
        g.nombre,
        ajustes.grupos.includes(g.nombre),
        (si) => {
          ajustes.grupos = si ? [...ajustes.grupos, g.nombre] : ajustes.grupos.filter((n) => n !== g.nombre)
          aplicarAjustes()
        },
        g.color,
      ),
    ),
  )
  botonCapas.addEventListener('click', () => {
    panelCapas.hidden = !panelCapas.hidden
    botonCapas.setAttribute('aria-expanded', String(!panelCapas.hidden))
  })

  const cargado = new Promise((listo) =>
    mapa.on('load', () => {
      aplicarAjustes()
      aviso.remove()
      listo()
    }),
  )

  return {
    // #/mapa?calle=123 abre la ficha de esa calle; #/mapa?lugar=n456, la de ese lugar
    async mostrar(parametros) {
      mapa.resize()
      await cargado
      const calle = callePorId.get(Number(parametros?.get('calle')))
      const lugar = lugarPorId.get(parametros?.get('lugar'))
      if (calle) elegirCalle(calle, true)
      else if (lugar) elegirLugar(lugar, true)
    },
  }
}
