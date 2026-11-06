// Trayectos (Fase 3): calcula el mejor camino por la red de calles (public/datos/red.json) respetando los sentidos
// de circulación y los giros prohibidos. No usa el navegador: se puede probar con Node.

// Paso aproximado de grados a metros, suficiente dentro de Granada (igual que en scripts/lib/geo.mjs)
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540

// Velocidad de cada importancia de calle en km/h (0 = autovía, 1 = vía principal ... 6 = sin clasificar). La autovía
// cuenta menos de lo que se corre por ella: entrar y salir lleva tiempo y por una distancia corta no compensa.
const VELOCIDAD = { 0: 65, 1: 50, 2: 40, 3: 35, 4: 25, 5: 15, 6: 15 }
const GIRO_S = 6 // segundos que se pierden en cada giro
const VUELTA_S = 90 // dar la vuelta en un cruce solo se hace si no hay más remedio
const LIMITADO_POR = 8 // una calle con el paso limitado solo se usa si no hay otra (cuesta 8 veces más)
const DUDOSO = 1
const LIMITADO = 2

// Puntos de salida de los trayectos (paso 3.2): "lugar" es su id en lugares.json y "calle", la calle a la que da la
// puerta. Hay que decirla porque lo más cercano puede ser otra: el Parque Norte tiene Calle Noria justo detrás.
export const PARQUES = [
  { id: 'norte', nombre: 'Parque de Bomberos Norte', lugar: 'w124393197', calle: 'Avenida Juan Pablo II' },
  { id: 'sur', nombre: 'Parque de Bomberos Sur', lugar: 'w51730864', calle: 'Calle Antonio Dalmases' },
]

// Prepara los datos de red.json para calcular rutas
export function prepararRed(datos) {
  const tramos = datos.tramos.map(([id, nombre, a, b, s, m, importancia, marcas, plano], i) => {
    const linea = []
    for (let j = 0; j < plano.length; j += 2) linea.push([plano[j], plano[j + 1]])
    return { i, id, nombre, a, b, s, m, importancia, dudoso: Boolean(marcas & DUDOSO), limitado: Boolean(marcas & LIMITADO), linea }
  })
  const saliendoDe = datos.nodos.map(() => [])
  for (const t of tramos) for (const paso of sentidosDe(t)) saliendoDe[paso.aFavor ? t.a : t.b].push(paso)
  // Las formas de recorrer en contra dirección los tramos de sentido único: solo para inventar respuestas falsas
  // (paso 3.3) y para comprobar si un tramo dudoso podría recorrerse al revés
  const contraDesde = datos.nodos.map(() => [])
  for (const t of tramos) for (const paso of contraDe(t)) contraDesde[paso.aFavor ? t.a : t.b].push(paso)
  const prohibidos = new Set(datos.prohibidos.map(([de, nodo, a]) => `${de},${nodo},${a}`))
  return { nodos: datos.nodos, tramos, saliendoDe, contraDesde, prohibidos, aislados: new Set(datos.aislados) }
}

// Las formas de recorrer un tramo según su sentido. "aFavor" = de su cruce a a su cruce b
const sentidosDe = (t) => [
  ...(t.s !== 'r' ? [{ tramo: t, hacia: t.b, aFavor: true, k: 0 }] : []),
  ...(t.s !== 'd' ? [{ tramo: t, hacia: t.a, aFavor: false, k: 0 }] : []),
]
const contraDe = (t) => [
  ...(t.s === 'r' ? [{ tramo: t, hacia: t.b, aFavor: true, contra: true, k: 0 }] : []),
  ...(t.s === 'd' ? [{ tramo: t, hacia: t.a, aFavor: false, contra: true, k: 0 }] : []),
]

// Si pasar de un tramo a otro en un cruce es un giro prohibido
export const esProhibido = (red, paso, siguiente) => red.prohibidos.has(`${paso.tramo.i},${paso.hacia},${siguiente.tramo.i}`)

// Todas las formas de salir de un cruce: las permitidas y, además, las de en contra dirección
export const salidasDe = (red, nodo) => [...red.saliendoDe[nodo], ...red.contraDesde[nodo]]

