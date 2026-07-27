# Modelo SRS y de dominio en Paruski

## Visión general

Paruski implementa un sistema de Repetición Espaciada (SRS) simplificado basado en principios de Half-Life Regression (Settles & Meeder, 2016) adaptado para recursos estáticos de front-end. Cada **target** (unidad lingüística: palabra de vocabulario o estructura gramatical) tiene su propio modelo de dominio que se actualiza con cada ejercicio.

## Targets

Un target es la unidad mínima de contenido lingüístico que Paruski modela:
- **Vocabulario**: una palabra rusa (ej. «телефон», «книга»).
- **Gramática**: una estructura o patrón (ej. «у + GEN + есть», «это + N»).

Cada ejercicio tiene `target_ids` que lo vinculan a uno o varios targets. Los ejercicios mixtos pueden tener múltiples targets, y cada uno recibe crédito limitado para evitar sobrecontar.

## Campos del target state

Cada target almacena en `progress.targets[targetId]`:

| Campo | Tipo | Descripción |
|---|---|---|
| `mastery` | float 0-1 | Media del dominio en todas las habilidades practicadas |
| `stability` | float | Días aproximados antes de olvidar (estimación) |
| `attempts` | int | Total de intentos |
| `correct` | int | Aciertos |
| `wrong` | int | Fallos |
| `lapses` | int | Fallos acumulados |
| `critical_failures` | int | Fallos en targets críticos (ej. estructura de posesión mal entendida) |
| `last_seen_at` | ISO date | Última vez que se practicó |
| `last_correct_at` | ISO date | Última vez que se acertó |
| `last_result` | bool | Último resultado |
| `last_skill_mode` | string | Última habilidad practicada |
| `next_due_at` | ISO date | Próximo repaso programado |
| `interval_days` | int | Intervalo actual entre repasos (días) |
| `skills` | map `{skill: score}` | Dominio por habilidad |
| `history_by_skill` | map `{skill: {attempts, correct, wrong, last_seen_at}}` | Histórico desglosado |
| `error_types` | map `{errorType: count}` | Tipos de error cometidos |
| `deferred` | int | Veces que se pospuso |
| `last_response_time_ms` | int | Tiempo de respuesta del último intento |
| `last_option_used` | string | Última acción (responder, no_se, resolver_luego) |

## Mastery

Se calcula como la media aritmética del dominio en todas las habilidades (`skills`) practicadas para ese target. Cada habilidad tiene su propio score (0-1). Si un target se practica solo con reconocimiento, su mastery reflejará eso; si luego se practica con producción, ambas habilidades contribuyen.

No se infla: un target no puede tener mastery > 0.95 aunque se practique muchas veces, y un target nuevo empieza en 0.

## Stability

Es una estimación del número de días antes de que el recuerdo empiece a degradarse. Se actualiza así:
- **Acierto rápido y con confianza**: `stability = intervalDays * 0.7 + prevStability * 0.3`
- **Acierto lento o dudoso**: aumenta menos
- **Error**: `stability = prevStability * 0.3` (retrocede)

Stability se usa para priorizar repasos: targets con poca estabilidad y mucho tiempo desde última práctica tienen alta prioridad.

## Due / Review scheduling

El campo `next_due_at` determina cuándo debe repasarse un target. Se calcula como:

- **Acierto rápido** (respuesta < 7s con confianza > 0.7): `intervalo = prevInterval * (1.4 + confidence * 0.6)`, limitado a 60 días.
- **Acierto normal**: `intervalo = prevInterval * (1.2 + confidence * 0.3)`, limitado a 30 días.
- **Acierto tras pista o lento**: incremento mínimo.
- **Error**: `intervalo = 1 día` (revisar mañana).
- **"No sé"**: `intervalo = 0` (revisar hoy en la misma sesión).
- **Ejercicio nuevo acertado**: `intervalo = 2 días` si respuesta rápida, 1 si no.

Un target está **vencido** si `next_due_at <= today`. El scheduler prioriza targets vencidos.

## Evidence weights

El peso de la evidencia varía según el tipo de ejercicio. Esto asegura que las formas de práctica más exigentes contribuyan más al dominio:

| Tipo de ejercicio | Peso base |
|---|---|
| multiple-choice / choice-grid | 0.4 |
| listen-choice | 0.5 |
| cloze / text-input / dictation | 0.7 |
| token-build | 0.75 |
| error-correction | 0.85 |
| transform | 0.9 |
| production-prompt | 0.95 |

