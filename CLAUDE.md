# Sin GPS

PWA offline para aprender las calles, sentidos y alturas del norte de CABA (Retiro, Recoleta, Palermo, Belgrano, Colegiales, Núñez, Saavedra, Villa Urquiza y Coghlan) y manejar sin GPS. La especificación completa está en docs/PLAN.md: leela antes de cada fase.

## Estado

- Fase 0 · Base: cerrada el 3/11/2026 (Tomás la instaló en el iPhone y anduvo en modo avión).
- Fase 1 · Datos, grafo y Explorar: cerrada el 4/11/2026 (Tomás la probó en el iPhone y anduvo todo). Se cerró sin hechos reales: Tomás todavía no conoce las calles, así que nada se comparó con la calle y no hay que pedirle datos de memoria.
- Fase actual: 2 · Aprender. Plan aprobado el 4/11/2026, con tres bloques: A (datos y motor), B (primer uso y Repaso del día, con alto para probar) y C (Practicar, Progreso, Ajustes y respaldo). Pasa con una semana de uso diario sin errores ni pérdida de progreso. Bloques A y B publicados el 4/11/2026: Tomás ya puede jugar.
- Para seguir con la Fase 2:
  1. Revisar con un subagente las pantallas del bloque B (src/features/session, src/features/onboarding, src/features/home/StudyHome.tsx, src/map/QuizMap.tsx): se publicó sin esa revisión porque Tomás quería jugar. Mirar sobre todo el reloj, el doble toque y lo que queda a la vista entre una escena y otra.
  2. Bloque C: Practicar (con 4 paralelas, desde patrones.json), Progreso (mapa de dominio y estadísticas por barrio; la ficha muestra el dominio), Ajustes, racha y meta en el resumen (src/engine/srs/streak.ts ya está hecho y con tests, falta marcar la meta cumplida por día y mostrarla), logro de 100 calles firmes, respaldo con recordatorio semanal (src/storage/backup.ts ya está hecho, falta la pantalla), diagnóstico inicial (`seedKnownCard` ya está) y lección "cambió" (la lista espera en meta `changedDirections`).
  3. Con barrios activos recortados, buildCurriculum sigue enseñando todas las vías y autopistas, y pendingDirections y mainStretch no filtran por barrio: resolverlo junto con Ajustes.
  4. Pasada de pulido y cierre de la fase. El plan aprobado está en docs/PLAN.md y en la sección "La vara" del plan de la sesión, que es esta: fluidez, retomar, errores que enseñan, cierre de sesión, cero fricción y cuidado en los detalles.
- Decisiones de la Fase 1 (3/11/2026): el Barrio 31 queda fuera del mapa; sin Wikidata por ahora (no se muestra el origen del nombre).
- Publicada en https://tomastalamoni.github.io/sin-gps/ (repo tomastalamoni/sin-gps). Cada push a main pasa la CI y se publica solo, salvo los cambios que tocan únicamente documentación.

## Comandos

- npm run dev | build | preview
- npm run typecheck | lint | test | test:e2e
- npm run format (Prettier) | icons (íconos y pantallas de carga desde public/logo.svg) | fonts (glyphs del mapa)
- npm run data:download (fuentes con fecha en pipeline/raw; `-- --refresh` para volver a bajar, `-- --refresh --only=osm-landmarks` para una sola) | data:build (pasos 2 a 13; si falla una validación bloqueante no escribe public/data y deja el reporte en pipeline/raw/reporte-ultimo.md) | data:validate (sobre public/data, como la CI) | data:update | data:load (simula 180 días y escribe public/data/carga.json: correrlo después de data:build si cambian las tarjetas)

## Entorno

- Node 26.13.0 (.nvmrc; ts-fsrs 6 pide 24 o más). TypeScript 6.0.3: typescript-eslint todavía no soporta TS 7.
- En Git Bash (Windows), `BASE_PATH=/sin-gps/` se convierte en una ruta de disco: anteponer `MSYS_NO_PATHCONV=1`.
- La ruta #/mapa/lng,lat,zoom abre el mapa en ese punto. Cinco toques en la versión del inicio abren el diagnóstico.
- En el navegador, Inicio solo muestra cómo instalarla. Los E2E simulan la app instalada con `navigator.standalone`.
- test:e2e compila con la base /sin-gps/ y prueba en Chromium (390×844 y 360×800) y en WebKit. Las capturas para la revisión visual quedan en test-results/capturas.
- Overpass y BA Data rechazan pedidos sin User-Agent; el pipeline se identifica, reintenta y prueba otro servidor (pipeline/config.ts).

## Datos (lo que no está en el plan)

