// "Dibuja el trayecto" (paso 3.4, trayectos en modo dibujo): desde un parque de bomberos hasta un lugar o una calle,
// se dibuja el camino en el mapa sin nombres tocando, calle a calle, por dónde se sigue y hasta dónde. Al llegar,
// la app lo corrige: si se puede ir así (sin ir en contra dirección ni hacer giros prohibidos) y cuánto más largo es
// que el mejor camino. Los cálculos están en src/trayectos-datos.js (trayectoParaDibujar, avanzarDibujo,
// evaluarDibujo).
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { elegir } from '../donde-datos.js'
import { itinerario, lineaDeRuta } from '../rutas.js'
import {
  avanzarDibujo,
  evaluarDibujo,
  lineasDeItinerario,
  lineasEnContra,
  metrosHastaDestino,
  motivoEnFrase,
  textoItinerario,
  textoKm,
  trayectoParaDibujar,
  tramoTocado,
} from '../trayectos-datos.js'
import { apuntarSitio, botonNota, cifra, coleccion, guardarEstado, leerEstado, linea, paraRepasar, punto, ROJO, VERDE } from './comun.js'
import { ajustesTrayecto, baseTrayectos, origenYDestino, parejasTrayecto } from './trayectos.js'

const CLAVE = 'callejero-dibujo'
export const DIBUJOS_POR_PARTIDA = 3
const AZUL = '#1565c0'
const DEDO_PX = 22 // lo que se tolera entre el dedo y la calle, en píxeles de pantalla
export const DISTANCIAS = [
  { id: 'todas', nombre: 'Cerca o lejos' },
  { id: 'corta', nombre: 'Cortos (a menos de 2 km)', max: 2000 },
  { id: 'media', nombre: 'Medianos (de 2 a 4 km)', min: 2000, max: 4000 },
  { id: 'larga', nombre: 'Largos (a más de 4 km)', min: 4000 },
]
// items: { "norte>l:ID": { bien, total, fallo } }; récord (puntos de una partida) por ajustes
const estado = leerEstado(CLAVE, { ajustes: { tipo: 'mezcla', zona: 'Todos', desde: 'ambos', distancia: 'corta' }, records: {}, items: {}, partidas: 0 })
const modalidad = () => `${estado.ajustes.tipo}|${estado.ajustes.zona}|${estado.ajustes.desde}|${estado.ajustes.distancia}`
const guardar = () => guardarEstado(CLAVE, estado)
const parqueCorto = (t) => t.parque.nombre.replace('Parque de Bomberos', 'Parque')

// Las parejas [parque, destino] de los ajustes que están a la distancia pedida (en línea recta desde el parque)
function candidatos(ctx) {
  const d = DISTANCIAS.find((x) => x.id === estado.ajustes.distancia) ?? DISTANCIAS[0]
  return parejasTrayecto(ctx, estado.ajustes).filter((p) => {
    if (!d.min && !d.max) return true
    const m = metrosHastaDestino(baseTrayectos(ctx), p.parque, p.destino)
    return m >= (d.min ?? 0) && m < (d.max ?? Infinity)
  })
}

