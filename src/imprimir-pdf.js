// Imprimibles (paso 4.3): compone el PDF (A4) con jsPDF a partir de lo ya preparado: las imágenes de los mapas, las
// calles numeradas y las filas de las fichas. No usa nada del navegador (las imágenes llegan hechas), así que se puede
// probar con Node. Los mapas los dibuja src/vistas/imprimir.js.
//
// "contenido": { zona (texto para la cabecera), nivel (texto), mudo, nombres (imágenes JPEG en base64 o null),
//   horizontal (si las hojas de los mapas van apaisadas), numerados ([{ numero, nombre }]), aviso,
//   calles (filas o null), lugares (filas o null), hoja, soluciones (sí/no) }

export const A4 = { ancho: 210, alto: 297, margen: 12 }
const ARRIBA = 24 // donde empieza el contenido, bajo el título
const PIE = 10 // lo que ocupa el pie
// Hueco para el contenido de una hoja vertical o apaisada; los mapas se dibujan con esta misma forma
export const hueco = (horizontal = false) => {
  const [ancho, alto] = horizontal ? [A4.alto, A4.ancho] : [A4.ancho, A4.alto]
  return { ancho: ancho - 2 * A4.margen, alto: alto - PIE - ARRIBA }
}
const HUECO = hueco()
const ABAJO = A4.alto - PIE
const CREDITOS = '© colaboradores de OpenStreetMap · Callejero Digital de Andalucía (Junta de Andalucía) · App Callejero Granada'

// La letra del PDF (Helvetica) solo tiene las letras de Europa occidental: lo demás se cambia por lo más parecido
const paraPdf = (texto) =>
  String(texto)
    .replace(/[‐-―−]/g, '-')
    .replace(/[­​-‍]/g, '')
    .replace(/[^\u0000-ÿ‘’“”•…€–—]/g, '?')

