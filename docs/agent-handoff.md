# Contexto completo para continuar Paruski

Este archivo es el punto de entrada para una nueva sesion de trabajo. Debe
permitir continuar el proyecto sin conocer el historial de prompts.

## Objetivo del producto

Paruski es una web estatica para aprender ruso desde cero hasta un nivel A1-A2
inicial. La web debe guiar al alumno: no debe ser una biblioteca pasiva donde
el alumno tenga que decidir que estudiar. La experiencia principal es una sesion
dirigida que explica lo justo, hace practicar, da feedback, registra evidencia
y planifica repasos.

La biblioteca, el calendario, la sincronizacion y el progreso son soportes del
aprendizaje. El estandarte de la web es aprender ruso con metodologia solida:
recuperacion activa, practica espaciada, intercalado, feedback correctivo,
uso semantico contextual, carga cognitiva razonable y medicion por competencias.

## Restricciones no negociables

- Debe funcionar gratis en GitHub Pages.
- La app publicada es estatica: HTML, CSS, JS, JSON y assets.
- No hay backend obligatorio.
- No se suben claves ni datos sensibles.
- No se suben materiales fuente no publicables.
- El progreso puede guardarse localmente y sincronizarse al repositorio porque
  no contiene datos sensibles.
- Los modelos TTS se ejecutan fuera de la web. La app solo reproduce audios
  estaticos ya generados.
- La estructura modular disenada debe conservarse. No volver a una app monolitica.

## Arquitectura actual

Entrada:

- `index.html`: shell minimo de la app.
- `assets/app.js`: bootstrap, registro de features y tipos de ejercicio.
- `service-worker.js`: cache estatico de modulos y JSON esenciales.

Nucleo:

- `assets/core/app-context.js`: contexto compartido.
- `assets/core/audio.js`: reproduce audio estatico; la sintesis del navegador solo se permite con `allowSynthesis: true` para usos explicitos de desarrollo.
- `assets/core/content-store.js`: carga y normaliza contenido.
- `assets/core/competency-tagger.js`: etiqueta ejercicios con competencias.
- `assets/core/event-log.js`: registra eventos de practica.
- `assets/core/input-tools.js`: teclado ruso.
- `assets/core/learner-model.js`: modelo adaptativo del alumno.
- `assets/core/registry.js`: registro de features y ejercicios.
- `assets/core/scheduler.js`: sesion guiada, priorizacion y espaciado.
- `assets/core/storage.js`: localStorage, eventos y sincronizacion.
- `assets/core/utils.js`: utilidades comunes.

Features:

- `assets/features/guided-session/`: experiencia principal.
- `assets/features/library/`: consulta desbloqueada de vocabulario y gramatica.
- `assets/features/calendar/`: aprendido y previsto.
- `assets/features/progress/`: rendimiento por targets y competencias.
- `assets/features/sync/`: sincronizacion con GitHub.
- `assets/features/settings/`: ajustes locales.

Ejercicios:

- `assets/exercises/shared.js`: render/evaluacion comun.
- `assets/exercises/text-input/`
- `assets/exercises/cloze/`
- `assets/exercises/multiple-choice/`
- `assets/exercises/dictation/`
- `assets/exercises/listen-choice/`
- `assets/exercises/transform/`
- `assets/exercises/production-prompt/`

Contenido:

- `content/lessons.json`
- `content/vocabulary.json`
- `content/grammar.json`
- `content/exercises.json`
- `content/materials.json`
- `content/materials-aspect.json`
- `content/learning-notes.json`
- `content/paruski-db.json`
- `content/audio-index.json`
- `content/audio-worklist.json`
- `content/competencies.json`

Documentacion clave:

- `docs/architecture.md`
- `docs/science-backed-learning.md`
- `docs/methodology-implementation.md`
- `docs/audio-pipeline.md`
- `docs/audio-gpu-handoff.md`
- `docs/agent-handoff.md`

## Diseno estructural que debe preservarse

La app sigue un patron de registros:

1. `assets/app.js` importa y registra features y ejercicios.
2. Cada feature tiene un objeto `{ id, label, order, mount(container, context) }`.
3. Cada ejercicio tiene un objeto `{ type, render, evaluate, getTargets }`.
4. El scheduler produce tareas genericas:
   - `explain`
   - `exercise`
5. El renderizador de sesion no conoce detalles internos de cada tipo de ejercicio.
6. El contenido vive en JSON; el codigo infiere, normaliza y etiqueta.

Para anadir una feature:

1. Crear `assets/features/nombre/index.js`.
2. Registrar en `assets/app.js`.
3. Anadir al service worker si debe cachearse.

Para anadir un tipo de ejercicio:

1. Crear `assets/exercises/nombre/index.js`.
2. Usar helpers de `assets/exercises/shared.js` si encajan.
3. Registrar en `assets/app.js`.
4. Actualizar el scheduler solo si hace falta elegir ese tipo.

Para anadir contenido:

1. Preferir JSON centralizado.
2. Evitar duplicados manuales.
3. Mantener ids estables.
4. Dejar que `content-store.js` normalice.

## Metodologia implementada

La app se basa en:

- Recuperacion activa: el alumno intenta antes de ver la respuesta.
- Practica espaciada: `next_due_at` e `interval_days`.
- Intercalado: mezcla de vocabulario, gramatica, nivel y modalidad.
- Feedback correctivo: correcto/incorrecto, forma esperada y foco de error.
- Uso semantico: los ejercicios deben entrenar significado y aplicacion.
- Carga cognitiva razonable: no pedir copiar barras, metacodigo o frases largas
  cuando eso no mide ruso.
