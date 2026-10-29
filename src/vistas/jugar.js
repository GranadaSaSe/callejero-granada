// Pestaña Jugar (Fase 2): juegos sobre un mapa sin nombres. Aquí está lo común (la portada, el mapa y los
// paneles de arriba y abajo); cada juego está en src/juegos/: "¿Dónde está?" (paso 2.2), "¿Cómo se llama?"
// (paso 2.3, mapa mudo al revés), "¿Por dónde se circula?" (paso 2.4, sentidos de circulación) y "Zona de los
// parques" (paso 2.5: pueblos, salidas de autovía y carreteras).
import { LngLatBounds } from 'maplibre-gl'
import { crear, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import { juegoDonde } from '../juegos/donde.js'
import { juegoNombre } from '../juegos/nombre.js'
import { juegoSentidos } from '../juegos/sentidos.js'
import { juegoZona } from '../juegos/zona.js'
import { VACIO } from '../juegos/comun.js'
import { crearFlecha, crearMapa, puntosDePueblos, puntosDeSalidas } from '../mapa-base.js'
import { notaAbierta } from '../nota-pregunta.js'

const JUEGOS = [juegoDonde, juegoNombre, juegoSentidos, juegoZona]
// Capas del mapa base que darían la respuesta (nombres, lugares) o que no pintan nada en los juegos
const CAPAS_OCULTAS = [
  'nombres-principales',
  'nombres-resto',
  'lugares',
  'lugar-elegido',
  'lugares-nombres',
  'barrios-nombres',
  'flechas',
  'dudosos',
  'dudosos-linea',
  'notas',
  // De la zona de los parques se ven los límites, las carreteras y las salidas, pero sin nombres ni números
  'pueblos-nombres',
  'granada-nombre',
  'carreteras-codigos',
  'salidas-numeros',
  'municipio-elegido',
  'carretera-elegida',
  'salida-elegida',
]
// Figuras de los juegos: el sitio de la pregunta o de la respuesta, la línea de distancia y el toque
const FUENTES = ['juego-respuesta', 'juego-distancia', 'juego-toque']

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Preparando los juegos…'))
  const lienzo = crear('div', { class: 'mapa-lienzo' })
  const arriba = crear('div', { class: 'juego-arriba' })
  const abajo = crear('div', { class: 'juego-abajo', 'aria-live': 'polite' })
  const juego = crear('div', { class: 'mapa-estudio juego', hidden: true }, lienzo, arriba, abajo)
  contenedor.append(pagina, juego)
  // Los controles del mapa se colocan justo encima del panel de abajo, que cambia de alto
  new ResizeObserver(() => juego.style.setProperty('--hueco-abajo', `${abajo.offsetHeight + 16}px`)).observe(abajo)

  const [calles, tramos, zonas, fondo, lugares, municipios, carreteras, salidas] = await Promise.all(
    ['calles', 'tramos', 'zonas', 'fondo', 'lugares', 'municipios', 'carreteras', 'salidas'].map(cargar),
  )

  // Rectángulo de cada distrito y de toda Granada, para encuadrar el mapa al empezar cada pregunta
  const limitesZona = new Map()
  for (const f of zonas.features) {
    if (f.properties.nivel !== 'distrito') continue
    for (const nombre of [f.properties.nombre, 'Todos']) {
      if (!limitesZona.has(nombre)) limitesZona.set(nombre, new LngLatBounds())
      for (const anillo of f.geometry.coordinates.flat()) for (const p of anillo) limitesZona.get(nombre).extend(p)
    }
  }

  let mapa = null
  let mapaListo = null
  let enPartida = null // { tocar, tecla, girar } mientras se juega

  function prepararMapa() {
    if (mapaListo) return mapaListo
    mapa = crearMapa(lienzo, {
      tramos,
      zonas,
      fondo,
      municipios,
      carreteras,
      salidas: puntosDeSalidas(salidas),
      pueblos: puntosDePueblos(municipios),
    })
    mapaListo = new Promise((listo) =>
      mapa.on('load', () => {
        for (const capa of CAPAS_OCULTAS) if (mapa.getLayer(capa)) mapa.setLayoutProperty(capa, 'visibility', 'none')
        for (const fuente of FUENTES) mapa.addSource(fuente, { type: 'geojson', data: VACIO })
        mapa.addImage('flecha-juego', crearFlecha('#ffffff'), { pixelRatio: 2 })
        const esLinea = ['==', ['geometry-type'], 'LineString']
        const esPunto = ['==', ['geometry-type'], 'Point']
        const grosor = (a, b) => ['interpolate', ['linear'], ['zoom'], 12, a, 17, b]
        // Letra normal: la negrita pierde los espacios cuando el nombre va sobre la línea de la calle
        const texto = { 'text-field': ['get', 'nombre'], 'text-font': ['Noto Sans Regular'], 'text-size': 15 }
        const halo = { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
        const redondo = { 'line-cap': 'round', 'line-join': 'round' }
        for (const capa of [
          // Términos municipales marcados (zona de los parques)
          {
            id: 'juego-respuesta-relleno',
            type: 'fill',
            source: 'juego-respuesta',
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 },
          },
          { id: 'juego-respuesta-borde', type: 'line', source: 'juego-respuesta', filter: esLinea, layout: redondo, paint: { 'line-color': '#ffffff', 'line-width': grosor(8, 18) } },
          { id: 'juego-respuesta-linea', type: 'line', source: 'juego-respuesta', filter: esLinea, layout: redondo, paint: { 'line-color': ['get', 'color'], 'line-width': grosor(4, 11) } },
          // Flechas de sentido de las líneas que lo llevan (en "¿Por dónde se circula?", al contestar)
          {
            id: 'juego-flechas',
            type: 'symbol',
            source: 'juego-respuesta',
            filter: ['all', esLinea, ['==', ['get', 'sentido'], 'unico']],
            layout: {
              'symbol-placement': 'line',
              'symbol-spacing': 60,
              'icon-image': 'flecha-juego',
              'icon-rotation-alignment': 'map',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 1.4],
            },
          },
          { id: 'juego-distancia', type: 'line', source: 'juego-distancia', paint: { 'line-color': '#1f1a17', 'line-width': 2, 'line-dasharray': [2, 2] } },
          { id: 'juego-respuesta-punto', type: 'circle', source: 'juego-respuesta', filter: esPunto, paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['coalesce', ['get', 'radio'], 9], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } },
          { id: 'juego-toque', type: 'circle', source: 'juego-toque', paint: { 'circle-color': '#1565c0', 'circle-radius': 8, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } },
          { id: 'juego-nombre-linea', type: 'symbol', source: 'juego-respuesta', filter: esLinea, layout: { ...texto, 'symbol-placement': 'line', 'symbol-spacing': 250 }, paint: halo },
          { id: 'juego-nombre-punto', type: 'symbol', source: 'juego-respuesta', filter: esPunto, layout: { ...texto, 'text-offset': [0, 1.2], 'text-anchor': ['coalesce', ['get', 'ancla'], 'top'], 'text-max-width': 12 }, paint: halo },
        ]) {
          mapa.addLayer(capa)
        }
        listo()
      }),
    )
    mapa.on('click', (e) => enPartida?.tocar?.([e.lngLat.lng, e.lngLat.lat]))
    // Si se gira el mapa a mitad de pregunta, el juego puede girar lo suyo (las flechas de los sentidos)
    mapa.on('rotate', () => enPartida?.girar?.(mapa.getBearing()))
    return mapaListo
  }

  // Margen para que lo importante no quede debajo de la pregunta, del panel de abajo ni de los créditos y el
  // zoom, que van justo encima del panel. "holgura": más sitio para los nombres escritos junto a los puntos.
  const margen = (holgura = 0) => ({
    top: arriba.offsetHeight + 28 + holgura,
    bottom: abajo.offsetHeight + (juego.querySelector('.maplibregl-ctrl-attrib')?.offsetHeight ?? 0) + 36 + holgura,
    left: 28 + holgura / 2,
    right: 56 + holgura / 2,
  })

  function verPagina() {
    enPartida = null
    juego.hidden = true
    contenedor.classList.remove('vista-mapa')
    pagina.hidden = false
    contenedor.closest('.vistas')?.scrollTo(0, 0)
  }

  // Lo que los juegos usan de la pestaña
  const ctx = {
    datos: { calles, tramos, lugares, municipios, carreteras, salidas },
    pagina,
    arriba,
    abajo,
    portada,
    verPagina,
    // Enseña el mapa (lo crea la primera vez) y deja los manejadores del toque y del teclado de la partida
    async abrirMapa(manejadores) {
      pagina.hidden = true
      contenedor.classList.add('vista-mapa')
      juego.hidden = false
      rellenar(arriba)
      rellenar(abajo, crear('p', {}, 'Cargando el mapa…'))
      await prepararMapa()
      mapa.resize()
      enPartida = manejadores
    },
    limpiar: () => FUENTES.forEach((fuente) => mapa.getSource(fuente).setData(VACIO)),
    // Giro del mapa en grados (0 = norte arriba)
    giro: () => mapa.getBearing(),
    ponerDatos: (fuente, datos) => mapa.getSource(fuente).setData(datos),
    encuadrarZona: (zona) => mapa.fitBounds(limitesZona.get(zona) ?? limitesZona.get('Todos'), { padding: margen(), duration: 500, bearing: mapa.getBearing() }),
    encuadrar(puntos, { maxZoom = 17, holgura = 0 } = {}) {
      const limites = new LngLatBounds(puntos[0], puntos[0])
      for (const p of puntos) limites.extend(p)
      mapa.fitBounds(limites, { padding: margen(holgura), maxZoom, duration: 700, bearing: mapa.getBearing() })
    },
  }

  function portada() {
    verPagina()
    rellenar(
      pagina,
      crear('h1', {}, 'Jugar'),
      crear(
        'p',
        { class: 'intro' },
        'Juegos sobre un mapa sin nombres, para saber dónde está cada sitio, cómo se llama, por dónde se circula y cómo se va a los pueblos de alrededor.',
      ),
      JUEGOS.map((j) => j.tarjeta(ctx)),
    )
  }

  document.addEventListener('keydown', (e) => {
    if (!enPartida || contenedor.hidden || notaAbierta() || e.target.matches?.('input, select, textarea, button, a')) return
    enPartida.tecla?.(e)
  })

  portada()
  return {
    // Si se va al mapa de estudio desde una pregunta y se vuelve, la partida sigue donde estaba
    mostrar() {
      if (enPartida) mapa?.resize()
    },
  }
}
