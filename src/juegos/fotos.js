// «Fotos» (paso 4.2, reconocer por foto): sale la foto de un edificio, un monumento o una estatua y una pregunta como
// las del examen: qué sitio es, desde qué calle se accede, a qué distrito pertenece o qué parque de bomberos lo cubre;
// o hay que tocar en el mapa sin nombres dónde está. Es el único juego con fotos (decidido por la persona el
// 14-11-2026: ninguna pregunta con foto en el Test, las Tarjetas ni los otros juegos). Los cálculos están en
// src/fotos-datos.js y las piezas para enseñar las fotos, en src/fotos.js.
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { ACIERTO_METROS, elegir, medir, puntosPorDistancia, textoMetros, veredicto } from '../donde-datos.js'
import { DISTRITOS } from '../ejes-lista.js'
import { MODOS_FOTOS, lugaresDelJuego, preguntaDeFoto, prepararFotos, PREGUNTAS_FOTOS, TIPOS_FOTOS } from '../fotos-datos.js'
import { fotoAbierta, fotosGuardadas, guardarTodas, visorFotos } from '../fotos.js'
import { apuntarSitio, botonNota, cifra, coleccion, guardarEstado, leerEstado, linea, paraRepasar, punto, ROJO, VERDE } from './comun.js'

const CLAVE = 'callejero-fotos'
const LETRAS = ['a', 'b', 'c', 'd']
// items: { id del lugar: { bien, total, fallo } }; récord por modo, tipo y zona
const estado = leerEstado(CLAVE, { ajustes: { modo: 'mezcla', tipo: 'todos', zona: 'Todos' }, records: {}, items: {}, partidas: 0 })
const modalidad = () => `${estado.ajustes.modo}|${estado.ajustes.tipo}|${estado.ajustes.zona}`
const guardar = () => guardarEstado(CLAVE, estado)
let base = null // se prepara la primera vez
let guardando = null // texto del aviso mientras se guardan las fotos en el móvil

