# Reporte de datos · 2026-11-03.040f74aa

Generado el 2026-11-04 con el callejero de BA Data y OpenStreetMap.

## Validaciones

| Chequeo | Bloqueante | Resultado | Detalle |
| --- | --- | --- | --- |
| Conectividad sobre el grafo con giros | Sí | OK | 98.35% de las aristas (sin la zona de borde); el mínimo es 98% |
| Cambio de sentido en medio de una cuadra | Sí | OK | 0 casos entre tramos confiables; tiene que haber cero (más 1 con un tramo en duda, que no se pregunta) |
| Trampas (grupos de aristas sin salida legal) | No | AVISO | 13 trampas, listadas en el reporte |
| Cruce con OSM | Sí | OK | 97.6% de los tramos tienen par; el mínimo es 90% |
| Hechos reales confirmados por Tomás | No | PENDIENTE | todavía no hay archivo |

## Resumen

- Tramos en el grafo: **8042** (área 6939, borde 1103) · nodos: 4712 · fuera del área: 136
- Calles: 594 (482 se pueden preguntar) · tarjetas de sentido: 1877
- Barreras (autopistas y ramas): 190 tramos
- Cruce con OSM: 7846 de 8042 tramos con par (97.6%); coinciden 7301 de 7668 comparables (95.2%)
- Estados de confianza: confirmado 7301 (90.8%) · en-duda 367 (4.6%) · inferida 291 (3.6%) · sin-par 83 (1.0%)

## Peso de los datos

| Archivo | KB |
| --- | --- |
| tramos.json | 615 |
| grafo.json | 108 |
| calles.json | 841 |
| patrones.json | 12 |
| hitos.json | 26 |
| vias.json | 40 |
| barreras.json | 61 |
| fondo.json | 222 |
| barrios.json | 33 |
| LICENCIAS.txt | 1 |
| cambios-2026-11-03.e001b1ac-2026-11-03.040f74aa.json | 0 |
| **Total** | **1959** |

## Conectividad y trampas

Aristas en la componente principal: 98.35% (sin la zona de borde).
Otras componentes: 142. De esas, 13 trampas (se entra y no se sale) y 5 islas (tramos sueltos: ni se entra ni se sale, el Navegante no los usa).

| Calles | Aristas | Dónde (lat, lng) |
| --- | --- | --- |
| Int. Bunge | 2 | -34.55826, -58.43112 |
| Vidal | 1 | -34.55469, -58.46877 |
| Av. Dorrego | 1 | -34.56523, -58.41973 |
| Virrey Olaguer y Feliú | 1 | -34.56962, -58.45423 |
| Av. Dorrego | 1 | -34.57590, -58.43662 |
| Av. Comodoro Py | 1 | -34.58638, -58.36705 |
| Av. Gral. Paz | 1 | -34.56739, -58.50809 |
| Av. Gral. Paz | 1 | -34.57043, -58.51031 |
| 3 de Febrero | 1 | -34.54084, -58.46621 |
| Av. Gral. Paz | 1 | -34.55071, -58.50124 |
| Av. Gral. Paz | 1 | -34.54048, -58.47844 |
| Av. de los Ombúes | 1 | -34.55684, -58.42410 |
| Av. Gral. Paz | 1 | -34.54931, -58.49836 |

Islas: Av. Gral. Paz (3), Carlos H. Perette, Chilca.

## Cambios de sentido en medio de una cuadra

| Calle | Dónde (lat, lng) |
| --- | --- |
| Av. Ing. José N. Quartino | -34.58990, -58.36904 |

## Sentidos que no coinciden con OSM (en duda)

Ordenados por importancia de la calle. Son los primeros a verificar en la calle.

