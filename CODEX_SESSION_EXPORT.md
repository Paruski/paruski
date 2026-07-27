# Traspaso para el proximo Codex - Paruski

Fecha de cierre: 2026-07-07.
Repositorio local: `/home/berka/codex-dir/paruski`.

Este archivo esta escrito para que una nueva sesion de Codex pueda continuar el
trabajo sin depender del historial de prompts. Debe leerse antes de modificar
codigo.

## Regla editorial vigente

La regla mas importante para la siguiente sesion es esta:

- el algoritmo automatico solo puede seleccionar ejercicios ya existentes;
- no puede generar ejercicios de gramatica, mixtos, listening ni examenes;
- unica excepcion admisible: vocabulario puro de recuperacion mecanica del tipo
  `como se dice X?`, con respuesta de una sola palabra/lema;
- evitar series redundantes de la misma estructura visible si no hay cambio
  real de dificultad, direccion o contraste.

## Arranque recomendado

1. Abrir la carpeta `/home/palaia/codex-dir/paruski`.
2. Leer este archivo completo.
3. Leer despues:
   - `docs/agent-handoff.md`
   - `docs/architecture.md`
   - `docs/science-backed-learning.md`
   - `docs/methodology-implementation.md`
   - `docs/audio-pipeline.md`
   - `docs/audio-gpu-handoff.md` si se trabaja con voces o audio.
4. Ejecutar:

```bash
git status --short --branch
git log -1 --oneline
```

## Estado Git

Rama local activa esperada:

```text
codex/learning-architecture
```

Commit local principal:

```text
25bf437 Implement modular learning architecture
```

Padre de ese commit:

```text
1e0cebb9b54eadc57c576c4655c66ec06565fc4d
```

En el momento de cierre, `main` remoto coincidia con ese padre. La rama local
no pudo subirse a GitHub porque la terminal no tenia credenciales Git:

- HTTPS fallo por falta de usuario/token.
- SSH fallo por falta de clave publica valida.
- El conector de GitHub tenia permisos, pero no exponia una subida binaria por
  path local adecuada para este commit, que incluye MP3 de preview.

Cuando haya credenciales locales, la accion limpia es:

```bash
git push -u origin codex/learning-architecture
```

Despues se puede abrir un PR hacia `main`.

## Artefactos de transferencia sin versionar

Puede haber estos archivos/carpetas sin versionar:

```text
0001-Implement-modular-learning-architecture-no-audio.patch
0003-Deepen-early-Russian-exercises.patch
paruski-no-audio-single.bundle
paruski-no-audio/
CODEX_SESSION_EXPORT.md
```

`paruski-no-audio-single.bundle` fue verificado como bundle Git valido y contiene
una historia completa con:

```text
main
codex/learning-architecture-no-audio-single
```

Esos artefactos sirven como apoyo de traslado, especialmente si se quiere mover
una version sin audio. No sustituir a ciegas el commit `25bf437` por ellos: antes
comparar con `git diff`, porque el commit local completo incluye previews MP3 y
la arquitectura actual.

## Objetivo del producto

Paruski es una web estatica para aprender ruso desde cero hasta A1-A2 inicial.
La experiencia principal no debe ser una biblioteca pasiva: debe guiar al alumno
con una sesion dirigida, explicar lo justo, hacer practicar, dar feedback,
registrar evidencia y planificar repasos.

El aprendizaje es el centro del producto. Todo cambio debe basarse en:

- recuperacion activa;
- practica espaciada;
- intercalado;
- feedback correctivo;
- uso semantico contextual;
- carga cognitiva razonable;
- medicion del progreso por competencias observables.

Fuentes documentadas en `docs/science-backed-learning.md`:

- Dunlosky et al. (2013), `10.1177/1529100612453266`.
- Roediger & Karpicke (2006), `10.1111/j.1467-9280.2006.01693.x`.
- Lyster, Saito & Sato (2013), `10.1017/S0261444812000365`.

## Restricciones no negociables

- Debe funcionar en GitHub Pages gratuito.
- La app publicada debe seguir siendo estatica: HTML, CSS, JS, JSON y assets.
- No introducir backend obligatorio.
- No subir claves, tokens ni datos sensibles.
- No subir materiales fuente no publicables.
- Mantener arquitectura modular. No volver a una app monolitica.
- Centralizar contenido en JSON y normalizacion en codigo.
- Evitar duplicados manuales.
- No generar ni indexar el corpus completo de audio hasta aprobar una voz final.

## Arquitectura implementada

Entrada:

- `index.html`: shell minimo.
- `assets/app.js`: bootstrap y registro de modulos.
- `assets/app-shell.css`: estilos de la nueva interfaz modular.
- `service-worker.js`: cache de app y JSON esenciales.

Core:

- `assets/core/app-context.js`
- `assets/core/audio.js`
- `assets/core/content-store.js`
- `assets/core/competency-tagger.js`
- `assets/core/event-log.js`
- `assets/core/input-tools.js`
- `assets/core/learner-model.js`
- `assets/core/registry.js`
- `assets/core/scheduler.js`
- `assets/core/storage.js`
- `assets/core/utils.js`

Features:

- `assets/features/guided-session/`
- `assets/features/library/`
- `assets/features/calendar/`
- `assets/features/progress/`
- `assets/features/settings/`
- `assets/features/sync/`

Ejercicios:

