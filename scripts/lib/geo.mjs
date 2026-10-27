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
