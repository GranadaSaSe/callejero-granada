// Pestaña Jugar (Fase 2): juegos sobre un mapa sin nombres. De momento "¿Dónde está?" (paso 2.2): la app
// dice una calle o un lugar, se toca en el mapa dónde está y se puntúa según los metros de distancia.
import { LngLatBounds } from 'maplibre-gl'
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import {
  ACIERTO_METROS,
  candidatas,
  elegir,
  medir,
  PREGUNTAS_POR_PARTIDA,
  puntosPorDistancia,
  textoMetros,
  TIPOS_DONDE,
  veredicto,
} from '../donde-datos.js'
import { DISTRITOS } from '../ejes-lista.js'
import { crearMapa } from '../mapa-base.js'
import { notaAbierta, notaDePregunta } from '../nota-pregunta.js'

const CLAVE = 'callejero-donde'
const VACIO = { type: 'FeatureCollection', features: [] }
// Capas del mapa base que darían la respuesta (nombres, lugares) o que no pintan nada en el juego
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
]
const PROXIMAMENTE = [
  ['¿Qué calle es?', 'Se ilumina una calle o un lugar y eliges su nombre'],
  ['Sentidos de circulación', 'Tramo a tramo: doble sentido o la flecha que elijas'],
  ['Carreteras del área', 'Cada vía con su código y sus salidas'],
]

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) ?? {}
  } catch {
    return {}
  }
}

function guardar(estado) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado))
  } catch {
    // Sin almacenamiento (modo privado): el récord dura solo mientras la app esté abierta
  }
}

