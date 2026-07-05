# Diseño de exportacion GitHub-as-progress-backend

## Objetivo

Mantener Paruski como web estatica compatible con GitHub Pages, sin servidor
propio obligatorio y sin secretos en el navegador ni en el repositorio.

## Modelo local-first

- La app sigue usando `localStorage` como fuente inmediata de progreso.
- La copia remota es opcional y se hace por exportacion/importacion manual.
- Sin GitHub, la app debe seguir funcionando igual que antes.
- La app publicada no escribe en GitHub con un token desde el navegador.

## Archivos remotos

- `data/progress.json`: progreso agregado.
- `data/events/YYYY-MM-DD.ndjson`: eventos diarios append-only con deduplicacion por `event_id` cuando se fusionen fuera de la web.
- `data/review-queue.json`: instantanea de cola de repaso.
- `data/summaries/`: resumenes derivados futuros.

## Seguridad

- No se pide ninguna clave en la interfaz web.
- No se sube ninguna clave al repositorio.
- No se guarda ninguna clave en `localStorage` ni `sessionStorage`.
- La pestaña Nube solo descarga archivos y permite importar progreso JSON.
- Cualquier automatizacion futura debe vivir fuera de GitHub Pages o usar un flujo que no exponga secretos en la app estatica.

## Conflictos

La web no resuelve conflictos remotos porque no escribe directamente en GitHub.
Si se versiona progreso manualmente, la fusion debe hacerse fuera de la app:

- conservar `event_id` como clave de deduplicacion;
- no sobrescribir `data/progress.json` sin revisar cambios recientes;
- preferir eventos por fecha en `data/events/YYYY-MM-DD.ndjson`;
- regenerar `data/review-queue.json` tras importar o fusionar progreso.

## Privacidad

- No guardar datos personales innecesarios.
- No guardar transcripciones originales.
- Publicar en `data/` solo progreso de ruso que el usuario decida subir.
- Separar progreso privado, metricas compartibles y datos publicos cuando se implementen funciones sociales.
