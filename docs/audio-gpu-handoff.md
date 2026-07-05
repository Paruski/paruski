# Traspaso para generacion de audio con GPU

Este documento permite continuar la generacion de audios de Paruski en otro equipo,
incluido un equipo con GPU, sin desviarse de la arquitectura de la web.

## Principio de arquitectura

La web publicada en GitHub Pages debe seguir siendo estatica:

- no ejecuta modelos TTS;
- no descarga modelos al navegador;
- no depende de APIs de pago ni de claves;
- solo carga archivos de audio estaticos desde `content/audio/ru/`;
- resuelve esos archivos mediante `content/audio-index.json`.

El TTS se ejecuta fuera de la web. El repositorio solo debe recibir los audios
finales comprimidos y el indice regenerado.

## Estado actual

Estructura relevante:

- `content/audio-worklist.json`: lista canonica de textos rusos que necesitan audio.
- `content/audio-index.json`: indice consumido por la app; solo debe apuntar a archivos existentes.
- `content/audio/ru/`: destino de audios finales.
- `content/audio/preview-piper-irina/`: muestras de Piper no aprobadas como corpus final.
- `content/audio/preview/`: muestras no finales.
- `content/audio/preview-kseniya-controlled/`: comparativa no final de Silero `kseniya`.
- `scripts/generate_audio_manifest.py`: genera worklist e indice desde el contenido central.
- `scripts/generate_static_audio.py`: generador por lote para Piper, util como plantilla.

El primer muestreo con Piper `ru_RU-irina-medium` no alcanza el nivel deseado:
hay variacion de volumen/cadencia y cierto timbre sintetico. Silero `v5_5_ru`
con la voz `kseniya` parece mas clara, pero tambien requiere control de volumen
y cadencia antes de decidir si sirve para el corpus completo.

## Criterios de calidad

Antes de generar el corpus completo, aprobar una tanda de 20-30 audios con:

- una sola voz principal para evitar cambios de timbre;
- pronunciacion rusa natural y clara;
- volumen percibido homogeneo;
- velocidad de articulacion estable;
- pausas iniciales/finales breves y consistentes;
- buena inteligibilidad en palabras sueltas y frases cortas;
- ausencia de artefactos metalicos, vibrato artificial o cortes bruscos;
- formato comprimido reproducible en navegadores (`mp3` por compatibilidad).

Si el modelo no cumple esto en muestras cortas, no generar el lote completo.

## Opcion recomendada para GPU

Probar modelos mas potentes en este orden:

1. **XTTS v2 / Coqui TTS** para generar habla rusa mas natural.
   - Usarlo solo si la licencia del modelo y de la voz de referencia permite publicar los audios.
   - No subir voces de referencia privadas ni pesos del modelo.
   - Generar audios estaticos y revisar manualmente la pronunciacion.

2. **Silero TTS `v5_5_ru`, voz `kseniya`** como opcion offline rapida.
   - Documentacion: `https://github.com/snakers4/silero-models`
   - Ventaja: ruso con autoacentuacion/homografos y varias voces.
   - Riesgo: prosodia aun algo irregular en clips muy cortos.

3. **Piper `ru_RU-*`** solo como fallback.
   - Documentacion: `https://github.com/rhasspy/piper/blob/master/VOICES.md`
   - Ventaja: facil, ligero y local.
   - Riesgo: naturalidad inferior en ruso.

## Flujo de trabajo en el equipo con GPU

Desde la raiz del repo:

```bash
python scripts/generate_audio_manifest.py --write --ext mp3 --voice "modelo-provisional"
```

Esto actualiza:

```text
content/audio-worklist.json
content/audio-index.json
```

Para generar, leer `content/audio-worklist.json`. Cada item tiene:

- `text`: texto ruso a locutar;
- `suggested_path`: ruta final esperada;
- `priority`: prioridad pedagogica;
- `lesson_refs`: clases relacionadas.

Generar primero un lote pequeno:

```bash
# ejemplo: solo primeras lecciones o alta prioridad
python scripts/generate_audio_manifest.py --write --ext mp3 --voice "xtts-v2-voz-X"
```

Despues de escribir audios en `content/audio/ru/`, regenerar el indice:

```bash
python scripts/generate_audio_manifest.py --write --ext mp3 --voice "xtts-v2-voz-X"
```

El indice final no debe contener referencias rotas.

## Postproceso recomendado

Aplicar el mismo postproceso a todos los audios finales:

```bash
ffmpeg -y -i input.wav \
  -ac 1 -ar 24000 \
  -af "loudnorm=I=-18:TP=-1.5:LRA=7,acompressor=threshold=-22dB:ratio=1.8:attack=8:release=80,alimiter=limit=0.92,apad=pad_dur=0.08" \
  -codec:a libmp3lame -b:a 80k output.mp3
```

Para una version didactica algo mas lenta:

```bash
ffmpeg -y -i input.wav \
  -ac 1 -ar 24000 \
  -af "atempo=0.94,loudnorm=I=-18:TP=-1.5:LRA=7,acompressor=threshold=-22dB:ratio=1.8:attack=8:release=80,alimiter=limit=0.92,apad=pad_dur=0.08" \
  -codec:a libmp3lame -b:a 80k output.mp3
```

No aplicar cambios distintos por archivo salvo correcciones auditadas: si cada
clip se trata manualmente, el corpus pierde homogeneidad.

## Que devolver al repo

Subir:

- `content/audio/ru/*.mp3` finales;
- `content/audio-index.json` regenerado;
- si cambia el proceso, actualizar `docs/audio-pipeline.md` o este documento.

No subir:

- modelos `.pt`, `.onnx`, checkpoints o caches;
- datasets de voz;
- voces de referencia privadas;
- claves;
- audios descartados de prueba salvo que esten en carpeta `preview` y se quieran conservar.

## Comprobacion final

Antes de publicar:

```bash
python scripts/generate_audio_manifest.py --write --ext mp3 --voice "voz-final"
python -m json.tool content/audio-index.json >/dev/null
find content/audio/ru -name '*.mp3' | wc -l
```

Comprobar en la web local:

```bash
python3 -m http.server 8000
```

Abrir la app y probar:

- botones `Escuchar` en biblioteca;
- dictados;
- ejercicios de escucha;
- ausencia de fallback a voz del navegador cuando el audio existe.
