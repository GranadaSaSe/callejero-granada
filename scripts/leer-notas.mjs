// Lee los archivos de notas que comparten las personas que usan la app (por WhatsApp, por ejemplo) y
// los resume por calle, junto con lo que dicen ahora los datos de esa calle, para revisarlos con Claude.
//
// Uso: guardar los archivos en la carpeta notas-recibidas/ y ejecutar `npm run notas`
// (o `npm run notas -- ruta/al/archivo.txt` para leer archivos concretos).

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { datosDeArchivo } from '../src/notas.js'

const RAIZ = join(import.meta.dirname, '..')
const CARPETA = join(RAIZ, 'notas-recibidas')
const SENTIDOS = {
  doble: 'doble sentido',
  peatonal: 'peatonal',
  'hacia el final': 'sentido único hacia el final',
  'hacia el inicio': 'sentido único hacia el inicio',
  mixto: 'distinto según el tramo',
}

const rutas = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await readdir(CARPETA).catch(() => [])).filter((n) => /\.(txt|json)$/i.test(n) && n !== 'LEEME.txt').map((n) => join(CARPETA, n))
if (!rutas.length) {
  console.log('No hay archivos de notas. Guárdalos en la carpeta notas-recibidas/ del proyecto.')
  process.exit(0)
}

const calles = new Map(JSON.parse(await readFile(join(RAIZ, 'public', 'datos', 'calles.json'), 'utf8')).map((c) => [c.id, c]))

// Todas las notas de todos los archivos, sin repetir (la misma persona puede compartir dos veces)
const notas = new Map()
for (const ruta of rutas) {
  try {
    const datos = datosDeArchivo(await readFile(ruta, 'utf8'))
    for (const n of datos.notas) notas.set(`${datos.autor}|${n.id}`, { ...n, autor: datos.autor })
    console.log(`Leído ${ruta}: ${datos.notas.length} notas de ${datos.autor}`)
  } catch (error) {
    console.log(`No se ha podido leer ${ruta}: ${error.message}`)
  }
}

const porCalle = new Map()
for (const n of notas.values()) {
  const clave = n.calle?.nombre ?? n.lugar?.nombre ?? 'Sin calle'
  if (!porCalle.has(clave)) porCalle.set(clave, [])
  porCalle.get(clave).push(n)
}

console.log(`\n${notas.size} notas en ${porCalle.size} sitios distintos\n`)
for (const [sitio, lista] of [...porCalle].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'))) {
  const calle = calles.get(lista[0].calle?.id)
  console.log(`## ${sitio} (${lista.length} nota${lista.length === 1 ? '' : 's'})`)
  if (calle) {
    const dudas = calle.dudas?.map((d) => `${d.tramos} tramo(s) oficial=${d.oficial} / OSM=${d.osm}`).join('; ')
    console.log(`   Ahora en los datos: ${SENTIDOS[calle.sentido] ?? 'sin datos'}${dudas ? ` · por revisar: ${dudas}` : ''} · id ${calle.id}`)
  }
  for (const n of lista) {
    const [lon, lat] = n.punto.map((x) => Number(x).toFixed(6))
    console.log(`   - [${n.autor}] ${n.tipo}: ${n.comentario?.trim() || '(sin comentario)'}`)
    console.log(`     ${lat}, ${lon} · https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}${n.tramo ? ` · tramo ${n.tramo}` : ''}`)
  }
  console.log('')
}
