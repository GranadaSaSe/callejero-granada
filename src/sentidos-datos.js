// "Sentidos" (paso 2.4): trozos de calle con su sentido de circulación para preguntar tramo a tramo, y las
// flechas de las respuestas. No usa el navegador: se puede probar con Node.

// Paso aproximado de grados a metros, suficiente dentro de Granada (igual que en scripts/lib/geo.mjs)
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540
const distancia = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)

// Metros de p al segmento [a, b]
function aSegmento(p, a, b) {
  const dx = (b[0] - a[0]) * M_LON
  const dy = (b[1] - a[1]) * M_LAT
  const px = (p[0] - a[0]) * M_LON
  const py = (p[1] - a[1]) * M_LAT
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - t * dx, py - t * dy)
}

// Qué calles pueden salir. "calles" = importancia máxima (1 = vía principal ... 6 = peatonal)
export const TIPOS_SENTIDO = [
  { id: 'principales', nombre: 'Calles principales', calles: 2 },
  { id: 'barrio', nombre: 'Calles principales y de barrio', calles: 4 },
  { id: 'todas', nombre: 'Todas las calles', calles: 6 },
]
export const QUE_SENTIDOS = [
  { id: 'todos', nombre: 'Todos los sentidos' },
  { id: 'unico', nombre: 'Solo los de sentido único' },
]

// Un trozo más corto casi no se ve en el mapa y no merece una pregunta
const MINIMO_M = 40
const SUELTO_M = 150 // ...ni uno más corto que este sin ninguna calle en sus extremos
// Plazas y rotondas (se circula alrededor), autovías, enlaces y carreteras con código quedan fuera
const SIN_PREGUNTA = (c) => ['Plaza', 'Placeta', 'Glorieta', 'Rotonda', 'Autovía', 'Enlace'].includes(c.tipo) || /^(Carretera [A-Z]{1,2}-|Acceso)/.test(c.nombre)

const clave = (p) => `${p[0]},${p[1]}`
const longitud = (linea) => linea.slice(1).reduce((suma, p, i) => suma + distancia(linea[i], p), 0)

// Une los tramos de una calle con el mismo sentido que van seguidos, mientras la calle no se bifurque. Los de
// sentido único solo se unen si siguen la misma dirección (la línea va en el sentido de la circulación).
function unirTramos(grupo, tramosEnPunto, unico) {
  const usados = new Set()
  const libreEn = (p, extremo) =>
    tramosEnPunto.get(clave(p)) === 2
      ? grupo.find((t) => !usados.has(t) && (extremo === 'inicio' ? clave(t.linea[0]) : clave(t.linea.at(-1))) === clave(p))
      : null
  const trozos = []
  for (const primero of grupo) {
    if (usados.has(primero)) continue
    usados.add(primero)
    const trozo = { tramos: [primero], linea: [...primero.linea] }
    for (;;) {
      const fin = trozo.linea.at(-1)
      const t = libreEn(fin, 'inicio') ?? (unico ? null : libreEn(fin, 'fin'))
      if (!t) break
      usados.add(t)
      trozo.tramos.push(t)
      trozo.linea.push(...(clave(t.linea[0]) === clave(fin) ? t.linea.slice(1) : [...t.linea].reverse().slice(1)))
    }
    for (;;) {
      const inicio = trozo.linea[0]
      const t = libreEn(inicio, 'fin') ?? (unico ? null : libreEn(inicio, 'inicio'))
      if (!t) break
      usados.add(t)
      trozo.tramos.push(t)
      trozo.linea.unshift(...(clave(t.linea.at(-1)) === clave(inicio) ? t.linea.slice(0, -1) : [...t.linea].reverse().slice(0, -1)))
    }
    trozos.push(trozo)
  }
  return trozos
}

// Dirección de un segmento en metros, de longitud 1
function direccion(a, b) {
  const x = (b[0] - a[0]) * M_LON
  const y = (b[1] - a[1]) * M_LAT
  const largo = Math.hypot(x, y) || 1
  return [x / largo, y / largo]
}

