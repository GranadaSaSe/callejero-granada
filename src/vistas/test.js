// Test tipo examen (paso 1.7): preguntas a, b, c por temas (tres respuestas, como en el examen de 2025), con penalización por fallo y nota sobre
// 10, como en la oposición. Se puede dejar en blanco, marcar dudosas y volver atrás. Al entregar se ve la
// corrección de cada pregunta con su explicación y un enlace al mapa.
// Simulacro de examen (paso 3.6): 55 preguntas de todos los temas (50 que cuentan y 5 de reserva al final),
// 50 minutos y penalización de 1/3 o 1/2. Análisis de dudosas (paso 3.7): al entregar, la nota con y sin las
// dudosas contestadas; en la portada, cuántas de las dudosas que contestas aciertas y si te compensa.
// Banco de exámenes reales (paso 3.5): las preguntas de callejero y carreteras de 2020, 2022 y 2025
// (src/examenes-reales.js), con la misma corrección.
import { apuntar } from '../actividad.js'
import { crear, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import { DISTRITOS, ejesActuales } from '../ejes-lista.js'
import { corregir, crearExamen, NIVELES, TEMAS } from '../examen-datos.js'
import { EXAMENES_REALES, preguntasReales } from '../examenes-reales.js'
import { clavesNombre } from '../../scripts/lib/nombres.mjs'
import { prepararTrayectos } from '../trayectos-datos.js'
import { buscadorDeReferencias, notaAbierta, notaDePregunta } from '../nota-pregunta.js'
import { calificar } from '../repaso.js'

const CLAVES = {
  ajustes: 'callejero-examen-ajustes',
  historial: 'callejero-examen-historial',
  estados: 'callejero-tarjetas', // el mismo progreso que las tarjetas de repaso
}
const PENALIZACIONES = [
  [0, 'Los fallos no restan'],
  [1 / 3, 'Cada fallo resta 1/3'],
  [1 / 2, 'Cada fallo resta 1/2'],
]
const TEXTO_PENALIZACION = new Map([
  [0, '0'],
  [1 / 3, '1/3'],
  [1 / 2, '1/2'],
])
const LETRAS = ['a', 'b', 'c', 'd'] // el examen tiene tres (a, b, c); la d solo por si acaso
const NOMBRE_TEMA = Object.fromEntries(TEMAS.map((t) => [t.id, t.nombre]))
const SEGUNDOS_POR_PREGUNTA = 60 // 50 minutos para 50 preguntas, como en el examen de 2025
const SIMULACRO = { cuentan: 50, reserva: 5, segundos: 50 * 60 }
// Con una penalización p, contestar una dudosa compensa si se acierta más de p / (1 + p) de las veces
const UMBRAL_DUDOSAS = (p) => p / (1 + p)
const porcentaje = (x) => `${Math.round(x * 100)} %`

function leer(clave, porDefecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? porDefecto
  } catch {
    return porDefecto
  }
}

function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Sin almacenamiento (modo privado): se pierde al cerrar la app
  }
}