- El formato de public/data está en src/engine/data.ts y se lee con src/engine/load.ts: el pipeline valida lo mismo que lee la app.
- El callejero trae valores que la sección 8 no lista (PEATONAL, SENDERO, AUTOPISTA y ramas, PUENTE, TÚNEL…): su tratamiento está en pipeline/03-clip.ts y en el reporte.
- Los cruces con OSM ignoran Metrobús, veredas y ciclovías; un tramo es peatonal solo si OSM lo marca `pedestrian` o escalera.
- Las restricciones de giro se validan contra la geometría; las obligatorias exigen reconocer las dos vías, y se descartan las que dejan una esquina sin salida.
- Lugones y Cantilo son autopista en OSM: quedan como barrera, fuera del Navegante, hasta la Fase 5 (como dice el plan).
- Un tramo sin alturas toma el sentido de OSM solo si las vías de OSM corren paralelas; si mide menos de 20 m, además tiene que confirmarlo una cuadra vecina de la misma calle.
- Los tramos de sentido se ordenan por la numeración. Un tramo sin alturas que corre al lado de una cuadra va como ella; si no, sigue a su vecino. Si no queda claro (una rama), no se pregunta. `against` lista las cuadras dibujadas al revés de la numeración: sin eso, una corrección las daría vuelta.
- Un tramo de sentido no mezcla cuadras que se pueden preguntar con cuadras dudosas o de la zona de borde: se corta ahí, para que una cuadra dudosa no deje sin preguntar al resto de la calle.
- Dos calzadas con las mismas alturas, sentidos opuestos y lado a lado (hasta 150 m) se preguntan juntas como doble mano, aunque el emparejado de 40 m no las una. Las laterales de mano única al lado de una doble mano, y las cuadras que se contradicen sin correr lado a lado, no se preguntan y van al reporte.
- Pasar a la otra calzada de una avenida en la misma esquina cuenta como vuelta en U (sección 5): la salida corre a menos de 30 m de la cuadra por la que llegaste.
- Los patrones de sentido (public/data/patrones.json, de src/engine/patterns.ts) son grupos de 4 o más paralelas que alternan a lo largo de 2 transversales o más, solo con tramos que se pueden preguntar. Se enseñan en la Fase 4.
- Las correcciones del celu se guardan en Dexie y se aplican sobre los datos al cargar (src/engine/corrections.ts); una versión nueva que ya trae el valor las borra sola. Se exportan para pipeline/overrides.json con el punto y el rumbo de cada cuadra (`tramos`), así no dependen de las alturas ni de las IDs; los nombres y las calles que faltan van como `reportes`.
- Los hechos reales van en tests/fixtures/hechos-reales.json, con el formato de pipeline/lib/facts.ts. La lista empieza vacía: cada error que Tomás reporte desde la calle se suma ahí. Mientras no exista el archivo, la validación queda pendiente; apenas exista, es bloqueante.
- El archivo de cambios se calcula contra los datos del último commit (git HEAD) y compara las tarjetas de sentido por geometría, no por ID. Cada versión nueva lleva su archivo, aunque esté vacío. `inherit` va de la ID nueva a la vieja. meta.json lista todos los archivos (`changes`) y la app los encadena al cargar (src/storage/progress.ts).
- Los ramales de cada línea salen de la geometría, desde la terminal (pipeline/config.ts). Un cruce se ordena por ramal; una tarjeta B: es el tramo entre dos avenidas seguidas, solo si algo cruza o algo llega sin cruzar. Un paso a nivel que OSM no confirma lleva `unconfirmed` y no se pregunta.
- Las autopistas sin calle propia tienen tarjeta de nombre: su ID va en la propiedad `card` de barreras.json.
- Los hitos mayores (nivel 0) se marcan con `major` en pipeline/hitos-override.json. Parque Tres de Febrero y Bosques de Palermo no existen como lugar en OSM.
- FSRS-7 puede devolver una tarjeta en segundos: la app la pasa al día siguiente (una revisión por día). `dueDay` es el día en que vence y todas las fechas del día son locales.

## Reglas

- TypeScript estricto. Sin `any`, salvo con un comentario que lo justifique.
- src/engine es TypeScript puro (sin React ni MapLibre), lo usan la app y el pipeline, y todo lo que hay ahí tiene tests.
- Nunca hardcodear calles, sentidos ni alturas: todo sale de public/data, generado por pipeline/.
- IDs tipadas y estables (N:, S:, A:, T:, B:, H:, Z:). El progreso depende de ellas: todo cambio pasa por el archivo de cambios y una migración.
- Nunca preguntar por un tramo "en duda" o con "orientación inferida".
- Cada pregunta declara su visibilidad (etiquetas, flechas, capa de dominio) y un test la verifica: nunca se ve la respuesta.
- ts-fsrs con versión exacta, envuelto en src/engine/srs. Dominio = "días hasta el 90%" calculado con el scheduler, nunca el campo stability crudo.
- Toda aleatoriedad usa semilla, para poder reproducir errores.
- URLs siempre con import.meta.env.BASE_URL. El precache incluye json, pbf, png, svg y webmanifest (también txt y md, que viven en public/data y public/fonts).
- UI en español rioplatense (voseo), con textos cortos.
- Identificadores en inglés, como los módulos del plan (graph, router, MapView); comentarios y textos de la UI en español.
- Celular primero: probar en 390×844 y 360×800, con zonas de toque de 48 px o más.
- Peso total: hasta 1 GB. Cuanto menos, mejor, pero nunca se recorta algo útil por peso.
- Créditos visibles: © OpenStreetMap contributors (con link a la licencia) y Buenos Aires Data.
- Una tarea está terminada con typecheck, lint y tests en verde y sin errores en la consola.
- Si el plan y los datos reales no coinciden, preguntar antes de decidir.

## Estructura

- pipeline/: descarga, normalización, grafo, cruce con OSM, validación y exportación.
- public/data/: salida del pipeline (en git), con meta.json, reporte.md y archivos de cambios.
- src/engine/: grafo, giros, router, direcciones, preguntas (quiz/), repaso (srs/), Navegante y patrones.
- src/map/, src/features/, src/storage/, src/ui/.
- tests/: unitarios, datos, simulación (sim/) y E2E. tests/fixtures/hechos-reales.json tiene que dar 100%.
