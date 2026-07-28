# Prototipo funcional (unidades 001–011)

Web estática, sin dependencias ni paso de compilación, publicada en GitHub Pages
desde la raíz del repositorio.

Este documento cuenta **cómo está hecho**. El **por qué** —qué se aprende, qué
cuenta como prueba y cuándo se vuelve sobre ello— está en
[`modelo-aprendizaje.md`](modelo-aprendizaje.md), y sus matrices vivas en
[`matrices.md`](matrices.md). Cuando los dos digan cosas distintas, manda el
modelo.

## Qué hay

| Pieza | Ruta |
| --- | --- |
| Shell de la web | `index.html` |
| Aplicación | `app/*.js`, `app/app.css` |
| Contenido de ejecución | `curso/curriculum.json`, `curso/unidades/unidad-0NN.json` |
| Texto de lección redactado (U001–U010) | `curso/fuentes/lecciones-001-010.json` |
| Generador de contenido | `scripts/build_prototipo.py` |
| Generador de locuciones | `scripts/generar_audio.py` |
| Pruebas | `scripts/test_prototipo.mjs` |
| Web anterior | `legacy.html` (los antiguos `assets/` y `content/` siguen en su sitio) |

## Fuentes de contenido

1. `CLAUDE/paruski_b1_materials_l001_l010_v1_9_3_EDITADO.zip` — paquete corregido
   de las unidades 001–010: 650 ejercicios, 246 entradas de vocabulario,
   38 competencias, núcleos semánticos, trayectorias y plan de evaluación.
2. `CLAUDE/leccion_011_acusativo_inanimado.json` — unidad 011 completa.
3. `curso/fuentes/lecciones-001-010.json` — el texto explicativo de las diez
   primeras unidades, que el paquete no traía, redactado con la misma estructura
   de la 011: idea central, interferencia español-ruso, modelos mínimos y errores
   que bloquean.

`python3 scripts/build_prototipo.py` regenera `curso/` y deja el detalle en
`curso/informe-build.json`.

## Corrección automática de todos los ítems

El paquete original resolvía 190 ejercicios con rúbrica abierta, no comprobables
por máquina. En el prototipo **todo ítem se corrige solo**, y para no perder la
exigencia cognitiva se reconvierten en tareas de varios pasos apoyadas en los
campos estructurados que el propio material ya traía:

### Ítems que no se podían resolver

Tres familias de ejercicios del material de origen eran irresolubles o ambiguas
en pantalla, y se han rehecho:

- **Homoglifos latinos.** Pedir «elige entre `Это хлеб.` y `Это хлeб.`» es
  imposible: en pantalla las dos formas son idénticas. Ahora son tareas de
  escritura: se muestra la forma contaminada y hay que reescribirla en cirílico.
- **Acento léxico.** Se pedía teclear `вода́`, con un diacrítico combinante que
  nadie escribe, y el corrector lo ignoraba de todos modos. Ahora se señala la
  vocal tónica entre las vocales de la palabra y después se escribe la forma sin
  marcarla. Ningún paso exige ya teclear diacríticos.
- **Consignas que se delataban.** Las de contraste decían «explica por qué sólo la
  primera es coherente» antes de preguntar cuál era la buena. Se sustituyen por
  una consigna neutra con la situación, y las opciones se barajan.

Además, cada paso escrito declara qué se espera («una sola frase en ruso», «dos
frases, en cualquier orden», «una respuesta breve en español»), y los distractores
conceptuales sólo pueden salir del propio material: afirmaciones que el paquete
declara falsas, la regla rival, o el fenómeno de las competencias con las que ésa
se confunde. Si no hay al menos dos distractores creíbles, la pregunta no se
plantea.

| Tipo original | Se convierte en |
| --- | --- |
| Diagnóstico y reparación | Elegir el fenómeno que falla + escribir la intervención reparada |
| Contraste semántico | Elegir la forma adecuada + elegir qué la distingue + escribirla |
| Inducción de regla | Elegir la regla frente a la regla rival + aplicarla a un caso nuevo |
| Crítica de retrotraducción | Escribir la versión correcta + identificar la pérdida |
| Transferencia guiada | Escribir la intervención + justificar la decisión lingüística |
| Contraejemplo | Escribir el contraejemplo + explicar qué invalida |
| Vacío de información | Escribir el intercambio completo; se exige cerrar las dos lagunas |

Lo que no admite comprobación determinista no se publica, y lo que repite a otro
ejercicio tampoco: de 715 ítems de partida se publican 696, a los que se suman
232 de vocabulario generados del propio léxico (`curso/informe-build.json` recoge
los descartes con su motivo).

## Vocabulario

Cada palabra del léxico da su propio ejercicio, sin construcción alrededor:
reconocer el significado entre otras palabras de la misma unidad y categoría,
escribirla en ruso a partir del español, y situar su vocal tónica. Los patrones
de construcción del léxico («У меня есть...», «Это X. Он/Она...») no dan
ejercicio: no son palabras, no se teclean tal cual y no tienen acento que
señalar. Cada unidad tiene su competencia léxica (`lexico_uNNN`), así que el
repaso la programa como a cualquier otra.

Criterios de corrección, en `app/grader.js`:

- **ruso**: comparación normalizada (sin marca de acento editorial, ё = е,
  puntuación final opcional). Una sola letra de diferencia se marca como errata y
  se permite reintentar.
- **español**: cobertura de palabras de contenido con coincidencia por lema
  aproximado; con respuestas muy cortas, comparación completa sin acentos.
- **intercambios**: se exige la presencia de cada frase requerida, en cualquier orden.

## Navegación

