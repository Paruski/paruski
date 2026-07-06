# Especificación de la aplicación Paruski

## Objetivo

Crear una aplicación interactiva para aprender ruso y registrar progreso de forma auditable.

La aplicación debe distinguir:

- material preparado;
- clase vista;
- clase activa en repaso;
- dominio por ítem;
- errores recurrentes.

## Arquitectura actual

Versión MVP estática, compatible con GitHub Pages.

## Persistencia

La web guarda progreso en `localStorage` del navegador.

Exporta:

- `progress.json`: estado agregado;
- `events.ndjson`: eventos de aprendizaje.

## Evento de aprendizaje

Cada evento registra fecha, usuario de sesión, clase, ejercicio, respuesta esperada, respuesta dada, acierto/error o posposición, tipo de error, tiempo de respuesta, acción usada, seguridad inferida y objetivos examinados.

## Algoritmo de repaso

La prioridad combina:

- ítems no practicados;
- bajo dominio;
- fallos acumulados;
- tiempo desde el último intento;
- peso didáctico del ejercicio;
- objetivos multidimensionales del ejercicio.

## Fase siguiente

Añadir sincronización con GitHub para guardar progreso en el repositorio manteniendo el modo local.