// Rectángulo que ocupa una línea: [oeste, sur, este, norte]
const cajas = new WeakMap()
function caja(linea) {
  if (!cajas.has(linea)) {
    const [lons, lats] = [linea.map((p) => p[0]), linea.map((p) => p[1])]
    cajas.set(linea, [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)])
  }
  return cajas.get(linea)
}

// ¿Es "b" la otra calzada de "a"? Lo es si al menos la mitad de "a" va junto a "b" (a menos de 35 m) en
// sentido contrario: una avenida con dos calzadas de sentido único es una calle de doble sentido.
function sonCalzadas(a, b) {
  // Si están lejos ni se mira (35 m son unas 4 diezmilésimas de grado)
  const [ca, cb] = [caja(a.linea), caja(b.linea)]
  if (ca[0] > cb[2] + 4e-4 || cb[0] > ca[2] + 4e-4 || ca[1] > cb[3] + 4e-4 || cb[1] > ca[3] + 4e-4) return false
  let junto = 0
  let total = 0
  for (let i = 1; i < a.linea.length; i++) {
    const [p, q] = [a.linea[i - 1], a.linea[i]]
    const medio = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
    const [dx, dy] = direccion(p, q)
    const peso = distancia(p, q)
    total += peso
    let cerca = null
    for (let j = 1; j < b.linea.length; j++) {
      const d = aSegmento(medio, b.linea[j - 1], b.linea[j])
      if (!cerca || d < cerca.d) cerca = { d, j }
    }
    const [ex, ey] = direccion(b.linea[cerca.j - 1], b.linea[cerca.j])
    if (cerca.d < 35 && dx * ex + dy * ey < -0.7) junto += peso
  }
  return total > 0 && junto >= total / 2
}

// Nombre de la calle que llega a un extremo del trozo (la más importante, si llegan varias)
function calleEnPunto(p, nombre, porPunto) {
  const otras = (porPunto.get(clave(p)) ?? []).filter((t) => t.nombre && t.nombre !== nombre)
  otras.sort((a, b) => a.importancia - b.importancia)
  return otras[0]?.nombre ?? null
}

// Une los trozos de sentido único que van uno detrás de otro en la misma dirección, aunque entre ellos haya
// un hueco corto (un tramo dudoso, un cruce donde la calle se bifurca...)
const HUECO_M = 60
function encadenar(unicos) {
  const cadenas = unicos.map((t) => [t])
  const rumboDe = (cadena) => direccion(cadena[0].linea[0], cadena.at(-1).linea.at(-1))
  for (let unidas = true; unidas; ) {
    unidas = false
    for (const a of cadenas) {
      const b = cadenas.find((c) => {
        if (c === a || distancia(a.at(-1).linea.at(-1), c[0].linea[0]) > HUECO_M) return false
        const [x1, y1] = rumboDe(a)
        const [x2, y2] = rumboDe(c)
        return x1 * x2 + y1 * y2 > 0
      })
      if (b) {
        a.push(...b)
        cadenas.splice(cadenas.indexOf(b), 1)
        unidas = true
        break
      }
    }
  }
  return cadenas
}

// Los dos puntos más alejados entre los extremos de varios trozos
function masAlejados(partes) {
  const puntos = partes.flatMap((p) => [p.linea[0], p.linea.at(-1)])
  let mejor = [puntos[0], puntos.at(-1)]
  for (const a of puntos) for (const b of puntos) if (distancia(a, b) > distancia(...mejor)) mejor = [a, b]
  return mejor
}