- **Ruta**: las once unidades como estaciones; las cerradas no se abren.
- **Unidad**: pestañas de lección, ejercicios, vocabulario y competencias.
- **Ejercicios**: índice completo de la unidad, filtrable por tipo y por estado
  (sin hacer / fallados / acertados), y cada uno se puede lanzar suelto.
- **Sin parar**: encadena ejercicios de toda la unidad sin elegir tipo ni
  longitud; al agotar la tanda pide otra, con el mismo criterio de elección que
  la práctica, hasta que el alumno sale.
- **Sesión**: modo concentrado, con barra de segmentos, atajos de teclado
  (1–9 para elegir, Enter para comprobar y avanzar) y teclado cirílico integrado
  con transliteración automática (`privet` → `привет`).
- **Progreso**: radar de las seis dimensiones por competencia y mapa de unidades.

## Dictado y dimensión auditiva

Cada competencia tiene dos dictados: se oye una forma suya y se escribe, sin el
texto a la vista. Acredita **reconocimiento auditivo** y no recuperación, porque
el contenido lo da el audio y no la memoria. Se dictan sólo formas que ya son
material de esa competencia y que tienen locución grabada, y se prefiere la más
corta: un dictado se corrige letra a letra, y una frase larga mide memoria de
trabajo. Son dos y no uno porque el examen se reserva uno: si no, la escucha sólo
se examinaría y nunca se practicaría.

## Modelo del alumno y repaso

El repaso se programa **sobre competencias**, no sobre ítems. Cada competencia
lleva seis dimensiones (`app/store.js`), tomadas del esquema de progreso del
paquete:

comprensión explícita · reconocimiento escrito · recuperación escrita ·
transferencia contextual · retención diferida · reconocimiento auditivo.

- Una elección múltiple acierta **reconocimiento**, nunca **recuperación**.
- La producción sin pista acredita **recuperación**; si además han pasado siete
  días o más, acredita **retención diferida**.
- Acertar con pista cuenta menos y queda registrado como dependencia de clave.
- Intervalos 1 · 3 · 7 · 16 · 35 · 70 · 140 días; un fallo devuelve la
  competencia a la cola inmediata y suma recaída.
- Al tocar repasar, se elige el ítem que ataca la **dimensión más débil** de esa
  competencia, evitando el ítem ya visto si hay otro que ejercite lo mismo en
  otro contexto.

## Exámenes y desbloqueo

El examen abre la unidad siguiente, así que no puede dejar competencias sin
comprobar: para **cada** competencia de la unidad, léxico incluido, exige
reconocerla —elegir entre opciones— y además producirla sin pista, porque una
elección múltiple no acredita recuperación. Lo que el material no traía ya
examinado se reserva de la práctica, nunca se inventa. Salen entre 9 y 12 ítems
por unidad, de 10 a 14 pasos. No hay corrección hasta el final; se aprueba con
el 80 % y los ítems de examen nunca aparecen en la práctica.

## Audio

El curso necesita 941 locuciones distintas (palabras, ejemplos, enunciados,
respuestas modelo). Están las 941: 197 venían del banco, 75 palabras sueltas se
generaron con Silero (que marca el acento tónico) y 669 frases con XTTS-v2, con
la misma voz del banco tomada de un microdiálogo suyo como referencia.

`scripts/generar_audio.py` hace el inventario y la síntesis:

```bash
python3 scripts/generar_audio.py --lista                       # qué falta
python3 scripts/generar_audio.py --engine silero --solo palabras
python3 scripts/generar_audio.py --engine xtts --speaker-wav voz.wav --solo frases
```

Motores disponibles:

- **silero** (v4_ru): ligero, y sobre todo acepta marcar el acento con `+` delante
  de la vocal tónica. Para un curso de idiomas eso pesa más que medio punto de
  naturalidad: garantiza que la palabra se oye con el acento que enseña la ficha.
  El script traduce automáticamente `соба́ка` → `соб+ака`.
- **xtts** (Coqui XTTS-v2): el motor del banco actual, así que es la opción para
  que las frases nuevas suenen igual que las 1253 ya grabadas. Necesita 6 s de voz
  de referencia y no controla el acento.
- **f5** (F5-TTS): mejor prosodia en frases largas; requiere checkpoint con ruso.

Recomendación: `silero` para el vocabulario suelto y `xtts` para frases y
microdiálogos, en dos pasadas con `--solo`.

La salida va a `content/audio/curso/` y el índice a `curso/audio.json`, que la web
lee junto al banco antiguo sin tocarlo. Mientras falte una locución, el botón de
escucha usa la voz del navegador y lo dice en el propio botón.

## Pruebas

```bash
scripts/verificar.sh       # el flujo entero: reproducibilidad, invariantes y modelo
npm install jsdom          # sólo para las pruebas
node scripts/test_prototipo.mjs
```

`scripts/verificar.sh` en local y `.github/workflows/verificar.yml` en CI hacen lo
mismo, y el despliegue a Pages espera a que pase: comprueba que `curso/` se
reproduce desde el generador, que las invariantes se cumplen y que el curso
cumple el modelo de aprendizaje.

49 comprobaciones: integridad del contenido, ausencia de opciones indistinguibles
o que se delaten por la mayúscula inicial,
contrato de respuesta en todos los pasos escritos, criterios de corrección,
construcción de sesiones, efecto de acertar y fallar sobre la programación del
repaso, desbloqueo por examen, y que todas las respuestas modelo del curso se
autocorrijan como correctas.

## Límites conocidos

- Materiales con revisión editorial hecha, pero **sin validación de hablante
  nativo**; así se declaran en la propia web.
- La transferencia contextual cubre 39 de las 53 competencias: exige una escena
  distinta de la aprendida, y esa escena tiene que venir del material.
- El progreso se guarda en `localStorage`, sin sincronización entre dispositivos.
- Quedan 89 unidades por desarrollar.
