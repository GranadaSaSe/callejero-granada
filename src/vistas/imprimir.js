// Imprimir (paso 4.3, #/imprimir, se entra desde Inicio): mapas mudos y fichas de un distrito (o de toda Granada) en
// un PDF para estudiar en papel. El PDF se crea en el propio móvil (con jsPDF, sin internet) y se guarda o se comparte
// como cualquier archivo; así funciona igual en Android, en el iPhone y en el ordenador.
// Lleva, a elegir: el mapa mudo con un número en cada calle, una hoja para escribir los nombres, las soluciones, el
// mapa con los nombres y las flechas de sentido, la ficha de cada calle y la de cada lugar de interés.
// Las cuentas (qué calles, dónde va cada número, las filas de las fichas) están en src/imprimir-datos.js.
import { LngLatBounds } from 'maplibre-gl'
import { compartirArchivo, paraNombreDeArchivo } from '../archivos.js'
import { crear, miles, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import { DISTRITOS } from '../ejes-lista.js'
import { NIVELES } from '../examen-datos.js'
import { callesDeLaZona, filasDeCalles, filasDeLugares, ordenDeLectura } from '../imprimir-datos.js'
import { componerPdf, hueco } from '../imprimir-pdf.js'
import { coleccion, punto, VACIO } from '../juegos/comun.js'
import { crearMapa, lineasParaNombres } from '../mapa-base.js'

const CLAVE = 'callejero-imprimir'
const PARTES = [
  { id: 'mudo', nombre: 'Mapa mudo con un número en cada calle' },
  { id: 'hoja', nombre: 'Hoja para escribir el nombre de cada número' },
  { id: 'soluciones', nombre: 'Soluciones del mapa mudo' },
  { id: 'nombres', nombre: 'Mapa con los nombres y las flechas de sentido' },
  { id: 'calles', nombre: 'Ficha de las calles (barrio, de dónde a dónde, sentido y parque)' },
  { id: 'lugares', nombre: 'Ficha de los lugares de interés (dirección, barrio y parque)' },
]

// El lienzo del mapa tiene la forma del hueco de la hoja A4 (vertical: 186 × 263 mm; apaisada: 273 × 176 mm), con
// unos 4,8 píxeles por milímetro (y el doble de detalle al dibujar)
const lienzo = (horizontal) => {
  const { ancho, alto } = hueco(horizontal)
  return { ancho: Math.round(ancho * 4.8), alto: Math.round(alto * 4.8) }
}
// Paso aproximado de grados a metros, suficiente dentro de Granada
const M_LON = Math.cos((37.17 * Math.PI) / 180) * 111320
const M_LAT = 110540
// Lo que no se ve en los mapas para imprimir (lugares, notas, la zona de los parques...)
const CAPAS_FUERA = [
  'lugares',
  'lugar-elegido',
  'lugares-nombres',
  'dudosos',
  'dudosos-linea',
  'notas',
  'barrios-nombres',
  'carreteras-codigos',
  'pueblos',
  'pueblos-nombres',
  'granada-nombre',
  'salidas',
  'salidas-numeros',
]
const CAPAS_NOMBRES = ['nombres-principales', 'nombres-resto', 'flechas', 'rios-nombres']
const MUNDO = [
  [-5, 36],
  [-2, 36],
  [-2, 38.5],
  [-5, 38.5],
  [-5, 36],
]

function leerAjustes() {
  try {
    return { zona: 'Centro', nivel: 'medio', partes: ['mudo', 'hoja', 'soluciones', 'calles'], ...JSON.parse(localStorage.getItem(CLAVE)) }
  } catch {
    return { zona: 'Centro', nivel: 'medio', partes: ['mudo', 'hoja', 'soluciones', 'calles'] }
  }
}
function guardarAjustes(ajustes) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(ajustes))
  } catch {
    // Sin almacenamiento: se usan los de siempre la próxima vez
  }
}