| Calle | Alturas | Callejero | Dónde (lat, lng) |
| --- | --- | --- | --- |
| Av. del Libertador | sin alturas | CRECIENTE | -34.57465, -58.41480 |
| Av. del Libertador | 1001-1100 | DECRECIENTE | -34.58590, -58.38744 |
| Av. del Libertador | 5101-5199 | CRECIENTE | -34.56270, -58.43883 |
| Av. del Libertador | 3401-3429 | CRECIENTE | -34.57445, -58.41586 |
| Av. del Libertador | 3361-3399 | CRECIENTE | -34.57508, -58.41442 |
| Av. del Libertador | sin alturas | CRECIENTE | -34.57087, -58.42344 |
| Av. del Libertador | 5502-5510 | DECRECIENTE | -34.56125, -58.44391 |
| Av. Santa Fe | 4902-4930 | DECRECIENTE | -34.57727, -58.42931 |
| Av. Santa Fe | 4701-4799 | CRECIENTE | -34.57793, -58.42687 |
| Av. Santa Fe | sin alturas | CRECIENTE | -34.57746, -58.42845 |
| Av. Congreso | 1902-1970 | CRECIENTE | -34.55318, -58.45799 |
| Av. Congreso | 4001-4007 | CRECIENTE | -34.56374, -58.47879 |
| Av. Congreso | 4009-4099 | CRECIENTE | -34.56423, -58.47979 |
| Av. Congreso | 4002-4100 | DECRECIENTE | -34.56434, -58.47972 |
| Av. Pres. Figueroa Alcorta | 5381-5400 | CRECIENTE | -34.56223, -58.42372 |
| Av. Pres. Figueroa Alcorta | sin alturas | CRECIENTE | -34.54773, -58.44179 |
| Av. Pres. Figueroa Alcorta | 3902-3910 | CRECIENTE | -34.57124, -58.41242 |
| Mendoza | 3501-3600 | CRECIENTE | -34.56815, -58.46930 |
| Av. Álvarez Thomas | sin alturas | DOBLE | -34.57762, -58.47375 |
| Mendoza | 5401-5499 | CRECIENTE | -34.57931, -58.48757 |
| Mendoza | 5402-5500 | DECRECIENTE | -34.57936, -58.48752 |
| Mendoza | 5302-5400 | DECRECIENTE | -34.57896, -58.48682 |
| Mendoza | 5202-5300 | DECRECIENTE | -34.57840, -58.48581 |
| Mendoza | 5102-5200 | DECRECIENTE | -34.57782, -58.48480 |
| Mendoza | 5002-5100 | DECRECIENTE | -34.57672, -58.48284 |
| Echeverría | sin alturas | DOBLE | -34.55971, -58.45035 |
| Dr. Pedro I. Rivera | 4501-4600 | DECRECIENTE | -34.56924, -58.48258 |
| Dr. Pedro I. Rivera | 4601-4700 | DECRECIENTE | -34.56980, -58.48349 |
| Dr. Pedro I. Rivera | 4701-4800 | DOBLE | -34.57035, -58.48441 |
| Monroe | sin alturas | DOBLE | -34.55294, -58.45091 |
| Monroe | sin alturas | CRECIENTE | -34.56610, -58.47242 |
| Monroe | sin alturas | CRECIENTE | -34.56610, -58.47242 |
| Monroe | sin alturas | CRECIENTE | -34.56666, -58.47337 |
| Monroe | 3602-3700 | DECRECIENTE | -34.56579, -58.47178 |
| Monroe | 3752-3800 | DECRECIENTE | -34.56653, -58.47305 |
| Av. Virrey Vértiz | 1701-1799 | CRECIENTE | -34.56040, -58.44669 |
| Virrey del Pino | sin alturas | CRECIENTE | -34.56141, -58.44381 |
| Rómulo Naón | 4201-4300 | DOBLE | -34.55069, -58.48581 |
| Av. Guillermo Udaondo | 951-1100 | DOBLE | -34.54354, -58.44997 |
| Av. Guillermo Udaondo | 1201-1300 | DOBLE | -34.54639, -58.45218 |
| … y 327 más | | | |

## Tus correcciones (overrides.json)

- Aplicadas: 0 · ya coincidían (se pueden borrar): 0 · sin tramo: 0 · rechazadas: 0

## Cuadras que se contradicen (no se preguntan)

Misma calle y casi las mismas alturas, pero dirían otra cosa que la calle a esa altura: laterales de una doble mano, transiciones o pedazos de rampa. Conviene mirarlas en Street View.

