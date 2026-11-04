# Informe de datos

Generado el 2026-11-04 con los datos descargados entre el 2026-10-27 y el 2026-10-29. Se vuelve a crear con `npm run datos:procesar`.

## Distritos y barrios

8 distritos y 32 barrios (OpenStreetMap).

| Distrito | Barrios |
| --- | --- |
| Albaicín | Albaicín, Fargue, Haza Grande, Sacromonte |
| Beiro | Joaquina Eguaras, La Cruz, Pajaritos, Plaza Toros - Doctores - San Lázaro, San Francisco Javier, San Ildefonso |
| Centro | Centro - Sagrario, San Matías - Realejo |
| Chana | Angustias - Chana - Encina, Bobadilla, Cerrillo de Maracena |
| Genil | Bola de Oro, Camino de los Neveros, Carretera de la Sierra, Castaño - Mirasierra, Cervantes, Lancha del Genil |
| Norte | Almanjáyar, Campo Verde, Cartuja, Casería de Montijo, La Paz, Parque Nueva Granada, Rey Badis |
| Ronda | Fígares, Ronda, Rosaleda |
| Zaidín | Zaidín - Vergeles |

## Calles

- 2495 calles con nombre oficial (CDAU); 231 vías sin nombre aparte.
- 9401 tramos; 0 sin calle asignada.
- Sentido de circulación según: callejero oficial (CDAU) 6739, OpenStreetMap 2535, sin dato 127.
- 61 tramos sin sentido en el CDAU son de doble sentido por ser bulevares (una calzada de sentido único a cada lado en OpenStreetMap): Avenida de América, Avenida de Barcelona, Avenida de Francisco Ayala, Avenida de las Alpujarras, Avenida de las Fuerzas Armadas, Avenida de Pulianas, Avenida Don Bosco, Avenida Juan Pablo II, Avenida Maracena (Cerrillo), Avenida Profesor Domínguez Ortiz, Calle Alcalde Díaz Berbel, Calle Calicasas, Calle Doctor Severo Ochoa, Calle El Castañal, Calle Emir, Calle José Tamayo, Calle Julio Verne, Calle Maestro Faus, Calle María Auxiliadora, Calle Náyades, Calle Neptuno, Calle Padre Francisco Palau y Quer, Calle Padre Marcelino Álvarez, Calle Paquito Rodríguez, Calle Pedro Machuca, Calle Periodista José Fernández Martínez, Calle Periodista José Mezcua Ruiz, Calle Periodista Luis Seco de Lucena, Calle Profesor Clavera, Calle Rector José Vida Soria, Calle Tórtola, Camino Bajo de Huétor, Carretera A-395 de Granada a Sierra Nevada, Carretera A-4006 Distribuidor Norte de Granada, Carretera de La Zubia, Carretera de Málaga, Carretera GR-3202 de Granada a Monachil (A-395), Carretera GR-3209 de Granada (A-395) a Dílar, Carretera N-432 de Granada a Badajoz, Cuesta de la Plata, Paseo del Violón.
- 395 tramos ya revisados a mano en el mapa de revisión.
- **1045 tramos dudosos**: el CDAU y OpenStreetMap dicen cosas distintas. Hay que revisarlos (paso 1.3).

| CDAU dice | OpenStreetMap dice | Tramos dudosos |
| --- | --- | --- |
| doble sentido | peatonal | 332 |
| doble sentido | sentido único | 230 |
| peatonal | doble sentido | 140 |
| sentido único | doble sentido | 118 |
| sentido único | peatonal | 102 |
| sentido único | sentido único, pero al revés | 82 |
| peatonal | sentido único | 41 |

- Sentido de las calles: doble 843, peatonal 549, mixto 543, hacia el final 280, hacia el inicio 264, desconocido 16.
- 133 calles están en varios trozos separados (se estudia el más largo).
- 285 calles no tienen otra calle en alguno de sus extremos (sin salida, o terminan en un camino sin nombre).

Códigos de circulación del CDAU, deducidos comparando cada tramo con OpenStreetMap:

| Código | Significado |
| --- | --- |
| 311, 331 | Sentido único, en el sentido en que está dibujado el tramo |
| 322, 332 | Sentido único, al contrario de como está dibujado |
| 333 | Doble sentido |
| 330 | Peatonal |

## Red de calles para los trayectos

- 8876 tramos por los que se circula y 6489 cruces; 645 cruces unidos porque el callejero no corta la otra calle.
- 333 trozos (46.820 m) que no están en el callejero, añadidos desde OpenStreetMap: carreteras, enlaces y caminos de las afueras.
- 5956 cruces (92 %) se comunican todos entre sí respetando los sentidos. El resto son sobre todo calles sin salida de un solo sentido, urbanizaciones y errores de sentido.
- Giros prohibidos de OpenStreetMap: 346 aplicados de 469 (79 sin un cruce parecido en el callejero, 21 con una calle sin datos, 4 que pasan por una calle entera, 19 que no cuentan: los «excepto autobús» de las calles sin limitación y los de Gran Vía, que es una calle normal).
- 1202 tramos dudosos o sin sentido conocido: no se usarán en las preguntas de trayectos.
- 418 tramos con el paso limitado según OpenStreetMap (residentes, autobús y taxi, privados): las rutas solo pasan por ellos si no hay otro camino. Gran Vía, Reyes Católicos, Recogidas y Antonio Dalmases no cuentan: se pasa por ellas sin limitación.

## Lugares de interés

886 lugares (OpenStreetMap); 806 con dirección.

| Tipo | Lugares | Con dirección |
| --- | --- | --- |
| Monumentos | 199 | 163 |
| Colegios e institutos | 114 | 112 |
| Parques y jardines | 88 | 76 |
| Iglesias y templos | 78 | 76 |
| Cultura | 72 | 67 |
| Centros de salud | 49 | 49 |
| Edificios oficiales | 45 | 45 |
| Estatuas y esculturas | 41 | 40 |
| Instalaciones deportivas | 40 | 37 |
| Universidad y formación | 36 | 34 |
| Miradores | 26 | 16 |
| Residencias y centros sociales | 25 | 24 |
| Transporte | 20 | 19 |
| Hospitales | 12 | 12 |
| Escuelas infantiles | 11 | 11 |
| Fuentes | 10 | 8 |
| Centros comerciales y mercados | 8 | 8 |
| Policía | 7 | 7 |
| Cementerios | 3 | 0 |
| Bomberos | 2 | 2 |

## Carreteras y salidas

Zona de los parques de bomberos de Granada (detalle en `datos/informe-zona.md`):

- 53 municipios; 52 con el camino desde Granada calculado.
- 96 carreteras con código.
- 70 salidas de autovía: 67 con número y 66 con destinos.

## Fondo del mapa

- Ríos al aire libre: Río Beas, Río Beiro, Río Darro, Río Dílar, Río Genil, Río Monachil.
- Manchas: verde 584, agua 43, cementerio 3.
- 28 trozos de vía del tren (solo vías principales al aire libre).

Fuentes: © colaboradores de OpenStreetMap (ODbL) · Callejero Digital de Andalucía Unificado, Junta de Andalucía (CC BY 4.0).
