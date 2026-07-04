# Esquema de ejercicios

Este documento describe el esquema objetivo para que Paruski pueda crecer con más tipos de ejercicios sin rehacer el motor.

## Campos base

```json
{
  "id": "ex-001-001",
  "lesson": 1,
  "skill": "gramatica",
  "type": "multiple_choice",
  "modality": "text",
  "prompt": "Elige la forma correcta.",
  "expected": "книгу",
  "choices": [],
  "accepted": [],
  "targets": {},
  "tags": [],
  "weight": 0.2
}
```

## Tipos previstos

- `traduccion-inversa`: español a ruso con respuesta abierta.
- `traduccion-directa`: ruso a español con respuesta abierta.
- `transformacion`: cambio morfológico o sintáctico.
- `huecos`: completar una forma sin opciones.
- `multiple_choice`: elección múltiple textual.
- `image_choice`: elegir una imagen.
- `image_production`: responder o describir a partir de imagen.
- `audio_transcription`: transcribir audio.
- `audio_mcq`: comprensión oral con opciones.
- `audio_image_choice`: escuchar y elegir imagen.

## Modalidades

- `text`
- `image`
- `audio`
- `audio_text`
- `audio_image`
- `image_text`

## Opciones de elección múltiple

```json
{
  "choices": [
    { "label": "книга", "value": "книга" },
    { "label": "книгу", "value": "книгу", "correct": true }
  ]
}
```

Para opciones con imagen:

```json
{
  "label": "кошка",
  "value": "кошка",
  "image_asset": "assets/images/lesson-001/cat.webp",
  "correct": true
}
```

## Audio y TTS

```json
{
  "audio_asset": "assets/audio/lesson-001/dictation-001.mp3",
  "tts_text": "Это мама.",
  "transcript": "Это мама."
}
```

- `audio_asset` tiene prioridad cuando existe.
- `tts_text` permite fallback con voz del navegador.
- No se guardan claves TTS en el repo ni en el navegador de producción.

## Targets multidimensionales

```json
{
  "targets": {
    "skills": ["listening", "production"],
    "vocabulary": ["книга"],
    "grammar": ["accusative_singular"],
    "structures": ["subject verb object"],
    "cases": ["accusative"],
    "morphology": ["feminine_noun_a_to_u"],
    "syntax": ["direct_object"],
    "direction": "es_to_ru",
    "modality": "text",
    "difficulty": 0.35,
    "importance": 0.8
  }
}
```

## Eventos asociados

Cada evento debe copiar datos esenciales del ejercicio:

- `event_id`
- `item_id`
- `exercise_type`
- `modality`
- `targets`
- `prompt`
- `expected`
- `answer`
- `selected_choice`
- `correct`
- `error_type`
- `response_time_ms`
- `confidence`

## Escalabilidad

- Añadir un tipo nuevo debe requerir un renderizador/evaluador nuevo, no cambios masivos en el resto de la app.
- Mantener compatibilidad con ejercicios antiguos que solo tienen `prompt`, `expected` y respuesta abierta.
- Versionar el esquema cuando se introduzcan cambios incompatibles.
