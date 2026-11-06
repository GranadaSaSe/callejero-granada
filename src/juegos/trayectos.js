// "Trayectos" (paso 3.3): desde uno de los dos parques de bomberos hasta un lugar o una calle, se elige el mejor
// itinerario entre cuatro, con todas las calles del camino. Al contestar, el mapa enseña el camino bueno (en verde,
// con el nombre de cada calle) y lo elegido si estaba mal (en rojo). Los cálculos están en src/trayectos-datos.js.
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { elegir } from '../donde-datos.js'
import { PARQUES } from '../rutas.js'
import {
  crearTrayecto,
  DESDE_PARQUE,
  destinosTrayecto,
  lineasDeCalle,
  lineasDeItinerario,
  motivoEnFrase,
  nombreCorto,
  prepararTrayectos,
  textoGiro,
  textoKm,
  TIPOS_TRAYECTO,
} from '../trayectos-datos.js'
import { apuntarSitio, botonNota, cifra, coleccion, guardarEstado, leerEstado, linea, paraRepasar, punto, ROJO, VERDE } from './comun.js'
import { DISTRITOS } from '../ejes-lista.js'

const CLAVE = 'callejero-trayectos'
export const TRAYECTOS_POR_PARTIDA = 5
const AZUL = '#1565c0'
const GRIS = '#3b332c'
// items: { "norte>l:ID": { bien, total, fallo } }; récord por tipo, zona y parque
const estado = leerEstado(CLAVE, { ajustes: { tipo: 'mezcla', zona: 'Todos', desde: 'ambos' }, records: {}, items: {}, partidas: 0 })
const modalidad = () => `${estado.ajustes.tipo}|${estado.ajustes.zona}|${estado.ajustes.desde}`
const guardar = () => guardarEstado(CLAVE, estado)

// La red se prepara la primera vez que hace falta (la usan también «Paso a paso»)
let base = null
export const baseTrayectos = (ctx) => (base ??= prepararTrayectos(ctx.datos))

// Parejas [parque, destino] que pueden salir con unos ajustes
export function parejasTrayecto(ctx, ajustes) {
  const parques = ajustes.desde === 'ambos' ? PARQUES.map((p) => p.id) : [ajustes.desde]
  return destinosTrayecto(baseTrayectos(ctx), ajustes).flatMap((d) => parques.map((p) => ({ id: `${p}>${d.id}`, parque: p, destino: d })))
}

// Calcula trayectos de una lista de parejas hasta que sale uno (algunas no tienen camino sin tramos dudosos). Deja
// respirar a la página entre uno y otro para que no se quede parada.
export async function siguienteTrayecto(ctx, cola) {
  while (cola.length) {
    const { parque, destino } = cola.shift()
    await new Promise((listo) => setTimeout(listo, 0))
    const t = crearTrayecto(baseTrayectos(ctx), parque, destino)
    if (t) return t
  }
  return null
}

// Desplegables de qué destinos, en qué distrito y desde qué parque (también los usa «Paso a paso»)
export const ajustesTrayecto = (ajustes, cambiar) =>
  crear(
    'div',
    { class: 'ajustes-test' },
    crear(
      'select',
      { 'aria-label': 'A dónde', onchange: (e) => cambiar({ tipo: e.target.value }) },
      TIPOS_TRAYECTO.map((t) => crear('option', { value: t.id, selected: t.id === ajustes.tipo }, t.nombre)),
    ),
    crear(
      'select',
      { 'aria-label': 'Distrito del destino', onchange: (e) => cambiar({ zona: e.target.value }) },
      ['Todos', ...DISTRITOS].map((d) => crear('option', { value: d, selected: d === ajustes.zona }, d === 'Todos' ? 'Toda Granada' : d)),
    ),
    crear(
      'select',
      { 'aria-label': 'Desde qué parque', onchange: (e) => cambiar({ desde: e.target.value }) },
      DESDE_PARQUE.map((d) => crear('option', { value: d.id, selected: d.id === ajustes.desde }, d.nombre)),
    ),
  )

// El origen y el destino en el mapa: el parque, y el lugar (un punto) o la calle (sus líneas), con sus nombres
export function origenYDestino(ctx, t) {
  // El camino bueno: en «Dibuja el trayecto» va en t.linea; en las preguntas, en su opción buena
  const camino = t.linea ?? t.opciones[t.correcta].linea
  const figuras = [punto(camino[0], { nombre: t.parque.nombre.replace('Parque de Bomberos', 'Parque'), color: GRIS, radio: 7 })]
  if (t.destino.clase === 'lugar') figuras.push(punto(t.destino.lugar.punto, { nombre: t.destino.nombre, color: GRIS, radio: 7 }))
  else for (const l of lineasDeCalle(baseTrayectos(ctx), t.destino.nombre)) figuras.push(linea(l, { nombre: t.destino.nombre, color: GRIS }))
  return figuras
}

