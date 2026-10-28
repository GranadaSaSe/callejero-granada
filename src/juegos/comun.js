// Piezas comunes de los juegos de la pestaña Jugar (src/vistas/jugar.js): guardar el estado de cada juego,
// los ajustes de qué preguntar y dónde, las cifras, la lista para repasar y las figuras del mapa.
import { crear } from '../crear.js'
import { TIPOS_DONDE } from '../donde-datos.js'
import { DISTRITOS } from '../ejes-lista.js'
import { notaDePregunta } from '../nota-pregunta.js'

export const VACIO = { type: 'FeatureCollection', features: [] }
export const coleccion = (features) => ({ type: 'FeatureCollection', features })
export const linea = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } })
export const punto = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } })
export const VERDE = '#2e7d32'
export const ROJO = '#d32f2f'

// Una calle (todas sus líneas) o un lugar (sus puntos) como figuras del mapa, con las propiedades dadas
export const figurasDe = (sitio, propiedades) => [
  ...(sitio.lineas ?? []).map((l) => linea(l, propiedades)),
  ...(sitio.puntos ?? []).map((p) => punto(p, typeof propiedades === 'function' ? propiedades(p) : propiedades)),
]
export const puntosDe = (sitio) => [...(sitio.lineas ?? []).flat(), ...(sitio.puntos ?? [])]

export function leerEstado(clave, porDefecto) {
  try {
    return { ...porDefecto, ...JSON.parse(localStorage.getItem(clave)) }
  } catch {
    return { ...porDefecto }
  }
}

export function guardarEstado(clave, estado) {
  try {
    localStorage.setItem(clave, JSON.stringify(estado))
  } catch {
    // Sin almacenamiento (modo privado): el récord dura solo mientras la app esté abierta
  }
}

// Apunta cómo ha ido un sitio: { bien, total, fallo } (fallo = si la última vez se falló)
export function apuntarSitio(items, id, acierto, extra = {}) {
  const antes = items[id] ?? { bien: 0, total: 0 }
  items[id] = { bien: antes.bien + (acierto ? 1 : 0), total: antes.total + 1, ...extra }
}

export const cifra = (numero, texto) => crear('div', { class: 'cifra' }, crear('strong', {}, numero), crear('span', {}, texto))

// Desplegables de qué preguntar (calles, lugares...) y en qué zona
export const elegirTipoYZona = (ajustes, cambiar) => [
  crear(
    'select',
    { 'aria-label': 'Qué preguntar', onchange: (e) => cambiar({ tipo: e.target.value }) },
    TIPOS_DONDE.map((t) => crear('option', { value: t.id, selected: t.id === ajustes.tipo }, t.nombre)),
  ),
  crear(
    'select',
    { 'aria-label': 'Zona', onchange: (e) => cambiar({ zona: e.target.value }) },
    ['Todos', ...DISTRITOS].map((d) => crear('option', { value: d, selected: d === ajustes.zona }, d === 'Todos' ? 'Toda Granada' : d)),
  ),
]

// Lista del final de la partida: [{ nombre, texto, enlace }]
export const paraRepasar = (filas) =>
  filas.length > 0 && [
    crear('h2', {}, 'Para repasar'),
    crear(
      'ul',
      { class: 'lista-notas' },
      filas.map((f) =>
        crear(
          'li',
          {},
          crear('strong', {}, f.nombre),
          crear('p', {}, f.texto),
          crear('div', { class: 'chips' }, crear('a', { class: 'chip', href: f.enlace }, 'Ver en el mapa')),
        ),
      ),
    ),
  ]

// Botón «✎ Nota» de una pregunta: sugerencias o quejas que van a Inicio → Notas
export const botonNota = (datos) =>
  crear('button', { class: 'boton-nota', title: 'Dejar una nota sobre esta pregunta', onclick: () => notaDePregunta(datos()) }, '✎ Nota')
