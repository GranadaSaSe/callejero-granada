// «¿Cómo podemos incorporarnos a la calle A desde la calle B?» (sale en el examen de 2022): girando a la
// derecha, a la izquierda o a cualquiera de los dos lados. Se calcula con la red de los trayectos
// (public/datos/red.json): se llega por B a su final, donde está A, y se mira hacia qué lados se puede
// entrar en A respetando su sentido y los giros prohibidos. Si A tiene dos calzadas, cuentan las dos.
//
// Solo cuando B termina en A (A es su inicio o su fin) y en ese extremo no hay tramos dudosos.
import { giroEntre, prepararRed } from '../../src/rutas.js'

const GIRO_MINIMO = 35 // grados: menos es seguir recto
const JUNTOS = 60 // metros: los cruces de las dos calzadas de una avenida cuentan como un solo sitio

const M_LON = 88800
const M_LAT = 110540
const metros = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)

export function incorporaciones(datosRed, calles) {
  const red = prepararRed(datosRed)
  // Pasos que llegan a cada cruce, por calle
  const llegandoA = red.nodos.map(() => [])
  for (const lista of red.saliendoDe) for (const paso of lista) llegandoA[paso.hacia].push(paso)
  // Cruces de cada calle
  const crucesDe = new Map()
  for (const t of red.tramos) {
    if (!t.nombre) continue
    if (!crucesDe.has(t.nombre)) crucesDe.set(t.nombre, new Set())
    crucesDe.get(t.nombre).add(t.a).add(t.b)
  }
  const resultado = new Map() // id de la calle B → [{ calle: A, giro }]
  for (const c of calles) {
    const lista = []
    for (const extremo of ['inicio', 'fin']) {
      if (c[extremo].length !== 1) continue
      const otra = c[extremo][0]
      const mios = crucesDe.get(c.nombre)
      const suyos = crucesDe.get(otra)
      if (!mios || !suyos) continue
      const comunes = [...mios].filter((n) => suyos.has(n))
      if (!comunes.length) continue
      // Todos los cruces comunes deben estar juntos (si se tocan en dos sitios distintos, no se sabe cuál es)
      if (comunes.some((n) => metros(red.nodos[n], red.nodos[comunes[0]]) > JUNTOS)) continue
      const giros = new Set()
      let dudoso = false
      for (const n of comunes) {
        for (const llega of llegandoA[n].filter((p) => p.tramo.nombre === c.nombre)) {
          if (llega.tramo.dudoso) dudoso = true
          for (const sale of red.saliendoDe[n].filter((p) => p.tramo.nombre === otra)) {
            if (sale.tramo.dudoso) dudoso = true
            if (red.prohibidos.has(`${llega.tramo.i},${n},${sale.tramo.i}`)) continue
            const g = giroEntre(llega, sale)
            if (Math.abs(g) > 150) continue // sería dar la vuelta
            if (Math.abs(g) > GIRO_MINIMO) giros.add(g > 0 ? 'derecha' : 'izquierda')
          }
        }
      }
      if (dudoso || !giros.size) continue
      lista.push({ calle: otra, giro: giros.size === 2 ? 'ambos' : [...giros][0] })
    }
    if (lista.length) resultado.set(c.id, lista)
  }
  return resultado
}