// El punto de la red más cercano a unas coordenadas: { tramo, f, metros }. "f" dice por dónde del tramo cae (0 = en su
// cruce a, 1 = en su cruce b) y "metros", lo lejos que queda. Con `calle`, solo entre los tramos de esa calle. Nunca
// en un tramo aislado: desde ellos no se puede ir a todas partes.
export function puntoEnRed(red, coordenadas, calle = null) {
  const px = coordenadas[0] * M_LON
  const py = coordenadas[1] * M_LAT
  let mejor = null
  for (const tramo of red.tramos) {
    if ((calle && tramo.nombre !== calle) || red.aislados.has(tramo.a) || red.aislados.has(tramo.b)) continue
    const trozos = tramo.linea.slice(1).map((b, i) => {
      const [ax, ay] = [tramo.linea[i][0] * M_LON, tramo.linea[i][1] * M_LAT]
      const [dx, dy] = [b[0] * M_LON - ax, b[1] * M_LAT - ay]
      return { ax, ay, dx, dy, largo: Math.hypot(dx, dy) }
    })
    const total = trozos.reduce((s, t) => s + t.largo, 0) || 1
    let recorrido = 0
    for (const { ax, ay, dx, dy, largo } of trozos) {
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (largo * largo || 1)))
      const metros = Math.hypot(px - ax - t * dx, py - ay - t * dy)
      if (!mejor || metros < mejor.metros) mejor = { tramo, f: (recorrido + t * largo) / total, metros }
      recorrido += largo
    }
  }
  return mejor
}

// El punto de la red donde está la puerta de un parque. `lugares`: los de lugares.json
export function puntoDeParque(red, parque, lugares) {
  return puntoEnRed(red, lugares.find((l) => l.id === parque.lugar).punto, parque.calle)
}

const rumbo = (a, b) => Math.atan2((b[0] - a[0]) * M_LON, (b[1] - a[1]) * M_LAT)
// Línea del tramo en el sentido en que se recorre
const lineaDe = (paso) => (paso.aFavor ? paso.tramo.linea : [...paso.tramo.linea].reverse())

// Grados que se gira al pasar de un tramo a otro: 0 = recto, positivo = a la derecha, negativo = a la izquierda
export function giroEntre(paso, siguiente) {
  const l1 = lineaDe(paso)
  const l2 = lineaDe(siguiente)
  let g = ((rumbo(l2[0], l2[1]) - rumbo(l1.at(-2), l1.at(-1))) * 180) / Math.PI
  while (g > 180) g -= 360
  while (g < -180) g += 360
  return g
}

const costeDe = (tramo) => {
  const segundos = (tramo.m * 3.6) / VELOCIDAD[tramo.importancia]
  return tramo.limitado ? segundos * LIMITADO_POR : segundos
}

// Lista ordenada por coste para sacar siempre el camino más barato
function crearCola() {
  const lista = []
  return {
    poner(coste, dato) {
      lista.push({ coste, dato })
      let i = lista.length - 1
      while (i > 0) {
        const p = (i - 1) >> 1
        if (lista[p].coste <= lista[i].coste) break
        ;[lista[p], lista[i]] = [lista[i], lista[p]]
        i = p
      }
    },
    sacar() {
      const primero = lista[0]
      const ultimo = lista.pop()
      if (lista.length) {
        lista[0] = ultimo
        for (let i = 0; ;) {
          const iz = 2 * i + 1
          const de = iz + 1
          let m = i
          if (iz < lista.length && lista[iz].coste < lista[m].coste) m = iz
          if (de < lista.length && lista[de].coste < lista[m].coste) m = de
          if (m === i) break
          ;[lista[m], lista[i]] = [lista[i], lista[m]]
          i = m
        }
      }
      return primero
    },
    get vacia() {
      return !lista.length
    },
  }
}

// Parte del tramo que queda por delante de un punto, yendo en el sentido del paso
const queda = (paso, punto) => (paso.aFavor ? 1 - punto.f : punto.f)

