// Progreso por zonas (paso 2.6): cuántas calles de cada distrito (y cuántos pueblos de cada parte de la zona
// de los parques) dominas, y dónde fallas más, para el mapa de calor. Junta las tarjetas (con lo contestado en
// el Kahoot y en el test tipo examen, que guardan en el mismo sitio) y los juegos de la pestaña Jugar.
// No usa el navegador (salvo leerGuardado): se puede probar con Node.
import { ACIERTO_METROS } from './donde-datos.js'
import { DISTRITOS } from './ejes-lista.js'
import { NIVELES } from './examen-datos.js'
import { aprendida } from './repaso.js'

export const PARTES = ['Norte', 'Este', 'Sur', 'Oeste', 'Valle de Lecrín']
// Aciertos en los juegos para dominar algo que no se tiene aprendido en tarjetas
const ACIERTOS_PARA_DOMINAR = 2

// Lo guardado en este dispositivo: el estado de las tarjetas y lo apuntado por cada juego
export function leerGuardado() {
  const leer = (clave, porDefecto) => {
    try {
      return JSON.parse(localStorage.getItem(clave)) ?? porDefecto
    } catch {
      return porDefecto
    }
  }
  return {
    estados: leer('callejero-tarjetas', {}),
    juegos: Object.fromEntries(['donde', 'nombre', 'sentidos', 'zona'].map((j) => [j, leer(`callejero-${j}`, {}).items ?? {}])),
  }
}

const medio = (linea) => linea[Math.floor(linea.length / 2)]

// Lo que se sabe de cada sitio (calle, lugar, pueblo o salida): visto, aprendido en tarjetas, aciertos en los
// juegos, fallos, si la última vez se falló, y los puntos del mapa donde se pintan sus fallos
function registros({ calles, lugares, tramos, municipios, salidas }, { estados, juegos }) {
  const tramosDe = new Map()
  const tramoPorId = new Map()
  for (const f of tramos.features) {
    if (!tramosDe.has(f.properties.via)) tramosDe.set(f.properties.via, [])
    tramosDe.get(f.properties.via).push(f)
    tramoPorId.set(String(f.properties.id), f)
  }
  const callePorId = new Map(calles.map((c) => [String(c.id), c]))
  const lugarPorId = new Map(lugares.map((l) => [String(l.id), l]))
  const puebloPorNombre = new Map(municipios.features.map((f) => [f.properties.nombre, f.properties]))
  const salidaPorId = new Map(salidas.map((s) => [s.id, s]))
  const salidaPara = (texto) => {
    const [carretera, destino] = texto.split('|')
    return salidas.find((s) => s.carretera === carretera && s.destinos.includes(destino))
  }

  const sitios = new Map() // clave → registro
  const apuntar = (clave, dato, cambios, puntoFallo = null) => {
    if (!dato) return
    if (!sitios.has(clave)) sitios.set(clave, { clave, dato, aprendida: false, aciertos: 0, fallos: 0, pendiente: false, puntos: [] })
    const r = sitios.get(clave)
    r.aprendida ||= cambios.aprendida ?? false
    r.aciertos += cambios.aciertos ?? 0
    r.fallos += cambios.fallos ?? 0
    r.pendiente ||= cambios.pendiente ?? false
    if (puntoFallo && cambios.fallos) r.puntos.push({ punto: puntoFallo, fallos: cambios.fallos })
  }
  const deTarjeta = (e) => ({ aprendida: aprendida(e), fallos: e.fallos ?? 0, pendiente: e.repeticiones === 0 && e.fallos > 0 })
  const deJuego = (x) => ({
    aciertos: x.bien ?? 0,
    fallos: (x.total ?? 0) - (x.bien ?? 0),
    pendiente: x.fallo ?? (x.ultima !== undefined && x.ultima > ACIERTO_METROS),
  })

  // Tarjetas (y Kahoot y examen): "zona:ID", "extremos:ID", "sentido:ID", "cruces:EJE:...", "lugares:ID",
  // "carreteras:acceso:Pueblo", "carreteras:salida:ID" y "carreteras:coger:Autovía|Destino"
  for (const [id, e] of Object.entries(estados)) {
    const [tipo, resto] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
    if (['zona', 'extremos', 'sentido', 'cruces'].includes(tipo)) apuntar(`c:${resto.split(':')[0]}`, callePorId.get(resto.split(':')[0]), deTarjeta(e))
    else if (tipo === 'lugares') apuntar(`l:${resto}`, lugarPorId.get(resto), deTarjeta(e))
    else if (resto.startsWith('acceso:')) apuntar(`p:${resto.slice(7)}`, puebloPorNombre.get(resto.slice(7)), deTarjeta(e))
    else if (resto.startsWith('salida:')) apuntar(`s:${resto.slice(7)}`, salidaPorId.get(resto.slice(7)), deTarjeta(e))
    else if (resto.startsWith('coger:')) {
      const s = salidaPara(resto.slice(6))
      if (s) apuntar(`s:${s.id}`, s, deTarjeta(e))
    }
  }
  // Juegos: "¿Dónde está?" y "¿Cómo se llama?" ("c:ID", "l:ID"), "¿Por dónde se circula?" ("s:TRAMO", en el
  // tramo) y "Zona de los parques" ("donde:", "pueblo:", "acceso:" de un pueblo; "salida:" y "coger:")
  for (const juego of ['donde', 'nombre']) {
    for (const [id, x] of Object.entries(juegos[juego] ?? {})) {
      if (id.startsWith('c:')) apuntar(id, callePorId.get(id.slice(2)), deJuego(x))
      else if (id.startsWith('l:')) apuntar(id, lugarPorId.get(id.slice(2)), deJuego(x))
    }
  }
  for (const [id, x] of Object.entries(juegos.sentidos ?? {})) {
    const tramo = tramoPorId.get(id.slice(2))
    if (tramo) apuntar(`c:${tramo.properties.via}`, callePorId.get(String(tramo.properties.via)), deJuego(x), medio(tramo.geometry.coordinates))
  }
  for (const [id, x] of Object.entries(juegos.zona ?? {})) {
    const [tipo, resto] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
    if (['donde', 'pueblo', 'acceso'].includes(tipo)) apuntar(`p:${resto}`, puebloPorNombre.get(resto), deJuego(x))
    else if (tipo === 'salida') apuntar(`s:${resto}`, salidaPorId.get(resto), deJuego(x))
    else if (tipo === 'coger') {
      const s = salidaPara(resto)
      if (s) apuntar(`s:${s.id}`, s, deJuego(x))
    }
  }

  // Dónde se pintan los fallos que no tienen un punto propio: a lo largo de la calle, en el lugar, en el pueblo
  // o en la salida
  for (const r of sitios.values()) {
    const sinPunto = r.fallos - r.puntos.reduce((suma, p) => suma + p.fallos, 0)
    if (sinPunto <= 0) continue
    if (r.clave.startsWith('c:')) {
      const suyos = tramosDe.get(r.dato.id) ?? []
      const cada = Math.max(1, Math.ceil(suyos.length / 20)) // como mucho unos 20 puntos por calle
      const elegidos = suyos.filter((_, i) => i % cada === 0)
      for (const t of elegidos) r.puntos.push({ punto: medio(t.geometry.coordinates), fallos: sinPunto / elegidos.length })
    } else {
      const punto = r.dato.punto ?? r.dato.centro
      if (punto) r.puntos.push({ punto, fallos: sinPunto })
    }
  }
  return { sitios, tramosDe }
}

