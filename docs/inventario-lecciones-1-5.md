# Inventario de contenido: Lecciones 1–5

*Generado el 2026-07-07 tras completar generación de ejercicios, vocabulario y exámenes.*

---

## Resumen general

| Concepto | Cantidad |
|---|---|
| Lecciones con contenido completo | 5 (de 80) |
| Total ejercicios | 1.809 |
| Total lemas registrados | 388 |
| Estructuras gramaticales | 8 legacy + 0 nuevas en grammar.json |

---

## Vocabulario

| Lección | Lemas | Temas principales |
|---|---|---|
| 1 | 29 | Familia, objetos, animales, bebidas, identidad |
| 2 | 58 | Ciudad, lugares, casa, direcciones |
| 3 | 58 | Profesiones, personas, roles |
| 4 | 49 | Verbos de acción, rutina |
| 5 | 47 | Deportes, lectura, cultura, compras |

---

## Ejercicios por lección y tipo

### Lección 1 — Identificación básica (331 ejercicios)

| Tipo | Cantidad | Origen |
|---|---|---|
| text-input | 127 | foundation + drills + authored |
| error-correction | 38 | foundation + authored |
| multiple-choice | 111 | foundation + drills + authored |
| cloze | 34 | foundation + authored |
| listen-choice | 19 | foundation |
| token-build | 2 | foundation |

Desglose por función:
- Práctica: 73
- Drills de vocabulario: 116
- Gramática: 20
- Mixtos: 20
- Exámenes: 18 (5 vocab + 5 gram + 5 mixed + 3 full)
- Foundation heredado (exam_role = None): ~84

### Lección 2 — Género y ubicación (390 ejercicios)

| Tipo | Cantidad |
|---|---|
| text-input | 171 |
| multiple-choice | 155 |
| error-correction | 33 |
| cloze | 28 |
| token-build | 2 |
| listen-choice | 1 |

Desglose:
- Foundation heredado: ~84
- Drills de vocabulario: 232
- Gramática: 20
- Mixtos: 20
- Exámenes: 18

### Lección 3 — Pronombres y profesiones (388 ejercicios)

| Tipo | Cantidad |
|---|---|
| text-input | 173 |
| multiple-choice | 153 |
| error-correction | 31 |
| cloze | 28 |
| token-build | 2 |
| listen-choice | 1 |

Desglose:
- Foundation heredado: ~84
- Drills de vocabulario: 230
- Gramática: 20
- Mixtos: 20
- Exámenes: 18

### Lección 4 — Verbos 1ª conjugación (354 ejercicios)

| Tipo | Cantidad |
|---|---|
| text-input | 162 |
| multiple-choice | 129 |
| error-correction | 30 |
| cloze | 30 |
| token-build | 2 |
| listen-choice | 1 |

Desglose:
- Foundation heredado: ~84
- Drills de vocabulario: 196
- Gramática: 20
- Mixtos: 20
- Exámenes: 18

### Lección 5 — Objeto directo e играть в (346 ejercicios)

| Tipo | Cantidad |
|---|---|
| text-input | 156 |
| multiple-choice | 128 |
| error-correction | 30 |
| cloze | 28 |
| token-build | 2 |
| listen-choice | 2 |

Desglose:
- Foundation heredado: ~84
- Drills de vocabulario: 188
- Gramática: 20
- Mixtos: 20
- Exámenes: 18

---

## Exámenes

| Lección | Vocab | Gramática | Mixto | Completo | Total |
|---|---|---|---|---|---|
| 1 | 5 | 5 | 5 | 3 | 18 |
| 2 | 5 | 5 | 5 | 3 | 18 |
| 3 | 5 | 5 | 5 | 3 | 18 |
| 4 | 5 | 5 | 5 | 3 | 18 |
| 5 | 5 | 5 | 5 | 3 | 18 |

Los exámenes de vocabulario son tipo test (es→ru).  
Los de gramática y mixtos se heredan de los ejercicios authored.  
Los completos son texto libre de mayor dificultad.

---

## Archivos nuevos/modificados

