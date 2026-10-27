// Crea elementos de la página sin escribir HTML a mano: crear('p', { class: 'nota' }, 'Texto', otroElemento)
// Los textos se insertan como texto, nunca como HTML, así que un nombre raro no puede romper la página.
export function crear(etiqueta, atributos = {}, ...hijos) {
  const elemento = document.createElement(etiqueta)
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (valor === false || valor == null) continue
    if (nombre.startsWith('on')) elemento.addEventListener(nombre.slice(2), valor)
    else elemento.setAttribute(nombre, valor === true ? '' : valor)
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === false || hijo == null) continue
    elemento.append(hijo instanceof Node ? hijo : String(hijo))
  }
  return elemento
}

// Quita tildes y mayúsculas para comparar textos: "Albaicín" y "albaicin" se consideran iguales
export const normalizar = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const miles = (n) => n.toLocaleString('es-ES')
