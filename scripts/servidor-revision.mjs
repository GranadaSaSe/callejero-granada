// Servidor del mapa de revisión (paso 1.3). Funciona solo en este ordenador.
// Sirve la página de revision/ y los datos, y guarda cada decisión en datos/revisiones.json,
// que luego usa `npm run datos:procesar`.
//
// Uso: `npm run revisar` o doble clic en "Revisar datos.bat". Con --sin-abrir no abre el navegador.

import { exec } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const PUERTO = 4321
const ARCHIVO_REVISIONES = join(RAIZ, 'datos', 'revisiones.json')
const SENTIDOS = new Set(['directo', 'inverso', 'doble', 'peatonal'])

const ARCHIVOS = {
  '/': 'revision/index.html',
  '/revision.js': 'revision/revision.js',
  '/revision.css': 'revision/revision.css',
  '/favicon.ico': 'public/favicon.ico',
  '/dudosos.json': 'datos/dudosos.json',
  '/tramos.json': 'public/datos/tramos.json',
}
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
}

async function leerRevisiones() {
  try {
    return JSON.parse(await readFile(ARCHIVO_REVISIONES, 'utf8'))
  } catch {
    return { tramos: {} }
  }
}

// Las decisiones se guardan de una en una para que nunca se pisen
let pendiente = Promise.resolve()
function guardarDecision({ id, sentido, eleccion }) {
  pendiente = pendiente.then(async () => {
    const revisiones = await leerRevisiones()
    if (sentido === null) delete revisiones.tramos[id]
    else revisiones.tramos[id] = { sentido, eleccion, fecha: new Date().toISOString() }
    const temporal = `${ARCHIVO_REVISIONES}.tmp`
    await writeFile(temporal, JSON.stringify(revisiones, null, 1))
    await rename(temporal, ARCHIVO_REVISIONES)
    return revisiones
  })
  return pendiente
}

const responder = (res, estado, cuerpo, tipo = TIPOS['.json']) => {
  res.writeHead(estado, { 'Content-Type': tipo, 'Cache-Control': 'no-store' })
  res.end(cuerpo)
}

const servidor = createServer(async (req, res) => {
  const ruta = new URL(req.url, `http://localhost:${PUERTO}`).pathname
  try {
    if (ruta === '/api/revisiones' && req.method === 'GET') {
      return responder(res, 200, JSON.stringify(await leerRevisiones()))
    }
    if (ruta === '/api/revisiones' && req.method === 'POST') {
      let cuerpo = ''
      for await (const trozo of req) cuerpo += trozo
      const { id, sentido, eleccion } = JSON.parse(cuerpo)
      if (!Number.isInteger(id) || !(sentido === null || SENTIDOS.has(sentido))) {
        return responder(res, 400, JSON.stringify({ error: 'Decisión no válida' }))
      }
      const revisiones = await guardarDecision({ id, sentido, eleccion })
      return responder(res, 200, JSON.stringify({ revisados: Object.keys(revisiones.tramos).length }))
    }
    // La librería de mapas, servida desde node_modules
    const libreria = ruta.match(/^\/vendor\/maplibre\/([\w.-]+)$/)
    const archivo = libreria ? `node_modules/maplibre-gl/dist/${libreria[1]}` : ARCHIVOS[ruta]
    if (!archivo || req.method !== 'GET') return responder(res, 404, 'No encontrado', 'text/plain; charset=utf-8')
    const contenido = await readFile(join(RAIZ, archivo))
    return responder(res, 200, contenido, TIPOS[extname(archivo)] ?? 'application/octet-stream')
  } catch (error) {
    const estado = error.code === 'ENOENT' ? 404 : 500
    return responder(res, estado, JSON.stringify({ error: error.message }))
  }
})

servidor.listen(PUERTO, '127.0.0.1', () => {
  const direccion = `http://localhost:${PUERTO}/`
  console.log(`Mapa de revisión en ${direccion}`)
  console.log('Para apagarlo, cierra esta ventana o pulsa Ctrl+C.')
  if (!process.argv.includes('--sin-abrir') && process.platform === 'win32') exec(`start "" ${direccion}`)
})
