# Implementacion metodologica

Este documento traduce la investigacion sobre aprendizaje a decisiones concretas de Paruski. La justificacion metodologica extendida esta en `docs/science-backed-learning.md`.

## Base de evidencia

- Dunlosky, Rawson, Marsh, Nathan y Willingham (2013) consideran de alta utilidad la practica de test/recuperacion y la practica distribuida, y de utilidad moderada el intercalado.
- Roediger y Karpicke (2006) muestran que recuperar de memoria mejora mas la retencion demorada que volver a estudiar, aunque el reestudio aumente la sensacion subjetiva de dominio.
- En aprendizaje de idiomas esto se aplica como recuperacion de formas rusas, escucha, significado y patrones gramaticales en contextos breves, no como preguntas sobre la organizacion interna del curso.

## 1. Recuperacion activa

Decision: la sesion guiada presenta una explicacion corta y despues pide producir, elegir, escuchar o completar sin mirar. El ejercicio no sirve como examen final, sino como acto de aprendizaje.

Implementacion:

- `assets/core/scheduler.js` genera tareas `explain` y `exercise`.
- `assets/exercises/*` registra renderizadores de recuperacion activa.
- La respuesta se evalua antes de mostrar feedback.

## 2. Practica distribuida

Decision: cada target guarda `next_due_at` e `interval_days`. Lo acertado se retrasa; lo fallado vuelve antes.

Implementacion:

- `assets/core/learner-model.js` actualiza intervalos tras cada respuesta.
- `assets/core/scheduler.js` prioriza targets vencidos, fallados y de bajo dominio.
- `assets/features/calendar/` muestra el plan futuro derivado del scheduler.

## 3. Intercalado

Decision: una sesion no debe bloquearse en una sola clase o tipo. Se mezclan vocabulario, gramatica, niveles y modalidades para entrenar discriminacion.

Implementacion:

- `interleaveTargets()` reparte targets por tipo y nivel.
- `chooseExerciseType()` alterna huecos, eleccion, escritura y escucha segun dominio.

## 4. Feedback correctivo

Decision: cada respuesta muestra si fue aceptada, la forma esperada y un foco de error. El error alimenta el scheduler.

Implementacion:

- `assets/exercises/shared.js` clasifica errores.
- `assets/features/guided-session/` muestra feedback inmediato.
- `assets/core/learner-model.js` acumula `error_types`.

## 5. Carga cognitiva razonable

Decision: no se pide copiar metacodigo, barras, signos o patrones largos como si fueran ruso. Para estructuras complejas se prefiere elegir, completar un ejemplo o producir una frase con apoyo.

Implementacion:

- `isCopyHostileTarget()` evita escritura exacta de patrones con simbolos o demasiadas palabras.
- `isUsableStaticExercise()` descarta ejercicios estaticos de escritura libre cuando la respuesta esperada es una frase larga, no contiene cirilico o depende de simbolos de formato.
- La evaluacion acepta variantes, ignora puntuacion, normaliza `ё/e` y permite frases que contienen una palabra esperada cuando el objetivo es vocabulario.

## 6. Comprension y uso

Decision: la biblioteca existe para consultar, pero la experiencia principal guia al alumno hacia uso activo. La consulta se limita por desbloqueo para no convertir la app en una lista inmanejable.

Implementacion:

- `assets/features/library/` busca en ruso, traduccion, explicacion, ejemplos y resumen de clase.
- La busqueda no re-renderiza el input, por lo que el foco se conserva.

## 7. Medicion por competencias

Decision: el progreso no se mide solo por leccion o por palabra. Cada ejercicio se etiqueta en segundo plano con competencias de habilidad, recuperacion, modalidad, direccion, lexico, gramatica, morfologia y funcion comunicativa.

Implementacion:

- `content/competencies.json` define la taxonomia observable.
- `assets/core/competency-tagger.js` infiere competencias para ejercicios estaticos y generados.
- `assets/core/learner-model.js` acumula dominio, precision, errores, modalidades y tipos de ejercicio por competencia.
- `assets/features/progress/` muestra competencias entrenadas y competencias a reforzar.

## 8. Seleccion lexica por frecuencia y utilidad

Decision: el vocabulario nuevo no se decide por intuicion aislada. Se priorizan palabras frecuentes, campos lexicos de alta utilidad comunicativa y formas que permitan practicar gramatica real.

Implementacion:

- `scripts/enrich_learning_content.py` anota vocabulario suplementario y actualiza `content/vocabulary.json`.
- `content/lexical-selection.json` registra fuente, banda de frecuencia, campo lexico y razon de incorporacion.
- La frecuencia se estima localmente con `wordfreq` cuando esta disponible; sus datos para ruso combinan Wikipedia, subtitulos, noticias, libros y Twitter.
- Las fuentes corpus se documentan en `docs/transparencia-metodologica.md`.

## 9. Banco amplio de ejercicios

Decision: cada frase pedagogica util debe poder aparecer en varias modalidades. La variedad no se consigue cambiando solo el texto del boton, sino entrenando operaciones distintas.

Implementacion:

- El enriquecimiento genera dictados, eleccion auditiva, huecos, produccion guiada y transformaciones desde notas y reglas gramaticales.
- `assets/core/content-store.js` conserva `tts_text`, `display`, `sample`, `allow_contains` y `listen-choice` para ejercicios estaticos.
- `assets/core/scheduler.js` selecciona escucha, dictado, huecos, transformacion o produccion segun dominio por habilidad y disponibilidad de audio.
- `assets/features/guided-session/` muestra una instruccion breve para cada tipo de tarea para que el alumno sepa que hacer sin navegar por la web.

## 10. Comprension auditiva inferencial

Decision: escuchar no debe ser solo repetir como un loro ni elegir una respuesta obvia por descarte. Los listenings complejos usan mini-dialogos y preguntan por intencion, secuencia, contraste o implicacion.

Implementacion:

- `content/exercises.json` incluye ejercicios `listen-choice` con `tts_text` de dialogo y opciones semanticamente proximas.
- `scripts/generate_audio_manifest.py` incorpora esos `tts_text` al manifiesto para publicar MP3 estaticos de dialogos.
- `assets/features/guided-session/` no muestra "Escuchar modelo" en opciones multiples textuales, para no emparejar audio irrelevante ni regalar la respuesta.

## 11. Calibracion adaptativa

Decision: una cuenta nueva empieza con incertidumbre alta. La sesion va de sencillo a complejo, pero prueba material mas dificil pronto si el alumno responde bien. Cuando hay evidencia suficiente, el ajuste se estabiliza.

Implementacion:

- `assets/core/storage.js` guarda `calibration.rating`, `calibration.uncertainty` y numero de intentos.
- `assets/core/learner-model.js` actualiza el rating con una regla tipo Elo: K alto al principio, K menor al bajar la incertidumbre.
- `assets/core/scheduler.js` ordena objetivos por dificultad ascendente durante calibracion y despues prioriza objetivos cercanos al rating estimado.
- `assets/features/progress/` muestra rating e incertidumbre para auditar el ajuste.

## 12. Practica oral futura

Decision: la practica hablada queda separada como modulo experimental. No se activa grabacion ni LLM todavia; solo se reserva la seccion y el contrato de crecimiento.

Implementacion:

- `assets/features/speaking-lab/` registra una pantalla futura para ejercicios orales.
- La descripcion exige procesamiento local: grabacion del alumno, transcripcion/evaluacion por LLM local y feedback estructurado sin enviar audio a servidores externos.