// Espera a que el mapa termine de dibujarse (con un tope, por si el navegador lo para)
const quieto = (mapa) =>
  new Promise((listo) => {
    const tope = setTimeout(listo, 20_000)
    mapa.once('idle', () => {
      clearTimeout(tope)
      listo()
    })
    mapa.triggerRepaint()
  })

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Preparando…'))
  contenedor.append(pagina)
  const [calles, tramos, zonas, fondo, lugares, municipios] = await Promise.all(['calles', 'tramos', 'zonas', 'fondo', 'lugares', 'municipios'].map(cargar))
  const ajustes = leerAjustes()
  let creando = false
  let resultado = null // { archivo, paginas, aviso }

  // Contorno de la zona: un distrito o todo el término de Granada
  function contornoDe(zona) {
    const figura =
      zona === 'Todos'
        ? municipios.features.find((f) => f.properties.nombre === 'Granada')
        : zonas.features.find((f) => f.properties.nivel === 'distrito' && f.properties.nombre === zona)
    const poligonos = figura.geometry.type === 'Polygon' ? [figura.geometry.coordinates] : figura.geometry.coordinates
    return poligonos.map((p) => p[0])
  }

  // Lo que se ve en el mapa: donde están las calles de la lista (el distrito entero tiene zonas sin calles, como la
  // Dehesa del Generalife en el Centro) y si la hoja va apaisada (si la zona es más ancha que alta)
  function encuadreDe(zona, grupos) {
    const puntos = grupos.length ? grupos.flatMap((g) => g.lineas.flat()) : contornoDe(zona).flat()
    const limites = new LngLatBounds(puntos[0], puntos[0])
    for (const p of puntos) limites.extend(p)
    const ancho = (limites.getEast() - limites.getWest()) * M_LON
    const alto = (limites.getNorth() - limites.getSouth()) * M_LAT
    return { limites, horizontal: ancho > alto * 1.15 }
  }

  // Dibuja el mapa de la zona y devuelve su imagen. Con "numeros" ([{ punto, calles }]) pone un número en cada calle
  // que quepa sin tapar a otra (primero las más importantes) y devuelve cuáles lo llevan, numeradas como se lee.
  async function dibujarMapa(zona, { encuadre, numeros = null, conNombres = false }) {
    const tamano = lienzo(encuadre.horizontal)
    const lienzoMapa = crear('div', { class: 'lienzo-imprimir', style: `width: ${tamano.ancho}px; height: ${tamano.alto}px` })
    document.body.append(lienzoMapa)
    let mapa = null
    try {
      mapa = crearMapa(lienzoMapa, { tramos, zonas, fondo, nombres: conNombres ? lineasParaNombres(tramos) : VACIO }, { paraImprimir: true })
      await new Promise((listo) => mapa.once('load', listo))
      for (const capa of [...CAPAS_FUERA, ...(conNombres ? [] : CAPAS_NOMBRES)]) if (mapa.getLayer(capa)) mapa.setLayoutProperty(capa, 'visibility', 'none')
      if (conNombres) {
        // En el mapa de estudio los nombres y las flechas salen al acercarse; en papel no se puede acercar: se ponen
        // todos los que quepan, con la letra algo más pequeña (las calles importantes, primero)
        for (const capa of ['nombres-principales', 'nombres-resto', 'flechas']) mapa.setLayerZoomRange(capa, 0, 24)
        for (const capa of ['nombres-principales', 'nombres-resto']) {
          mapa.setLayoutProperty(capa, 'text-size', 8.5)
          mapa.setLayoutProperty(capa, 'symbol-spacing', 200)
          mapa.setLayoutProperty(capa, 'symbol-sort-key', ['get', 'importancia'])
        }
        mapa.setLayoutProperty('flechas', 'icon-size', 0.55)
      }
      // Lo de fuera de la zona, casi en blanco; y su borde, marcado
      const anillos = contornoDe(zona)
      mapa.addSource('mascara', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [MUNDO, ...anillos] } } })
      mapa.addSource('borde-zona', { type: 'geojson', data: coleccion(anillos.map((a) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: a } }))) })
      mapa.addLayer({ id: 'mascara', type: 'fill', source: 'mascara', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.75 } }, 'barrios-borde')
      mapa.addLayer({ id: 'borde-zona', type: 'line', source: 'borde-zona', paint: { 'line-color': '#b3261e', 'line-width': 2.5 } }, 'lugares')
      mapa.fitBounds(encuadre.limites, { padding: 24, duration: 0, bearing: 0 })
      await quieto(mapa)

      let numerados = []
      if (numeros?.length) {
        // Primera vuelta: qué números caben sin taparse (la librería del mapa quita los que chocan)
        const muestra = numeros.length >= 100 ? '000' : '00'
        mapa.addSource('numeros', {
          type: 'geojson',
          data: coleccion(numeros.map((g, i) => punto(g.punto, { i, n: muestra, orden: Math.min(...g.calles.map((c) => c.importancia)) }))),
        })
        mapa.addLayer({
          id: 'numeros-prueba',
          type: 'symbol',
          source: 'numeros',
          layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-padding': 3, 'symbol-sort-key': ['get', 'orden'] },
          paint: { 'text-opacity': 0 },
        })
        await quieto(mapa)
        const caben = new Map()
        for (const f of mapa.queryRenderedFeatures({ layers: ['numeros-prueba'] })) caben.set(f.properties.i, mapa.project(numeros[f.properties.i].punto))
        const indices = [...caben.keys()]
        numerados = ordenDeLectura(indices.map((i) => caben.get(i)), 70).map((k, n) => ({ ...numeros[indices[k]], numero: n + 1 }))
        // Segunda vuelta: los números de verdad, en un círculo
        mapa.removeLayer('numeros-prueba')
        mapa.getSource('numeros').setData(coleccion(numerados.map((g) => punto(g.punto, { n: String(g.numero) }))))
        mapa.addLayer({
          id: 'numeros-circulo',
          type: 'circle',
          source: 'numeros',
          paint: { 'circle-radius': muestra === '000' ? 10 : 9, 'circle-color': '#ffffff', 'circle-stroke-color': '#b3261e', 'circle-stroke-width': 1.5 },
        })
        mapa.addLayer({
          id: 'numeros',
          type: 'symbol',
          source: 'numeros',
          layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': muestra === '000' ? 9 : 10, 'text-allow-overlap': true, 'text-ignore-placement': true },
          paint: { 'text-color': '#1f1a17' },
        })
        await quieto(mapa)
      }
      return { imagen: mapa.getCanvas().toDataURL('image/jpeg', 0.9), numerados }
    } finally {
      mapa?.remove()
      lienzoMapa.remove()
    }
  }

  async function crearPdf(avisar) {
    const { jsPDF } = await import('jspdf')
    const zona = ajustes.zona === 'Todos' ? 'Toda Granada' : `Distrito ${ajustes.zona}`
    const nivel = NIVELES.find((n) => n.id === ajustes.nivel) ?? NIVELES[1]
    const quiere = (parte) => ajustes.partes.includes(parte)
    const grupos = callesDeLaZona({ calles, tramos }, { zona: ajustes.zona, maximo: nivel.maximo })
    const encuadre = encuadreDe(ajustes.zona, grupos)
    const contenido = { zona, nivel: nivel.nombre.toLowerCase(), hoja: quiere('hoja'), soluciones: quiere('soluciones'), horizontal: encuadre.horizontal }

    if (quiere('mudo') || quiere('hoja') || quiere('soluciones')) {
      avisar('Dibujando el mapa mudo…')
      const { imagen, numerados } = await dibujarMapa(ajustes.zona, { encuadre, numeros: grupos })
      contenido.numerados = numerados
      if (quiere('mudo')) contenido.mudo = imagen
      if (numerados.length < grupos.length) {
        contenido.aviso =
          `En el mapa caben ${miles(numerados.length)} de las ${miles(grupos.length)} calles; las demás no llevan número. ` +
          'Con menos calles (por ejemplo, «Solo calles principales») caben todas.'
      }
    }
    if (quiere('nombres')) {
      avisar('Dibujando el mapa con los nombres…')
      contenido.nombres = (await dibujarMapa(ajustes.zona, { encuadre, conNombres: true })).imagen
    }
    avisar('Escribiendo las páginas…')
    if (quiere('calles')) contenido.calles = filasDeCalles(grupos)
    if (quiere('lugares')) contenido.lugares = filasDeLugares(lugares, ajustes.zona)
    const doc = componerPdf(jsPDF, contenido)
    const nombre = `callejero-${paraNombreDeArchivo(zona)}.pdf`
    return { archivo: new File([doc.output('blob')], nombre, { type: 'application/pdf' }), paginas: doc.getNumberOfPages(), aviso: contenido.aviso }
  }

  function pintar() {
    const estado = crear('p', { class: 'ficha-nota', 'aria-live': 'polite' })
    const cambiar = (cambio) => {
      Object.assign(ajustes, cambio)
      guardarAjustes(ajustes)
      resultado = null
      pintar()
    }
    const desplegable = (etiqueta, clave, opciones) =>
      crear(
        'label',
        { class: 'campo' },
        etiqueta,
        crear(
          'select',
          { onchange: (e) => cambiar({ [clave]: e.target.value }) },
          opciones.map(([valor, texto]) => crear('option', { value: valor, selected: valor === ajustes[clave] }, texto)),
        ),
      )
    const boton = crear(
      'button',
      {
        class: 'boton grande',
        disabled: creando || !ajustes.partes.length,
        onclick: async () => {
          creando = true
          boton.disabled = true
          try {
            resultado = await crearPdf((texto) => (estado.textContent = texto))
          } catch (error) {
            resultado = { error: error.message }
          }
          creando = false
          pintar()
        },
      },
      creando ? 'Creando el PDF…' : 'Crear el PDF',
    )
    const listo =
      resultado?.archivo &&
      crear(
        'section',
        { class: 'tarjeta' },
        crear('h2', {}, 'PDF listo'),
        crear(
          'p',
          {},
          `${resultado.archivo.name}: ${miles(resultado.paginas)} ${resultado.paginas === 1 ? 'página' : 'páginas'}, ` +
            `${(resultado.archivo.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB.`,
        ),
        resultado.aviso && crear('p', { class: 'ficha-nota' }, resultado.aviso),
        crear(
          'div',
          { class: 'acciones-eje' },
          crear('button', { class: 'boton', onclick: () => compartirArchivo(resultado.archivo, resultado.archivo.name) }, 'Guardar o compartir'),
          crear(
            'button',
            {
              class: 'boton secundario',
              onclick: () => {
                const direccion = URL.createObjectURL(resultado.archivo)
                window.open(direccion, '_blank')
                setTimeout(() => URL.revokeObjectURL(direccion), 60_000)
              },
            },
            'Abrir',
          ),
        ),
        crear('p', { class: 'ficha-nota' }, 'Para imprimirlo, ábrelo con el lector de PDF del móvil o del ordenador y elige Imprimir.'),
      )

    rellenar(
      pagina,
      crear('a', { class: 'enlace-discreto volver', href: '#/inicio' }, '← Inicio'),
      crear('h1', {}, 'Imprimir'),
      crear('p', { class: 'intro' }, 'Mapas mudos y fichas de un distrito en un PDF, para estudiar en papel. Se crea en el móvil, sin internet.'),
      crear(
        'section',
        { class: 'tarjeta' },
        desplegable('Zona', 'zona', [...DISTRITOS.map((d) => [d, `Distrito ${d}`]), ['Todos', 'Toda Granada']]),
        desplegable('Calles', 'nivel', NIVELES.map((n) => [n.id, n.nombre])),
        crear('h2', {}, 'Qué páginas'),
        PARTES.map((p) =>
          crear(
            'label',
            { class: 'casilla' },
            crear('input', {
              type: 'checkbox',
              checked: ajustes.partes.includes(p.id),
              onchange: (e) => cambiar({ partes: PARTES.map((x) => x.id).filter((id) => (id === p.id ? e.target.checked : ajustes.partes.includes(id))) }),
            }),
            p.nombre,
          ),
        ),
        boton,
        estado,
        resultado?.error && crear('p', { class: 'fallo' }, `No se ha podido crear el PDF: ${resultado.error}`),
        crear(
          'p',
          { class: 'ficha-nota' },
          'En el mapa mudo, cada calle lleva un número donde cabe sin tapar a otra (primero las más importantes). ' +
            'Con muchas calles (toda Granada, o todas las calles de un distrito grande) no caben todas: el PDF dice cuántas llevan número.',
        ),
      ),
      listo,
    )
  }

  pintar()
  return {}
}
