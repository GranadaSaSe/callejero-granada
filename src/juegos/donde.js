// "¿Dónde está?" (paso 2.2): la app dice una calle o un lugar, se toca en el mapa dónde está y se puntúa
// según los metros de distancia. Los cálculos están en src/donde-datos.js.
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import {
  ACIERTO_METROS,
  candidatas,
  elegir,
  medir,
  PREGUNTAS_POR_PARTIDA,
  puntosPorDistancia,
  textoMetros,
  veredicto,
} from '../donde-datos.js'
import {
  apuntarSitio,
  botonNota,
  cifra,
  coleccion,
  elegirTipoYZona,
  figurasDe,
  guardarEstado,
  leerEstado,
  linea,
  paraRepasar,
  punto,
  puntosDe,
  ROJO,
  VERDE,
} from './comun.js'

const CLAVE = 'callejero-donde'
// items: { id: { bien, total, ultima } } (ultima = metros de la última vez); récord por tipo y zona
const estado = leerEstado(CLAVE, { ajustes: { tipo: 'principales', zona: 'Todos' }, records: {}, items: {}, partidas: 0 })
const modalidad = () => `${estado.ajustes.tipo}|${estado.ajustes.zona}`
const guardar = () => guardarEstado(CLAVE, estado)

// El nombre de un lugar va debajo de su punto, hacia el lado contrario al toque: el punto queda en un borde
// del encuadre y, centrado, el nombre se saldría de la pantalla
function anclaNombre(sitio, toque) {
  const dx = Math.abs(sitio[0] - toque[0]) * 0.8 // un grado de longitud mide aquí el 80 % que uno de latitud
  const dy = Math.abs(sitio[1] - toque[1])
  return dx < dy * 0.3 ? 'top' : sitio[0] < toque[0] ? 'top-left' : 'top-right'
}

export const juegoDonde = {
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
      crear('h2', {}, '¿Dónde está?'),
      crear(
        'p',
        {},
        `La app te dice una calle o un lugar y tú lo tocas en el mapa. Cuanto más cerca, más puntos: 100 si te quedas a menos de 50 m. Son ${PREGUNTAS_POR_PARTIDA} preguntas por partida.`,
      ),
      crear('div', { class: 'ajustes-test' }, elegirTipoYZona(estado.ajustes, cambiar)),
      crear(
        'div',
        { class: 'cifras' },
        cifra(record ? miles(record) : '—', 'tu récord'),
        cifra(`${miles(acertadas)}/${miles(lista.length)}`, 'acertados'),
        cifra(miles(estado.partidas), 'partidas'),
      ),
      lista.length > 0
        ? crear('button', { class: 'boton grande', onclick: () => partida(ctx, lista) }, 'Jugar')
        : crear('p', { class: 'hecho' }, 'No hay nada que preguntar con estos ajustes.'),
      crear('p', { class: 'ficha-nota' }, `«Acertados»: sitios que alguna vez has tocado a menos de ${ACIERTO_METROS} m.`),
    )
  },
}

async function partida(ctx, lista) {
  const { arriba, abajo } = ctx
  const preguntas = elegir(lista, PREGUNTAS_POR_PARTIDA, (s) => estado.items[s.id]?.ultima > ACIERTO_METROS)
  const resultados = []
  let sitio = null
  let toque = null
  let respondida = false
  let boton = null

  // Teclado: Intro para comprobar y para pasar a la siguiente
  await ctx.abrirMapa({
    tocar(p) {
      if (respondida) return
      toque = p
      ctx.ponerDatos('juego-toque', coleccion([punto(p)]))
      boton.disabled = false
    },
    tecla(e) {
      if (e.key !== 'Enter') return
      e.preventDefault()
      if (!respondida) comprobar()
      else if (resultados.length === preguntas.length) final()
      else pregunta()
    },
  })

  const total = () => resultados.reduce((suma, r) => suma + r.puntos, 0)
  const marcador = crear('span')
  const pintarMarcador = (numero) => (marcador.textContent = `${numero} de ${preguntas.length} · ${miles(total())} puntos`)

  function pregunta() {
    sitio = preguntas[resultados.length]
    toque = null
    respondida = false
    ctx.limpiar()
    pintarMarcador(resultados.length + 1)
    rellenar(
      arriba,
      crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: ctx.portada }, '← Salir'), marcador),
      crear('p', { class: 'ficha-tipo' }, sitio.clase === 'calle' ? '¿Dónde está esta calle?' : `¿Dónde está? · ${sitio.categoria}`),
      crear('h2', {}, sitio.nombre),
    )
    boton = crear('button', { class: 'boton grande', disabled: true, onclick: comprobar }, 'Comprobar')
    rellenar(abajo, crear('p', {}, 'Toca el mapa donde creas que está. Puedes acercarte y cambiar el punto antes de comprobar.'), boton)
    ctx.encuadrarZona(estado.ajustes.zona)
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
    apuntarSitio(estado.items, sitio.id, acierto, { ultima: Math.round(metros) })
    guardar()

    const propiedades = { nombre: sitio.nombre, color: acierto ? VERDE : ROJO }
    ctx.ponerDatos('juego-respuesta', coleccion(figurasDe(sitio, (p) => ({ ...propiedades, ancla: anclaNombre(p, toque) }))))
    ctx.ponerDatos('juego-distancia', coleccion(metros > 10 ? [linea([toque, cercano])] : []))
    const ultima = resultados.length === preguntas.length
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        botonNota(() => ({
          modo: '¿Dónde está?',
          pregunta: `¿Dónde está ${sitio.nombre}?`,
          respuesta: sitio.detalle,
          id: `donde:${sitio.id}`,
          enlace: sitio.enlace,
          calle: sitio.calle,
          lugar: sitio.lugar,
        })),
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
    ctx.encuadrar([toque, cercano, ...puntosDe(sitio)])
  }

  function final() {
    const puntos = total()
    const record = Math.max(puntos, estado.records[modalidad()] ?? 0)
    estado.records[modalidad()] = record
    estado.partidas++
    guardar()
    ctx.verPagina()
    const aciertos = resultados.filter((r) => r.acierto).length
    const media = resultados.reduce((suma, r) => suma + r.metros, 0) / resultados.length
    const lejos = resultados.filter((r) => !r.acierto).sort((a, b) => b.metros - a.metros)
    rellenar(
      ctx.pagina,
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
      paraRepasar(lejos.map((r) => ({ nombre: r.sitio.nombre, texto: `Te quedaste a ${textoMetros(r.metros)} · ${r.sitio.detalle}`, enlace: r.sitio.enlace }))),
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
