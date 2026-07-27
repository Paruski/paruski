# Currículo de 80 lecciones

*Actualizado: 2026-07-07*

---

## Estructura general

El curso Paruski consta de **80 lecciones secuenciales** desde A0 hasta transición a B1.

### Tramos de nivel

| Tramo | Lecciones | Nivel | Enfoque |
|---|---|---|---|
| 1–5 | 5 | A0 | Implementado. Contenido real: 1.811 ejercicios, exámenes, vocabulario. |
| 6–10 | 5 | A0→A1 | Planificado. |
| 11–28 | 18 | A1 | Planificado. |
| 29–40 | 12 | A1→A2 | Planificado. |
| 41–60 | 20 | A2 | Planificado. |
| 61–80 | 20 | A2→B1 | Planificado. |

### Estados de lección

- **complete**: Lecciones 1–5. Tienen ejercicios reales, vocabulario, exámenes y contenido authored.
- **planned**: Lecciones 6–80. Currículo pedagógicamente diseñado pero sin contenido implementado.
- **partial**: Disponible para lecciones con contenido incompleto.
- **needs_review**: Disponible para lecciones que necesitan revisión editorial.

### Formato de cada lección

Cada lección en `content/curriculum.json` tiene 23 campos:

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único (`lesson_001`–`lesson_080`) |
| `number` | int | Número de lección (1–80) |
| `title` | string | Título descriptivo |
| `approxLevel` | string | Nivel aproximado (A0, A0–A1, A1, A1–A2, A2, A2–B1) |
| `status` | string | `complete`, `partial`, `planned`, `needs_review` |
| `communicativeTheme` | string | Tema comunicativo principal |
| `summary` | string | Resumen de una línea |
| `communicativeObjectives` | string[] | Objetivos comunicativos |
| `grammarObjectives` | string[] | Objetivos gramaticales |
| `activeVocabularyThemes` | string[] | Campos semánticos del vocabulario activo |
| `passiveVocabularyThemes` | string[] | Vocabulario pasivo/receptivo |
| `newStructures` | string[] | Estructuras gramaticales nuevas |
| `recycledStructures` | string[] | Estructuras recicladas de lecciones anteriores |
| `cases` | string[] | Casos gramaticales practicados |
| `skills` | string[] | Habilidades (production, recognition, comprehension, etc.) |
| `typicalErrorsForSpanishSpeakers` | string[] | Errores típicos de hispanohablantes |
| `criticalTargets` | object[] | Targets críticos para desbloqueo |
| `expectedProduction` | string[] | Qué debe poder producir el alumno |
| `expectedComprehension` | string[] | Qué debe poder comprender |
| `closingExam` | object | `{vocabulary, grammar, mixed, full}` — true/false |
| `unlockCriteria` | string | Criterio para desbloquear la siguiente lección |
| `previousLessonLinks` | string[] | Enlaces a lecciones anteriores |
| `implementationNotes` | string | Notas de implementación |

### Lecciones implementadas (1–5)

| # | Título | Temas principales |
|---|---|---|
| 1 | Esto es; quién/qué; familia y objetos | Identificación básica, familia, objetos, bebidas, animales |
| 2 | Género y ubicación | он/она/оно, здесь/там, ciudad, casa, direcciones |
| 3 | Pronombres y profesiones | Pronombres personales, profesiones, personas, roles |
| 4 | Verbos 1ª conjugación | Verbos de acción, rutina, 1ª conjugación |
| 5 | Objeto directo e играть в | Acusativo inanimado, играть в + deporte/juego |

Cada una tiene:
- ~330–390 ejercicios
- 4 exámenes (vocabulario, gramática, mixto, completo)
- Vocabulario propio (29–58 lemas por lección)

### Lecciones planificadas (6–80)

Ver `content/curriculum.json` para la descripción completa de cada lección. El currículo cubre progresivamente:

- **6–20**: Segunda conjugación, plural, adjetivos, posesión, pasado, prepositivo, acusativo.
- **21–40**: Futuro, números, preferencias, verbos de movimiento (идти/ходить, ехать/ездить), modalidad, comparación.
- **41–60**: Genitivo (ausencia, cantidad, pertenencia), dativo, instrumental, aspecto verbal inicial.
- **61–80**: Aspecto verbal completo (perfectivo/imperfectivo), subordinadas, modalidad aspectual, síntesis operacional.

## Relación con otros sistemas

### Currículo vs. Ejercicios

El currículo describe *qué* enseña el curso. Los ejercicios en `content/exercises.json` son el contenido practicable. Las lecciones 1–5 tienen ambos; las lecciones 6–80 solo tienen currículo.

### Currículo vs. Progreso

El currículo es el plan de estudios (oferta). El progreso mide lo que el alumno ha aprendido (demanda). No son lo mismo. La sección Progreso incluye enlaces cruzados al currículo.

### Currículo vs. Exámenes

El campo `closingExam` indica si una lección tiene exámenes implementados. Para lecciones 1–5, los exámenes están en `content/exercises.json` con `unlock_exam=true`. Para lecciones 6–80, `closingExam` es `false` en todos los tipos.

## Cómo añadir contenido a una lección planificada

1. Marcar la lección como `partial` en `content/curriculum.json`.
2. Añadir ejercicios a `content/exercises.json`.
3. Añadir exámenes con `unlock_exam=true` y `exam_kind` correspondiente.
4. Actualizar `closingExam` en el currículo.
5. Actualizar `implementationNotes`.
6. Ejecutar `python3 scripts/validate_curriculum.py`.

## Cómo ver en localhost

1. `python3 -m http.server` desde la raíz.
2. Abrir `http://localhost:8000`.
3. Navegar a **Currículo** en el menú principal.
4. Expandir cualquier lección para ver todos los campos.
5. Los badges de estado (Completa/Planificada) diferencian contenido real de planificado.
