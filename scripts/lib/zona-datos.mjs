// Zona de los parques de bomberos de Granada (paso 2.5): municipios, salidas de autovía y cómo se llega a
// cada pueblo desde Granada, a partir de lo descargado de OpenStreetMap. No escribe archivos: lo usa
// scripts/procesar-datos.mjs y se puede probar con Node.
import { anillosDeRelacion, centroDeAnillos, crearIndice, distancia, distanciaASegmento, prepararZona } from './geo.mjs'
import { PARTE_DE_MUNICIPIO } from './zona-parques.mjs'

const unicos = (lista) => [...new Set(lista)]
const separar = (valor) =>
  (valor ?? '')
    .split(';')
    .map((x) => x.replaceAll('_', ' ').trim())
    .filter(Boolean)
// Códigos de una vía sin los europeos (E-902) si tiene otro
export function codigos(tags) {
  const todos = separar(tags.ref)
  const nacionales = todos.filter((r) => !r.startsWith('E-'))
  return nacionales.length ? nacionales : todos
}

// Hacia dónde se va por cada autovía según aumenten o bajen los números de salida (los kilómetros)
export const SENTIDOS_AUTOVIA = {
  'A-92': { creciente: 'Almería', decreciente: 'Sevilla' },
  'A-44': { creciente: 'Motril', decreciente: 'Jaén' },
  'GR-30': { creciente: 'Motril', decreciente: 'Jaén' },
  'GR-43': { creciente: 'Granada', decreciente: 'Córdoba' },
  'A-395': { creciente: 'Sierra Nevada', decreciente: 'Granada' },
}

// Salidas mal etiquetadas en OpenStreetMap (por el número del punto de OSM)
const CORRECCIONES_SALIDAS = {
  13830104: { numero: '221' }, // A-92: pone "22"; es el otro sentido de la 221 (Láchar, Peñuelas)
  33245397: { carretera: 'A-44' }, // la 142 es de la A-44 (enlace con la GR-30), no de la GR-30
  21478788: { numero: '16', carretera: 'GR-30' }, // pone "12", pero su número antiguo es el 132: la 16 de la GR-30
}

// 1. Municipios de la zona: { nombre, parte, pueblo, centro, zona (prepararZona), vecinos }
export function municipiosDeLaZona(elementos) {
  const nodos = new Map(elementos.filter((e) => e.type === 'node').map((n) => [n.id, n]))
  const relaciones = elementos.filter(
    (e) => e.type === 'relation' && PARTE_DE_MUNICIPIO[e.tags.name] && (e.tags['ine:municipio'] ?? '18').startsWith('18'),
  )
  const faltan = Object.keys(PARTE_DE_MUNICIPIO).filter((n) => !relaciones.some((r) => r.tags.name === n))
  const municipios = relaciones.map((r) => {
    const zona = prepararZona(r)
    const miembro = r.members.find((m) => m.role === 'admin_centre' && m.type === 'node')
    const nodo = miembro && nodos.get(miembro.ref)
    const centro = miembro ? [miembro.lon ?? nodo?.lon, miembro.lat ?? nodo?.lat] : centroDeAnillos(zona.exteriores)
    const pueblo = nodo?.tags?.name && nodo.tags.name !== r.tags.name ? nodo.tags.name : null
    return { nombre: r.tags.name, parte: PARTE_DE_MUNICIPIO[r.tags.name], pueblo, centro, zona, vecinos: [] }
  })
  // Dos municipios son vecinos si su límite comparte puntos (en OpenStreetMap es la misma línea)
  const enPunto = new Map()
  for (const m of municipios) {
    for (const p of anillosDeRelacion(relaciones.find((r) => r.tags.name === m.nombre)).flat()) {
      const k = `${p[0]},${p[1]}`
      if (!enPunto.has(k)) enPunto.set(k, new Set())
      enPunto.get(k).add(m.nombre)
    }
  }
  const compartidos = new Map()
  for (const nombres of enPunto.values()) {
    if (nombres.size < 2) continue
    for (const a of nombres) for (const b of nombres) if (a !== b) compartidos.set(`${a}|${b}`, (compartidos.get(`${a}|${b}`) ?? 0) + 1)
  }
  for (const m of municipios) {
    m.vecinos = municipios.filter((o) => (compartidos.get(`${m.nombre}|${o.nombre}`) ?? 0) >= 2).map((o) => o.nombre)
  }
  return { municipios, faltan }
}

