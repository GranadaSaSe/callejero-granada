// Servidor de la página para revisar fotos (paso 4.2). Funciona solo en este ordenador.
// Sirve la página de revision-fotos/ con las candidatas de datos/fotos-candidatas.json (de `npm run fotos:buscar`)
// y guarda en datos/fotos-revisadas.json qué fotos son buenas de cada lugar. Las fotos propias que se añaden
// desde la página llegan ya reducidas y se guardan en datos/fotos-propias/.
//
// Uso: `npm run fotos:revisar` o doble clic en "Revisar fotos.bat". Con --sin-abrir no abre el navegador.

import { exec } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { MAX_FOTOS } from './lib/fotos.mjs'

const RAIZ = join(import.meta.dirname, '..')
const PUERTO = 4322
const ARCHIVO_CANDIDATAS = join(RAIZ, 'datos', 'fotos-candidatas.json')
const ARCHIVO_REVISADAS = join(RAIZ, 'datos', 'fotos-revisadas.json')
const CARPETA_PROPIAS = join(RAIZ, 'datos', 'fotos-propias')
const MAX_BYTES_PROPIA = 4 * 1024 * 1024
const NOMBRE_PROPIA = /^[\w-]+\.jpg$/

const ARCHIVOS = {
  '/': 'revision-fotos/index.html',
  '/fotos.js': 'revision-fotos/fotos.js',
  '/fotos.css': 'revision-fotos/fotos.css',
  '/favicon.ico': 'public/favicon.ico',
  '/candidatas.json': 'datos/fotos-candidatas.json',
}
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
}

async function leerRevisadas() {
  try {
    const datos = JSON.parse(await readFile(ARCHIVO_REVISADAS, 'utf8'))
    return { lugares: datos.lugares ?? {}, propias: datos.propias ?? {} }
  } catch {
    return { lugares: {}, propias: {} }
  }
}

async function idsValidos() {
  const { lugares } = JSON.parse(await readFile(ARCHIVO_CANDIDATAS, 'utf8'))
  return new Set(lugares.map((l) => l.id))
}

// Los cambios se guardan de uno en uno para que nunca se pisen
let pendiente = Promise.resolve()
function cambiar(funcion) {
  pendiente = pendiente.then(async () => {
    const revisadas = await leerRevisadas()
    const resultado = await funcion(revisadas)
    await writeFile(`${ARCHIVO_REVISADAS}.tmp`, JSON.stringify(revisadas, null, 1))
    await rename(`${ARCHIVO_REVISADAS}.tmp`, ARCHIVO_REVISADAS)
    return resultado ?? { revisados: Object.keys(revisadas.lugares).length }
  })
  return pendiente
}

const responder = (res, estado, cuerpo, tipo = TIPOS['.json']) => {
  res.writeHead(estado, { 'Content-Type': tipo, 'Cache-Control': 'no-store' })
  res.end(cuerpo)
}
const error = (res, texto) => responder(res, 400, JSON.stringify({ error: texto }))

async function leerCuerpo(req, limite = 64 * 1024) {
  let cuerpo = ''
  for await (const trozo of req) {
    cuerpo += trozo
    if (cuerpo.length > limite) throw new Error('Demasiado grande')
  }
  return JSON.parse(cuerpo)
}