// El mejor camino entre dos puntos de la red (los de `puntoEnRed`). Se avanza de tramo en tramo (no de cruce en cruce)
// porque un giro prohibido depende de por dónde se llega. El destino también puede ser una calle, `{ calle: nombre }`:
// se llega al entrar en ella. Opciones:
// - sinDudosos: no pasa por tramos con el sentido por revisar.
// - evitar: nombres de calles por las que no se puede pasar (para buscar otros caminos).
// - contra, sinProhibidos: también en contra dirección o con giros prohibidos (para inventar respuestas falsas). Si
//   "contra" es un número, son los segundos que cuesta cada vez que se entra en contra dirección (para que solo
//   lo haga en un sitio).
// - secuencia: lista de nombres de calles que hay que seguir en ese orden, como las de `itinerario` (los tramos sin
//   nombre se pueden usar en cualquier momento). Sirve para ver si una lista de calles se puede recorrer.
// - dudososLibres: los tramos dudosos se pueden recorrer en los dos sentidos (por si su sentido es el otro).
// Devuelve { pasos: [{ tramo, hacia, aFavor, contra, metros }], metros, segundos } o null si no se puede llegar.
export function calcularRuta(red, origen, destino, opciones = {}) {
  const { sinDudosos, evitar, contra, sinProhibidos, secuencia, dudososLibres } = opciones
  const entrarEnContra = typeof contra === 'number' ? contra : 0
  const vale = (p) => !(sinDudosos && p.tramo.dudoso) && !evitar?.has(p.tramo.nombre) && (!p.contra || contra || (dudososLibres && p.tramo.dudoso))
  const salidas = contra || dudososLibres ? (nodo) => salidasDe(red, nodo) : (nodo) => red.saliendoDe[nodo]
  // Con `secuencia`, "k" es la calle de la lista por la que se va. Sin ella, siempre 0.
  const ultimaK = secuencia ? secuencia.length - 1 : 0
  const siguienteK = (k, nombre) => {
    if (!secuencia || !nombre || nombre === secuencia[k]) return k
    return nombre === secuencia[k + 1] ? k + 1 : -1
  }
  const esDestino = (paso) => (destino.calle ? paso.tramo.nombre === destino.calle : paso.tramo === destino.tramo)
  // El tramo de salida lleva clave propia: se puede volver a pasar por él entero después de dar la vuelta a la manzana
  const clavePaso = (p) => ((p.inicio ? -1 : 1) * (p.tramo.i * 2 + (p.aFavor ? 1 : 2))) * 128 + p.k
  const costeFinal = destino.calle ? 0 : costeDe(destino.tramo)
  let llegada = null
  const probar = (coste, paso) => {
    if (paso.k === ultimaK && (!llegada || coste < llegada.coste)) llegada = { coste, paso }
  }
  const mejor = new Map()
  const previo = new Map()
  const cola = crearCola()
  const salida = [...sentidosDe(origen.tramo), ...contraDe(origen.tramo)].filter(vale)
  for (const paso of salida.map((p) => ({ ...p, inicio: true, k: siguienteK(0, p.tramo.nombre) })).filter((p) => p.k === 0)) {
    // En el mismo tramo y con el destino por delante se llega sin salir de él
    const falta = destino.calle ? 0 : queda(paso, origen) - queda(paso, destino)
    if (esDestino(paso) && falta >= 0) probar(falta * costeFinal, paso)
    const coste = queda(paso, origen) * costeDe(paso.tramo) + (paso.contra ? entrarEnContra : 0)
    mejor.set(clavePaso(paso), coste)
    cola.poner(coste, paso)
  }
  while (!cola.vacia) {
    const { coste, dato: paso } = cola.sacar()
    if (llegada && coste - costeFinal >= llegada.coste) break
    if (coste > mejor.get(clavePaso(paso))) continue
    // Se entra en el tramo de destino por su principio: se para a mitad (o a la entrada, si el destino es una calle)
    if (!paso.inicio && esDestino(paso)) probar(destino.calle ? coste - costeDe(paso.tramo) : coste - queda(paso, destino) * costeFinal, paso)
    for (const sig of salidas(paso.hacia)) {
      if (!vale(sig) || sig.tramo === paso.tramo) continue // sin dar la vuelta en el mismo tramo
      if (!sinProhibidos && esProhibido(red, paso, sig)) continue
      const k = siguienteK(paso.k, sig.tramo.nombre)
      if (k < 0) continue
      const giro = Math.abs(giroEntre(paso, sig))
      // Seguir por la misma calle no es girar, aunque haga curva: una rotonda son muchos trocitos con el mismo nombre
      const girar = giro > 150 ? VUELTA_S : giro > 35 && sig.tramo.nombre !== paso.tramo.nombre ? GIRO_S : 0
      const c = coste + costeDe(sig.tramo) + girar + (sig.contra && !paso.contra ? entrarEnContra : 0)
      const nuevo = k === sig.k ? sig : { ...sig, k }
      const ks = clavePaso(nuevo)
      if (!mejor.has(ks) || c < mejor.get(ks)) {
        mejor.set(ks, c)
        previo.set(ks, paso)
        cola.poner(c, nuevo)
      }
    }
  }
  if (!llegada) return null
  const pasos = []
  for (let p = llegada.paso; p; p = previo.get(clavePaso(p))) pasos.unshift({ tramo: p.tramo, hacia: p.hacia, aFavor: p.aFavor, contra: Boolean(p.contra), metros: p.tramo.m })
  const primero = pasos[0]
  const ultimo = pasos.at(-1)
  // Parte de cada tramo que se recorre: [desde, hasta] medidos en el sentido de la marcha (0 = principio, 1 = final)
  for (const p of pasos) p.trozo = [0, 1]
  primero.trozo[0] = 1 - queda(primero, origen)
  if (destino.calle) ultimo.trozo = primero === ultimo ? [primero.trozo[0], primero.trozo[0]] : [0, 0]
  else ultimo.trozo[1] = 1 - queda(ultimo, destino)
  for (const p of pasos) p.metros = p.tramo.m * Math.max(0, p.trozo[1] - p.trozo[0])
  return { pasos, metros: Math.round(pasos.reduce((s, p) => s + p.metros, 0)), segundos: Math.round(llegada.coste) }
}