// Un itinerario escrito calle a calle, con las calles en las que está el fallo marcadas
const textoMarcado = (opcion, marcar) =>
  opcion.partes.flatMap((p, j) => [
    j ? ' → ' : '',
    textoGiro[p.giro] ?? '',
    crear('span', { class: marcar && opcion.marcas.includes(j) ? 'calle-mal' : null }, nombreCorto(p.calle)),
  ])

export const juegoTrayectos = {
  tarjeta(ctx) {
    const lista = parejasTrayecto(ctx, estado.ajustes)
    const ids = new Set(lista.map((p) => p.id))
    const acertados = Object.entries(estado.items).filter(([id, item]) => ids.has(id) && item.bien > 0).length
    const record = estado.records[modalidad()]
    const cambiar = (cambio) => {
      Object.assign(estado.ajustes, cambio)
      guardar()
      ctx.portada()
    }
    return crear(
      'section',
      { class: 'tarjeta modo-test' },
      crear('h2', {}, 'Trayectos'),
      crear(
        'p',
        {},
        'Desde un parque de bomberos hasta un lugar o una calle: eliges el mejor itinerario entre cuatro, con todas sus calles. ' +
          `Las falsas van en contra dirección, tienen una calle que no conecta o dan un rodeo. Son ${TRAYECTOS_POR_PARTIDA} trayectos por partida.`,
      ),
      ajustesTrayecto(estado.ajustes, cambiar),
      crear(
        'div',
        { class: 'cifras' },
        cifra(record === undefined ? '—' : `${record}/${TRAYECTOS_POR_PARTIDA}`, 'tu récord'),
        cifra(miles(acertados), 'acertados'),
        cifra(miles(estado.partidas), 'partidas'),
      ),
      lista.length > 0
        ? crear('button', { class: 'boton grande', onclick: () => partida(ctx) }, 'Jugar')
        : crear('p', { class: 'hecho' }, 'No hay nada que preguntar con estos ajustes.'),
      crear(
        'p',
        { class: 'ficha-nota' },
        'Solo salen caminos que no pasan por calles con el sentido por revisar: cuantas más revises, más trayectos saldrán.',
      ),
    )
  },
}

