# Plan de prueba manual para sincronización

## Sin clave

1. Abrir la web.
2. Confirmar que las clases, el repaso, el teclado ruso y el guardado local siguen funcionando.
3. Confirmar que no aparece ningún error si no se configura GitHub.

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

## Conflictos

1. Abrir dos navegadores o dos sesiones.
2. Sincronizar desde una sesión.
3. Cambiar progreso remoto desde la otra sesión.
4. Reintentar sincronización.
5. Confirmar que la app no sobrescribe silenciosamente y muestra conflicto.

## Privacidad

1. Revisar que no se ha escrito ninguna clave en el repositorio.
2. Revisar que no se han subido transcripciones originales.
3. Revisar que los eventos contienen solo datos de aprendizaje esperados.
