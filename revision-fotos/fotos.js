// Página para revisar las fotos de los lugares (paso 4.2). Funciona solo en este ordenador.
// Enseña las fotos candidatas de Wikimedia Commons de cada lugar (de `npm run fotos:buscar`) y guarda cuáles
// son buenas en datos/fotos-revisadas.json. También deja añadir fotos propias, que se reducen aquí mismo
// (al redibujarlas se quedan sin los datos ocultos del móvil) y se guardan en datos/fotos-propias/.

const MAX_FOTOS = 3
const LADO_PROPIAS = 1600 // lado mayor, en píxeles, de las fotos propias que se guardan
const FUENTES = {
  wikidata: 'Foto de su ficha de Wikidata',
  openstreetmap: 'Enlazada en OpenStreetMap',
  categoria: 'De su carpeta de Commons',
  nombre: 'Lleva su nombre',
  cerca: 'Hecha a pocos metros',
  propia: 'Foto tuya',
}

const $ = (id) => document.getElementById(id)

function crear(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElement(etiqueta)
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor == null || valor === false) continue
    if (clave.startsWith('on')) el.addEventListener(clave.slice(2), valor)
    else if (clave === 'class') el.className = valor
    else el.setAttribute(clave, valor === true ? '' : valor)
  }
  for (const hijo of hijos.flat()) if (hijo != null && hijo !== false) el.append(hijo)
  return el
}

const leerLocal = (clave, porDefecto) => {
  try {
    return localStorage.getItem(clave) ?? porDefecto
  } catch {
    return porDefecto
  }
}
const guardarLocal = (clave, valor) => {
  try {
    localStorage.setItem(clave, valor)
  } catch {}
}

async function enviar(ruta, datos) {
  const respuesta = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
  const json = await respuesta.json()
  if (!respuesta.ok) throw new Error(json.error ?? 'No se ha podido guardar')
  return json
}

// ---------- Datos ----------

const [{ lugares, fecha }, revisadas] = await Promise.all([
  fetch('/candidatas.json').then((r) => r.json()),
  fetch('/api/revisadas').then((r) => r.json()),
])
revisadas.lugares ??= {}
revisadas.propias ??= {}
const porId = new Map(lugares.map((l) => [l.id, l]))
let actual = null
let elegidas = []

const estadoDe = (id) => {
  const r = revisadas.lugares[id]
  return !r ? 'pendiente' : r.ninguna ? 'ninguna' : 'con'
}

const candidatasDe = (lugar) => [
  ...(revisadas.propias[lugar.id] ?? []).map((p) => ({
    clave: `propia:${p.archivo}`,
    src: `/propias/${encodeURIComponent(p.archivo)}`,
    grande: `/propias/${encodeURIComponent(p.archivo)}`,
    autor: p.autor,
    licencia: 'cedida para la app',
    fuente: 'propia',
    archivo: p.archivo,
  })),
  ...lugar.candidatas.map((c) => ({
    clave: c.titulo,
    src: c.miniatura,
    grande: c.miniatura,
    autor: c.autor,
    licencia: c.licencia,
    enlace: c.enlace,
    fuente: c.fuente,
  })),
]

// ---------- Lista de lugares ----------

const categorias = [...new Set(lugares.map((l) => l.categoria))]
$('categoria').append(crear('option', { value: '' }, 'todos los tipos'), ...categorias.map((c) => crear('option', { value: c }, c)))
$('categoria').value = leerLocal('fotos-categoria', '')
$('estado').value = leerLocal('fotos-estado', 'pendientes')

const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function filtrados() {
  const categoria = $('categoria').value
  const estado = $('estado').value
  const texto = sinTildes($('buscar').value.trim())
  return lugares.filter((l) => {
    if (categoria && l.categoria !== categoria) return false
    if (estado === 'pendientes' && estadoDe(l.id) !== 'pendiente') return false
    if (estado === 'hechos' && estadoDe(l.id) === 'pendiente') return false
    return !texto || sinTildes(l.nombre).includes(texto)
  })
}

const ICONOS = { pendiente: '·', con: '✔', ninguna: '✕' }

