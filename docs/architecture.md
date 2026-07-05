# Arquitectura objetivo de Paruski

Para continuar el proyecto desde cero, leer primero `docs/agent-handoff.md`.

Este documento fija la estructura objetivo de la web antes de ampliar funciones. La prioridad es que Paruski sea una app guiada, escalable y mantenible para llevar al alumno desde primer contacto hasta A1-A2 inicial sin obligarle a navegar manualmente.

## Principios

1. La experiencia principal es guiada. La app decide que explicar, que practicar y cuando repasar.
2. La biblioteca es secundaria. Vocabulario, gramatica, fichas y ejemplos se consultan al ritmo desbloqueado por progreso.
3. El progreso se calcula por objetivos de aprendizaje, no por pantallas visitadas.
4. La repeticion espaciada y la recuperacion activa son comportamiento central, no una funcion opcional.
5. Cada tipo de ejercicio debe entrenar ruso real: comprension, produccion, transformacion, escucha o discriminacion gramatical.
6. La arquitectura debe crecer por registros y contratos, evitando duplicar normalizacion, voz, estado, calendario o renderizado comun.
7. La web sigue siendo estatica y compatible con GitHub Pages.
8. El contenido publicado debe ser material didactico derivado, estructurado y versionable.

## Capas

```text
assets/core/
  app-context.js       arranque, registro y dependencias compartidas
  content-store.js    carga, valida y normaliza contenido
  learner-model.js    dominio, errores, desbloqueos, niveles y rachas
  scheduler.js        seleccion de tareas y repeticion espaciada
  event-log.js        eventos de aprendizaje y agregados
  competency-tagger.js etiquetado de ejercicios por competencias
  storage.js          localStorage, import/export y sincronizacion base
  audio.js            audio grabado, indice y fallback de navegador
  registry.js         registro de features y tipos de ejercicio

assets/features/
  guided-session/     flujo principal llevado por la app
  library/            consulta desbloqueada de vocabulario, gramatica y fichas
  calendar/           historico y plan futuro de repasos
  progress/           niveles, metricas, fortalezas y debilidades
  sync/               guardado en repositorio
  settings/           datos, exportacion y configuracion

assets/exercises/
  text-input/
  cloze/
  multiple-choice/
  dictation/
  listen-choice/
  transform/
  production-prompt/
```

La regla es que `features/` y `exercises/` pueden crecer sin modificar el nucleo, salvo cuando se cambie un contrato versionado.

## Contrato de feature

Cada seccion visible se registra con un contrato comun:

```js
{
  id: 'library',
  label: 'Biblioteca',
  order: 20,
  navMode: 'secondary',
  isAvailable({ learner }) {},
  mount(container, context) {},
  update(context) {}
}
```

`guided-session` es la unica feature primaria. Las demas son soporte, consulta o configuracion.

## Contrato de ejercicio

Cada tipo de ejercicio se registra asi:

```js
{
  type: 'dictation',
  modalities: ['audio', 'text'],
  canHandle(exercise) {},
  render(exercise, context) {},
  evaluate(answer, exercise, context) {},
  getTargets(exercise) {}
}
```

El scheduler solo elige ejercicios por metadatos. No debe conocer detalles de renderizado ni evaluacion de cada tipo.

## Modelo de contenido

```text
content/course.json       niveles, unidades, lecciones, prerequisitos y desbloqueos
content/targets.json      palabras, estructuras, casos, patrones y habilidades
content/cards.json        fichas explicativas, transcripcion, silaba tonica y notas
content/examples.json     ejemplos ligados a targets
content/exercises/*.json  ejercicios curados o parametrizados por nivel/unidad
content/competencies.json taxonomia de competencias observables
content/audio-index.json  texto normalizado -> archivo de audio
```

Campos minimos de un target:

```json
{
  "id": "ru-word-kniga",
  "level": "A1",
  "lesson": 19,
  "kind": "vocabulary",
  "text": "книга",
  "translation": "libro",
  "card_id": "card-ru-kniga",
  "tags": ["sustantivo", "femenino"],
  "difficulty": 0.25,
  "importance": 0.8,
  "prerequisites": [],
  "unlocks": []
}
```

Campos minimos de una ficha:

