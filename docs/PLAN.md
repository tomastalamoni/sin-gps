# Sin GPS: plan completo del juego de calles (CABA norte)

Versión del 1/11/2026

## 1. Resumen

"Sin GPS" (nombre provisorio) es una app para el celular que te enseña todas las calles, sentidos y alturas del norte de CABA hasta que puedas manejar sin Google Maps. Es una PWA: se instala desde el navegador como una app, funciona sin internet, no tiene cuentas ni servidor y guarda el progreso en el teléfono, con respaldo exportable.

**Alcance.** Retiro, Recoleta, Palermo, Belgrano, Colegiales, Núñez, Saavedra y Villa Urquiza, más Coghlan. Coghlan entra porque queda entre Belgrano, Saavedra y Villa Urquiza: sin él, el mapa tendría un agujero y muchas rutas quedarían cortadas. Los barrios están en un archivo de configuración, así que sumar otros después no obliga a rehacer nada.

**Criterios de éxito.** Al terminar, Tomás puede:

1. Nombrar cualquier calle del área al verla en el mapa, y ubicarla si se la nombran.
2. Decir el sentido de cualquier tramo en menos de 3 segundos.
3. Decir entre qué calles queda una dirección (por ejemplo, "Cabildo 2400").
4. Manejar en el simulador entre dos puntos cualesquiera sin ir contramano, sin mirar el mapa y con una ruta que no supere en más de un 25% a la óptima.
5. Ubicar en el mapa unos 150 hitos (estaciones, plazas, hospitales, estadios).

**Reglas de producto que guían todo el plan:**

- **Primero datos correctos, después funciones.** Aprender un sentido mal es peor que no aprenderlo, así que ningún juego se construye antes de validar los datos.
- **Todo es práctica activa.** Casi ninguna pantalla es solo para mirar: cada interacción es una pregunta con respuesta y feedback.
- **Celular primero.** Todo se usa con una mano, en vertical y sin internet.
- **Nada hardcodeado.** Ningún nombre, sentido ni altura se escribe a mano en el código: todo sale del pipeline de datos.
- **No es un GPS ni reemplaza la señalización.** La app nunca se usa mientras se maneja.

## 2. Cómo se aprende

La app aplica diez principios de aprendizaje y memoria espacial, y cada uno se traduce en una regla concreta de diseño. Si una función no sirve a alguno de estos principios, no entra.

| Principio | Qué significa | Cómo lo aplica la app |
| --- | --- | --- |
| Recuperación activa | Recordar algo lo fija más que releerlo | Casi todo es una pregunta. El único modo "para mirar" es Explorar. |
| Repetición espaciada | Repasar justo antes de olvidar | Cada tarjeta tiene su próxima fecha de repaso calculada con FSRS. El repaso del día trae lo que está por olvidarse. |
| Hito → ruta → mapa | El conocimiento espacial combina puntos de referencia, recorridos y un mapa mental completo, que se refuerzan entre sí (es una guía, no un orden estricto) | Hitos, río, vías y avenidas ancla desde el primer día; recorridos (Navegante, transversales) apenas hay calles aprendidas; el mapa completo se practica siempre y se evalúa con el mapa a ciegas. |
| Andamiaje | Lo nuevo se aprende apoyado en lo conocido | En las preguntas se ven los nombres de las calles que ya vas sabiendo; las nuevas y las que son opciones aparecen sin nombre. |
| Práctica intercalada | Mezclar tipos de pregunta y zonas | Cada sesión alterna modos y barrios. Se evita repetir la misma calle en preguntas seguidas. |
| Feedback inmediato | Corregir al instante y con contexto | Cada error muestra la respuesta en el mapa, con el sentido animado y una referencia ("va hacia Av. Santa Fe"). |
| Contraste de confusiones | Aprender a distinguir lo que se parece | La app registra qué calles confundís entre sí y arma ejercicios de comparación lado a lado. |
| Automatización | Para manejar hay que responder sin pensar | Se mide el tiempo de respuesta. Un acierto lento cuenta como "difícil" y vuelve antes. |
| Transferencia | Practicar en condiciones parecidas a las reales | Navegante con el frente hacia arriba, vista parabrisas, desvíos, tiempo límite y ensayo de viajes reales. |
| Reglas y patrones | Una regla vale por muchos datos sueltos | La app detecta patrones en los datos (paralelas que alternan sentido, dónde arranca la numeración) y los enseña como reglas. |

## 3. Currículo y repetición espaciada

El orden de estudio sigue la jerarquía vial oficial de la Ciudad (campo `red_jerarq` del callejero): primero lo que estructura el mapa, después el relleno, empezando por el barrio base. Una tarjeta solo se crea si su modo ya está construido.

### Niveles

| Nivel | Qué entra | De dónde sale |
| --- | --- | --- |
| 0 · Orientación | Barrios, río, vías del tren y sus cruces, autopistas como barreras, unos 15 hitos mayores y los rumbos porteños | OSM y callejero |
| 1 · Troncales | Vías troncales que se manejan en el Navegante | `red_jerarq` = VÍA TRONCAL, sin las de acceso restringido |
| 2 · Avenidas principales | Distribuidoras principales | VÍA DISTRIBUIDORA PRINCIPAL |
| 3 · Complementarias | Distribuidoras complementarias y avenidas de jerarquía local | VÍA DISTRIBUIDORA COMPLEMENTARIA, o tipo AVENIDA con VÍA LOCAL |
| 4 · Calles del barrio | Calles locales | VÍA LOCAL, tipo CALLE |
| 5 · Pasajes | Pasajes públicos | Tipo PASAJE; los tramos con sentido PJE. PRIVADO quedan afuera |

Una calle toma el nivel de su tramo de mayor jerarquía.

**Orden de entrada:**

1. Nivel 0 y niveles 1 y 2 de los nueve barrios: es el esqueleto que cruza todo el norte.
2. Niveles 3 a 5 barrio por barrio: el barrio base primero y después sus vecinos.
3. Dentro de cada nivel, por importancia (cuánto se usa la calle en miles de rutas simuladas) y por cercanía: las lecciones de un mismo día salen de la misma zona.
4. Tomás puede fijar un foco ("esta semana, solo Palermo") sin romper el orden del resto.

**Diagnóstico inicial.** Son 3 minutos con unas 25 preguntas sobre avenidas de los niveles 1 y 2. Una calle cuenta como sabida solo si acierta nombre y sentido, y rápido. Esas tarjetas arrancan con unos 7 días hasta el 90%, nunca como Firmes.

**Lección de calle nueva** (una calle por lección):

1. Ficha: nombre, tramo resaltado, sentido animado, avenidas que cruza, barrios, nombre anterior y, si OSM lo tiene, el origen del nombre.
2. Dos preguntas inmediatas: ubicarla y decir su sentido. La primera respuesta de cada tarjeta es su primera revisión FSRS.
3. La calle vuelve unos ítems después en la misma sesión, como práctica sin calificar.

### Tarjetas

| Tarjeta (ID) | Qué pregunta | Se crea cuando |
| --- | --- | --- |
| Nombre (`N:código`) | Alterna "¿Cómo se llama esta calle?" y "Encontrala en el mapa" | En la lección de la calle |
| Sentido (`S:código:alturas`), una por tramo de sentido homogéneo | ¿Hacia dónde va? | En la lección, solo si el tramo es confiable (sección 8) |
| Barrio (`Z:barrio`) | ¿Qué barrio es esta zona? | Nivel 0 |
| Hito (`H:slug`) | Alterna "¿Dónde queda?" y "¿Qué es esto?" | Nivel 0 y después por barrio |
| Cruce de barrera (`B:barrera:tramo`) | ¿Por dónde se cruzan estas vías entre tal y tal avenida? | Nivel 0 |
| Transversales (`T:código:dirección:primer cruce`), ventanas de 6 cruces | ¿En qué orden la cruzan? | Niveles 1 a 3, cuando la tarjeta Nombre tiene 7 días o más hasta el 90% |
| Alturas (`A:código:mil`), una por cada mil de la calle | ¿Con qué calle cruza el 2000? | Niveles 1 a 3, con la misma condición; las calles locales, solo si se activa en Ajustes |

Esquinas, ¿Por dónde doblo?, Mapa a ciegas y Navegante son ejercicios de aplicación, no tarjetas. Sus aciertos no se califican, porque en una esquina se puede acertar de casualidad. Un error sobre un dato que no estaba a la vista deja vencida hoy la tarjeta afectada, sin calificarla.

### Repetición espaciada (FSRS)

