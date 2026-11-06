// "Paso a paso" (paso 3.3): un trayecto desde un parque de bomberos, cruce a cruce. En cada cruce en el que el camino
// bueno cambia de calle se elige por dónde seguir; si se falla, se dice por qué (en contra dirección, giro prohibido o
// no es el mejor camino) y se sigue por el bueno. Los cruces salen de crucesPasoAPaso (src/trayectos-datos.js).
import { apuntar } from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { elegir } from '../donde-datos.js'
import { crucesPasoAPaso, haciaDonde, motivoEnFrase, nombreCorto, textoItinerario, textoKm } from '../trayectos-datos.js'
import { apuntarSitio, botonNota, cifra, coleccion, guardarEstado, leerEstado, linea, paraRepasar, punto, ROJO, VERDE } from './comun.js'
import { ajustesTrayecto, baseTrayectos, origenYDestino, parejasTrayecto, siguienteTrayecto } from './trayectos.js'

const CLAVE = 'callejero-paso-a-paso'
const AZUL = '#1565c0'
const GRIS = '#8a8079'
// items: { "norte>l:ID": { bien, total, fallo } } (bien = trayecto hecho sin fallar ningún cruce); cruces: [bien, total]
const estado = leerEstado(CLAVE, { ajustes: { tipo: 'mezcla', zona: 'Todos', desde: 'ambos' }, items: {}, partidas: 0, cruces: [0, 0] })
const guardar = () => guardarEstado(CLAVE, estado)
const parqueCorto = (t) => t.parque.nombre.replace('Parque de Bomberos', 'Parque')

export const juegoPasoAPaso = {
  tarjeta(ctx) {
    const lista = parejasTrayecto(ctx, estado.ajustes)
    const ids = new Set(lista.map((p) => p.id))
    const perfectos = Object.entries(estado.items).filter(([id, item]) => ids.has(id) && item.bien > 0).length
    const [bien, total] = estado.cruces
    const cambiar = (cambio) => {
      Object.assign(estado.ajustes, cambio)
      guardar()
      ctx.portada()
    }
    return crear(
      'section',
      { class: 'tarjeta modo-test' },
      crear('h2', {}, 'Paso a paso'),
      crear(
        'p',
        {},
        'Un trayecto desde un parque de bomberos, cruce a cruce: en cada cruce eliges por qué calle sigues. ' +
          'Si te equivocas, te dice por qué y sigues por el camino bueno.',
      ),
      ajustesTrayecto(estado.ajustes, cambiar),
      crear(
        'div',
        { class: 'cifras' },
        cifra(total ? `${Math.round((100 * bien) / total)} %` : '—', 'cruces bien'),
        cifra(miles(perfectos), 'sin fallos'),
        cifra(miles(estado.partidas), 'trayectos'),
      ),
      lista.length > 0
        ? crear('button', { class: 'boton grande', onclick: () => partida(ctx) }, 'Jugar')
        : crear('p', { class: 'hecho' }, 'No hay nada que preguntar con estos ajustes.'),
    )
  },
}

