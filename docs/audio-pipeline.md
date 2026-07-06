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

El manifiesto descarta automaticamente textos sin cirilico o con letras latinas. Esto evita locutar etiquetas metodologicas en espanol como si fueran ruso.

## Sintetizar en local

Genera un audio por cada `suggested_path`, por ejemplo:

```text
content/audio/ru/chelovek-<hash>.mp3
content/audio/ru/eto-chay-<hash>.mp3
```

Puedes usar cualquier herramienta local: una voz rusa del sistema, un TTS instalado localmente, una grabación humana o una herramienta externa que produzca archivos estáticos. No subas claves ni dependas de un servidor obligatorio.

La voz aceptada para esta version es XTTS-v2 con referencia humana de LibriVox:

```bash
python scripts/generate_xtts_audio.py \
  --speaker-wav /ruta/a/anastasiia-ref-38s-18s.wav \
  --tts-home /ruta/a/tts-cache/coqui \
  --hf-home /ruta/a/tts-cache/hf \
  --xdg-data-home /ruta/a/tts-cache/xdg-data
```

Configuracion aplicada por defecto:

- modelo `tts_models/multilingual/multi-dataset/xtts_v2`;
- voz `xtts-v2-anastasiia-librivox-cpml-noncommercial`;
- `tempo=0.96`;
- 60 ms de margen inicial;
- 350 ms de margen final;
- loudness objetivo `-19 LUFS`;
- MP3 mono, 24 kHz, 96 kbps.

El usuario acepto la Coqui Public Model License para uso no comercial. La referencia humana procede de `Степные сказки` de LibriVox, leido por Anastasiia Solokha:

```text
https://archive.org/details/stepnyyeskazki_2204_librivox
```

Estado publicado el 2026-07-06: 1111 locuciones MP3 generadas e indexadas con esta voz. El corpus ocupa unos 30 MB en `content/audio/ru/`.

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
