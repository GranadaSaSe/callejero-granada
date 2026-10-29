// "Zona de los parques" (paso 2.5): pueblos, salidas de autovía y carreteras de la zona de los parques de
// Granada en el mapa sin nombres. Seis tipos de pregunta (o todos mezclados): dónde está un pueblo (se toca),
// qué pueblo es, a dónde lleva una salida, qué salida coger, cómo se llega a un pueblo y qué carretera es (se
// elige entre cuatro). Las preguntas salen de src/zona-preguntas.js.
import { textoAcceso } from '../../scripts/lib/zona-datos.mjs'
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { elegir, PREGUNTAS_POR_PARTIDA } from '../donde-datos.js'
import { MODOS_ZONA, municipioEn, PARTES_ZONA, preguntasZona, prepararPregunta, textoSalida } from '../zona-preguntas.js'
import { apuntarSitio, botonNota, cifra, coleccion, guardarEstado, leerEstado, linea, paraRepasar, punto, ROJO, VERDE } from './comun.js'

const CLAVE = 'callejero-zona'
const AZUL = '#1565c0'
const LETRAS = ['a', 'b', 'c', 'd']
const TIPO = {
  donde: 'Pueblos de la zona',
  pueblo: 'Pueblos de la zona',
  acceso: 'Cómo se llega · la última carretera del camino',
  salida: 'Salidas de autovía',
  coger: 'Salidas de autovía',
  carretera: 'Carreteras',
}
// items: { id: { bien, total, fallo } } (fallo = si la última vez se falló); récord por tipo de pregunta y parte
const estado = leerEstado(CLAVE, { ajustes: { modo: 'mezcla', parte: 'Toda la zona' }, records: {}, items: {}, partidas: 0 })
const modalidad = () => `${estado.ajustes.modo}|${estado.ajustes.parte}`
const guardar = () => guardarEstado(CLAVE, estado)

export const juegoZona = {
  tarjeta(ctx) {
    const lista = preguntasZona(ctx.datos, estado.ajustes)
    const acertadas = lista.filter((p) => estado.items[p.id]?.bien > 0).length
    const record = estado.records[modalidad()]
    const cambiar = (cambio) => {
      Object.assign(estado.ajustes, cambio)
      guardar()
      ctx.portada()
    }
    return crear(
      'section',
      { class: 'tarjeta modo-test' },
      crear('h2', {}, 'Zona de los parques'),
      crear(
        'p',
        {},
        'Los pueblos de la zona de los parques de Granada, sus salidas de autovía y sus carreteras: dónde está cada pueblo, qué salida coger y cómo se llega desde Granada. ' +
          `Son ${PREGUNTAS_POR_PARTIDA} preguntas por partida.`,
      ),
      crear(
        'div',
        { class: 'ajustes-test' },
        crear(
          'select',
          { 'aria-label': 'Qué preguntar', onchange: (e) => cambiar({ modo: e.target.value }) },
          MODOS_ZONA.map((m) => crear('option', { value: m.id, selected: m.id === estado.ajustes.modo }, m.nombre)),
        ),
        crear(
          'select',
          { 'aria-label': 'Parte de la zona', onchange: (e) => cambiar({ parte: e.target.value }) },
          PARTES_ZONA.map((p) => crear('option', { value: p, selected: p === estado.ajustes.parte }, p)),
        ),
      ),
      crear(
        'div',
        { class: 'cifras' },
        cifra(record === undefined ? '—' : `${record}/${PREGUNTAS_POR_PARTIDA}`, 'tu récord'),
        cifra(`${miles(acertadas)}/${miles(lista.length)}`, 'acertadas'),
        cifra(miles(estado.partidas), 'partidas'),
      ),
      lista.length > 0
        ? crear('button', { class: 'boton grande', onclick: () => partida(ctx, lista) }, 'Jugar')
        : crear('p', { class: 'hecho' }, 'No hay nada que preguntar con estos ajustes.'),
      crear(
        'p',
        { class: 'ficha-nota' },
        'Los caminos desde Granada son los más rápidos según OpenStreetMap: puede haber otros. En el Mapa, Capas → Zona de los parques, está todo con nombres.',
      ),
    )
  },
}

