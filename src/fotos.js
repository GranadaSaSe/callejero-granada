// Fotos de los lugares (paso 4.2). Decidido por la persona el 14-11-2026: las fotos solo salen en la ficha del lugar
// en el mapa de estudio y en el juego «Fotos» de Jugar; ninguna pregunta con foto en el Test, las Tarjetas, el
// Kahoot ni los otros juegos. Las prepara `npm run fotos:preparar` (public/fotos/ y public/datos/fotos.json).
// Cada foto lleva su autor y su licencia (las de Wikimedia Commons lo exigen) o la firma de quien la hizo.
import { crear, rellenar } from './crear.js'
import { cargar } from './datos.js'

export const CACHE_FOTOS = 'callejero-fotos' // el mismo nombre que en vite.config.js

export const urlFoto = (foto) => `${import.meta.env.BASE_URL}fotos/${foto.archivo}`

// { fecha, bytes, lugares: { id del lugar: [{ archivo, autor, licencia, enlace, propia }] } }. Si aún no hay fotos
// o no se puede cargar, vacío: la app funciona igual sin ellas.
export async function cargarFotos() {
  try {
    const datos = await cargar('fotos')
    return { bytes: 0, ...datos, lugares: datos.lugares ?? {} }
  } catch {
    return { bytes: 0, lugares: {} }
  }
}

export function creditoFoto(foto) {
  const texto = foto.propia ? `Foto: ${foto.autor}` : `Foto: ${foto.autor} · ${foto.licencia} · Wikimedia Commons`
  return crear(
    'p',
    { class: 'credito-foto' },
    foto.enlace ? crear('a', { href: foto.enlace, target: '_blank', rel: 'noopener' }, texto) : texto,
  )
}

// Para no contestar una pregunta con el teclado mientras se mira una foto en grande
let ampliada = null
export const fotoAbierta = () => Boolean(ampliada)

// Una foto (o varias, con flechas para pasar) con su autor debajo. Al tocarla se ve en grande.
// "alt": el texto para quien no ve la foto (en el juego no puede decir qué sitio es).
export function visorFotos(fotos, { alt = 'Foto del lugar', clase = '' } = {}) {
  let i = 0
  const imagen = crear('img', { alt, decoding: 'async' })
  const credito = crear('div')
  const contador = crear('span', { class: 'contador-foto' })
  const figura = crear(
    'figure',
    { class: `foto-lugar ${clase}`.trim() },
    crear('button', { class: 'foto-boton', type: 'button', title: 'Ver en grande', onclick: () => ampliar(fotos, i, alt) }, imagen),
    crear('p', { class: 'foto-sin-internet' }, 'La foto se verá cuando haya internet.'),
    fotos.length > 1 &&
      crear(
        'div',
        { class: 'foto-pasar' },
        crear('button', { type: 'button', 'aria-label': 'Foto anterior', onclick: () => mover(-1) }, '‹'),
        contador,
        crear('button', { type: 'button', 'aria-label': 'Foto siguiente', onclick: () => mover(1) }, '›'),
      ),
    crear('figcaption', {}, credito),
  )
  imagen.addEventListener('error', () => figura.classList.add('sin-foto'))
  imagen.addEventListener('load', () => figura.classList.remove('sin-foto'))
  function pintar() {
    imagen.src = urlFoto(fotos[i])
    rellenar(credito, creditoFoto(fotos[i]))
    contador.textContent = `${i + 1} de ${fotos.length}`
  }
  function mover(paso) {
    i = (i + paso + fotos.length) % fotos.length
    pintar()
  }
  pintar()
  return figura
}

// La foto a pantalla completa. Se cierra con la ×, tocando la foto o con Escape.
function ampliar(fotos, inicio, alt) {
  let i = inicio
  const imagen = crear('img', { alt })
  const credito = crear('div')
  const pintar = () => {
    imagen.src = urlFoto(fotos[i])
    rellenar(credito, creditoFoto(fotos[i]))
  }
  // Se quita al momento, sin esperar al evento «close» (con el panel del navegador oculto llega tarde)
  const cerrar = () => {
    ventana.close()
    ventana.remove()
    ampliada = null
  }
  const ventana = crear(
    'dialog',
    { class: 'ventana-foto', oncancel: (e) => (e.preventDefault(), cerrar()) },
    crear('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cerrar', onclick: cerrar }, '×'),
    imagen,
    fotos.length > 1 &&
      crear(
        'div',
        { class: 'foto-pasar' },
        crear('button', { type: 'button', 'aria-label': 'Foto anterior', onclick: () => ((i = (i + fotos.length - 1) % fotos.length), pintar()) }, '‹'),
        crear('button', { type: 'button', 'aria-label': 'Foto siguiente', onclick: () => ((i = (i + 1) % fotos.length), pintar()) }, '›'),
      ),
    credito,
  )
  imagen.addEventListener('click', cerrar)
  document.body.append(ventana)
  ampliada = ventana
  pintar()
  ventana.showModal()
}

// Cuántas fotos hay ya guardadas en el móvil (las que se han visto o se guardaron todas juntas)
export async function fotosGuardadas(datos) {
  try {
    const cache = await caches.open(CACHE_FOTOS)
    const guardadas = new Set((await cache.keys()).map((r) => new URL(r.url).pathname.split('/').pop()))
    return Object.values(datos.lugares).flat().filter((f) => guardadas.has(f.archivo)).length
  } catch {
    return null // sin service worker (en el ordenador con `npm run dev`) no se puede saber
  }
}

// Pide todas las fotos para que el service worker las guarde y se puedan ver sin internet
export async function guardarTodas(datos, alAvanzar = () => {}) {
  const cola = Object.values(datos.lugares).flat()
  const total = cola.length
  let hechas = 0
  let fallidas = 0
  async function trabajar() {
    while (cola.length) {
      const foto = cola.shift()
      try {
        const respuesta = await fetch(urlFoto(foto))
        if (!respuesta.ok) throw new Error(respuesta.status)
        await respuesta.blob()
      } catch {
        fallidas++
      }
      alAvanzar(++hechas, total)
    }
  }
  await Promise.all([1, 2, 3, 4].map(trabajar))
  return { total, fallidas }
}