// Número de salida como número (para ordenar y comparar): "231B" → 231, "5 A-B" → 5
const valor = (numero) => parseFloat(numero) || null

// 2. Salidas de autovía dentro de la zona, una por autovía y número, con los destinos de cada sentido
export function salidasDeLaZona(elementos, municipios) {
  const caminos = elementos.filter((e) => e.type === 'way')
  const municipioDe = (p) => municipios.find((m) => m.zona.contiene(p))?.nombre ?? null
  // Autovía de cada punto, y un índice de sus tramos para las salidas que no están justo encima
  const autoviaDeNodo = new Map()
  const indice = crearIndice(300)
  for (const w of caminos) {
    if (!/^(motorway|trunk)$/.test(w.tags.highway) || !w.tags.ref) continue
    const codigo = codigos(w.tags)[0]
    w.nodes.forEach((n, i) => {
      autoviaDeNodo.set(n, { codigo, camino: w, i })
      if (i > 0) indice.anadir([w.geometry[i - 1].lon, w.geometry[i - 1].lat], [w.geometry[i].lon, w.geometry[i].lat], codigo)
    })
  }
  const ramalesDesde = new Map()
  for (const w of caminos) {
    if (!w.tags.highway.endsWith('_link')) continue
    if (!ramalesDesde.has(w.nodes[0])) ramalesDesde.set(w.nodes[0], [])
    ramalesDesde.get(w.nodes[0]).push(w)
  }

  const puntos = elementos
    .filter((e) => e.type === 'node' && e.tags?.highway === 'motorway_junction')
    .map((n) => {
      const correccion = CORRECCIONES_SALIDAS[n.id] ?? {}
      const punto = [n.lon, n.lat]
      const sobre = autoviaDeNodo.get(n.id)
      const cercana = indice
        .cercanos(punto)
        .map((s) => ({ codigo: s.dato, d: distanciaASegmento(punto, s.a, s.b) }))
        .sort((a, b) => a.d - b.d)[0]
      const ramales = ramalesDesde.get(n.id) ?? []
      // Dirección de la calzada en ese punto, para saber el sentido
      let rumbo = null
      if (sobre) {
        const g = sobre.camino.geometry
        const j = Math.min(sobre.i + 1, g.length - 1)
        const k = j === sobre.i ? sobre.i - 1 : sobre.i
        rumbo = [g[j].lon - g[k].lon, g[j].lat - g[k].lat]
      }
      return {
        id: n.id,
        carretera: correccion.carretera ?? sobre?.codigo ?? (cercana?.d < 300 ? cercana.codigo : null),
        numero: correccion.numero ?? n.tags.ref ?? null,
        destinos: unicos([...separar(n.tags.exit_to), ...ramales.flatMap((r) => separar(r.tags.destination))]),
        carreterasDestino: unicos(ramales.flatMap((r) => separar(r.tags['destination:ref']))),
        punto,
        rumbo,
      }
    })
    .filter((p) => p.carretera && municipioDe(p.punto))

  // Las salidas sin número toman el de la salida más cercana de la misma autovía con algún destino igual
  for (const p of puntos) {
    if (p.numero) continue
    const pareja = puntos
      .filter((o) => o.numero && o.carretera === p.carretera && distancia(o.punto, p.punto) < 1500)
      .filter((o) => !p.destinos.length || o.destinos.some((d) => p.destinos.includes(d)))
      .sort((a, b) => distancia(a.punto, p.punto) - distancia(b.punto, p.punto))[0]
    if (pareja) p.numero = pareja.numero
  }

  // Sentido de cada punto: hacia donde crecen los números de salida de esa autovía
  const sentidoDe = (p) => {
    const n = valor(p.numero)
    if (n === null || !p.rumbo) return null
    const otros = puntos.filter((o) => o.carretera === p.carretera && valor(o.numero) !== null && valor(o.numero) !== n)
    const antes = otros.filter((o) => valor(o.numero) < n).sort((a, b) => valor(b.numero) - valor(a.numero))[0]
    const despues = otros.filter((o) => valor(o.numero) > n).sort((a, b) => valor(a.numero) - valor(b.numero))[0]
    const [de, a] = [antes?.punto ?? p.punto, despues?.punto ?? p.punto]
    const hacia = [a[0] - de[0], a[1] - de[1]]
    if (!hacia[0] && !hacia[1]) return null
    return hacia[0] * p.rumbo[0] + hacia[1] * p.rumbo[1] > 0 ? 'creciente' : 'decreciente'
  }

  const grupos = new Map()
  for (const p of puntos) {
    if (!p.numero && !p.destinos.length) continue // ni número ni carteles: no sirve para estudiar
    // Sin número: va con la del otro sentido (misma autovía, cerca y con algún destino igual)
    const gemela = p.numero
      ? null
      : [...grupos].find(([, ps]) =>
          ps.some((o) => !o.numero && o.carretera === p.carretera && distancia(o.punto, p.punto) < 1000 && o.destinos.some((d) => p.destinos.includes(d))),
        )
    const clave = p.numero ? `${p.carretera}|${p.numero}` : (gemela?.[0] ?? `${p.carretera}|${p.id}`)
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(p)
  }
  const salidas = [...grupos.values()].map((ps) => {
    const { carretera, numero } = ps[0]
    const sentidos = ps
      .map((p) => {
        const sentido = sentidoDe(p)
        return { nodo: p.id, sentido, hacia: sentido ? (SENTIDOS_AUTOVIA[carretera]?.[sentido] ?? null) : null, destinos: p.destinos }
      })
      .filter((s) => s.destinos.length)
    return {
      id: `${carretera}|${numero ?? ps[0].id}`,
      carretera,
      numero,
      destinos: unicos(ps.flatMap((p) => p.destinos)),
      carreterasDestino: unicos(ps.flatMap((p) => p.carreterasDestino)),
      sentidos,
      municipio: municipioDe(ps[0].punto),
      punto: ps[0].punto,
      nodos: ps.map((p) => p.id),
    }
  })
  return salidas.sort((a, b) => a.carretera.localeCompare(b.carretera) || (valor(a.numero) ?? 1e9) - (valor(b.numero) ?? 1e9))
}