| Calle | Alturas | Sentido | Dónde (lat, lng) |
| --- | --- | --- | --- |
| Av. del Libertador | sin alturas | B | -34.57515, -58.41526 |
| Av. del Libertador | 401-409 | F | -34.58987, -58.37932 |
| Av. del Libertador | 901-999 | F | -34.58672, -58.38496 |
| Av. del Libertador | 411-759 | F | -34.58770, -58.38328 |
| Av. del Libertador | 761-899 | F | -34.58709, -58.38429 |
| Av. Gral. Paz | 802-900 | B | -34.53811, -58.47260 |
| Av. Gral. Paz | sin alturas | B | -34.56502, -58.50699 |
| Av. Gral. Paz | sin alturas | F | -34.54980, -58.50074 |
| Av. Gral. Paz | 702-800 | B | -34.53780, -58.47189 |
| Av. Gral. Paz | sin alturas | B | -34.53785, -58.47229 |
| Av. Gral. Paz | sin alturas | F | -34.55724, -58.50411 |
| Av. Pres. Figueroa Alcorta | sin alturas | F | -34.56299, -58.42118 |
| Av. Guillermo Udaondo | sin alturas | F | -34.54417, -58.45058 |
| Av. Guillermo Udaondo | sin alturas | F | -34.54396, -58.45012 |
| Av. Lidoro J. Quinteros | 1185-1199 | F | -34.54994, -58.45047 |
| Av. Lidoro J. Quinteros | 1186-1200 | B | -34.54996, -58.45008 |
| Plaza | 3601-3699 | F | -34.55658, -58.48508 |
| Plaza | 3501-3599 | F | -34.55768, -58.48435 |
| Plaza | 3152-3200 | B | -34.56272, -58.48117 |
| Plaza | 3102-3150 | B | -34.56296, -58.48096 |
| Holmberg | 2531-2599 | F | -34.56817, -58.47785 |
| Av. Parque Roberto Goyeneche | 4801-4849 | F | -34.54781, -58.49223 |
| Av. Costanera Rafael Obligado | 1692-1700 | B | -34.56807, -58.40140 |
| Av. Costanera Rafael Obligado | sin alturas | F | -34.57225, -58.39501 |
| Rómulo Naón | 3601-3699 | F | -34.55517, -58.48239 |
| Rómulo Naón | 3602-3700 | B | -34.55562, -58.48204 |
| Av. Congreso | 3982-4000 | B | -34.56396, -58.47902 |
| Av. Dr. Ricardo Balbín | 4401-4449 | F | -34.55530, -58.49527 |
| Av. Dr. Ricardo Balbín | 4041-4043 | F | -34.55483, -58.48760 |
| José Hernández | 1551-1600 | B | -34.56103, -58.44529 |
| Virrey del Pino | sin alturas | B | -34.56165, -58.44418 |
| Altolaguirre | sin alturas | B | -34.57696, -58.49093 |
| Altolaguirre | 2402-2430 | B | -34.57678, -58.49113 |
| Av. Sarmiento | 4102-4200 | B | -34.57110, -58.41154 |
| Av. Sarmiento | sin alturas | F | -34.57507, -58.41463 |
| Av. de los Constituyentes | 4701-4799 | F | -34.58074, -58.49355 |
| Jerónimo Salguero | 3751-3775 | B | -34.57080, -58.39972 |
| Jerónimo Salguero | sin alturas | F | -34.57027, -58.39900 |
| Av. Pres. Ramón S. Castillo | 802-950 | B | -34.58011, -58.37639 |
| Av. Pres. Ramón S. Castillo | 952-1140 | B | -34.58026, -58.37935 |
| Av. Pres. Ramón S. Castillo | 1142-1250 | B | -34.58026, -58.37983 |
| Av. Pres. Ramón S. Castillo | 1502-1750 | B | -34.57842, -58.38442 |
| Av. Pres. Ramón S. Castillo | 1252-1400 | B | -34.57916, -58.38211 |
| Av. Pres. Ramón S. Castillo | 1402-1500 | B | -34.57885, -58.38271 |
| Av. Pres. Ramón S. Castillo | sin alturas | F | -34.57767, -58.38633 |
| Av. Antártida Argentina | 1101-1123 | F | -34.58967, -58.37084 |
| Av. Antártida Argentina | 1102-1124 | B | -34.59024, -58.37103 |
| Av. Antártida Argentina | 1691-1699 | F | -34.58179, -58.37338 |
| Av. Alvear | sin alturas | F | -34.58606, -58.39025 |
| Av. Comodoro Py | sin alturas | F | -34.58978, -58.37012 |
| Av. Dr. José María Ramos Mejía | 1562-1570 | B | -34.58919, -58.37252 |
| Av. Dr. José María Ramos Mejía | 1572-1580 | B | -34.58906, -58.37242 |
| Av. Dr. José María Ramos Mejía | 1582-1600 | B | -34.58880, -58.37223 |
| Av. Dr. José María Ramos Mejía | 1641-1700 | B | -34.58815, -58.37178 |
| Av. Dr. José María Ramos Mejía | sin alturas | F | -34.58910, -58.37113 |
| Av. Eduardo Madero | 1211-1299 | F | -34.59109, -58.37347 |
| Av. Eduardo Madero | 1202-1300 | F | -34.59122, -58.37353 |
| Av. Eduardo Madero | 1201-1209 | F | -34.59155, -58.37253 |
| San Martín | sin alturas | F | -34.59000, -58.37070 |
| Letonia | 1-9 | F | -34.58907, -58.37087 |
| Letonia | 2-10 | B | -34.58885, -58.37092 |

