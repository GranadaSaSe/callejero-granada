// Prepara para la app las fotos que la persona ha dado por buenas (paso 4.2). Lee datos/fotos-revisadas.json
// (de la página de revisión) y, de cada lugar, baja de Wikimedia Commons las fotos elegidas o toma las propias de
// datos/fotos-propias/. Las deja en public/fotos/ reducidas (900 px el lado largo) y escribe
// public/datos/fotos.json con el autor y la licencia de cada una, que la app enseña junto a la foto.
//
// Uso: `npm run fotos:preparar` (antes de publicar una versión). Solo baja las fotos nuevas; las que ya no están
// elegidas se borran de public/fotos/. Con --revisadas otro-archivo.json se usa ese archivo de decisiones (pruebas).

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const RAIZ = join(import.meta.dirname, '..')
const argumento = (nombre) => {
  const i = process.argv.indexOf(nombre)
  return i > 0 ? process.argv[i + 1] : null
}
const ARCHIVO_REVISADAS = argumento('--revisadas') ?? join(RAIZ, 'datos', 'fotos-revisadas.json')
const ARCHIVO_CANDIDATAS = join(RAIZ, 'datos', 'fotos-candidatas.json')
const ARCHIVO_LUGARES = join(RAIZ, 'public', 'datos', 'lugares.json')
const CARPETA_PROPIAS = join(RAIZ, 'datos', 'fotos-propias')
const CARPETA_SALIDA = join(RAIZ, 'public', 'fotos')
const ARCHIVO_SALIDA = join(RAIZ, 'public', 'datos', 'fotos.json')
const LADO_MAXIMO = 900
const CALIDAD = 72
const AGENTE = 'callejero-estudio/1.0 (app de estudio sin fines comerciales)'
const MAX_AUTOR = 80 // algunos autores de Commons traen media biografía

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms))
const leerJson = async (archivo, porDefecto) => {
  try {
    return JSON.parse(await readFile(archivo, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return porDefecto
    throw error
  }
}

// El nombre del archivo depende del lugar y de la foto: si la persona cambia de foto, cambia el nombre (y el móvil
// no se queda con la vieja guardada)
const nombreDeArchivo = (id, clave) => `${id}-${createHash('sha1').update(clave).digest('hex').slice(0, 10)}.jpg`

async function bajar(url) {
  for (let intento = 1; ; intento++) {
    try {
      const respuesta = await fetch(url, { headers: { 'User-Agent': AGENTE } })
      if (respuesta.ok) return Buffer.from(await respuesta.arrayBuffer())
      throw new Error(`HTTP ${respuesta.status}`)
    } catch (error) {
      if (intento >= 6) throw error
      console.log(`  (Wikimedia pide esperar: ${error.message}; intento ${intento})`)
      await esperar(2000 * intento)
    }
  }
}

const reducir = (imagen) =>
  sharp(imagen)
    .rotate() // por si la foto viene girada con la marca del móvil
    .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: CALIDAD, mozjpeg: true })
    .toBuffer()

const recortar = (texto) => (texto.length > MAX_AUTOR ? `${texto.slice(0, MAX_AUTOR - 1).trimEnd()}…` : texto)

const revisadas = await leerJson(ARCHIVO_REVISADAS, { lugares: {}, propias: {} })
const { lugares: candidatos } = await leerJson(ARCHIVO_CANDIDATAS, { lugares: [] })
const idsLugares = new Set((await leerJson(ARCHIVO_LUGARES, [])).map((l) => l.id))
const candidatasDe = new Map(candidatos.map((l) => [l.id, new Map(l.candidatas.map((c) => [c.titulo, c]))]))

await mkdir(CARPETA_SALIDA, { recursive: true })
const salida = {}
const usados = new Set()
let nuevas = 0
const avisos = []

for (const [id, decision] of Object.entries(revisadas.lugares ?? {})) {
  if (!decision.fotos?.length) continue
  if (!idsLugares.has(id)) {
    avisos.push(`${id}: ya no está en lugares.json (¿ha cambiado al procesar los datos?)`)
    continue
  }
  const fotos = []
  for (const clave of decision.fotos) {
    const archivo = nombreDeArchivo(id, clave)
    const destino = join(CARPETA_SALIDA, archivo)
    let datos
    if (clave.startsWith('propia:')) {
      const nombre = clave.slice('propia:'.length)
      const propia = (revisadas.propias?.[id] ?? []).find((p) => p.archivo === nombre)
      if (!propia || !existsSync(join(CARPETA_PROPIAS, nombre))) {
        avisos.push(`${id}: falta la foto propia ${nombre}`)
        continue
      }
      datos = { archivo, autor: recortar(propia.autor || 'Foto propia'), propia: true }
      if (!existsSync(destino)) {
        await writeFile(destino, await reducir(await readFile(join(CARPETA_PROPIAS, nombre))))
        nuevas++
      }
    } else {
      const candidata = candidatasDe.get(id)?.get(clave)
      if (!candidata) {
        avisos.push(`${id}: la foto ${clave} ya no está entre las candidatas`)
        continue
      }
      datos = { archivo, autor: recortar(candidata.autor), licencia: candidata.licencia, enlace: candidata.enlace }
      if (!existsSync(destino)) {
        await writeFile(destino, await reducir(await bajar(candidata.miniatura)))
        nuevas++
        await esperar(300)
        if (nuevas % 20 === 0) console.log(`  ${nuevas} fotos nuevas bajadas…`)
      }
    }
    usados.add(archivo)
    fotos.push(datos)
  }
  if (fotos.length) salida[id] = fotos
}

// Las fotos que ya no están elegidas se borran
let borradas = 0
for (const archivo of await readdir(CARPETA_SALIDA)) {
  if (!usados.has(archivo)) {
    await unlink(join(CARPETA_SALIDA, archivo))
    borradas++
  }
}

let bytes = 0
for (const archivo of usados) bytes += (await readFile(join(CARPETA_SALIDA, archivo))).length
// "bytes": lo que ocupan todas, para avisar antes de guardarlas en el móvil
await writeFile(ARCHIVO_SALIDA, JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), bytes, lugares: salida }))

const total = Object.values(salida).flat().length
console.log(`${Object.keys(salida).length} lugares con foto (${total} fotos, ${(bytes / 1024 / 1024).toFixed(1)} MB).`)
console.log(`Nuevas: ${nuevas} · borradas: ${borradas}.`)
for (const aviso of avisos) console.log(`  Aviso: ${aviso}`)
console.log(`Guardado en ${ARCHIVO_SALIDA}`)
