// "¿Cómo se llama?" (paso 2.3, mapa mudo al revés): se marca una calle o un lugar en el mapa sin nombres y se
// dice cuál es, eligiendo entre cuatro (las otras tres son de alrededor) o escribiendo el nombre. Si se elige
// mal, el mapa enseña también dónde está lo elegido. Los cálculos están en src/nombre-datos.js.
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { candidatas, elegir, PREGUNTAS_POR_PARTIDA } from '../donde-datos.js'
import { comprobadorDeNombres, MODOS_NOMBRE, opcionesCercanas } from '../nombre-datos.js'
import {
  apuntarSitio,
  botonNota,
  cifra,
  coleccion,
  elegirTipoYZona,
  figurasDe,
  guardarEstado,
  leerEstado,
  paraRepasar,
  puntosDe,
  ROJO,
  VERDE,
} from './comun.js'

const CLAVE = 'callejero-nombre'
const AZUL = '#1565c0'
const LETRAS = ['a', 'b', 'c', 'd']
// items: { id: { bien, total, fallo } } (fallo = si la última vez se falló); récord por modo, tipo y zona
const estado = leerEstado(CLAVE, { ajustes: { tipo: 'principales', zona: 'Todos', modo: 'elegir' }, records: {}, items: {}, partidas: 0 })
const modalidad = () => `${estado.ajustes.modo}|${estado.ajustes.tipo}|${estado.ajustes.zona}`
const guardar = () => guardarEstado(CLAVE, estado)
let comprobar = null // se prepara la primera vez con todos los nombres de calles y lugares

export const juegoNombre = {
  tarjeta(ctx) {
    const lista = candidatas(ctx.datos, estado.ajustes)
    const acertadas = lista.filter((s) => estado.items[s.id]?.bien > 0).length
    const record = estado.records[modalidad()]
    const cambiar = (cambio) => {
      Object.assign(estado.ajustes, cambio)
      guardar()
      ctx.portada()
    }
    return crear(
      'section',
      { class: 'tarjeta modo-test' },
      crear('h2', {}, '¿Cómo se llama?'),
      crear(
        'p',
        {},
        'Se marca una calle o un lugar en el mapa sin nombres y tú dices cuál es: eligiendo entre cuatro de alrededor o escribiendo su nombre. ' +
          `Son ${PREGUNTAS_POR_PARTIDA} preguntas por partida.`,
      ),
      crear(
        'div',
        { class: 'ajustes-test' },
        elegirTipoYZona(estado.ajustes, cambiar),
        crear(
          'select',
          { 'aria-label': 'Cómo contestar', onchange: (e) => cambiar({ modo: e.target.value }) },
          MODOS_NOMBRE.map((m) => crear('option', { value: m.id, selected: m.id === estado.ajustes.modo }, m.nombre)),
        ),
      ),
      crear(
        'div',
        { class: 'cifras' },
        cifra(record === undefined ? '—' : `${record}/${PREGUNTAS_POR_PARTIDA}`, 'tu récord'),
        cifra(`${miles(acertadas)}/${miles(lista.length)}`, 'acertados'),
        cifra(miles(estado.partidas), 'partidas'),
      ),
      lista.length > 0
        ? crear('button', { class: 'boton grande', onclick: () => partida(ctx, lista) }, 'Jugar')
        : crear('p', { class: 'hecho' }, 'No hay nada que preguntar con estos ajustes.'),
      crear('p', { class: 'ficha-nota' }, 'Al escribir vale sin tildes, sin «Calle» o «Plaza» y con alguna letra mal; «Gran Vía» vale por «Gran Vía de Colón».'),
    )
  },
}

