# Sin GPS

PWA offline para aprender las calles, sentidos y alturas del norte de CABA (Retiro, Recoleta, Palermo, Belgrano, Colegiales, Núñez, Saavedra, Villa Urquiza y Coghlan) y manejar sin GPS. La especificación completa está en docs/PLAN.md: leela antes de cada fase.

## Estado

- Fase actual: 0 · Base.

## Comandos

- npm run dev | build | preview
- npm run typecheck | lint | test | test:e2e
- npm run format (Prettier) | icons (íconos y pantallas de carga desde public/logo.svg) | fonts (glyphs del mapa)
- npm run data:download | data:build | data:validate | data:update (desde la Fase 1)

## Entorno

- Node 26.13.0 (.nvmrc; ts-fsrs 6 pide 24 o más). TypeScript 6.0.3: typescript-eslint todavía no soporta TS 7.
- En Git Bash (Windows), `BASE_PATH=/sin-gps/` se convierte en una ruta de disco: anteponer `MSYS_NO_PATHCONV=1`.
- test:e2e compila con la base /sin-gps/ y prueba en Chromium (390×844 y 360×800) y en WebKit. Las capturas para la revisión visual quedan en test-results/capturas.

## Reglas

- TypeScript estricto. Sin `any`, salvo con un comentario que lo justifique.
- src/engine es TypeScript puro (sin React ni MapLibre), lo usan la app y el pipeline, y todo lo que hay ahí tiene tests.
- Nunca hardcodear calles, sentidos ni alturas: todo sale de public/data, generado por pipeline/.
- IDs tipadas y estables (N:, S:, A:, T:, B:, H:, Z:). El progreso depende de ellas: todo cambio pasa por el archivo de cambios y una migración.
- Nunca preguntar por un tramo "en duda" o con "orientación inferida".
- Cada pregunta declara su visibilidad (etiquetas, flechas, capa de dominio) y un test la verifica: nunca se ve la respuesta.
- ts-fsrs con versión exacta, envuelto en src/engine/srs. Dominio = "días hasta el 90%" calculado con el scheduler, nunca el campo stability crudo.
- Toda aleatoriedad usa semilla, para poder reproducir errores.
- URLs siempre con import.meta.env.BASE_URL. El precache incluye json, pbf, png, svg y webmanifest.
- UI en español rioplatense (voseo), con textos cortos.
- Identificadores en inglés, como los módulos del plan (graph, router, MapView); comentarios y textos de la UI en español.
- Celular primero: probar en 390×844 y 360×800, con zonas de toque de 48 px o más.
- Créditos visibles: © OpenStreetMap contributors (con link a la licencia) y Buenos Aires Data.
- Una tarea está terminada con typecheck, lint y tests en verde y sin errores en la consola.
- Si el plan y los datos reales no coinciden, preguntar antes de decidir.

## Estructura

- pipeline/: descarga, normalización, grafo, cruce con OSM, validación y exportación.
- public/data/: salida del pipeline (en git), con meta.json, reporte.md y archivos de cambios.
- src/engine/: grafo, giros, router, direcciones, preguntas, SRS, Navegante y patrones.
- src/map/, src/features/, src/storage/, src/ui/.
- tests/: unitarios, datos, simulación y E2E. tests/fixtures/hechos-reales.json tiene que dar 100%.