## Orientación de los tramos

- vecinos: 6940
- sin-alturas: 755
- hipotesis: 330
- vecinos (dibujado al revés, corregido): 17
- Sin alturas con el sentido de OSM: 319. De esos, 0 quedaron en duda porque no siguen a sus vecinos y 115 con orientación inferida por ser cortos y sin vecino que los confirme.

## Alturas

Cuadras seguidas de la misma calle cuya numeración no empalma (salto de más de 20 números): 6. Ordenadas por importancia de la calle.

| Calle | Cuadra | Sigue con | Dónde (lat, lng) |
| --- | --- | --- | --- |
| Av. Córdoba | 101-200 | 251-276 | -34.59839, -58.37096 |
| Av. Córdoba | 251-276 | 201-300 | -34.59839, -58.37117 |
| Carlos E. Pellegrini | 5671-5700 | 5801-6000 | -34.56330, -58.50240 |
| Ombú | 2951-3000 | 3059-3100 | -34.57717, -58.40114 |
| Ombú | 2901-2920 | 3001-3050 | -34.57827, -58.40046 |
| Berlín | 4427-4500 | 3901-4000 | -34.58204, -58.47817 |

Cuadras con más de 250 números entre punta y punta: 64 (lo esperable es unos 100).

| Calle | Alturas | Dónde (lat, lng) |
| --- | --- | --- |
| Av. del Libertador | 3901-4400 | -34.57051, -58.42477 |
| Av. del Libertador | 411-759 | -34.58770, -58.38328 |
| Av. Pres. Figueroa Alcorta | 6001-6400 | -34.55557, -58.43204 |
| Av. Pres. Figueroa Alcorta | 5701-6000 | -34.55737, -58.42977 |
| Av. Pres. Figueroa Alcorta | 5401-5692 | -34.55951, -58.42708 |
| Av. Pres. Figueroa Alcorta | 4001-4800 | -34.56912, -58.41530 |
| Av. Pres. Figueroa Alcorta | 2301-2800 | -34.58180, -58.39571 |
| Av. Pres. Figueroa Alcorta | 4801-5099 | -34.56784, -58.41651 |
| La Pampa | 301-600 | -34.55203, -58.43264 |
| La Pampa | 1-300 | -34.55143, -58.43194 |
| Av. Antártida Argentina | 1402-1670 | -34.58233, -58.37384 |
| Av. Crisólogo Larralde | 1001-1500 | -34.54383, -58.45797 |
| Av. Crisólogo Larralde | 6351-6900 | -34.56939, -58.50860 |
| Av. Dorrego | 3701-4099 | -34.56274, -58.41674 |
| Av. Dorrego | 3201-3500 | -34.57225, -58.42619 |
| Av. Dorrego | 3702-4100 | -34.56269, -58.41702 |
| Av. Sarmiento | 3401-3850 | -34.57433, -58.41446 |
| Av. Sarmiento | 2601-3100 | -34.57735, -58.41727 |
| Av. Valentín Alsina | 701-1230 | -34.55637, -58.43834 |
| Av. Valentín Alsina | 1231-1500 | -34.56068, -58.44017 |
| Av. Costanera Rafael Obligado | 6201-6560 | -34.54928, -58.43080 |
| Av. Costanera Rafael Obligado | 5501-5900 | -34.55273, -58.42481 |
| Av. Costanera Rafael Obligado | 5101-5500 | -34.55313, -58.42358 |
| Av. Costanera Rafael Obligado | 4201-4499 | -34.55629, -58.41265 |
| Av. Costanera Rafael Obligado | 3451-4199 | -34.55788, -58.41030 |
| Av. Costanera Rafael Obligado | 6561-6900 | -34.54616, -58.43100 |
| Av. Costanera Rafael Obligado | 1751-2300 | -34.56523, -58.40172 |
| Av. Costanera Rafael Obligado | 2301-3150 | -34.56313, -58.40485 |
| Av. Costanera Rafael Obligado | 3302-4200 | -34.55873, -58.40952 |
| Av. Costanera Rafael Obligado | 4202-4500 | -34.55674, -58.41216 |
| Av. Costanera Rafael Obligado | 4652-5100 | -34.55415, -58.41923 |
| Comodoro Martín Rivadavia | 1101-1600 | -34.54134, -58.46309 |
| Parque de los Niños | 501-800 | -34.53133, -58.45419 |
| Av. Triunvirato | 6101-6450 | -34.55935, -58.49589 |
| Av. Pres. Ramón S. Castillo | 2301-2600 | -34.57462, -58.39099 |
| Av. Pres. Ramón S. Castillo | 1782-2150 | -34.57707, -58.38896 |
| Av. Pres. Ramón S. Castillo | 301-699 | -34.58171, -58.37281 |
| Av. Pres. Ramón S. Castillo | 302-700 | -34.58184, -58.37296 |
| Arias | 3711-4000 | -34.54826, -58.48761 |
| Av. Gral. Paz | 4502-4890 | -34.56763, -58.50805 |
| … y 24 más | | |

