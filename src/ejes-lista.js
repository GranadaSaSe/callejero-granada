// Qué calles son "ejes principales". Lo usan la pantalla de Ejes y las tarjetas de repaso.

export const CLAVES_EJES = {
  propios: 'callejero-ejes-propios',
  ocultos: 'callejero-ejes-ocultos',
  sabidos: 'callejero-ejes-sabidos',
}
export const DISTRITOS = ['Centro', 'Albaicín', 'Beiro', 'Chana', 'Genil', 'Norte', 'Ronda', 'Zaidín']

// Un eje es una calle larga e importante con bastantes cruces. Las carreteras con código, los accesos y
// las plazas o glorietas no cuentan. Cada persona puede añadir o quitar ejes a su gusto.
export const esEjePorDefecto = (c) =>
  !/^(Carretera [A-Z]{1,2}-|Acceso|Autov)/.test(c.nombre) &&
  !['Plaza', 'Placeta', 'Glorieta'].includes(c.tipo) &&
  ((c.importancia === 1 && c.cruces.length >= 5) ||
    (c.importancia <= 2 && c.cruces.length >= 8 && c.longitud >= 400) ||
    (c.importancia === 3 && c.cruces.length >= 15 && c.longitud >= 600))

export function leerConjunto(clave) {
  try {
    return new Set(JSON.parse(localStorage.getItem(clave)) ?? [])
  } catch {
    return new Set()
  }
}

export function guardarConjunto(clave, conjunto) {
  try {
    localStorage.setItem(clave, JSON.stringify([...conjunto]))
  } catch {
    // Sin almacenamiento (modo privado): los cambios duran solo mientras la app esté abierta
  }
}

// Los ejes de esta persona: los de por defecto que no haya quitado, más los que haya añadido
export function ejesActuales(calles) {
  const propios = leerConjunto(CLAVES_EJES.propios)
  const ocultos = leerConjunto(CLAVES_EJES.ocultos)
  return calles.filter((c) => (esEjePorDefecto(c) && !ocultos.has(c.id)) || propios.has(c.id))
}
