# Progreso en el repositorio

La web debe seguir funcionando en GitHub Pages gratuito. Por tanto, el repositorio actuara como almacenamiento de progreso, no un servidor externo obligatorio.

## Principio

La aplicacion funciona primero en modo local:

- carga contenido desde `content/`;
- guarda progreso en el navegador;
- calcula repaso localmente;
- permite exportar datos.

Luego puede sincronizar con GitHub:

- lee `data/progress.json`;
- anade eventos a `data/events.ndjson` o a ficheros por fecha;
- actualiza `data/review-queue.json`;
- guarda snapshots de resumen.

## Seguridad

La web publica no debe contener tokens. Para escribir en GitHub desde Pages solo hay dos opciones aceptables:

1. El usuario introduce un token de GitHub de permisos minimos, guardado localmente o solo en sesion.
2. La app usa un flujo de autorizacion de GitHub sin servidor, si se configura mas adelante.

Nunca se subira un token al repositorio.

## Implicacion

Como el repositorio es publico, cualquier progreso guardado en `data/` sera publico. Esto es aceptable solo porque se ha decidido que el progreso de ruso puede quedarse en el repo.

## Archivos de progreso

- `data/progress.json`: estado agregado.
- `data/events.ndjson`: eventos de aprendizaje.
- `data/review-queue.json`: cola de repaso calculada.
- `data/summaries/`: resumenes periodicos.

## Regla de diseno

El repo es la fuente versionada. El navegador es la cache local. Si hay conflicto, la app debe avisar y no sobrescribir silenciosamente.
