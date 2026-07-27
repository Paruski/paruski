# Principios de producto Paruski

## Público objetivo

Paruski se disena para hispanohablantes del extremo superior de capacidad verbal (>99.9 percentil / ICV). Esto implica:

- Menor tolerancia a repeticion trivial.
- Mayor necesidad de coherencia explicita.
- Explicaciones metalinguisticas precisas.
- Transferencia temprana.
- Dificultad adaptativa.
- Menos "machacar por machacar".
- Mas generalizacion.
- Feedback causal.
- Examenes exigentes.
- Progreso basado en evidencia fuerte, no en navegacion.

## Separacion de roles

- **Clases**: ensenanza. Explicacion, ejemplos, contraste espanol-ruso, micro-checks conceptuales.
- **Ejercicios / Practica**: recuperacion activa. Sesion guiada con SRS, repaso espaciado, produccion.
- **Examenes**: evaluacion con tiempo limitado. Desbloqueo de lecciones. Fallos criticos bloquean.
- **Progreso**: diagnostico basado en evidencia. No en scroll, lectura ni clics.
- **Material**: consulta pasiva de vocabulario y gramatica.
- **Curriculum**: mapa general del curso de 80 lecciones.

## Base cientifica

### Practica espaciada (Cepeda, Pashler, Vul, Wixted & Rohrer, 2006)

- Repasos programados por target linguistico, no solo por ejercicio.
- "Acierto inmediato" no equivale a "dominio estable".
- No subir dominio si el alumno acaba de ver la explicacion.
- No repetir muchos ejercicios del mismo lema en una sesion.
- Espaciar targets criticos en dias sucesivos.
- Priorizar targets cerca de olvidarse.

### Testing effect (Roediger & Karpicke, 2006)

- Recuperacion activa fortalece la memoria mas que releer.
- Leer una clase no cuenta como dominio.
- Micro-checks no cuentan como SRS fuerte.
- "Ver respuesta" no cuenta como acierto.
- Respuestas abiertas pesan mas que test.
- Produccion pesa mas que reconocimiento.
- Correccion de errores y transformacion pesan mas que elegir opcion.

### Evidence weights por tipo de ejercicio

| Tipo | Peso |
|------|------|
| multiple-choice / choice-grid | 0.4 |
| listen-choice | 0.5 |
| cloze / dictation / text-input | 0.7 |
| token-build | 0.75 |
| error-correction | 0.85 |
| transform | 0.9 |
| production-prompt | 0.95 |

Si el ejercicio implica transferencia o generalizacion, se multiplica por 1.15.
Si es de examen, por 1.2.
Si es solo reconocimiento, por 0.6.

### Half-Life Regression (Settles & Meeder, 2016) — version simplificada

Cada target tiene:

- `mastery`: 0-1 (media de habilidades).
- `stability`: numero de dias antes de olvidar.
- `dueAt`: fecha de proximo repaso.
- `attempts`, `correct`, `wrong`: historico.
- `last_seen_at`, `last_correct_at`: trazabilidad.
- `last_result`: ultimo resultado.
- `last_skill_mode`: ultima habilidad practicada.
- `history_by_skill`: desglose por habilidad.
- `critical_failures`: fallos en targets criticos.

Prioridad de repaso: bajo dominio + ultima practica lejana + errores recientes + importancia + modalidad productiva pendiente.

### DAS3H multi-habilidad

- Todo ejercicio tiene targets explicitos.
- Cada target tiene tipo: vocabulary, grammar, syntax, case, agreement, production, error_correction, listening, transfer.
- Un item mixto actualiza varios targets con pesos limitados.
- Maximo de credito por ejercicio: 1.0 distribuido entre targets.
- No multiplicar progreso artificialmente.

## Politica de tiempo en examenes

- `EXAM_SECONDS_PER_QUESTION = 30`
- `timeLimitSeconds = scoredQuestionCount * 30`
- El tiempo es global, no por pregunta.
- Se muestra tiempo restante, preguntas respondidas y pendientes.
- Si se agota el tiempo, el examen se autoentrega y las no respondidas cuentan como incorrectas.
- El tiempo no penaliza clases ni practica normal.

## Fallos criticos

- Un fallo critico existe si la pregunta evalua un target marcado como critico.
- No todos los errores son criticos.
- En vocabulario: solo para lemas fundacionales explicitamente criticos.
- En gramatica: posesivo central, estructura `у + GEN + есть`, distincion identidad/posesion, concordancia central.
- En mixto: no transferir el patron central a una situacion nueva.
- Al suspender por fallo critico, se muestra: pregunta, respuesta del alumno, esperada, target critico y explicacion.

## Niveles de progreso

- "Pre-A1 inicial": poca evidencia.
- "A1 en construccion": domina varias lecciones iniciales.
- "A1 funcional parcial": produccion, comprension y examenes superados.

No inflar el nivel global. Mostrar solo lo que la evidencia sostiene.