## Nombres repetidos en lugares distintos

Ninguno.

## Calles sin nombre oficial

Se manejan, pero nunca se preguntan: 13 calles, 91 tramos.
Acceso Dot, Antonio Vespucio Liberti (no Oficial), Calle 12 (no Oficial), Calle 13 (no Oficial), Calle 14 (no Oficial), Calle 7 (no Oficial), Calle 8 (no Oficial), Ciudad Universitaria, Emilio Petorutti (no Oficial), Parque de los Niños, San Pedro de Jujuy, Sin Nombre Oficial (alt. Edison 2700), Sin Nombre Oficial (alt. Salguero 3510)

## Patrones de sentido

Grupos de paralelas que alternan sentido, de 4 o más, a lo largo de 2 transversales o más: 63. Se enseñan como regla en la Fase 4.

| Paralelas | A lo largo de |
| --- | --- |
| Aguilar, Céspedes, Zabala, Virrey Loreto, Virrey Arredondo, Virrey Olaguer y Feliú, Virrey del Pino, José Hernández, La Pampa, Mcal. Antonio José de Sucre, Echeverría, Juramento, Mendoza, Av. Olazábal, Blanco Encalada, Monroe, Franklin D. Roosevelt, Dr. Pedro I. Rivera, Manuel Ugarte | Amenábar, Av. del Libertador, Av. Cabildo y 32 más |
| Ciudad de la Paz, Amenábar, Moldes, Vidal, Crámer, Conesa, Zapiola, Cap. Gral. Ramón Freire, Conde, Superí | Virrey Olaguer y Feliú, Av. Olazábal, Av. Congreso y 39 más |
| La Pampa, Mcal. Antonio José de Sucre, Echeverría, Juramento, Mendoza, Av. Olazábal, Blanco Encalada, Monroe, Franklin D. Roosevelt, Manuel Ugarte, Av. Congreso | Montañeses, Av. del Libertador, Av. Cabildo y 28 más |
| Ciudad de la Paz, Amenábar, Moldes, Vidal, Crámer, Conesa, Zapiola, Pinto | Paroissien, Av. Olazábal, Av. Congreso y 27 más |
| Quesada, Iberá, Guayra, Campos Salles, Manuela Pedraza, Juana Azurduy, Núñez, Av. Crisólogo Larralde, Jaramillo, Manzanares | 11 de Septiembre de 1888, Av. Cabildo, Conesa y 20 más |
| Paroissien, Vilela, Besares, Av. Ruiz Huidobro, Correa, Ramallo, Arias, Deheza, Pico, Vedia | Zapiola, Av. del Libertador, Av. Dr. Ricardo Balbín y 19 más |
| Tronador, Plaza, Holmberg, Donado, Mariano Acha, Lugones, Miller, Valdenegro, Galván | Nahuel Huapi, Av. Olazábal, Av. Congreso y 20 más |
| Arribeños, 11 de Septiembre de 1888, 3 de Febrero, O'Higgins, Arcos, Cuba, Vuelta de Obligado | La Pampa, Av. Olazábal, Juramento y 25 más |
| José Pascual Tamborini, Manuela Pedraza, Juana Azurduy, Núñez, Av. Crisólogo Larralde, Jaramillo, Manzanares, García del Río | Superí, Av. Cabildo, Conesa y 20 más |
| Machain, Mariano Acha, Lugones, Miller, Valdenegro, Galván, Pacheco, Díaz Colodrero | Iberá, Av. Congreso, Monroe y 16 más |
| Dr. Juan Ángel Golfarini, 3 de Febrero, O'Higgins, Arcos, Cuba, Vuelta de Obligado | Av. Olazábal, Juramento, Mendoza y 21 más |
| 3 de Febrero, Grecia, O'Higgins, Arcos, Cuba, Vuelta de Obligado | Pico, Av. Olazábal, Juramento y 21 más |
| Céspedes, Zabala, Virrey Loreto, Virrey Arredondo, Virrey Olaguer y Feliú, Virrey Avilés, Av. Elcano, Av. de los Incas, Carbajal, Virrey del Pino, La Pampa | Cap. Gral. Ramón Freire, Av. Cabildo, Conesa y 10 más |
| Zapata, Ciudad de la Paz, Amenábar, Crámer, Conesa, Zapiola, Cap. Gral. Ramón Freire, Conde, Gral. Enrique Martínez, Delgado | Jorge Newbery, Av. Federico Lacroze, Olleros y 11 más |
| Quesada, Iberá, José Pascual Tamborini, Manuela Pedraza, Pirán, Núñez, Av. Crisólogo Larralde | Aizpúrua, Miller, Av. Triunvirato y 16 más |
| … y 48 más | |