| Archivo | Estado | Descripción |
|---|---|---|
| `content/vocabulary.json` | MODIFICADO | Expandido de 259 → 388 lemas |
| `content/vocab-drills.json` | NUEVO | 962 drills automáticos de vocabulario |
| `content/authored-grammar-exercises.json` | NUEVO | 100 ejercicios de gramática authored |
| `content/authored-mixed-exercises.json` | NUEVO | 100 ejercicios mixtos authored |
| `content/authored-exams.json` | NUEVO | 90 preguntas de examen (18/lección) |
| `content/exercises.json` | ACTUALIZADO | Merge de todos los anteriores (1.809 total) |
| `content/exercises.json.bak` | COPIA | Backup del original (500 ejercicios) |
| `assets/core/content-store.js` | MODIFICADO | Carga los 4 nuevos archivos JSON |
| `service-worker.js` | MODIFICADO | Cachea los 4 nuevos archivos, v47→v48 |

---

## Calidad pedagógica

- **Drills de vocabulario**: automatizados, tipo reconocimiento/recuerdo. Valor pedagógico medio (8–12 en escala del protocolo). Sirven como base mecánica.
- **Gramática (authored)**: 20/lección, escritos a mano con feedback específico. Siguen el protocolo estricto: prompt con contexto, respuesta esperada, feedback correctivo por error.
- **Mixtos (authored)**: 20/lección, integran vocabulario + gramática + situación comunicativa. Valor alto (16–18).
- **Exámenes**: seleccionados de los ejercicios authored más los de vocabulario. Apropiados para desbloqueo.

---

## Pendiente para revisión humana

1. **Feedback genérico en drills**: los drills automáticos tienen feedback simple ("Correcto" / "Incorrecto"). No son personalizados por error. Aceptable para vocabulario mecánico.
2. **Listenings**: solo hay 19+1+1+1+2 = 24 listen-choice del foundation heredado. Faltan listenings complejos (monólogos, diálogos, conversaciones) como especifica el plan.
3. **Calidad de los ejercicios authored**: deben revisarse visualmente en navegador para verificar prompts, expected, choices y feedback.
4. **Coherencia de targets**: los drills no apuntan a target_ids reales del sistema. Los ejercicios authored tienen targets inline pero sin conectar a vocabulary.json.
5. **Lecciones 6–80**: siguen vacías salvo vocabulary parcial (lecciones sueltas tienen algunos lemas registrados).


---

## Problemas detectados y correcciones (2026-07-07)

### 1. Estrategia de carga de ejercicios: single source of truth

**Problema:** `content/exercises.json` ya contenía el merge de todas las fuentes, pero `content-store.js` cargaba 4 fuentes adicionales (`vocab-drills.json`, `authored-grammar-exercises.json`, `authored-mixed-exercises.json`, `authored-exams.json`) y además `manual-exercises.json` por separado. Esto producía **57 duplicados en runtime** (los 57 ejercicios de `manual-exercises.json` aparecían dos veces).

**Solución adoptada:** `exercises.json` es el único source of truth para ejercicios. `content-store.js` carga solo `exercises.json` (y `normalizeExercises(exercises)` sin concatenar `manualExercises`). Los 4 archivos JSON nuevos se conservan como fuentes editables para regeneración, pero no se cargan en runtime.

**Archivos que cargan las fuentes en runtime:**
- `assets/core/content-store.js`: solo `exercises.json` (único source)
- `service-worker.js`: solo `exercises.json` (sin añadidos)

### 2. 962 vs 964 drills: diferencia explicada y corregida

**Causa:** dos lemas en la lección 3 — `студент` y `студентка` — comparten la traducción española `'estudiante'`. El generador de drills usaba `spanish` como clave para los ejercicios es→ru, saltando los del segundo por colisión.

**Corrección:** se añadieron 2 drills es→ru para `студентка` (uno test, uno abierto), con prompt desambiguado `"(mujer)"`. Total drills: **964** (4 por cada uno de los 241 lemas elegibles). También se añadió `lemmaId` a los 964 drills para trazabilidad.

### 3. Identificador de lema (lemmaId)

**Añadido:** campo `lemmaId` en todos los drills de `vocab-drills.json`, mapeando al `id` de `vocabulary.json`. Ejemplo: `"lemmaId": "vocab-003-studentka"`. Esto permite al SRS y al scheduler vincular el drill con el target de vocabulario concreto.