const nota = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const textoReloj = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const fecha = (iso) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Preparando el test…'))
  contenedor.append(pagina)
  const [calles, lugares, municipios, salidas, poligonos, redes, altos, nucleos, rumbos] = await Promise.all(
    ['calles', 'lugares', 'municipios', 'salidas', 'poligonos', 'redes', 'altos', 'nucleos', 'rumbos'].map(cargar),
  )
  // Zona de los parques de Granada (paso 2.5), con sus polígonos y el tipo de red de cada carretera (paso 3.5)
  const zona = { municipios, salidas, poligonos, redes, nucleos, rumbos }
  const ajustes = {
    temas: TEMAS.map((t) => t.id),
    nivel: 'medio',
    distrito: 'Todos',
    total: 20,
    penalizacion: 1 / 3,
    conTiempo: false,
    penalizacionSimulacro: 1 / 3,
    nivelSimulacro: 'medio',
    ...leer(CLAVES.ajustes, {}),
  }
  // Un tema que no existía cuando se guardaron los ajustes sale ya marcado (el de la zona llegó en el paso 2.5)
  const conocidos = ajustes.temasConocidos ?? ['zonas', 'extremos', 'sentido', 'cruces', 'lugares']
  for (const t of TEMAS) if (!conocidos.includes(t.id) && !ajustes.temas.includes(t.id)) ajustes.temas.push(t.id)
  ajustes.temasConocidos = TEMAS.map((t) => t.id)
  let pantalla = 'portada'
  let teclas = null // atajos de teclado mientras se hace el test
  let temporizador = null
  const subir = () => contenedor.closest('.vistas')?.scrollTo(0, 0)
  const referenciaDe = buscadorDeReferencias(calles, lugares)

  // Enlace al mapa de lo que nombra una pregunta de examen real: una calle, un lugar, un polígono, un pueblo o una
  // carretera (se busca por su nombre)
  const porClave = new Map()
  const anadirClave = (nombre, enlace) => {
    for (const k of clavesNombre(nombre)) if (!porClave.has(k)) porClave.set(k, enlace)
  }
  for (const c of calles) anadirClave(c.nombre, `#/mapa?calle=${c.id}`)
  for (const l of lugares) anadirClave(l.nombre, `#/mapa?lugar=${l.id}`)
  for (const p of poligonos.filter((x) => x.punto)) anadirClave(p.nombre, `#/mapa?lugar=${p.id}`)
  for (const f of municipios.features) anadirClave(f.properties.nombre, `#/mapa?pueblo=${encodeURIComponent(f.properties.nombre)}`)
  const enlaceDe = (nombre) =>
    /^(A|N|GR)-\d/.test(nombre) ? `#/mapa?carretera=${encodeURIComponent(nombre)}` : (porClave.get(clavesNombre(nombre)[0]) ?? null)

  // Botón "✎ Nota" de cada pregunta: sugerencias o quejas que van a Inicio → Notas
  const botonNota = (p, elegida, pausa, modo = 'Test tipo examen') =>
    crear(
      'button',
      {
        class: 'boton-nota',
        title: 'Dejar una nota sobre esta pregunta',
        onclick: () =>
          notaDePregunta(
            {
              modo,
              pregunta: p.pregunta,
              respuesta: p.opciones[p.correcta],
              opciones: p.opciones,
              elegida: elegida == null ? null : p.opciones[elegida],
              id: p.id,
              enlace: p.enlace,
              ...referenciaDe(p.enlace),
            },
            pausa,
          ),
      },
      '✎ Nota',
    )

  const cambiarAjuste = (cambio) => {
    Object.assign(ajustes, cambio)
    guardar(CLAVES.ajustes, ajustes)
    portada()
  }

  function portada() {
    pantalla = 'portada'
    teclas = null
    clearInterval(temporizador)
    const historial = leer(CLAVES.historial, [])
    const desplegable = (etiqueta, valor, opciones, alCambiar) =>
      crear(
        'label',
        { class: 'campo' },
        etiqueta,
        crear(
          'select',
          { onchange: (e) => alCambiar(e.target.value) },
          opciones.map(([v, texto]) => crear('option', { value: v, selected: String(v) === String(valor) }, texto)),
        ),
      )

    // Análisis de dudosas (paso 3.7): lo apuntado en cada test
    const conDudosas = historial.filter((h) => h.dudosas?.contestadas > 0)
    const dudosasTotal = conDudosas.reduce(
      (s, h) => ({ contestadas: s.contestadas + h.dudosas.contestadas, bien: s.bien + h.dudosas.bien, aporte: s.aporte + h.dudosas.aporte }),
      { contestadas: 0, bien: 0, aporte: 0 },
    )
    const acierto = dudosasTotal.contestadas ? dudosasTotal.bien / dudosasTotal.contestadas : 0

    rellenar(
      pagina,
      crear('h1', {}, 'Test tipo examen'),
      crear(
        'section',
        { class: 'tarjeta tarjeta-simulacro' },
        crear('h2', {}, 'Simulacro de examen'),
        crear(
          'p',
          {},
          `Como el día del examen: ${SIMULACRO.cuentan + SIMULACRO.reserva} preguntas de todos los temas y de toda Granada ` +
            `(${SIMULACRO.cuentan} que cuentan y ${SIMULACRO.reserva} de reserva al final), ${SIMULACRO.segundos / 60} minutos y nota sobre 10.`,
        ),
        desplegable(
          'Penalización',
          ajustes.penalizacionSimulacro,
          PENALIZACIONES.filter(([p]) => p > 0),
          (v) => cambiarAjuste({ penalizacionSimulacro: PENALIZACIONES.find(([p]) => String(p) === v)[0] }),
        ),
        desplegable('Calles', ajustes.nivelSimulacro, NIVELES.map((n) => [n.id, n.nombre]), (v) => cambiarAjuste({ nivelSimulacro: v })),
        crear('button', { class: 'boton grande', onclick: empezarSimulacro }, 'Empezar el simulacro'),
        crear(
          'p',
          { class: 'ficha-nota' },
          'Las de reserva no cuentan para la nota: en el examen solo sustituyen a las preguntas que se anulen. Se contestan igual.',
        ),
      ),
      // Banco de exámenes reales (paso 3.5)
      crear(
        'section',
        { class: 'tarjeta' },
        crear('h2', {}, 'Exámenes de otros años'),
        crear(
          'p',
          {},
          'Las preguntas de callejero y carreteras de los exámenes reales (sin las de vehículos y mecánica), con su corrección. ' +
            'En 2022 no hay plantilla: las respuestas están calculadas con los datos de la app.',
        ),
        crear(
          'div',
          { class: 'acciones-eje' },
          EXAMENES_REALES.map((e) =>
            crear('button', { class: 'boton secundario', onclick: () => empezarReal([e.anio]) }, `${e.anio} (${e.preguntas.length})`),
          ),
          crear(
            'button',
            { class: 'boton secundario', onclick: () => empezarReal(EXAMENES_REALES.map((e) => e.anio)) },
            `Todos mezclados (${EXAMENES_REALES.reduce((s, e) => s + e.preguntas.length, 0)})`,
          ),
        ),
        crear('p', { class: 'ficha-nota' }, 'Se corrige con la penalización y el tiempo que elijas abajo, en «Test a tu medida».'),
      ),
      crear('h2', {}, 'Test a tu medida'),
      crear(
        'p',
        { class: 'intro' },
        'Preguntas con tres respuestas (a, b, c) y una sola buena, como en el examen. Puedes dejar preguntas en blanco, ' +
          'marcarlas como dudosas y volver atrás antes de entregar. La nota se calcula como en el examen.',
      ),
      crear(
        'section',
        { class: 'tarjeta' },
        crear('h2', {}, 'Temas'),
        ...TEMAS.map((t) =>
          crear(
            'label',
            { class: 'casilla' },
            crear('input', {
              type: 'checkbox',
              checked: ajustes.temas.includes(t.id),
              onchange: (e) =>
                cambiarAjuste({ temas: e.target.checked ? [...ajustes.temas, t.id] : ajustes.temas.filter((x) => x !== t.id) }),
            }),
            t.nombre,
          ),
        ),
        desplegable('Calles', ajustes.nivel, NIVELES.map((n) => [n.id, n.nombre]), (v) => cambiarAjuste({ nivel: v })),
        desplegable(
          'Zona',
          ajustes.distrito,
          [['Todos', 'Todos los distritos'], ...DISTRITOS.map((d) => [d, d])],
          (v) => cambiarAjuste({ distrito: v }),
        ),
        desplegable('Preguntas', ajustes.total, [10, 20, 30, 50].map((n) => [n, `${n} preguntas`]), (v) => cambiarAjuste({ total: Number(v) })),
        desplegable(
          'Penalización',
          ajustes.penalizacion,
          PENALIZACIONES,
          (v) => cambiarAjuste({ penalizacion: PENALIZACIONES.find(([p]) => String(p) === v)[0] }),
        ),
        crear(
          'label',
          { class: 'casilla' },
          crear('input', { type: 'checkbox', checked: ajustes.conTiempo, onchange: (e) => cambiarAjuste({ conTiempo: e.target.checked }) }),
          'Con tiempo, como en el examen (50 minutos para 50 preguntas)',
        ),
        crear('button', { class: 'boton grande', disabled: !ajustes.temas.length, onclick: empezar }, 'Empezar el test'),
        crear(
          'p',
          { class: 'ficha-nota' },
          'Truco: con tres opciones y fallos que restan 1/2, contestar totalmente al azar no gana ni pierde de media; ' +
            'si puedes descartar una opción, ya compensa contestar. Con 1/3, contestar al azar ya gana un poco de media.',
        ),
      ),
      conDudosas.length > 0 &&
        crear(
          'section',
          { class: 'tarjeta' },
          crear('h2', {}, 'Tus dudosas'),
          crear(
            'p',
            {},
            `En tus últimos tests contestaste ${dudosasTotal.contestadas} preguntas que habías marcado como dudosas y acertaste ` +
              `${dudosasTotal.bien} (el ${porcentaje(acierto)}). En total te han ${dudosasTotal.aporte >= 0 ? 'sumado' : 'restado'} ` +
              `${nota(Math.abs(dudosasTotal.aporte))} puntos de nota.`,
          ),
          crear(
            'p',
            { class: acierto > UMBRAL_DUDOSAS(1 / 2) ? 'acierto-dudosas' : acierto > UMBRAL_DUDOSAS(1 / 3) ? null : 'fallo-dudosas' },
            acierto > UMBRAL_DUDOSAS(1 / 2)
              ? 'Te compensa contestarlas, tanto si los fallos restan 1/3 como si restan 1/2.'
              : acierto > UMBRAL_DUDOSAS(1 / 3)
                ? 'Te compensa contestarlas si los fallos restan 1/3, pero no si restan 1/2.'
                : 'Te iría mejor dejarlas en blanco: con lo que aciertas, restan más de lo que suman.',
          ),
          crear(
            'p',
            { class: 'ficha-nota' },
            `Contestar compensa si aciertas más del ${porcentaje(UMBRAL_DUDOSAS(1 / 3))} cuando los fallos restan 1/3, ` +
              `y más del ${porcentaje(UMBRAL_DUDOSAS(1 / 2))} cuando restan 1/2.`,
          ),
        ),
      historial.length > 0 && [
        crear('h2', {}, 'Tus últimos tests'),
        crear(
          'ul',
          { class: 'lista-notas' },
          historial.slice(0, 8).map((h) =>
            crear(
              'li',
              {},
              crear('strong', {}, `${h.simulacro ? 'Simulacro · ' : h.real ? `Examen de ${h.real.join(', ')} · ` : ''}Nota ${nota(h.nota)}`),
              crear('p', {}, `${h.aciertos} bien · ${h.fallos} mal · ${h.enBlanco} en blanco · ${h.total} preguntas`),
              crear('small', {}, `${fecha(h.fecha)} · fallos restan ${TEXTO_PENALIZACION.get(h.penalizacion) ?? h.penalizacion}`),
            ),
          ),
        ),
      ],
    )
    subir()
  }

  // La red de calles para los trayectos (paso 3.3) se carga solo si el tema está marcado
  let trayectos = null
  async function datosDelExamen(temas, boton) {
    const datos = { calles, lugares, ejes: ejesActuales(calles), zona, altos }
    if (!temas.includes('trayectos')) return datos
    if (boton) {
      boton.disabled = true
      boton.textContent = 'Calculando los trayectos…'
    }
    trayectos ??= prepararTrayectos({ red: await cargar('red'), calles, lugares })
    // Un respiro para que se vea el aviso antes de calcular (cada trayecto tarda un poco)
    await new Promise((listo) => setTimeout(listo, 30))
    return { ...datos, trayectos }
  }

  async function empezar(e) {
    const datos = await datosDelExamen(ajustes.temas, e?.currentTarget)
    const preguntas = crearExamen(datos, { temas: ajustes.temas, nivel: ajustes.nivel, distrito: ajustes.distrito, total: ajustes.total })
    if (preguntas.length) examen(preguntas)
  }

  // Exámenes reales (paso 3.5): sus preguntas en orden si es un año; mezcladas si son varios
  function empezarReal(anios) {
    let preguntas = preguntasReales(anios, enlaceDe)
    if (anios.length > 1) preguntas = preguntas.map((p) => [Math.random(), p]).sort((a, b) => a[0] - b[0]).map(([, p]) => p)
    if (preguntas.length) examen(preguntas, { real: anios })
  }

  // Simulacro (paso 3.6): todos los temas y toda Granada; las 5 últimas son de reserva
  async function empezarSimulacro(e) {
    const temas = TEMAS.map((t) => t.id)
    const datos = await datosDelExamen(temas, e?.currentTarget)
    const total = SIMULACRO.cuentan + SIMULACRO.reserva
    const preguntas = crearExamen(datos, { temas, nivel: ajustes.nivelSimulacro, distrito: 'Todos', total })
    if (preguntas.length) examen(preguntas, { simulacro: true })
  }

  function examen(preguntas, { simulacro = false, real = null } = {}) {
    pantalla = 'examen'
    const total = preguntas.length
    const respuestas = new Array(total).fill(null)
    const dudosas = new Set()
    let actual = 0
    // En el simulacro, las que pasan de 50 son de reserva
    const esReserva = (i) => simulacro && i >= SIMULACRO.cuentan
    const limite = simulacro ? SIMULACRO.segundos : ajustes.conTiempo ? total * SEGUNDOS_POR_PREGUNTA : null
    let inicio = Date.now()
    let pausaDesde = null // el reloj se para mientras se escribe una nota
    const ahora = () => pausaDesde ?? Date.now()
    const quedan = () => Math.max(0, limite - (ahora() - inicio) / 1000)
    const reloj = {
      alAbrir: () => (pausaDesde = Date.now()),
      alCerrar: () => {
        inicio += Date.now() - pausaDesde
        pausaDesde = null
      },
    }

    function pintar() {
      const p = preguntas[actual]
      const contestadas = respuestas.filter((r) => r !== null).length
      rellenar(
        pagina,
        crear(
          'div',
          { class: 'barra-sesion' },
          crear('button', { class: 'enlace-discreto', onclick: abandonar }, '← Salir'),
          crear('span', { class: 'reloj' }, limite ? `Quedan ${textoReloj(quedan())}` : `${contestadas} de ${total} contestadas`),
        ),
        crear(
          'article',
          { class: 'tarjeta-repaso' },
          botonNota(p, respuestas[actual], reloj),
          crear('p', { class: 'etiqueta' }, `Pregunta ${actual + 1} de ${total} · ${esReserva(actual) ? 'De reserva · ' : ''}${p.origen ?? NOMBRE_TEMA[p.tema]}`),
          esReserva(actual) && crear('p', { class: 'ficha-nota' }, 'Pregunta de reserva: no cuenta para la nota salvo que anulen alguna de las 50.'),
          crear('h2', { class: 'pregunta-tarjeta' }, p.pregunta),
          crear(
            'div',
            { class: 'opciones-examen' },
            p.opciones.map((texto, i) =>
              crear(
                'button',
                { class: 'opcion-examen', 'aria-pressed': String(respuestas[actual] === i), onclick: () => elegir(i) },
                crear('span', { class: 'letra' }, LETRAS[i]),
                crear('span', {}, texto),
              ),
            ),
          ),
          crear('p', { class: 'ficha-nota' }, 'Para dejarla en blanco, toca otra vez la opción elegida.'),
        ),
        crear(
          'div',
          { class: 'acciones-examen' },
          crear('button', { class: 'boton secundario', disabled: actual === 0, onclick: () => ir(actual - 1) }, '← Anterior'),
          crear(
            'button',
            { class: 'boton secundario', 'aria-pressed': String(dudosas.has(actual)), onclick: marcarDudosa },
            dudosas.has(actual) ? '★ Dudosa' : '☆ Dudosa',
          ),
          actual < total - 1
            ? crear('button', { class: 'boton', onclick: () => ir(actual + 1) }, 'Siguiente →')
            : crear('button', { class: 'boton', onclick: () => entregar() }, 'Entregar'),
        ),
        crear(
          'div',
          { class: 'mapa-preguntas', 'aria-label': 'Ir a una pregunta' },
          preguntas.map((_, i) =>
            crear(
              'button',
              {
                class: ['numero', respuestas[i] !== null && 'contestada', dudosas.has(i) && 'dudosa', esReserva(i) && 'reserva', i === actual && 'actual']
                  .filter(Boolean)
                  .join(' '),
                onclick: () => ir(i),
              },
              i + 1,
            ),
          ),
        ),
        crear('button', { class: 'boton grande', onclick: () => entregar() }, 'Entregar el test'),
      )
    }

    const ir = (i) => {
      actual = Math.min(total - 1, Math.max(0, i))
      pintar()
      subir()
    }
    function elegir(i) {
      respuestas[actual] = respuestas[actual] === i ? null : i
      pintar()
    }
    function marcarDudosa() {
      if (dudosas.has(actual)) dudosas.delete(actual)
      else dudosas.add(actual)
      pintar()
    }
    function abandonar() {
      if (confirm('¿Salir del test? Se perderán tus respuestas.')) portada()
    }
    function entregar(seAcaboElTiempo = false) {
      const enBlanco = respuestas.filter((r) => r === null).length
      if (!seAcaboElTiempo && enBlanco && !confirm(`Te quedan ${enBlanco} sin contestar. ¿Entregar ya?`)) return
      clearInterval(temporizador)
      teclas = null
      resultado(preguntas, respuestas, dudosas, seAcaboElTiempo, simulacro, real)
    }

    if (limite) {
      temporizador = setInterval(() => {
        const marcador = pagina.querySelector('.reloj')
        if (marcador) marcador.textContent = `Quedan ${textoReloj(quedan())}`
        if (quedan() <= 0) entregar(true)
      }, 1000)
    }
    // Teclado: a-c o 1-3 para elegir, flechas para moverse
    teclas = (e) => {
      const letra = 'abcd'.indexOf(e.key.toLowerCase())
      const i = letra >= 0 ? letra : '1234'.indexOf(e.key)
      if (i >= 0 && i < preguntas[actual].opciones.length) elegir(i)
      else if (e.key === 'ArrowRight') ir(actual + 1)
      else if (e.key === 'ArrowLeft') ir(actual - 1)
    }
    pintar()
    subir()
  }

  function resultado(preguntas, respuestas, dudosas, seAcaboElTiempo, simulacro = false, real = null) {
    pantalla = 'resultado'
    const penalizacion = simulacro ? ajustes.penalizacionSimulacro : ajustes.penalizacion
    // En el simulacro, la nota sale de las 50 primeras; las de reserva se corrigen aparte
    const cuentan = simulacro ? Math.min(SIMULACRO.cuentan, preguntas.length) : preguntas.length
    const { aciertos, fallos, enBlanco, nota: puntuacion } = corregir(preguntas.slice(0, cuentan), respuestas.slice(0, cuentan), penalizacion)
    const total = cuentan
    const estado = (i) => (respuestas[i] === null ? 'blanco' : respuestas[i] === preguntas[i].correcta ? 'bien' : 'mal')
    const reserva = preguntas.slice(cuentan).map((_, j) => estado(cuentan + j))

    // Lo contestado cuenta para el repaso de las tarjetas: bien = "Bien", mal o en blanco = "Otra vez"
    const estados = leer(CLAVES.estados, {})
    preguntas.forEach((p, i) => {
      if (p.tarjeta) estados[p.tarjeta] = calificar(estados[p.tarjeta], estado(i) === 'bien' ? 'bien' : 'otra')
    })
    guardar(CLAVES.estados, estados)
    // Para la racha y los aciertos por tema (las de en blanco cuentan como no acertadas)
    apuntar(preguntas.map((p, i) => ({ tema: p.tema, acierto: estado(i) === 'bien' })))
    // ¿Compensó contestar las dudosas? (paso 3.7; solo las que cuentan para la nota)
    const contestadasDudosas = [...dudosas].filter((i) => i < cuentan && respuestas[i] !== null)
    const dudosasBien = contestadasDudosas.filter((i) => estado(i) === 'bien').length
    const dudosasMal = contestadasDudosas.length - dudosasBien
    const aporte = ((dudosasBien - penalizacion * dudosasMal) / total) * 10
    guardar(CLAVES.historial, [
      {
        fecha: new Date().toISOString(),
        total,
        aciertos,
        fallos,
        enBlanco,
        nota: puntuacion,
        penalizacion,
        ...(simulacro && { simulacro: true }),
        ...(real && { real }),
        dudosas: { marcadas: dudosas.size, contestadas: contestadasDudosas.length, bien: dudosasBien, aporte },
      },
      ...leer(CLAVES.historial, []),
    ].slice(0, 30))

    let soloFallos = false
    let soloDudosas = false
    const lista = crear('ol', { class: 'lista-correccion' })
    function pintarLista() {
      rellenar(
        lista,
        preguntas.map((p, i) => {
          if ((soloFallos && estado(i) === 'bien') || (soloDudosas && !dudosas.has(i))) return null
          const marca = { bien: 'Bien', mal: 'Mal', blanco: 'En blanco' }[estado(i)] + (i >= cuentan ? ' · de reserva' : '')
          return crear(
            'li',
            { class: `correccion correccion-${estado(i)}` },
            botonNota(p, respuestas[i], undefined, 'Corrección del test tipo examen'),
            crear('p', { class: 'etiqueta' }, `${i + 1}. ${marca}${dudosas.has(i) ? ' · dudosa' : ''} · ${p.origen ?? NOMBRE_TEMA[p.tema]}`),
            crear('strong', {}, p.pregunta),
            crear(
              'ul',
              { class: 'opciones-corregidas' },
              p.opciones.map((o, j) =>
                crear(
                  'li',
                  { class: j === p.correcta ? 'es-correcta' : j === respuestas[i] ? 'es-tuya' : '' },
                  `${LETRAS[j]}) ${o}`,
                  j === p.correcta ? ' ✔' : j === respuestas[i] ? ' ✘' : '',
                ),
              ),
            ),
            crear('p', { class: 'detalle-tarjeta' }, p.explicacion),
            p.enlace && crear('a', { class: 'enlace-discreto', href: p.enlace }, p.enlace.startsWith('#/ejes') ? 'Ver el eje' : 'Ver en el mapa'),
          )
        }),
      )
    }
    pintarLista()
    const fallosYBlancos = preguntas.filter((_, i) => estado(i) !== 'bien')

    rellenar(
      pagina,
      crear('h1', {}, seAcaboElTiempo ? 'Se acabó el tiempo' : 'Resultado'),
      crear(
        'section',
        { class: 'tarjeta resumen-repaso' },
        crear('p', { class: 'nota-grande' }, nota(puntuacion), crear('span', {}, ' sobre 10')),
        crear(
          'div',
          { class: 'cifras' },
          crear('div', { class: 'cifra' }, crear('strong', {}, aciertos), crear('span', {}, 'bien')),
          crear('div', { class: 'cifra' }, crear('strong', {}, fallos), crear('span', {}, 'mal')),
          crear('div', { class: 'cifra' }, crear('strong', {}, enBlanco), crear('span', {}, 'en blanco')),
        ),
        crear(
          'p',
          { class: 'ficha-nota' },
          `Cálculo: (${aciertos} − ${fallos} × ${TEXTO_PENALIZACION.get(penalizacion)}) ÷ ${total} × 10`,
        ),
        reserva.length > 0 &&
          crear(
            'p',
            { class: 'ficha-nota' },
            `De reserva (no cuentan): ${reserva.filter((e) => e === 'bien').length} bien, ${reserva.filter((e) => e === 'mal').length} mal y ` +
              `${reserva.filter((e) => e === 'blanco').length} en blanco.`,
          ),
      ),
      // Análisis de dudosas (paso 3.7)
      dudosas.size > 0 &&
        crear(
          'section',
          { class: 'tarjeta' },
          crear('h2', {}, '¿Te compensó contestar las dudosas?'),
          contestadasDudosas.length
            ? [
                crear(
                  'p',
                  {},
                  `Marcaste ${dudosas.size} como dudosa${dudosas.size > 1 ? 's' : ''} y contestaste ${contestadasDudosas.length}: ` +
                    `${dudosasBien} bien y ${dudosasMal} mal.`,
                ),
                crear(
                  'div',
                  { class: 'cifras' },
                  crear('div', { class: 'cifra' }, crear('strong', {}, nota(puntuacion)), crear('span', {}, 'contestándolas')),
                  crear('div', { class: 'cifra' }, crear('strong', {}, nota(puntuacion - aporte)), crear('span', {}, 'dejándolas en blanco')),
                ),
                crear(
                  'p',
                  { class: aporte > 0 ? 'acierto-dudosas' : aporte < 0 ? 'fallo-dudosas' : null },
                  aporte > 0
                    ? `Te compensó: te sumaron ${nota(aporte)} puntos.`
                    : aporte < 0
                      ? `No te compensó: te restaron ${nota(-aporte)} puntos. Dejándolas en blanco habrías sacado más.`
                      : 'Ni ganaste ni perdiste nota con ellas.',
                ),
              ]
            : crear('p', {}, 'Las dejaste todas en blanco, así que no te sumaron ni te restaron.'),
          crear(
            'p',
            { class: 'ficha-nota' },
            `Con los fallos restando ${TEXTO_PENALIZACION.get(penalizacion)}, contestar una dudosa compensa si aciertas más del ` +
              `${porcentaje(UMBRAL_DUDOSAS(penalizacion))} de las veces.`,
          ),
        ),
      crear(
        'div',
        { class: 'acciones-eje' },
        fallosYBlancos.length > 0 &&
          crear('button', { class: 'boton', onclick: () => examen(fallosYBlancos) }, `Repetir las ${fallosYBlancos.length} no acertadas`),
        crear(
          'button',
          { class: 'boton secundario', onclick: real ? () => empezarReal(real) : simulacro ? empezarSimulacro : empezar },
          real ? 'Repetir el examen' : simulacro ? 'Otro simulacro' : 'Nuevo test',
        ),
        crear('button', { class: 'boton secundario', onclick: portada }, 'Volver'),
      ),
      crear('h2', {}, 'Corrección'),
      crear(
        'label',
        { class: 'casilla' },
        crear('input', {
          type: 'checkbox',
          onchange: (e) => {
            soloFallos = e.target.checked
            pintarLista()
          },
        }),
        'Ver solo las que no acerté',
      ),
      dudosas.size > 0 &&
        crear(
          'label',
          { class: 'casilla' },
          crear('input', {
            type: 'checkbox',
            onchange: (e) => {
              soloDudosas = e.target.checked
              pintarLista()
            },
          }),
          'Ver solo las dudosas',
        ),
      lista,
    )
    subir()
  }

  document.addEventListener('keydown', (e) => {
    if (!teclas || contenedor.hidden || notaAbierta() || e.target.matches?.('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey)
      return
    teclas(e)
  })

  return {
    // Si se va al mapa desde la corrección (o en mitad del test) y se vuelve, sigue donde estaba
    mostrar() {
      if (pantalla === 'portada') portada()
    },
  }
}
