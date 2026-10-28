// "¿Dónde está?" (paso 2.2): qué calles y lugares pueden salir, a cuántos metros se ha quedado el toque y
// cuántos puntos vale. No usa el navegador: se puede probar con Node.

export const PREGUNTAS_POR_PARTIDA = 10
export const ACIERTO_METROS = 100 // a esta distancia o menos cuenta como acertada (racha, progreso)

// Qué preguntar. "calles" = importancia máxima de las calles (1 = vía principal ... 6 = peatonal)
export const TIPOS_DONDE = [
  { id: 'principales', nombre: 'Calles principales', calles: 2 },
  { id: 'barrio', nombre: 'Calles principales y de barrio', calles: 4 },
  { id: 'todas', nombre: 'Todas las calles', calles: 6 },
  { id: 'lugares', nombre: 'Lugares de interés', lugares: true },
  { id: 'mezcla', nombre: 'Calles y lugares', calles: 4, lugares: true },
]

// 100 puntos a menos de 50 m; unos 70 a 200 m, unos 30 a 500 m y casi nada pasado 1 km
export const puntosPorDistancia = (metros) => (metros <= 50 ? 100 : Math.round(100 * Math.exp(-(metros - 50) / 400)))

export function veredicto(metros) {
  if (metros <= 50) return '¡Clavado!'
  if (metros <= ACIERTO_METROS) return '¡Muy cerca!'
  if (metros <= 400) return 'Cerca'
  if (metros <= 1000) return 'Lejos'
  return 'Muy lejos'
}

// Con espacio de no separación, para que el número y la unidad no queden en líneas distintas
export const textoMetros = (metros) =>
  metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1).replace('.', ',')} km`

// Paso aproximado de grados a metros, suficiente dentro de Granada (igual que en scripts/lib/geo.mjs)
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540

// Punto del segmento [a, b] más cercano a p, y a cuántos metros está
function enSegmento(p, a, b) {
  const dx = (b[0] - a[0]) * M_LON
  const dy = (b[1] - a[1]) * M_LAT
  const px = (p[0] - a[0]) * M_LON
  const py = (p[1] - a[1]) * M_LAT
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)))
  return { metros: Math.hypot(px - t * dx, py - t * dy), punto: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] }
}

// Distancia del toque al sitio buscado: a la calle (cualquiera de sus tramos) o al lugar
export function medir(sitio, toque) {
  let mejor = { metros: Infinity, punto: null }
  for (const linea of sitio.lineas ?? []) {
    for (let i = 1; i < linea.length; i++) {
      const cerca = enSegmento(toque, linea[i - 1], linea[i])
      if (cerca.metros < mejor.metros) mejor = cerca
    }
  }
  for (const punto of sitio.puntos ?? []) {
    const cerca = enSegmento(toque, punto, punto)
    if (cerca.metros < mejor.metros) mejor = cerca
  }
  return mejor
}

// Calles y lugares que pueden salir con estos ajustes. Si dos calles o dos lugares se llaman igual, son una
// sola pregunta y vale cualquiera de los dos sitios.
export function candidatas({ calles, tramos, lugares }, { tipo, zona }) {
  const ajuste = TIPOS_DONDE.find((t) => t.id === tipo) ?? TIPOS_DONDE[0]
  const enZona = (distritos) => zona === 'Todos' || distritos.includes(zona)
  const sitios = new Map()

  if (ajuste.calles) {
    const lineasDe = new Map()
    for (const f of tramos.features) {
      if (!lineasDe.has(f.properties.via)) lineasDe.set(f.properties.via, [])
      lineasDe.get(f.properties.via).push(f.geometry.coordinates)
    }
    for (const c of calles) {
      const lineas = lineasDe.get(c.id)
      if (!lineas || c.importancia > ajuste.calles || !enZona(c.distritos)) continue
      const clave = `calle:${c.nombre}`
      if (sitios.has(clave)) {
        sitios.get(clave).lineas.push(...lineas)
        continue
      }
      sitios.set(clave, {
        id: `c:${c.id}`,
        clase: 'calle',
        nombre: c.nombre,
        detalle: `${c.barrios.join(', ')} (${c.distritos.join(', ')})`,
        enlace: `#/mapa?calle=${c.id}`,
        calle: { id: c.id, nombre: c.nombre },
        lineas: [...lineas],
      })
    }
  }

  if (ajuste.lugares) {
    for (const l of lugares) {
      if (!l.punto || !enZona([l.distrito])) continue
      const clave = `lugar:${l.nombre}`
      if (sitios.has(clave)) {
        sitios.get(clave).puntos.push(l.punto)
        continue
      }
      sitios.set(clave, {
        id: `l:${l.id}`,
        clase: 'lugar',
        nombre: l.nombre,
        categoria: l.categoria,
        detalle: [l.categoria, l.direccion].filter(Boolean).join(' · '),
        enlace: `#/mapa?lugar=${l.id}`,
        lugar: { id: l.id, nombre: l.nombre },
        puntos: [l.punto],
      })
    }
  }
  return [...sitios.values()]
}

// Elige "cuantas" preguntas sin repetir. Lo que se falló la última vez sale con el triple de probabilidad.
// Lo usan todos los juegos de la pestaña Jugar; cada uno dice qué es haberlo fallado.
export function elegir(lista, cuantas, falladoLaUltimaVez = () => false, azar = Math.random) {
  return lista
    .map((sitio) => {
      const peso = falladoLaUltimaVez(sitio) ? 3 : 1
      return { sitio, clave: azar() ** (1 / peso) }
    })
    .sort((a, b) => b.clave - a.clave)
    .slice(0, cuantas)
    .map((x) => x.sitio)
}
