// Zona de actuación de los parques de bomberos de Granada capital (paso 2.5): los municipios con el límite
// en rosa en el plano «Red de carreteras de Andalucía. Provincia de Granada» (diciembre de 2013) que la
// persona guardó en material/. Se leyó el 29-10-2026 rellenando la zona del plano y comparándola con los
// límites de OpenStreetMap; los que quedan justo fuera son Agrón, Ventas de Huelma, Moraleda de Zafayona,
// Montefrío, Colomera, Deifontes, Iznalloz, El Pinar y Lanjarón.
//
// Los nombres son los de OpenStreetMap. Las partes (norte, este...) no salen del plano: sirven para
// estudiar la zona por trozos, como los distritos en la capital.
export const ZONA_PARQUES = {
  Capital: ['Granada'],
  Norte: [
    'Albolote',
    'Alfacar',
    'Atarfe',
    'Calicasas',
    'Cogollos de la Vega',
    'Güevéjar',
    'Íllora',
    'Jun',
    'Maracena',
    'Moclín',
    'Nívar',
    'Peligros',
    'Pinos Puente',
    'Pulianas',
    'Valderrubio',
    'Víznar',
  ],
  Este: ['Beas de Granada', 'Cenes de la Vega', 'Dúdar', 'Güéjar Sierra', 'Huétor de Santillán', 'Pinos Genil', 'Quéntar'],
  Sur: [
    'Alhendín',
    'Armilla',
    'Cájar',
    'Churriana de la Vega',
    'Cúllar Vega',
    'Dílar',
    'Gójar',
    'Huétor Vega',
    'La Zubia',
    'Las Gabias',
    'Monachil',
    'Ogíjares',
    'Vegas del Genil',
    'Villa de Otura',
  ],
  Oeste: ['Chauchina', 'Chimeneas', 'Cijuela', 'Escúzar', 'Fuente Vaqueros', 'La Malahá', 'Láchar', 'Santa Fe'],
  'Valle de Lecrín': ['Albuñuelas', 'Dúrcal', 'El Valle', 'Lecrín', 'Nigüelas', 'Padul', 'Villamena'],
}

// Parte de la zona de cada municipio: { Albolote: 'Norte', ... }
export const PARTE_DE_MUNICIPIO = Object.fromEntries(
  Object.entries(ZONA_PARQUES).flatMap(([parte, nombres]) => nombres.map((n) => [n, parte])),
)

// Rectángulo que cubre toda la zona con un poco de margen: sur, oeste, norte, este
export const RECTANGULO_ZONA = '36.84,-4.08,37.44,-3.12'
