// Ventana para dejar una nota sobre una pregunta (tarjetas, test Kahoot o test tipo examen): una
// sugerencia o una queja ("la respuesta está mal", "hay dos buenas"...). La nota va al mismo sitio que
// las del mapa (Inicio → Notas) y se comparte en el mismo archivo.
import { crear } from './crear.js'
import { anadirNota, guardarAutor, leerAutor, TIPOS_PREGUNTA } from './notas.js'

// Calle o lugar del que trata una pregunta, a partir de su enlace (#/mapa?calle=..., #/ejes?id=...)
export function buscadorDeReferencias(calles, lugares) {
  const callePorId = new Map(calles.map((c) => [String(c.id), c]))
  const lugarPorId = new Map(lugares.map((l) => [l.id, l]))
  return (enlace = '') => {
    const [, campo, id] = enlace.match(/[?&](calle|id|lugar)=([\w-]+)/) ?? []
    const calle = campo === 'lugar' ? null : callePorId.get(id)
    const lugar = campo === 'lugar' ? lugarPorId.get(id) : null
    return {
      calle: calle ? { id: calle.id, nombre: calle.nombre } : null,
      lugar: lugar ? { id: lugar.id, nombre: lugar.nombre } : null,
    }
  }
}

// Abre la ventana. "alAbrir" y "alCerrar" sirven para parar y seguir el reloj de los tests.
export function notaDePregunta({ modo, pregunta, respuesta, elegida = null, opciones = null, id, enlace, calle, lugar }, { alAbrir, alCerrar } = {}) {
  const tipo = crear('select', {}, TIPOS_PREGUNTA.map((t) => crear('option', { value: t }, t)))
  const comentario = crear('textarea', { rows: 3, placeholder: 'Qué está mal y cómo debería ser' })
  // La primera vez se pide el nombre, para que al compartir las notas se sepa de quién son
  const nombre = !leerAutor() && crear('input', { type: 'text', placeholder: 'Por ejemplo: Miguel', maxlength: 40 })
  // Se cierra al momento de pulsar el botón (el aviso "close" del navegador puede llegar tarde)
  let cerrada = false
  function cerrar(guardar) {
    if (cerrada) return
    cerrada = true
    if (guardar) {
      if (nombre && nombre.value.trim()) guardarAutor(nombre.value)
      anadirNota({
        tipo: tipo.value,
        comentario: comentario.value,
        punto: null,
        calle: calle ?? null,
        lugar: lugar ?? null,
        tramo: null,
        pregunta: { modo, texto: pregunta, respuesta, elegida, opciones, id, enlace },
      })
    }
    ventana.close()
    ventana.remove()
    alCerrar?.(guardar)
  }
  const ventana = crear(
    'dialog',
    { class: 'ventana-nota' },
    crear(
      'form',
      {
        onsubmit: (e) => {
          e.preventDefault()
          cerrar(true)
        },
      },
      crear('p', { class: 'ficha-tipo' }, `Nota sobre esta pregunta · ${modo}`),
      crear('p', { class: 'pregunta-citada' }, pregunta),
      crear('label', { class: 'campo' }, 'Qué pasa', tipo),
      crear('label', { class: 'campo' }, 'Comentario', comentario),
      nombre && crear('label', { class: 'campo' }, 'Tu nombre (solo la primera vez)', nombre),
      crear(
        'div',
        { class: 'acciones-eje' },
        crear('button', { class: 'boton', type: 'submit' }, 'Guardar nota'),
        crear('button', { class: 'boton secundario', type: 'button', onclick: () => cerrar(false) }, 'Cancelar'),
      ),
      crear('p', { class: 'ficha-nota' }, 'Se guarda con tus notas del mapa. Para compartirlas: Inicio → Notas.'),
    ),
  )
  // Tecla Esc o botón "atrás" del móvil: se cierra sin guardar
  ventana.addEventListener('cancel', (e) => {
    e.preventDefault()
    cerrar(false)
  })
  ventana.addEventListener('close', () => cerrar(false))
  document.body.append(ventana)
  alAbrir?.()
  ventana.showModal()
}

// ¿Hay una ventana de nota abierta? (para que el teclado no conteste la pregunta mientras se escribe)
export const notaAbierta = () => Boolean(document.querySelector('dialog.ventana-nota[open]'))
