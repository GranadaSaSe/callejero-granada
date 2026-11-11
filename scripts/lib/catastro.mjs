// Edificios de gran altura (Catastro, servicio INSPIRE de edificios y direcciones del municipio de Granada).
// El Catastro da cada edificio por partes (cada parte con sus plantas sobre rasante) y las direcciones por
// parcela (la referencia catastral). Aquí se leen los dos archivos GML sin cargarlos enteros en memoria.
//
// Coordenadas: el Catastro usa UTM huso 30 (ETRS89, EPSG:25830); se pasan a longitud y latitud.
import { createReadStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { inflateRawSync } from 'node:zlib'

// UTM huso 30 norte (ETRS89, prácticamente igual que WGS84) → [longitud, latitud]
export function utmALonLat([x, y]) {
  const a = 6378137
  const f = 1 / 298.257222101
  const k0 = 0.9996
  const e2 = f * (2 - f)
  const ep2 = e2 / (1 - e2)
  const lon0 = (-3 * Math.PI) / 180
  const m = y / k0
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const fi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(fi1) ** 2)
  const t1 = Math.tan(fi1) ** 2
  const c1 = ep2 * Math.cos(fi1) ** 2
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(fi1) ** 2) ** 1.5
  const d = (x - 500000) / (n1 * k0)
  const lat =
    fi1 -
    ((n1 * Math.tan(fi1)) / r1) *
      ((d * d) / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 + ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720)
  const lon = lon0 + (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) / Math.cos(fi1)
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI]
}

// Saca los archivos de un .zip (sin programas de fuera): devuelve { nombre: Buffer }
export async function descomprimir(ruta) {
  const zip = await readFile(ruta)
  let fin = zip.length - 22
  while (fin >= 0 && zip.readUInt32LE(fin) !== 0x06054b50) fin--
  if (fin < 0) throw new Error(`${ruta} no es un .zip`)
  const total = zip.readUInt16LE(fin + 10)
  let p = zip.readUInt32LE(fin + 16)
  const archivos = {}
  for (let i = 0; i < total; i++) {
    const metodo = zip.readUInt16LE(p + 10)
    const comprimido = zip.readUInt32LE(p + 20)
    const largoNombre = zip.readUInt16LE(p + 28)
    const largoExtra = zip.readUInt16LE(p + 30)
    const largoComentario = zip.readUInt16LE(p + 32)
    const local = zip.readUInt32LE(p + 42)
    const nombre = zip.toString('utf8', p + 46, p + 46 + largoNombre)
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const datos = zip.subarray(inicio, inicio + comprimido)
    archivos[nombre] = metodo === 0 ? datos : inflateRawSync(datos)
    p += 46 + largoNombre + largoExtra + largoComentario
  }
  return archivos
}

export async function guardarDescomprimido(ruta, carpeta) {
  const nombres = []
  for (const [nombre, datos] of Object.entries(await descomprimir(ruta))) {
    await writeFile(`${carpeta}/${nombre}`, datos)
    nombres.push(nombre)
  }
  return nombres
}

// Los GML del Catastro vienen en ISO-8859-1 (latin1), no en UTF-8
async function* lineas(ruta) {
  yield* createInterface({ input: createReadStream(ruta, { encoding: 'latin1' }), crlfDelay: Infinity })
}

// Partes de edificio con "minimo" plantas o más: [{ refcat, plantas, anillo: [[lon, lat]...] }]
export async function partesAltas(ruta, minimo) {
  const partes = []
  let actual = null
  for await (const linea of lineas(ruta)) {
    if (linea.includes('<bu-ext2d:BuildingPart ')) {
      actual = { refcat: linea.match(/ES\.SDGC\.BU\.([^"_]+)/)[1], plantas: 0, anillo: null }
    } else if (actual && !actual.anillo && linea.includes('<gml:posList')) {
      const numeros = linea.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).map(Number)
      const anillo = []
      for (let i = 0; i + 1 < numeros.length; i += 2) anillo.push([numeros[i], numeros[i + 1]])
      actual.anillo = anillo
    } else if (actual && linea.includes('numberOfFloorsAboveGround>')) {
      actual.plantas = Number(linea.match(/>(\d+)</)?.[1] ?? 0)
    } else if (actual && linea.includes('</bu-ext2d:BuildingPart>')) {
      if (actual.plantas >= minimo && actual.anillo) partes.push(actual)
      actual = null
    }
  }
  return partes
}

// Direcciones por referencia catastral: { refcat: [{ numero, via (nombre del Catastro) }] }
export async function direccionesCatastro(ruta) {
  const calles = new Map()
  const porRefcat = new Map()
  let calle = null
  for await (const linea of lineas(ruta)) {
    const direccion = linea.match(/<AD:Address gml:id="ES\.SDGC\.AD\.\d+\.\d+\.(\d+)\.([^.]+)\.(\w{14})/)
    if (direccion) {
      const [, via, numero, refcat] = direccion
      if (!porRefcat.has(refcat)) porRefcat.set(refcat, [])
      porRefcat.get(refcat).push({ via, numero })
      continue
    }
    const nombreDeCalle = linea.match(/<AD:ThoroughfareName gml:id="ES\.SDGC\.TN\.\d+\.\d+\.(\d+)"/)
    if (nombreDeCalle) calle = nombreDeCalle[1]
    else if (calle && linea.includes('<GN:text>')) {
      calles.set(calle, linea.replace(/<[^>]+>/g, '').trim())
      calle = null
    }
  }
  const resultado = new Map()
  for (const [refcat, lista] of porRefcat) resultado.set(refcat, lista.map((d) => ({ numero: d.numero, via: calles.get(d.via) ?? null })))
  return resultado
}

// Tipos de vía del Catastro → como los escribe el callejero
export const TIPOS_CATASTRO = {
  CL: 'Calle',
  AV: 'Avenida',
  PZ: 'Plaza',
  PL: 'Placeta',
  CM: 'Camino',
  CR: 'Carretera',
  PS: 'Paseo',
  CJ: 'Callejón',
  CU: 'Cuesta',
  GV: 'Gran Vía',
  CA: 'Carril',
  PJ: 'Pasaje',
  RD: 'Ronda',
  GL: 'Glorieta',
  UR: 'Urbanización',
  BO: 'Barrio',
  PA: 'Paraje',
  LG: 'Lugar',
  TR: 'Travesía',
}
