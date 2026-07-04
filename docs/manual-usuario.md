# Manual de usuario de Paruski

## Abrir la aplicación

La aplicación principal está en `index.html` y está preparada para GitHub Pages.

## Flujo diario recomendado

1. Abrir la aplicación.
2. Marcar como activa la clase que toque practicar.
3. Entrar en Repaso.
4. Hacer una sesión de ejercicios.
5. Exportar progreso y eventos.
6. Subir los archivos exportados a `data/` para conservar histórico.

## Estados de clase

- `preparada`: existe material, pero no implica estudio real.
- `vista`: la clase ya se ha trabajado.
- `activa`: entra en repaso.
- `consolidada`: se considera suficientemente dominada.

## Datos que registra

La aplicación registra fecha, clase, ejercicio, respuesta esperada, respuesta dada, acierto o error, tipo de error, tiempo de respuesta y confianza.

## Exportaciones

- `progress.json`: estado agregado.
- `events.ndjson`: historial de eventos.

## Limitación actual

La versión de GitHub Pages guarda el progreso en el navegador. La sincronización con el repositorio se hace exportando archivos.
