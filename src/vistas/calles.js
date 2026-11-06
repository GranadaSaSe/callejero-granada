// Lista de calles: todas las calles de Granada, ordenadas y filtradas de muchas formas. Al tocar una, se ilumina en
// el mapa de al lado (a la derecha en pantallas anchas; arriba en el móvil). Las cuentas están en
// src/lista-calles-datos.js. #/calles?id=ID abre la lista con esa calle elegida.
import { LngLatBounds } from 'maplibre-gl'
import { crear, miles, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import { DISTRITOS, ejesActuales } from '../ejes-lista.js'
import {
  AJUSTES_INICIALES,
  CIRCULACION,
  filtrarYOrdenar,
  IMPORTANCIAS,
  ORDENES,
  prepararLista,
  PROGRESOS,
  textoCirculacion,
  tiposDeVia,
} from '../lista-calles-datos.js'
import { crearMapa, lineasParaNombres, NADA } from '../mapa-base.js'
import { leerGuardado, progresoDeCalles } from '../progreso-zonas.js'

const CLAVE = 'callejero-lista-calles'

function leerAjustes() {
  try {
    return { ...AJUSTES_INICIALES, marcarTodas: false, ...JSON.parse(localStorage.getItem(CLAVE)), texto: '' }
  } catch {
    return { ...AJUSTES_INICIALES, marcarTodas: false }
  }
}

function guardarAjustes(ajustes) {
  try {
    const { texto, ...resto } = ajustes // lo escrito en el buscador no se guarda
    localStorage.setItem(CLAVE, JSON.stringify(resto))
  } catch {
    // Sin almacenamiento (modo privado): los ajustes duran solo mientras la app esté abierta
  }
}

// Filtros puestos, sin contar el orden ni el buscador
const FILTROS = ['circulacion', 'distrito', 'barrio', 'tipo', 'importancia', 'progreso', 'soloEjes']
const filtrosPuestos = (a) => FILTROS.filter((f) => a[f] !== AJUSTES_INICIALES[f]).length

export async function abrir(contenedor) {
  const cargando = crear('p', { class: 'cargando-texto' }, 'Cargando las calles…')
  contenedor.append(cargando)
  const [calles, tramos, zonas, fondo, lugares] = await Promise.all(['calles', 'tramos', 'zonas', 'fondo', 'lugares'].map(cargar))
  cargando.remove()

  const lista = prepararLista(calles, tramos)
  const porId = new Map(lista.map((x) => [x.calle.id, x]))
  const tipos = tiposDeVia(lista)
  const barrios = zonas.features
    .filter((f) => f.properties.nivel === 'barrio')
    .map((f) => ({ nombre: f.properties.nombre, distrito: f.properties.distrito }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const ajustes = leerAjustes()
  let progreso = new Map()
  let ejes = new Set()
  let elegida = null
  let visibles = []
  // Lo que se sabe de cada calle (tarjetas y juegos) y los ejes cambian al estudiar: se leen cada vez que se entra
  const releer = () => {
    progreso = progresoDeCalles({ calles, lugares, tramos }, leerGuardado())
    ejes = new Set(ejesActuales(calles).map((c) => c.id))
  }
  releer()

  // Estructura: el panel con los filtros y la lista, y el mapa
  const buscador = crear('input', { type: 'search', placeholder: 'Buscar una calle por su nombre', autocomplete: 'off', 'aria-label': 'Buscar una calle' })
  const controles = crear('div')
  const contador = crear('p', { class: 'contador-calles', 'aria-live': 'polite' })
  const ul = crear('ul', { class: 'filas-calles' })
  const panel = crear(
    'div',
    { class: 'lista-panel' },
    crear('h1', {}, 'Lista de calles'),
    crear('div', { class: 'buscador-calles' }, buscador),
    controles,
    contador,
    ul,
  )
  const lienzo = crear('div', { class: 'mapa-lienzo' })
  const ficha = crear('div', { class: 'ficha-lista', hidden: true })
  const zonaMapa = crear('div', { class: 'lista-mapa' }, lienzo, ficha)
  contenedor.append(crear('div', { class: 'lista-calles' }, panel, zonaMapa))

  // El mapa, con los nombres de las calles. La calle elegida se ilumina con la capa "seleccion" y, si se pide,
  // todas las de la lista en azul por debajo.
  const mapa = crearMapa(lienzo, { tramos, zonas, fondo, nombres: lineasParaNombres(tramos) })
  let mapaListo = false
  mapa.on('load', () => {
    // Los créditos, plegados en su botón (i): en el móvil el mapa es pequeño y tapaban un trozo
    const creditos = lienzo.querySelector('.maplibregl-ctrl-attrib')
    creditos?.classList.remove('maplibregl-compact-show')
    creditos?.removeAttribute('open')
    mapa.addLayer(
      {
        id: 'lista-todas',
        type: 'line',
        source: 'tramos',
        filter: NADA,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1565c0', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 9], 'line-opacity': 0.45 },
      },
      'seleccion',
    )
    mapaListo = true
    pintarEnMapa()
    if (elegida) encuadrar(elegida.caja)
  })
  // Tocar una calle en el mapa la elige también en la lista
  mapa.on('click', (e) => {
    const caja = [
      [e.point.x - 14, e.point.y - 14],
      [e.point.x + 14, e.point.y + 14],
    ]
    const tocada = mapa.queryRenderedFeatures(caja, { layers: ['calles', 'calles-peatonales'] })[0]
    const x = tocada && porId.get(tocada.properties.via)
    if (x) elegir(x, { desdeMapa: true })
  })

  const encuadrar = (caja) =>
    mapa.fitBounds(new LngLatBounds(caja[0], caja[1]), { padding: 60, maxZoom: 17, duration: 700, bearing: mapa.getBearing() })

  function pintarEnMapa() {
    if (!mapaListo) return
    mapa.setFilter('seleccion', elegida ? ['==', ['get', 'via'], elegida.calle.id] : NADA)
    mapa.setFilter('lista-todas', ajustes.marcarTodas ? ['in', ['get', 'via'], ['literal', visibles.map((x) => x.calle.id)]] : NADA)
  }

  // Elige una calle: se ilumina en el mapa, se encuadra y sale su ficha corta
  function elegir(x, { desdeMapa = false } = {}) {
    elegida = x
    for (const b of ul.querySelectorAll('[aria-current]')) b.removeAttribute('aria-current')
    const fila = ul.querySelector(`[data-id="${x.calle.id}"]`)
    fila?.setAttribute('aria-current', 'true')
    if (desdeMapa) fila?.scrollIntoView({ block: 'nearest' })
    pintarEnMapa()
    if (mapaListo && !desdeMapa) encuadrar(x.caja)
    const c = x.calle
    const extremos = c.inicio[0] && c.fin[0] && c.inicio[0] !== c.fin[0] ? `Va de ${c.inicio[0]} a ${c.fin[0]}.` : null
    rellenar(
      ficha,
      crear('button', { class: 'cerrar', 'aria-label': 'Cerrar', onclick: quitarEleccion }, '×'),
      crear('p', { class: 'ficha-tipo' }, `${c.tipo} · ${c.distritos.join(', ')}`),
      crear('h2', {}, c.nombre),
      crear('p', { class: 'ficha-nota' }, [`Barrio${c.barrios.length > 1 ? 's' : ''}: ${c.barrios.join(', ')}.`, extremos, `${textoCirculacion(c)}.`].filter(Boolean).join(' ')),
      crear('div', { class: 'chips' }, crear('a', { class: 'chip', href: `#/mapa?calle=${c.id}` }, 'Ver su ficha en el Mapa')),
    )
    ficha.hidden = false
  }

  function quitarEleccion() {
    elegida = null
    for (const b of ul.querySelectorAll('[aria-current]')) b.removeAttribute('aria-current')
    ficha.hidden = true
    pintarEnMapa()
  }

  const cambiar = (cambio) => {
    Object.assign(ajustes, cambio)
    // Un barrio de otro distrito no casa con el distrito elegido
    if (ajustes.distrito !== 'Todos' && !barrios.some((b) => b.nombre === ajustes.barrio && b.distrito === ajustes.distrito)) ajustes.barrio = 'Todos'
    guardarAjustes(ajustes)
    pintarControles()
    pintarLista()
    // Con un distrito o un barrio, el mapa enseña sus calles
    if (('distrito' in cambio || 'barrio' in cambio) && mapaListo && visibles.length) {
      const caja = new LngLatBounds(visibles[0].caja[0], visibles[0].caja[1])
      for (const x of visibles) caja.extend(x.caja[0]).extend(x.caja[1])
      mapa.fitBounds(caja, { padding: 30, maxZoom: 16, duration: 700, bearing: mapa.getBearing() })
    }
  }

  const desplegable = (etiqueta, clave, opciones) =>
    crear(
      'label',
      { class: 'campo-lista' },
      crear('span', {}, etiqueta),
      crear(
        'select',
        { onchange: (e) => cambiar({ [clave]: e.target.value }) },
        opciones.map((o) => crear('option', { value: o.id, selected: o.id === ajustes[clave] }, o.nombre)),
      ),
    )

  function pintarControles() {
    const puestos = filtrosPuestos(ajustes)
    const barriosDe = barrios.filter((b) => ajustes.distrito === 'Todos' || b.distrito === ajustes.distrito)
    const abierto = controles.querySelector('details')?.open ?? false
    rellenar(
      controles,
      desplegable('Ordenar', 'orden', ORDENES),
      crear(
        'details',
        { class: 'filtros-lista', open: abierto },
        crear('summary', {}, puestos ? `Filtros (${puestos} puesto${puestos > 1 ? 's' : ''})` : 'Filtros'),
        desplegable('Circulación', 'circulacion', CIRCULACION),
        desplegable('Distrito', 'distrito', [{ id: 'Todos', nombre: 'Todos los distritos' }, ...DISTRITOS.map((d) => ({ id: d, nombre: d }))]),
        desplegable('Barrio', 'barrio', [{ id: 'Todos', nombre: 'Todos los barrios' }, ...barriosDe.map((b) => ({ id: b.nombre, nombre: b.nombre }))]),
        desplegable('Tipo de vía', 'tipo', [{ id: 'Todos', nombre: 'Todos los tipos' }, ...tipos.map((t) => ({ id: t.tipo, nombre: `${t.tipo} (${miles(t.calles)})` }))]),
        desplegable('Importancia', 'importancia', IMPORTANCIAS),
        desplegable('Mi progreso', 'progreso', PROGRESOS),
        crear(
          'label',
          { class: 'casilla' },
          crear('input', { type: 'checkbox', checked: ajustes.soloEjes, onchange: (e) => cambiar({ soloEjes: e.target.checked }) }),
          'Solo los ejes principales',
        ),
        puestos > 0 &&
          crear(
            'button',
            { class: 'enlace-discreto', onclick: () => cambiar(Object.fromEntries(FILTROS.map((f) => [f, AJUSTES_INICIALES[f]]))) },
            'Quitar los filtros',
          ),
      ),
      crear(
        'label',
        { class: 'casilla' },
        crear('input', { type: 'checkbox', checked: ajustes.marcarTodas, onchange: (e) => cambiar({ marcarTodas: e.target.checked }) }),
        'Marcar en el mapa todas las de la lista',
      ),
    )
  }

  // La lista: nombre, barrios y distrito, y una marca si es peatonal o eje
  function pintarLista() {
    visibles = filtrarYOrdenar(lista, ajustes, { progreso, ejes })
    contador.textContent = visibles.length === 1 ? '1 calle' : `${miles(visibles.length)} calles`
    rellenar(
      ul,
      visibles.map((x) => {
        const c = x.calle
        const fallos = progreso.get(c.id)?.fallos ?? 0
        return crear(
          'li',
          {},
          crear(
            'button',
            { class: 'fila-calle', 'data-id': c.id, 'aria-current': elegida?.calle.id === c.id ? 'true' : null, onclick: () => elegir(x) },
            crear('strong', {}, c.nombre),
            crear(
              'span',
              {},
              `${c.barrios.join(', ')} (${c.distritos.join(', ')})`,
              c.sentido === 'peatonal' && crear('em', { class: 'marca-calle' }, 'peatonal'),
              ejes.has(c.id) && crear('em', { class: 'marca-calle' }, 'eje'),
              ajustes.orden === 'fallos' && fallos > 0 && crear('em', { class: 'marca-calle marca-fallos' }, `${fallos} fallo${fallos > 1 ? 's' : ''}`),
            ),
          ),
        )
      }),
    )
    if (!visibles.length) ul.append(crear('li', {}, crear('p', { class: 'hecho' }, 'Ninguna calle cumple estos filtros.')))
    pintarEnMapa()
  }

  let espera = null
  buscador.addEventListener('input', () => {
    clearTimeout(espera)
    espera = setTimeout(() => cambiar({ texto: buscador.value }), 150)
  })

  pintarControles()
  pintarLista()

  return {
    mostrar(parametros) {
      mapa.resize()
      releer()
      pintarLista()
      const id = Number(parametros?.get('id'))
      if (id && porId.has(id)) elegir(porId.get(id))
    },
  }
}