**Modificadores**:
- Si implica transferencia o generalización: ×1.15
- Si es examen: ×1.2
- Si es de reconocimiento puro: ×0.6
- Si es respuesta rápida (< 7s): ×1.3
- Si es respuesta lenta (≥ 18s): ×0.6
- Si es producción (transform, error-correction, production-prompt): ×1.2 adicional

## Cómo se trata cada tipo de respuesta

| Acción | Efecto en mastery | Efecto en stability | next_due_at |
|---|---|---|---|
| Acierto rápido (< 7s) | +más (×1.3) | Aumenta | Multiplica intervalo |
| Acierto normal | +moderado | Aumenta poco | +1-3 días |
| Acierto lento (≥ 18s) | +poco (×0.6) | Mínimo | +1 día |
| Error | -0.18 × evidenceWeight | Reduce (×0.3) | Mañana |
| "No sé" | -0.25 (penalización fuerte) | Reduce más | Hoy (misma sesión) |
| "Resolver luego" | Sin cambio | Sin cambio | +1 día |
| **Fallo crítico** | -0.18 × 1.5 | Reduce más | Mañana + `critical_failures++` |
| Acierto en producción | +ganancia extra ×1.2 | Aumenta más | Según velocidad |
| Acierto en opción múltiple | Peso 0.4 | Aumenta poco | Intervalo corto |

## Exámenes

Los ejercicios de examen tienen peso ×1.2. Además:

- El examen tiene un umbral de aciertos (90% por defecto).
- Si hay **fallos críticos** (preguntas con `diagnostics.criticalErrors`), el examen no se considera superado aunque se alcance el umbral.
- `updateExamProgress()` registra `recent_critical_wrong`. Si > 0 en la ventana actual, `passed = false`.
- Tras un fallo crítico, `lessonReadyForExam()` comprueba si targets críticos de la lección tienen `critical_failures > 0 && mastery < 0.58` y, si es así, devuelve la lección para reparación incluso si antes estaba aprobada.

## Cómo se evita sobrecontar en ejercicios mixtos

Los ejercicios mixtos tienen múltiples `target_ids`. Cada target se actualiza individualmente con el mismo resultado (acierto/fallo). Sin embargo:

- El peso de evidencia `evidenceWeight` está limitado a un máximo de 1.0 por ejercicio, independientemente del número de targets.
- Cada target recibe la misma ganancia/pérdida base, pero el mastery de cada uno se actualiza según su propio estado previo.
- No hay multiplicación artificial: acertar un ejercicio mixto con 3 targets no cuenta como "3 aciertos".

## Diferencias por tipo de contenido

- **Vocabulario puro**: pesos bajos (0.4 para reconocimiento, 0.7 para producción). No usa fallos críticos salvo para lemas explícitamente críticos.
- **Gramática**: pesos medios-altos (0.7-0.9). Los errores de estructura central pueden ser fallos críticos.
- **Mixto**: pesos altos (0.85-0.95). Implica transferencia, que tiene modificador ×1.15.
- **Reconocimiento**: peso reducido (×0.6). No se considera evidencia de dominio productivo.
- **Producción**: peso completo. Es la evidencia más fuerte.
- **Transferencia**: modificador ×1.15. Evalúa si el alumno aplica lo aprendido en contextos nuevos.

## Estados de lección

| Estado | Condición |
|---|---|
| No empezada | Sin evidencia de práctica ni examen |
| En aprendizaje | Clase leída o pocos ejercicios |
| Practicada | Suficiente evidencia pero dominio < umbral |
| Lista para examen | Targets críticos ≥ mastery umbral |
| Superada (`exam_passed`) | Exámenes aprobados sin fallos críticos |
| Necesita reparación | Superada antes pero `critical_failures` recientes > 0 y mastery < 0.58 |

## Limitaciones actuales

- No hay HLR completo (regresión logística). Stability es una heurística lineal.
- No hay modelo de "olvido" explícito: el scheduler asume que el recuerdo decae linealmente entre repasos.
- No hay diferenciación por modalidad de presentación (visual vs auditiva).
- El modelo no distingue entre "no sabe" y "no quiso responder" salvo por `optionUsed`.
- No hay modelo de interferencia entre targets similares.
- Los pesos de evidencia son fijos por tipo de ejercicio; no se ajustan dinámicamente.