// Metros de un punto a la línea más cercana de unas calles peatonales (para avisar si se toca una)
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540
function metrosALinea(p, l) {
  let mejor = Infinity
  for (let i = 1; i < l.length; i++) {
    const [ax, ay] = [(l[i - 1][0] - p[0]) * M_LON, (l[i - 1][1] - p[1]) * M_LAT]
    const [dx, dy] = [(l[i][0] - l[i - 1][0]) * M_LON, (l[i][1] - l[i - 1][1]) * M_LAT]
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
    mejor = Math.min(mejor, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return mejor
}
let peatonales = null
const peatonalCerca = (ctx, p, max) =>
  (peatonales ??= ctx.datos.tramos.features.filter((f) => f.properties.sentido === 'peatonal').map((f) => f.geometry.coordinates)).some(
    (l) => metrosALinea(p, l) <= max,
  )

export const juegoDibujo = {
  tarjeta(ctx) {
    const lista = candidatos(ctx)
    const ids = new Set(lista.map((p) => p.id))
    const perfectos = Object.entries(estado.items).filter(([id, item]) => ids.has(id) && item.bien > 0).length
    const record = estado.records[modalidad()]
    const cambiar = (cambio) => {
      Object.assign(estado.ajustes, cambio)
      guardar()
      ctx.portada()
    }
    const ajustes = ajustesTrayecto(estado.ajustes, cambiar)
    ajustes.append(
      crear(
        'select',
        { 'aria-label': 'Distancia', onchange: (e) => cambiar({ distancia: e.target.value }) },
        DISTANCIAS.map((d) => crear('option', { value: d.id, selected: d.id === estado.ajustes.distancia }, d.nombre)),
      ),
    )
    return crear(
      'section',
      { class: 'tarjeta modo-test' },
      crear('h2', {}, 'Dibuja el trayecto'),
      crear(
        'p',
        {},
        'Desde un parque de bomberos hasta un lugar o una calle: dibujas tú el camino en el mapa sin nombres, tocando calle a calle por dónde sigues. ' +
          `Al llegar se compara con el mejor camino. Son ${DIBUJOS_POR_PARTIDA} trayectos por partida.`,
      ),
      ajustes,
      crear(
        'div',
        { class: 'cifras' },
        cifra(record === undefined ? '—' : `${record}/${DIBUJOS_POR_PARTIDA * 100}`, 'tu récord'),
        cifra(miles(perfectos), 'bien hechos'),
        cifra(miles(estado.partidas), 'partidas'),
      ),
      lista.length > 0
        ? crear('button', { class: 'boton grande', onclick: () => partida(ctx) }, 'Jugar')
        : crear('p', { class: 'hecho' }, 'No hay nada que preguntar con estos ajustes.'),
      crear('p', { class: 'ficha-nota' }, 'Consejo: empieza por trayectos cortos. Puedes acercar y mover el mapa mientras dibujas.'),
    )
  },
}

async function partida(ctx) {
  const { arriba, abajo } = ctx
  const base = baseTrayectos(ctx)
  const cola = elegir(candidatos(ctx), DIBUJOS_POR_PARTIDA * 8, (p) => estado.items[p.id]?.fallo)
  const resultados = []
  let t = null
  let movimientos = [] // cada toque que avanza el dibujo: los pasos que añade
  let terminado = false
  let terminada = false
  const pasos = () => movimientos.flat()

  await ctx.abrirMapa({
    tocar: (coordenadas) => tocar(coordenadas),
    tecla(e) {
      if (terminado && e.key === 'Enter') {
        e.preventDefault()
        siguiente()
      } else if (!terminado && (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey)))) {
        e.preventDefault()
        deshacer()
      }
    },
  })

  const puntos = () => resultados.reduce((s, r) => s + r.evaluacion.puntos, 0)
  const marcador = crear('span')
  const pintarMarcador = () =>
    (marcador.textContent = `${Math.min(resultados.length + (terminado ? 0 : 1), DIBUJOS_POR_PARTIDA)} de ${DIBUJOS_POR_PARTIDA} · ${puntos()} puntos`)
  const aviso = crear('p', { class: 'aviso-dibujo', 'aria-live': 'polite' })
  const recorrido = crear('p', { class: 'recorrido-dibujo' })

  async function siguiente() {
    if (resultados.length === DIBUJOS_POR_PARTIDA) return final()
    rellenar(abajo, crear('p', {}, 'Buscando un trayecto…'))
    t = null
    while (!t && cola.length) {
      const { parque, destino } = cola.shift()
      await new Promise((listo) => setTimeout(listo, 0))
      t = trayectoParaDibujar(base, parque, destino)
    }
    if (!t) return resultados.length ? final() : ctx.portada()
    movimientos = []
    terminado = false
    pintarMarcador()
    rellenar(
      arriba,
      crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: ctx.portada }, '← Salir'), marcador),
      crear('p', { class: 'ficha-tipo' }, `Dibuja el trayecto desde el ${parqueCorto(t)}`),
      crear('h2', {}, `Hasta ${t.destino.nombre}`),
      t.destino.detalle && crear('p', { class: 'ficha-nota' }, t.destino.clase === 'lugar' ? t.destino.detalle : `Barrio ${t.destino.detalle}`),
    )
    aviso.textContent = 'Toca la calle por la que sales del parque y hasta dónde vas por ella. Luego, cada calle por la que sigues.'
    aviso.className = 'aviso-dibujo'
    pintarDibujo()
    // El parque y el destino a la vista
    ctx.encuadrar(
      origenYDestino(ctx, t).flatMap((f) => (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates)),
      { holgura: 40 },
    )
  }

  // El camino dibujado hasta ahora (en azul), dónde se está y el panel de abajo con las calles y los botones
  function pintarDibujo() {
    const ps = pasos()
    const actual = ps.length ? ps.at(-1).tramo : null
    const aqui = ps.length ? base.red.nodos[ps.at(-1).hacia] : null
    const dibujada = ps.length ? itinerarioLinea(ps) : null
    ctx.ponerDatos(
      'juego-respuesta',
      coleccion([
        ...origenYDestino(ctx, t),
        ...(dibujada ? [dibujada] : []),
        ...(aqui && actual ? [punto(aqui, { nombre: '', color: AZUL, radio: 7 })] : []),
      ]),
    )
    recorrido.textContent = ps.length ? `Tu camino: ${textoItinerario(itinerario({ pasos: ps }))}` : ''
    rellenar(
      abajo,
      aviso,
      recorrido,
      crear(
        'div',
        { class: 'acciones-dibujo' },
        crear('button', { class: 'boton secundario', disabled: !movimientos.length, onclick: deshacer }, '↩ Deshacer'),
        crear('button', { class: 'boton secundario', disabled: !movimientos.length, onclick: borrar }, 'Empezar de nuevo'),
        crear('button', { class: 'boton secundario', onclick: rendirse }, 'Me rindo'),
      ),
    )
  }
  const lineaDe = (ps) => lineaDeRuta({ pasos: ps })
  const itinerarioLinea = (ps) => linea(lineaDe(ps), { nombre: '', color: AZUL })

  function tocar(coordenadas) {
    if (!t || terminado) return
    const tolerancia = DEDO_PX * ctx.metrosPorPixel()
    const tocado = tramoTocado(base, coordenadas, tolerancia)
    const peatonal = peatonalCerca(ctx, coordenadas, Math.min(tolerancia, tocado?.metros ?? tolerancia))
    if (peatonal && (!tocado || tocado.metros > 4)) return avisar('Esa calle es peatonal: por ahí no se puede ir en coche.', true)
    if (!tocado) return avisar('Toca encima de una calle (puedes acercar el mapa).', true)
    const r = avanzarDibujo(base, t, pasos(), tocado)
    if (r.error) return avisar(r.error, true)
    // Si se había pasado del cruce donde gira, se quita lo que sobra del final
    for (let quitar = r.recortar ?? 0; quitar > 0 && movimientos.length; ) {
      const ultimo = movimientos.at(-1)
      if (ultimo.length <= quitar) {
        quitar -= ultimo.length
        movimientos.pop()
      } else {
        movimientos[movimientos.length - 1] = ultimo.slice(0, ultimo.length - quitar)
        quitar = 0
      }
    }
    movimientos.push(r.pasos)
    aviso.className = 'aviso-dibujo'
    aviso.textContent = r.llegado ? '' : r.recortar ? 'Te habías pasado del cruce: vuelvo a él para girar. Sigue.' : 'Sigue: toca la siguiente calle.'
    if (r.llegado) corregir()
    else pintarDibujo()
  }

  function avisar(texto, error = false) {
    aviso.textContent = texto
    aviso.className = error ? 'aviso-dibujo aviso-error' : 'aviso-dibujo'
  }

  function deshacer() {
    if (terminado || !movimientos.length) return
    movimientos.pop()
    avisar(movimientos.length ? 'Deshecho. Toca la siguiente calle.' : 'Toca la calle por la que sales del parque.')
    pintarDibujo()
  }

  function borrar() {
    if (terminado) return
    movimientos = []
    avisar('Toca la calle por la que sales del parque.')
    pintarDibujo()
  }

  function rendirse() {
    if (terminado) return
    corregir(true)
  }

  // Corrige lo dibujado (o enseña la solución si se rinde): el mejor camino en verde con sus nombres, el dibujado en
  // azul y, en rojo, los trozos en contra dirección
  function corregir(rendido = false) {
    terminado = true
    const ps = pasos()
    const e = rendido
      ? { vale: false, calidad: 'rendido', puntos: 0, errores: [], sinRevisar: [], metros: 0, mejor: t.ruta.metros, texto: '' }
      : evaluarDibujo(base, t, ps)
    const acierto = e.calidad === 'perfecto' || e.calidad === 'bien'
    resultados.push({ t, evaluacion: e, rendido })
    apuntar([{ tema: 'trayectos', acierto }])
    apuntarSitio(estado.items, t.id, acierto, { fallo: !acierto })
    guardar()
    pintarMarcador()

    const bueno = lineasDeItinerario(t).map((p) => linea(p.linea, { nombre: p.calle, color: VERDE }))
    const tuyo = ps.length ? [itinerarioLinea(ps)] : []
    const mal = lineasEnContra(ps).map((l) => linea(l, { nombre: '', color: ROJO }))
    ctx.ponerDatos('juego-respuesta', coleccion([...bueno, ...tuyo, ...mal, ...origenYDestino(ctx, t).filter((f) => f.geometry.type === 'Point')]))
    ctx.encuadrar([...t.linea, ...(ps.length ? lineaDe(ps) : [])], { holgura: 30 })

    const titulo = {
      perfecto: '¡Perfecto! Es el mejor camino.',
      bien: `¡Bien! Se puede ir así: ${textoKm(e.metros - e.mejor)} más que el mejor.`,
      rodeo: `Llegas, pero das un rodeo: ${textoKm(e.metros)} en vez de ${textoKm(e.mejor)}.`,
      mal: `No vale: ${e.errores.map((x) => motivoEnFrase(x.texto)).join('; ')}.`,
      rendido: 'Este es el mejor camino.',
    }[e.calidad]
    const ultima = resultados.length === DIBUJOS_POR_PARTIDA
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        botonNota(() => ({
          modo: 'Dibuja el trayecto',
          pregunta: `Dibujar el trayecto desde el ${t.parque.nombre} hasta ${t.hasta}`,
          respuesta: textoItinerario(t.partes),
          elegida: e.texto || '(se rindió)',
          id: `dibujo:${t.id}`,
          enlace: t.destino.enlace,
        })),
        crear('p', { class: acierto ? 'acierto' : 'fallo' }, titulo),
        crear('p', { class: 'ficha-nota' }, `${e.puntos} puntos. En verde, el mejor camino (${textoKm(e.mejor)}); en azul, el tuyo${e.errores.some((x) => x.tipo === 'contra') ? '; en rojo, lo que va en contra dirección' : ''}.`),
        e.sinRevisar.length > 0 &&
          crear('p', { class: 'ficha-nota' }, `Pasas por trozos con el sentido por revisar (${e.sinRevisar.join(', ')}): no cuentan como fallo.`),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: siguiente }, ultima ? 'Ver el resultado' : 'Siguiente'),
        crear('a', { class: 'boton secundario', href: t.destino.enlace }, 'Ver en el mapa'),
      ),
      crear(
        'details',
        { class: 'opciones-plegadas' },
        crear('summary', {}, 'Ver los dos caminos calle a calle'),
        e.texto && crear('p', {}, crear('strong', {}, 'El tuyo: '), e.texto),
        crear('p', {}, crear('strong', {}, 'El mejor: '), textoItinerario(t.partes)),
      ),
    )
  }

  function final() {
    if (terminada) return // por si se pulsa dos veces «Ver el resultado»
    terminada = true
    const total = puntos()
    const anterior = estado.records[modalidad()] ?? 0
    estado.records[modalidad()] = Math.max(total, anterior)
    estado.partidas++
    guardar()
    ctx.verPagina()
    rellenar(
      ctx.pagina,
      crear('h1', {}, total === DIBUJOS_POR_PARTIDA * 100 ? '¡Pleno!' : 'Resultado'),
      crear(
        'section',
        { class: 'tarjeta resumen-repaso' },
        crear(
          'div',
          { class: 'cifras' },
          cifra(`${total}/${DIBUJOS_POR_PARTIDA * 100}`, 'puntos'),
          cifra(`${Math.max(total, anterior)}`, 'tu récord'),
          cifra(miles(estado.partidas), 'partidas'),
        ),
        crear('p', { class: 'ficha-nota' }, total > anterior ? '¡Nuevo récord!' : `Tu récord: ${anterior} puntos`),
      ),
      paraRepasar(
        resultados
          .filter((r) => r.evaluacion.calidad !== 'perfecto')
          .map((r) => ({
            nombre: `${parqueCorto(r.t)} → ${r.t.destino.nombre}`,
            texto: `${r.rendido ? 'Te rendiste' : r.evaluacion.vale ? `${textoKm(r.evaluacion.metros - r.evaluacion.mejor)} más que el mejor` : r.evaluacion.errores.map((x) => x.texto).join('; ')}. El mejor: ${textoItinerario(r.t.partes)}`,
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