- **Librería:** ts-fsrs, envuelta en `engine/srs`. Se fija la versión exacta, se le indica la versión del algoritmo de forma explícita y sus parámetros se guardan en la base local.
- **Retención deseada:** 90%, ajustable entre 85% y 95%.
- **Qué genera revisiones:** lecciones, Repaso y Practicar, con un máximo de una por tarjeta por día: cuenta la primera respuesta y las repeticiones de ese día son práctica. No se usan los pasos de aprendizaje internos de FSRS.
- **Métrica de dominio:** "días hasta el 90%", calculada con el propio scheduler (el intervalo que da para 90% de retención). No se usa el campo `stability` crudo, que en FSRS-7 no significa eso.
- **Estados:** Aprendiendo (hasta acertar en dos días distintos) · Débil (menos de 3 días hasta el 90%) · En progreso (de 3 a 21 días) · Firme (21 días o más, con al menos un acierto después de un intervalo de 14 días o más).
- **Calle Firme:** su tarjeta Nombre está Firme y también al menos dos tercios de sus tarjetas de Sentido en ese barrio.

La nota se pone sola, según acierto y tiempo:

| Resultado | Nota FSRS |
| --- | --- |
| Incorrecto | Again |
| Correcto pero lento, o con ayuda (pista o mirar el mapa) | Hard |
| Correcto en tiempo normal | Good |
| Correcto y rápido en esta revisión y en la anterior (nunca en tarjetas de Sentido) | Easy |

Los umbrales son configurables por modo. Valores iniciales: al elegir una opción, rápido es menos de 2,5 s y lento más de 8 s; al tocar el mapa, rápido es menos de 4 s y lento más de 12 s. El reloj arranca cuando el mapa terminó de dibujarse y las opciones están a la vista, y se pausa si la app pasa a segundo plano.

### Sesiones y carga diaria

- **Corta** (3 a 5 minutos, unos 20 ítems): vencidas ordenadas por riesgo de olvido, una lección nueva y, si el modo ya existe, un cierre con una esquina o un viaje corto.
- **Larga** (sin límite): todo lo vencido, las lecciones del día, 2 o 3 viajes y un bloque de transversales o alturas.
- **Calles nuevas por día:** 4 por defecto (opciones: 2, 4, 6 u 8). Al lado de la opción se muestran los minutos diarios estimados, calculados con una simulación (sección 10). Las tarjetas de transversales y alturas consumen el mismo presupuesto de tarjetas nuevas.
- **Tope de repasos:** 150 por día. Hay atraso cuando las vencidas superan el tope: ese día no entran calles nuevas y se repasa primero lo más en riesgo.
- **Meta diaria:** terminar las vencidas del día.
- **Intercalado:** se evita repetir la misma calle en ítems seguidos y se alternan modos, siempre que el grupo de preguntas lo permita.
- **Proyección:** con los datos reales, la app calcula cuántos días faltan para terminar cada barrio a ese ritmo.

## 4. Modos de juego

Hay once modos además del Navegante. Todos comparten las mismas reglas de pantalla y de corrección, así que la mecánica se aprende una sola vez. Los ejemplos con nombres de calles son ilustrativos: las respuestas reales salen siempre de los datos.

### Reglas comunes a todas las preguntas

- **Visibilidad:** cada generador de preguntas declara qué se ve, y un test lo verifica:
  - Etiquetas visibles: calles cuya tarjeta Nombre está En progreso o mejor, y anclas ya presentadas (niveles 0 a 2).
  - Etiquetas ocultas: todas las calles que son opciones, y cualquier etiqueta de calle o hito que contenga el nombre o un alias de una opción.
  - Flechas ocultas en los tramos involucrados en preguntas de sentido (Sentidos, Esquinas, ¿Por dónde doblo? y mapa a ciegas de sentidos).
  - Capa de dominio apagada durante las preguntas, para que el color no delate la calle nueva.
  - "Sin ayudas" oculta todas las etiquetas.
- **Encuadre:** lo preguntado queda centrado, con al menos 3 cuadras de contexto.
- **Datos dudosos:** nunca se pregunta por un tramo "en duda" o de "orientación inferida" (sección 8).
- **Distractores:** salen de calles cercanas, paralelas o de nombre parecido. Cuanto más firme está la tarjeta, más parecidos son. Si hay una confusión registrada con esa calle, entra siempre.
- **Opciones:** las preguntas de nombre tienen 4, sin repetidas y con la correcta siempre presente (lo verifica un test). Las de sentido tienen 3: una flecha, la otra o doble mano.
- **Tocar el mapa:** cuenta la calle más cercana al toque, dentro de 14 px. Si la segunda más cercana queda a menos de 4 px de distancia de la primera, la app pide tocar de nuevo y no califica. Solo se aceptan respuestas con un zoom en el que las paralelas quedan a 40 px o más.
- **Feedback:** color, ícono y texto, nunca solo color. En un error, la respuesta correcta se anima en el mapa con una línea de explicación. El botón "Seguir" va grande y abajo.
- **Semilla:** todo lo aleatorio usa una semilla registrada, para poder reproducir cualquier error.

### 4.1 Repaso del día

Mezcla automática de tarjetas vencidas, una lección nueva y un ejercicio de aplicación (sección 3). Es el botón principal de Inicio.

### 4.2 ¿Cómo se llama?

- Se resalta una calle: completa o, si es larga, una ventana de 5 cuadras. A medida que la tarjeta se afirma, hay más ventanas locales, porque manejando solo se ve un pedazo.
- Elegís entre 4 nombres.
- Si errás, se registra la confusión entre la calle real y la elegida.

### 4.3 Encontrala

- Te dan el nombre y el mapa muestra el barrio donde está (si cruza varios, uno al azar).
- Tocás la calle; podés hacer zoom y moverte.
- Si errás, la app te dice qué calle tocaste y anima la correcta.

### 4.4 Sentidos

- Se resalta un tramo de sentido homogéneo, o una ventana de 3 a 5 cuadras dentro de él.
- Respondés tocando una de las dos flechas dibujadas sobre la calle, o "Doble mano".
- Cada flecha lleva dos referencias: la próxima avenida en esa dirección, contada desde el final de la ventana mostrada, y el rumbo porteño ("hacia Av. Cabildo · hacia el río").
- Variante "4 paralelas": marcás el sentido de cuatro calles vecinas a la vez y cada tarjeta se califica con su propia respuesta. Reduce el acierto por azar y enseña los patrones de alternancia.
- Si la calle cambia de sentido, la ficha lo marca ("cambia en tal avenida").
- Las avenidas con calzadas separadas se preguntan como "doble mano (calzadas separadas)".

### 4.5 Esquinas

- "Estás en tal esquina y venís por tal calle. ¿Para dónde podés seguir?" Marcás todas las opciones válidas: izquierda, seguir o derecha.
- Es correcto solo si marcás exactamente las opciones válidas. El feedback muestra cada opción con su motivo.
- Usa las reglas del Navegante (sección 5) y nunca arma una pregunta que dependa de un giro "condicional".

### 4.6 ¿Por dónde doblo?

- "Vas por Av. Santa Fe hacia Palermo y querés ir hacia el río. ¿Cuál es la primera calle donde podés doblar?"
- Las 4 opciones son las próximas calles que cruzan, en orden. La pregunta solo se genera si la respuesta está entre esas cuatro.
- Es la pregunta más práctica para manejar, porque entrena a anticipar.

### 4.7 Transversales

- Sobre avenidas y calles principales: "Yendo por esta avenida hacia General Paz, después de tal calle viene…". En nivel avanzado, ordenás 6 cruces.
- Vista "tira" para estudiar: la avenida como una línea vertical con sus cruces en orden, cada uno con una marca de si se puede doblar a la izquierda o a la derecha.

### 4.8 Alturas