- Medicion por competencias: cada evento actualiza competencias observables.

Fuentes metodologicas documentadas:

- Dunlosky et al. (2013), `10.1177/1529100612453266`.
- Roediger & Karpicke (2006), `10.1111/j.1467-9280.2006.01693.x`.
- Lyster, Saito & Sato (2013), `10.1017/S0261444812000365`.

## Competencias

La taxonomia esta en `content/competencies.json`.

Dimensiones:

- `skill`: reconocimiento, produccion, escucha, gramatica.
- `retrieval`: reconocimiento, recuerdo con pista, aplicacion, transferencia.
- `modality`: texto, audio, teclado cirilico.
- `direction`: ruso a significado, significado a ruso, seleccion/manipulacion de forma.
- `lexicon`: campos semanticos.
- `grammar`: estructuras funcionales.
- `morphology`: caso, verbo, genero/numero, forma cirilica.
- `function`: funciones comunicativas.

`assets/core/competency-tagger.js` infiere competencias para ejercicios estaticos
y generados. `assets/core/learner-model.js` guarda dominio por competencia en
`progress.competencies`.

## Ejercicios

Reglas actuales:

- No preguntar por metadatos del curso.
- No usar preguntas tipo "en que leccion aparece X".
- No exigir copiar barras, signos o metacodigo.
- Evitar escritura exacta de frases largas.
- Para gramatica generada, elegir frases rusas que aplican la estructura, no
  nombres de reglas.
- Para vocabulario con cierta evidencia, usar produccion semantica: el alumno
  debe escribir una frase rusa corta que use la idea.
- La correccion acepta puntuacion flexible, `ё/e`, variantes con barras y
  alternativas razonables.

## Audio

La app no debe depender de voces del navegador. El objetivo final es tener audios
estaticos de alta calidad en `content/audio/ru/` y referencias en
`content/audio-index.json`.

Estado actual:

- `content/audio-worklist.json` lista 1052 textos a locutar.
- `content/audio/ru/` es el destino limpio de audios finales.
- `content/audio/preview-piper-irina/` contiene pruebas de Piper no aprobadas.
- `content/audio/preview/` contiene comparativa Silero de varias voces.
- `content/audio/preview-kseniya-controlled/` contiene pruebas controladas de
  Silero `kseniya`.

Decision actual:

- Piper `ru_RU-irina-medium` no alcanza el nivel deseado.
- Silero `v5_5_ru`, voz `kseniya`, es mas clara, pero aun no es definitiva.
- Si hay acceso a GPU, probar XTTS/Coqui u otro modelo mas natural.
- No generar el corpus completo sin aprobar antes una tanda de 20-30 muestras.

No subir modelos, checkpoints, caches ni voces de referencia privadas.

## GitHub Pages

El service worker cachea solo la app y JSON esenciales. No precachear todo el
audio: los MP3 deben cargarse bajo demanda para no hacer pesada la instalacion.

Si se anade un nuevo modulo JS o JSON esencial, actualizar `service-worker.js`
y subir version de cache.

## Validacion local

Comandos utiles:

```bash
python3 -m http.server 8000
python3 -m json.tool content/competencies.json >/dev/null
python3 -m json.tool content/audio-index.json >/dev/null
python3 -m json.tool content/audio-worklist.json >/dev/null
```

Comprobar imports desde `assets/app.js`:

```bash
python3 - <<'PY'
import pathlib,re,sys
root=pathlib.Path('.').resolve(); seen=set(); missing=[]
pattern=re.compile(r"import(?:\\s+[^'\\\"]+from\\s+)?['\\\"]([^'\\\"]+)['\\\"]")
def walk(path):
    path=path.resolve()
    if path in seen or not path.exists(): return
    seen.add(path)
    text=path.read_text(encoding='utf-8')
    for spec in pattern.findall(text):
        if not spec.startswith('.'): continue
        target=(path.parent/spec).resolve()
        if target.is_dir(): target=target/'index.js'
        if not target.exists(): missing.append((str(path.relative_to(root)),spec,str(target.relative_to(root))))
        else: walk(target)
walk(root/'assets/app.js')
print('modules',len(seen)); print('missing',missing); sys.exit(1 if missing else 0)
PY
```

## Pendientes recomendados

1. Aprobar fuente de audio final.
2. Generar muestra de 20-30 audios con GPU y postproceso uniforme.
3. Sustituir previews por audios finales en `content/audio/ru/`.
4. Regenerar `content/audio-index.json`.
5. Ampliar ejercicios semanticos por funcion comunicativa.
6. Revisar visualmente en navegador real movil y escritorio.
7. Crear mas tarjetas explicativas con transcripcion y silaba tonica.
8. Mejorar sincronizacion con GitHub si se desea automatizar mas el guardado.

## Regla para futuras sesiones

Antes de cambiar codigo, leer:

1. `docs/agent-handoff.md`
2. `docs/architecture.md`
3. `docs/science-backed-learning.md`
4. `docs/methodology-implementation.md`
5. `docs/audio-gpu-handoff.md` si se trabaja con audio

Toda decision nueva debe preservar:

- arquitectura modular;
- funcionamiento en GitHub Pages;
- aprendizaje basado en evidencia;
- contenido centralizado;
- progreso medible por competencias;
- ausencia de duplicados innecesarios.