async function partida(ctx, lista) {
  const { arriba, abajo } = ctx
  const { municipios, carreteras, salidas } = ctx.datos
  const porNombre = new Map(municipios.features.map((f) => [f.properties.nombre, f]))
  const preguntas = elegir(lista, PREGUNTAS_POR_PARTIDA, (p) => estado.items[p.id]?.fallo)
  const resultados = []
  let p = null // la pregunta (de zona-preguntas.js)
  let q = null // la pregunta preparada: enunciado, opciones...
  let tocado = null // en "¿dónde está?": { punto, municipio }
  let respondida = false
  const titulo = crear('h2')

  // Teclado: 1-4 para elegir, e Intro para comprobar lo tocado o pasar a la siguiente
  await ctx.abrirMapa({
    tocar(lngLat) {
      if (respondida || q.contestar !== 'tocar') return
      tocado = { punto: lngLat, municipio: municipioEn(municipios, lngLat) }
      dibujar([...(tocado.municipio ? figurasMunicipio(tocado.municipio, AZUL) : []), punto(lngLat, { color: AZUL, nombre: '', radio: 6 })])
      pintarAbajoTocar()
    },
    tecla(e) {
      if (!respondida && q.contestar === 'elegir' && /^[1-4]$/.test(e.key) && q.opciones[Number(e.key) - 1]) responder(q.opciones[Number(e.key) - 1])
      else if (e.key === 'Enter' && (respondida || tocado)) {
        e.preventDefault()
        if (respondida) siguiente()
        else responder(null)
      }
    },
  })

  // Figuras del mapa: un término municipal (relleno y borde), una carretera (sus líneas) o una salida (un punto)
  const figurasMunicipio = (f, color, nombre = '') => [
    ...f.geometry.coordinates.map((poligono) => ({ type: 'Feature', properties: { color }, geometry: { type: 'Polygon', coordinates: poligono } })),
    ...f.geometry.coordinates.map((poligono) => linea(poligono[0], { color, nombre: '' })),
    ...(nombre ? [punto(f.properties.centro, { color, nombre, radio: 4 })] : []),
  ]
  const lineasCarretera = (codigo) => carreteras.features.filter((f) => f.properties.codigo.split(' / ').includes(codigo))
  const figurasCarretera = (codigo, color, nombre = '') => lineasCarretera(codigo).map((f) => linea(f.geometry.coordinates, { color, nombre }))
  const figurasSalida = (s, color, nombre = '') => [punto(s.punto, { color, nombre })]
  const puntosMunicipio = (f) => f.geometry.coordinates.flatMap((poligono) => poligono[0])
  const puntosCarretera = (codigo) => lineasCarretera(codigo).flatMap((f) => f.geometry.coordinates)
  const dibujar = (figuras) => ctx.ponerDatos('juego-respuesta', coleccion(figuras))
  // De qué salida o carretera habla una opción: "Salida 249" (de la misma autovía), "GR-30, salida 18" o "GR-3200"
  const salidaDeTexto = (carretera, texto) => salidas.find((s) => s.carretera === carretera && `Salida ${s.numero}` === texto)
  const codigoDeTexto = (texto) => texto.split(',')[0]

  const aciertos = () => resultados.filter((r) => r.acierto).length
  const marcador = crear('span')
  const pintarMarcador = (numero) => (marcador.textContent = `${numero} de ${preguntas.length} · ${aciertos()} bien`)
  const siguiente = () => (resultados.length === preguntas.length ? final() : pregunta())

  function pintarAbajoTocar() {
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        crear(
          'p',
          { class: 'ficha-nota' },
          tocado ? (tocado.municipio ? 'Has marcado un término. Si es ese, pulsa Comprobar.' : 'Eso queda fuera de la zona.') : 'Toca el pueblo en el mapa.',
        ),
      ),
      crear('div', { class: 'acciones-eje' }, crear('button', { class: 'boton', disabled: !tocado?.municipio, onclick: () => responder(null) }, 'Comprobar')),
    )
  }

  // Lo que se marca antes de contestar y dónde se encuadra el mapa
  function plantear() {
    if (p.tipo === 'donde') {
      const parte = estado.ajustes.parte
      const dePartes = municipios.features.filter((f) => parte === 'Toda la zona' || f.properties.parte === parte)
      dibujar([])
      ctx.encuadrar((dePartes.length ? dePartes : municipios.features).flatMap(puntosMunicipio), { maxZoom: 12 })
    } else if (p.tipo === 'pueblo' || p.tipo === 'acceso') {
      dibujar(figurasMunicipio(p.municipio, AZUL))
      const alrededor = p.tipo === 'acceso' ? [porNombre.get('Granada')] : p.municipio.properties.vecinos.map((n) => porNombre.get(n))
      ctx.encuadrar([p.municipio, ...alrededor].filter(Boolean).flatMap(puntosMunicipio), { maxZoom: 13 })
    } else if (p.tipo === 'salida') {
      dibujar(figurasSalida(p.salida, AZUL))
      ctx.encuadrar([p.salida.punto], { maxZoom: 12 })
    } else if (p.tipo === 'coger') {
      dibujar(figurasCarretera(p.salida.carretera, AZUL))
      ctx.encuadrar(salidas.filter((s) => s.carretera === p.salida.carretera).map((s) => s.punto), { maxZoom: 12 })
    } else {
      dibujar(figurasCarretera(p.codigo, AZUL))
      ctx.encuadrar(puntosCarretera(p.codigo), { maxZoom: 13 })
    }
  }

  function pregunta() {
    p = preguntas[resultados.length]
    q = prepararPregunta(p, ctx.datos)
    respondida = false
    tocado = null
    ctx.limpiar()
    pintarMarcador(resultados.length + 1)
    titulo.textContent = q.enunciado
    rellenar(
      arriba,
      crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: ctx.portada }, '← Salir'), marcador),
      crear('p', { class: 'ficha-tipo' }, TIPO[p.tipo]),
      titulo,
    )
    if (q.contestar === 'tocar') pintarAbajoTocar()
    else {
      rellenar(
        abajo,
        crear(
          'div',
          { class: 'opciones-examen' },
          q.opciones.map((o, i) =>
            crear('button', { class: 'opcion-examen', onclick: () => responder(o) }, crear('span', { class: 'letra' }, LETRAS[i]), o.texto),
          ),
        ),
      )
    }
    plantear()
  }

  // La respuesta buena en verde con su nombre y, si se falló, lo elegido o tocado en rojo
  function ensenar(acierto, dicho) {
    const figuras = []
    const puntos = []
    const conMunicipio = (f, color) => {
      figuras.push(...figurasMunicipio(f, color, f.properties.nombre))
      puntos.push(...puntosMunicipio(f))
    }
    const conCarretera = (codigo, color) => {
      figuras.push(...figurasCarretera(codigo, color, codigo))
      puntos.push(...puntosCarretera(codigo))
    }
    const conSalida = (s, color) => {
      figuras.push(...figurasSalida(s, color, s.numero ? `Salida ${s.numero}` : 'Sin número'))
      puntos.push(s.punto)
    }
    if (p.tipo === 'donde' || p.tipo === 'pueblo') {
      const equivocado = p.tipo === 'donde' ? tocado?.municipio : porNombre.get(dicho)
      if (!acierto && equivocado) conMunicipio(equivocado, ROJO)
      conMunicipio(p.municipio, VERDE)
    } else if (p.tipo === 'acceso') {
      const ultimo = p.municipio.properties.acceso.pasos.at(-1)
      if (!acierto && dicho) conCarretera(codigoDeTexto(dicho), ROJO)
      conCarretera(ultimo.carretera, VERDE)
      const salida = ultimo.salida && salidas.find((s) => s.carretera === ultimo.carretera && s.numero === ultimo.salida)
      if (salida) conSalida(salida, VERDE)
      conMunicipio(p.municipio, VERDE)
    } else if (p.tipo === 'salida' || p.tipo === 'coger') {
      const equivocada =
        !acierto &&
        (p.tipo === 'coger'
          ? salidaDeTexto(p.salida.carretera, dicho)
          : salidas.find((s) => s.carretera === p.salida.carretera && s.numero && textoSalida(s) === dicho))
      if (equivocada) conSalida(equivocada, ROJO)
      conSalida(p.salida, VERDE)
    } else {
      if (!acierto && dicho) conCarretera(dicho, ROJO)
      conCarretera(p.codigo, VERDE)
    }
    dibujar(figuras)
    ctx.encuadrar(puntos, { maxZoom: 13, holgura: 30 })
  }

  // Lo que se cuenta debajo de la respuesta
  function explicacion() {
    if (p.tipo === 'donde' || p.tipo === 'pueblo') {
      const m = p.municipio.properties
      const donde = m.parte === 'Valle de Lecrín' ? 'Está en el Valle de Lecrín.' : `Está en la parte ${m.parte.toLowerCase()} de la zona.`
      return [donde, m.pueblo && `Su pueblo principal es ${m.pueblo}.`].filter(Boolean).join(' ')
    }
    if (p.tipo === 'acceso') return `Camino desde Granada: ${textoAcceso(p.municipio.properties.acceso)}.`
    if (p.tipo === 'salida' || p.tipo === 'coger') return `La salida ${p.salida.numero} de la ${p.salida.carretera} lleva a: ${p.salida.destinos.join(', ')}.`
    const pueblos = municipios.features.filter((f) => f.properties.carreteras.includes(p.codigo)).map((f) => f.properties.nombre)
    return `Pasa por ${pueblos.join(', ')}.`
  }

  // Ficha del Mapa de lo que se pregunta
  const enlace = (x = p) =>
    x.municipio
      ? `#/mapa?pueblo=${encodeURIComponent(x.municipio.properties.nombre)}`
      : x.salida
        ? `#/mapa?salida=${encodeURIComponent(x.salida.id)}`
        : `#/mapa?carretera=${encodeURIComponent(x.codigo)}`

  // "elegida" = la opción tocada (null en "¿dónde está?", que se contesta tocando el mapa)
  function responder(elegida) {
    if (respondida || (q.contestar === 'tocar' && !tocado?.municipio)) return
    respondida = true
    const dicho = elegida ? elegida.texto : (tocado?.municipio?.properties.nombre ?? null)
    const acierto = elegida ? elegida.buena : dicho === q.respuesta
    resultados.push({ p, q, acierto, dicho })
    pintarMarcador(resultados.length)
    apuntar([{ tema: 'carreteras', acierto }])
    apuntarSitio(estado.items, p.id, acierto, { fallo: !acierto })
    guardar()
    ensenar(acierto, dicho)

    const ultima = resultados.length === preguntas.length
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        botonNota(() => ({
          modo: 'Zona de los parques',
          pregunta: q.enunciado,
          respuesta: q.respuesta,
          elegida: dicho,
          opciones: q.opciones?.map((o) => o.texto) ?? null,
          id: p.id,
          enlace: enlace(),
        })),
        crear('p', { class: acierto ? 'acierto' : 'fallo' }, acierto ? '¡Bien!' : `No: ${q.respuesta}`),
        !acierto && dicho && crear('p', { class: 'ficha-nota' }, `${q.contestar === 'tocar' ? 'Tocaste' : 'Elegiste'} ${dicho} (en rojo en el mapa).`),
        crear('p', { class: 'ficha-nota' }, explicacion()),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: siguiente }, ultima ? 'Ver el resultado' : 'Siguiente'),
        crear('a', { class: 'boton secundario', href: enlace() }, 'Ver en el mapa'),
      ),
    )
  }

  function final() {
    const bien = aciertos()
    const anterior = estado.records[modalidad()] ?? 0
    estado.records[modalidad()] = Math.max(bien, anterior)
    estado.partidas++
    guardar()
    ctx.verPagina()
    const acertadas = lista.filter((x) => estado.items[x.id]?.bien > 0).length
    rellenar(
      ctx.pagina,
      crear('h1', {}, bien === resultados.length ? '¡Pleno!' : 'Resultado'),
      crear(
        'section',
        { class: 'tarjeta resumen-repaso' },
        crear(
          'div',
          { class: 'cifras' },
          cifra(`${bien}/${resultados.length}`, 'aciertos'),
          cifra(`${Math.max(bien, anterior)}/${resultados.length}`, 'tu récord'),
          cifra(`${miles(acertadas)}/${miles(lista.length)}`, 'acertadas'),
        ),
        crear('p', { class: 'ficha-nota' }, bien > anterior ? '¡Nuevo récord!' : `Tu récord: ${anterior} de ${resultados.length}`),
      ),
      paraRepasar(
        resultados
          .filter((r) => !r.acierto)
          .map((r) => ({
            nombre: r.q.enunciado,
            texto: [`Es ${r.q.respuesta}`, r.dicho && `${r.q.contestar === 'tocar' ? 'tocaste' : 'elegiste'} ${r.dicho}`].filter(Boolean).join(' · '),
            enlace: enlace(r.p),
          })),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: () => partida(ctx, preguntasZona(ctx.datos, estado.ajustes)) }, 'Jugar otra vez'),
        crear('button', { class: 'boton secundario', onclick: ctx.portada }, 'Volver'),
      ),
    )
  }

  pregunta()
}