async function partida(ctx) {
  const { arriba, abajo } = ctx
  const cola = elegir(parejasTrayecto(ctx, estado.ajustes), 30, (p) => estado.items[p.id]?.fallo)
  const resultados = []
  let t = null
  let cruces = []
  let respondida = true

  await ctx.abrirMapa({
    tecla(e) {
      const n = Number(e.key)
      if (!respondida && n >= 1 && n <= (cruces[resultados.length]?.opciones.length ?? 0)) responder(n - 1)
      else if (respondida && t && e.key === 'Enter') {
        e.preventDefault()
        siguiente()
      }
    },
  })

  const aciertos = () => resultados.filter((r) => r.acierto).length
  const marcador = crear('span')
  const pintarMarcador = (numero) => (marcador.textContent = `Cruce ${numero} de ${cruces.length} · ${aciertos()} bien`)
  const barra = () => crear('div', { class: 'barra-sesion' }, crear('button', { class: 'enlace-discreto', onclick: ctx.portada }, '← Salir'), marcador)

  // Busca un trayecto con algún cruce en el que elegir
  rellenar(abajo, crear('p', {}, 'Calculando el trayecto…'))
  while (!cruces.length) {
    t = await siguienteTrayecto(ctx, cola)
    if (!t) return ctx.portada()
    cruces = crucesPasoAPaso(baseTrayectos(ctx), t)
  }

  const siguiente = () => (resultados.length === cruces.length ? final() : cruce())

  // El camino hecho hasta el cruce, el cruce, el parque y el destino; y, al contestar, las calles del cruce
  function dibujar(c, calles = []) {
    ctx.ponerDatos(
      'juego-respuesta',
      coleccion([
        ...origenYDestino(ctx, t),
        ...calles,
        linea(c.hecho, { nombre: '', color: AZUL }),
        punto(c.punto, { nombre: '', color: AZUL, radio: 8 }),
      ]),
    )
  }
  const encuadrar = (c) => ctx.encuadrar([c.punto, ...c.hecho.slice(-12), ...c.opciones.flatMap((o) => o.linea)], { holgura: 60 })

  function cruce() {
    const c = cruces[resultados.length]
    respondida = false
    ctx.limpiar()
    pintarMarcador(resultados.length + 1)
    const destino = haciaDonde(c.punto, t.llegada)
    rellenar(
      arriba,
      barra(),
      crear('p', { class: 'ficha-tipo' }, `Paso a paso desde el ${parqueCorto(t)}`),
      crear('h2', {}, `Hasta ${t.destino.nombre}`),
      crear('p', { class: 'ficha-nota' }, `Vas por ${nombreCorto(c.calle)}. El destino queda a ${textoKm(destino.metros)} ${destino.rumbo}.`),
    )
    dibujar(c)
    rellenar(
      abajo,
      crear('p', { class: 'ficha-nota' }, '¿Por dónde sigues?'),
      crear(
        'div',
        { class: 'opciones-examen' },
        c.opciones.map((o, i) =>
          crear('button', { class: 'opcion-examen', onclick: () => responder(i) }, crear('span', { class: 'letra' }, i + 1), crear('span', {}, o.texto)),
        ),
      ),
    )
    encuadrar(c)
  }

  function responder(i) {
    if (respondida) return
    respondida = true
    const c = cruces[resultados.length]
    const elegida = c.opciones[i]
    const buena = c.opciones[c.buena]
    const acierto = i === c.buena
    resultados.push({ c, elegida, acierto })
    pintarMarcador(resultados.length)
    apuntar([{ tema: 'trayectos', acierto }])

    // Cada calle del cruce con su nombre: la buena en verde, la elegida (si estaba mal) en rojo y el resto en gris
    const color = (j) => (j === c.buena ? VERDE : j === i ? ROJO : GRIS)
    const encima = { [GRIS]: 0, [ROJO]: 1, [VERDE]: 2 } // la buena se dibuja la última, encima de las demás
    const orden = c.opciones.map((_, j) => j).sort((a, b) => encima[color(a)] - encima[color(b)])
    // El nombre va al final de cada calle: sobre trozos tan cortos no cabe escrito a lo largo
    dibujar(
      c,
      orden.flatMap((j) => {
        const o = c.opciones[j]
        return [linea(o.linea, { nombre: '', color: color(j) }), punto(o.linea.at(-1), { nombre: nombreCorto(o.calle), color: color(j), radio: 4 })]
      }),
    )
    const ultima = resultados.length === cruces.length
    rellenar(
      abajo,
      crear(
        'div',
        { class: 'resultado-juego' },
        botonNota(() => ({
          modo: 'Paso a paso',
          pregunta: `${t.enunciado} Cruce: vas por ${c.calle}.`,
          respuesta: buena.texto,
          elegida: elegida.texto,
          opciones: c.opciones.map((o) => o.texto),
          id: `paso:${t.id}:${resultados.length}`,
          enlace: t.destino.enlace,
        })),
        crear('p', { class: acierto ? 'acierto' : 'fallo' }, acierto ? `¡Bien! ${buena.texto}.` : `No: ${motivoEnFrase(elegida.motivo)}.`),
        !acierto && crear('p', { class: 'ficha-nota' }, `El camino bueno: ${buena.texto}.`),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: siguiente }, ultima ? 'Ver el resultado' : 'Seguir'),
      ),
    )
    encuadrar(c)
  }

  let terminada = false
  function final() {
    if (terminada) return // por si se pulsa dos veces «Ver el resultado»
    terminada = true
    const bien = aciertos()
    const fallos = resultados.length - bien
    estado.partidas++
    estado.cruces = [estado.cruces[0] + bien, estado.cruces[1] + resultados.length]
    apuntarSitio(estado.items, t.id, fallos === 0, { fallo: fallos > 0 })
    guardar()
    ctx.verPagina()
    rellenar(
      ctx.pagina,
      crear('h1', {}, fallos ? 'Resultado' : '¡Sin fallos!'),
      crear(
        'section',
        { class: 'tarjeta resumen-repaso' },
        crear('p', {}, crear('strong', {}, `${parqueCorto(t)} → ${t.destino.nombre}`)),
        crear(
          'div',
          { class: 'cifras' },
          cifra(`${bien}/${resultados.length}`, 'cruces bien'),
          cifra(textoKm(t.ruta.metros), 'de camino'),
          cifra(miles(estado.partidas), 'trayectos'),
        ),
        crear('p', { class: 'ficha-nota' }, `El camino: ${textoItinerario(t.partes)}.`),
      ),
      paraRepasar(
        resultados
          .filter((r) => !r.acierto)
          .map((r) => ({
            nombre: `Yendo por ${nombreCorto(r.c.calle)}`,
            texto: `Elegiste «${r.elegida.texto}»: ${motivoEnFrase(r.elegida.motivo)}. Era «${r.c.opciones[r.c.buena].texto}».`,
            enlace: t.destino.enlace,
          })),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', onclick: () => partida(ctx) }, 'Otro trayecto'),
        crear('button', { class: 'boton secundario', onclick: ctx.portada }, 'Volver'),
      ),
    )
  }

  cruce()
}