const megas = (bytes) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`
const textoParque = (l) => (['Norte', 'Sur'].includes(l.parque) ? `Parque ${l.parque}` : null)
// La respuesta buena, para la lista de repaso del final
const RESUMEN = {
  acceso: (buena) => `se accede desde ${buena}`,
  distrito: (buena) => `es del distrito ${buena}`,
  parque: (buena) => `lo cubre el ${buena}`,
}
// Todo lo que se sabe del sitio, para aprenderlo al contestar
const detalleDe = (l) => [l.direccion, l.barrio && `barrio ${l.barrio} (${l.distrito})`, textoParque(l)].filter(Boolean).join(' · ')

export const juegoFotos = {
  tarjeta(ctx) {
    base ??= prepararFotos({ ...ctx.datos, fotos: ctx.datos.fotos.lugares })
    const lista = lugaresDelJuego(base, estado.ajustes)
    const acertados = lista.filter((l) => estado.items[l.id]?.bien > 0).length
    const record = estado.records[modalidad()]
    const cambiar = (cambio) => {
      Object.assign(estado.ajustes, cambio)
      guardar()
      ctx.portada()
    }
    const desplegable = (etiqueta, clave, opciones) =>
      crear(
        'select',
        { 'aria-label': etiqueta, onchange: (e) => cambiar({ [clave]: e.target.value }) },
        opciones.map(([valor, texto]) => crear('option', { value: valor, selected: valor === estado.ajustes[clave] }, texto)),
      )

    if (!base.conFoto.length) {
      return crear(
        'section',
        { class: 'tarjeta modo-test' },
        crear('h2', {}, 'Fotos'),
        crear('p', {}, 'Reconocer edificios, monumentos y estatuas por su foto. Todavía no hay fotos: irán saliendo a medida que se revisen.'),
      )
    }

    // Guardar las fotos en el móvil para jugar sin internet
    const aviso = crear('p', { class: 'ficha-nota' }, guardando ?? '')
    const botonGuardar = crear(
      'button',
      {
        class: 'enlace-discreto',
        disabled: Boolean(guardando),
        onclick: async () => {
          guardando = 'Guardando las fotos…'
          botonGuardar.disabled = true
          const { total, fallidas } = await guardarTodas(ctx.datos.fotos, (hechas, de) => {
            guardando = `Guardando las fotos: ${miles(hechas)} de ${miles(de)}…`
            aviso.textContent = guardando
          })
          guardando = null
          aviso.textContent = fallidas
            ? `No se han podido guardar ${miles(fallidas)} de ${miles(total)}: prueba otra vez con internet.`
            : `Listo: las ${miles(total)} fotos están guardadas en este dispositivo.`
          botonGuardar.disabled = false
        },
      },
      `Guardar todas las fotos para jugar sin internet (${megas(ctx.datos.fotos.bytes)})`,
    )
    if (!guardando) {
      fotosGuardadas(ctx.datos.fotos).then((n) => {
        const total = Object.values(ctx.datos.fotos.lugares).flat().length
        if (n !== null && !aviso.textContent) aviso.textContent = n >= total ? 'Todas las fotos están guardadas en este dispositivo.' : `Guardadas en este dispositivo: ${miles(n)} de ${miles(total)} fotos.`
      })
    }

    return crear(
      'section',
      { class: 'tarjeta modo-test' },
      crear('h2', {}, 'Fotos'),
      crear(
        'p',
        {},
        'Sale la foto de un edificio, un monumento o una estatua de Granada y una pregunta como las del examen: qué sitio es, ' +
          'desde qué calle se accede, a qué distrito pertenece o qué parque de bomberos lo cubre. O tocas en el mapa dónde está. ' +
          `Son ${PREGUNTAS_FOTOS} fotos por partida.`,
      ),
      crear(
        'div',
        { class: 'ajustes-test' },
        desplegable('Qué preguntar', 'modo', MODOS_FOTOS.map((m) => [m.id, m.nombre])),
        desplegable('Qué lugares', 'tipo', TIPOS_FOTOS.map((t) => [t.id, t.nombre])),
        desplegable('Zona', 'zona', ['Todos', ...DISTRITOS].map((d) => [d, d === 'Todos' ? 'Toda Granada' : d])),
      ),
      crear(
        'div',
        { class: 'cifras' },
        cifra(record === undefined ? '—' : `${record}/${PREGUNTAS_FOTOS}`, 'tu récord'),
        cifra(`${miles(acertados)}/${miles(lista.length)}`, 'acertados'),
        cifra(miles(estado.partidas), 'partidas'),
      ),
      lista.length > 0
        ? crear('button', { class: 'boton grande', onclick: () => partida(ctx, lista) }, 'Jugar')
        : crear('p', { class: 'hecho' }, 'No hay fotos con estos ajustes.'),
      crear('p', { class: 'ficha-nota' }, `Hay fotos de ${miles(base.conFoto.length)} lugares; irán saliendo más a medida que se revisen. Toca la foto para verla en grande.`),
      botonGuardar,
      aviso,
    )
  },
}

async function partida(ctx, lista) {
  const { arriba, abajo } = ctx
  const preguntas = elegir(lista, Math.min(PREGUNTAS_FOTOS, lista.length), (l) => estado.items[l.id]?.fallo)
  const resultados = []
  let lugar = null
  let pregunta = null
  let respondida = false
  let toque = null
  let boton = null

  await ctx.abrirMapa({
    tocar(p) {
      if (respondida || pregunta?.modo !== 'donde') return
      toque = p
      ctx.ponerDatos('juego-toque', coleccion([punto(p)]))
      boton.disabled = false
    },
    // Teclado: 1-4 para elegir e Intro para comprobar (al tocar el mapa) o pasar a la siguiente
    tecla(e) {
      if (fotoAbierta()) return
      if (!respondida && pregunta.opciones && /^[1-4]$/.test(e.key)) responder(pregunta.opciones[Number(e.key) - 1])
      else if (e.key === 'Enter') {
        e.preventDefault()
        if (!respondida && pregunta.modo === 'donde') comprobar()
        else if (respondida) siguiente()
      }
    },
  })

  const aciertos = () => resultados.filter((r) => r.acierto).length
  const marcador = crear('span')
  const pintarMarcador = (numero) => (marcador.textContent = `${numero} de ${preguntas.length} · ${aciertos()} bien`)
  const siguiente = () => (resultados.length === preguntas.length ? final() : preguntar())

  function preguntar() {
    lugar = preguntas[resultados.length]
    pregunta = preguntaDeFoto(base, lugar, estado.ajustes.modo)
    respondida = false
    toque = null
    ctx.limpiar()
    pintarMarcador(resultados.length + 1)
    const tocando = pregunta.modo === 'donde'
    rellenar(
      arriba,
      crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: ctx.portada }, '← Salir'), marcador),
      crear('p', { class: 'ficha-tipo' }, `Fotos · ${lugar.categoria}`),
      crear('h2', {}, pregunta.enunciado),
      // Al tocar el mapa hace falta sitio para el mapa: la foto, más pequeña (se puede ampliar)
      visorFotos(lugar.fotos, { alt: 'Foto del sitio de la pregunta', clase: tocando ? 'foto-juego pequena' : 'foto-juego' }),
    )
    if (tocando) {
      boton = crear('button', { class: 'boton grande', disabled: true, onclick: comprobar }, 'Comprobar')
      rellenar(abajo, crear('p', {}, 'Toca el mapa donde creas que está. Puedes acercarte y cambiar el punto antes de comprobar.'), boton)
    } else {
      rellenar(
        abajo,
        crear(
          'div',
          { class: 'opciones-examen' },
          pregunta.opciones.map((o, i) =>
            crear('button', { class: 'opcion-examen', onclick: () => responder(o) }, crear('span', { class: 'letra' }, LETRAS[i]), o),
          ),
        ),
      )
    }
    ctx.encuadrarZona(estado.ajustes.zona)
  }

  // Tocando el mapa: como en «¿Dónde está?», acierto a 100 m o menos
  function comprobar() {
    if (!toque || respondida) return
    const { metros, punto: cercano } = medir({ puntos: [lugar.punto] }, toque)
    const acierto = metros <= ACIERTO_METROS
    terminar(acierto, { metros, puntos: puntosPorDistancia(metros) })
    ctx.ponerDatos('juego-respuesta', coleccion([punto(lugar.punto, { nombre: lugar.nombre, color: acierto ? VERDE : ROJO })]))
    ctx.ponerDatos('juego-distancia', coleccion(metros > 10 ? [linea([toque, cercano])] : []))
    ctx.encuadrar([toque, lugar.punto], { maxZoom: 16, holgura: 40 })
  }

  function responder(elegida) {
    if (respondida) return
    const acierto = elegida === pregunta.buena
    terminar(acierto, { elegida })
    // El sitio en verde con su nombre y, si se eligió otro sitio, ese en rojo: así se ve con qué se ha confundido
    const confundido = !acierto && pregunta.modo === 'nombre' ? base.parecidos.find((o) => o.nombre === elegida) : null
    ctx.ponerDatos(
      'juego-respuesta',
      coleccion([
        ...(confundido ? [punto(confundido.punto, { nombre: confundido.nombre, color: ROJO })] : []),
        punto(lugar.punto, { nombre: lugar.nombre, color: VERDE }),
      ]),
    )
    ctx.encuadrar([lugar.punto, ...(confundido ? [confundido.punto] : [])], { maxZoom: 16, holgura: 40 })
  }

  function terminar(acierto, { elegida = null, metros = null, puntos = null }) {
    respondida = true
    // Al contestar se enseña en el mapa dónde está: la foto se hace pequeña para dejarle sitio
    arriba.querySelector('.foto-juego')?.classList.add('pequena')
    resultados.push({ lugar, pregunta, acierto, elegida, metros })
    pintarMarcador(resultados.length)
    apuntar([{ tema: ['distrito', 'parque'].includes(pregunta.modo) ? 'parques' : 'lugares', acierto }])
    apuntarSitio(estado.items, lugar.id, acierto, { fallo: !acierto })
    guardar()

    const texto =
      pregunta.modo === 'donde'
        ? `${veredicto(metros)} · a ${textoMetros(metros)} · +${puntos} puntos`
        : acierto
          ? '¡Bien!'
          : `No: es ${pregunta.buena}`
    const ultima = resultados.length === preguntas.length
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        botonNota(() => ({
          modo: 'Fotos',
          pregunta: `${pregunta.enunciado} (foto de ${lugar.nombre})`,
          respuesta: pregunta.buena,
          elegida,
          opciones: pregunta.opciones ?? null,
          id: `fotos:${lugar.id}:${pregunta.modo}`,
          enlace: `#/mapa?lugar=${lugar.id}`,
          lugar: { id: lugar.id, nombre: lugar.nombre },
        })),
        crear('p', { class: acierto ? 'acierto' : 'fallo' }, texto),
        !acierto && elegida && crear('p', { class: 'ficha-nota' }, `Elegiste ${elegida}.`),
        crear('p', { class: 'ficha-nota' }, crear('strong', {}, lugar.nombre), ` · ${detalleDe(lugar)}`),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: siguiente }, ultima ? 'Ver el resultado' : 'Siguiente'),
        crear('a', { class: 'boton secundario', href: `#/mapa?lugar=${lugar.id}` }, 'Ver en el mapa'),
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
    const acertados = lista.filter((l) => estado.items[l.id]?.bien > 0).length
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
            nombre: r.lugar.nombre,
            texto: [
              r.pregunta.modo === 'donde' ? `Te quedaste a ${textoMetros(r.metros)}` : `Elegiste ${r.elegida}`,
              RESUMEN[r.pregunta.modo]?.(r.pregunta.buena),
              detalleDe(r.lugar),
            ]
              .filter(Boolean)
              .join(' · '),
            enlace: `#/mapa?lugar=${r.lugar.id}`,
          })),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: () => partida(ctx, lugaresDelJuego(base, estado.ajustes)) }, 'Jugar otra vez'),
        crear('button', { class: 'boton secundario', onclick: ctx.portada }, 'Volver'),
      ),
    )
  }

  preguntar()
}