function pintarLista() {
  const lista = filtrados()
  $('lugares').replaceChildren(
    ...lista.map((l) => {
      const n = candidatasDe(l).length
      return crear(
        'li',
        {},
        crear(
          'button',
          { class: `lugar${l.id === actual?.id ? ' activo' : ''}`, 'data-id': l.id, onclick: () => abrir(l.id) },
          crear('span', { class: `icono ${estadoDe(l.id)}` }, ICONOS[estadoDe(l.id)]),
          crear('span', { class: 'lugar-nombre' }, l.nombre),
          crear('span', { class: 'lugar-num' }, n ? `${n}` : '—'),
        ),
      )
    }),
  )
  const hechos = lugares.filter((l) => estadoDe(l.id) !== 'pendiente').length
  const conFoto = lugares.filter((l) => estadoDe(l.id) === 'con').length
  $('progreso').textContent = `${hechos} de ${lugares.length} lugares revisados · ${conFoto} con foto · búsqueda del ${fecha}`
  $('barra').style.width = `${(100 * hechos) / lugares.length}%`
  $('lugares').querySelector('.activo')?.scrollIntoView({ block: 'nearest' })
}

for (const id of ['categoria', 'estado']) {
  $(id).addEventListener('change', () => {
    guardarLocal(`fotos-${id}`, $(id).value)
    pintarLista()
    if (!actual || !filtrados().some((l) => l.id === actual.id)) irAlSiguiente(null)
  })
}
$('buscar').addEventListener('input', pintarLista)

// ---------- Ficha del lugar ----------

function abrir(id) {
  actual = porId.get(id)
  elegidas = [...(revisadas.lugares[id]?.fotos ?? [])]
  $('vacio').hidden = true
  $('ficha').hidden = false
  $('error').hidden = true
  $('tipo').textContent = [actual.categoria, actual.distrito].filter(Boolean).join(' · ')
  $('nombre').textContent = actual.nombre
  $('detalle').textContent = [actual.direccion, actual.barrio && `barrio ${actual.barrio}`].filter(Boolean).join(' · ')
  const [lon, lat] = actual.punto
  $('street-view').href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`
  $('ver-mapa').href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`
  pintarFotos()
  pintarLista()
  document.querySelector('.principal').scrollTop = 0
}

function pintarFotos() {
  const candidatas = candidatasDe(actual)
  // Lo elegido que ya no está entre las candidatas (una foto propia quitada) se olvida
  elegidas = elegidas.filter((clave) => candidatas.some((c) => c.clave === clave))
  $('sin-candidatas').hidden = candidatas.length > 0
  $('fotos').replaceChildren(
    ...candidatas.map((c, i) => {
      const orden = elegidas.indexOf(c.clave)
      return crear(
        'figure',
        { class: `foto${orden >= 0 ? ' elegida' : ''}` },
        crear(
          'button',
          { class: 'foto-boton', title: orden >= 0 ? 'Quitar de las buenas' : 'Marcar como buena', onclick: () => alternar(c.clave) },
          crear('img', { src: c.src, alt: `Foto ${i + 1}`, loading: 'lazy' }),
          orden >= 0 && crear('span', { class: 'insignia' }, orden === 0 ? '1 · principal' : `${orden + 1}`),
          i < 9 && crear('kbd', { class: 'tecla' }, `${i + 1}`),
        ),
        crear(
          'figcaption',
          {},
          crear('span', { class: 'fuente' }, FUENTES[c.fuente] ?? c.fuente),
          crear('span', { class: 'credito' }, `${c.autor} · ${c.licencia}`),
          crear(
            'span',
            { class: 'mini-acciones' },
            crear('button', { class: 'enlace', onclick: () => ampliar(c) }, 'Ampliar'),
            c.enlace && crear('a', { href: c.enlace, target: '_blank', rel: 'noopener' }, 'Wikimedia ↗'),
            c.fuente === 'propia' && crear('button', { class: 'enlace peligro', onclick: () => quitarPropia(c) }, 'Quitar'),
          ),
        ),
      )
    }),
  )
  $('maximo').textContent = MAX_FOTOS
  $('guardar').disabled = elegidas.length === 0
}

function alternar(clave) {
  const orden = elegidas.indexOf(clave)
  if (orden >= 0) elegidas.splice(orden, 1)
  else if (elegidas.length < MAX_FOTOS) elegidas.push(clave)
  else return mostrarError(`Como mucho ${MAX_FOTOS} fotos por sitio: quita una antes de marcar otra.`)
  $('error').hidden = true
  pintarFotos()
}

function ampliar(c) {
  $('ampliada-img').src = c.grande
  $('ampliada-pie').textContent = `${FUENTES[c.fuente] ?? c.fuente} · ${c.autor} · ${c.licencia}`
  $('ampliada').showModal()
}

function mostrarError(texto) {
  $('error').textContent = texto
  $('error').hidden = false
}

// ---------- Guardar ----------