export function componerPdf(jsPDF, contenido) {
  // La primera hoja se crea con el documento: si es un mapa apaisado, el documento empieza apaisado
  const hayListas = (contenido.hoja || contenido.soluciones) && contenido.numerados?.length
  const empiezaApaisado = contenido.horizontal && Boolean(contenido.mudo || (!hayListas && contenido.nombres))
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: empiezaApaisado ? 'landscape' : 'portrait', compress: true })
  let primera = true

  function nuevaPagina(titulo, horizontal = false) {
    if (!primera) doc.addPage('a4', horizontal ? 'landscape' : 'portrait')
    primera = false
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110)
    doc.text(paraPdf(`Callejero Granada · ${contenido.zona}`), A4.margen, 10)
    doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(30)
    doc.text(paraPdf(titulo), A4.margen, 18)
    doc.setFont('helvetica', 'normal').setTextColor(30)
  }

  function ponerMapa(titulo, imagen) {
    const { ancho, alto } = hueco(contenido.horizontal)
    nuevaPagina(titulo, contenido.horizontal)
    doc.addImage(imagen, 'JPEG', A4.margen, ARRIBA, ancho, alto, undefined, 'FAST')
    doc.setDrawColor(200).rect(A4.margen, ARRIBA, ancho, alto)
  }

  // Lista numerada en dos columnas: "escribir" deja una raya para rellenar; si no, pone el nombre
  function listaNumerada(titulo, numerados, escribir) {
    const columna = HUECO.ancho / 2
    const tamano = escribir ? 10 : 9
    const linea = escribir ? 8 : 4.2
    const inicio = ARRIBA + (contenido.aviso ? 4 : 0)
    let col = 0
    let y = inicio
    nuevaPagina(titulo)
    if (contenido.aviso) {
      doc.setFontSize(8).setTextColor(110)
      doc.text(doc.splitTextToSize(paraPdf(contenido.aviso), HUECO.ancho), A4.margen, ARRIBA - 1)
      doc.setTextColor(30)
    }
    for (const g of numerados) {
      doc.setFontSize(tamano)
      const texto = escribir ? [] : doc.splitTextToSize(paraPdf(g.nombre), columna - 14)
      const alto = escribir ? linea : texto.length * linea + 1.2
      if (y + alto > ABAJO) {
        col++
        y = inicio
        if (col > 1) {
          nuevaPagina(`${titulo} (sigue)`)
          col = 0
          y = ARRIBA
        }
      }
      const x = A4.margen + col * columna
      doc.setFont('helvetica', 'bold').text(`${g.numero}.`, x + 9, y + 4, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      if (escribir) doc.setDrawColor(170).line(x + 11, y + 4.6, x + columna - 4, y + 4.6)
      else doc.text(texto, x + 11, y + 4)
      y += alto
    }
  }

  // Tabla con cabecera, que sigue en páginas nuevas repitiendo la cabecera. La primera columna, en negrita.
  function tabla(titulo, columnas, filas) {
    const tamano = 7.5
    const linea = 3.3
    nuevaPagina(titulo)
    let y = ARRIBA
    const cabecera = () => {
      doc.setFillColor(238, 232, 226).rect(A4.margen, y, HUECO.ancho, 6, 'F')
      doc.setFont('helvetica', 'bold').setFontSize(tamano)
      let x = A4.margen
      for (const c of columnas) {
        doc.text(paraPdf(c.titulo), x + 1, y + 4.2)
        x += c.ancho
      }
      doc.setFont('helvetica', 'normal')
      y += 7
    }
    cabecera()
    filas.forEach((fila, f) => {
      doc.setFontSize(tamano)
      const celdas = fila.map((texto, i) => {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
        return doc.splitTextToSize(paraPdf(texto), columnas[i].ancho - 2)
      })
      const alto = Math.max(...celdas.map((c) => c.length)) * linea + 1.6
      if (y + alto > ABAJO) {
        nuevaPagina(`${titulo} (sigue)`)
        y = ARRIBA
        cabecera()
      }
      if (f % 2) doc.setFillColor(248, 245, 242).rect(A4.margen, y - 0.4, HUECO.ancho, alto, 'F')
      let x = A4.margen
      celdas.forEach((texto, i) => {
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
        doc.text(texto, x + 1, y + 2.6)
        x += columnas[i].ancho
      })
      y += alto
    })
  }

  if (contenido.mudo) ponerMapa(`Mapa mudo · ${contenido.nivel}`, contenido.mudo)
  if (contenido.hoja && contenido.numerados?.length) listaNumerada('Escribe el nombre de cada calle', contenido.numerados, true)
  if (contenido.soluciones && contenido.numerados?.length) listaNumerada('Soluciones del mapa mudo', contenido.numerados, false)
  if (contenido.nombres) ponerMapa('Mapa con los nombres y las flechas de sentido', contenido.nombres)
  if (contenido.calles) {
    tabla(
      `Calles · ${contenido.nivel} (${contenido.calles.length})`,
      [
        { titulo: 'Calle', ancho: 46 },
        { titulo: 'Barrio', ancho: 30 },
        { titulo: 'De dónde a dónde (por la numeración)', ancho: 60 },
        { titulo: 'Sentido', ancho: 34 },
        { titulo: 'Parque', ancho: 16 },
      ],
      contenido.calles,
    )
  }
  if (contenido.lugares) {
    tabla(
      `Lugares de interés (${contenido.lugares.length})`,
      [
        { titulo: 'Lugar', ancho: 52 },
        { titulo: 'Tipo', ancho: 32 },
        { titulo: 'Dirección', ancho: 50 },
        { titulo: 'Barrio', ancho: 34 },
        { titulo: 'Parque', ancho: 18 },
      ],
      contenido.lugares,
    )
  }

  // Pie de cada página: los créditos de los datos y el número de página
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    const ancho = doc.internal.pageSize.getWidth()
    const alto = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(120)
    doc.text(paraPdf(CREDITOS), A4.margen, alto - 5)
    doc.text(`${i} / ${total}`, ancho - A4.margen, alto - 5, { align: 'right' })
  }
  return doc
}
