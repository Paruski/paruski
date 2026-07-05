# Método de aprendizaje de Paruski

Este documento describe cómo debe aprenderse ruso en Paruski y cómo se traduce esa metodología a la interfaz y a los datos. No contiene transcripciones de clase.

## Principios científicos aplicados

1. Recuperación activa. El alumno debe intentar recordar, no sólo releer. Por eso Paruski usa respuesta abierta, copia activa, escucha-escribe, selección y tarjetas.
2. Práctica distribuida / repetición espaciada. Los repasos se reparten en el tiempo. Los items acertados se posponen y los fallados vuelven antes.
3. Intercalado. La práctica mezcla vocabulario, gramática, clase, aspecto verbal y reconocimiento para evitar aprendizaje por bloques demasiado fáciles.
4. Producción. Aprender ruso exige escribir o decir formas rusas, no sólo reconocerlas. Por eso hay ejercicios de input y no sólo botones.
5. Feedback. Cada respuesta muestra si es correcta y cuál era la forma esperada. Los errores alimentan métricas y focos de repaso.
6. Metacognición. El calendario, diario y focos de repaso ayudan a ver qué se ha practicado y qué sigue siendo débil.

## Implementación en la web

### 1. Comprensión inicial

La sección Aprender muestra por clase:

- vocabulario ruso;
- patrones gramaticales;
- definiciones;
- ejemplos;
- consejos de uso.

Los datos vienen de `content/materials.json`, `content/materials-aspect.json` y `content/learning-notes.json`.

### 2. Práctica activa

La sección Repaso tiene dos capas:

- ejercicios curados en `content/exercises.json`;
- práctica generativa en `assets/drills-ui.js`, que crea ejercicios desde los materiales derivados.

Tipos actuales generados:

- copia activa;
- escucha y escritura;
- clasificación vocabulario/gramática;
- selección de clase;
- reconocimiento entre distractores.

### 3. Espaciado local

Los ejercicios y tarjetas generados guardan resultados en `localStorage` con claves separadas:

- `paruski.generatedDrills.v1`;
- `paruski.materialStudy.v1`;
- `paruski.aspectStudy.v1`.

La regla actual es simple y transparente: si aciertas, el intervalo crece; si fallas, vuelve a estar pendiente. Esta regla debe evolucionar hacia un plan por targets gramaticales y léxicos.

### 4. Intercalado

`drills-ui.js` selecciona items de distintas clases y tipos. Esto evita que el alumno sólo reconozca patrones por posición o por bloque.

### 5. Seguimiento

La pestaña Seguimiento calcula en local:

- práctica de hoy;
- racha;
- precisión;
- items pendientes;
- calendario de actividad;
- focos de repaso;
- diario de estudio.

### 6. Guardado

El progreso principal se guarda en `localStorage` bajo:

- `paruski.progress.v1`;
- `paruski.events.v1`.

La sincronización opcional con GitHub copia progreso a `data/progress.json`, eventos por fecha a `data/events/YYYY-MM-DD.ndjson` y cola de repaso a `data/review-queue.json`. La clave de GitHub nunca debe subirse al repositorio.

## Referencias de diseño

- Roediger y Karpicke: test-enhanced learning / recuperación activa.
- Dunlosky, Rawson, Marsh, Nathan y Willingham: técnicas efectivas de aprendizaje, especialmente práctica de recuperación y práctica distribuida.
- Ebbinghaus y literatura posterior sobre efecto de espaciado.
- Literatura de intercalado y práctica variada: mezclar tipos de problemas mejora discriminación y transferencia.
- Feedback y análisis de errores: los errores son señales para ajustar la práctica siguiente.

## Próximas mejoras

1. Convertir cada material en target multidimensional: vocabulario, caso, morfología, sintaxis, habilidad, modalidad, dificultad e importancia.
2. Hacer que `drills-ui.js` seleccione por target vencido, no sólo por item.
3. Sincronizar diario y tracking avanzado con GitHub de forma opcional.
4. Añadir producción oral cuando el navegador lo permita.
5. Añadir pruebas por comprensión auditiva con audio pregrabado o TTS controlado.