### 4. service-worker.js

Se revirtió a `paruski-v47` (sin cambios respecto al original). No se cachean los 4 archivos JSON auxiliares porque `exercises.json` ya los contiene.

### 5. Duplicados en runtime

| Estado | Antes | Después |
|---|---|---|
| Ejercicios cargados | 1.868 (con 57 duplicados) | 1.811 (0 duplicados) |
| Fuentes de carga | 2 (exercises.json + manual-exercises.json) | 1 (exercises.json) |

### 6. Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `find content data schemas -name '*.json' -exec jq empty {} +` | Todos los JSON válidos |
| `git diff --check` | Sin errores de whitespace |
| Resolución de imports (Python) | 1 módulo escaneado, 0 faltantes |
| IDs duplicados en exercises.json | 0 |
| Referencias a fuentes auxiliares en content-store.js | 0 |


---

## Corrección de selección de exámenes de vocabulario (2026-07-07)

### Síntoma

En localhost, el examen de vocabulario de la lección 1 mostraba siempre las mismas preguntas (variación casi nula entre intentos).

### Causa

`examExercisesForLesson()` en `assets/core/scheduler.js` filtraba los candidatos con `isSelectableExercise()`, que solo acepta:
- ejercicios con `source` que contenga `'manual-authored'`, o
- ejercicios con `source` que contenga `'generated'`

Los **964 drills de vocabulario** (`source='vocab-drill'`) quedaban **completamente excluidos** del pool de exámenes. Para la lección 1, solo quedaban **15 ejercicios authored** (`manual-u01-vocab-exam-001` a `015`), un subconjunto fijo de 14 lemas. El round-robin `selectExamQuestions()` podía reordenarlos, pero con 15 ítems y 5 preguntas por intento, la variación era casi imperceptible (siempre los mismos lemas).

Además, los 5 ejercicios `exam-vocab-l01-*` generados automáticamente (`source='exam-vocab'`) también quedaban excluidos porque su `source` no contiene `'manual-authored'` ni `'generated'`.

### Corrección aplicada

Un cambio quirúrgico en `examExercisesForLesson()`: si `examKind === 'vocabulary'`, se añaden al pool todos los ejercicios con `source === 'vocab-drill'` de esa lección que pasen `isUsableStaticExercise()`.

**Fichero modificado:** `assets/core/scheduler.js` (función `examExercisesForLesson`).

### Pool resultante

| Lección | Antes (solo authored) | Después (+ vocab-drills) |
|---|---|---|
| 1 | 15 (14 lemas) | 131 (29 lemas) |
| 2 | 5 | 237 |
| 3 | 5 | 237 |
| 4 | 5 | 201 |
| 5 | 5 | 193 |

### ¿Cómo se varía entre intentos?

`shuffleForExam()` ya usa `Date.now() + Math.random()` como seed, y `selectExamQuestions()` hace round-robin sobre buckets por `exam_question_type`/`primary`/`type`. Con 29+ lemas y 4 variaciones cada uno, hay suficiente masa crítica para que cada intento saque un conjunto distinto.

### Selección por lema único

`selectExamQuestions()` hace round-robin por `exam_question_type` (que es `lemmaId` para los drills y `targets.primary` para los manuales). Como cada lema aparece en buckets separados, el round-robin mezcla direcciones (ru→es, es→ru) y tipos (test, abierto). Adicionalmente, el fix no añade `unlock_exam=true` a los drills, así que no contaminan el resto de exámenes (gramática, mixtos, completos).

### Preservación de la arquitectura

- La web sigue siendo **estática**: no se genera contenido nuevo, solo se seleccionan ítems existentes.
- El examen de vocabulario sigue siendo **vocabulario puro de recuperación mecánica**, como permite la regla editorial.
- Los exámenes de **gramática, mixtos y completos** no se ven afectados (siguen usando solo ejercicios authored con `unlock_exam=true`).
- No se rebaja la exigencia: los drills son de reconocimiento/recuerdo de vocabulario, no de producción gramatical.
- No hay duplicados en runtime (el fix añade los drills al pool de selección, no los inyecta como examenes).

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `assets/core/scheduler.js` | `examExercisesForLesson()` añade vocab-drills al pool cuando `examKind === 'vocabulary'` |

### Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `find content data schemas -name '*.json' -exec jq empty {} +` | Todos los JSON válidos |
| `git diff --check` | Sin errores de whitespace |
| Script Python: 3 muestras de 5 con seeds distintas | Las 3 muestras son **diferentes** |
| Script Python: verificación de lemmaId único dentro de cada muestra | Sin repeticiones |
| Script Python: verificación de existencia en exercises.json | Todos los IDs existen |

### Cómo probar en localhost

1. `python3 -m http.server` desde la carpeta raíz
2. Navegar a Exámenes → Clase 01 → Vocabulario
3. Hacer 3 intentos. Comprobar que las preguntas **no** son siempre las mismas.
4. Confirmar que ninguna pregunta pide gramática, transformación, ni escucha.
5. Confirmar que los exámenes de Gramática y Mixto de la misma clase no se han alterado.


---

## Problemas detectados y correcciones (2026-07-07)

### 1. curriculum.json incompleto

**Problema:** `content/curriculum.json` contenía solo 6 campos (`id`, `number`, `title`, `status`, `closingExam`, `implementationNotes`). Faltaban 17 campos requeridos (`approxLevel`, `communicativeTheme`, `summary`, `communicativeObjectives`, etc.).

**Corrección:** Se ejecutó `scripts/build_curriculum.py` regenerando `content/curriculum.json` completo con los 23 campos especificados en el esquema. Las lecciones 1–5 reflejan contenido real; las lecciones 6–80 quedan como planificadas.

### 2. Falta la sección Currículo en la web

**Problema:** No existía una feature de currículo. El usuario no podía ver el plan de estudios de 80 lecciones.

**Corrección:** Se creó `assets/features/curriculum/index.js` y se registró en `assets/app.js` y `service-worker.js`. Se añadieron estilos en `assets/styles.css` (`.curriculum-view`, `.curriculum-card`, etc.) y se añadió `curriculum-view` a los views del shell. La sección carga `content/curriculum.json` en runtime, muestra las 80 lecciones con badges de estado, nivel, exámenes y contenido implementado, y permite expandir cada lección para ver todos sus campos.

### 3. Sección Progreso sin contexto

**Problema:** La sección Progreso mostraba métricas y competencias sin explicar qué significaban. Para un usuario nuevo, términos como "targets", "competencias", "calibración" y "dominio" no eran autoexplicativos.

**Corrección:** Se rediseñó `assets/features/progress/index.js`:
- Añade una sección "Qué significan estas métricas" con descripciones de cada métrica.
- En estado vacío (sin eventos), muestra una guía clara: qué es progreso, qué son targets, qué son competencias, qué son lecciones completadas, y cómo empezar.
- Añade una sección "Relación con el currículo" que enlaza a la sección Currículo.
- Preserva todos los datos útiles anteriores (métricas, competencias, debilidades).

### 4. Faltaba validador de currículo

**Problema:** No existía un script para verificar la integridad de `content/curriculum.json`.

**Corrección:** Se creó `scripts/validate_curriculum.py` que comprueba: 80 lecciones, números 1–80 secuenciales, IDs únicos, 23 campos requeridos, estados válidos, L1–5 no `planned`, L6–80 no `complete`, exámenes consistentes.

### 5. service-worker.js obsoleto

**Problema:** `service-worker.js` no cacheaba `assets/features/curriculum/index.js` ni `content/curriculum.json`. Seguía cacheando `content/manual-exercises.json` y `content/lexical-selection.json` que ya no se cargan en runtime.

**Corrección:** Se añadieron las rutas de currículo y se eliminaron las referencias a archivos auxiliares obsoletos.

### Archivos modificados en esta sesión

| Archivo | Cambio |
|---|---|
| `content/curriculum.json` | Regenerado con 23 campos (antes 6) |
| `assets/features/curriculum/index.js` | Nuevo — sección Currículo de 80 lecciones |
| `assets/features/progress/index.js` | Rediseñado con explicaciones y estado vacío |
| `assets/app.js` | Import y registro de `curriculumFeature` |
| `assets/styles.css` | Estilos de currículo y badges de estado |
| `assets/app-shell.css` | Añadido `curriculum-view` a la lista de views |
| `service-worker.js` | Añadido currículo, eliminados auxiliares obsoletos |
| `scripts/validate_curriculum.py` | Nuevo — validador de currículo |

### Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `find content data schemas -name '*.json' -exec jq empty {} +` | Todos los JSON válidos |
| `git diff --check` | Sin errores de whitespace |
| `python3 scripts/check_vocab_exam_selection.py` | **PASSED** — 10 muestras únicas de 10 |
| `python3 scripts/validate_curriculum.py` | **PASSED** — 80 lecciones OK |
| IDs duplicados en exercises.json | 0 |
| IDs duplicados en curriculum.json | 0 |

---

## Correcciones UX y bugs (2026-07-07)

### 1. Bug: `progress is not defined` en Progreso

**Problema:** La sección Progreso lanzaba `Uncaught ReferenceError: progress is not defined` al intentar renderizar con datos. `renderMetrics()` usaba `progress` como variable libre, pero `progress` solo existía en el closure de `mount()`. Esto rompía toda la sección cuando había datos de progreso.

**Corrección:** Se modificó la firma de `renderMetrics(summary, calibration, maxLesson, progress)` para recibir `progress` como parámetro explícito. Se eliminó la métrica "Último guardado" de `renderMetrics` que dependía de `progress`, moviendo su información al encabezado de la sección.

### 2. Bug: «Resolver luego» mostraba «Sesión cerrada»

**Problema:** Al pulsar "Resolver luego" en ejercicios de vocabulario, al finalizar la sesión se mostraba el mensaje "Sesión cerrada" que sonaba a error. La semántica correcta es que la sesión termina porque no quedan más ejercicios.

**Corrección:** Se cambió el mensaje en `renderDone()` de `'Sesión cerrada.'` a `'No quedan más ejercicios en esta sesión.'`. Además se añadieron tarjetas de recomendación al final de la sesión (repasar vencidos, reforzar debilidades, avanzar en clase actual, práctica libre).

### 3. Ejercicio ambiguo de «У ___ есть телефон»

**Problema:** El ejercicio `manual-u01-grammar-practice-002` (tipo cloze) mostraba `У ___ есть телефон.` y pedía "completa la forma correcta", esperando solo `тебя`. Pero sin especificar persona, cabían otras respuestas lógicas (`меня`, `нас`, `вас`, `него`, `неё`).

**Corrección:** El prompt se cambió de `"Gramática: completa la forma correcta."` a `"Gramática: completa con la persona correcta (tú) la forma posesiva."` desambiguando que el target es segunda persona singular.

### 4. Normalización de comillas editoriales

**Problema:** Los prompts de ejercicios mezclaban comillas latinas `«...»`, inglesas `"..."` y simples `'...'` sin criterio uniforme.

**Corrección:** Se creó una convención editorial: en castellano usar siempre `«...»`. Se aplicó automáticamente a todos los prompts de lecciones 1–5 (558 prompts normalizados). No se modificaron respuestas correctas.

### 5. Renombrado de sección «Clases» a «Material»

**Problema:** La sección `library` (id: `library`) se mostraba como "Clases" pero funcionaba como biblioteca/material pasivo de consulta.

**Corrección:** Se cambió su etiqueta a "Material" y título a "Contenido desbloqueado". Se movió a `navMode: 'secondary'`.

### 6. Nueva sección «Clases» interactiva

**Nueva feature:** `assets/features/classes/index.js`. Sección pedagógica que muestra las lecciones en orden, permite entrar a cada una para ver ejercicios disponibles, exámenes y estado, y navegar a práctica o exámenes. Registrada en `assets/app.js` como `classesFeature` con `order: 0, navMode: 'primary'`. Añadida a `service-worker.js`.

### 7. Mejora de recomendación post-sesión

**Mejora:** En `renderDone()` se añadieron tarjetas de "Plan recomendado para ahora" que muestran opciones contextuales: repasar vencidos, reforzar debilidades, avanzar en clase actual, práctica libre. Cada tarjeta explica por qué se recomienda.

### 8. Diferenciación práctica libre vs plan recomendado

