// Tarjetas de repaso (paso 1.6): preguntas y respuestas sobre el callejero con repaso espaciado.
// Se lee la pregunta, se intenta recordar, se destapa la respuesta y se dice cómo ha ido; según eso la
// tarjeta vuelve a salir en unos minutos o en unos días. El progreso se guarda en el dispositivo.
import { crear, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import { DISTRITOS, ejesActuales } from '../ejes-lista.js'
import { aprendida, calificar, cuandoVuelve, intercalar, RESPUESTAS, tarjetasDeHoy } from '../repaso.js'
import { crearOpciones, crearTarjetas, MAZOS } from '../tarjetas-datos.js'

const CLAVES = {
  estados: 'callejero-tarjetas',
  ajustes: 'callejero-tarjetas-ajustes',
  hoy: 'callejero-tarjetas-hoy',
  record: 'callejero-test-record',
}
const NOMBRE_MAZO = Object.fromEntries(MAZOS.map((m) => [m.id, m.nombre]))

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
    // Sin almacenamiento (modo privado): el progreso dura solo mientras la app esté abierta
  }
}

const hoy = () => new Date().toLocaleDateString('sv') // AAAA-MM-DD en la hora local

const barajar = (lista) =>
  lista
    .map((x) => [Math.random(), x])
    .sort((a, b) => a[0] - b[0])
    .map(([, x]) => x)

