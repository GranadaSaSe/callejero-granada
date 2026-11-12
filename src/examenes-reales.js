// Banco de exámenes reales (paso 3.5): las preguntas de callejero y carreteras de los exámenes de 2020, 2022 y 2025
// de Bomberos de Granada (los PDF están en material/, que no se sube). Las de vehículos, la norma UNE-EN 1846, el
// Reglamento de Circulación y mecánica se quedan fuera (decidido el 11-11-2026).
//
// - correcta: 0 = a, 1 = b, 2 = c.
// - 2020 y 2025: la respuesta es la de la plantilla oficial.
// - 2022 no tiene plantilla: la respuesta está calculada con los datos de la app (y con el material de la persona en
//   los polígonos); las que no se pueden sacar de los datos no están.
// - tema: el de TEMAS en examen-datos.js, para que cuente en «Tu progreso».
// - ver: calle, lugar, pueblo o carretera para el enlace «Ver en el mapa» (se busca por su nombre).
// - nota: algo que conviene saber al corregir.
// Este archivo no usa nada del navegador.

export const EXAMENES_REALES = [
  {
    anio: 2020,
    titulo: 'Examen de 2020',
    detalle: 'Segundo ejercicio (2 plazas), preguntas 14 a 25. Respuestas de la plantilla oficial.',
    preguntas: [
      { n: 14, tema: 'extremos', ver: 'Calle Teresa de Calcuta', pregunta: '¿Entre qué calles se encuentra la Calle Teresa de Calcuta?', opciones: ['Entre la calle Electra y la Avenida de la Argentinita', 'Entre la calle Náyades y la calle Isis', 'Entre la calle Gloria Mas y la calle María Blanchard'], correcta: 0 },
      { n: 15, tema: 'extremos', ver: 'Calle Brocal', pregunta: '¿Entre qué calles se encuentra la calle Brocal?', opciones: ['Entre la calle Honda del Pozo y la calle San José', 'Entre la calle Pozo y la Avenida de Maracena', 'Entre la calle Sillería y la calle Rosal'], correcta: 1 },
      { n: 16, tema: 'extremos', ver: 'Calle Brindis', pregunta: '¿Entre qué calles se encuentra la Calle Brindis?', opciones: ['Entre la calle Montera y la calle Rejón', 'Entre la calle Coso y la calle Capote', 'Entre la calle Matador y la calle Chicuelinas'], correcta: 0 },
      { n: 17, tema: 'extremos', ver: 'Calle Convalecencia', pregunta: '¿Entre qué calles se encuentra la Calle Convalecencia?', opciones: ['Entre la calle Benalúa y la Cuesta de los Aceituneros', 'Entre la calle San Juan de los Reyes y la calle Cárcel Alta', 'Entre la calle Aire y la placeta Benalúa'], correcta: 2 },
      { n: 18, tema: 'lugares', pregunta: '¿En qué calle se encuentra el acceso a la Casa Árabe de los Girones?', opciones: ['Ancha de Santo Domingo', 'Plaza de los Girones', 'Santa Escolástica'], correcta: 0 },
      { n: 19, tema: 'lugares', ver: 'Plaza de Alonso Cano', pregunta: '¿Dónde se encuentra la entrada de la Iglesia del Sagrario?', opciones: ['En la placeta de Carlos V', 'En la plaza de Alonso Cano', 'En la calle del Santísimo Sagrario'], correcta: 1 },
      { n: 20, tema: 'lugares', ver: 'Calle San Jerónimo', pregunta: '¿En qué calle se encuentra el Colegio Mayor Universitario San Bartolomé y Santiago?', opciones: ['San Bartolomé', 'San Jerónimo', 'Rector López Argüeta'], correcta: 1 },
      { n: 21, tema: 'lugares', ver: 'Calle Gracia', pregunta: '¿En qué calle se encuentra la Escuela de Artes y Oficios de Granada?', opciones: ['Gracia', 'Puentezuelas', 'Plaza Alhóndiga'], correcta: 0 },
      { n: 22, tema: 'carreteras', ver: 'A-338', pregunta: 'Según los planos editados por la Junta de Andalucía en su guía de carreteras, ¿qué carretera enlaza Armilla, Gabia la Grande y la Malahá?', opciones: ['GR-3306', 'A-385', 'A-338'], correcta: 2, nota: 'Hoy, según OpenStreetMap, la A-338 ya no entra en el término de Armilla: pasa por Churriana de la Vega, Las Gabias y La Malahá. El examen se hizo con el plano de 2013.' },
      { n: 23, tema: 'carreteras', ver: 'Peligros', pregunta: '¿En qué núcleo de población se encuentra el polígono industrial Poligran?', opciones: ['En Peligros', 'En Atarfe', 'En Santa Fe'], correcta: 0 },
      { n: 24, tema: 'carreteras', ver: 'Escúzar', pregunta: '¿En qué núcleo de población se encuentra el polígono industrial Parque Metropolitano Industrial y Tecnológico?', opciones: ['Alhendín', 'Armilla', 'Escúzar'], correcta: 2 },
      { n: 25, tema: 'lugares', ver: 'Calle Garellano', pregunta: '¿Desde qué calle se accede a la Iglesia del Santísimo Corpus Christi?', opciones: ['Santa Adela', 'Garellano', 'Sagrada Familia'], correcta: 1 },
    ],
  },
  {
    anio: 2022,
    titulo: 'Examen de 2022',
    detalle: 'Segunda parte del primer ejercicio (11 plazas). No hay plantilla: las respuestas están calculadas con los datos de la app; las que no se pueden sacar no están.',
    calculada: true,
    preguntas: [
      { n: 1, tema: 'sentido', ver: 'Calle Azorín', pregunta: '¿Cómo podemos incorporarnos a la Calle Arabial desde la calle Azorín?', opciones: ['Girando a la derecha', 'Girando a la izquierda', 'Girando a derecha o izquierda indistintamente'], correcta: 2, nota: 'Arabial tiene dos calzadas, una en cada sentido: se puede entrar hacia los dos lados.' },
      { n: 2, tema: 'edificios', ver: 'Edificio Atalaya', pregunta: '¿Qué edificio se encuentra situado en el número 101 del Camino de Ronda?', opciones: ['Gimnasio YO10 (antigua Alsina Graells)', 'Torre Atalaya de San Lázaro', 'Edificio Atalaya'], correcta: 2, nota: 'Edificio Atalaya, de 16 plantas según el Catastro.' },
      { n: 4, tema: 'carreteras', ver: 'Polígono Industrial La Molaina', pregunta: 'El Polígono Industrial La Molaina, ¿en qué término municipal se encuentra y por qué vía accedemos a él?', opciones: ['Término municipal de Atarfe, y se accede por la N-432', 'Término municipal de Pinos Puente, y se accede por la N-432', 'Término municipal de Pinos Puente, y se accede por la GR-43'], correcta: 1, nota: 'Está en Pinos Puente, a unos 125 m de la N-432.' },
      { n: 5, tema: 'sentido', ver: 'Calle Arabial', pregunta: 'La Calle Arabial es:', opciones: ['De doble sentido en toda su longitud', 'De sentido único en toda su longitud', 'De sentido único y doble sentido de forma alternativa'], correcta: 2 },
      { n: 6, tema: 'sentido', ver: 'Calle Alhamar', pregunta: 'La Calle Alhamar es:', opciones: ['De sentido único en toda su longitud', 'De doble sentido en toda su longitud', 'De sentido único y doble sentido de forma alternativa'], correcta: 1 },
      { n: 8, tema: 'sentido', ver: 'Avenida del Mediterráneo', pregunta: 'La Avenida del Mediterráneo es:', opciones: ['De sentido único', 'De doble sentido', 'Peatonal'], correcta: 2 },
      { n: 24, tema: 'zonas', ver: 'Cuesta de la Plata', pregunta: 'La calle Cuesta de la Plata pertenece al barrio:', opciones: ['Cervantes', 'Bola de Oro', 'Camino de los Neveros'], correcta: 1 },
      { n: 25, tema: 'sentido', ver: 'Calle Labella Dávalos', pregunta: 'La calle Labella Dávalos tiene su dirección hacia la calle:', opciones: ['Pizarro Cenjor', 'Paseo de Cartuja', 'Es de doble dirección'], correcta: 2 },
      { n: 26, tema: 'cruces', ver: 'Calle Roble', pregunta: '¿Cuál de las siguientes calles NO da acceso directo, ya sea de forma peatonal o en vehículo, a la calle Roble?', opciones: ['Pinar', 'Almendros', 'Camino Viejo del Fargue'], correcta: 0 },
      { n: 27, tema: 'cruces', ver: 'Calle Conde Cifuentes', pregunta: '¿Por cuál de estas calles NO podemos acceder directamente a la calle Conde Cifuentes?', opciones: ['Tejeiro', 'Pintor Zuloaga', 'Martín Bohórquez'], correcta: 2 },
      { n: 29, tema: 'cruces', ver: 'Calle Zoraida', pregunta: 'A la calle Zoraida podemos acceder directamente con vehículo a través de:', opciones: ['Calle Comarex', 'Calle Santa Rosalía', 'A y B son correctas'], correcta: 2 },
      { n: 31, tema: 'sentido', ver: 'Calle Enrique Gómez Arboleya', pregunta: 'La calle Enrique Gómez Arboleya es:', opciones: ['Sentido único', 'Doble dirección', 'Peatonal'], correcta: 2 },
      { n: 32, tema: 'carreteras', ver: 'A-92', pregunta: 'La salida 250 de la A-92 corresponde con:', opciones: ['Víznar', 'Alfacar-Jun', 'Huétor Santillán-El Fargue-Granada este'], correcta: 0 },
      { n: 33, tema: 'zonas', ver: 'Placeta Cruz de Arqueros', pregunta: 'La placeta Cruz de Arqueros pertenece al barrio de:', opciones: ['San Ildefonso', 'Albaicín', 'Centro-Sagrario'], correcta: 0 },
      { n: 34, tema: 'zonas', ver: 'Placeta Almona del Albaicín', pregunta: 'La placeta Almona del Albaicín pertenece al barrio de:', opciones: ['San Ildefonso', 'Albaicín', 'Centro-Sagrario'], correcta: 1 },
      { n: 38, tema: 'cruces', ver: 'Plaza del Minarete', pregunta: '¿A cuál de las siguientes calles no se puede acceder desde la Plaza del Minarete?', opciones: ['Acequia', 'Alhami', 'Almenara'], correcta: 1 },
      { n: 40, tema: 'edificios', ver: 'Palacio de los Córdova', pregunta: 'Indique cuál de las siguientes calles da acceso al Palacio de los Córdova:', opciones: ['Cuesta de la Victoria', 'Calle Remiendos', 'Cuesta del Chapiz'], correcta: 2 },
      { n: 42, tema: 'cruces', ver: 'Calle Colegio Catalino', pregunta: '¿A qué localización nos da acceso la calle Colegio Catalino?', opciones: ['Plaza de las Pasiegas', 'Placeta de Santo Cristo', 'Calle Oficios'], correcta: 0 },
      { n: 43, tema: 'cruces', ver: 'Pasaje de Peñaranda', pregunta: 'Indique cuál de las siguientes calles da acceso al Pasaje de Peñaranda:', opciones: ['Calle Príncipe Eugenio', 'Calle Alcalde Íñigo Manrique', 'Calle Henríquez de Jorquera'], correcta: 0 },
      { n: 44, tema: 'lugares', ver: 'Complejo Deportivo Cerrillo de Maracena', pregunta: '¿En qué calle se ubica el Complejo Deportivo Municipal Cerrillo de Maracena?', opciones: ['Calle Olimpia', 'Calle Platón', 'Calle Esopo'], correcta: 2 },
      { n: 45, tema: 'carreteras', ver: 'GR-3301', pregunta: 'La carretera que une los municipios de Otura y Dílar es la:', opciones: ['GR-3301', 'GR-3209', 'A-385'], correcta: 0 },
      { n: 48, tema: 'cruces', ver: 'Calle Loja', pregunta: '¿Cuál de las siguientes calles no conecta con la calle Loja?', opciones: ['Calle Motril', 'Calle Escultor López Azaustre', 'Calle Lanjarón'], correcta: 2 },
      { n: 49, tema: 'carreteras', ver: 'GR-3200', pregunta: 'Para llegar al Polígono Industrial Barrio Alto desde Granada es más rápido acceder por:', opciones: ['GR-3200', 'GR-3201', 'GR-3202'], correcta: 0, nota: 'Según el PDF de polígonos: salida de la GR-3200, dirección Fuente de los 16 Caños.' },
      { n: 50, tema: 'cruces', ver: 'Calle Pizarro Cenjor', pregunta: '¿Cuál de las siguientes calles da acceso a la calle Pizarro Cenjor?', opciones: ['Calle Beniel', 'Calle Totana', 'Calle Castro Cortés'], correcta: 2, nota: 'Castro Cortés empieza en Pizarro Cenjor (es peatonal).' },
      { n: 51, reserva: true, tema: 'lugares', ver: 'Palacio de Dar al-Horra', pregunta: 'El Palacio de Dar al-Horra, ¿dónde se encuentra situado?', opciones: ['Callejón del Pretorio', 'Calle del Agua', 'Callejón de las Monjas'], correcta: 2 },
      { n: 53, reserva: true, tema: 'carreteras', ver: 'A-4075', pregunta: 'La carretera que lleva desde la A-92 al Aeropuerto Federico García Lorca es:', opciones: ['GR-SO-07', 'A-4075', 'A-4074'], correcta: 1, nota: 'La A-4075 es la carretera con código más cercana al aeropuerto.' },
    ],
  },
  {
    anio: 2025,
    titulo: 'Examen de 2025',
    detalle: 'Segunda parte del primer ejercicio (11 plazas), 9 de mayo de 2025. Respuestas de la plantilla oficial.',
    preguntas: [
      { n: 111, tema: 'carreteras', ver: 'Víznar', pregunta: 'Tenemos un accidente de tráfico en la entrada del municipio de Víznar, desplazándonos por la A-92. ¿En qué salida deberíamos desviarnos para llegar al accidente?', opciones: ['Salida 255', 'Salida 250', 'Salida 245'], correcta: 1 },
      { n: 112, tema: 'parques', ver: 'A-44', pregunta: 'Nos encontramos con un incendio de vehículo en la glorieta de la salida 137 de la A-44. En este caso, ¿qué parque de bomberos tiene la cobertura del siniestro?', opciones: ['Parque Sur', 'Parque Norte', 'Parque Norte o Sur según las indicaciones del jefe de dotación'], correcta: 0 },
      { n: 113, tema: 'carreteras', ver: 'GR-3415', pregunta: 'Nos dicen que tenemos una intervención en la GR-3415, ¿hacia qué municipio nos dirigimos?', opciones: ['Puerto Lope', 'Limones', 'Tózar'], correcta: 1 },
      { n: 114, tema: 'carreteras', ver: 'A-44', pregunta: 'Si nos dirigimos a la localidad de Deifontes, ¿qué salida de la A-44 tendremos que coger?', opciones: ['Salida 114', 'Salida 111', 'Salida 108'], correcta: 2 },
      { n: 115, tema: 'carreteras', ver: 'Güéjar Sierra', pregunta: 'Entra en central un aviso de un desprendimiento de tierra en el municipio de Güéjar Sierra. ¿A qué carretera nos estamos refiriendo?', opciones: ['La GR-3200', 'La GR-3201', 'La GR-3202'], correcta: 0 },
      { n: 116, tema: 'carreteras', pregunta: '¿Cuál de estas carreteras se sitúa al noroeste de la ciudad de Granada?', opciones: ['GR-3407', 'GR-3208', 'GR-3303'], correcta: 0 },
      { n: 117, tema: 'carreteras', ver: 'GR-3424', pregunta: 'La carretera GR-3424 nos dirige hacia la localidad de:', opciones: ['Cogollos', 'Güéjar Sierra', 'Valderrubio'], correcta: 0 },
      { n: 118, tema: 'carreteras', ver: 'A-92', pregunta: 'La carretera A-92:', opciones: ['Es una Red Básica Estructurante', 'Es una Red Complementaria Estructurante', 'Es una Red Provincial'], correcta: 0 },
      { n: 119, tema: 'carreteras', ver: 'A-395', pregunta: 'La carretera A-395 dispone de diferentes salidas. ¿La salida 1A a qué dirección corresponde?', opciones: ['A-44 / Motril', 'Zaidín / Ogíjares', 'Cervantes / Huétor Vega'], correcta: 0 },
      { n: 120, tema: 'carreteras', ver: 'A-4027', pregunta: 'Marque la opción correcta. Red Complementaria Metropolitana de Granada:', opciones: ['A-4027', 'GR-3207', 'GR-43'], correcta: 0 },
      { n: 121, tema: 'carreteras', ver: 'GR-30', pregunta: 'Si vamos circulando por la GR-30 y nos comunican que tenemos una incidencia en el centro comercial Sánchez, ¿cuál sería la salida más idónea?', opciones: ['Salida 7', 'Salida 15', 'Salida 18'], correcta: 1 },
      { n: 122, tema: 'trayectos', ver: 'Cúllar Vega', pregunta: 'Policía Local de Cúllar Vega avisa de un incendio de vehículo en la entrada del municipio, cerca de las obras del metro. ¿Qué carreteras nos dirigen hasta la ubicación indicada?', opciones: ['C/ Domingo Puente Marín + Av. de las Ciencias + GR-3303 + GR-3304', 'Av. Fernando de los Ríos + Av. de las Ciencias + GR-3303 + GR-3304', 'GR-30 + A-92G + GR-3304'], correcta: 0 },
      { n: 132, tema: 'carreteras', ver: 'Polígono Industrial Dos de Octubre', pregunta: 'Nos dirigimos al Polígono Industrial 2 de Octubre para atender a un trabajador que se ha atrapado una mano en una máquina prensadora. ¿A qué municipio nos dirigimos?', opciones: ['Atarfe', 'Santa Fe', 'Cijuela'], correcta: 1 },
      { n: 133, tema: 'carreteras', ver: 'Atarfe', pregunta: '¿Cuál de estos polígonos industriales no pertenece al municipio de Atarfe?', opciones: ['Polígono Industrial La Estación', 'Polígono Industrial Santa Ana', 'Polígono Industrial Santa Isabel'], correcta: 1, nota: 'En OpenStreetMap el Polígono Santa Ana aparece junto a Sierra Elvira; la plantilla dice que no es de Atarfe.' },
      { n: 134, tema: 'trayectos', ver: 'Calle Vereda de Enmedio', pregunta: 'Tenemos un incendio en la calle Vereda de Enmedio, concretamente en el número 1. ¿Cuál es el acceso más indicado?', opciones: ['Por Cuesta de los Chinos', 'Por calle Guinea', 'Por calle Gumiel de San José'], correcta: 0 },
      { n: 135, tema: 'trayectos', ver: 'Calle Echevarría', pregunta: 'Tenemos una intervención en la calle Echevarría, ¿cuál sería el mejor acceso posible?', opciones: ['Por calle Guinea', 'Por Molinillo y calle Granadillo', 'Por calle Gumiel de San José'], correcta: 2 },
      { n: 136, tema: 'zonas', ver: 'Calle Gustavo Doré', pregunta: 'La calle Gustavo Doré, ¿a qué distrito granadino pertenece?', opciones: ['Chana', 'Centro', 'Norte'], correcta: 0 },
      { n: 137, tema: 'zonas', ver: 'Calle Matilde Díaz', pregunta: 'La calle Matilde Díaz, ¿a qué barrio granadino pertenece?', opciones: ['Al barrio del Cerrillo de Maracena', 'Al barrio de Angustias-Chana-Encina', 'Al barrio de Bobadilla'], correcta: 1 },
      { n: 138, tema: 'trayectos', ver: 'Calle Maestro Faus', pregunta: 'Tenemos una persona no acompañada que necesita ayuda en su vivienda de la calle Maestro Faus, ¿qué itinerario tomaremos?', opciones: ['C/ Antonio Dalmases + C/ Sos del Rey Católico + C/ Poeta Manuel de Góngora + Paseo de los Basilios + Av. Cervantes + destino', 'C/ Antonio Dalmases + C/ Profesor Tierno Galván + Camino de la Zubia + C/ Agustín Lara + Camino Bajo de Huétor + C/ Pianista Pepita Bustamante + destino', 'C/ Antonio Dalmases + Paseo del Violón + Av. Barcelona + Av. Barcelona + C/ Andrés Segovia + destino'], correcta: 1, nota: 'Sale del Parque Sur (calle Antonio Dalmases).' },
      { n: 139, tema: 'zonas', ver: 'Calle Iznájar', pregunta: 'La calle Iznájar, ¿a qué distrito pertenece?', opciones: ['Distrito Centro', 'Distrito Chana', 'Distrito Norte'], correcta: 2, nota: 'En el mapa de la app (límites de OpenStreetMap) queda justo dentro del distrito Beiro, en el borde con el Norte; manda el examen.' },
      { n: 140, tema: 'zonas', pregunta: '¿Cuál de estos barrios no pertenece al distrito Genil?', opciones: ['Cervantes', 'La Cruz', 'Castaño - Mirasierra'], correcta: 1 },
      { n: 141, tema: 'extremos', ver: 'Calle Padua', pregunta: 'La calle Padua empieza y acaba con:', opciones: ['Av. Italia y C/ Palencia', 'Av. Don Bosco y C/ Roma', 'C/ Palencia y Av. América'], correcta: 2 },
      { n: 142, tema: 'parques', ver: 'Plazoleta Niños Hebreos', pregunta: '¿A qué distrito y parque de bomberos pertenece la Plazoleta de los Niños Hebreos?', opciones: ['Distrito Centro, Parque Sur', 'Distrito Beiro, Parque Norte', 'Distrito Albaicín, Parque Sur'], correcta: 2 },
      { n: 143, tema: 'parques', ver: 'Calle Acera de San Ildefonso', pregunta: 'La calle Acera de San Ildefonso pertenece al distrito y parque de bomberos siguientes:', opciones: ['Distrito Centro, Parque Sur', 'Distrito Beiro, Parque Norte', 'Distrito Albaicín, Parque Norte'], correcta: 1 },
      { n: 144, tema: 'edificios', ver: 'Calle Convalecencia', pregunta: '¿Qué edificio singular se encuentra en la calle Convalecencia?', opciones: ['Carmen de los Mártires', 'Museo San Juan de Dios', 'Antiguo Colegio de San Pablo'], correcta: 1 },
      { n: 145, tema: 'lugares', ver: 'Calle Larga de San Cristóbal', pregunta: '¿A través de qué calle podemos acceder al Aljibe del Colorado o de la Saria de Granada?', opciones: ['C/ Zafra', 'C/ Larga de San Cristóbal', 'C/ San Luis'], correcta: 1 },
      { n: 146, tema: 'lugares', ver: 'Iglesia de los Hospitalicos', pregunta: 'La Iglesia de los Hospitalicos está ubicada en:', opciones: ['Av. Constitución', 'Calle Elvira', 'Antigua Carretera de Murcia'], correcta: 1, nota: 'En OpenStreetMap su dirección es Calle Hospital Corpus Christi, 5; la plantilla da la calle Elvira.' },
      { n: 147, tema: 'trayectos', ver: 'Plaza el Burladero', pregunta: 'Dime el recorrido más correcto para llegar a la Plaza el Burladero:', opciones: ['C/ Iznalloz + C/ Federico García Lorca + Av. Compositor Luis de Narváez + Plaza de Europa + Av. de Francisco Ayala + destino', 'Av. Juan Pablo II + Casería de Aguirre + Arquitecto Modesto Cendoya + C/ Andújar + destino', 'Av. Juan Pablo II Ronda + C/ Gobernador Pedro Temboury + C/ Iznájar + destino'], correcta: 0 },
      { n: 148, tema: 'extremos', ver: 'Placeta del Cobertizo', pregunta: 'La Placeta del Cobertizo:', opciones: ['Se sitúa entre el Callejón del Aljibe de Trillo y la C/ Rosal de San Pedro', 'Está en la C/ Virgen del Carmen', 'Se inicia en el Callejón Almez'], correcta: 0 },
      { n: 149, tema: 'sentido', pregunta: '¿Cuál de las calles que a continuación se citan es una calle sin salida para vehículos?', opciones: ['Calle el Vadillo', 'Calle Poqueira', 'Las dos calles son sin salida'], correcta: 0, nota: 'En el callejero oficial la Calle Vadillo une Carretera de la Sierra y Calle El Calar; según el examen, los vehículos no tienen salida por ella.' },
      { n: 150, tema: 'extremos', ver: 'Calle Pintor Velázquez', pregunta: '¿Entre qué calles se encuentra la C/ Pintor Velázquez?', opciones: ['Entre C/ Pedro Antonio de Alarcón y C/ Pintor López Mezquita', 'Entre C/ Pintor López Mezquita y C/ Gregorio Espín', 'Entre C/ Pedro Antonio de Alarcón y C/ Pintor Rodríguez Acosta'], correcta: 0 },
      { n: 151, tema: 'carreteras', ver: 'Las Gabias', pregunta: 'Si nos dicen que tenemos un incendio en la zona residencial San Javier, nos tenemos que dirigir al municipio de:', opciones: ['Las Gabias', 'Peligros', 'Híjar'], correcta: 0 },
      { n: 152, tema: 'zonas', ver: 'Calle Filólogo Julio Casares', pregunta: 'La calle del Filólogo Julio Casares, ¿a qué barrio pertenece?', opciones: ['Barrio de la Chana', 'Barrio de la Rosaleda', 'Barrio de La Paz'], correcta: 1 },
      { n: 153, tema: 'sentido', pregunta: '¿En cuál de estas calles no puede circular un vehículo de bomberos?', opciones: ['Calle Alpargateros Alta', 'Calle del Carnero', 'Calle Espaldas'], correcta: 1 },
      { n: 161, reserva: true, tema: 'carreteras', ver: 'Alfacar', pregunta: '¿A qué término municipal pertenece el Polígono Industrial P.I. S.A.U. 8?', opciones: ['Jun', 'Alfacar', 'Nigüelas'], correcta: 1 },
      { n: 162, reserva: true, tema: 'carreteras', ver: 'N-432', pregunta: 'Para ir al Polígono Industrial Las Trompetas, ¿qué carretera tenemos que coger?', opciones: ['N-432', 'N-323', 'GR-3415'], correcta: 0 },
      { n: 163, reserva: true, tema: 'carreteras', ver: 'Güéjar Sierra', pregunta: 'El Polígono Industrial del Barrio Alto, ¿a qué municipio pertenece?', opciones: ['Peligros', 'Moclín', 'Güéjar Sierra'], correcta: 2 },
    ],
  },
]

// Las preguntas de un examen (o de todos) como las del Test: { id, tema, pregunta, opciones, correcta, explicacion,
// enlace }. "enlaceDe(nombre)" da el enlace al mapa de una calle, un lugar, un pueblo o una carretera (o null).
export function preguntasReales(anios, enlaceDe = () => null) {
  return EXAMENES_REALES.filter((e) => anios.includes(e.anio)).flatMap((e) =>
    e.preguntas.map((p) => ({
      id: `real:${e.anio}:${p.n}`,
      tema: p.tema,
      tarjeta: null,
      origen: `${e.titulo}, pregunta ${p.n}${p.reserva ? ' (de reserva)' : ''}`,
      pregunta: p.pregunta,
      opciones: p.opciones,
      correcta: p.correcta,
      explicacion: [
        e.calculada ? 'Respuesta calculada con los datos de la app (no hay plantilla oficial).' : 'Respuesta de la plantilla oficial.',
        p.nota,
      ]
        .filter(Boolean)
        .join(' '),
      enlace: (p.ver && enlaceDe(p.ver)) || null,
    })),
  )
}
