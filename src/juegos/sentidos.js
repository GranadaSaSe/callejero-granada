// "¿Por dónde se circula?" (paso 2.4, sentidos de circulación tramo a tramo): se marca un trozo de calle en el
// mapa sin nombres y se dice cómo se circula por él: doble sentido, sentido único (eligiendo la flecha) o
// peatonal. Al contestar, el mapa enseña las flechas. Los cálculos están en src/sentidos-datos.js.
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { elegir, PREGUNTAS_POR_PARTIDA } from '../donde-datos.js'
import {
  candidatosSentido,
  dondeEsElTrozo,
  opcionesSentido,
  QUE_SENTIDOS,
  respuestaBuena,
  textoSentido,
  TIPOS_SENTIDO,
  trozosDeSentido,
} from '../sentidos-datos.js'
import { apuntarSitio, botonNota, cifra, coleccion, elegirTipoYZona, guardarEstado, leerEstado, linea, paraRepasar, punto, VERDE } from './comun.js'

const CLAVE = 'callejero-sentidos'
const AZUL = '#1565c0'
const GRIS = '#3b332c'
const ICONOS = { doble: '↔', peatonal: '🚶' } // las flechas de sentido único van giradas hacia donde apuntan
// items: { id: { bien, total, fallo } } (fallo = si la última vez se falló); récord por tipo, zona y sentidos
const estado = leerEstado(CLAVE, { ajustes: { tipo: 'principales', zona: 'Todos', sentidos: 'todos' }, records: {}, items: {}, partidas: 0 })
const modalidad = () => `${estado.ajustes.tipo}|${estado.ajustes.zona}|${estado.ajustes.sentidos}`
const guardar = () => guardarEstado(CLAVE, estado)
let trozos = null // se calculan la primera vez (tarda un poco: une los tramos de todas las calles)
const candidatos = (ctx) => candidatosSentido((trozos ??= trozosDeSentido(ctx.datos)), estado.ajustes)

export const juegoSentidos = {
  tarjeta(ctx) {
    const lista = candidatos(ctx)
    const acertados = lista.filter((t) => estado.items[t.id]?.bien > 0).length
    const record = estado.records[modalidad()]
    const cambiar = (cambio) => {
      Object.assign(estado.ajustes, cambio)
      guardar()
      ctx.portada()
    }
    return crear(
      'section',
      { class: 'tarjeta modo-test' },
      crear('h2', {}, '¿Por dónde se circula?'),
      crear(
        'p',
        {},
        'Se marca un trozo de calle en el mapa y tú dices cómo se circula por él: doble sentido, sentido único (eligiendo hacia dónde va la flecha) o peatonal. ' +
          `Son ${PREGUNTAS_POR_PARTIDA} preguntas por partida.`,
      ),
      crear(
        'div',
        { class: 'ajustes-test' },
        elegirTipoYZona(estado.ajustes, cambiar, TIPOS_SENTIDO),
        crear(
          'select',
          { 'aria-label': 'Qué sentidos', onchange: (e) => cambiar({ sentidos: e.target.value }) },
          QUE_SENTIDOS.map((s) => crear('option', { value: s.id, selected: s.id === estado.ajustes.sentidos }, s.nombre)),
        ),
      ),
      crear(
        'div',
        { class: 'cifras' },
        cifra(record === undefined ? '—' : `${record}/${PREGUNTAS_POR_PARTIDA}`, 'tu récord'),
        cifra(`${miles(acertados)}/${miles(lista.length)}`, 'acertados'),
        cifra(miles(estado.partidas), 'partidas'),
      ),
      lista.length > 0
        ? crear('button', { class: 'boton grande', onclick: () => partida(ctx, lista) }, 'Jugar')
        : crear('p', { class: 'hecho' }, 'No hay nada que preguntar con estos ajustes.'),
      crear(
        'p',
        { class: 'ficha-nota' },
        'No salen los tramos con el sentido por revisar. Una avenida con dos calzadas, cada una en un sentido, cuenta como doble sentido.',
      ),
    )
  },
}

// Botón de una respuesta: el dibujo (la flecha, girada como se ve en el mapa) y el texto
function botonOpcion(opcion, responder) {
  const icono = crear('span', { 'aria-hidden': 'true', 'data-grados': opcion.grados }, ICONOS[opcion.id] ?? '→')
  return crear('button', { class: 'opcion-examen opcion-sentido', onclick: () => responder(opcion) }, crear('span', { class: 'letra' }, icono), opcion.texto)
}

// Gira las flechas de los botones según lo girado que esté el mapa
function girarFlechas(contenedor, giro) {
  for (const icono of contenedor.querySelectorAll('[data-grados]')) icono.style.transform = `rotate(${Number(icono.dataset.grados) - giro}deg)`
}

