# Pipeline de audio estático

La web no debe depender de voces instaladas en el navegador. Los audios del curso deben generarse fuera del navegador y guardarse como materiales estáticos.

## Fuente de verdad

La lista de audios sale de la base central:

```text
content/paruski-db.json
```

El script lee esa base y resuelve las fuentes canónicas declaradas allí:

```text
content/materials.json
content/materials-aspect.json
content/learning-notes.json
```

No se mantiene una lista manual paralela de palabras.

## Generar lista de locución

Desde la raíz del repo:

```bash
python scripts/generate_audio_manifest.py --write
```

Esto genera:

```text
content/audio-worklist.json
content/audio-index.json
```

`audio-worklist.json` contiene todo lo que hay que sintetizar. Cada entrada tiene `text` y `suggested_path`.

## Sintetizar en local

Genera un audio por cada `suggested_path`, por ejemplo:

```text
content/audio/ru/chelovek-<hash>.mp3
content/audio/ru/eto-chay-<hash>.mp3
```

Puedes usar cualquier herramienta local: una voz rusa del sistema, un TTS instalado localmente, una grabación humana o una herramienta externa que produzca archivos estáticos. No subas claves ni dependas de un servidor obligatorio.

## Regenerar índice

Cuando ya existan los audios:

```bash
python scripts/generate_audio_manifest.py --write --voice "mi-voz-rusa-local"
```

El script escanea `content/audio/ru/` y escribe en `content/audio-index.json` sólo los audios que existen realmente. No deja referencias rotas.

## Formatos

Por defecto propone `.mp3`:

```bash
python scripts/generate_audio_manifest.py --write --ext mp3
```

También acepta:

```bash
python scripts/generate_audio_manifest.py --write --ext wav
python scripts/generate_audio_manifest.py --write --ext ogg
python scripts/generate_audio_manifest.py --write --ext m4a
```

Para WAV, el script puede calcular `duration_ms` con biblioteca estándar. Para MP3/M4A/OGG deja la duración como `null` salvo que se añada una herramienta de análisis más adelante.

## Regla de privacidad

Los audios sólo deben contener material de aprendizaje de ruso. No se deben generar ni subir transcripciones originales, datos personales, claves ni contexto privado.

## Traspaso a equipo con GPU

Si se usa otro equipo para generar voces de mayor calidad, seguir `docs/audio-gpu-handoff.md`.
La regla se mantiene: el equipo externo genera audios estaticos y devuelve al
repositorio solo `content/audio/ru/*.mp3` y `content/audio-index.json`.