// El trayecto contado calle a calle: [{ calle, metros, giro, desde }], donde "giro" es cómo se entra en esa calle
// ("derecha", "izquierda" o "" al empezar o si se sigue recto) y "desde", su primer paso en `ruta.pasos`. Los tramos
// sin nombre se juntan con el anterior.
export function itinerario(ruta) {
  const partes = []
  ruta.pasos.forEach((paso, i) => {
    const nombre = paso.tramo.nombre
    const ultima = partes.at(-1)
    if (ultima && (!nombre || nombre === ultima.calle)) {
      ultima.metros += paso.metros
      return
    }
    let giro = ''
    if (i) {
      const g = giroEntre(ruta.pasos[i - 1], paso)
      if (Math.abs(g) > 35) giro = g > 0 ? 'derecha' : 'izquierda'
    }
    partes.push({ calle: nombre, metros: paso.metros, giro, desde: i })
  })
  return partes.map((p) => ({ ...p, metros: Math.round(p.metros) }))
}

// La línea de una ruta para dibujarla, en el sentido de la marcha y cortando el primer y el último tramo
export function lineaDeRuta(ruta) {
  const puntos = []
  for (const paso of ruta.pasos) {
    const trozo = trozoDeLinea(lineaDe(paso), paso.trozo[0], paso.trozo[1])
    puntos.push(...(puntos.length ? trozo.slice(1) : trozo))
  }
  return puntos
}

// Parte de una línea entre dos fracciones de su largo (0 = principio, 1 = final)
function trozoDeLinea(linea, desde, hasta) {
  const largos = linea.slice(1).map((b, i) => Math.hypot((b[0] - linea[i][0]) * M_LON, (b[1] - linea[i][1]) * M_LAT))
  const total = largos.reduce((s, l) => s + l, 0) || 1
  const enPunto = (f) => {
    let falta = f * total
    for (let i = 0; i < largos.length; i++) {
      if (falta <= largos[i] || i === largos.length - 1) {
        const t = largos[i] ? Math.min(1, falta / largos[i]) : 0
        return { i, punto: [linea[i][0] + t * (linea[i + 1][0] - linea[i][0]), linea[i][1] + t * (linea[i + 1][1] - linea[i][1])] }
      }
      falta -= largos[i]
    }
    return { i: 0, punto: linea[0] }
  }
  const a = enPunto(desde)
  const b = enPunto(hasta)
  return [a.punto, ...linea.slice(a.i + 1, b.i + 1), b.punto]
}
