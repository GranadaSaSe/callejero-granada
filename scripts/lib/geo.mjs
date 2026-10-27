// Utilidades de geometría para los datos de OpenStreetMap descargados con `out geom`.
// Los puntos se manejan como [longitud, latitud].

const clave = ([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`

// Une las vías de una relación (límite de municipio, distrito o barrio) en anillos cerrados.
export function anillosDeRelacion(relacion, papel = 'outer') {
  const tramos = relacion.members
    .filter((m) => m.type === 'way' && m.geometry && (m.role || 'outer') === papel)
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]))
  const anillos = []
  while (tramos.length) {
    let anillo = tramos.shift()
    let cerrado = clave(anillo[0]) === clave(anillo.at(-1))
    while (!cerrado) {
      const fin = clave(anillo.at(-1))
      const i = tramos.findIndex((t) => clave(t[0]) === fin || clave(t.at(-1)) === fin)
      if (i === -1) break // anillo incompleto: se cierra tal cual
      const siguiente = tramos.splice(i, 1)[0]
      if (clave(siguiente[0]) !== fin) siguiente.reverse()
      anillo = anillo.concat(siguiente.slice(1))
      cerrado = clave(anillo[0]) === clave(anillo.at(-1))
    }
    anillos.push(anillo)
  }
  return anillos
}

export function puntoEnAnillo([x, y], anillo) {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

export function puntoEnRelacion(punto, relacion) {
  const dentro = anillosDeRelacion(relacion, 'outer').some((a) => puntoEnAnillo(punto, a))
  return dentro && !anillosDeRelacion(relacion, 'inner').some((a) => puntoEnAnillo(punto, a))
}

// Prepara una relación (municipio, distrito, barrio) para consultar muchas veces si un punto cae dentro.
export function prepararZona(relacion) {
  const exteriores = anillosDeRelacion(relacion, 'outer')
  const interiores = anillosDeRelacion(relacion, 'inner')
  const lons = exteriores.flat().map((p) => p[0])
  const lats = exteriores.flat().map((p) => p[1])
  const caja = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
  return {
    nombre: relacion.tags.name,
    exteriores,
    interiores,
    contiene: ([x, y]) =>
      x >= caja[0] && x <= caja[2] && y >= caja[1] && y <= caja[3] &&
      exteriores.some((a) => puntoEnAnillo([x, y], a)) &&
      !interiores.some((a) => puntoEnAnillo([x, y], a)),
  }
}

// Paso aproximado de grados a metros, suficiente para distancias dentro del área de Granada.
const LAT_REF = 37.17
const M_LON = Math.cos((LAT_REF * Math.PI) / 180) * 111320
const M_LAT = 110540
export const aMetros = ([lon, lat]) => [lon * M_LON, lat * M_LAT]
export const distancia = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)

export function longitud(linea) {
  let total = 0
  for (let i = 1; i < linea.length; i++) total += distancia(linea[i - 1], linea[i])
  return total
}

// Distancia en metros de un punto a un segmento [a, b] (todo en [lon, lat]).
export function distanciaASegmento(p, a, b) {
  const [px, py] = aMetros(p)
  const [ax, ay] = aMetros(a)
  const [bx, by] = aMetros(b)
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

// Simplifica una línea quitando puntos que se desvían menos de `tolerancia` metros (Douglas-Peucker).
export function simplificar(linea, tolerancia) {
  if (linea.length <= 2) return linea
  const conservar = new Array(linea.length).fill(false)
  conservar[0] = conservar[linea.length - 1] = true
  const pila = [[0, linea.length - 1]]
  while (pila.length) {
    const [i, j] = pila.pop()
    let peor = -1
    let maximo = tolerancia
    for (let k = i + 1; k < j; k++) {
      const d = distanciaASegmento(linea[k], linea[i], linea[j])
      if (d > maximo) {
        maximo = d
        peor = k
      }
    }
    if (peor !== -1) {
      conservar[peor] = true
      pila.push([i, peor], [peor, j])
    }
  }
  return linea.filter((_, k) => conservar[k])
}

export const redondear = (linea, decimales = 5) => linea.map(([lon, lat]) => [+lon.toFixed(decimales), +lat.toFixed(decimales)])

// Índice por cuadrícula para encontrar rápido los segmentos cercanos a un punto.
export function crearIndice(celdaMetros = 50) {
  const celdas = new Map()
  const celda = (p) => aMetros(p).map((v) => Math.floor(v / celdaMetros))
  return {
    anadir(a, b, dato) {
      const [cx, cy] = celda([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
      const k = `${cx},${cy}`
      if (!celdas.has(k)) celdas.set(k, [])
      celdas.get(k).push({ a, b, dato })
    },
    cercanos(p) {
      const [cx, cy] = celda(p)
      const lista = []
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) lista.push(...(celdas.get(`${x},${y}`) ?? []))
      return lista
    },
  }
}

// Coseno del ángulo entre dos segmentos: 1 = misma dirección, -1 = contraria, 0 = perpendiculares.
export function cosenoEntre([a1, b1], [a2, b2]) {
  const u = [(b1[0] - a1[0]) * M_LON, (b1[1] - a1[1]) * M_LAT]
  const v = [(b2[0] - a2[0]) * M_LON, (b2[1] - a2[1]) * M_LAT]
  return (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1)
}

// Centro de gravedad del anillo exterior más grande de una relación.
export function centroDeRelacion(relacion) {
  const anillos = anillosDeRelacion(relacion, 'outer')
  let mejor = null
  for (const anillo of anillos) {
    let area = 0
    let cx = 0
    let cy = 0
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i]
      const [xj, yj] = anillo[j]
      const f = xj * yi - xi * yj
      area += f
      cx += (xi + xj) * f
      cy += (yi + yj) * f
    }
    if (area !== 0 && (!mejor || Math.abs(area) > Math.abs(mejor.area))) {
      mejor = { area, punto: [cx / (3 * area), cy / (3 * area)] }
    }
  }
  return mejor?.punto ?? null
}
