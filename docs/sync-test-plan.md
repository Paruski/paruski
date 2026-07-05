# Plan de prueba manual para sincronizacion

## Modo local sin claves

1. Abrir la web.
2. Confirmar que las clases, el repaso, el teclado ruso y el guardado local siguen funcionando.
3. Confirmar que no aparece ningun error si no se configura GitHub.
4. Confirmar que la pestaña Nube no pide token ni clave.
5. Confirmar que el panel explica que la exportacion a GitHub es manual.

## Repaso y ejercicios

1. Activar una clase con ejercicios.
2. Confirmar que la tarjeta de clase muestra el objetivo y ejemplos disponibles.
3. Practicar un ejercicio de respuesta abierta y confirmar correccion flexible.
4. Practicar un ejercicio de eleccion multiple y confirmar que se evalua la opcion marcada.
5. Activar una clase sin ejercicios y confirmar que la app muestra un aviso claro sin romper el repaso.
6. Confirmar que las tarjetas de inicio actualizan racha, progreso de hoy, precision y pendientes.

## Exportacion manual

1. Ir a Nube.
2. Confirmar que se muestran las rutas sugeridas:
   - `data/progress.json`;
   - `data/events/YYYY-MM-DD.ndjson`;
   - `data/review-queue.json`.
3. Pulsar Descargar progreso y confirmar que baja `progress.json`.
4. Hacer un ejercicio para generar un evento local.
5. Pulsar Descargar eventos de hoy y confirmar que baja un NDJSON con `event_id`, `exercise_type`, `modality`, `target_ids`, `competency_ids`, tiempo de respuesta y confianza.
6. Pulsar Descargar cola de repaso y confirmar que baja `review-queue.json` con targets vencidos.
7. Subir manualmente los archivos al repositorio si se quiere versionar el progreso.

## Importacion manual

1. Descargar o preparar un `progress.json` valido.
2. Ir a Nube.
3. Pulsar Importar progreso JSON.
4. Seleccionar el archivo.
5. Confirmar que la app guarda el progreso, recarga y conserva el avance.
6. Intentar importar un JSON invalido y confirmar que la app muestra un error sin romper el estado local.

## Cache y actualizacion

1. Abrir la web con una version anterior cacheada.
2. Publicar la version con `CACHE_NAME` actualizado.
3. Recargar la web.
4. Confirmar que se cargan los cambios recientes de `index.html`, `assets/app.js`, `assets/app-shell.css`, `assets/features/sync/index.js` y `content/exercises.json`.

## Privacidad

1. Revisar que no se ha escrito ninguna clave en el repositorio.
2. Revisar que no existen campos de token en la pestaña Nube.
3. Revisar que `localStorage` y `sessionStorage` no contienen `paruski.githubKey.*` tras cargar la app.
4. Revisar que no se han subido transcripciones originales ni materiales fuente no publicables.
5. Revisar que los eventos contienen solo datos de aprendizaje esperados.
