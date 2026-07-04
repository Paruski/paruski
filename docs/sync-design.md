# Diseño de sincronización GitHub-as-progress-backend

## Objetivo

Mantener Paruski como web estática compatible con GitHub Pages, sin servidor propio obligatorio y sin secretos en el repositorio.

## Modelo local-first

- La app sigue usando `localStorage` como fuente inmediata de progreso.
- La sincronización remota es opcional.
- Sin clave de GitHub, la app debe seguir funcionando igual que antes.

## Archivos remotos

- `data/progress.json`: progreso agregado.
- `data/events/YYYY-MM-DD.ndjson`: eventos diarios append-only con deduplicación por `event_id`.
- `data/review-queue.json`: instantánea de cola de repaso.
- `data/summaries/`: resúmenes derivados futuros.

## Seguridad

- No se sube ninguna clave al repositorio.
- La clave se introduce manualmente en el navegador.
- Por defecto se guarda en `sessionStorage`.
- Solo se guarda en `localStorage` si el usuario marca recordarla.
- Permiso recomendado: clave limitada al repo con `Contents: Read and write`.

## Conflictos

- Cada archivo se lee antes de escribirse para obtener su SHA actual.
- La escritura envía el SHA esperado.
- Si GitHub informa conflicto, la app muestra aviso y no sobrescribe silenciosamente.
- Los eventos se fusionan por `event_id` antes de escribirlos de nuevo.

## Privacidad

- No guardar datos personales innecesarios.
- No guardar transcripciones originales.
- Separar progreso privado, métricas compartibles y datos públicos cuando se implementen funciones sociales.
