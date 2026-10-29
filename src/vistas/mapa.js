// Mapa de estudio (paso 1.4): calles con su nombre y su sentido, distritos, barrios, lugares de interés y,
// de fondo (paso 2.1), ríos, parques y vías del tren. Además, la zona de los parques de Granada (paso 2.5):
// sus pueblos, carreteras y salidas de autovía.
// Se dibuja solo con los datos de la app, así que funciona sin internet. Al tocar una calle, un lugar, un
// pueblo, una carretera o una salida se abre su ficha, y el buscador lleva a cualquiera de ellos.
import { LngLatBounds } from 'maplibre-gl'
import { crear, miles, normalizar } from '../crear.js'
import { cargar, GRUPOS, grupoDe } from '../datos.js'
import {
  alCambiarNotas,
  anadirNota,
  borrarNota,
  describirFecha,
  guardarAutor,
  leerAutor,
  leerNotas,
  TIPOS,
} from '../notas.js'
import { crearMapa, filtroCarretera, lineasParaNombres, NADA, puntosDePueblos, puntosDeSalidas, REDES } from '../mapa-base.js'

const CLAVE_AJUSTES = 'callejero-mapa-capas'
const PALABRAS_SENTIDO = { unico: 'sentido único', doble: 'doble sentido', peatonal: 'peatonal' }

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

const puntosDeNotas = (notas) => ({
  type: 'FeatureCollection',
  // Las notas sobre preguntas no tienen punto: no salen en el mapa
  features: notas.filter((n) => n.punto).map((n) => ({
    type: 'Feature',
    properties: { id: n.id, estado: n.importada ? 'ajena' : n.compartida ? 'compartida' : 'nueva' },
    geometry: { type: 'Point', coordinates: n.punto },
  })),
})