**Mejora:** El panel lateral de la sesión guiada ahora distingue entre "Plan recomendado" (cuando `session.rationale.source` existe) y "Práctica libre". Añade una tarjeta explicativa con la composición de la sesión (debilidades, vencidos, lección activa).

### Archivos modificados en esta sesión

| Archivo | Cambio |
|---|---|
| `assets/features/progress/index.js` | Bugfix `progress is not defined`; añadido progreso por lecciones |
| `assets/features/guided-session/index.js` | Mensaje "Sesión cerrada" → "No quedan más ejercicios"; plan cards post-sesión; diferenciación libre/recomendado |
| `content/exercises.json` | Prompt desambiguado en `manual-u01-grammar-practice-002`; 558 prompts normalizados a comillas latinas |
| `assets/features/library/index.js` | Renombrado de "Clases" a "Material" |
| `assets/features/classes/index.js` | **Nuevo** — sección Clases interactiva |
| `assets/app.js` | Import y registro de `classesFeature` |
| `assets/styles.css` | Estilos para plan-cards (`.plan-card`, `.plan-card-grid`) |
| `assets/app-shell.css` | Añadido `.classes-view` |
| `service-worker.js` | Añadida ruta de `classes/index.js` |

### Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `find content data schemas -name '*.json' -exec jq empty {} +` | ✅ Todos los JSON válidos |
| `git diff --check` | ✅ Sin errores de whitespace |
| `python3 scripts/check_vocab_exam_selection.py` | ✅ PASSED |
| `python3 scripts/validate_curriculum.py` | ✅ PASSED |
| IDs duplicados en exercises.json | ✅ 0 |

### Qué probar en localhost

1. **Progreso:** Abrir sección Progreso con y sin datos. Verificar que no hay error de consola. Comprobar que se ve el desglose por lecciones.
2. **Resolver luego:** Hacer ejercicios, usar "Resolver luego", llegar al final y ver que dice "No quedan más ejercicios" y aparecen las tarjetas de recomendación.
3. **Ejercicio de «У тебя есть телефон»:** Buscar el ejercicio en la sesión guiada y verificar que el prompt especifica "(tú)".
4. **Comillas:** Verificar que los prompts ya no tienen `"..."` ni `'...'` sueltos sin `«...»`.
5. **Clases:** Abrir la nueva sección "Clases" (primer botón de navegación). Debe mostrar lecciones 1–5 como accesibles, con botón "Entrar". Al entrar, ver ejercicios disponibles y botones de practicar/exámenes.
6. **Material:** Verificar que la sección antes llamada "Clases" ahora se llama "Material".
7. **Recomendación:** Terminar una sesión y verificar que aparecen las tarjetas con recomendaciones contextuales.
8. **Panel lateral:** Verificar que dice "Plan recomendado" o "Práctica libre" según el caso.

### Pendiente

- Generar ejercicios para lecciones 6–80 (excluido de esta sesión).
- Revisar diseño responsive en móvil.
- Mejorar cobertura de tests de integración en navegador.

---

## Corrección de contraste, Clases guiadas y Progreso visual (2026-07-08)

### 1. Problema de contraste: texto blanco sobre fondo blanco

**Problema:** Las tarjetas de plan recomendado (`plan-card`) usaban `background: var(--surface, #fff)` que resolvía a blanco sobre el tema oscuro, haciendo invisible el texto.

**Corrección:** En `assets/styles.css`, las `plan-card` ahora usan `background: var(--panel)` y `border: 1px solid var(--line)`, consistentes con el tema oscuro. También se aseguró que `h4` use `color: var(--text)`.

### 2. Texto incorrecto «examen(es)» y pluralizaciones

**Problema:** Se usaba `${count} examen(es)` que es inaceptable editorialmente.

**Corrección:** Se reemplazó por pluralización correcta:
- 1 → «1 bloque de evaluación»
- 2+ → «N bloques de evaluación»

Ídem para «objetivo(s)» (→ «objetivo» / «objetivos») y «ejercicio(s)» (→ «ejercicio» / «ejercicios»). Archivos corregidos: `assets/features/classes/index.js`, `assets/features/progress/index.js`, `assets/features/guided-session/index.js`.

### 3. Clases como flujo guiado real

