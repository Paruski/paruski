# Progreso en el repositorio

La web debe seguir funcionando en GitHub Pages gratuito. El repositorio puede
actuar como almacenamiento versionado de progreso, pero la app publicada no debe
necesitar servidor ni guardar secretos en el navegador.

## Principio

La aplicacion funciona primero en modo local:

- carga contenido desde `content/`;
- guarda progreso y eventos en `localStorage`;
- calcula repaso y cola futura localmente;
- permite exportar e importar datos manualmente.

La sincronizacion con GitHub se plantea como flujo manual y versionable:

- descargar `data/progress.json` desde la pestaña Nube;
- descargar eventos en NDJSON para `data/events/YYYY-MM-DD.ndjson`;
- descargar `data/review-queue.json`;
- subir esos archivos mediante Git, la interfaz de GitHub o una sesion de Codex
autenticada fuera de la web publicada.

## Seguridad

La app estatica no debe pedir ni almacenar tokens de GitHub. No hay campo de
clave, no hay autoguardado autenticado desde el navegador y no se escriben
secretos en `localStorage`, `sessionStorage` ni en el repositorio.

Si en el futuro se automatiza la sincronizacion, debe hacerse sin exponer
secretos en GitHub Pages. Cualquier credencial o intercambio OAuth que requiera
secreto debe vivir fuera de la web estatica, por ejemplo en una herramienta local
o en un servicio opcional que no sea obligatorio para usar Paruski.

## Implicacion

Como el repositorio es publico, cualquier progreso guardado en `data/` sera
publico. Esto solo es aceptable para progreso de aprendizaje de ruso que el
usuario decida exportar y subir explicitamente.

## Archivos de progreso

- `data/progress.json`: estado agregado.
- `data/events/YYYY-MM-DD.ndjson`: eventos de aprendizaje por fecha.
- `data/review-queue.json`: cola de repaso calculada.
- `data/summaries/`: resumenes periodicos opcionales.

## Regla de diseno

El navegador es la cache local. El repositorio es una copia versionada opcional.
La app no debe sobrescribir nada en GitHub automaticamente ni pedir credenciales
para hacerlo desde Pages.
