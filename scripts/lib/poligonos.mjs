// Polígonos industriales del ámbito de intervención de los parques de Granada: la lista del PDF
// «Polígonos industriales ámbito intervención Granada» (academia The Globe) que la persona guardó en
// material/poligonos-industriales.pdf el 11-11-2026, más los que salen en exámenes de otros años.
// Si algo choca con OpenStreetMap, manda esta lista (el municipio es el del PDF).
//
// - nota: lo que dice el PDF entre paréntesis (cómo se llega, qué hay).
// - carretera: por dónde se llega, solo si lo dice el PDF o un examen.
// - osm: el polígono de OpenStreetMap con el mismo nombre (o en el mismo sitio), para ponerlo en el mapa.
// - punto: si no está en OpenStreetMap como polígono, un punto aproximado buscado el 11-11-2026 en
//   OpenStreetMap (una calle, una parada de autobús o el barrio con ese nombre).
// - dudoso: el PDF lo pone así, pero parece una errata; sale en el mapa y en la lista, no en las preguntas.
// - fuente: de dónde sale si no es del PDF.
export const POLIGONOS = [
  { municipio: 'Albolote', nombre: 'Polígono Industrial Juncaril', osm: 'r18134308' },
  { municipio: 'Alfacar', nombre: 'Polígono Industrial S.A.U. 8', osm: 'w668155658' },
  { municipio: 'Alhendín', nombre: 'Parque Empresarial Alín', nota: 'Procesadora de residuos urbanos; Marchalhendín', osm: 'w130667041' },
  { municipio: 'Armilla', nombre: 'Parque Comercial Albán', osm: 'w181461706' },
  { municipio: 'Armilla', nombre: 'Parque Comercial Albón', nota: 'En la N-323, cerca de Armilla', carretera: 'N-323' },
  { municipio: 'Armilla', nombre: 'Parque Empresarial San Miguel', nota: 'Frente a la Base Aérea', punto: [-3.62416, 37.14673] },
  { municipio: 'Atarfe', nombre: 'Polígono Industrial La Estación', punto: [-3.69765, 37.21555] },
  { municipio: 'Atarfe', nombre: 'Polígono Industrial Los Álamos', osm: 'w31427314' },
  { municipio: 'Atarfe', nombre: 'Polígono Industrial La Viñuela', punto: [-3.67602, 37.20903] },
  { municipio: 'Atarfe', nombre: 'Sector SI-9' },
  { municipio: 'Atarfe', nombre: 'Polígono Industrial Hurpe', nota: 'Covirán', osm: 'w557337458' },
  { municipio: 'Atarfe', nombre: 'Polígono Industrial La Vega', osm: 'w557337450' },
  { municipio: 'Atarfe', nombre: 'Mercagranada', osm: 'w29451707' },
  { municipio: 'Atarfe', nombre: 'Polígono Industrial La Ermita', osm: 'w557337457' },
  { municipio: 'Atarfe', nombre: 'Polígono Industrial Santa Isabel', fuente: 'examen de 2025' },
  { municipio: 'Cájar', nombre: 'Polígono Industrial Las Canteras', osm: 'w130092600' },
  { municipio: 'Dúrcal', nombre: 'Polígono Industrial El Romeral', nota: 'En la N-323, antes de Marchena', carretera: 'N-323', osm: 'w656166695' },
  { municipio: 'Dúrcal', nombre: 'Polígono Industrial San Blas', nota: 'Salida de Mercadona, Nigüelas' },
  { municipio: 'Chauchina', nombre: 'Polígono Industrial La Rosa', nota: 'Fases I, II, III y IV', osm: 'w237501325' },
  { municipio: 'Churriana de la Vega', nombre: 'Polígono Industrial Paseo de la Habana', osm: 'w200901362' },
  { municipio: 'Churriana de la Vega', nombre: 'Polígono Industrial San Cayetano', osm: 'r14605136' },
  { municipio: 'Cijuela', nombre: 'Polígono Industrial Mirador de Sierra Nevada', osm: 'w51954674' },
  { municipio: 'Cúllar Vega', nombre: 'Polígono Industrial de Cúllar Vega', osm: 'w205665140' },
  { municipio: 'Escúzar', nombre: 'Parque Metropolitano Industrial y Tecnológico', nota: 'Parque Tecnológico de Escúzar', osm: 'w130738309' },
  { municipio: 'Fuente Vaqueros', nombre: 'Polígono Industrial La Fuente', osm: 'w572815503' },
  { municipio: 'Las Gabias', nombre: 'Polígono Industrial Río Dílar - Las Nieves', osm: 'w293818266' },
  { municipio: 'Gójar', nombre: 'Polígono Industrial Arcos de las Cañadas', nota: 'Salida de Gójar, dirección Dílar', osm: 'w1103422050' },
  { municipio: 'Granada', nombre: 'Parque Comercial Alcampo', punto: [-3.60877, 37.19817] },
  { municipio: 'Granada', nombre: 'Parque Comercial Carrefour', punto: [-3.60832, 37.15459] },
  { municipio: 'Granada', nombre: 'Polígono Industrial El Florío', osm: 'w29099091' },
  { municipio: 'Granada', nombre: 'Polígono Industrial Fatinafar', punto: [-3.63908, 37.19106] },
  { municipio: 'Granada', nombre: 'Parque Tecnológico de las Ciencias de la Salud', osm: 'w365201175' },
  {
    municipio: 'Güéjar Sierra',
    nombre: 'Polígono Industrial del Barrio Alto',
    nota: 'Salida de la GR-3200, dirección Fuente de los 16 Caños',
    carretera: 'GR-3200',
    punto: [-3.44338, 37.16208],
  },
  { municipio: 'La Malahá', nombre: 'Parque Empresarial Alhendín', dudoso: true },
  { municipio: 'Maracena', nombre: 'Polígono Industrial La Paz', osm: 'w89762702' },
  { municipio: 'Moclín', nombre: 'Polígono Industrial Las Trompetas', nota: 'En Puerto Lope', carretera: 'N-432', punto: [-3.84559, 37.3454] },
  { municipio: 'Ogíjares', nombre: 'Polígono Tecnológico, Comercial e Industrial San Nicolás', punto: [-3.62562, 37.13043] },
  { municipio: 'Padul', nombre: 'Polígono Industrial Las Palomas', nota: 'Merkamueble', osm: 'w596998259' },
  { municipio: 'Padul', nombre: 'Polígono Industrial Los Caises', nota: 'Al otro lado de la N-323', carretera: 'N-323' },
  { municipio: 'Peligros', nombre: 'Polígono Industrial Asegra', osm: 'w26341968' },
  { municipio: 'Peligros', nombre: 'Polígono Industrial Poligran', fuente: 'examen de 2020' },
  { municipio: 'Pinos Puente', nombre: 'Polígono Industrial La Molaina', nota: 'Antes de entrar, a la derecha', osm: 'w467835461' },
  { municipio: 'Pinos Puente', nombre: 'Polígono Industrial La Estación', punto: [-3.75405, 37.25059] },
  { municipio: 'Pulianas', nombre: 'Parque Comercial Kinépolis', punto: [-3.61694, 37.21493] },
  { municipio: 'Pulianas', nombre: 'Polígono Industrial Portinox', punto: [-3.61071, 37.22944] },
  { municipio: 'Pulianas', nombre: 'Polígono Industrial Olinda', punto: [-3.62425, 37.21602] },
  { municipio: 'Santa Fe', nombre: 'Polígono Industrial Dos de Octubre', nota: 'Al final de la A-92G, a la derecha', carretera: 'A-92G', osm: 'w237506978' },
  { municipio: 'Santa Fe', nombre: 'Polígono Industrial de Santa Fe' },
  { municipio: 'Santa Fe', nombre: 'Polígono Industrial El Salao', osm: 'w107116070' },
  { municipio: 'Santa Fe', nombre: 'Polígono Industrial UE-24' },
  { municipio: 'Vegas del Genil', nombre: 'Polígono Industrial El Fresno', osm: 'w1125370699' },
  { municipio: 'La Zubia', nombre: 'Polígono Industrial El Laurel', nota: 'Alhsur', osm: 'w131889502' },
]