```json
{
  "id": "card-ru-kniga",
  "target_id": "ru-word-kniga",
  "text": "книга",
  "translation": "libro",
  "stress_marked": "кни́га",
  "transcription": "kni-ga",
  "stress_syllable": "кни",
  "short_explanation": "Sustantivo femenino basico. En acusativo cambia a книгу.",
  "examples": ["Это книга.", "Я читаю книгу."]
}
```

## Modelo del alumno

El estado no debe ser una lista de pantallas visitadas. Debe guardar dominio por target y habilidad:

```json
{
  "target_id": "ru-word-kniga",
  "skills": {
    "recognition": 0.8,
    "production": 0.45,
    "listening": 0.25,
    "grammar_transfer": 0.4
  },
  "attempts": 8,
  "correct": 5,
  "wrong": 3,
  "last_seen_at": "2026-07-05T12:00:00.000Z",
  "next_due_at": "2026-07-07T00:00:00.000Z",
  "error_types": {
    "case_form": 2
  }
}
```

## Scheduler

El scheduler produce una cola de tareas, no solo un ejercicio suelto.

Entrada:

- targets desbloqueados;
- targets nuevos;
- historial de eventos;
- dominio por habilidad;
- errores recurrentes;
- fecha de ultimo repaso;
- dificultad e importancia;
- disponibilidad de audio;
- objetivo diario y duracion de sesion.

Salida:

```json
{
  "session_id": "session-2026-07-05",
  "estimated_minutes": 10,
  "tasks": [
    { "kind": "explain", "target_id": "ru-case-accusative" },
    { "kind": "exercise", "exercise_type": "cloze", "target_ids": ["ru-word-kniga"] },
    { "kind": "exercise", "exercise_type": "dictation", "target_ids": ["ru-word-kniga"] },
    { "kind": "review", "target_ids": ["ru-pattern-eto"] }
  ]
}
```

La seleccion debe favorecer recuperacion activa y espaciamiento:

- lo fallado vuelve antes;
- lo acertado se retrasa;
- lo nuevo entra en dosis pequenas;
- lo auditivo se programa cuando hay audio disponible;
- los ejercicios se intercalan para evitar memorizacion por bloque;
- los errores recurrentes generan microexplicaciones antes de practicar.

## Desbloqueo A1-A2

El desbloqueo se basa en competencia demostrada:

```text
A0 Primer contacto
  letras, sonidos frecuentes, frases basicas, esto/es/no, familia y objetos

A1 Base cotidiana
  preguntas, presente, posesion, lugar, objetos directos, rutina, movimiento simple

A1+ Casos y produccion
  acusativo, preposicional, genitivo basico, frases con mas estructura

A2 inicial
  aspecto verbal, matices de movimiento, comprension y produccion mas flexible
```

Cada bloque declara:

- targets obligatorios;
- precision minima reciente;
- dominio minimo por produccion y comprension;
- errores bloqueantes;
- material que desbloquea.

## Biblioteca

La biblioteca consulta el mismo `content-store` que la sesion guiada. Debe ofrecer:

- vocabulario desbloqueado;
- gramatica desbloqueada;
- fichas con transcripcion, silaba tonica, explicacion breve y ejemplos;
- busqueda limitada por desbloqueo;
- opcion secundaria de ver material avanzado si se decide permitirlo.

No debe duplicar listas ni tener su propio modelo de datos.

## Calendario

El calendario se alimenta de `event-log` y `scheduler`.

Debe mostrar:

- historico diario: targets practicados, aciertos, errores, audio, tiempo y notas;
- plan futuro: repasos vencidos, proximos repasos, bloques nuevos y motivos;
- explicacion de por que algo aparece planificado.

El futuro se recalcula desde estado y reglas, no se mantiene como calendario manual.

## Engagement

Las mecanicas de rutina deben reforzar aprendizaje real:

- objetivo diario pequeno;
- racha sobria;
- feedback inmediato;
- hitos por nivel;
- progreso visible por habilidad;
- mensajes de siguiente paso claros;
- sesiones cortas que terminan con sensacion de avance;
- correccion de errores frecuentes sin castigo visual excesivo.

No se deben incentivar respuestas rapidas si reducen calidad.