## Valores fuera de la sección 8

| Campo | Valor | Tramos | Tratamiento |
| --- | --- | --- | --- |
| sentido | PEATONAL | 201 | no se maneja: queda fuera |
| tipo_c | SENDERO | 44 | peatonal: queda fuera |
| tipo_c | AUTOPISTA | 23 | acceso restringido: barrera, fuera del grafo |
| tipo_c | PUENTE | 15 | tramo de su calle |
| tipo_c | ENLACE AUTOPISTA | 13 | acceso restringido: barrera, fuera del grafo |
| tipo_c | SUBIDA AUTOPISTA | 12 | acceso restringido: barrera, fuera del grafo |
| tipo_c | CALLE PEATONAL | 7 | peatonal: queda fuera |
| tipo_c | BAJADA AUTOPISTA | 7 | acceso restringido: barrera, fuera del grafo |
| tipo_c | PASAJE PEATONAL | 6 | peatonal: queda fuera |
| tipo_c | CALLE PASAJE PARTICULAR | 1 | privado: queda fuera |
| tipo_c | TÚNEL | 1 | tramo de su calle |
| tipo_c | PASAJE PARTICULAR | 1 | privado: queda fuera |
| sentido | (vacío) | 1 | sin valor: queda fuera |
| tipo_c | (vacío) | 1 | sin valor: queda fuera |
| red_jerarq | (vacío) | 1 | sin valor: queda fuera |