- `assets/exercises/shared.js`
- `assets/exercises/cloze/`
- `assets/exercises/dictation/`
- `assets/exercises/listen-choice/`
- `assets/exercises/multiple-choice/`
- `assets/exercises/production-prompt/`
- `assets/exercises/text-input/`
- `assets/exercises/transform/`

Contenido nuevo o relevante:

- `content/competencies.json`
- `content/audio-worklist.json`
- `content/audio-index.json`
- `content/audio/ru/.gitkeep`
- `content/audio/preview/`
- `content/audio/preview-kseniya-controlled/`
- `content/audio/preview-piper-irina/`

## Contrato modular

Features:

```js
{ id, label, order, navMode, mount(container, context) }
```

Ejercicios:

```js
{ type, modalities, render(exercise, context), evaluate(answer, exercise, context), getTargets(exercise) }
```

El scheduler produce tareas genericas:

```text
explain
exercise
```

La sesion guiada no debe conocer detalles internos de cada tipo de ejercicio.
Para anadir features o ejercicios, crear el modulo, registrarlo en
`assets/app.js` y actualizar `service-worker.js` si debe cachearse.

## Cambios funcionales realizados

- `index.html` se redujo a shell de app.
- `assets/app.js` se convirtio en bootstrap modular.
- La sesion guiada elige objetivos segun desbloqueo, vencimiento, errores,
  dominio, dificultad e importancia.
- La biblioteca busca por ruso, traduccion, explicacion, transcripcion,
  ejemplos, resumen y etiquetas.
- El input de busqueda de biblioteca ya no re-renderiza todo a cada caracter:
  solo actualiza resultados.
- La correccion acepta variantes razonables, `ё/e`, puntuacion flexible y evita
  penalizar al alumno por metacodigo ajeno al ruso.
- Los targets hostiles para copiar, como estructuras con barras o signos, se
  evitan en input exacto y pasan a cloze o eleccion.
- Se anadio `production-prompt` para produccion semantica cuando ya hay cierta
  evidencia previa.
- Las preguntas generadas de gramatica usan frases rusas que aplican una
  estructura, no nombres de reglas.
- Eventos de practica guardan `target_ids`, `competency_ids` y
  `competency_tags`.
- El progreso muestra competencias entrenadas y competencias a reforzar.
- `data/progress.json` subio a version 3 con soporte para competencias.
- `schemas/learning-event.schema.json` se amplio para competencias.

## Competencias

Taxonomia en `content/competencies.json`.

Dimensiones:

- `skill`
- `retrieval`
- `modality`
- `direction`
- `lexicon`
- `grammar`
- `morphology`
- `function`

`assets/core/competency-tagger.js` infiere etiquetas para ejercicios estaticos y
generados. `assets/core/learner-model.js` actualiza dominio por target y por
competencia. Esta capa debe crecer en segundo plano: el alumno no necesita ver
todo el etiquetado, pero la app si debe usarlo para personalizar repasos.

## Audio

Estado intencionado:

- `content/audio-index.json` no indexa audios finales todavia.
- `content/audio/ru/` queda como destino limpio de MP3 finales aprobados.
- Las carpetas `content/audio/preview*` son muestras de comparacion.
- `content/audio-worklist.json` lista los textos pendientes.

Decision actual:

- Piper `ru_RU-irina-medium` no alcanza calidad suficiente.
- Silero `kseniya` parece mas clara, pero aun no esta aprobada como voz final.
- Si hay GPU, probar un modelo TTS mejor y comparar nivel, cadencia, naturalidad
  y consistencia antes de generar el corpus completo.
- No subir modelos, checkpoints ni caches.
- No precachear MP3 en el service worker; deben cargarse bajo demanda.

## Validaciones realizadas

Se ejecutaron y pasaron:

```bash
find content data schemas -name '*.json' -exec jq empty {} +
git diff --check
```

Tambien se comprobaron:

- 77 imports locales resueltos, 0 faltantes.
- 45 rutas del service worker existentes, 0 faltantes.
- 0 MP3 finales en `content/audio/ru/`.
- 0 entradas finales en `content/audio-index.json`.
- 0 referencias de preview en `content/audio-index.json`.

Limitaciones del entorno:

- No habia runtime JS disponible (`node`, `deno`, `bun`, etc.).
- Chromium headless fallaba por el entorno antes de cargar la pagina.
- Por tanto queda pendiente validacion visual real en navegador.

## Proximos pasos recomendados

1. Subir `codex/learning-architecture` a GitHub cuando haya credenciales.
2. Abrir PR contra `main`.
3. Revisar visualmente la app en GitHub Pages o servidor local.
4. Probar flujo de sesion, biblioteca, progreso, calendario y audio en navegador.
5. Generar 20-30 audios de muestra con GPU y aprobar voz final.
6. Sustituir previews por MP3 finales en `content/audio/ru/`.
7. Regenerar `content/audio-index.json`.
8. Ampliar ejercicios semanticos y tarjetas explicativas sin romper la estructura.

## Regla de trabajo para el siguiente Codex

Antes de tocar codigo, confirmar:

```bash
git status --short --branch
git log -1 --oneline
```

Si se trabaja sobre el commit `25bf437`, preservar la arquitectura modular y no
mezclar cambios de audio final hasta que haya una decision clara de voz. Si se
usa un bundle o patch sin audio, comparar antes contra el arbol local completo.

El criterio de producto es estable: Paruski debe guiar al alumno y medir
aprendizaje real de ruso, no solo mostrar materiales.