## Sincronizacion

El progreso puede guardarse en el repositorio:

```text
data/progress.json
data/events/YYYY-MM-DD.ndjson
data/review-queue.json
data/summaries/
```

El progreso de aprendizaje no se considera sensible. Aun asi, las claves de escritura no se versionan en el repositorio por higiene tecnica; se introducen en el navegador cuando haga falta sincronizar.

## Audio

El audio grabado tiene prioridad:

```text
content/audio/ru/*.mp3
content/audio-index.json
```

`audio.js` resuelve:

1. archivo local comprimido;
2. banco embebido temporal;
3. fallback SpeechSynthesis.

Los ejercicios auditivos solo se programan como tarea principal cuando el target tenga audio grabado o cuando se acepte explicitamente el fallback.

## Matriz de cumplimiento

| Criterio formal | Decision de arquitectura |
|---|---|
| Guiar al alumno sin exigir navegacion | `guided-session` es feature primaria y consume cola del `scheduler`. |
| Llevar hasta A1-A2 | `course.json` define niveles, prerequisitos y desbloqueos por competencia. |
| Consultar vocabulario y gramatica | `library/` consulta `content-store` y respeta desbloqueos. |
| Consultar al ritmo del progreso | `learner-model` decide disponibilidad por target y nivel. |
| Fichas con transcripcion, silaba tonica y explicacion | `cards.json` es entidad propia enlazada a targets. |
| Repeticion espaciada | `scheduler` usa `next_due_at`, historial, dificultad, importancia y errores. |
| Recuperacion activa | Los ejercicios se seleccionan por produccion, escucha, transformacion y reconocimiento util. |
| Engagement y rutina | `progress/`, `calendar/` y `guided-session` muestran objetivo diario, racha, hitos y siguiente paso. |
| Ejercicios variados | `assets/exercises/*` crece por contrato. |
| Evitar ejercicios sobre el metacontenido del curso | El contrato exige targets linguisticos; no se aceptan ejercicios tipo "en que leccion aparece X". |
| Calendario pasado y futuro | `calendar/` combina `event-log` y plan recalculado por `scheduler`. |
| Personalizacion por fortalezas y dificultades | `learner-model` guarda dominio por habilidad y errores recurrentes. |
| Personalizacion por tiempo entre repasos | `scheduler` prioriza antiguedad y vencimiento. |
| Guardado en nube/repositorio | `storage` y `sync/` escriben progreso, eventos y cola en `data/`. |
| Audio local comprimido | `audio-index.json` apunta a `content/audio/ru/*.mp3`. |
| Evitar duplicados innecesarios | Normalizacion, audio, estado, eventos, scheduling y almacenamiento viven en `core/`. |
| Escalar secciones y funciones | Nuevas features se registran por contrato sin tocar el nucleo. |
| Escalar tipos de ejercicio | Nuevos ejercicios se registran por contrato sin tocar scheduler ni sesion guiada. |
| Compatible con GitHub Pages | Todo es estatico: HTML, JS, JSON y audio versionado. |

## Reglas de modificacion

1. Si una mejora necesita datos nuevos, primero se actualiza el esquema.
2. Si una mejora necesita una pantalla nueva, se crea feature registrada.
3. Si una mejora necesita un ejercicio nuevo, se crea tipo registrado.
4. Si dos modulos repiten logica de dominio, estado, audio, normalizacion o fechas, la logica debe moverse a `core/`.
5. La sesion guiada nunca debe depender de ids de DOM internos de otras features.
6. La biblioteca nunca debe tener una copia paralela del contenido.
7. El calendario futuro nunca debe guardarse como verdad manual; se deriva del scheduler.

## Migracion desde el estado actual

1. Crear `core/content-store.js`, `core/audio.js`, `core/event-log.js` y `core/learner-model.js`.
2. Crear `core/scheduler.js` y adaptar la sesion guiada para consumir tareas.
3. Convertir materiales actuales a `targets`, `cards`, `examples` y `course`.
4. Migrar ejercicios existentes al contrato comun.
5. Rehacer biblioteca y calendario sobre core.
6. Reubicar sincronizacion sobre `storage`.
7. Retirar modulos duplicados cuando sus funciones esten cubiertas.
