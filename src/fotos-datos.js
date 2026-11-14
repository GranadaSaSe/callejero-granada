// Juego «Fotos» (paso 4.2): qué lugares tienen foto y qué se pregunta de cada uno. Las preguntas son como las del
// examen (que no trae fotos): qué edificio es, desde qué calle se accede, a qué distrito pertenece y qué parque de
// bomberos lo cubre; y además dónde está, tocando el mapa sin nombres. Solo se pregunta lo que los datos dicen con
// claridad (la calle de acceso, solo si la dirección es real: de OpenStreetMap o de la lista oficial).
// Este archivo no usa nada del navegador, así que se puede probar con Node.
import { CATEGORIAS_FOTOS } from '../scripts/lib/fotos.mjs'
import { DISTRITOS } from './ejes-lista.js'
import { nombreLlevaLaCalle } from './preguntas-examen.js'
import { OPCIONES_PARQUE } from './zona-preguntas.js'

export const PREGUNTAS_FOTOS = 10

export const MODOS_FOTOS = [
  { id: 'mezcla', nombre: 'De todo un poco' },
  { id: 'nombre', nombre: '¿Qué sitio es?' },
  { id: 'donde', nombre: '¿Dónde está? (tocando el mapa)' },
  { id: 'acceso', nombre: '¿Desde qué calle se accede?' },
  { id: 'distrito', nombre: '¿A qué distrito pertenece?' },
  { id: 'parque', nombre: '¿Qué parque de bomberos lo cubre?' },
]

// Qué lugares: todos los que llevan foto o los de un tipo
export const TIPOS_FOTOS = [
  { id: 'todos', nombre: 'Todos los lugares', categorias: CATEGORIAS_FOTOS },
  { id: 'singulares', nombre: 'Edificios singulares', categorias: ['Edificios singulares'] },
  { id: 'monumentos', nombre: 'Monumentos', categorias: ['Monumentos'] },
  { id: 'iglesias', nombre: 'Iglesias y templos', categorias: ['Iglesias y templos'] },
  { id: 'cultura', nombre: 'Museos y cultura', categorias: ['Cultura'] },
  { id: 'estatuas', nombre: 'Estatuas y esculturas', categorias: ['Estatuas y esculturas'] },
  { id: 'servicios', nombre: 'Edificios oficiales y hospitales', categorias: ['Edificios oficiales', 'Hospitales'] },
]

// Paso aproximado de grados a metros, suficiente dentro de Granada (igual que en scripts/lib/geo.mjs)
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540
const distancia = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)

function barajar(lista, azar) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

// Sin repetir textos ni la respuesta buena, en el orden dado
const distintas = (lista, buena) => [...new Set(lista.filter((x) => x && x !== buena))]

// La calle desde la que se accede, si la dirección es real y el nombre del sitio no la lleva dentro
function calleDeAcceso(lugar, callePorId) {
  if (!['osm', 'material'].includes(lugar.direccionSegun) || !lugar.via) return null
  const calle = callePorId.get(lugar.via)
  return calle && !nombreLlevaLaCalle(lugar.nombre, calle.nombre) ? calle : null
}

// Qué se puede preguntar de cada lugar
function modosPosibles(lugar, callePorId) {
  return [
    'nombre',
    lugar.punto && 'donde',
    calleDeAcceso(lugar, callePorId) && 'acceso',
    DISTRITOS.includes(lugar.distrito) && 'distrito',
    ['Norte', 'Sur'].includes(lugar.parque) && !lugar.parqueAproximado && 'parque',
  ].filter(Boolean)
}

