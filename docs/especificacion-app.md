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

```text
index.html
assets/
  app.js
  styles.css
content/
  lessons.json
  vocabulary.json
  grammar.json
  exercises.json
data/
  progress.json
  events.ndjson
  review-queue.json
```

## Persistencia

La web guarda progreso en `localStorage` del navegador.

Exporta:

- `progress.json`: estado agregado;
- `events.ndjson`: eventos de aprendizaje.

Para que el progreso sea legible por ChatGPT desde el conector de GitHub, esos archivos deben subirse a `data/` del repositorio.

## Evento de aprendizaje

```json
{
  "timestamp": "2026-07-04T20:35:00+02:00",
  "lesson": 19,
  "item_id": "ex-019-001",
  "skill": "vocabulario",
  "prompt": "¿Cómo se dice 'juego al fútbol'?",
  "expected": "Я играю в футбол.",
  "answer": "Я играю футбол",
  "correct": false,
  "error_type": "preposicion_omitida",
  "response_time_ms": 6100,
  "confidence": 3
}
```

## Algoritmo de repaso

La prioridad combina:

- ítems no practicados;
- bajo dominio;
- fallos acumulados;
- tiempo desde el último intento;
- peso didáctico del ejercicio.

## Limitación consciente del MVP

Una web estática no debe guardar tokens de GitHub en el navegador. Por eso la sincronización automática con el repositorio se deja para una fase posterior con backend privado.

## Fase siguiente

Añadir backend con FastAPI + SQLite:

```text
frontend PWA -> API privada -> SQLite -> export a GitHub
```

Esto permitirá tracking automático real sin exponer credenciales en el navegador.
