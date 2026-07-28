# Modelo de aprendizaje

Este documento fija qué se aprende, qué cuenta como prueba de haberlo aprendido y
cuándo se vuelve sobre ello. Todo lo demás del proyecto —el generador, la web, el
examen, el repaso— es instrumento de esto y se comprueba contra este documento.

`scripts/verificar_modelo.py` regenera las matrices desde el curso construido y
falla si alguna deja de cumplirse. Las matrices vivas están en
[`docs/matrices.md`](matrices.md), que es contenido generado.

## 1. Qué se modela

La unidad de aprendizaje es la **competencia**, no el ejercicio ni la palabra.

Un ejercicio no es un objetivo: es un instrumento para producir **prueba** sobre
una competencia en una **dimensión**. De ahí las tres consecuencias que gobiernan
el resto del sistema:

1. El repaso se programa sobre competencias, no sobre ejercicios. Volver al mismo
   ejercicio mide el recuerdo de ese ejercicio, no el de la competencia.
2. Dos ejercicios que producen la misma prueba sobre la misma competencia son el
   mismo ejercicio. El segundo no aporta nada.
3. Un ejercicio que no produce prueba sobre ninguna competencia no se publica,
   por entretenido que sea.

## 2. Las seis dimensiones · matriz M1

Una competencia no se sabe o no se sabe: se sabe **en una dimensión**. Reconocer
`Это чай.` entre cuatro formas y producirla en blanco son dos cosas distintas, y
la segunda no se sigue de la primera.

| Dimensión | Pregunta que responde | Prueba que la acredita | Canal |
| --- | --- | --- | --- |
| `comprension_explicita` | ¿entiende por qué? | elegir la regla frente a su rival | texto, pasiva |
| `reconocimiento_escrito` | ¿la reconoce al verla? | elegir la forma entre formas rivales | texto, pasiva |
| `recuperacion_escrita` | ¿la produce sin verla? | escribirla sin tenerla a la vista | texto, activa |
| `transferencia_contextual` | ¿la usa en una escena nueva? | producirla en un contexto distinto del aprendido | texto, activa |
| `retencion_diferida` | ¿sigue disponible con el tiempo? | recuperación no asistida con siete días o más desde el último encuentro | texto, activa |
| `reconocimiento_auditivo` | ¿la reconoce al oírla? | escribirla oyéndola, sin texto a la vista | audio, pasiva |

**Cinco se ejercitan, una se acredita.** `retencion_diferida` no tiene ejercicio
propio y no puede tenerlo: no es una tarea distinta, es la misma recuperación
sometida a una condición temporal. Que su columna aparezca vacía en la matriz de
tipos de ejercicio no es una laguna, es la definición. Cualquier «ejercicio de
retención diferida» sería una recuperación disfrazada.

## 3. Qué acredita cada acto · matriz M2

La regla que impide inflar el progreso: **el crédito lo fija el acto, no el
acierto**.

| Acto del alumno | Acredita | No acredita |
| --- | --- | --- |
| elegir entre opciones | reconocimiento (escrito o conceptual) | recuperación: la forma estaba en pantalla |
| escribir sin pista | recuperación escrita | nada más, si el contexto es el ya visto |
| escribir sin pista en escena nueva | transferencia contextual | — |
| escribir sin pista, ≥ 7 días después | recuperación **y** retención diferida | — |
| escribir tras pista | recuperación con menor peso, y queda registrada la dependencia de clave | retención diferida |
| escribir lo que se oye, sin texto a la vista | reconocimiento auditivo | recuperación: el contenido lo da el audio |
| copiar lo que ya está impreso | **nada** | ninguna dimensión |
| fallar | nada; devuelve la competencia a la cola inmediata y suma recaída | — |

De ahí dos exigencias sobre el enunciado, que se comprueban:

1. **La respuesta no puede estar citada en lo que el alumno ve.** Si lo está, el
   paso mide la vista y no la competencia. Vale también para lo que enseña el
   ejercicio de al lado: por eso el léxico se parte en dos fichas, una que nombra
   la palabra rusa para preguntar por su significado y su acento, y otra que sólo
   da el español y pide escribirla.