## Exclusiones

- privado: 8 tramos
- peatonal: 168 tramos
- barrio-31: 388 tramos
- sin-sentido: 1 tramos
- OSM la marca peatonal: Andrés Bello, Juncal, Mariquita Sánchez de Thompson, Enrique Santos Discepolo
- OSM la marca privada: Zanni Pedro Comodoro, Av. Pres. Ramón S. Castillo, Corbeta Uruguay, Pizzurno, Corina Kavanagh
- Barrio 31 (fuera del mapa por decisión del 3/11/2026): 87 calles

## Barreras (acceso restringido)

- Av. Gral. Paz: 116 tramos
- Au. Arturo Illia: 24 tramos
- Au. Pdte. Dr. Raúl Alfonsín (ex Paseo del Bajo): 17 tramos
- Av. Leopoldo Lugones: 12 tramos
- Acceso Norte - Panamericana: 12 tramos
- Colectora Int. Cantilo: 9 tramos
- De ellas, 136 tramos son autopista según OSM aunque el callejero no lo diga.

## Esquinas

- Semáforos en esquinas: 1501
- Restricciones de giro: 365 en el grafo; 737 ignoradas
  - fuera del grafo: 471
  - no se reconocen los tramos: 147
  - el giro no coincide con la geometría: 54
  - la esquina no es un nodo: 20
  - condicional, con excepciones o sin tipo: 18
  - obligatoria sin reconocer las vías de OSM: 18
  - no se puede llegar por ese tramo: 9
- Carriles de giro a la izquierda: 61
- Calzadas separadas en el callejero: 192 pares, y 88 tramos más (calzadas a hasta 150 m o con cuadras que no coinciden) que se preguntan juntos por tener las mismas alturas
- Rotondas: 40 tramos
- Uniones en T partidas: 28 (4 no se partieron por estar a distinto nivel) · esquinas con niveles mezclados: 22

## Hitos

155 elegidos de 580 candidatos dentro del área; 9 sin acceso (no son destino del Navegante).

- plaza: 40
- subte: 33
- tren: 18
- museo: 15
- hospital: 15
- universidad: 12
- shopping: 10
- monumento: 8
- estadio: 3
- aeropuerto: 1

## Vías del tren

- FC San Martín: 25 cruces (viaducto 25)
- FC Urquiza: 0 cruces (ninguno)
- FC Roca: 6 cruces (nivel 6)
- FC Belgrano: 10 cruces (nivel 4, viaducto 4, puente 2)
- FC Mitre: 69 cruces (viaducto 37, nivel 15, tunel 15, puente 2)
- Tramos bajo un viaducto (no son barrera): 61

## Fondo y rumbos

- Polígonos del río: 1 · agua y parques: 500
- Belgrano: hacia el río = 44°
- Coghlan: hacia el río = 43°
- Colegiales: hacia el río = 33°
- Núñez: hacia el río = 53°
- Palermo: hacia el río = 39°
- Recoleta: hacia el río = 44°
- Retiro: hacia el río = 50°
- Saavedra: hacia el río = 51°
- Villa Urquiza: hacia el río = 39°

## Cambios desde la versión anterior

Desde 2026-11-03.e001b1ac: ninguna tarjeta cambió (el archivo de cambios va vacío).

## Pendientes

- Tarjetas A (alturas), T (transversales) y B (cruces de vías): sus IDs se generan cuando exista su modo (fases 2 y 4).
- Origen del nombre (Wikidata): no va por ahora (decisión del 3/11/2026).
