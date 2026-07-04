# Plan de prueba manual para sincronización

## Sin clave

1. Abrir la web.
2. Confirmar que las clases, el repaso, el teclado ruso y el guardado local siguen funcionando.
3. Confirmar que no aparece ningún error si no se configura GitHub.
4. Confirmar que el panel de sincronización no intenta subir nada sin clave.

## Repaso y ejercicios

1. Activar una clase con ejercicios.
2. Confirmar que la tarjeta de clase muestra cuántos ejercicios tiene y algunos tipos disponibles.
3. Practicar un ejercicio de respuesta abierta y confirmar corrección flexible.
4. Practicar un ejercicio de elección múltiple y confirmar que se evalúa la opción marcada.
5. Activar una clase sin ejercicios y confirmar que la app muestra un aviso claro sin romper el repaso.
6. Confirmar que las tarjetas de inicio actualizan racha, progreso de hoy, precisión y pendientes.

## Con clave de GitHub

1. Ir a Datos.
2. Introducir repositorio, rama y clave con permiso `Contents: Read and write`.
3. Pulsar Probar conexión.
4. Hacer un ejercicio para generar un evento local.
5. Pulsar Sincronizar ahora.
6. Confirmar que se actualizan:
   - `data/progress.json`;
   - `data/events/YYYY-MM-DD.ndjson`;
   - `data/review-queue.json`.
7. Confirmar que el evento remoto contiene `event_id`, `exercise_type`, `modality`, `targets` cuando existan, tiempo de respuesta y confianza.

## Conflictos

1. Abrir dos navegadores o dos sesiones.
2. Sincronizar desde una sesión.
3. Cambiar progreso remoto desde la otra sesión.
4. Reintentar sincronización.
5. Confirmar que la app no sobrescribe silenciosamente y muestra conflicto.

## Caché y actualización

1. Abrir la web con una versión anterior cacheada.
2. Publicar la versión con `CACHE_NAME` actualizado.
3. Recargar la web.
4. Confirmar que se cargan los cambios recientes de `assets/app.js`, `assets/styles.css`, `assets/sync-ui.js` y `content/exercises.json`.

## Privacidad

1. Revisar que no se ha escrito ninguna clave en el repositorio.
2. Revisar que no se han subido transcripciones originales.
3. Revisar que los eventos contienen solo datos de aprendizaje esperados.
4. Pulsar Olvidar clave y confirmar que se limpia de sesión/local.