async function partida(ctx, lista) {
  const { arriba, abajo } = ctx
  const escribir = estado.ajustes.modo === 'escribir'
  comprobar ??= comprobadorDeNombres([...ctx.datos.calles.map((c) => c.nombre), ...ctx.datos.lugares.map((l) => l.nombre)])
  const preguntas = elegir(lista, PREGUNTAS_POR_PARTIDA, (s) => estado.items[s.id]?.fallo)
  const resultados = []
  let sitio = null
  let opciones = []
  let respondida = false
  const titulo = crear('h2') // la pregunta y, al contestar, el nombre

  // Teclado: 1-4 para elegir y Intro para pasar a la siguiente (al escribir, Intro comprueba lo escrito)
  await ctx.abrirMapa({
    tecla(e) {
      if (!respondida && !escribir && /^[1-4]$/.test(e.key)) responder(opciones[Number(e.key) - 1])
      else if (respondida && e.key === 'Enter') {
        e.preventDefault()
        siguiente()
      }
    },
  })

  const aciertos = () => resultados.filter((r) => r.acierto).length
  const marcador = crear('span')
  const pintarMarcador = (numero) => (marcador.textContent = `${numero} de ${preguntas.length} · ${aciertos()} bien`)
  const siguiente = () => (resultados.length === preguntas.length ? final() : pregunta())

  function pregunta() {
    sitio = preguntas[resultados.length]
    respondida = false
    ctx.limpiar()
    pintarMarcador(resultados.length + 1)
    const esCalle = sitio.clase === 'calle'
    titulo.textContent = esCalle ? '¿Qué calle es la marcada en azul?' : '¿Qué lugar es el punto azul?'
    rellenar(
      arriba,
      crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: ctx.portada }, '← Salir'), marcador),
      crear('p', { class: 'ficha-tipo' }, esCalle ? '¿Cómo se llama?' : `¿Cómo se llama? · ${sitio.categoria}`),
      titulo,
    )
    // Sin nombre en el mapa hasta contestar
    ctx.ponerDatos('juego-respuesta', coleccion(figurasDe(sitio, { nombre: '', color: AZUL })))
    if (escribir) {
      const campo = crear('input', {
        type: 'text',
        placeholder: esCalle ? 'Nombre de la calle' : 'Nombre del lugar',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': 'Nombre',
      })
      rellenar(
        abajo,
        crear(
          'form',
          {
            class: 'escribir-nombre',
            onsubmit: (e) => {
              e.preventDefault()
              if (campo.value.trim()) responder(null, campo.value.trim())
            },
          },
          campo,
          crear(
            'div',
            { class: 'acciones-eje' },
            crear('button', { class: 'boton', type: 'submit' }, 'Comprobar'),
            crear('button', { class: 'boton secundario', type: 'button', onclick: () => responder(null, '') }, 'No lo sé'),
          ),
        ),
      )
      // En el móvil, el teclado taparía el mapa nada más empezar: allí se toca el campo cuando se quiera
      if (matchMedia('(pointer: fine)').matches) campo.focus()
    } else {
      opciones = opcionesCercanas(sitio, lista)
      rellenar(
        abajo,
        crear(
          'div',
          { class: 'opciones-examen' },
          opciones.map((o, i) =>
            crear('button', { class: 'opcion-examen', onclick: () => responder(o) }, crear('span', { class: 'letra' }, LETRAS[i]), o.nombre),
          ),
        ),
      )
    }
    ctx.encuadrar(puntosDe(sitio), { maxZoom: 16 })
  }

  // "elegida" = la opción tocada; "escrito" = lo escrito ('' si no lo sabe)
  function responder(elegida, escrito = null) {
    if (respondida) return
    respondida = true
    const acierto = escrito === null ? elegida === sitio : comprobar(escrito, sitio.nombre)
    const dicho = escrito === null ? elegida.nombre : escrito
    resultados.push({ sitio, acierto, dicho })
    pintarMarcador(resultados.length)
    titulo.textContent = sitio.nombre
    apuntar([{ tema: sitio.clase === 'lugar' ? 'lugares' : 'zonas', acierto }])
    apuntarSitio(estado.items, sitio.id, acierto, { fallo: !acierto })
    guardar()

    // La buena en verde con su nombre y, si se eligió otra, esa en rojo: así se ve con qué se ha confundido
    const confundida = !acierto && elegida ? elegida : null
    ctx.ponerDatos(
      'juego-respuesta',
      coleccion([
        ...(confundida ? figurasDe(confundida, { nombre: confundida.nombre, color: ROJO }) : []),
        ...figurasDe(sitio, { nombre: sitio.nombre, color: VERDE }),
      ]),
    )
    const texto = acierto
      ? escrito && escrito.toLowerCase() !== sitio.nombre.toLowerCase()
        ? `¡Bien! Es ${sitio.nombre}`
        : '¡Bien!'
      : escrito === ''
        ? `Es ${sitio.nombre}`
        : `No: es ${sitio.nombre}`
    const ultima = resultados.length === preguntas.length
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        botonNota(() => ({
          modo: '¿Cómo se llama?',
          pregunta: `¿Cómo se llama? (${sitio.clase === 'calle' ? 'calle marcada' : 'lugar marcado'} en el mapa)`,
          respuesta: sitio.nombre,
          elegida: dicho || null,
          opciones: escribir ? null : opciones.map((o) => o.nombre),
          id: `nombre:${sitio.id}`,
          enlace: sitio.enlace,
          calle: sitio.calle,
          lugar: sitio.lugar,
        })),
        crear('p', { class: acierto ? 'acierto' : 'fallo' }, texto),
        !acierto && dicho && crear('p', { class: 'ficha-nota' }, escribir ? `Escribiste «${dicho}».` : `Elegiste ${dicho} (en rojo en el mapa).`),
        crear('p', { class: 'ficha-nota' }, sitio.detalle),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: siguiente }, ultima ? 'Ver el resultado' : 'Siguiente'),
        crear('a', { class: 'boton secundario', href: sitio.enlace }, 'Ver en el mapa'),
      ),
    )
    ctx.encuadrar([...puntosDe(sitio), ...(confundida ? puntosDe(confundida) : [])], { maxZoom: 16 })
  }

  function final() {
    const bien = aciertos()
    const anterior = estado.records[modalidad()] ?? 0
    estado.records[modalidad()] = Math.max(bien, anterior)
    estado.partidas++
    guardar()
    ctx.verPagina()
    const acertadas = lista.filter((s) => estado.items[s.id]?.bien > 0).length
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
          cifra(`${miles(acertadas)}/${miles(lista.length)}`, 'acertados'),
        ),
        crear('p', { class: 'ficha-nota' }, bien > anterior ? '¡Nuevo récord!' : `Tu récord: ${anterior} de ${resultados.length}`),
      ),
      paraRepasar(
        resultados
          .filter((r) => !r.acierto)
          .map((r) => ({
            nombre: r.sitio.nombre,
            texto: [r.dicho ? (escribir ? `Escribiste «${r.dicho}»` : `Elegiste ${r.dicho}`) : 'No lo sabías', r.sitio.detalle].join(' · '),
            enlace: r.sitio.enlace,
          })),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: () => partida(ctx, candidatas(ctx.datos, estado.ajustes)) }, 'Jugar otra vez'),
        crear('button', { class: 'boton secundario', onclick: ctx.portada }, 'Volver'),
      ),
    )
  }

  pregunta()
}