const servidor = createServer(async (req, res) => {
  const ruta = new URL(req.url, `http://localhost:${PUERTO}`).pathname
  try {
    if (ruta === '/api/revisadas' && req.method === 'GET') {
      return responder(res, 200, JSON.stringify(await leerRevisadas()))
    }

    // Decisión sobre un lugar: { id, fotos: [títulos o «propia:archivo»] } o { id, ninguna: true }
    if (ruta === '/api/revisadas' && req.method === 'POST') {
      const { id, fotos, ninguna } = await leerCuerpo(req)
      if (!(await idsValidos()).has(id)) return error(res, 'Lugar desconocido')
      const valida =
        ninguna === true ||
        (Array.isArray(fotos) && fotos.length >= 1 && fotos.length <= MAX_FOTOS && fotos.every((f) => typeof f === 'string' && f.length < 500))
      if (!valida) return error(res, 'Decisión no válida')
      const resultado = await cambiar((revisadas) => {
        revisadas.lugares[id] = ninguna === true ? { ninguna: true, fecha: new Date().toISOString() } : { fotos, fecha: new Date().toISOString() }
      })
      return responder(res, 200, JSON.stringify(resultado))
    }

    // Foto propia: { id, imagen: «data:image/jpeg;base64,...», autor }
    if (ruta === '/api/propia' && req.method === 'POST') {
      const { id, imagen, autor } = await leerCuerpo(req, MAX_BYTES_PROPIA * 1.4)
      if (!(await idsValidos()).has(id)) return error(res, 'Lugar desconocido')
      const base64 = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(imagen ?? '')?.[1]
      if (!base64) return error(res, 'La foto no es un JPEG')
      const firma = String(autor ?? '').trim().slice(0, 40) || 'Foto propia'
      await mkdir(CARPETA_PROPIAS, { recursive: true })
      const archivo = `${id.replace(/[^\w-]/g, '')}-${Date.now()}.jpg`
      await writeFile(join(CARPETA_PROPIAS, archivo), Buffer.from(base64, 'base64'))
      const propia = { archivo, autor: firma, fecha: new Date().toISOString() }
      await cambiar((revisadas) => {
        ;(revisadas.propias[id] ??= []).push(propia)
        return propia
      })
      return responder(res, 200, JSON.stringify(propia))
    }

    // Quitar una foto propia: { id, archivo }. Se borra el archivo y se quita de lo elegido.
    if (ruta === '/api/propia/quitar' && req.method === 'POST') {
      const { id, archivo } = await leerCuerpo(req)
      if (typeof archivo !== 'string' || !NOMBRE_PROPIA.test(archivo)) return error(res, 'Archivo no válido')
      const resultado = await cambiar((revisadas) => {
        revisadas.propias[id] = (revisadas.propias[id] ?? []).filter((p) => p.archivo !== archivo)
        if (!revisadas.propias[id].length) delete revisadas.propias[id]
        const decision = revisadas.lugares[id]
        if (decision?.fotos) {
          decision.fotos = decision.fotos.filter((f) => f !== `propia:${archivo}`)
          if (!decision.fotos.length) delete revisadas.lugares[id]
        }
      })
      await unlink(join(CARPETA_PROPIAS, archivo)).catch(() => {})
      return responder(res, 200, JSON.stringify(resultado))
    }

    const propia = ruta.match(/^\/propias\/([^/]+)$/)
    if (propia && req.method === 'GET') {
      const archivo = decodeURIComponent(propia[1])
      if (!NOMBRE_PROPIA.test(archivo)) return responder(res, 404, 'No encontrado', 'text/plain; charset=utf-8')
      return responder(res, 200, await readFile(join(CARPETA_PROPIAS, archivo)), TIPOS['.jpg'])
    }

    const archivo = ARCHIVOS[ruta]
    if (!archivo || req.method !== 'GET') return responder(res, 404, 'No encontrado', 'text/plain; charset=utf-8')
    const contenido = await readFile(join(RAIZ, archivo))
    return responder(res, 200, contenido, TIPOS[extname(archivo)] ?? 'application/octet-stream')
  } catch (fallo) {
    const estado = fallo.code === 'ENOENT' ? 404 : 500
    return responder(res, estado, JSON.stringify({ error: fallo.message }))
  }
})

servidor.listen(PUERTO, '127.0.0.1', () => {
  const direccion = `http://localhost:${PUERTO}/`
  console.log(`Revisión de fotos en ${direccion}`)
  console.log('Para apagarla, cierra esta ventana o pulsa Ctrl+C.')
  if (!process.argv.includes('--sin-abrir') && process.platform === 'win32') exec(`start "" ${direccion}`)
})