**Problema:** La sección Clases era una pantalla de enlaces a otras secciones, sin experiencia interactiva propia. Algunos enlaces estaban rotos.

**Corrección:** Se reescribió `assets/features/classes/index.js`:
- **Lista de clases:** muestra lecciones 1–80 con botón «Comenzar clase» para las accesibles.
- **Al comenzar:** selecciona hasta 12 ejercicios variados de la lección (vocabulario, gramática, mixtos) y los presenta secuencialmente como un flujo guiado.
- **Cada ejercicio:** se renderiza con el mismo sistema de `registry.getExercise()` que la sesión guiada, con feedback inmediato y botón «No sé».
- **Barra de progreso:** muestra el avance dentro de la clase (step N de total).
- **Checkpoint:** al terminar todos los ejercicios, muestra resumen y opciones: seguir practicando (reinicia con nuevos ejercicios), ir a exámenes, o elegir otra clase.
- **Lecciones 6–80:** no tienen botón de práctica, solo indicador «Planificada».
- Sin enlaces rotos: toda la navegación usa `data-start-lesson-flow` → `startFlow()` o `context.showFeature()`.

### 4. Progreso como recorrido visual con estaciones

**Problema:** Progreso era una tabla técnica de métricas y competencias sin contexto visual. El alumno no entendía dónde estaba ni qué significaban los números.

**Corrección:** Se reescribió `assets/features/progress/index.js`:
- **Resumen superior:** muestra lecciones completadas, pendientes, y «Vas por la lección X».
- **Recorrido visual (journey map):** 80 estaciones circulares con colores de estado: completada (verde), actual (dorado), desbloqueada, necesita repaso (rojo), bloqueada, planificada.
- **Leyenda:** explicación de cada color de estación.
- **Próxima recomendación:** tarjeta contextual que recomienda examen, práctica de refuerzo o avance según el estado del alumno.
- **Fortalezas:** competencias con dominio ≥ 72 %.
- **Carencias:** objetivos débiles y competencias a reforzar.
- **Métricas detalladas:** como sección secundaria, con explicación de cada métrica.
- **Estado vacío:** guía completa de qué es progreso, targets y cómo empezar.
- Sin error `progress is not defined` (ya corregido en sesión anterior).

### 5. Archivos modificados

| Archivo | Cambio |
|---|---|
| `assets/features/classes/index.js` | Reescrito como flujo guiado interactivo |
| `assets/features/progress/index.js` | Reescrito como recorrido visual con estaciones |
| `assets/features/guided-session/index.js` | Pluralización de textos corregida |
| `assets/styles.css` | Contraste plan-cards; añadidos estilos journey map y leyenda |

### 6. Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `find content data schemas -name '*.json' -exec jq empty {} +` | ✅ |
| `git diff --check` | ✅ |
| `python3 scripts/validate_curriculum.py` | ✅ PASSED |
| `python3 scripts/check_vocab_exam_selection.py` | ✅ PASSED |
| `python3 scripts/check_editorial_quality.py` | ✅ PASSED |
| IDs duplicados en exercises.json | ✅ 0 |

### 7. Qué probar en localhost

1. **Contraste:** terminar una sesión, verificar que las tarjetas de «Plan recomendado» tienen fondo oscuro y texto legible.
2. **Clases guiadas:** ir a la nueva sección «Clases» (primer botón). Hacer clic en «Comenzar clase» de lección 1. Verificar que aparecen ejercicios secuenciales con barra de progreso. Usar «No sé» y «Comprobar». Al terminar, ver checkpoint con opciones.
3. **Examen(es):** en la lista de clases, verificar que no aparece «examen(es)» sino «1 bloque de evaluación» o «N bloques de evaluación».
4. **Progreso como recorrido:** abrir Progreso. Verificar que se ve el mapa de 80 estaciones con colores. Si hay datos, la estación actual debe estar destacada en dorado. Si no hay datos, debe mostrar estado vacío.
5. **Recomendación:** en Progreso, verificar que la tarjeta de próxima recomendación contextual funciona y los botones llevan a la sección correcta.
6. **Resolver luego:** hacer ejercicio, pulsar «Resolver luego», verificar que se muestra feedback neutral y al hacer clic en «Continuar» pasa al siguiente ejercicio.
