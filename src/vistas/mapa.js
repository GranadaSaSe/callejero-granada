// Mapa de estudio (paso 1.4): calles con su nombre y su sentido, distritos, barrios, lugares de interés y,
// de fondo (paso 2.1), ríos, parques y vías del tren.
// Se dibuja solo con los datos de la app, así que funciona sin internet. Al tocar una calle o un lugar se
// abre su ficha, y el buscador lleva a cualquier calle o lugar.
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
import { crearMapa, lineasParaNombres, NADA } from '../mapa-base.js'

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

  let calles, tramos, zonas, fondo, lugares
  try {
    ;[calles, tramos, zonas, fondo, lugares] = await Promise.all(['calles', 'tramos', 'zonas', 'fondo', 'lugares'].map(cargar))
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

  const mapa = crearMapa(lienzo, {
    tramos,
    zonas,
    fondo,
    lugares: puntosLugares,
    nombres: lineasParaNombres(tramos),
    notas: puntosDeNotas(leerNotas()),
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

  function elegirCalle(c, centrar = false, punto = null) {
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
    if (centrar) mapa.fitBounds(limitesCalle.get(c.id), { padding: margen(), maxZoom: 17, duration: 700 })
  }

  // Vía sin nombre en el callejero oficial a la que OpenStreetMap sí pone nombre
  function elegirViaSinNombre(tramo, punto) {
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
    const titulo = sobre.calle?.nombre ?? sobre.lugar?.nombre ?? 'Punto del mapa'
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
    return {
      nota: nota && leerNotas().find((n) => n.id === nota.properties.id),
      lugar: lugar && lugarPorId.get(lugar.properties.id),
      calle: callePorId.get(tramos.find((f) => callePorId.has(f.properties.via))?.properties.via),
      sinNombre: tramos.find((f) => f.properties.nombreOsm),
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
    if (aqui.calle) return elegirCalle(aqui.calle, false, punto)
    if (aqui.sinNombre) return elegirViaSinNombre(aqui.sinNombre, punto)
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

  for (const capa of ['notas', 'lugares', 'calles', 'calles-peatonales']) {
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
  const ajustes = {
    zonas: true,
    fondo: true,
    sentidos: true,
    dudosos: true,
    nombresCalles: true,
    nombresLugares: true,
    notas: true,
    grupos: GRUPOS.map((g) => g.nombre),
    ...leerAjustes(),
  }
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
    const filtro = ['in', ['get', 'grupo'], ['literal', ajustes.grupos]]
    mapa.setFilter('lugares', filtro)
    mapa.setFilter('lugares-nombres', filtro)
  }
  const casillaDe = (ajuste, texto) =>
    casilla(texto, ajustes[ajuste], (si) => {
      ajustes[ajuste] = si
      aplicarAjustes()
    })
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
    casillaDe('nombresCalles', 'Nombres de las calles'),
    casillaDe('nombresLugares', 'Nombres de los lugares y ríos'),
    crear('p', { class: 'ayuda-capas' }, 'Quita los nombres para estudiar con un mapa mudo.'),
    casillaDe('zonas', 'Distritos y barrios'),
    casillaDe('fondo', 'Ríos, parques y vías del tren'),
    casillaDe('sentidos', 'Flechas de sentido'),
    casillaDe('dudosos', 'Sentidos por revisar (?)'),
    casillaDe('notas', 'Notas (mías en rojo, de compañeros en azul)'),
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
    // #/mapa?calle=123 abre la ficha de esa calle; #/mapa?lugar=n456, la de ese lugar; #/mapa?nota=abc, esa nota
    async mostrar(parametros) {
      mapa.resize()
      await cargado
      const calle = callePorId.get(Number(parametros?.get('calle')))
      const lugar = lugarPorId.get(parametros?.get('lugar'))
      const nota = leerNotas().find((n) => n.id === parametros?.get('nota') && n.punto)
      if (calle) elegirCalle(calle, true)
      else if (lugar) elegirLugar(lugar, true)
      else if (nota) {
        verNota(nota)
        mapa.easeTo({ center: nota.punto, zoom: Math.max(mapa.getZoom(), 17), padding: margen(), duration: 700 })
      }
    },
  }
}
