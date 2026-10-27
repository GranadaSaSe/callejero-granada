// Tarjetas de repaso (paso 1.6): preguntas y respuestas sobre el callejero con repaso espaciado.
// Se lee la pregunta, se intenta recordar, se destapa la respuesta y se dice cómo ha ido; según eso la
// tarjeta vuelve a salir en unos minutos o en unos días. El progreso se guarda en el dispositivo.
import { crear, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import { DISTRITOS, ejesActuales } from '../ejes-lista.js'
import { aprendida, calificar, cuandoVuelve, intercalar, RESPUESTAS, tarjetasDeHoy } from '../repaso.js'
import { crearTarjetas, MAZOS } from '../tarjetas-datos.js'

const CLAVES = { estados: 'callejero-tarjetas', ajustes: 'callejero-tarjetas-ajustes', hoy: 'callejero-tarjetas-hoy' }
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

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Preparando las tarjetas…'))
  contenedor.append(pagina)

  const [calles, lugares] = await Promise.all([cargar('calles'), cargar('lugares')])
  const estados = leer(CLAVES.estados, {})
  const ajustes = { mazos: MAZOS.map((m) => m.id), distrito: 'Todos', nuevasPorDia: 15, ...leer(CLAVES.ajustes, {}) }
  let contador = leer(CLAVES.hoy, { fecha: hoy(), nuevas: 0 })
  const nuevasYaHoy = () => (contador.fecha === hoy() ? contador.nuevas : 0)
  let enSesion = null // { destapar, responder } mientras hay una sesión abierta

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
    const cifra = (numero, texto) => crear('div', { class: 'cifra' }, crear('strong', {}, numero.toLocaleString('es-ES')), crear('span', {}, texto))

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

    enSesion = { destapar, responder, destapada: () => destapada }
    siguiente()
  }

  // Atajos de teclado en el ordenador: espacio o Intro para destapar, 1-4 para responder
  document.addEventListener('keydown', (e) => {
    if (!enSesion || contenedor.hidden || e.target.matches('input, select, textarea')) return
    if (!enSesion.destapada() && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault()
      enSesion.destapar()
    } else if (enSesion.destapada() && /^[1-4]$/.test(e.key)) {
      enSesion.responder(RESPUESTAS[Number(e.key) - 1].id)
    }
  })

  return {
    // Si se va al mapa desde una tarjeta y se vuelve, la sesión sigue donde estaba
    mostrar() {
      if (!enSesion) portada()
    },
  }
}