// Todas las preguntas que pueden salir: { id, calle, nombre, importancia, distritos, sentido ('unico',
// 'doble' o 'peatonal'), calzadas, lineas: [{ linea, sentido }], extremos: [inicio, fin] ({ punto, nombre }),
// entera, seguido }. En las de sentido único se circula del primer extremo al segundo. De cada calle salen:
//  - una de doble sentido con todos sus trozos de doble sentido y las calzadas de sentido único que van
//    emparejadas (una avenida con dos calzadas es de doble sentido);
//  - una de peatonal con todos sus trozos peatonales;
//  - una por cada trozo de sentido único, salvo en las avenidas con dos calzadas: allí una calzada suelta
//    seguramente tiene la otra entre los tramos dudosos, y se aprendería que la avenida es de sentido único.
// Los tramos dudosos no entran.
export function trozosDeSentido({ calles, tramos }) {
  const callePorVia = new Map(calles.map((c) => [c.id, c]))
  const porPunto = new Map()
  const porVia = new Map()
  for (const f of tramos.features) {
    const t = { ...f.properties, linea: f.geometry.coordinates }
    for (const p of [t.linea[0], t.linea.at(-1)]) {
      if (!porPunto.has(clave(p))) porPunto.set(clave(p), [])
      porPunto.get(clave(p)).push(t)
    }
    if (!porVia.has(t.via)) porVia.set(t.via, [])
    porVia.get(t.via).push(t)
  }

  const trozos = []
  for (const [via, todos] of porVia) {
    const calle = callePorVia.get(via)
    if (!calle || SIN_PREGUNTA(calle)) continue
    // Cuántos tramos de esta calle llegan a cada punto: con 2, la calle sigue sin bifurcarse
    const tramosEnPunto = new Map()
    for (const t of todos) for (const p of [t.linea[0], t.linea.at(-1)]) tramosEnPunto.set(clave(p), (tramosEnPunto.get(clave(p)) ?? 0) + 1)
    const validos = todos.filter((t) => !t.dudoso && ['unico', 'doble', 'peatonal'].includes(t.sentido))
    const deLaCalle = []
    for (const sentido of ['unico', 'doble', 'peatonal']) {
      const grupo = validos.filter((t) => t.sentido === sentido)
      for (const trozo of unirTramos(grupo, tramosEnPunto, sentido === 'unico')) deLaCalle.push({ ...trozo, sentido })
    }

    const unicos = deLaCalle.filter((t) => t.sentido === 'unico')
    const calzadas = unicos.filter((a) => unicos.some((b) => a !== b && (sonCalzadas(a, b) || sonCalzadas(b, a))))
    const grupos = [
      { sentido: 'doble', partes: [...deLaCalle.filter((t) => t.sentido === 'doble'), ...calzadas] },
      { sentido: 'peatonal', partes: deLaCalle.filter((t) => t.sentido === 'peatonal') },
      ...(calzadas.length ? [] : encadenar(unicos).map((partes) => ({ sentido: 'unico', partes }))),
    ]

    for (const { sentido, partes } of grupos) {
      const metros = partes.reduce((suma, p) => suma + longitud(p.linea), 0)
      if (metros < MINIMO_M) continue
      const puntos = sentido === 'unico' ? [partes[0].linea[0], partes.at(-1).linea.at(-1)] : masAlejados(partes)
      const extremos = puntos.map((punto) => ({ punto, nombre: calleEnPunto(punto, calle.nombre, porPunto) }))
      // Si se sale y se vuelve a la misma calle, sus nombres no sirven para decir hacia dónde
      if (extremos[0].nombre === extremos[1].nombre) for (const e of extremos) e.nombre = null
      const entera = partes.reduce((suma, p) => suma + p.tramos.length, 0) === todos.length
      // Un trocito suelto sin ninguna calle en sus extremos suele ser un ramal o un carril raro: no se pregunta
      if (!entera && extremos.every((e) => !e.nombre) && metros < SUELTO_M) continue
      trozos.push({
        id: `s:${Math.min(...partes.flatMap((p) => p.tramos.map((t) => t.id)))}`,
        calle: { id: calle.id, nombre: calle.nombre },
        nombre: calle.nombre,
        importancia: calle.importancia,
        distritos: calle.distritos,
        sentido,
        calzadas: partes.some((p) => calzadas.includes(p)),
        lineas: partes.map((p) => ({ linea: p.linea, sentido: p.sentido })),
        extremos,
        entera,
        // De un extremo al otro sin huecos (si no, "entre A y B" no diría bien qué está marcado)
        seguido: sentido === 'unico' || partes.length === 1,
        enlace: `#/mapa?calle=${calle.id}`,
      })
    }
  }
  return trozos
}