const cifra = (numero, texto) => crear('div', { class: 'cifra' }, crear('strong', {}, numero), crear('span', {}, texto))
const coleccion = (features) => ({ type: 'FeatureCollection', features })
const linea = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } })
const punto = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } })

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Preparando los juegos…'))
  const lienzo = crear('div', { class: 'mapa-lienzo' })
  const arriba = crear('div', { class: 'juego-arriba' })
  const abajo = crear('div', { class: 'juego-abajo', 'aria-live': 'polite' })
  const juego = crear('div', { class: 'mapa-estudio juego', hidden: true }, lienzo, arriba, abajo)
  contenedor.append(pagina, juego)
  // Los controles del mapa se colocan justo encima del panel de abajo, que cambia de alto
  new ResizeObserver(() => juego.style.setProperty('--hueco-abajo', `${abajo.offsetHeight + 16}px`)).observe(abajo)

  const [calles, tramos, zonas, fondo, lugares] = await Promise.all(['calles', 'tramos', 'zonas', 'fondo', 'lugares'].map(cargar))
  const estado = { ajustes: { tipo: 'principales', zona: 'Todos' }, records: {}, items: {}, partidas: 0, ...leer() }
  const modalidad = () => `${estado.ajustes.tipo}|${estado.ajustes.zona}`

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
  let enPartida = null // { tecla } mientras se juega

  function prepararMapa() {
    if (mapaListo) return mapaListo
    mapa = crearMapa(lienzo, { tramos, zonas, fondo })
    mapaListo = new Promise((listo) =>
      mapa.on('load', () => {
        for (const capa of CAPAS_OCULTAS) if (mapa.getLayer(capa)) mapa.setLayoutProperty(capa, 'visibility', 'none')
        for (const fuente of ['juego-respuesta', 'juego-distancia', 'juego-toque']) mapa.addSource(fuente, { type: 'geojson', data: VACIO })
        const esLinea = ['==', ['geometry-type'], 'LineString']
        const esPunto = ['==', ['geometry-type'], 'Point']
        const grosor = (a, b) => ['interpolate', ['linear'], ['zoom'], 12, a, 17, b]
        // Letra normal: la negrita pierde los espacios cuando el nombre va sobre la línea de la calle
        const texto = { 'text-field': ['get', 'nombre'], 'text-font': ['Noto Sans Regular'], 'text-size': 15 }
        const halo = { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
        for (const capa of [
          { id: 'juego-respuesta-borde', type: 'line', source: 'juego-respuesta', filter: esLinea, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': grosor(8, 18) } },
          { id: 'juego-respuesta-linea', type: 'line', source: 'juego-respuesta', filter: esLinea, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': grosor(4, 11) } },
          { id: 'juego-distancia', type: 'line', source: 'juego-distancia', paint: { 'line-color': '#1f1a17', 'line-width': 2, 'line-dasharray': [2, 2] } },
          { id: 'juego-respuesta-punto', type: 'circle', source: 'juego-respuesta', filter: esPunto, paint: { 'circle-color': ['get', 'color'], 'circle-radius': 9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } },
          { id: 'juego-toque', type: 'circle', source: 'juego-toque', paint: { 'circle-color': '#1565c0', 'circle-radius': 8, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } },
          { id: 'juego-nombre-linea', type: 'symbol', source: 'juego-respuesta', filter: esLinea, layout: { ...texto, 'symbol-placement': 'line', 'symbol-spacing': 250 }, paint: halo },
          { id: 'juego-nombre-punto', type: 'symbol', source: 'juego-respuesta', filter: esPunto, layout: { ...texto, 'text-offset': [0, 1.2], 'text-anchor': ['get', 'ancla'], 'text-max-width': 12 }, paint: halo },
        ]) {
          mapa.addLayer(capa)
        }
        listo()
      }),
    )
    mapa.on('click', (e) => enPartida?.tocar([e.lngLat.lng, e.lngLat.lat]))
    return mapaListo
  }

  // Margen para que lo importante no quede debajo de la pregunta, del panel de abajo ni de los créditos y el
  // zoom, que van justo encima del panel
  const margen = () => ({
    top: arriba.offsetHeight + 28,
    bottom: abajo.offsetHeight + (juego.querySelector('.maplibregl-ctrl-attrib')?.offsetHeight ?? 0) + 36,
    left: 28,
    right: 56,
  })

  // El nombre de un lugar va debajo de su punto, hacia el lado contrario al toque: el punto queda en un borde
  // del encuadre y, centrado, el nombre se saldría de la pantalla
  const anclaNombre = (sitio, toque) => {
    const dx = Math.abs(sitio[0] - toque[0]) * 0.8 // un grado de longitud mide aquí el 80 % que uno de latitud
    const dy = Math.abs(sitio[1] - toque[1])
    return dx < dy * 0.3 ? 'top' : sitio[0] < toque[0] ? 'top-left' : 'top-right'
  }

  function verPagina() {
    enPartida = null
    juego.hidden = true
    contenedor.classList.remove('vista-mapa')
    pagina.hidden = false
    contenedor.closest('.vistas')?.scrollTo(0, 0)
  }

  const cambiarAjuste = (cambio) => {
    Object.assign(estado.ajustes, cambio)
    guardar(estado)
    portada()
  }

  function portada() {
    verPagina()
    const lista = candidatas({ calles, tramos, lugares }, estado.ajustes)
    const acertadas = lista.filter((s) => estado.items[s.id]?.bien > 0).length
    const record = estado.records[modalidad()]
    rellenar(
      pagina,
      crear('h1', {}, 'Jugar'),
      crear('p', { class: 'intro' }, 'Juegos sobre un mapa sin nombres, para saber dónde está cada sitio.'),
      crear(
        'section',
        { class: 'tarjeta modo-test' },
        crear('h2', {}, '¿Dónde está?'),
        crear(
          'p',
          {},
          `La app te dice una calle o un lugar y tú lo tocas en el mapa. Cuanto más cerca, más puntos: 100 si te quedas a menos de 50 m. Son ${PREGUNTAS_POR_PARTIDA} preguntas por partida.`,
        ),
        crear(
          'div',
          { class: 'ajustes-test' },
          crear(
            'select',
            { 'aria-label': 'Qué preguntar', onchange: (e) => cambiarAjuste({ tipo: e.target.value }) },
            TIPOS_DONDE.map((t) => crear('option', { value: t.id, selected: t.id === estado.ajustes.tipo }, t.nombre)),
          ),
          crear(
            'select',
            { 'aria-label': 'Zona', onchange: (e) => cambiarAjuste({ zona: e.target.value }) },
            ['Todos', ...DISTRITOS].map((d) =>
              crear('option', { value: d, selected: d === estado.ajustes.zona }, d === 'Todos' ? 'Toda Granada' : d),
            ),
          ),
        ),
        crear(
          'div',
          { class: 'cifras' },
          cifra(record ? miles(record) : '—', 'tu récord'),
          cifra(`${miles(acertadas)}/${miles(lista.length)}`, 'acertados'),
          cifra(miles(estado.partidas), 'partidas'),
        ),
        lista.length > 0
          ? crear('button', { class: 'boton grande', onclick: () => partida(lista) }, 'Jugar')
          : crear('p', { class: 'hecho' }, 'No hay nada que preguntar con estos ajustes.'),
        crear('p', { class: 'ficha-nota' }, `«Acertados»: sitios que alguna vez has tocado a menos de ${ACIERTO_METROS} m.`),
      ),
      crear('h2', {}, 'Próximamente'),
      crear(
        'ul',
        { class: 'secciones' },
        PROXIMAMENTE.map(([titulo, texto]) =>
          crear('li', {}, crear('div', { class: 'seccion proximamente' }, crear('strong', {}, titulo), crear('span', {}, texto))),
        ),
      ),
    )
  }

  async function partida(lista) {
    const preguntas = elegir(lista, PREGUNTAS_POR_PARTIDA, estado.items)
    const resultados = []
    let sitio = null
    let toque = null
    let respondida = false

    pagina.hidden = true
    contenedor.classList.add('vista-mapa')
    juego.hidden = false
    rellenar(arriba)
    rellenar(abajo, crear('p', {}, 'Cargando el mapa…'))
    await prepararMapa()
    mapa.resize()

    const total = () => resultados.reduce((suma, r) => suma + r.puntos, 0)
    const ponerDatos = (fuente, datos) => mapa.getSource(fuente).setData(datos)
    const marcador = crear('span')
    const pintarMarcador = (numero) => (marcador.textContent = `${numero} de ${preguntas.length} · ${miles(total())} puntos`)

    function pregunta() {
      sitio = preguntas[resultados.length]
      toque = null
      respondida = false
      for (const fuente of ['juego-respuesta', 'juego-distancia', 'juego-toque']) ponerDatos(fuente, VACIO)
      pintarMarcador(resultados.length + 1)
      rellenar(
        arriba,
        crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: portada }, '← Salir'), marcador),
        crear('p', { class: 'ficha-tipo' }, sitio.clase === 'calle' ? '¿Dónde está esta calle?' : `¿Dónde está? · ${sitio.categoria}`),
        crear('h2', {}, sitio.nombre),
      )
      const boton = crear('button', { class: 'boton grande', disabled: true, onclick: comprobar }, 'Comprobar')
      rellenar(abajo, crear('p', {}, 'Toca el mapa donde creas que está. Puedes acercarte y cambiar el punto antes de comprobar.'), boton)
      mapa.fitBounds(limitesZona.get(estado.ajustes.zona) ?? limitesZona.get('Todos'), { padding: margen(), duration: 500 })
      enPartida.tocar = (p) => {
        if (respondida) return
        toque = p
        ponerDatos('juego-toque', coleccion([punto(p)]))
        boton.disabled = false
      }
    }

    function comprobar() {
      if (!toque || respondida) return
      respondida = true
      const { metros, punto: cercano } = medir(sitio, toque)
      const puntos = puntosPorDistancia(metros)
      const acierto = metros <= ACIERTO_METROS
      resultados.push({ sitio, metros, puntos, acierto })
      pintarMarcador(resultados.length)
      apuntar([{ tema: sitio.clase === 'lugar' ? 'lugares' : 'zonas', acierto }])
      const antes = estado.items[sitio.id] ?? { bien: 0, total: 0 }
      estado.items[sitio.id] = { bien: antes.bien + (acierto ? 1 : 0), total: antes.total + 1, ultima: Math.round(metros) }
      guardar(estado)

      const propiedades = { nombre: sitio.nombre, color: acierto ? '#2e7d32' : '#d32f2f' }
      ponerDatos(
        'juego-respuesta',
        coleccion([
          ...(sitio.lineas ?? []).map((l) => linea(l, propiedades)),
          ...(sitio.puntos ?? []).map((p) => punto(p, { ...propiedades, ancla: anclaNombre(p, toque) })),
        ]),
      )
      ponerDatos('juego-distancia', coleccion(metros > 10 ? [linea([toque, cercano])] : []))
      const ultima = resultados.length === preguntas.length
      rellenar(
        abajo,
        crear(
          'div',
          { class: 'resultado-juego' },
          crear('button', { class: 'boton-nota', title: 'Dejar una nota sobre esta pregunta', onclick: nota }, '✎ Nota'),
          crear('p', { class: acierto ? 'acierto' : 'fallo' }, `${veredicto(metros)} · a ${textoMetros(metros)} · +${puntos} puntos`),
          crear('p', { class: 'ficha-nota' }, sitio.detalle),
        ),
        crear(
          'div',
          { class: 'acciones-eje' },
          crear('button', { class: 'boton', onclick: ultima ? final : pregunta }, ultima ? 'Ver el resultado' : 'Siguiente'),
          crear('a', { class: 'boton secundario', href: sitio.enlace }, 'Ver en el mapa'),
        ),
      )
      // Que se vean el toque y el sitio (entero si es una calle)
      const limites = new LngLatBounds(toque, toque)
      for (const p of [cercano, ...(sitio.lineas ?? []).flat(), ...(sitio.puntos ?? [])]) limites.extend(p)
      mapa.fitBounds(limites, { padding: margen(), maxZoom: 17, duration: 700 })
    }

    function nota() {
      notaDePregunta({
        modo: '¿Dónde está?',
        pregunta: `¿Dónde está ${sitio.nombre}?`,
        respuesta: sitio.detalle,
        id: `donde:${sitio.id}`,
        enlace: sitio.enlace,
        calle: sitio.calle,
        lugar: sitio.lugar,
      })
    }

    function final() {
      const puntos = total()
      const record = Math.max(puntos, estado.records[modalidad()] ?? 0)
      estado.records[modalidad()] = record
      estado.partidas++
      guardar(estado)
      verPagina()
      const aciertos = resultados.filter((r) => r.acierto).length
      const media = resultados.reduce((suma, r) => suma + r.metros, 0) / resultados.length
      const lejos = resultados.filter((r) => !r.acierto).sort((a, b) => b.metros - a.metros)
      rellenar(
        pagina,
        crear('h1', {}, aciertos === resultados.length ? '¡Todos clavados!' : 'Resultado'),
        crear(
          'section',
          { class: 'tarjeta resumen-repaso' },
          crear(
            'div',
            { class: 'cifras' },
            cifra(miles(puntos), `de ${miles(resultados.length * 100)} puntos`),
            cifra(`${aciertos}/${resultados.length}`, `a menos de ${ACIERTO_METROS} m`),
            cifra(textoMetros(media), 'de media'),
          ),
          crear('p', { class: 'ficha-nota' }, puntos >= record && puntos > 0 ? '¡Nuevo récord!' : `Tu récord: ${miles(record)} puntos`),
        ),
        lejos.length > 0 && [
          crear('h2', {}, 'Para repasar'),
          crear(
            'ul',
            { class: 'lista-notas' },
            lejos.map((r) =>
              crear(
                'li',
                {},
                crear('strong', {}, r.sitio.nombre),
                crear('p', {}, `Te quedaste a ${textoMetros(r.metros)} · ${r.sitio.detalle}`),
                crear('div', { class: 'chips' }, crear('a', { class: 'chip', href: r.sitio.enlace }, 'Ver en el mapa')),
              ),
            ),
          ),
        ],
        crear(
          'div',
          { class: 'acciones-eje' },
          crear('button', { class: 'boton', onclick: () => partida(candidatas({ calles, tramos, lugares }, estado.ajustes)) }, 'Jugar otra vez'),
          crear('button', { class: 'boton secundario', onclick: portada }, 'Volver'),
        ),
      )
    }

    // Teclado: Intro para comprobar y para pasar a la siguiente
    enPartida = {
      tocar() {},
      tecla(e) {
        if (e.key !== 'Enter') return
        e.preventDefault()
        if (!respondida) comprobar()
        else if (resultados.length === preguntas.length) final()
        else pregunta()
      },
    }
    pregunta()
  }

  document.addEventListener('keydown', (e) => {
    if (!enPartida || contenedor.hidden || notaAbierta() || e.target.matches?.('input, select, textarea, button, a')) return
    enPartida.tecla(e)
  })

  portada()
  return {
    // Si se va al mapa de estudio desde una pregunta y se vuelve, la partida sigue donde estaba
    mostrar() {
      if (enPartida) mapa?.resize()
    },
  }
}
