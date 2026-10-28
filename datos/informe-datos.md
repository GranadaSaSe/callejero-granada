# Informe de datos

Generado el 2026-10-28 con los datos descargados entre el 2026-10-27 y el 2026-10-28. Se vuelve a crear con `npm run datos:procesar`.

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
- 234 tramos ya revisados a mano en el mapa de revisión.
- **1204 tramos dudosos**: el CDAU y OpenStreetMap dicen cosas distintas. Hay que revisarlos (paso 1.3).

| CDAU dice | OpenStreetMap dice | Tramos dudosos |
| --- | --- | --- |
| doble sentido | peatonal | 346 |
| doble sentido | sentido único | 310 |
| peatonal | doble sentido | 148 |
| sentido único | doble sentido | 145 |
| sentido único | peatonal | 104 |
| sentido único | sentido único, pero al revés | 102 |
| peatonal | sentido único | 49 |

- Sentido de las calles: doble 826, mixto 561, peatonal 550, hacia el final 282, hacia el inicio 260, desconocido 16.
- 133 calles están en varios trozos separados (se estudia el más largo).
- 285 calles no tienen otra calle en alguno de sus extremos (sin salida, o terminan en un camino sin nombre).

Códigos de circulación del CDAU, deducidos comparando cada tramo con OpenStreetMap:

| Código | Significado |
| --- | --- |
| 311, 331 | Sentido único, en el sentido en que está dibujado el tramo |
| 322, 332 | Sentido único, al contrario de como está dibujado |
| 333 | Doble sentido |
| 330 | Peatonal |

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

- 72 carreteras con código en el área.
- 107 salidas de autovía: 99 con número y 99 con destinos.
- 57 municipios en la zona descargada; falta quedarse solo con los del área metropolitana.

## Fondo del mapa

- Ríos al aire libre: Río Beas, Río Beiro, Río Darro, Río Dílar, Río Genil, Río Monachil.
- Manchas: verde 584, agua 43, cementerio 3.
- 28 trozos de vía del tren (solo vías principales al aire libre).

Fuentes: © colaboradores de OpenStreetMap (ODbL) · Callejero Digital de Andalucía Unificado, Junta de Andalucía (CC BY 4.0).