2. **La consigna describe exactamente lo que se acepta.** Pedir un diálogo y
   admitir sólo dos afirmaciones manda a escribir lo que después se rechaza.

El peso del acierto sobre la fuerza de la dimensión es `s + (1 − s)·k`, con
`k = 0,42` sin pista y `k = 0,18` con pista; el fallo la reduce a la mitad. Un
acierto nunca lleva la fuerza a 1: la certeza no se alcanza, se aproxima.

## 4. La escalera de exposición · matriz M3

Cada ejercicio nace en una etapa, y la etapa dice cuándo puede aparecer y qué
dimensión ataca. La práctica ordena por etapa: primero descubrir, después
reconocer, después recuperar.

| Etapa | Momento | Dimensión que ataca |
| --- | --- | --- |
| `discovery` | primer encuentro | comprensión explícita |
| `guided_recognition` | tras el primer encuentro | reconocimiento escrito |
| `same_session_retrieval` | misma sesión | recuperación escrita |
| `next_day_retrieval` | sesión siguiente | recuperación escrita |
| `contextual_transfer` | con la forma ya disponible | transferencia contextual |
| `delayed_retention` | a distancia | retención diferida (por condición) |

## 5. La programación del repaso · matriz M4

| Escalón | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Días hasta el siguiente encuentro | 1 | 3 | 7 | 16 | 35 | 70 | 140 |

Tres reglas, y las tres importan:

1. **El escalón sube por ocasión de repaso, no por ejercicio.** Una sesión trae
   varios ejercicios de la misma competencia; si cada uno ascendiera, una sola
   tanda la mandaría de 1 a 140 días. Acertar antes de que toque consolida la
   fuerza pero no alarga el intervalo.
2. **Un fallo devuelve la competencia a la cola inmediata** y suma recaída.
3. **Al repasar se elige la dimensión más floja**, y dentro de ella un ejercicio
   de contexto distinto del último visto. Lo nunca medido va primero: una
   dimensión sin datos es más urgente que una dimensión débil.

## 6. El contrato del examen · matriz M5

El examen abre la unidad siguiente. Por tanto no comprueba una muestra: comprueba
**todas** las competencias de su unidad, y en los tres canales de prueba que el
alumno tendrá que sostener después.

| Por cada competencia de la unidad | Prueba exigida |
| --- | --- |
| ¿la reconoce? | un paso de `comprension_explicita` o `reconocimiento_escrito` |
| ¿la produce? | un paso de `recuperacion_escrita` o `transferencia_contextual` |
| ¿la reconoce al oírla? | un paso de `reconocimiento_auditivo` |

`retencion_diferida` **no se exige en el examen** y no puede exigirse: depende de
que hayan pasado siete días, no del alumno. Se acredita en el repaso, cuando toca.

Lo que el material no traiga ya examinado se reserva de la práctica. Nunca se
inventa un ítem de examen, y un ítem de examen no aparece jamás en la práctica.

Se aprueba con el 80 % de los pasos.

## 7. Cobertura exigida al curso · matriz M6

| Requisito | Alcance |
| --- | --- |
| toda competencia tiene ejercicio de comprensión o reconocimiento | las 53 |
| toda competencia tiene ejercicio de recuperación | las 53 |
| toda competencia tiene ejercicio auditivo | las 53 |
| toda competencia se examina reconociendo, produciendo y oyendo | las 53 |
| `transferencia_contextual` | donde el material la traiga; no se fabrica escena nueva |
| `retencion_diferida` | sin ejercicio propio, por definición |

La transferencia contextual es la única dimensión que el curso no garantiza para
todas las competencias: exige una escena distinta de la aprendida, y esa escena
tiene que venir del material. Inventarla sería inventar contenido. Donde no la
hay, se declara y no se simula.

## 8. Qué queda fuera del modelo, y por qué

- **Producción oral.** No hay corrección determinista de la voz del alumno sin un
  reconocedor, y un reconocedor no es una comprobación, es una estimación.
- **Rúbricas.** Lo que necesita el juicio de una persona no se publica.
- **Dificultad percibida.** El modelo no pregunta al alumno cómo de difícil le ha
  parecido: se mide el acto, no la impresión.