async function partida(ctx, lista) {
  const { arriba, abajo } = ctx
  const preguntas = elegir(lista, PREGUNTAS_POR_PARTIDA, (t) => estado.items[t.id]?.fallo)
  const resultados = []
  let trozo = null
  let opciones = []
  let respondida = false

  // Teclado: 1-4 para elegir y Intro para pasar a la siguiente. Si se gira el mapa, giran las flechas.
  await ctx.abrirMapa({
    tecla(e) {
      if (!respondida && /^[1-4]$/.test(e.key)) responder(opciones[Number(e.key) - 1])
      else if (respondida && e.key === 'Enter') {
        e.preventDefault()
        siguiente()
      }
    },
    girar: (giro) => girarFlechas(abajo, giro),
  })

  const aciertos = () => resultados.filter((r) => r.acierto).length
  const marcador = crear('span')
  const pintarMarcador = (numero) => (marcador.textContent = `${numero} de ${preguntas.length} · ${aciertos()} bien`)
  const siguiente = () => (resultados.length === preguntas.length ? final() : pregunta())
  // Los extremos con el nombre de la calle a la que llegan, para saber hacia dónde apunta cada flecha
  const extremos = () => trozo.extremos.filter((e) => e.nombre).map((e) => punto(e.punto, { nombre: e.nombre, color: GRIS, radio: 5 }))
  const encuadrar = () => ctx.encuadrar([...trozo.lineas.flatMap((l) => l.linea), ...trozo.extremos.map((e) => e.punto)], { holgura: 40 })

  function pregunta() {
    trozo = preguntas[resultados.length]
    respondida = false
    ctx.limpiar()
    pintarMarcador(resultados.length + 1)
    rellenar(
      arriba,
      crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: ctx.portada }, '← Salir'), marcador),
      crear('p', { class: 'ficha-tipo' }, '¿Cómo se circula?'),
      crear('h2', {}, trozo.nombre),
      crear('p', { class: 'ficha-nota' }, dondeEsElTrozo(trozo)),
    )
    // Sin flechas hasta contestar
    ctx.ponerDatos('juego-respuesta', coleccion([...trozo.lineas.map((l) => linea(l.linea, { nombre: '', color: AZUL })), ...extremos()]))
    opciones = opcionesSentido(trozo, ctx.giro())
    rellenar(abajo, crear('div', { class: 'opciones-examen' }, opciones.map((o) => botonOpcion(o, responder))))
    girarFlechas(abajo, ctx.giro())
    encuadrar()
  }

  function responder(elegida) {
    if (respondida) return
    respondida = true
    const acierto = elegida.id === respuestaBuena(trozo)
    resultados.push({ trozo, acierto, elegida })
    pintarMarcador(resultados.length)
    apuntar([{ tema: 'sentido', acierto }])
    apuntarSitio(estado.items, trozo.id, acierto, { fallo: !acierto })
    guardar()

    // El trozo en verde con sus flechas (en una avenida con dos calzadas, cada una con la suya)
    ctx.ponerDatos(
      'juego-respuesta',
      coleccion([...trozo.lineas.map((l) => linea(l.linea, { nombre: '', color: VERDE, sentido: l.sentido })), ...extremos()]),
    )
    const buena = textoSentido(trozo)
    const ultima = resultados.length === preguntas.length
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        botonNota(() => ({
          modo: '¿Por dónde se circula?',
          pregunta: `¿Cómo se circula por ${trozo.nombre}? (${dondeEsElTrozo(trozo).toLowerCase()})`,
          respuesta: buena,
          elegida: elegida.texto,
          opciones: opciones.map((o) => o.texto),
          id: `sentido:${trozo.id}`,
          enlace: trozo.enlace,
          calle: trozo.calle,
        })),
        crear('p', { class: acierto ? 'acierto' : 'fallo' }, acierto ? `¡Bien! ${buena}` : `No: ${buena[0].toLowerCase()}${buena.slice(1)}`),
        !acierto && crear('p', { class: 'ficha-nota' }, `Elegiste «${elegida.texto}».`),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: siguiente }, ultima ? 'Ver el resultado' : 'Siguiente'),
        crear('a', { class: 'boton secundario', href: trozo.enlace }, 'Ver en el mapa'),
      ),
    )
    encuadrar()
  }

  function final() {
    const bien = aciertos()
    const anterior = estado.records[modalidad()] ?? 0
    estado.records[modalidad()] = Math.max(bien, anterior)
    estado.partidas++
    guardar()
    ctx.verPagina()
    const acertados = lista.filter((t) => estado.items[t.id]?.bien > 0).length
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
          cifra(`${miles(acertados)}/${miles(lista.length)}`, 'acertados'),
        ),
        crear('p', { class: 'ficha-nota' }, bien > anterior ? '¡Nuevo récord!' : `Tu récord: ${anterior} de ${resultados.length}`),
      ),
      paraRepasar(
        resultados
          .filter((r) => !r.acierto)
          .map((r) => ({
            nombre: r.trozo.nombre,
            texto: [dondeEsElTrozo(r.trozo), textoSentido(r.trozo), `Elegiste «${r.elegida.texto}»`].join(' · '),
            enlace: r.trozo.enlace,
          })),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: () => partida(ctx, candidatos(ctx)) }, 'Jugar otra vez'),
        crear('button', { class: 'boton secundario', onclick: ctx.portada }, 'Volver'),
      ),
    )
  }

  pregunta()
}