// 3. Cómo se llega a cada pueblo desde Granada: el camino más rápido por la red de carreteras, saliendo
// del centro de Granada y llegando al pueblo principal de cada municipio. Las calles no están en la red:
// dentro de Granada, al cruzar un pueblo o al final del camino se cuentan en línea recta a 20 km/h.
const VELOCIDAD = { motorway: 110, trunk: 90, primary: 70, secondary: 65, tertiary: 55, unclassified: 45 } // km/h
const velocidad = (tipo) => (tipo.endsWith('_link') ? 50 : (VELOCIDAD[tipo] ?? 40))
const esAutovia = (tipo) => /^(motorway|trunk)$/.test(tipo) // la calzada, sin los enlaces
const CALLES_KMH = 20
const segundosPorCalles = (metros) => metros / ((CALLES_KMH * 1000) / 3600)
const CENTRO_GRANADA = [-3.5988, 37.1734] // Ayuntamiento (Plaza del Carmen)
const ATAJO_M = 150 // el extremo de una carretera se une por calles con las que pasan a menos de esto
const LLEGADA_M = 2500 // el camino acaba en un punto de la red a menos de esto del pueblo

// Cola de prioridad sencilla (montículo) para el camino más rápido
function crearCola() {
  const cola = []
  return {
    vacia: () => cola.length === 0,
    meter(prioridad, dato) {
      cola.push([prioridad, dato])
      for (let i = cola.length - 1; i > 0; ) {
        const padre = (i - 1) >> 1
        if (cola[padre][0] <= cola[i][0]) break
        ;[cola[padre], cola[i]] = [cola[i], cola[padre]]
        i = padre
      }
    },
    sacar() {
      const primero = cola[0]
      const ultimo = cola.pop()
      if (cola.length) {
        cola[0] = ultimo
        for (let i = 0; ; ) {
          const [l, r] = [2 * i + 1, 2 * i + 2]
          let m = i
          if (l < cola.length && cola[l][0] < cola[m][0]) m = l
          if (r < cola.length && cola[r][0] < cola[m][0]) m = r
          if (m === i) break
          ;[cola[m], cola[i]] = [cola[i], cola[m]]
          i = m
        }
      }
      return primero
    },
  }
}