- **Regla de cuadras:** cada cuadra suma unos 100 números. En las filas revisadas del callejero, los pares figuran en el lado izquierdo del tramo y los impares en el derecho. El pipeline confirma con todos los datos que eso equivale a "mirando hacia donde crece la numeración, pares a la izquierda" antes de enseñarlo como regla.
- **Dónde arranca la numeración:** no hay una regla única. Una ordenanza de 1904 dividió la ciudad en polígonos con numeración propia, y varias calles cambian de nombre y reinician la numeración en Rivadavia, Dorrego o Warnes, entre otras ([C5N](https://www.c5n.com/sociedad/convertir-piedras-esmeraldalos-secretos-las-calles-que-cambian-nombre-buenos-aires-n233062)). Por eso el origen de cada calle se calcula con el callejero completo, antes de recortar los barrios. Si arranca fuera del área, la app lo dice ("arranca en tal calle, fuera del área").
- **Preguntas:** "¿Qué calle cruza Cabildo a la altura del 2000?" (una tarjeta por cada mil de la calle); "¿Entre qué calles queda Cabildo 2400?" (elegís el par o tocás la cuadra); "¿Dónde arranca la numeración de esta calle?". "¿Qué altura tiene en la esquina con tal calle?" se pregunta solo donde las cuadras cortan en una centena redonda.
- Con estos datos funciona el buscador por dirección (secciones 5 y 6), que contempla números faltantes y esquinas formadas por varios nodos.

### 4.9 Hitos y barrios

- **¿Dónde queda?** Tocás el mapa. Es acierto a menos de 150 m o dentro del polígono del parque.
- **¿Qué es esto?** Se resalta un ícono y elegís el nombre.
- **¿Entre qué calles está?** Solo para hitos con una esquina cercana clara.
- **¿Qué barrio es esta zona?** Se practica en el mismo modo.
- Un hito es destino del Navegante solo si tiene "acceso": de 1 a 3 cuadras manejables a menos de 150 m (sección 8).

### 4.10 Cruces de vías

- Las vías del tren son barreras en parte del norte, pero ya no en todas: el Viaducto Mitre (ramal Tigre, 3,9 km elevados entre Av. Dorrego y Av. Congreso) eliminó 8 barreras y abrió 4 cruces nuevos ([GCBA](https://www.buenosaires.gob.ar/desarrollourbano/desarrollo/viaducto-mitre)). Por eso los cruces se calculan con OSM (puente, túnel o paso a nivel), los tramos bajo un viaducto no cuentan como barrera y el campo `tipo_ffcc` del callejero queda como fuente secundaria.
- Preguntas: "¿Por dónde se cruzan las vías entre tal y tal avenida?", "¿Esta calle cruza las vías?", "¿Cuál es el próximo cruce yendo hacia Retiro?".
- Las autopistas se enseñan como barreras en el nivel 0. Sus accesos llegan en la fase 5.

### 4.11 Mapa a ciegas

- Una zona de unas 4 × 4 cuadras sin nombres: tocás cada calle y elegís su nombre de una lista con las calles de esa zona.
- Variante de sentidos: tocás cada calle para marcar su sentido (una flecha, la otra o doble mano) y al final se corrige todo junto.
- Sirve como práctica y como parte del examen de cada carnet (sección 6).

## 5. Modo Navegante

El Navegante simula manejar un viaje esquina por esquina. En cada cruce elegís qué hacer, la app valida la maniobra con las reglas reales y al final compara tu recorrido con la mejor ruta posible.

### Cómo es un viaje

1. Elegís largo, nivel y tipo de destino, o tocás "Viaje rápido" y la app elige.
2. Aparecés en una calle, ya circulando en su sentido legal, con un destino: una dirección ("Cabildo 2400"), una esquina ("Santa Fe y Scalabrini Ortiz") o un hito ("Planetario").
3. El auto avanza solo hasta la próxima esquina donde haya algo que decidir.
4. Elegís una opción. Si es ilegal, se descuentan puntos, se muestra el sentido o la regla, esa opción queda tachada y elegís de nuevo: el viaje nunca se corta.
5. Llegás al entrar en la cuadra de la dirección, al pisar la esquina de destino o al entrar en una cuadra de acceso del hito.
6. Ves el resumen y la repetición del viaje.

*(Diagrama del documento original: una esquina del Navegante · 2 decisiones.)*

Una maniobra ilegal nunca se ejecuta: resta puntos, muestra la regla y te devuelve el turno. Recién al llegar se compara el recorrido con la ruta óptima.

### Qué cuenta como esquina

- Hay decisión en cada nodo con 2 o más salidas físicas, aunque una sola sea legal: saber que no podés doblar también es parte del aprendizaje.
- En curvas o nodos con una sola salida, el auto sigue solo.
- Las rotondas y plazas de giro obligado se resuelven en una sola decisión, con salidas numeradas ("1.ª salida", "2.ª salida").
- Vuelta en U es volver a entrar en la misma calle en sentido contrario, aunque sea cruzando un bulevar. No se ofrece, salvo en calles sin salida, en el borde del área y en esquinas sin ninguna salida legal.
- Si una esquina no tiene ninguna salida legal (casi siempre, un error de datos), aparece "Dar la vuelta" sin penalización y se genera un reporte automático.
- Si ya llevás el doble de decisiones que la ruta óptima, aparece "Rendirse y ver la ruta".

### Botones de decisión

- La dirección de cada salida se mide en sus primeros 20 m.
- "Seguir" es la continuación de la misma calle si se desvía menos de 45°; si no hay continuación, la salida que se desvía menos de 30°. El resto es izquierda o derecha, con "leve" por debajo de 60° y "cerrada" por encima de 120°.
- Cada flecha se dibuja respecto del frente del auto, en cualquier orientación del mapa.
- Botones de al menos 64 px de alto, abajo, para usar con el pulgar.

### Reglas que valida

Cada maniobra es legal, ilegal o condicional.

| Situación | Cómo se detecta | Qué pasa | Puntos |
| --- | --- | --- | --- |
| Contramano | Sentido del tramo | No avanza, se anima el sentido, la opción queda tachada y elegís de nuevo | −20 |
| Giro prohibido por cartel | Restricciones de giro de OSM | Igual que contramano | −15 |
| Izquierda desde doble mano en una esquina con semáforo | Semáforo de OSM a menos de 25 m de la esquina, sin contar los peatonales | Igual, con la regla explicada | −10 |
| Izquierda condicional | La avenida tiene calzadas separadas, u OSM marca un carril de giro a la izquierda | Avanza, con el aviso "solo con flecha o con bulevar de 8 m o más" | 0 |
| Tramo en duda | Estado de confianza del tramo (sección 8) | Avanza en cualquier sentido, con el aviso "dato a verificar" | 0 |
| Mirar el mapa completo | Botón | 3 s de mapa con nombres y sentidos | −5 |
| Se acaba el tiempo (nivel 4) | Reloj | Si "Seguir" es legal, seguís derecho; si no, el reloj vuelve a empezar | −3 |

La regla de la izquierda sale del Código de Tránsito y Transporte de la Ciudad: en arterias de doble sentido, en intersecciones semaforizadas sin señal luminosa de giro, está prohibido girar a la izquierda (texto incorporado por la [Ley 5760](https://boletinoficial.buenosaires.gob.ar/normativaba/norma/346793)). La [Disposición 1826/2008](https://boletinoficial.buenosaires.gob.ar/normativaba/norma/118961) lo permitió sin flecha en arterias con bulevar o separador de al menos 8 m, por eso esos giros quedan como condicionales. Como no hay datos de qué semáforos tienen flecha, la ruta óptima evita los giros condicionales y Esquinas no pregunta por ellos. En la calle manda siempre la señalización.

### Niveles

| Nivel | Qué ves | Ayudas |
| --- | --- | --- |
| 1 · Mapa completo | Mapa con nombres y flechas de sentido | Brújula al destino |
| 2 · Mapa sin nombres | Mapa con flechas; solo se leen tu calle y la que cruzás | Brújula opcional |
| 3 · Parabrisas | Sin mapa: el cartel de la esquina, la forma del cruce y la altura aproximada ("Cabildo al 2100") | Mirar el mapa (−5) |
| 4 · Parabrisas con reloj | Igual que el 3, con 6 s por esquina | Mirar el mapa (−5) |

### Cámara

- Frente hacia arriba por defecto: el mapa gira para que siempre avances hacia arriba. Un botón cambia a norte arriba y la elección queda guardada.
- El auto queda fijo en el tercio inferior, para ver más hacia adelante que hacia atrás.
- Inclinación 3D opcional en los niveles 1 y 2.
- La animación dura unos 600 ms por cuadra; tocar la pantalla la saltea. Respeta la opción "reducir movimiento" del celular.

### Viajes

| Largo | Esquinas de decisión | Distancia aproximada |
| --- | --- | --- |
| Corto | 5 a 8 | 0,5 a 1 km |
| Medio | 10 a 15 | 1 a 2 km |
| Largo | 20 o más | 2,5 km o más, cruzando barrios |

- **Dónde empiezan y terminan:** dentro de los barrios activos y de la componente principal del grafo (sección 8). La zona de borde se puede manejar, pero nunca es origen ni destino; si salís del área, aparece "Volver".
- **Adaptativos:** al menos el 80% de la ruta óptima pasa por calles ya estudiadas. Si después de 200 intentos no aparece un viaje así, la condición baja al 50% y la app lo avisa. El "modo desafío" la quita.
- **Destinos según lo que sabés:** una dirección solo si ya estudiaste las alturas de esa calle; si no, una esquina o un hito con acceso.
- **Generación:** origen al azar, con más peso en calles conocidas, y destino a la distancia de red buscada. Se descartan los viajes cuya ruta óptima tenga menos de dos giros.

### Ruta óptima y eficiencia

- A\* sobre estados "llegando por tal cuadra" (no sobre esquinas), para respetar restricciones y penalizaciones de giro. La heurística es la distancia en línea recta × 0,85, para que nunca sobreestime.
- Costo = distancia × factor por tipo de vía (avenidas 0,85; calles 1; pasajes 1,2) + penalización por giro (izquierda +40 m, derecha +15 m). Los giros condicionales se evitan y los tramos en duda cuestan ×5. Son valores iniciales y se pueden ajustar.
- Eficiencia = costo de la ruta óptima / costo de tu recorrido, con la misma fórmula y un máximo de 100%.

### Desvíos

- Desde el nivel 2, en 3 de cada 10 viajes se corta una cuadra de la ruta óptima, al menos 3 esquinas adelante y solo si el destino sigue siendo alcanzable.
- El corte se ve recién cuando estás a una esquina, como en la realidad.
- Para medir la eficiencia, la referencia pasa a ser la ruta óptima hasta la esquina donde viste el corte más la mejor ruta desde ahí con el corte.

### Puntaje y estrellas

- ★★★: sin errores, sin mirar el mapa y con eficiencia de 90% o más.
- ★★: hasta un error, hasta una mirada al mapa y eficiencia de 80% o más.
- ★: llegaste.
- Puntos = 100 × eficiencia × multiplicador de nivel (1; 1,5; 2; 2,5) − penalizaciones, con mínimo 0.
- Los viajes cuentan para la meta del día y para los carnets, pero sus aciertos no califican tarjetas. Un error en nivel 3 o 4, sin haber mirado el mapa en las dos esquinas anteriores, deja vencida hoy la tarjeta de ese sentido.

### Al terminar

- Repetición del viaje: tu recorrido y la ruta óptima animados sobre el mapa completo, con los errores marcados.
- Lista de errores con el botón "Practicar estas calles". Si fallaste en una calle que todavía no estudiaste, pasa al frente de la cola de lecciones.
- Opciones: repetir este viaje, otro viaje parecido o volver.

### Ensayo de viaje real

- Buscás origen y destino reales (dirección, esquina o hito) con el buscador, que funciona sin internet. Si un punto queda fuera del área, se lleva a la entrada más cercana y la app lo avisa.
- Lo jugás en el nivel que quieras. Después podés ver la ruta óptima explicada en pasos de texto ("Salí por tal calle hacia el río, doblá a la derecha en tal avenida…").
- El objetivo es sacar ★★★ en nivel 3 antes de hacer el viaje de verdad.
- Los viajes frecuentes (casa → trabajo, por ejemplo) se pueden guardar.

### Copiloto y viaje libre (fase 5)

- **Copiloto:** sin destino ni mapa, la app te da indicaciones como alguien sentado al lado ("doblá en la segunda a la derecha", "agarrá tal calle hacia el centro") y tenés que ejecutarlas. Entrena a ubicar calles por nombre desde donde estás. Opcionalmente, con voz.
- **Viaje libre:** manejás sin destino y solo se valida que no rompas ninguna regla.

## 6. Explorar, progreso y motivación

Tres piezas sostienen la motivación sin distraer: un mapa para estudiar libremente, un mapa de dominio que muestra el avance calle por calle y carnets por barrio que certifican que sabés manejar ahí.

### Explorar

- Mapa completo con nombres, flechas, hitos, vías y límites de barrio. Cada capa se puede prender y apagar.
- Buscador sin internet de calles, direcciones ("Cabildo 2400"), esquinas ("Santa Fe y Scalabrini Ortiz") e hitos. Tolera tildes y abreviaturas ("gral paz").
- Tocar una calle abre su ficha: nombre, nombre anterior, tipo y jerarquía, sentido de cada tramo y qué tan confiable es el dato, alturas y dónde arranca la numeración, barrios, transversales en orden, estado de dominio y, si OSM lo tiene (etiqueta `name:etymology:wikidata`), el origen del nombre. Si no hay dato, no se muestra nada.
- La ficha tiene tres botones: Estudiar ahora (adelanta la calle en la cola), Ver en Street View (abre Google Maps en ese punto) y Reportar un error.

### Mapa de dominio

- Cada calle se pinta según su estado (sección 3), por habilidad: nombre, sentido o alturas. Los tramos en duda tienen una trama propia.
- La paleta es apta para daltonismo (no depende de rojo contra verde) y la leyenda está siempre visible.
- Se apaga durante las preguntas.

### Estadísticas

- Por barrio: calles vistas y firmes sobre el total, y días estimados para terminarlo.
- Precisión de los últimos 7 días por modo, y tiempo medio de respuesta con su tendencia. El objetivo es bajar de 3 s.
- Minutos por día y racha.
- Navegante: viajes, estrellas, eficiencia media y errores por tipo.

### Errores y confusiones

- "Mis errores" reúne las calles y esquinas donde más fallás, con un botón para practicarlas.
- Cuando un mismo par de calles se confunde dos veces, aparece un ejercicio de contraste: las dos calles lado a lado y lo que las distingue (barrio, sentido, cruces).

### Carnets por barrio

Un carnet certifica memoria de largo plazo y manejo en ese barrio.

| Requisito | Umbral |
| --- | --- |
| Calles Firmes (sección 3) | 80% o más de las calles del barrio |
| Tiempo | Al menos 21 días desde la primera lección del barrio |
| Examen: mapa a ciegas, nombres y sentidos | 90% o más en 3 zonas del barrio |
| Examen: Navegante | 5 viajes de nivel 3 dentro del barrio con ★★ o más, sin contramanos y sin mirar el mapa |
| Examen: alturas | 10 preguntas del barrio con 80% o más de aciertos |

- El examen de barrio es una sesión guiada con esas tres pruebas, que se puede completar en partes dentro de 7 días.
- Con los nueve carnets se obtiene el Carnet Norte.
- Un carnet se vence si el barrio pasa 14 días seguidos por debajo del 70% de calles Firmes. Se recupera repasando, sin volver a rendir el examen.
- Los umbrales se calibran con la simulación de la sección 10 antes de la fase 5.

### Rachas y metas

- Meta diaria: terminar las vencidas del día.
- La racha tiene un comodín por semana, y perderla no borra nada.
- Logros sobrios: primer viaje ★★★, 100 calles firmes, primer carnet.
- Recordatorios: en iPhone, una PWA sin servidor no puede programarlos, y en Android solo de forma no garantizada. Por eso un botón genera un evento diario para el calendario del celu (archivo .ics).

### Reportes de datos

- Desde cualquier calle o tramo se puede reportar: el sentido está mal, el nombre está mal, falta una calle u otra cosa, con una nota opcional.
- El reporte corrige el dato en el celu al instante (estado "corregido por vos", sección 8): la tarjeta afectada se reinicia y se corre un chequeo local de trampas.
- La lista "Para verificar" muestra los tramos en duda o sin par, ordenados por importancia, con Street View a un toque y respuesta rápida ("Lo vi: va hacia tal lado").
- Los reportes se exportan en un archivo que se le pasa a Claude Code, que los incorpora a `pipeline/overrides.json`. Cuando una versión nueva de los datos ya trae el mismo valor, la corrección local se borra sola.
- Opcionalmente se puede corregir OpenStreetMap, para que el arreglo le sirva a todos.

## 7. Pantallas y experiencia en el celular

La app tiene cinco pantallas principales, todas pensadas para usar con una mano, en vertical y sin internet.

### Navegación

| Pestaña | Qué tiene |
| --- | --- |
| Inicio | Botón grande "Repaso del día" (tarjetas y minutos estimados), "Viaje rápido", meta del día, racha, avisos (datos a verificar, carnet por vencer) y acceso a Ajustes |
| Practicar | Elegir modo, zona (un barrio, varios o todos) y cantidad de preguntas |
| Navegante | Configurar viaje (largo, nivel, tipo de destino, desvíos), viaje rápido, ensayo de viaje real y viajes guardados |
| Mapa | Explorar (sección 6) |
| Progreso | Mapa de dominio, estadísticas, errores, confusiones y carnets |

### Primer uso

1. Instalación: si la app se abre en el navegador, solo muestra cómo instalarla. En iPhone, la app instalada guarda sus datos aparte de Safari, así que el primer uso empieza siempre desde el ícono.
2. Bienvenida: qué es y cómo funciona, en tres pantallas cortas.
3. Seguridad: "No uses la app mientras manejás. Respetá siempre la señalización real". Hay que aceptarlo.
4. Barrio base (donde vivís o más te movés) y barrios activos (por defecto, los nueve).
5. Calles nuevas por día: 2, 4, 6 u 8, con los minutos diarios estimados al lado.
6. Diagnóstico de 3 minutos, que se puede saltear.
7. Primera lección.

### Ajustes

Barrios activos y barrio base · calles nuevas por día · retención deseada · orientación por defecto del Navegante · sonido y vibración · tema claro u oscuro · tamaño de texto · reducir movimiento · exportar e importar progreso · datos (versión, fecha de cada fuente, licencias) · borrar progreso, con doble confirmación.

### Diseño para una mano

- Controles en la mitad inferior; nada importante arriba de todo.
- Zonas de toque de 48 px o más (64 px en el Navegante).
- Sin gestos escondidos: todo tiene un botón visible.
- La pantalla no se apaga durante una sesión (Wake Lock, donde el navegador lo permita).
- Acierto y error se muestran con color, ícono y texto. La vibración y el sonido son extras opcionales: se usan solo donde el navegador los soporta y el feedback nunca depende de ellos.

### Sin internet

- Al instalarla queda guardado todo: app, datos, fuentes del mapa e íconos. El aviso "Lista para usar sin internet" aparece recién cuando la app verificó que todo está guardado.
- Cuando hay una versión nueva aparece un aviso para actualizar. Nunca se actualiza en medio de una sesión.
- El progreso se guarda en el celu después de cada respuesta.

### Accesibilidad

- Contraste AA, modo oscuro y texto escalable.
- Botones con nombre para lectores de pantalla.
- Animaciones que respetan "reducir movimiento".

### Seguridad

- Aviso al primer uso y al entrar al Navegante.
- **Modo paseo (fase 5):** usa el GPS para preguntarte por la calle donde estás mientras caminás ("¿cómo se llama esta calle?, ¿hacia dónde va?"). Si la velocidad pasa de 20 km/h durante 10 segundos, se pausa con un aviso, sin excepciones, y vuelve cuando la velocidad baja. La ubicación se usa solo en el celu y no se guarda.

### Rendimiento

| Métrica | Objetivo |
| --- | --- |
| Primera carga con 4G | Menos de 3 s |
| Abrir la app ya instalada | Menos de 1,5 s |
| Respuesta a un toque | Menos de 100 ms |
| Calcular una ruta | Menos de 50 ms |
| Generar una pregunta | Menos de 30 ms |
| Mapa | Fluido en un celular de gama media |
| Peso total con datos | Hasta 1 GB. Cuanto menos, mejor, pero nunca se recorta algo útil por peso (decidido el 4/11/2026) |

## 8. Datos

La fuente principal es el callejero oficial de la Ciudad (BA Data), que trae cuadra por cuadra el nombre, el sentido, las alturas, el barrio y la jerarquía vial. OpenStreetMap (OSM) se usa para verificar los sentidos y para todo lo que el callejero no tiene: semáforos, restricciones de giro, hitos, río, vías y parques.

### Fuentes

| Fuente | Qué aporta | Formato | Licencia | Actualización |
| --- | --- | --- | --- | --- |
| [BA Data · Calles](https://data.buenosaires.gob.ar/dataset/calles) ([CSV](https://cdn.buenosaires.gob.ar/datosabiertos/datasets/jefatura-de-gabinete-de-ministros/calles/callejero.csv)) | Por tramo: código de calle, nombre oficial y anterior, alturas inicial y final de cada lado, tipo, sentido, observaciones (con la resolución que fijó el sentido), jerarquía vial, cruce con el ferrocarril, comuna y barrio de cada vereda | CSV, GeoJSON, XLSX y SHP; geometría WKT `LINESTRING` en lon/lat | CC-BY-2.5-AR según la página del dataset (confirmar al descargar) | Semestral; el recurso GeoJSON cambió por última vez el 1/9/2026 |
| OSM vía [Overpass API](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) | Sentidos para verificar (`oneway`), semáforos, restricciones de giro, hitos, costa del río, vías y parques | JSON | [ODbL](https://www.openstreetmap.org/copyright/attribution-guide/): crédito visible a OpenStreetMap y aviso de la licencia | Continua |
| Límites de barrios (BA Data u OSM) | Dibujar los límites en el mapa | GeoJSON | La de la fuente elegida | Casi nunca cambian |

- **Valores reales de los campos clave**, revisados en el CSV: `sentido` = CRECIENTE, DECRECIENTE, DOBLE o PJE. PRIVADO; `tipo_c` = CALLE, AVENIDA o PASAJE; `red_jerarq` = VÍA TRONCAL, VÍA DISTRIBUIDORA PRINCIPAL, VÍA DISTRIBUIDORA COMPLEMENTARIA o VÍA LOCAL. Cualquier otro valor que aparezca va al reporte.
- **El filtro por barrio no necesita polígonos:** cada tramo trae `barrio`, `barrio_par` y `barrio_imp`.
- **Overpass** pide no pasar de unas 10.000 consultas y 1 GB por día. El pipeline hace pocas consultas y guarda las respuestas en `pipeline/raw/`.
- **Red:** el pipeline necesita acceso a `cdn.buenosaires.gob.ar`, `data.buenosaires.gob.ar` y `overpass-api.de`. Si Claude Code corre con la red restringida, Tomás descarga los archivos desde el navegador y los deja en `pipeline/raw/`.

### Pipeline, paso a paso

1. **Descargar** las fuentes y guardarlas con fecha. No vuelve a descargar salvo con `--refresh`.
2. **Calcular sobre el callejero completo**, antes de recortar: dónde arranca y hacia dónde crece la numeración de cada calle.
3. **Recortar:** entran los tramos cuyo `barrio`, `barrio_par` o `barrio_imp` esté entre los barrios activos (así entran las avenidas límite), más una zona de borde de unos 400 m que se puede manejar pero nunca se pregunta. Las cuadras que salen de esa zona terminan en un tope "fuera del área". Se excluyen los tramos con sentido PJE. PRIVADO y los que OSM marca como peatonales, escaleras o de acceso privado.
4. **Orientar** cada tramo. Hipótesis a verificar: la geometría va de la altura inicial a la final (en las filas revisadas, los pares están del lado izquierdo, coherente con eso). Se confirma con los vecinos: en la esquina compartida, la altura final de una cuadra debe empalmar con la inicial de la siguiente. Los tramos sin alturas toman el sentido de OSM; si no lo hay, quedan "en duda".
5. **Traducir el sentido:** CRECIENTE = se circula hacia donde crecen las alturas; DECRECIENTE = al revés; DOBLE = ambos.
6. **Armar el grafo:**
   - Los nodos son los extremos de tramos que coinciden (tolerancia de 1 m). Si el extremo de un tramo cae a menos de 1 m del medio de otro, ese otro se parte ahí.
   - Nunca se crean nodos donde dos líneas solo se cruzan, ni se unen tramos que OSM pone en distinto nivel (puente, túnel o `layer`).
   - Las vías de acceso restringido (lista `accesoRestringido` por código, más las autopistas y sus ramas en OSM) se dibujan y se enseñan como barreras, pero en esta versión quedan fuera del grafo del Navegante.
   - Las rotondas se marcan para que el Navegante las resuelva como una sola decisión.
7. **Nombres para mostrar:** "LUGONES, LEOPOLDO AV." pasa a "Av. Leopoldo Lugones". Se normalizan abreviaturas (Gral., Pres., Int., Dr., Cnel.) y mayúsculas según el español, con OSM como referencia y los casos raros en `pipeline/nombres-override.json`. Se guardan nombre oficial, nombre para mostrar, nombre corto ("Lugones") y alias, incluido el nombre anterior (`nomanter`).
8. **Cruzar con OSM:**
   - Por superposición, no por cercanía: para cada tramo se toman las vías de OSM con nombre parecido a menos de 30 m que cubran al menos el 60% del tramo.
   - `oneway` se normaliza: yes, 1 y true son mano única en el sentido del dibujo; -1, al revés; reversible o alternado, en duda. Las rotondas y las autopistas implican mano única.
   - Dos calzadas de mano única opuestas cuentan como DOBLE confirmado, con la marca `dividida`.
   - Dos líneas paralelas del callejero con el mismo código, a menos de 40 m y con sentidos opuestos, se preguntan juntas como "doble mano (calzadas separadas)" y quedan las dos en el grafo.
   - Semáforos: `highway=traffic_signals` sin `crossing`, a menos de 25 m de una esquina. Las restricciones de giro (`no_*` y `only_*`) se convierten en pares de aristas; las condicionales o con excepciones se ignoran y se reportan.
9. **Enriquecer:**
   - Tramos de sentido homogéneo y dónde cambia el sentido.
   - Secuencia ordenada de transversales de cada calle.
   - Rumbos porteños: cada barrio tiene un eje fijo del río y cada sentido cae en uno de cuatro sectores de 90° ("hacia el río", "hacia el oeste", "hacia el centro", "hacia General Paz"). A menos de 10° del borde de un sector, no se muestra rumbo.
   - Nivel del currículo de cada calle (sección 3).
   - Importancia: cuántas veces aparece cada calle en 20.000 rutas simuladas al azar dentro del área.
   - Cruces de vías desde OSM (puente, túnel o paso a nivel); los tramos bajo un viaducto no son barrera.
   - Patrones: grupos de paralelas que alternan sentido, para enseñarlos como regla.
   - Origen del nombre, solo desde la etiqueta `name:etymology:wikidata` de OSM.
10. **Hitos:** candidatos de OSM por categoría (estaciones de tren y subte en servicio, hospitales, plazas, parques y jardines con nombre, estadios, hipódromo y polo, shoppings, universidades, museos grandes, Biblioteca Nacional, Planetario, cementerios, Aeroparque, monumentos y obras con Wikidata). Los unos 15 hitos mayores del nivel 0 se marcan con `major`. Se eligen unos 150 por tamaño, tipo y cercanía a avenidas. En `pipeline/hitos-override.json` cada hito tiene un `slug` fijo y su `acceso`: de 1 a 3 cuadras manejables a menos de 150 m. Sin acceso, no es destino del Navegante.
11. **IDs estables y cambios:**
    - IDs tipadas: `N:código` (nombre), `S:código:alturas` (sentido), `A:código:mil` (alturas), `T:código:dirección:primer cruce` (transversales), `B:barrera:tramo` (cruce), `H:slug` (hito) y `Z:barrio` (barrio).
    - Cada regeneración produce `cambios-{versión anterior}-{nueva}.json`. Un tramo que conserva su sentido mantiene el estado de su tarjeta aunque cambie su rango de alturas; uno que cambió de sentido reinicia su tarjeta y genera una lección "cambió".
    - La app aplica ese archivo al actualizar los datos y al importar un respaldo viejo.
12. **Validar** con los chequeos de la tabla de validaciones. Si algo falla, el build se corta.
13. **Exportar** archivos compactos para la app (coordenadas con 6 decimales), `meta.json` con la fecha de cada fuente y `reporte.md` con conteos, discrepancias y advertencias.

### Estados de confianza de cada tramo

| Estado | Cuándo | Tarjetas y preguntas de sentido | Navegante | Mapa |
| --- | --- | --- | --- | --- |
| Confirmado | Callejero y OSM coinciden | Sí | Normal | Flecha normal |
| Sin par | No se encontró la vía en OSM | Sí, y aparece primero en "Para verificar" | Normal | Flecha normal |
| En duda | Las fuentes no coinciden, o el sentido es reversible | No: si había tarjeta, se suspende, y no cuenta para carnets | Ambos sentidos sin penalización, costo ×5, nunca origen ni destino | Flecha punteada con "?" |
| Orientación inferida | No se pudo orientar ni con alturas ni con OSM | Igual que en duda | Igual que en duda | Igual que en duda |
| Corregido por vos | Hay una corrección local | Sí; la tarjeta se reinicia | Normal, después de un chequeo local de trampas | Marca "corregido" |

### Validaciones automáticas

| Chequeo | Umbral | Por qué importa |
| --- | --- | --- |
| Conectividad sobre el grafo con giros: aristas desde las que se puede llegar a cualquier otra respetando sentidos y restricciones | 98% o más, sin contar la zona de borde | Un sentido mal cargado crea "trampas": cuadras a las que entrás y no podés salir |
| Trampas: grupos de una o varias aristas sin salida legal | Todas listadas y revisadas | Casi siempre son errores de datos o calles sin salida reales |
| Alturas: empalme entre cuadras y unos 100 números por cuadra | Excepciones listadas | Detecta tramos mal orientados |
| Sentido del callejero contra OSM | Porcentaje de coincidencia y lista por importancia | Prioriza qué verificar |
| Cambio de sentido en medio de una cuadra | Cero | Es un error típico de datos |
| Calles sin nombre o con nombres repetidos en lugares distintos | Listadas | Evita preguntas ambiguas |
| Hechos confirmados por Tomás | 100% | Prueba contra la realidad (sección 10) |

### Verificación, actualización y licencias

- "Para verificar" muestra primero los tramos en duda y sin par más usados.
- Las correcciones de Tomás viven en `pipeline/overrides.json` y se aplican al final del pipeline, con fecha y nota.
- `npm run data:update` vuelve a descargar todo, regenera los datos y el archivo de cambios, y muestra qué sentidos cambiaron. La app avisa ("cambió el sentido de tal calle"). Conviene correrlo cada seis meses, al ritmo de BA Data.
- La app muestra siempre los créditos: "© OpenStreetMap contributors" con link a la licencia, y "Datos: Buenos Aires Data (GCBA)".
- Los archivos que mezclan datos de OSM son una base de datos derivada: si el sitio es público, se ofrecen bajo la licencia ODbL (con el crédito a BA Data), o lo derivado de OSM se guarda en archivos separados. Es una pauta general, no asesoramiento legal.

## 9. Arquitectura técnica

Es una PWA estática escrita en TypeScript, en dos partes: un pipeline que corre en la compu y genera archivos de datos, y una app React con MapLibre que funciona sin servidor ni internet.

*(Diagrama del documento original: arquitectura · pipeline en la compu y app sin internet en el celu.)*

El único puente entre las dos mitades son los archivos de `public/data`: si una validación falla, no se generan y la app sigue con la versión anterior.

### Stack

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Lenguaje | TypeScript estricto, en la app y en el pipeline (6.0.3: typescript-eslint todavía no soporta TS 7) | Un solo lenguaje y tipos compartidos entre datos y app |
| Build | Vite | Rápido y con buen soporte de PWA |
| Interfaz | React + Tailwind CSS | Ecosistema amplio que Claude Code maneja muy bien |
| Estado | Zustand | Simple y sin ceremonia |
| Mapa | MapLibre GL JS con fuentes GeoJSON propias, sin tiles de terceros | Rota el mapa de forma nativa (frente hacia arriba), permite colorear calle por calle y funciona offline |
| Textos del mapa | Glyphs (fuentes de MapLibre) incluidos en el build, con el rango latino que cubre tildes y ñ | Sin glyphs, MapLibre no dibuja etiquetas |
| Repetición espaciada | [ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs) | Implementa FSRS (hoy, FSRS-7 por defecto). Se fija la versión exacta, y la versión de Node se alinea con la que pida (en .nvmrc y en CI). ts-fsrs 6.0.0 pide Node 24 o más: se usa Node 26.13.0 (LTS) |
| Base local | IndexedDB con Dexie | Aguanta miles de tarjetas y todo el historial |
| Offline | vite-plugin-pwa (Workbox) | Precarga app, datos y fuentes |
| Pipeline | Node + tsx, Turf.js, papaparse y un parser de WKT | Corre con un comando |
| Pruebas | Vitest, fast-check y Playwright | Sección 10 |
| Calidad y deploy | ESLint, Prettier, GitHub Actions y GitHub Pages | Cada cambio se prueba y se publica solo |

### Estructura del repositorio

```
sin-gps/
├── CLAUDE.md
├── docs/PLAN.md
├── pipeline/
│   ├── config.ts              barrios activos, tolerancias, umbrales
│   ├── 01-download.ts … 08-export.ts
│   ├── overrides.json         correcciones de Tomás
│   ├── nombres-override.json
│   ├── hitos-override.json
│   └── raw/                   descargas (fuera de git)
├── public/
│   ├── data/                  salida del pipeline (en git)
│   └── fonts/                 glyphs del mapa
├── src/
│   ├── engine/                TypeScript puro, sin React ni MapLibre
│   │   ├── graph.ts  turns.ts  router.ts  addresses.ts  patterns.ts
│   │   ├── srs/               FSRS, notas automáticas, sesiones
│   │   ├── quiz/              un generador por modo + distractores
│   │   └── navigator/         viajes, estados, puntaje, desvíos
│   ├── map/                   MapView, capas, cámara, toques
│   ├── features/              home, review, practice, navigator,
│   │                          explore, progress, settings, onboarding
│   ├── storage/               Dexie, migraciones, respaldo
│   └── ui/                    componentes comunes
├── tests/                     unit, data, e2e
└── .github/workflows/         ci.yml, deploy.yml
```

### Motor (`src/engine`)

Regla de oro: el motor no conoce React ni MapLibre. Recibe datos y devuelve resultados, así que se prueba entero en Node.

- `graph.ts`: grafo dirigido en arrays tipados (nodos, aristas, adyacencias), índice espacial para "calle más cercana" y "calles en esta zona", y componente principal calculada sobre el grafo con giros. El pipeline usa este mismo módulo.
- `turns.ts`: dada la arista por la que llegás, lista las salidas físicas con su ángulo, su clase y su legalidad (legal, ilegal o condicional, con el motivo), según las reglas de la sección 5.
- `router.ts`: A\* sobre estados "llegando por tal arista", con el costo de la sección 5 y heurística de distancia en línea recta × 0,85. Nunca devuelve una maniobra ilegal, y eso se prueba como propiedad.
- `addresses.ts`: buscador y geocodificación sin internet. "Cabildo 2400" devuelve el tramo y un punto interpolado; "Santa Fe y Scalabrini Ortiz" devuelve la esquina aunque esté formada por varios nodos. Tolera tildes, abreviaturas y números faltantes.
- `quiz/`: un generador por modo. Cada uno devuelve pregunta, opciones, respuesta, encuadre del mapa y la especificación de visibilidad (sección 4), a partir de una semilla.
- `srs/`: envoltorio de ts-fsrs, nota automática, una revisión por tarjeta por día, métrica "días hasta el 90%", estados de dominio, armado de sesiones e intercalado.
- `navigator/`: máquina de estados del viaje (inicio, en ruta, esquina, validación, llegada, resumen), generador de viajes con su alternativa, desvíos, salidas de emergencia ("Dar la vuelta", "Rendirse") y puntaje.
- `patterns.ts`: detección de patrones de sentido entre paralelas, para las lecciones de patrones.

### Mapa (`src/map`)

Capas, de abajo hacia arriba:

1. Fondo: agua, parques, vías del tren y límites de barrio.
2. Calles, con ancho según jerarquía.
3. Dominio: color por estado, con `feature-state` para no recargar datos.
4. Flechas de sentido: íconos repetidos a lo largo de cada tramo de mano única, con la geometría orientada en el sentido de circulación.
5. Resaltado de la pregunta actual.
6. Hitos.
7. Etiquetas, filtradas según el modo para no mostrar nunca la respuesta.
8. Capa invisible de 28 px de ancho para tocar calles finas.
9. Auto y marcadores del Navegante.

Para dibujar, los tramos se agrupan en secciones (calle + sentido) y la geometría se simplifica, para mantener la cantidad de objetos baja. Si aun así el mapa no es fluido en celulares modestos, el plan B es convertir los datos a PMTiles, que también funcionan sin internet.

### Almacenamiento local

| Tabla | Qué guarda |
| --- | --- |
| `cards` | La tarjeta completa de ts-fsrs (todos sus campos, sin recortar), su ID tipada y el estado de confianza del dato |
| `reviews` | Cada registro de revisión que devuelve ts-fsrs, más tiempo de respuesta y modo |
| `trips` | Viajes del Navegante: parámetros, semilla, recorrido y resultado |
| `confusions` | Pares de calles confundidas y cuántas veces |
| `overrides` | Correcciones de datos hechas por Tomás |
| `settings`, `meta` | Ajustes, parámetros de FSRS, versión de los datos y del esquema |

- La app pide almacenamiento persistente (`navigator.storage.persist()`).
- En iPhone, la app instalada guarda sus datos aparte de Safari y tiene su propio contador de días de uso; Apple no espera que se borren sus datos ([WebKit, citado por Pixel Envy](https://pxlnv.com/linklog/safari-pwa/)). Por eso el primer uso arranca siempre desde el ícono, y la app ofrece exportar un respaldo y lo recuerda una vez por semana.
- Cada cambio de esquema tiene su migración y su test, y hay un test de "guardar, recargar y obtener la misma próxima fecha".

### PWA y publicación

- Instalable desde el navegador ("Agregar a pantalla de inicio"), con ícono, pantalla de carga y orientación vertical.
- El precache incluye también `json`, `pbf`, `png`, `svg` y `webmanifest`, no solo `js`, `css` y `html`. Ningún archivo supera el límite de tamaño del precache: se parten los datos o se sube el límite. Un test de punta a punta verifica que cada archivo de `public/data` y `public/fonts` esté en el manifiesto.
- Todas las URLs se arman con `import.meta.env.BASE_URL`, para que funcionen bajo la ruta del repositorio en GitHub Pages; las rutas internas usan `#`.
- Las actualizaciones se aplican con aviso y nunca en medio de una sesión.
- Deploy automático a GitHub Pages en cada push a `main`. Con una cuenta gratis, Pages requiere repositorio público; en privados hace falta un plan pago ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)). En cualquier caso el sitio publicado es público, lo que no es un problema porque no tiene datos personales: el progreso vive solo en el celu.

## 10. Calidad: pruebas y verificación

Cada fase se cierra solo si pasan cinco controles: tests del motor, validación de datos, pruebas en celulares emulados, revisión visual y los hechos reales que Tomás haya confirmado.

| Control | Qué cubre | Herramienta | Cuándo corre |
| --- | --- | --- | --- |
| Tests del motor | Router, giros, FSRS, preguntas, alturas, IDs | Vitest y fast-check | En cada cambio y en CI |
| Validación de datos | Chequeos de la sección 8 | Script del pipeline | Al regenerar datos y en CI |
| Punta a punta | Flujos completos en celulares emulados | Playwright | En CI |
| Revisión visual | Capturas de las pantallas clave en tamaño celular | Playwright y revisión de Claude Code | Al cerrar cada fase |
| Hechos reales | Datos que Tomás confirma | Fixtures de test | En CI |

### Propiedades que se prueban sí o sí

- El router nunca devuelve una maniobra ilegal, y su costo coincide con Dijkstra sobre el mismo grafo con giros en 1.000 pares al azar.
- Toda ruta óptima de un viaje respeta las reglas que valida el juego y evita los giros condicionales.
- En cada pregunta, la respuesta correcta está entre las opciones, no hay opciones repetidas y se cumple la especificación de visibilidad: ninguna etiqueta visible contiene el nombre de una opción y no se ven las flechas de los tramos preguntados.
- Nunca se genera una pregunta sobre un tramo en duda o con orientación inferida.
- La nota automática respeta los umbrales de cada modo, y una tarjeta recibe como máximo una revisión FSRS por día.
- Ida y vuelta de direcciones: calle y altura → punto → calle y altura devuelve la misma cuadra.
- IDs estables: regenerar con los mismos datos no cambia ninguna. Con un fixture que parte un tramo, invierte un sentido y renombra una calle, el archivo de cambios conserva o reinicia las tarjetas que corresponde.
- Guardar, recargar y recalcular da la misma próxima fecha para cada tarjeta.
- Exportar e importar el progreso deja todo igual, también con un respaldo hecho con una versión de datos anterior.
- Las migraciones de esquema no pierden datos.
- Cada archivo de `public/data` y `public/fonts` está en el manifiesto del precache.
- Una simulación con semilla de un alumno virtual durante 180 días calibra los minutos diarios que muestra la app para cada opción de calles nuevas y los umbrales de los carnets.

### Pruebas de punta a punta

Corren en dos tamaños de celular emulado (390 × 844 y 360 × 800): primer uso completo, repaso del día, viaje corto con semilla fija, reporte de un error de datos, exportar e importar, y uso sin conexión después de instalar.

### Hechos reales

Tomás todavía no conoce las calles, así que la lista empieza vacía. *Decidido el 4/11/2026: la fase 1 se cerró sin hechos reales.* Cada diferencia que vea en la calle la reporta desde la app y se suma a `tests/fixtures/hechos-reales.json`: un sentido, la altura de una esquina, de qué lado quedan los pares, un cruce de vías o el rumbo de una calle. Mientras el archivo no exista, este control queda pendiente; apenas exista, tiene que dar 100%.

### Checklist en el celular al cerrar cada fase

- [ ] Se instala y abre en modo avión.
- [ ] Una sesión corta completa, sin trabas.
- [ ] Un viaje del Navegante con frente arriba y otro con norte arriba.
- [ ] Las calles finas se tocan sin errar.
- [ ] Modo oscuro y texto grande se ven bien.
- [ ] El progreso sigue ahí después de cerrar y volver a abrir.

### Cuándo una tarea está terminada

Typecheck, lint y tests en verde; sin errores en la consola; en cambios grandes, una revisión con un subagente antes del commit; y este plan actualizado si algo cambió.

### Diagnóstico

- Una pantalla oculta muestra versión de datos, conteos, última semilla y errores recientes.
- Los errores se registran en el celu y se pueden exportar. No hay telemetría: nada sale del teléfono.

## 11. Fases de construcción

Se construye en siete fases, de la base a los detalles. Cada una termina con una prueba de Tomás en el celular, y no se pasa a la siguiente sin su OK. Los datos van primero porque todo lo demás depende de ellos.

*(Diagrama del documento original: hoja de ruta · 7 fases, cada una con su condición para avanzar.)*

Los plazos dependen del ritmo de prueba de Tomás, así que la hoja de ruta fija el orden y las condiciones para avanzar, no fechas.

### Qué entrega cada fase

1. **Fase 0 · Base**
   - Repositorio con Vite, React, TypeScript estricto, Tailwind, ESLint, Prettier, Vitest y Playwright, con la versión de Node fijada.
   - CI (typecheck, lint, tests, build) y deploy automático.
   - PWA instalable con una pantalla de inicio vacía y un mapa MapLibre de prueba con glyphs locales, todo en el precache.
   - `CLAUDE.md` creado con el contenido de la sección 12.
   - **Pasa cuando** Tomás la instala en el celular y la abre en modo avión.
2. **Fase 1 · Datos, grafo y Explorar**
   - Pipeline completo con su reporte (sección 8), incluidos los estados de confianza y el archivo de cambios.
   - Motor de grafo: `graph.ts`, `turns.ts`, `router.ts` y `addresses.ts`. El pipeline los necesita para la conectividad y la importancia.
   - Explorar: mapa con calles, flechas, hitos, vías y límites; ficha de calle; buscador de calles, direcciones, esquinas e hitos.
   - Lista "Para verificar", reportes de datos y pantalla oculta de diagnóstico.
   - **Pasa cuando** el reporte no tiene fallas bloqueantes y Tomás la prueba en el celular. *Cerrada el 4/11/2026, sin hechos reales (sección 10).*
3. **Fase 2 · Aprender**
   - Motor de repetición espaciada (ts-fsrs, notas automáticas, sesiones), lecciones, diagnóstico y simulación de carga.
   - Modos Repaso del día, ¿Cómo se llama?, Encontrala, Sentidos (con la variante de 4 paralelas), Hitos y barrios, y Cruces de vías.
   - Mapa de dominio, primer uso, ajustes, rachas, meta diaria y logros, y exportar e importar con recordatorio semanal.
   - **Pasa cuando** hay una semana de uso diario sin errores ni pérdida de progreso.
4. **Fase 3 · Navegante**
   - Viajes, reglas, 4 niveles, cámara con frente arriba y norte arriba, desvíos, salidas de emergencia, puntaje y repetición del viaje.
   - Modos Esquinas y ¿Por dónde doblo?
   - **Pasa cuando** hay 10 viajes de distintos largos sin bugs y la ruta óptima nunca rompe una regla.
5. **Fase 4 · Completar modos**
   - Transversales (con vista tira), Alturas, confusiones y ejercicio de contraste, Mis errores, lecciones de patrones y proyección por barrio.
   - **Pasa cuando** cada modo tiene sus tests y Tomás hizo al menos una sesión real con cada uno.
6. **Fase 5 · Dominio**
   - Mapa a ciegas, carnets con examen de barrio, ensayo de viaje real con viajes guardados, Copiloto con voz opcional, viaje libre, modo paseo con GPS, accesos a autopistas y estadísticas completas.
   - **Pasa cuando** el flujo de carnet funciona de punta a punta (probado con fechas simuladas) y Tomás rinde un examen real.
7. **Fase 6 · Pulido**
   - Accesibilidad, rendimiento, textos finales, primer uso definitivo y recordatorio por calendario.
   - **Pasa cuando** se cumplen los objetivos de rendimiento de la sección 7 y el checklist completo de la sección 10.

Regla general: mientras un modo no existe, no aparece en las sesiones y sus tarjetas no se crean.

## 12. Cómo pasárselo a Claude Code

Este documento es la especificación: Claude Code lo lee entero, crea su `CLAUDE.md` y trabaja fase por fase, frenando para que Tomás pruebe.

### Pasos

1. Crear una carpeta `sin-gps` y un repositorio en GitHub: público si se publica gratis en GitHub Pages, o privado con Cloudflare Pages o Netlify.
2. Exportar este documento como Markdown y guardarlo como `docs/PLAN.md` dentro de la carpeta.
3. Abrir Claude Code en esa carpeta, en la compu, para que el pipeline tenga acceso a internet.
4. Pegar el prompt inicial.
5. En cada fase, aprobar el plan que proponga Claude Code y, al final, probar en el celular con el checklist de la sección 10.
6. Si algo cambia, actualizar `docs/PLAN.md` (o pedirle a Claude Code que lo haga), para que el plan siga siendo la fuente de verdad.

### Prompt inicial

```
Leé completo docs/PLAN.md antes de escribir código. Es la especificación de "Sin GPS", una PWA para aprender las calles, sentidos y alturas del norte de CABA y poder manejar sin GPS.

Cómo vamos a trabajar:
1. Por fases (sección 11). Empezá por la Fase 0 y no pases a la siguiente sin mi OK.
2. Al empezar cada fase, entrá en modo plan: proponeme las tareas, los archivos que vas a tocar y cómo lo vas a probar. Esperá mi aprobación.
3. Lo primero es crear CLAUDE.md con el contenido de la sección 12. Mantenelo al día.
4. Ningún nombre, sentido ni altura va escrito a mano en el código: todo sale del pipeline de datos.
5. Cada tarea termina con typecheck, lint y tests en verde. En cambios grandes, hacé una revisión con un subagente antes del commit.
6. Si algo del plan es ambiguo o choca con los datos reales, frená y preguntame. No inventes.
7. Al cerrar cada fase dame: qué hiciste, el link para probar en el celular, el checklist de la sección 10 y lo que quedó pendiente.
```

### Contenido de `CLAUDE.md`

```markdown
# Sin GPS

PWA offline para aprender las calles, sentidos y alturas del norte de CABA (Retiro, Recoleta, Palermo, Belgrano, Colegiales, Núñez, Saavedra, Villa Urquiza y Coghlan) y manejar sin GPS. La especificación completa está en docs/PLAN.md: leela antes de cada fase.

## Comandos
- npm run dev | build | preview
- npm run typecheck | lint | test | test:e2e
- npm run data:download | data:build | data:validate | data:update

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
```

## 13. Riesgos y decisiones abiertas

El mayor riesgo es aprender un dato mal, por eso casi todas las defensas apuntan a los datos.

| Riesgo | Qué pasaría | Cómo se mitiga |
| --- | --- | --- |
| Sentidos desactualizados o mal cargados | Aprender algo mal | Dos fuentes cruzadas, estados de confianza (lo dudoso no se pregunta), lista "Para verificar", correcciones de Tomás, actualización semestral y archivo de cambios |
| Avenidas con calzadas separadas mal interpretadas | Enseñar "mano única" donde hay doble mano | Cruce con OSM por superposición y marca `dividida` |
| Cuadras del callejero que no comparten esquina | Rutas imposibles o esquinas sin opciones | Partir tramos en las uniones en T, chequeo de conectividad sobre el grafo con giros y plan B con la topología de OSM |
| Cambios recientes en la ciudad (viaductos, sentidos nuevos) | Enseñar barreras o sentidos que ya no existen | Cruces de vías calculados desde OSM, reportes de Tomás y actualización semestral |
| Datos sin comparar con la calle: la fase 1 se cerró sin hechos reales | Si las dos fuentes se equivocan en una cuadra, se aprende mal | Reportes de Tomás cuando ve una diferencia; cada uno se suma a los hechos reales |
| No hay datos de flechas de giro en los semáforos | Castigar un giro permitido o aceptar uno prohibido | Giros condicionales sin penalización; la ruta óptima los evita y Esquinas no pregunta por ellos |
| Restricciones de giro incompletas en OSM | Permitir algo prohibido | Se usan como extra y la app recuerda respetar siempre la señalización |
| Mapa lento en celulares modestos | Mala experiencia | Agrupar tramos y simplificar geometría; plan B con PMTiles |
| Pérdida de progreso | Frustración | Almacenamiento persistente, uso desde la app instalada y respaldo exportable con recordatorio semanal |
| Demasiados repasos por día | Abandono | 4 calles nuevas por defecto, minutos estimados a la vista, tope diario y prioridad por riesgo |
| Uso mientras se maneja | Accidente | Avisos y pausa automática del modo paseo por encima de 20 km/h, sin excepciones |
| Licencias de los datos | Publicar mal datos derivados | Créditos visibles y datos derivados de OSM bajo ODbL o en archivos separados |

### Decisiones abiertas

- [ ] Barrio base (se elige en el primer uso).
- [x] Repositorio público con GitHub Pages, o privado con Cloudflare Pages o Netlify. *Decidido el 2/11/2026: público con GitHub Pages.*
- [x] iPhone o Android, para priorizar las pruebas de instalación. *Decidido el 2/11/2026: iPhone.*
- [ ] Nombre definitivo de la app.
- [x] Si el callejero resulta mal conectado, usar la topología de OSM (se decide con el reporte de la fase 1). *Resuelto con ese reporte: la conectividad da 98,35%, no hace falta.*
- [x] Barrio 31. *Decidido el 3/11/2026: queda fuera del mapa.*
- [x] Origen del nombre. *Decidido el 3/11/2026: sin Wikidata por ahora, no se muestra.*
- [x] Hechos reales. *Decidido el 4/11/2026: Tomás todavía no conoce las calles; la lista empieza vacía y se llena con sus reportes (sección 10).*

## Fuentes

- [BA Data: dataset Calles](https://data.buenosaires.gob.ar/dataset/calles) y su [recurso GeoJSON](https://data.buenosaires.gob.ar/dataset/calles/resource/2941f731-0a2e-4391-b8c9-a2912a80c081)
- [BA Data: callejero en CSV](https://cdn.buenosaires.gob.ar/datosabiertos/datasets/jefatura-de-gabinete-de-ministros/calles/callejero.csv)
- [Ley 5760 de CABA: giro a la izquierda en arterias de doble sentido](https://boletinoficial.buenosaires.gob.ar/normativaba/norma/346793)
- [Disposición 1826/2008 de la Dirección General de Tránsito](https://boletinoficial.buenosaires.gob.ar/normativaba/norma/118961)
- [C5N: por qué las calles porteñas cambian de nombre y de numeración](https://www.c5n.com/sociedad/convertir-piedras-esmeraldalos-secretos-las-calles-que-cambian-nombre-buenos-aires-n233062)
- [GCBA: límites del barrio Coghlan](https://buenosaires.gob.ar/gcaba_historico/laciudad/coghlan)
- [GCBA: Viaducto Mitre](https://www.buenosaires.gob.ar/desarrollourbano/desarrollo/viaducto-mitre)
- [Overpass API: uso y límites](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- [OpenStreetMap: licencia y atribución](https://www.openstreetmap.org/copyright/attribution-guide/)
- [ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs)
- [Pixel Envy: aclaración de WebKit sobre apps en la pantalla de inicio](https://pxlnv.com/linklog/safari-pwa/)
- [GitHub Docs: crear un sitio de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
