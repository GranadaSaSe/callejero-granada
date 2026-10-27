// Test tipo examen (paso 1.7): preguntas a, b, c, d por temas, con penalización por fallo y nota sobre
// 10, como en la oposición. Se puede dejar en blanco, marcar dudosas y volver atrás. Al entregar se ve la
// corrección de cada pregunta con su explicación y un enlace al mapa.
import { crear, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import { DISTRITOS, ejesActuales } from '../ejes-lista.js'
import { corregir, crearExamen, NIVELES, TEMAS } from '../examen-datos.js'
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
const LETRAS = ['a', 'b', 'c', 'd']
const NOMBRE_TEMA = Object.fromEntries(TEMAS.map((t) => [t.id, t.nombre]))
const SEGUNDOS_POR_PREGUNTA = 72 // 60 minutos para 50 preguntas

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
const reloj = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const fecha = (iso) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Preparando el test…'))
  contenedor.append(pagina)
  const [calles, lugares] = await Promise.all([cargar('calles'), cargar('lugares')])
  const ajustes = {
    temas: TEMAS.map((t) => t.id),
    nivel: 'medio',
    distrito: 'Todos',
    total: 20,
    penalizacion: 1 / 3,
    conTiempo: false,
    ...leer(CLAVES.ajustes, {}),
  }
  let pantalla = 'portada'
  let teclas = null // atajos de teclado mientras se hace el test
  let temporizador = null
  const subir = () => contenedor.closest('.vistas')?.scrollTo(0, 0)

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

    rellenar(
      pagina,
      crear('h1', {}, 'Test tipo examen'),
      crear(
        'p',
        { class: 'intro' },
        'Preguntas con cuatro respuestas (a, b, c, d) y una sola buena. Puedes dejar preguntas en blanco, ' +
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
          'Con tiempo, como en el examen (60 minutos para 50 preguntas)',
        ),
        crear('button', { class: 'boton grande', disabled: !ajustes.temas.length, onclick: empezar }, 'Empezar el test'),
        crear(
          'p',
          { class: 'ficha-nota' },
          'Truco: con cuatro opciones y fallos que restan 1/3, contestar totalmente al azar no gana ni pierde de media; ' +
            'si puedes descartar una opción, ya compensa contestar. Con 1/2, hay que descartar dos.',
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
              crear('strong', {}, `Nota ${nota(h.nota)}`),
              crear('p', {}, `${h.aciertos} bien · ${h.fallos} mal · ${h.enBlanco} en blanco · ${h.total} preguntas`),
              crear('small', {}, `${fecha(h.fecha)} · fallos restan ${TEXTO_PENALIZACION.get(h.penalizacion) ?? h.penalizacion}`),
            ),
          ),
        ),
      ],
    )
    subir()
  }

  function empezar() {
    const preguntas = crearExamen(
      { calles, lugares, ejes: ejesActuales(calles) },
      { temas: ajustes.temas, nivel: ajustes.nivel, distrito: ajustes.distrito, total: ajustes.total },
    )
    if (preguntas.length) examen(preguntas)
  }

  function examen(preguntas) {
    pantalla = 'examen'
    const total = preguntas.length
    const respuestas = new Array(total).fill(null)
    const dudosas = new Set()
    let actual = 0
    const limite = ajustes.conTiempo ? total * SEGUNDOS_POR_PREGUNTA : null
    const inicio = Date.now()
    const quedan = () => Math.max(0, limite - (Date.now() - inicio) / 1000)

    function pintar() {
      const p = preguntas[actual]
      const contestadas = respuestas.filter((r) => r !== null).length
      rellenar(
        pagina,
        crear(
          'div',
          { class: 'barra-sesion' },
          crear('button', { class: 'enlace-discreto', onclick: abandonar }, '← Salir'),
          crear('span', { class: 'reloj' }, limite ? `Quedan ${reloj(quedan())}` : `${contestadas} de ${total} contestadas`),
        ),
        crear(
          'article',
          { class: 'tarjeta-repaso' },
          crear('p', { class: 'etiqueta' }, `Pregunta ${actual + 1} de ${total} · ${NOMBRE_TEMA[p.tema]}`),
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
                class: ['numero', respuestas[i] !== null && 'contestada', dudosas.has(i) && 'dudosa', i === actual && 'actual']
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
      resultado(preguntas, respuestas, dudosas, seAcaboElTiempo)
    }

    if (limite) {
      temporizador = setInterval(() => {
        const marcador = pagina.querySelector('.reloj')
        if (marcador) marcador.textContent = `Quedan ${reloj(quedan())}`
        if (quedan() <= 0) entregar(true)
      }, 1000)
    }
    // Teclado: a-d o 1-4 para elegir, flechas para moverse
    teclas = (e) => {
      const i = 'abcd'.indexOf(e.key.toLowerCase()) >= 0 ? 'abcd'.indexOf(e.key.toLowerCase()) : '1234'.indexOf(e.key)
      if (i >= 0) elegir(i)
      else if (e.key === 'ArrowRight') ir(actual + 1)
      else if (e.key === 'ArrowLeft') ir(actual - 1)
    }
    pintar()
    subir()
  }

  function resultado(preguntas, respuestas, dudosas, seAcaboElTiempo) {
    pantalla = 'resultado'
    const { aciertos, fallos, enBlanco, nota: puntuacion } = corregir(preguntas, respuestas, ajustes.penalizacion)
    const total = preguntas.length
    const estado = (i) => (respuestas[i] === null ? 'blanco' : respuestas[i] === preguntas[i].correcta ? 'bien' : 'mal')

    // Lo contestado cuenta para el repaso de las tarjetas: bien = "Bien", mal o en blanco = "Otra vez"
    const estados = leer(CLAVES.estados, {})
    preguntas.forEach((p, i) => {
      if (p.tarjeta) estados[p.tarjeta] = calificar(estados[p.tarjeta], estado(i) === 'bien' ? 'bien' : 'otra')
    })
    guardar(CLAVES.estados, estados)
    guardar(CLAVES.historial, [
      { fecha: new Date().toISOString(), total, aciertos, fallos, enBlanco, nota: puntuacion, penalizacion: ajustes.penalizacion },
      ...leer(CLAVES.historial, []),
    ].slice(0, 30))

    // ¿Compensó contestar las dudosas?
    const contestadasDudosas = [...dudosas].filter((i) => respuestas[i] !== null)
    const dudosasBien = contestadasDudosas.filter((i) => estado(i) === 'bien').length
    const dudosasMal = contestadasDudosas.length - dudosasBien
    const aporte = ((dudosasBien - ajustes.penalizacion * dudosasMal) / total) * 10

    let soloFallos = false
    const lista = crear('ol', { class: 'lista-correccion' })
    function pintarLista() {
      rellenar(
        lista,
        preguntas.map((p, i) => {
          if (soloFallos && estado(i) === 'bien') return null
          const marca = { bien: 'Bien', mal: 'Mal', blanco: 'En blanco' }[estado(i)]
          return crear(
            'li',
            { class: `correccion correccion-${estado(i)}` },
            crear('p', { class: 'etiqueta' }, `${i + 1}. ${marca}${dudosas.has(i) ? ' · dudosa' : ''} · ${NOMBRE_TEMA[p.tema]}`),
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
            crear('a', { class: 'enlace-discreto', href: p.enlace }, p.enlace.startsWith('#/ejes') ? 'Ver el eje' : 'Ver en el mapa'),
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
          `Cálculo: (${aciertos} − ${fallos} × ${TEXTO_PENALIZACION.get(ajustes.penalizacion)}) ÷ ${total} × 10`,
        ),
        dudosas.size > 0 &&
          crear(
            'p',
            { class: 'ficha-nota' },
            `Marcaste ${dudosas.size} como dudosa${dudosas.size > 1 ? 's' : ''}` +
              (contestadasDudosas.length
                ? `: contestaste ${contestadasDudosas.length} (${dudosasBien} bien, ${dudosasMal} mal) y te ${aporte >= 0 ? 'sumaron' : 'restaron'} ${nota(Math.abs(aporte))} puntos de nota.`
                : ', pero las dejaste en blanco.'),
          ),
      ),
      crear(
        'div',
        { class: 'acciones-eje' },
        fallosYBlancos.length > 0 &&
          crear('button', { class: 'boton', onclick: () => examen(fallosYBlancos) }, `Repetir las ${fallosYBlancos.length} no acertadas`),
        crear('button', { class: 'boton secundario', onclick: empezar }, 'Nuevo test'),
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
      lista,
    )
    subir()
  }

  document.addEventListener('keydown', (e) => {
    if (!teclas || contenedor.hidden || e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return
    teclas(e)
  })

  return {
    // Si se va al mapa desde la corrección (o en mitad del test) y se vuelve, sigue donde estaba
    mostrar() {
      if (pantalla === 'portada') portada()
    },
  }
}