export async function abrir(contenedor) {
  const aviso = crear('p', { class: 'cargando' }, 'Cargando el mapa de Granada…')
  const lienzo = crear('div', { class: 'mapa-lienzo' })
  const buscador = crear('input', {
    type: 'search',
    placeholder: 'Buscar calle, lugar, pueblo o carretera',
    autocomplete: 'off',
    'aria-label': 'Buscar calle, lugar, pueblo o carretera',
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

  let calles, tramos, zonas, fondo, lugares, municipios, carreteras, salidas
  try {
    ;[calles, tramos, zonas, fondo, lugares, municipios, carreteras, salidas] = await Promise.all(
      ['calles', 'tramos', 'zonas', 'fondo', 'lugares', 'municipios', 'carreteras', 'salidas'].map(cargar),
    )
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

  // Zona de los parques de Granada: cada pueblo, cada salida y cada carretera (por código) con su rectángulo
  const municipioPorNombre = new Map(municipios.features.map((f) => [f.properties.nombre, f]))
  const salidaPorId = new Map(salidas.map((s) => [s.id, s]))
  const limitesDe = (lineas) => {
    const limites = new LngLatBounds(lineas[0][0], lineas[0][0])
    for (const l of lineas) for (const p of l) limites.extend(p)
    return limites
  }
  const limitesMunicipio = new Map(municipios.features.map((f) => [f.properties.nombre, limitesDe(f.geometry.coordinates.flat())]))
  const lineasCarretera = new Map()
  const redesCarretera = new Map()
  const nombresCarretera = new Map()
  for (const f of carreteras.features) {
    for (const c of f.properties.codigo.split(' / ')) {
      if (!lineasCarretera.has(c)) [lineasCarretera, redesCarretera, nombresCarretera].forEach((m) => m.set(c, []))
      lineasCarretera.get(c).push(f.geometry.coordinates)
      redesCarretera.get(c).push(f.properties.red)
      if (f.properties.nombre) nombresCarretera.get(c).push(f.properties.nombre)
    }
  }
  // El tipo de una carretera es el de la mayoría de sus tramos
  const redDe = (codigo) => {
    const cuenta = {}
    for (const r of redesCarretera.get(codigo) ?? []) cuenta[r] = (cuenta[r] ?? 0) + 1
    const id = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0]
    return REDES.find((r) => r.id === id) ?? REDES[3]
  }
  // Pueblos a los que se va desde Granada por una carretera o una salida
  const usanAcceso = (prueba) => municipios.features.filter((f) => f.properties.acceso?.pasos.some(prueba)).map((f) => f.properties.nombre)

  const mapa = crearMapa(lienzo, {
    tramos,
    zonas,
    fondo,
    lugares: puntosLugares,
    nombres: lineasParaNombres(tramos),
    notas: puntosDeNotas(leerNotas()),
    municipios,
    carreteras,
    salidas: puntosDeSalidas(salidas),
    pueblos: puntosDePueblos(municipios),
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
    quitarSeleccionZona()
  }

  // Quita lo marcado de la zona de los parques (un pueblo, una carretera o una salida)
  function quitarSeleccionZona() {
    mapa.setFilter('municipio-elegido', ['==', ['get', 'nombre'], ''])
    mapa.setFilter('carretera-elegida', filtroCarretera(''))
    mapa.setFilter('salida-elegida', ['==', ['get', 'id'], ''])
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

  function elegirCalle(c, centrar = false, punto = null) {
    quitarSeleccionZona()
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
      c.dudas &&
        crear(
          'div',
          { class: 'aviso-dudas' },
          crear('strong', {}, 'Sentido por revisar (marcado con «?» en el mapa)'),
          c.dudas.map((d) =>
            crear(
              'p',
              {},
              `${d.tramos} tramo${d.tramos > 1 ? 's' : ''}: el callejero oficial dice ${PALABRAS_SENTIDO[d.oficial]} y OpenStreetMap, ${PALABRAS_SENTIDO[d.osm]}.`,
            ),
          ),
        ),
      botonNota(() => punto ?? limitesCalle.get(c.id).getCenter().toArray(), { calle: c }),
    ])
    if (centrar) mapa.fitBounds(limitesCalle.get(c.id), { padding: margen(), maxZoom: 17, duration: 700, bearing: mapa.getBearing() })
  }

  // Vía sin nombre en el callejero oficial a la que OpenStreetMap sí pone nombre
  function elegirViaSinNombre(tramo, punto) {
    quitarSeleccionZona()
    mapa.setFilter('seleccion', ['==', ['get', 'id'], tramo.properties.id])
    mapa.setFilter('lugar-elegido', ['==', ['get', 'id'], ''])
    mostrarFicha([
      crear('p', { class: 'ficha-tipo' }, 'Nombre según OpenStreetMap'),
      crear('h2', {}, tramo.properties.nombreOsm),
      crear('p', { class: 'ficha-nota' }, 'En el callejero oficial esta vía aparece sin nombre.'),
      botonNota(() => punto, { tramo: tramo.properties.id }),
    ])
  }

  // Botón para dejar una nota sobre lo que se está viendo en la ficha
  const botonNota = (punto, sobre) =>
    crear('button', { class: 'chip chip-nota', onclick: () => formularioNota(punto(), sobre) }, '✎ Dejar una nota')

  // Formulario de nota nueva (pulsación larga, clic derecho o botón de la ficha)
  function formularioNota(punto, sobre = {}) {
    const tipo = crear('select', {}, TIPOS.map((t) => crear('option', { value: t }, t)))
    const comentario = crear('textarea', { rows: 3, placeholder: 'Qué está mal y cómo debería ser (opcional)' })
    // La primera vez se pide el nombre, para que al compartir las notas se sepa de quién son
    const nombre = !leerAutor() && crear('input', { type: 'text', placeholder: 'Por ejemplo: Miguel', maxlength: 40 })
    const titulo = sobre.calle?.nombre ?? sobre.lugar?.nombre ?? sobre.titulo ?? 'Punto del mapa'
    mostrarFicha([
      crear('p', { class: 'ficha-tipo' }, 'Nueva nota'),
      crear('h2', {}, titulo),
      crear('label', { class: 'campo' }, 'Qué pasa', tipo),
      crear('label', { class: 'campo' }, 'Comentario', comentario),
      nombre && crear('label', { class: 'campo' }, 'Tu nombre (solo la primera vez)', nombre),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear(
          'button',
          {
            class: 'boton',
            onclick: () => {
              // "nombre" solo existe la primera vez (cuando aún no hay autor guardado)
              if (nombre && nombre.value.trim()) guardarAutor(nombre.value)
              const nota = anadirNota({
                tipo: tipo.value,
                comentario: comentario.value,
                punto,
                calle: sobre.calle ? { id: sobre.calle.id, nombre: sobre.calle.nombre } : null,
                lugar: sobre.lugar ? { id: sobre.lugar.id, nombre: sobre.lugar.nombre } : null,
                tramo: sobre.tramo ?? null,
              })
              verNota(nota, true)
            },
          },
          'Guardar nota',
        ),
        crear('button', { class: 'boton secundario', onclick: () => cerrarFicha() }, 'Cancelar'),
      ),
      crear('p', { class: 'ficha-nota' }, 'Se guarda en este dispositivo. Para compartirla: Inicio → Notas.'),
    ])
  }

  function verNota(nota, recienGuardada = false) {
    quitarSeleccionZona()
    mapa.setFilter('seleccion', nota.calle ? ['==', ['get', 'via'], nota.calle.id] : NADA)
    mostrarFicha([
      crear('p', { class: 'ficha-tipo' }, recienGuardada ? 'Nota guardada' : `Nota · ${describirFecha(nota.fecha)}`),
      crear('h2', {}, nota.tipo),
      crear('p', {}, nota.comentario?.trim() || 'Sin comentario'),
      crear(
        'dl',
        { class: 'ficha-datos' },
        nota.calle && dato('Calle', nota.calle.nombre),
        nota.lugar && dato('Lugar', nota.lugar.nombre),
        nota.importada
          ? dato('De', nota.autor)
          : dato('Estado', nota.compartida ? `Compartida el ${describirFecha(nota.compartida)}` : 'Sin compartir'),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('a', { class: 'boton secundario', href: '#/inicio' }, 'Ir a Notas'),
        crear(
          'button',
          {
            class: 'boton secundario',
            onclick: () => {
              borrarNota(nota.id)
              cerrarFicha()
            },
          },
          'Borrar',
        ),
      ),
    ])
  }

  function elegirLugar(l, centrar = false) {
    const calle = callePorId.get(l.via)
    quitarSeleccionZona()
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
      crear(
        'div',
        { class: 'chips' },
        calle && crear('button', { class: 'chip', onclick: () => elegirCalle(calle, true) }, `Ver ${calle.nombre}`),
        botonNota(() => l.punto, { lugar: l, calle }),
      ),
    ])
    if (centrar) mapa.easeTo({ center: l.punto, zoom: Math.max(mapa.getZoom(), 16.5), padding: margen(), duration: 700 })
  }

  // Zona de los parques de Granada (paso 2.5): fichas de pueblo, salida y carretera, enlazadas entre sí
  const chipPueblo = (nombre) =>
    municipioPorNombre.has(nombre)
      ? crear('button', { class: 'chip', onclick: () => elegirMunicipio(municipioPorNombre.get(nombre), true) }, nombre)
      : crear('span', { class: 'chip chip-mudo' }, nombre)
  const chipCarretera = (codigo) =>
    lineasCarretera.has(codigo)
      ? crear(
          'button',
          { class: 'chip chip-carretera', style: `border-color: ${redDe(codigo).color}`, onclick: () => elegirCarretera(codigo, true) },
          codigo,
        )
      : crear('span', { class: 'chip chip-mudo' }, codigo)
  const chipSalida = (s, texto) => crear('button', { class: 'chip chip-salida', onclick: () => elegirSalida(s, true) }, texto)
  const salidaDe = (carretera, numero) => salidas.find((s) => s.carretera === carretera && s.numero === numero)
  const chipsDe = (lista, chip) => crear('div', { class: 'chips' }, lista.map(chip))

  // "GR-30 hacia Motril, salida 15 → N-323A", con cada carretera y cada salida tocables
  const pasosAcceso = (pasos) =>
    crear(
      'ol',
      { class: 'pasos-acceso' },
      pasos.map((p) => {
        const salida = p.salida && salidaDe(p.carretera, p.salida)
        return crear(
          'li',
          {},
          chipCarretera(p.carretera),
          p.hacia && crear('span', {}, `hacia ${p.hacia}`),
          p.salida && (salida ? chipSalida(salida, `salida ${p.salida}`) : crear('span', {}, `salida ${p.salida}`)),
        )
      }),
    )

  function elegirMunicipio(f, centrar = false) {
    const m = f.properties
    mapa.setFilter('seleccion', NADA)
    mapa.setFilter('lugar-elegido', ['==', ['get', 'id'], ''])
    quitarSeleccionZona()
    mapa.setFilter('municipio-elegido', ['==', ['get', 'nombre'], m.nombre])
    const suyas = salidas.filter((s) => s.municipio === m.nombre)
    mostrarFicha([
      crear('p', { class: 'ficha-tipo' }, m.parte === 'Capital' ? 'Capital' : `Pueblo de la zona · ${m.parte}`),
      crear('h2', {}, m.nombre),
      m.pueblo && crear('p', { class: 'ficha-nota' }, `El pueblo principal es ${m.pueblo}.`),
      m.acceso && [
        crear('h3', {}, 'Cómo se llega desde Granada'),
        m.acceso.pasos.length ? pasosAcceso(m.acceso.pasos) : crear('p', {}, 'Está pegado a Granada: se llega por calles.'),
        crear(
          'p',
          { class: 'ficha-nota' },
          `Unos ${m.acceso.minutos} minutos desde el centro. Es el camino más rápido según los datos de OpenStreetMap; puede haber otros.`,
        ),
      ],
      crear('h3', {}, 'Limita con'),
      chipsDe(m.vecinos, chipPueblo),
      m.carreteras.length > 0 && [crear('h3', {}, 'Carreteras que pasan'), chipsDe(m.carreteras, chipCarretera)],
      suyas.length > 0 && [
        crear('h3', {}, 'Salidas de autovía en su término'),
        chipsDe(suyas, (s) => chipSalida(s, `${s.carretera} ${s.numero ?? 'sin número'}`)),
      ],
      botonNota(() => m.centro, { titulo: m.nombre }),
    ])
    if (centrar) mapa.fitBounds(limitesMunicipio.get(m.nombre), { padding: margen(), maxZoom: 14, duration: 700, bearing: mapa.getBearing() })
  }

  function elegirSalida(s, centrar = false) {
    mapa.setFilter('seleccion', NADA)
    mapa.setFilter('lugar-elegido', ['==', ['get', 'id'], ''])
    quitarSeleccionZona()
    mapa.setFilter('salida-elegida', ['==', ['get', 'id'], s.id])
    // Si los carteles dicen lo mismo en los dos sentidos, se ponen una sola vez
    const carteles = []
    for (const x of s.sentidos) {
      const igual = carteles.find((c) => c.destinos.join() === x.destinos.join())
      if (igual) igual.hacia = null
      else carteles.push({ ...x })
    }
    const porAqui = usanAcceso((p) => p.carretera === s.carretera && p.salida === s.numero)
    mostrarFicha([
      crear('p', { class: 'ficha-tipo' }, `Salida de autovía · ${s.carretera}`),
      crear('h2', {}, s.numero ? `Salida ${s.numero}` : 'Salida sin número'),
      crear(
        'dl',
        { class: 'ficha-datos' },
        dato('Autovía', chipCarretera(s.carretera)),
        dato('Municipio', chipPueblo(s.municipio)),
        carteles.map((c) => dato(c.hacia ? `Carteles yendo hacia ${c.hacia}` : 'Carteles', c.destinos.join(', '))),
        s.carreterasDestino.length > 0 && dato('Lleva a', chipsDe(s.carreterasDestino, chipCarretera)),
      ),
      !s.destinos.length && crear('p', { class: 'ficha-nota' }, 'OpenStreetMap no trae los carteles de esta salida.'),
      porAqui.length > 0 && [crear('h3', {}, 'Desde Granada se sale por aquí para ir a'), chipsDe(porAqui, chipPueblo)],
      botonNota(() => s.punto, { titulo: `${s.carretera}, salida ${s.numero ?? 'sin número'}` }),
    ])
    if (centrar) mapa.easeTo({ center: s.punto, zoom: Math.max(mapa.getZoom(), 14), padding: margen(), duration: 700 })
  }

  function elegirCarretera(codigo, centrar = false) {
    mapa.setFilter('seleccion', NADA)
    mapa.setFilter('lugar-elegido', ['==', ['get', 'id'], ''])
    quitarSeleccionZona()
    mapa.setFilter('carretera-elegida', filtroCarretera(codigo))
    const nombres = [...new Set(nombresCarretera.get(codigo))].filter((n) => !/^(Calle|Avenida|Plaza|Camino) /.test(n))
    // Los pueblos por los que pasa, en el orden de la carretera: de norte a sur o de oeste a este
    const limites = limitesDe(lineasCarretera.get(codigo))
    const deNorteASur = limites.getNorth() - limites.getSouth() > (limites.getEast() - limites.getWest()) * 0.8
    const pasaPor = municipios.features
      .filter((f) => f.properties.carreteras.includes(codigo))
      .sort((a, b) => (deNorteASur ? b.properties.centro[1] - a.properties.centro[1] : a.properties.centro[0] - b.properties.centro[0]))
      .map((f) => f.properties.nombre)
    const suyas = salidas.filter((s) => s.carretera === codigo)
    const paraIr = usanAcceso((p) => p.carretera === codigo)
    mostrarFicha([
      crear('p', { class: 'ficha-tipo' }, redDe(codigo).nombre),
      crear('h2', {}, codigo),
      nombres.length > 0 && crear('p', { class: 'ficha-nota' }, nombres.slice(0, 3).join(' · ')),
      pasaPor.length > 0 && [crear('h3', {}, `Pasa por (${pasaPor.length})`), chipsDe(pasaPor, chipPueblo)],
      suyas.length > 0 && [
        crear('h3', {}, `Salidas (${suyas.length})`),
        crear(
          'ul',
          { class: 'lista-salidas' },
          suyas.map((s) =>
            crear('li', {}, chipSalida(s, s.numero ?? 'sin número'), crear('span', {}, s.destinos.join(', ') || 'sin carteles')),
          ),
        ),
      ],
      paraIr.length > 0 && [crear('h3', {}, 'Desde Granada se coge para ir a'), chipsDe(paraIr, chipPueblo)],
      botonNota(() => lineasCarretera.get(codigo)[0][0], { titulo: codigo }),
    ])
    if (centrar) mapa.fitBounds(limites, { padding: margen(), maxZoom: 15, duration: 700, bearing: mapa.getBearing() })
  }

  // Qué hay bajo un punto de la pantalla: una nota, un lugar, una calle o una vía sin nombre oficial
  function queHayEn(pixel) {
    const caja = [
      [pixel.x - 8, pixel.y - 8],
      [pixel.x + 8, pixel.y + 8],
    ]
    const buscarEn = (capas) => mapa.queryRenderedFeatures(caja, { layers: capas.filter((c) => mapa.getLayer(c)) })
    const nota = buscarEn(['notas'])[0]
    const lugar = buscarEn(['lugares'])[0]
    const tramos = buscarEn(['calles', 'calles-peatonales'])
    const salida = buscarEn(['salidas'])[0]
    const carretera = buscarEn(['carreteras'])[0]
    // Un pueblo se abre tocando su término; Granada no, para que tocar la ciudad siga cerrando la ficha
    const municipio = buscarEn(['municipios-relleno']).find((f) => f.properties.nombre !== 'Granada')
    return {
      nota: nota && leerNotas().find((n) => n.id === nota.properties.id),
      lugar: lugar && lugarPorId.get(lugar.properties.id),
      calle: callePorId.get(tramos.find((f) => callePorId.has(f.properties.via))?.properties.via),
      sinNombre: tramos.find((f) => f.properties.nombreOsm),
      salida: salida && salidaPorId.get(salida.properties.id),
      carretera: carretera?.properties.codigo.split(' / ')[0],
      municipio: municipio && municipioPorNombre.get(municipio.properties.nombre),
    }
  }

  let ignorarClic = false
  mapa.on('click', (e) => {
    resultados.hidden = true
    if (ignorarClic) return
    const aqui = queHayEn(e.point)
    const punto = e.lngLat.toArray()
    if (aqui.nota) return verNota(aqui.nota)
    if (aqui.lugar) return elegirLugar(aqui.lugar)
    if (aqui.salida) return elegirSalida(aqui.salida)
    if (aqui.calle) return elegirCalle(aqui.calle, false, punto)
    if (aqui.sinNombre) return elegirViaSinNombre(aqui.sinNombre, punto)
    if (aqui.carretera) return elegirCarretera(aqui.carretera)
    if (aqui.municipio) return elegirMunicipio(aqui.municipio)
    cerrarFicha()
  })

  // Nota nueva con clic derecho (ordenador) o manteniendo pulsado (móvil y tablet)
  function notaEn(e) {
    const aqui = queHayEn(e.point)
    formularioNota(e.lngLat.toArray(), {
      calle: aqui.calle,
      lugar: aqui.lugar,
      tramo: aqui.sinNombre?.properties.id,
    })
  }
  mapa.on('contextmenu', (e) => {
    e.preventDefault()
    e.originalEvent.preventDefault() // que no salga el menú del navegador
    notaEn(e)
  })
  let pulsacion = null
  const cancelarPulsacion = () => {
    clearTimeout(pulsacion?.temporizador)
    pulsacion = null
  }
  mapa.on('touchstart', (e) => {
    cancelarPulsacion()
    if (e.points.length !== 1) return
    pulsacion = {
      inicio: e.point,
      temporizador: setTimeout(() => {
        pulsacion = null
        ignorarClic = true
        setTimeout(() => (ignorarClic = false), 800)
        navigator.vibrate?.(30)
        notaEn(e)
      }, 600),
    }
  })
  mapa.on('touchmove', (e) => {
    if (pulsacion && Math.hypot(e.point.x - pulsacion.inicio.x, e.point.y - pulsacion.inicio.y) > 10) cancelarPulsacion()
  })
  mapa.on('touchend', cancelarPulsacion)
  mapa.on('touchcancel', cancelarPulsacion)
  mapa.on('movestart', (e) => e.originalEvent && cancelarPulsacion())
  alCambiarNotas((notas) => mapa.getSource('notas')?.setData(puntosDeNotas(notas)))

  for (const capa of ['notas', 'lugares', 'calles', 'calles-peatonales', 'salidas', 'carreteras']) {
    mapa.on('mouseenter', capa, () => (mapa.getCanvas().style.cursor = 'pointer'))
    mapa.on('mouseleave', capa, () => (mapa.getCanvas().style.cursor = ''))
  }

  // Buscador de calles, lugares, pueblos de la zona y carreteras
  const indice = [
    ...calles.map((c) => ({
      tipo: 'calle',
      dato: c,
      nombre: c.nombre,
      texto: normalizar(`${c.nombre} ${c.nombreOficial ?? ''}`),
      detalle: [c.tipo, c.distritos[0]].filter(Boolean).join(' · '),
    })),
    ...lugares.map((l) => ({ tipo: 'lugar', dato: l, nombre: l.nombre, texto: normalizar(l.nombre), detalle: `${l.categoria} · ${l.distrito}` })),
    ...municipios.features.map((f) => ({
      tipo: 'pueblo',
      dato: f,
      nombre: f.properties.nombre,
      texto: normalizar(`${f.properties.nombre} ${f.properties.pueblo ?? ''}`),
      detalle: ['Pueblo de la zona', f.properties.parte, f.properties.pueblo].filter(Boolean).join(' · '),
    })),
    ...[...lineasCarretera.keys()].map((c) => ({
      tipo: 'carretera',
      dato: c,
      nombre: c,
      texto: normalizar(`${c} ${[...new Set(nombresCarretera.get(c))].join(' ')}`),
      detalle: redDe(c).nombre,
    })),
  ]
  // Primero lo que empieza por lo buscado (sin contar "Calle", "Plaza"...): los pueblos y carreteras, las
  // calles y después los lugares; y entre ellos, lo más corto
  const PESO_TIPO = { pueblo: -50, carretera: -50, calle: 0, lugar: 200 }
  function buscar(consulta) {
    const q = normalizar(consulta)
    if (q.length < 2) return []
    const palabras = q.split(' ')
    const puntos = (x) => {
      const nombre = normalizar(x.nombre)
      const empieza = nombre.startsWith(q) || nombre.split(' ').slice(1).join(' ').startsWith(q)
      return (empieza ? 0 : 1000) + PESO_TIPO[x.tipo] + nombre.length
    }
    return indice
      .filter((x) => palabras.every((p) => x.texto.includes(p)))
      .sort((a, b) => puntos(a) - puntos(b))
      .slice(0, 8)
  }
  function irA(x) {
    resultados.hidden = true
    buscador.value = x.nombre
    buscador.blur()
    if (x.tipo === 'calle') elegirCalle(x.dato, true)
    else if (x.tipo === 'lugar') elegirLugar(x.dato, true)
    else if (x.tipo === 'pueblo') elegirMunicipio(x.dato, true)
    else elegirCarretera(x.dato, true)
  }
  buscador.addEventListener('input', () => {
    const lista = buscar(buscador.value)
    resultados.replaceChildren(
      ...(lista.length
        ? lista.map((x) =>
            crear('li', {}, crear('button', { onclick: () => irA(x) }, crear('strong', {}, x.nombre), crear('span', {}, x.detalle))),
          )
        : [crear('li', { class: 'sin-resultados' }, 'No hay nada con ese nombre')]),
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
  const ajustes = {
    zonas: true,
    fondo: true,
    sentidos: true,
    dudosos: true,
    nombresCalles: true,
    nombresLugares: true,
    notas: true,
    zonaParques: true,
    nombresZona: true,
    grupos: GRUPOS.map((g) => g.nombre),
    ...leerAjustes(),
  }
  // Zona de los parques: lo que se ve con la casilla, y los nombres (que se pueden quitar aparte)
  const CAPAS_ZONA = ['municipios-relleno', 'municipios-borde', 'carreteras-borde', 'carreteras', 'pueblos', 'salidas']
  const NOMBRES_ZONA = ['carreteras-codigos', 'pueblos-nombres', 'granada-nombre', 'salidas-numeros']
  const CAPAS = {
    zonas: ['barrios-relleno', 'barrios-borde', 'distritos-borde', 'barrios-nombres', 'distritos-nombres'],
    fondo: ['fondo-manchas', 'fondo-rios', 'fondo-tren', 'fondo-tren-traviesas'],
    sentidos: ['flechas'],
    dudosos: ['dudosos', 'dudosos-linea'],
    nombresCalles: ['nombres-principales', 'nombres-resto'],
    nombresLugares: ['lugares-nombres', 'rios-nombres'],
    notas: ['notas'],
  }
  function aplicarAjustes() {
    guardarAjustes(ajustes)
    for (const [ajuste, capas] of Object.entries(CAPAS)) {
      for (const capa of capas) mapa.setLayoutProperty(capa, 'visibility', ajustes[ajuste] ? 'visible' : 'none')
    }
    for (const capa of CAPAS_ZONA) mapa.setLayoutProperty(capa, 'visibility', ajustes.zonaParques ? 'visible' : 'none')
    for (const capa of NOMBRES_ZONA) {
      mapa.setLayoutProperty(capa, 'visibility', ajustes.zonaParques && ajustes.nombresZona ? 'visible' : 'none')
    }
    const filtro = ['in', ['get', 'grupo'], ['literal', ajustes.grupos]]
    mapa.setFilter('lugares', filtro)
    mapa.setFilter('lugares-nombres', filtro)
  }
  const casillaDe = (ajuste, texto) =>
    casilla(
      texto,
      ajustes[ajuste],
      (si) => {
        ajustes[ajuste] = si
        aplicarAjustes()
      },
      null,
      ajuste,
    )
  const casilla = (texto, marcada, alCambiar, color, ajuste) =>
    crear(
      'label',
      { class: 'casilla' },
      crear('input', { type: 'checkbox', checked: marcada, 'data-ajuste': ajuste, onchange: (e) => alCambiar(e.target.checked) }),
      color && crear('span', { class: 'punto', style: `background: ${color}` }),
      texto,
    )
  panelCapas.append(
    crear('h3', {}, 'Qué ver en el mapa'),
    casillaDe('nombresCalles', 'Nombres de las calles'),
    casillaDe('nombresLugares', 'Nombres de los lugares y ríos'),
    crear('p', { class: 'ayuda-capas' }, 'Quita los nombres para estudiar con un mapa mudo.'),
    casillaDe('zonas', 'Distritos y barrios'),
    casillaDe('fondo', 'Ríos, parques y vías del tren'),
    casillaDe('sentidos', 'Flechas de sentido'),
    casillaDe('dudosos', 'Sentidos por revisar (?)'),
    casillaDe('notas', 'Notas (mías en rojo, de compañeros en azul)'),
    crear(
      'p',
      { class: 'ayuda-capas ayuda-giro' },
      'El mapa se gira con dos dedos (en el ordenador, arrastrando con el botón derecho) y se queda como lo dejes, también en los juegos. La brújula de abajo vuelve a poner el norte arriba.',
    ),
    crear('h3', {}, 'Zona de los parques de Granada'),
    casillaDe('zonaParques', 'Pueblos, carreteras y salidas'),
    casillaDe('nombresZona', 'Nombres de pueblos, códigos y números de salida'),
    crear(
      'div',
      { class: 'leyenda' },
      REDES.map((r) => crear('span', {}, crear('span', { class: 'punto', style: `background: ${r.color}` }), r.nombre)),
      crear('span', {}, crear('span', { class: 'punto', style: 'background: #263238' }), 'Salida de autovía'),
    ),
    crear(
      'button',
      {
        class: 'boton secundario boton-zona',
        onclick: () => {
          ajustes.zonaParques = true
          aplicarAjustes()
          panelCapas.querySelector('input[data-ajuste="zonaParques"]').checked = true
          const zona = new LngLatBounds()
          for (const l of limitesMunicipio.values()) zona.extend(l)
          cerrarFicha()
          mapa.fitBounds(zona, { padding: margen(), duration: 900, bearing: mapa.getBearing() })
        },
      },
      'Ver toda la zona',
    ),
    crear('h3', {}, 'Lugares de interés'),
    ...GRUPOS.map((g) =>
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
    // #/mapa?calle=123 abre la ficha de esa calle; #/mapa?lugar=n456, la de ese lugar; #/mapa?nota=abc, esa nota;
    // #/mapa?pueblo=Padul, #/mapa?carretera=A-44 y #/mapa?salida=A-44|144, los de la zona de los parques
    async mostrar(parametros) {
      mapa.resize()
      await cargado
      const calle = callePorId.get(Number(parametros?.get('calle')))
      const lugar = lugarPorId.get(parametros?.get('lugar'))
      const nota = leerNotas().find((n) => n.id === parametros?.get('nota') && n.punto)
      const pueblo = municipioPorNombre.get(parametros?.get('pueblo'))
      const carretera = lineasCarretera.has(parametros?.get('carretera')) && parametros.get('carretera')
      const salida = salidaPorId.get(parametros?.get('salida'))
      if (pueblo || carretera || salida) {
        ajustes.zonaParques = true
        aplicarAjustes()
        panelCapas.querySelector('input[data-ajuste="zonaParques"]').checked = true
      }
      if (calle) elegirCalle(calle, true)
      else if (lugar) elegirLugar(lugar, true)
      else if (pueblo) elegirMunicipio(pueblo, true)
      else if (carretera) elegirCarretera(carretera, true)
      else if (salida) elegirSalida(salida, true)
      else if (nota) {
        verNota(nota)
        mapa.easeTo({ center: nota.punto, zoom: Math.max(mapa.getZoom(), 17), padding: margen(), duration: 700 })
      }
    },
  }
}