const dominado = (r) => !r.pendiente && (r.aprendida || r.aciertos >= ACIERTOS_PARA_DOMINAR)

// Por distrito: cuántas calles hay (de la importancia elegida), cuántas has visto y cuántas dominas. Por parte
// de la zona de los parques, lo mismo con sus pueblos.
export function progresoPorZonas(datos, guardado, { nivel = 'medio' } = {}) {
  const { sitios } = registros(datos, guardado)
  const maximo = NIVELES.find((n) => n.id === nivel)?.maximo ?? 4
  const distritos = DISTRITOS.map((nombre) => {
    const suyas = datos.calles.filter((c) => c.importancia <= maximo && c.distritos[0] === nombre)
    const vistas = suyas.map((c) => sitios.get(`c:${c.id}`)).filter(Boolean)
    return { nombre, total: suyas.length, vistas: vistas.length, dominadas: vistas.filter(dominado).length }
  })
  const partes = PARTES.map((nombre) => {
    const suyos = datos.municipios.features.map((f) => f.properties).filter((m) => m.parte === nombre)
    const vistos = suyos.map((m) => sitios.get(`p:${m.nombre}`)).filter(Boolean)
    return { nombre, total: suyos.length, vistas: vistos.length, dominadas: vistos.filter(dominado).length }
  })
  return { distritos, partes }
}

// Para el mapa de calor: "calor" son muchos puntos con su peso (los fallos) y "sitios" uno por calle, lugar,
// pueblo o salida con fallos, con su número y lo necesario para abrir su ficha
export function fallosEnElMapa(datos, guardado) {
  const { sitios, tramosDe } = registros(datos, guardado)
  const calor = []
  const conFallos = []
  for (const r of sitios.values()) {
    if (r.fallos <= 0) continue
    for (const p of r.puntos) calor.push({ type: 'Feature', properties: { peso: p.fallos }, geometry: { type: 'Point', coordinates: p.punto } })
    const [tipo] = r.clave.split(':')
    const id = r.clave.slice(2)
    // Una calle, en su tramo del medio; lo demás, en su punto
    const suyos = tipo === 'c' ? (tramosDe.get(r.dato.id) ?? []) : []
    const punto = tipo === 'c' ? suyos.length && medio(medio(suyos).geometry.coordinates) : (r.dato.punto ?? r.dato.centro)
    if (!punto) continue
    conFallos.push({
      type: 'Feature',
      properties: { tipo, id, nombre: r.dato.nombre ?? `${r.dato.carretera} ${r.dato.numero ?? ''}`.trim(), fallos: Math.round(r.fallos) },
      geometry: { type: 'Point', coordinates: punto },
    })
  }
  return { calor: { type: 'FeatureCollection', features: calor }, sitios: { type: 'FeatureCollection', features: conFallos } }
}
