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
  // Material de la persona (11-11-2026): edificios singulares (en lugares.json), edificios de gran altura
  // (altos.json, del Catastro) y polígonos industriales de la zona (poligonos.json). Los dos últimos solo
  // salen en el mapa de estudio.
  { nombre: 'Edificios singulares', color: '#ad1457', categorias: ['Edificios singulares'] },
  { nombre: 'Edificios de gran altura', color: '#37474f', categorias: ['Edificios de gran altura'] },
  { nombre: 'Polígonos industriales', color: '#6d4c41', categorias: ['Polígonos industriales'] },
  // Plazas que no son calle (tramos revisados como "plaza"): un punto con su nombre
  { nombre: 'Plazas', color: '#795548', categorias: ['Plazas'] },
  {
    nombre: 'Parques, deporte y compras',
    color: '#2e7d32',
    categorias: ['Parques y jardines', 'Instalaciones deportivas', 'Centros comerciales y mercados'],
  },
]
export const grupoDe = (categoria) => GRUPOS.find((g) => g.categorias.includes(categoria)) ?? GRUPOS[2]

// Texto del parque de bomberos de una calle o un lugar (paso 3.5: línea entre el Parque Norte y el Sur)
export function textoParque(parque, aproximado = false) {
  const texto =
    parque === 'Norte'
      ? 'Parque Norte'
      : parque === 'Sur'
        ? 'Parque Sur'
        : parque === 'límite'
          ? 'En la línea entre el Parque Norte y el Parque Sur'
          : parque === 'los dos'
            ? 'Cruza la línea: una parte es del Parque Norte y otra del Parque Sur'
            : null
  return texto && aproximado ? `${texto} (aproximado: queda más allá de las puntas de la línea)` : texto
}
