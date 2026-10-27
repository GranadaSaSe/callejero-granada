// Compartir un archivo creado por la app (notas, copia de seguridad): en el móvil abre el menú de
// compartir (WhatsApp, Drive, Archivos...); en el ordenador, o si el móvil no deja, lo descarga.
// Devuelve 'compartido', 'descargado' o 'cancelado'.

function descargar(archivo) {
  const direccion = URL.createObjectURL(archivo)
  const enlace = Object.assign(document.createElement('a'), { href: direccion, download: archivo.name })
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(direccion), 10_000)
}

export async function compartirArchivo(archivo, titulo) {
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: titulo })
      return 'compartido'
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelado'
    }
  }
  descargar(archivo)
  return 'descargado'
}

// Nombre de archivo sin tildes ni espacios: "José María" → "Jose-Maria"
export const paraNombreDeArchivo = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