export function accesosDesdeGranada(elementos, municipios, salidas) {
  const caminos = elementos.filter((e) => e.type === 'way')
  const posicion = new Map()
  const viasDeNodo = new Map() // nodo → vías que pasan por él
  const aristas = new Map() // nodo → [{ a, segundos, camino }] (camino null = por calles)
  const anadir = (de, a, segundos, camino) => {
    if (!aristas.has(de)) aristas.set(de, [])
    aristas.get(de).push({ a, segundos, camino })
  }
  for (const w of caminos) {
    const t = w.tags
    const soloIda =
      t.oneway === 'yes' || t.oneway === '1' || t.junction === 'roundabout' || t.junction === 'circular' || (/^motorway/.test(t.highway) && t.oneway !== 'no')
    const soloVuelta = t.oneway === '-1'
    w.nodes.forEach((n, i) => {
      posicion.set(n, [w.geometry[i].lon, w.geometry[i].lat])
      if (!viasDeNodo.has(n)) viasDeNodo.set(n, [])
      viasDeNodo.get(n).push(w)
      if (i === 0) return
      const segundos = distancia(posicion.get(w.nodes[i - 1]), posicion.get(n)) / ((velocidad(t.highway) * 1000) / 3600)
      if (!soloVuelta) anadir(w.nodes[i - 1], n, segundos, w)
      if (!soloIda) anadir(n, w.nodes[i - 1], segundos, w)
    })
  }
  // A una autovía solo se entra y se sale por sus enlaces: los puntos de su calzada no valen para atajos,
  // salida ni llegada (los de los enlaces sí: un enlace puede acabar en un camino que no está en la red)
  const deCalle = (n) => !viasDeNodo.get(n).some((w) => esAutovia(w.tags.highway))

  // Atajos por calles: el extremo de una carretera se une con el punto más cercano de cada otra carretera
  // que pase cerca (así se cruza un pueblo de una carretera a otra)
  const rejilla = new Map()
  const celda = (p) => [Math.floor((p[0] * 89000) / ATAJO_M), Math.floor((p[1] * 110540) / ATAJO_M)]
  for (const [n, p] of posicion) {
    if (!deCalle(n)) continue
    const k = celda(p).join()
    if (!rejilla.has(k)) rejilla.set(k, [])
    rejilla.get(k).push(n)
  }
  for (const w of caminos) {
    if (esAutovia(w.tags.highway)) continue
    for (const n of [w.nodes[0], w.nodes.at(-1)]) {
      if (!deCalle(n)) continue
      const p = posicion.get(n)
      const [cx, cy] = celda(p)
      const masCerca = new Map() // vía → { o, d }
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (let y = cy - 1; y <= cy + 1; y++) {
          for (const o of rejilla.get(`${x},${y}`) ?? []) {
            if (o === n || viasDeNodo.get(o).includes(w)) continue
            const d = distancia(p, posicion.get(o))
            if (d > ATAJO_M) continue
            for (const v of viasDeNodo.get(o)) if (!masCerca.has(v) || d < masCerca.get(v).d) masCerca.set(v, { o, d })
          }
        }
      }
      for (const { o, d } of masCerca.values()) {
        anadir(n, o, segundosPorCalles(d), null)
        anadir(o, n, segundosPorCalles(d), null)
      }
    }
  }

  // Camino más rápido desde el centro de Granada: se sale por calles a cualquier carretera del término
  const granada = municipios.find((m) => m.nombre === 'Granada')
  const tiempo = new Map()
  const anterior = new Map()
  const cola = crearCola()
  for (const [n, p] of posicion) {
    if (!deCalle(n) || !granada.zona.contiene(p)) continue
    const t = segundosPorCalles(distancia(CENTRO_GRANADA, p))
    tiempo.set(n, t)
    cola.meter(t, n)
  }
  while (!cola.vacia()) {
    const [t, n] = cola.sacar()
    if (t > tiempo.get(n)) continue
    for (const { a, segundos, camino } of aristas.get(n) ?? []) {
      if (t + segundos < (tiempo.get(a) ?? Infinity)) {
        tiempo.set(a, t + segundos)
        anterior.set(a, { n, camino })
        cola.meter(t + segundos, a)
      }
    }
  }

  const salidaDeNodo = new Map(salidas.flatMap((s) => s.nodos.map((n) => [n, s])))
  // Kilómetro aproximado de un punto de una autovía: el número de la salida más cercana
  const kmEn = (carretera, p) =>
    salidas
      .filter((s) => s.carretera === carretera && valor(s.numero) !== null)
      .map((s) => ({ km: valor(s.numero), d: distancia(s.punto, p) }))
      .sort((a, b) => a.d - b.d)[0]?.km ?? null

  const accesos = {}
  for (const m of municipios) {
    if (m.nombre === 'Granada') continue
    // Llegada: el punto de la red desde el que antes se llega al pueblo (contando las calles del final)
    let llegada = null
    for (const [n, p] of posicion) {
      if (!tiempo.has(n) || !deCalle(n)) continue
      const d = distancia(p, m.centro)
      if (d > LLEGADA_M) continue
      const total = tiempo.get(n) + segundosPorCalles(d)
      if (!llegada || total < llegada.total) llegada = { n, total }
    }
    if (!llegada) {
      accesos[m.nombre] = null
      continue
    }
    const tramos = []
    for (let n = llegada.n; anterior.has(n); n = anterior.get(n).n) tramos.unshift({ de: anterior.get(n).n, a: n, camino: anterior.get(n).camino })

    // Pasos: cada carretera con código por la que se va, y la salida por la que se deja cada autovía
    const pasos = []
    for (const t of tramos) {
      const tipo = t.camino?.tags.highway
      const ultimo = pasos.at(-1)
      if (tipo?.endsWith('_link')) {
        const s = salidaDeNodo.get(t.de)
        if (s && ultimo?.carretera === s.carretera && !ultimo.salida) {
          ultimo.salida = s.numero ?? 'sin número'
          ultimo.hacia ??= s.sentidos.find((x) => x.nodo === t.de)?.hacia
        }
        continue
      }
      const codigo = t.camino ? (codigos(t.camino.tags)[0] ?? null) : null
      if (!codigo) continue // por calles o por una carretera sin código
      if (ultimo?.carretera === codigo && !ultimo.salida) {
        ultimo.fin = t.a
        continue
      }
      pasos.push({ carretera: codigo, autovia: esAutovia(tipo), inicio: t.de, fin: t.a })
    }
    for (const p of pasos) {
      if (p.autovia && !p.hacia && SENTIDOS_AUTOVIA[p.carretera]) {
        const [k0, k1] = [kmEn(p.carretera, posicion.get(p.inicio)), kmEn(p.carretera, posicion.get(p.fin))]
        if (k0 !== null && k1 !== null && k0 !== k1) p.hacia = SENTIDOS_AUTOVIA[p.carretera][k1 > k0 ? 'creciente' : 'decreciente']
      }
      if (!p.hacia) delete p.hacia
      delete p.inicio
      delete p.fin
      delete p.autovia
    }
    accesos[m.nombre] = { pasos, minutos: Math.round(llegada.total / 60) }
  }
  return accesos
}

// "GR-30 hacia Motril → A-44 hacia Motril, salida 153 → GR-3208"
export const textoAcceso = (acceso) =>
  acceso?.pasos.length
    ? acceso.pasos.map((p) => [p.carretera, p.hacia && `hacia ${p.hacia}`].filter(Boolean).join(' ') + (p.salida ? `, salida ${p.salida}` : '')).join(' → ')
    : 'Por calles: está pegado a Granada'