// Trozos que pueden salir con estos ajustes
export function candidatosSentido(trozos, { tipo, zona, sentidos }) {
  const ajuste = TIPOS_SENTIDO.find((t) => t.id === tipo) ?? TIPOS_SENTIDO[0]
  return trozos.filter(
    (t) =>
      t.importancia <= ajuste.calles &&
      (zona === 'Todos' || t.distritos.includes(zona)) &&
      (sentidos !== 'unico' || t.sentido === 'unico'),
  )
}

// Rumbo en la pantalla (el mapa siempre tiene el norte arriba), en grados: 0 = a la derecha, 90 = hacia abajo
export function rumbo(de, a) {
  const [x, y] = direccion(de, a)
  return (Math.atan2(-y, x) * 180) / Math.PI
}

const PUNTOS_CARDINALES = ['el este', 'el noreste', 'el norte', 'el noroeste', 'el oeste', 'el suroeste', 'el sur', 'el sureste']
export const haciaDonde = (grados) => PUNTOS_CARDINALES[(Math.round(-grados / 45) + 8) % 8]

// Las cuatro respuestas: doble sentido, las dos flechas y peatonal. Primero la flecha que apunta más a la
// izquierda (o más arriba, si el trozo va casi de norte a sur), para que no esté siempre la buena en el mismo
// sitio. Cada flecha dice hacia qué calle va o, si no llega a ninguna, hacia qué punto cardinal.
export function opcionesSentido(trozo) {
  const [inicio, fin] = trozo.extremos
  const flechas = [
    { id: 'hacia-fin', hacia: fin, grados: rumbo(inicio.punto, fin.punto) },
    { id: 'hacia-inicio', hacia: inicio, grados: rumbo(fin.punto, inicio.punto) },
  ].map((f) => ({ ...f, texto: `Sentido único hacia ${f.hacia.nombre ?? haciaDonde(f.grados)}` }))
  const x = (f) => Math.cos((f.grados * Math.PI) / 180)
  const y = (f) => Math.sin((f.grados * Math.PI) / 180)
  const casiVertical = Math.abs(x(flechas[0])) < 0.3
  flechas.sort((a, b) => (casiVertical ? y(a) - y(b) : x(a) - x(b)))
  return [{ id: 'doble', texto: 'Doble sentido' }, ...flechas, { id: 'peatonal', texto: 'Peatonal' }]
}

// Qué respuesta es la buena: en los de sentido único se circula del primer extremo al segundo
export const respuestaBuena = (trozo) => (trozo.sentido === 'unico' ? 'hacia-fin' : trozo.sentido)

// Texto de la respuesta buena, para el resultado y la lista para repasar
export function textoSentido(trozo) {
  if (trozo.sentido === 'peatonal') return 'Peatonal'
  if (trozo.sentido === 'doble') return trozo.calzadas ? 'Doble sentido (dos calzadas, cada una en un sentido)' : 'Doble sentido'
  return opcionesSentido(trozo).find((o) => o.id === 'hacia-fin').texto
}

// "Toda la calle", "Entre A y B", "Desde A"...
export function dondeEsElTrozo(trozo) {
  if (trozo.entera) return 'Toda la calle'
  if (!trozo.seguido) return 'Los trozos marcados'
  const [a, b] = trozo.extremos.map((e) => e.nombre)
  if (a && b) return `Entre ${a} y ${b}`
  if (a || b) return `Un trozo junto a ${a ?? b}`
  return 'Un trozo de la calle'
}