const cifra = (numero, texto) =>
  crear('div', { class: 'cifra' }, crear('strong', {}, numero.toLocaleString('es-ES')), crear('span', {}, texto))

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Preparando las tarjetas…'))
  contenedor.append(pagina)

  const [calles, lugares] = await Promise.all([cargar('calles'), cargar('lugares')])
  const estados = leer(CLAVES.estados, {})
  const ajustes = {
    mazos: MAZOS.map((m) => m.id),
    distrito: 'Todos',
    nuevasPorDia: 15,
    preguntasTest: 10,
    segundosTest: 20,
    ...leer(CLAVES.ajustes, {}),
  }
  let contador = leer(CLAVES.hoy, { fecha: hoy(), nuevas: 0 })
  const nuevasYaHoy = () => (contador.fecha === hoy() ? contador.nuevas : 0)
  let enSesion = null // { tecla } mientras hay una sesión de tarjetas o de test abierta

  // Las tarjetas se crean al momento con los ejes actuales (se pueden cambiar en la pantalla de Ejes)
  function mazosActuales() {
    const mazos = crearTarjetas({ calles, lugares, ejes: ejesActuales(calles) })
    const delDistrito = (t) => ajustes.distrito === 'Todos' || t.distrito === ajustes.distrito
    for (const id of Object.keys(mazos)) mazos[id] = mazos[id].filter(delDistrito)
    return mazos
  }

  const cambiarAjuste = (cambio) => {
    Object.assign(ajustes, cambio)
    guardar(CLAVES.ajustes, ajustes)
    portada()
  }

  function portada() {
    enSesion = null
    const mazos = mazosActuales()
    const candidatas = intercalar(ajustes.mazos.map((id) => mazos[id] ?? []))
    const { tocan, nuevas } = tarjetasDeHoy(candidatas, estados, {
      nuevasPorDia: ajustes.nuevasPorDia,
      nuevasYaHoy: nuevasYaHoy(),
    })
    const vistas = candidatas.filter((t) => estados[t.id]).length
    const sabidas = candidatas.filter((t) => aprendida(estados[t.id])).length

    const distrito = crear(
      'select',
      { onchange: (e) => cambiarAjuste({ distrito: e.target.value }) },
      ['Todos', ...DISTRITOS].map((d) =>
        crear('option', { value: d, selected: d === ajustes.distrito }, d === 'Todos' ? 'Todos los distritos' : d),
      ),
    )
    const porDia = crear(
      'select',
      { onchange: (e) => cambiarAjuste({ nuevasPorDia: Number(e.target.value) }) },
      [5, 10, 15, 20, 30, 50].map((n) => crear('option', { value: n, selected: n === ajustes.nuevasPorDia }, `${n} al día`)),
    )

    rellenar(
      pagina,
      crear('h1', {}, 'Tarjetas de repaso'),
      crear(
        'p',
        { class: 'intro' },
        'Lee la pregunta, intenta recordar la respuesta y destápala. Según lo bien que la supieras, ' +
          'la tarjeta volverá dentro de unos minutos o de unos días.',
      ),
      crear(
        'section',
        { class: 'tarjeta resumen-repaso' },
        crear('div', { class: 'cifras' }, cifra(tocan.length, 'por repasar'), cifra(nuevas.length, 'nuevas hoy'), cifra(sabidas, 'aprendidas')),
        tocan.length + nuevas.length > 0
          ? crear('button', { class: 'boton grande', onclick: () => sesion([...tocan, ...nuevas]) }, 'Empezar')
          : crear('p', { class: 'hecho' }, '¡Hecho por hoy! Vuelve mañana, o sube las tarjetas nuevas al día.'),
        crear('p', { class: 'ficha-nota' }, `Has visto ${vistas.toLocaleString('es-ES')} de ${candidatas.length.toLocaleString('es-ES')} tarjetas.`),
      ),
      crear(
        'section',
        { class: 'tarjeta modo-test' },
        crear('h2', {}, 'Modo test'),
        crear('p', {}, 'Cuatro respuestas posibles y una buena, contra el reloj, como en un Kahoot. Los aciertos y fallos cuentan para el repaso.'),
        crear(
          'div',
          { class: 'ajustes-test' },
          crear(
            'select',
            { 'aria-label': 'Preguntas', onchange: (e) => cambiarAjuste({ preguntasTest: Number(e.target.value) }) },
            [10, 20, 30].map((n) => crear('option', { value: n, selected: n === ajustes.preguntasTest }, `${n} preguntas`)),
          ),
          crear(
            'select',
            { 'aria-label': 'Tiempo', onchange: (e) => cambiarAjuste({ segundosTest: Number(e.target.value) }) },
            [
              [10, '10 s por pregunta'],
              [20, '20 s por pregunta'],
              [30, '30 s por pregunta'],
              [0, 'Sin tiempo'],
            ].map(([n, texto]) => crear('option', { value: n, selected: n === ajustes.segundosTest }, texto)),
          ),
        ),
        crear('button', { class: 'boton grande boton-test', onclick: concurso }, 'Jugar'),
      ),
      crear(
        'section',
        { class: 'tarjeta' },
        crear('h2', {}, 'Qué estudiar'),
        ...MAZOS.map((m) =>
          crear(
            'label',
            { class: 'casilla' },
            crear('input', {
              type: 'checkbox',
              checked: ajustes.mazos.includes(m.id),
              onchange: (e) =>
                cambiarAjuste({
                  mazos: e.target.checked ? [...ajustes.mazos, m.id] : ajustes.mazos.filter((id) => id !== m.id),
                }),
            }),
            `${m.nombre} (${mazos[m.id].length.toLocaleString('es-ES')})`,
          ),
        ),
        crear('label', { class: 'campo' }, 'Zona', distrito),
        crear('label', { class: 'campo' }, 'Tarjetas nuevas', porDia),
      ),
    )
  }

  function sesion(cola) {
    let tarjeta = null
    let destapada = false
    let aciertos = 0
    let fallos = 0

    function pintar() {
      const estado = estados[tarjeta.id]
      rellenar(
        pagina,
        crear(
          'div',
          { class: 'barra-sesion' },
          crear('button', { class: 'enlace-discreto', onclick: portada }, '← Terminar'),
          crear('span', {}, `Quedan ${cola.length + 1}`),
        ),
        crear(
          'article',
          { class: 'tarjeta-repaso' },
          crear('p', { class: 'etiqueta' }, NOMBRE_MAZO[tarjeta.mazo], estado ? '' : ' · nueva'),
          crear('h2', { class: 'pregunta-tarjeta' }, tarjeta.pregunta),
          destapada && [
            crear('p', { class: 'respuesta-tarjeta' }, tarjeta.respuesta),
            tarjeta.detalle && crear('p', { class: 'detalle-tarjeta' }, tarjeta.detalle),
            crear('a', { class: 'enlace-discreto', href: tarjeta.enlace }, tarjeta.mazo === 'cruces' ? 'Ver el eje' : 'Ver en el mapa'),
          ],
        ),
        destapada
          ? crear(
              'div',
              { class: 'respuestas' },
              RESPUESTAS.map((r, i) =>
                crear(
                  'button',
                  { class: `respuesta respuesta-${r.id}`, onclick: () => responder(r.id) },
                  crear('strong', {}, r.texto),
                  crear('small', {}, cuandoVuelve(estado, r.id)),
                  crear('kbd', {}, i + 1),
                ),
              ),
            )
          : crear('button', { class: 'boton grande', onclick: destapar }, 'Mostrar respuesta'),
      )
      contenedor.closest('.vistas')?.scrollTo(0, 0)
    }

    function siguiente() {
      tarjeta = cola.shift()
      destapada = false
      if (tarjeta) return pintar()
      enSesion = null
      rellenar(
        pagina,
        crear('h1', {}, '¡Sesión terminada!'),
        crear('p', { class: 'intro' }, `Has acertado ${aciertos} y repetido ${fallos}. Lo que has fallado volverá pronto.`),
        crear('button', { class: 'boton grande', onclick: portada }, 'Volver'),
      )
    }

    function destapar() {
      destapada = true
      pintar()
    }

    function responder(respuesta) {
      if (!destapada) return
      const nueva = !estados[tarjeta.id]
      estados[tarjeta.id] = calificar(estados[tarjeta.id], respuesta)
      guardar(CLAVES.estados, estados)
      if (nueva) {
        contador = { fecha: hoy(), nuevas: nuevasYaHoy() + 1 }
        guardar(CLAVES.hoy, contador)
      }
      if (respuesta === 'otra') {
        fallos++
        cola.splice(Math.min(cola.length, 4), 0, tarjeta) // vuelve dentro de unas pocas tarjetas
      } else {
        aciertos++
      }
      siguiente()
    }

    // Teclado: espacio o Intro para destapar, 1-4 para responder
    enSesion = {
      tecla(e) {
        if (!destapada && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault()
          destapar()
        } else if (destapada && /^[1-4]$/.test(e.key)) {
          responder(RESPUESTAS[Number(e.key) - 1].id)
        }
      },
    }
    siguiente()
  }

  // Modo test estilo Kahoot: cuatro respuestas, contra el reloj, con puntos y racha de aciertos.
  // Cada acierto cuenta como "Bien" y cada fallo como "Otra vez" en el repaso espaciado.
  const FORMAS = [
    ['k-rojo', '▲'],
    ['k-azul', '◆'],
    ['k-amarillo', '●'],
    ['k-verde', '■'],
  ]

  function elegirPreguntas() {
    const mazos = mazosActuales()
    const candidatas = intercalar(ajustes.mazos.map((id) => mazos[id] ?? []))
    const ahora = Date.now()
    const vistas = candidatas.filter((t) => estados[t.id])
    // Primero lo que toca repasar, luego lo ya visto que más se ha fallado y por último tarjetas nuevas
    // (de las 150 más importantes, al azar, para que cada partida sea distinta)
    const tocan = barajar(vistas.filter((t) => estados[t.id].proxima <= ahora))
    const resto = barajar(vistas.filter((t) => estados[t.id].proxima > ahora)).sort(
      (a, b) => estados[b.id].fallos - estados[a.id].fallos,
    )
    const nuevas = barajar(candidatas.filter((t) => !estados[t.id]).slice(0, 150))
    const preguntas = []
    for (const tarjeta of [...tocan, ...resto.slice(0, ajustes.preguntasTest / 2), ...nuevas, ...resto]) {
      if (preguntas.length >= ajustes.preguntasTest) break
      if (preguntas.some((p) => p.tarjeta.id === tarjeta.id)) continue
      const opciones = crearOpciones(tarjeta, mazos)
      if (opciones) preguntas.push({ tarjeta, opciones })
    }
    return barajar(preguntas)
  }

  function concurso() {
    const preguntas = elegirPreguntas()
    if (!preguntas.length) return
    let indice = -1
    let puntos = 0
    let racha = 0
    let mejorRacha = 0
    let aciertos = 0
    let respondida = false
    let inicio = 0
    let temporizador = null
    const falladas = []
    const segundos = ajustes.segundosTest

    function mostrarPregunta() {
      indice++
      if (indice >= preguntas.length) return final()
      respondida = false
      const { tarjeta, opciones } = preguntas[indice]
      const barra = crear('div', { class: 'tiempo-relleno' })
      rellenar(
        pagina,
        crear(
          'div',
          { class: 'barra-sesion' },
          crear('button', { class: 'enlace-discreto', onclick: salir }, '← Salir'),
          crear('span', {}, `Pregunta ${indice + 1} de ${preguntas.length} · ${puntos.toLocaleString('es-ES')} puntos`),
        ),
        segundos > 0 && crear('div', { class: 'tiempo' }, barra),
        crear(
          'article',
          { class: 'tarjeta-repaso pregunta-test' },
          crear('p', { class: 'etiqueta' }, NOMBRE_MAZO[tarjeta.mazo]),
          crear('h2', { class: 'pregunta-tarjeta' }, tarjeta.pregunta),
          crear('div', { class: 'resultado-test', 'aria-live': 'polite' }),
        ),
        crear(
          'div',
          { class: 'opciones-test' },
          opciones.map((texto, n) =>
            crear(
              'button',
              { class: `opcion-test ${FORMAS[n][0]}`, onclick: () => contestar(n) },
              crear('span', { class: 'forma', 'aria-hidden': 'true' }, FORMAS[n][1]),
              crear('span', {}, texto),
            ),
          ),
        ),
      )
      contenedor.closest('.vistas')?.scrollTo(0, 0)
      inicio = Date.now()
      if (segundos > 0) {
        void barra.offsetWidth // para que la barra empiece llena y se vacíe poco a poco
        barra.style.transitionDuration = `${segundos}s`
        barra.style.width = '0%'
        temporizador = setTimeout(() => contestar(null), segundos * 1000)
      }
    }

    function contestar(elegida) {
      if (respondida) return
      respondida = true
      clearTimeout(temporizador)
      const { tarjeta, opciones } = preguntas[indice]
      const buena = opciones.indexOf(tarjeta.respuesta)
      const acierto = elegida === buena
      const tardado = Math.min((Date.now() - inicio) / 1000, segundos || Infinity)

      // Como en Kahoot: hasta 1.000 puntos, menos cuanto más se tarda, y un extra por racha
      let ganados = 0
      if (acierto) {
        aciertos++
        racha++
        mejorRacha = Math.max(mejorRacha, racha)
        ganados = Math.round(1000 * (segundos > 0 ? 1 - tardado / segundos / 2 : 1)) + Math.min(racha - 1, 5) * 100
        puntos += ganados
      } else {
        racha = 0
        falladas.push(tarjeta)
      }
      estados[tarjeta.id] = calificar(estados[tarjeta.id], acierto ? 'bien' : 'otra')
      guardar(CLAVES.estados, estados)

      const barra = pagina.querySelector('.tiempo-relleno')
      if (barra) {
        barra.style.transition = 'none'
        barra.style.width = `${Math.max(0, 100 * (1 - tardado / segundos))}%`
      }
      pagina.querySelectorAll('.opcion-test').forEach((boton, n) => {
        boton.disabled = true
        boton.classList.add(n === buena ? 'buena' : n === elegida ? 'fallada' : 'apagada')
      })
      rellenar(
        pagina.querySelector('.resultado-test'),
        crear(
          'p',
          { class: acierto ? 'acierto' : 'fallo' },
          acierto
            ? `¡Correcto! +${ganados.toLocaleString('es-ES')}${racha > 1 ? ` · racha de ${racha}` : ''}`
            : elegida === null
              ? '¡Se acabó el tiempo!'
              : 'No era esa.',
        ),
        !acierto && crear('p', { class: 'respuesta-tarjeta' }, tarjeta.respuesta),
        tarjeta.detalle && crear('p', { class: 'detalle-tarjeta' }, tarjeta.detalle),
      )
      pagina.append(
        crear(
          'button',
          { class: 'boton grande', onclick: mostrarPregunta },
          indice + 1 < preguntas.length ? 'Siguiente' : 'Ver el resultado',
        ),
      )
    }

    function salir() {
      clearTimeout(temporizador)
      portada()
    }

    function final() {
      enSesion = null
      const record = Math.max(puntos, leer(CLAVES.record, 0))
      guardar(CLAVES.record, record)
      rellenar(
        pagina,
        crear('h1', {}, aciertos === preguntas.length ? '¡Pleno!' : 'Resultado'),
        crear(
          'section',
          { class: 'tarjeta resumen-repaso' },
          crear(
            'div',
            { class: 'cifras' },
            cifra(`${aciertos}/${preguntas.length}`, 'aciertos'),
            cifra(puntos.toLocaleString('es-ES'), 'puntos'),
            cifra(mejorRacha, 'mejor racha'),
          ),
          crear('p', { class: 'ficha-nota' }, puntos >= record && puntos > 0 ? '¡Nuevo récord!' : `Tu récord: ${record.toLocaleString('es-ES')} puntos`),
        ),
        falladas.length > 0 && [
          crear('h2', {}, 'Para repasar'),
          crear(
            'ul',
            { class: 'lista-notas' },
            falladas.map((t) => crear('li', {}, crear('p', {}, t.pregunta), crear('strong', {}, t.respuesta))),
          ),
        ],
        crear(
          'div',
          { class: 'acciones-eje' },
          crear('button', { class: 'boton', onclick: concurso }, 'Jugar otra vez'),
          crear('button', { class: 'boton secundario', onclick: portada }, 'Volver'),
        ),
      )
    }

    // Teclado: 1-4 para contestar, Intro o espacio para pasar a la siguiente
    enSesion = {
      tecla(e) {
        if (!respondida && /^[1-4]$/.test(e.key)) contestar(Number(e.key) - 1)
        else if (respondida && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          mostrarPregunta()
        }
      },
    }
    mostrarPregunta()
  }

  document.addEventListener('keydown', (e) => {
    if (!enSesion || contenedor.hidden || e.target.matches('input, select, textarea')) return
    enSesion.tecla(e)
  })

  return {
    // Si se va al mapa desde una tarjeta y se vuelve, la sesión sigue donde estaba
    mostrar() {
      if (!enSesion) portada()
    },
  }
}