// Mientras se guarda una decisión no se acepta otra (dos teclas muy seguidas irían al mismo lugar)
let guardando = false
async function decidir(decision) {
  if (guardando || !actual) return
  guardando = true
  const id = actual.id
  try {
    await enviar('/api/revisadas', { id, ...decision })
    revisadas.lugares[id] = { ...decision, fecha: new Date().toISOString() }
    if (actual?.id === id) irAlSiguiente(id)
    else pintarLista()
  } catch (error) {
    mostrarError(`No se ha guardado: ${error.message}. ¿Sigue abierta la ventana negra del servidor?`)
  } finally {
    guardando = false
  }
}

// El siguiente lugar por revisar de la lista, empezando después del actual
function irAlSiguiente(desde) {
  const lista = filtrados()
  const inicio = desde ? lugares.findIndex((l) => l.id === desde) : -1
  const despues = lugares.slice(inicio + 1).concat(lugares.slice(0, inicio + 1))
  const enLista = new Set(lista.map((l) => l.id))
  const siguiente =
    despues.find((l) => enLista.has(l.id) && l.id !== desde && estadoDe(l.id) === 'pendiente') ??
    despues.find((l) => enLista.has(l.id) && l.id !== desde)
  if (siguiente) return abrir(siguiente.id)
  actual = null
  $('ficha').hidden = true
  $('vacio').hidden = false
  $('vacio-titulo').textContent = lugares.some((l) => estadoDe(l.id) === 'pendiente')
    ? 'No hay más lugares con este filtro'
    : '¡No quedan lugares por revisar!'
  pintarLista()
}

$('guardar').addEventListener('click', () => elegidas.length && decidir({ fotos: elegidas }))
$('ninguna').addEventListener('click', () => decidir({ ninguna: true }))
$('saltar').addEventListener('click', () => irAlSiguiente(actual.id))

document.addEventListener('keydown', (e) => {
  if (!actual || $('ampliada').open || e.ctrlKey || e.metaKey || e.altKey) return
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
  const candidatas = candidatasDe(actual)
  if (e.key === 'Enter' && elegidas.length) decidir({ fotos: elegidas })
  else if (e.key === 'n' || e.key === 'N') decidir({ ninguna: true })
  else if (e.key === 's' || e.key === 'S') irAlSiguiente(actual.id)
  else if (/^[1-9]$/.test(e.key) && candidatas[+e.key - 1]) alternar(candidatas[+e.key - 1].clave)
  else return
  e.preventDefault()
})

// ---------- Fotos propias ----------

$('firma').value = leerLocal('fotos-firma', 'Foto propia')
$('firma').addEventListener('change', () => guardarLocal('fotos-firma', $('firma').value.trim() || 'Foto propia'))

// Se redibuja la foto más pequeña: el JPEG nuevo ya no lleva la posición, la fecha ni el modelo del móvil
async function reducir(archivo) {
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  const escala = Math.min(1, LADO_PROPIAS / Math.max(imagen.width, imagen.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(imagen.width * escala)
  lienzo.height = Math.round(imagen.height * escala)
  lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
  imagen.close()
  const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.85))
  return await new Promise((r) => {
    const lector = new FileReader()
    lector.onload = () => r(lector.result)
    lector.readAsDataURL(blob)
  })
}

$('archivo').addEventListener('change', async (e) => {
  const archivos = [...e.target.files]
  e.target.value = ''
  const autor = $('firma').value.trim() || 'Foto propia'
  for (const archivo of archivos) {
    try {
      const imagen = await reducir(archivo)
      const propia = await enviar('/api/propia', { id: actual.id, imagen, autor })
      ;(revisadas.propias[actual.id] ??= []).push(propia)
      if (elegidas.length < MAX_FOTOS) elegidas.push(`propia:${propia.archivo}`)
    } catch (error) {
      mostrarError(`No se ha podido añadir «${archivo.name}»: ${error.message}`)
    }
  }
  pintarFotos()
  pintarLista()
})

async function quitarPropia(c) {
  if (!confirm('¿Quitar esta foto tuya? Se borra de la carpeta del proyecto.')) return
  try {
    await enviar('/api/propia/quitar', { id: actual.id, archivo: c.archivo })
    revisadas.propias[actual.id] = (revisadas.propias[actual.id] ?? []).filter((p) => p.archivo !== c.archivo)
    const decision = revisadas.lugares[actual.id]
    if (decision?.fotos) {
      decision.fotos = decision.fotos.filter((clave) => clave !== c.clave)
      if (!decision.fotos.length) delete revisadas.lugares[actual.id]
    }
    pintarFotos()
    pintarLista()
  } catch (error) {
    mostrarError(`No se ha podido quitar: ${error.message}`)
  }
}

// ---------- Empezar ----------

irAlSiguiente(null)