// Todo lo que el juego necesita, preparado una vez
export function prepararFotos({ lugares, calles, fotos }) {
  const callePorId = new Map(calles.map((c) => [c.id, c]))
  const conFoto = lugares
    .filter((l) => fotos[l.id]?.length && CATEGORIAS_FOTOS.includes(l.categoria))
    .map((l) => ({ ...l, fotos: fotos[l.id], modos: modosPosibles(l, callePorId) }))
  // Para las opciones falsas de «¿Qué sitio es?»: todos los lugares de esas categorías, tengan foto o no
  const parecidos = lugares.filter((l) => l.punto && CATEGORIAS_FOTOS.includes(l.categoria))
  const callesPorBarrio = new Map()
  for (const c of calles) {
    for (const b of c.barrios) {
      if (!callesPorBarrio.has(b)) callesPorBarrio.set(b, [])
      callesPorBarrio.get(b).push(c)
    }
  }
  return { conFoto, parecidos, callePorId, callesPorBarrio }
}

// Lugares que pueden salir con estos ajustes ({ modo, tipo, zona })
export function lugaresDelJuego(base, { modo, tipo, zona }) {
  const categorias = (TIPOS_FOTOS.find((t) => t.id === tipo) ?? TIPOS_FOTOS[0]).categorias
  return base.conFoto.filter(
    (l) => categorias.includes(l.categoria) && (zona === 'Todos' || l.distrito === zona) && (modo === 'mezcla' || l.modos.includes(modo)),
  )
}

// La pregunta de un lugar: { modo, enunciado, buena, opciones (textos; sin opciones en «dónde está»), detalle }
export function preguntaDeFoto(base, lugar, modoPedido, azar = Math.random) {
  const modo = modoPedido === 'mezcla' ? lugar.modos[Math.floor(azar() * lugar.modos.length)] : modoPedido
  const conLaBuena = (buena, falsas, cuantas = 3) => barajar([buena, ...barajar(distintas(falsas, buena), azar).slice(0, cuantas)], azar)

  if (modo === 'nombre') {
    // Las falsas, de los ocho lugares más cercanos del mismo tipo (son los que se confunden) y, si faltan, de cualquiera
    const cercanos = (filtro) =>
      base.parecidos
        .filter((o) => filtro(o) && o.nombre !== lugar.nombre)
        .sort((a, b) => distancia(a.punto, lugar.punto) - distancia(b.punto, lugar.punto))
        .slice(0, 8)
        .map((o) => o.nombre)
    const mismoTipo = cercanos((o) => o.categoria === lugar.categoria)
    const falsas = mismoTipo.length >= 3 ? mismoTipo : [...mismoTipo, ...cercanos(() => true)]
    return { modo, enunciado: '¿Qué sitio es el de la foto?', buena: lugar.nombre, opciones: conLaBuena(lugar.nombre, falsas) }
  }
  if (modo === 'donde') return { modo, enunciado: '¿Dónde está el sitio de la foto? Tócalo en el mapa.', buena: lugar.nombre }
  if (modo === 'acceso') {
    const calle = calleDeAcceso(lugar, base.callePorId)
    // Las falsas, calles que la tocan y, si faltan, del mismo barrio
    const tocan = distintas([...calle.cruces, ...calle.inicio, ...calle.fin], calle.nombre)
    const delBarrio = barajar(base.callesPorBarrio.get(lugar.barrio) ?? [], azar).map((c) => c.nombre)
    const falsas = [...barajar(tocan, azar).slice(0, 3), ...delBarrio].filter((n) => !nombreLlevaLaCalle(lugar.nombre, n))
    return {
      modo,
      enunciado: '¿Desde qué calle se accede al sitio de la foto?',
      buena: calle.nombre,
      opciones: barajar([calle.nombre, ...distintas(falsas, calle.nombre).slice(0, 3)], azar),
      detalle: lugar.direccion,
    }
  }
  if (modo === 'distrito') {
    return { modo, enunciado: '¿A qué distrito pertenece el sitio de la foto?', buena: lugar.distrito, opciones: conLaBuena(lugar.distrito, DISTRITOS) }
  }
  // Parque de bomberos: las tres respuestas del examen de 2025, siempre en el mismo orden
  return { modo: 'parque', enunciado: '¿Qué parque de bomberos tiene la cobertura del sitio de la foto?', buena: `Parque ${lugar.parque}`, opciones: OPCIONES_PARQUE }
}