async function partida(ctx) {
  const { arriba, abajo } = ctx
  const lista = parejasTrayecto(ctx, estado.ajustes)
  // Más parejas de las necesarias: algunas no tienen camino sin tramos dudosos
  const cola = elegir(lista, TRAYECTOS_POR_PARTIDA * 6, (p) => estado.items[p.id]?.fallo)
  const resultados = []
  let t = null
  let respondida = false
  let proximo = null // el trayecto siguiente, que se calcula mientras se contesta el actual

  await ctx.abrirMapa({
    tecla(e) {
      if (!respondida && /^[1-4]$/.test(e.key)) responder(Number(e.key) - 1)
      else if (respondida && e.key === 'Enter') {
        e.preventDefault()
        siguiente()
      }
    },
  })
  abajo.classList.add('panel-largo')

  const aciertos = () => resultados.filter((r) => r.acierto).length
  const marcador = crear('span')
  const pintarMarcador = (numero) => (marcador.textContent = `${numero} de ${TRAYECTOS_POR_PARTIDA} · ${aciertos()} bien`)
  const salir = () => {
    abajo.classList.remove('panel-largo')
    ctx.portada()
  }
  const barra = () => crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: salir }, '← Salir'), marcador)

  let calculando = false
  async function siguiente() {
    if (resultados.length === TRAYECTOS_POR_PARTIDA) return final()
    if (calculando) return // un segundo Intro mientras se calcula no hace nada
    calculando = true
    respondida = true
    rellenar(abajo, crear('p', {}, 'Calculando el trayecto…'))
    t = await (proximo ?? siguienteTrayecto(ctx, cola))
    proximo = null
    calculando = false
    if (!ctx.abajo.isConnected || !abajo.classList.contains('panel-largo')) return // se salió mientras tanto
    if (!t) return resultados.length ? final() : salir()
    pregunta()
    // El siguiente se va calculando mientras se lee este
    if (resultados.length + 1 < TRAYECTOS_POR_PARTIDA) proximo = siguienteTrayecto(ctx, cola)
  }

  function pregunta() {
    respondida = false
    ctx.limpiar()
    pintarMarcador(resultados.length + 1)
    rellenar(
      arriba,
      barra(),
      crear('p', { class: 'ficha-tipo' }, `Trayecto desde el ${t.parque.nombre.replace('Parque de Bomberos', 'Parque')}`),
      crear('h2', {}, `Hasta ${t.destino.nombre}`),
      t.destino.detalle && crear('p', { class: 'ficha-nota' }, t.destino.clase === 'lugar' ? t.destino.detalle : `Barrio ${t.destino.detalle}`),
    )
    ctx.ponerDatos('juego-respuesta', coleccion(origenYDestino(ctx, t)))
    rellenar(
      abajo,
      crear('p', { class: 'ficha-nota' }, '¿Cuál es el mejor itinerario?'),
      crear(
        'div',
        { class: 'opciones-examen' },
        t.opciones.map((o, i) =>
          crear('button', { class: 'opcion-examen opcion-trayecto', onclick: () => responder(i) }, crear('span', { class: 'letra' }, 'ABCD'[i]), crear('span', {}, o.texto)),
        ),
      ),
    )
    abajo.scrollTop = 0
    // Se encuadran el parque y el destino (no el camino, que daría pistas)
    ctx.encuadrar(
      origenYDestino(ctx, t).flatMap((f) => (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates)),
      { holgura: 40 },
    )
  }

  function responder(i) {
    if (respondida) return
    respondida = true
    const elegida = t.opciones[i]
    const acierto = i === t.correcta
    resultados.push({ t, acierto, elegida })
    pintarMarcador(resultados.length)
    apuntar([{ tema: 'trayectos', acierto }])
    apuntarSitio(estado.items, t.id, acierto, { fallo: !acierto })
    guardar()

    // En el mapa: lo elegido en rojo (si estaba mal) y debajo el camino bueno en verde, calle a calle con su nombre
    const mal = []
    if (!acierto) {
      if (elegida.linea) mal.push(linea(elegida.linea, { nombre: '', color: ROJO }))
      else for (const l of lineasDeCalle(baseTrayectos(ctx), elegida.calleFalsa)) mal.push(linea(l, { nombre: elegida.calleFalsa, color: ROJO }))
    }
    const bueno = lineasDeItinerario(t).map((p) => linea(p.linea, { nombre: p.calle, color: VERDE }))
    ctx.ponerDatos('juego-respuesta', coleccion([...mal, ...bueno, ...origenYDestino(ctx, t).filter((f) => f.geometry.type === 'Point')]))
    ctx.encuadrar([...t.opciones[t.correcta].linea, ...(!acierto && elegida.linea ? elegida.linea : [])], { holgura: 40 })

    const ultima = resultados.length === TRAYECTOS_POR_PARTIDA
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        botonNota(() => ({
          modo: 'Trayectos',
          pregunta: t.enunciado,
          respuesta: t.opciones[t.correcta].texto,
          elegida: elegida.texto,
          opciones: t.opciones.map((o) => o.texto),
          id: `trayecto:${t.id}`,
          enlace: t.destino.enlace,
        })),
        crear('p', { class: acierto ? 'acierto' : 'fallo' }, acierto ? '¡Bien!' : `No: ${motivoEnFrase(elegida.motivo)}.`),
        crear('p', { class: 'ficha-nota' }, `El mejor camino, en verde en el mapa, mide ${textoKm(t.ruta.metros)}.`),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: siguiente }, ultima ? 'Ver el resultado' : 'Siguiente'),
        crear('a', { class: 'boton secundario', href: t.destino.enlace }, 'Ver en el mapa'),
      ),
      // Las cuatro opciones con el fallo de cada una, plegadas para que se vea el mapa
      crear(
        'details',
        { class: 'opciones-plegadas' },
        crear('summary', {}, 'Ver las cuatro opciones y dónde falla cada una'),
        crear(
          'div',
          { class: 'opciones-examen' },
          t.opciones.map((o, j) =>
            crear(
              'div',
              { class: `opcion-examen opcion-trayecto ${j === t.correcta ? 'es-buena' : j === i ? 'es-elegida' : ''}` },
              crear('span', { class: 'letra' }, 'ABCD'[j]),
              crear('span', {}, textoMarcado(o, true), o.motivo && crear('small', { class: 'motivo' }, o.motivo)),
            ),
          ),
        ),
      ),
    )
    abajo.scrollTop = 0
  }

  let terminada = false
  function final() {
    if (terminada) return // por si se pulsa dos veces «Ver el resultado»
    terminada = true
    abajo.classList.remove('panel-largo')
    const bien = aciertos()
    const anterior = estado.records[modalidad()] ?? 0
    estado.records[modalidad()] = Math.max(bien, anterior)
    estado.partidas++
    guardar()
    ctx.verPagina()
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
          cifra(`${Math.max(bien, anterior)}/${TRAYECTOS_POR_PARTIDA}`, 'tu récord'),
          cifra(miles(estado.partidas), 'partidas'),
        ),
        crear('p', { class: 'ficha-nota' }, bien > anterior ? '¡Nuevo récord!' : `Tu récord: ${anterior} de ${TRAYECTOS_POR_PARTIDA}`),
      ),
      paraRepasar(
        resultados
          .filter((r) => !r.acierto)
          .map((r) => ({
            nombre: `${r.t.parque.nombre.replace('Parque de Bomberos', 'Parque')} → ${r.t.destino.nombre}`,
            texto: `Elegiste uno que falla: ${motivoEnFrase(r.elegida.motivo)}. El bueno: ${r.t.opciones[r.t.correcta].texto}`,
            enlace: r.t.destino.enlace,
          })),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: () => partida(ctx) }, 'Jugar otra vez'),
        crear('button', { class: 'boton secundario', onclick: ctx.portada }, 'Volver'),
      ),
    )
  }

  siguiente()
}
