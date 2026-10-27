// Carga los datos de Granada (public/datos/). Cada archivo se pide una sola vez.
const pedidos = new Map()

export function cargar(nombre) {
  if (!pedidos.has(nombre)) {
    pedidos.set(
      nombre,
      fetch(`${import.meta.env.BASE_URL}datos/${nombre}.json`).then((respuesta) => {
        if (!respuesta.ok) throw new Error(`No se pudo cargar ${nombre} (${respuesta.status})`)
        return respuesta.json()
      }),
    )
  }
  return pedidos.get(nombre)
}

// Grupos de lugares de interés, con el color con el que se pintan en el mapa
export const GRUPOS = [
  { nombre: 'Sanidad', color: '#d32f2f', categorias: ['Hospitales', 'Centros de salud'] },
  { nombre: 'Educación', color: '#1565c0', categorias: ['Colegios e institutos', 'Escuelas infantiles', 'Universidad y formación'] },
  {
    nombre: 'Servicios públicos',
    color: '#e65100',
    categorias: ['Bomberos', 'Policía', 'Edificios oficiales', 'Residencias y centros sociales', 'Cementerios'],
  },
  {
    nombre: 'Monumentos y cultura',
    color: '#7b1fa2',
    categorias: ['Monumentos', 'Iglesias y templos', 'Cultura', 'Estatuas y esculturas', 'Miradores', 'Fuentes'],
  },
  { nombre: 'Transporte', color: '#00838f', categorias: ['Transporte'] },
  {
    nombre: 'Parques, deporte y compras',
    color: '#2e7d32',
    categorias: ['Parques y jardines', 'Instalaciones deportivas', 'Centros comerciales y mercados'],
  },
]
export const grupoDe = (categoria) => GRUPOS.find((g) => g.categorias.includes(categoria)) ?? GRUPOS[2]
