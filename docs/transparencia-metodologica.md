# Transparencia metodologica de Paruski

Este documento resume como se esta construyendo la web y que decisiones son reproducibles. Complementa `docs/architecture.md`, `docs/methodology-implementation.md` y `docs/audio-pipeline.md`.

## Objetivo didactico

Paruski no se disena como una biblioteca de enlaces. La pantalla principal es una sesion guiada que decide que explicar, que practicar y cuando repasar. El alumno debe poder avanzar dejando que la app le muestre el siguiente paso.

La ruta trabaja cuatro capas:

- vocabulario frecuente y util por campo lexico;
- patrones gramaticales productivos;
- escucha y produccion escrita;
- repaso espaciado basado en errores reales.

## Arquitectura

La web sigue siendo estatica y compatible con GitHub Pages. El navegador carga JSON versionado desde `content/` y modulos desde `assets/`.

La app se organiza asi:

- `assets/core/`: normalizacion de contenido, scheduler, audio, progreso, eventos y competencias.
- `assets/features/`: sesion guiada, biblioteca, calendario, progreso, sincronizacion y ajustes.
- `assets/exercises/`: renderizado y evaluacion de tipos de ejercicio.
- `content/`: lecciones, materiales, vocabulario, ejercicios, notas, competencias e indice de audio.
- `scripts/`: mantenimiento offline de contenido y audio.

El script `scripts/enrich_learning_content.py` actualiza contenido derivado sin meter reglas didacticas dentro de la interfaz. Genera metadatos de lecciones, vocabulario anotado, seleccion lexica y banco de ejercicios.

## Seleccion lexica

El vocabulario nuevo se incorpora por una combinacion de:

1. Frecuencia de uso estimada.
2. Campo lexico necesario para comunicacion real.
3. Productividad gramatical dentro de la ruta.
4. Posibilidad de practicar la palabra en frases cortas.

No se anaden palabras aisladas solo por decorar una lista.

Fuentes usadas como criterio:

- `wordfreq 3.1.1`: usado localmente para estimar frecuencia Zipf en ruso. Para ruso combina Wikipedia, subtitulos, noticias, libros y Twitter segun su documentacion publica: https://github.com/rspeer/wordfreq
- Nuevo diccionario de frecuencias de la lexica rusa: http://dict.ruslang.ru/freq.php
- General Internet Corpus of Russian, como referencia de lengua moderna web/social: http://www.webcorpora.ru/en/
- Russian National Corpus, como referencia corpus/lematizacion de ruso: https://ruscorpora.ru/

El resultado derivado se guarda en `content/lexical-selection.json`. No se redistribuyen listas de frecuencia externas completas; solo se guardan puntuaciones y razones para las entradas seleccionadas.

## Ejercicios

El banco actual se genera y se cura para evitar ejercicios absurdos o ultrafaciles.

Tipos usados:

- `dictation`: escucha y escritura exacta de frases rusas.
- `listen-choice`: discriminacion auditiva entre frases plausibles.
- `cloze`: completar una palabra relevante dentro de una frase.
- `production-prompt`: producir una frase propia que use el objetivo.
- `transform`: transformar formas rusas, especialmente casos y patrones.
- `multiple-choice` y `text-input`: reconocimiento y recuperacion cuando son adecuados.

El scheduler no se limita a recorrer una lista. Prioriza objetivos nuevos, vencidos, fallados o con baja competencia, y mezcla modalidades para evitar memoria mecanica por bloque.
La calibracion inicial usa un rating con incertidumbre alta: las primeras sesiones se ordenan de facil a dificil y permiten subir rapido si hay aciertos consistentes. Al acumular evidencia, baja la incertidumbre y el scheduler se concentra en objetivos cercanos al nivel estimado.

Estado actual del banco:

- 375 ejercicios estaticos/derivados.
- 0 ejercicios huerfanos tras la normalizacion de targets en navegador.
- El arranque de una cuenta nueva prioriza vocabulario y frases naturales antes de etiquetas gramaticales abstractas.
- Los botones de audio en explicaciones evitan locutar etiquetas con simbolos y prefieren palabras o ejemplos rusos naturales.
- Los ejercicios de escucha incluyen mini-dialogos con preguntas inferenciales y opciones cercanas, no solo repeticion literal.

## Audio

La web usa audio estatico, no voces obligatorias del navegador.

Voz aceptada para la generacion:

- Modelo: `tts_models/multilingual/multi-dataset/xtts_v2`.
- Licencia del modelo: Coqui Public Model License, aceptada por el usuario para uso no comercial.
- Fuente del modelo: https://huggingface.co/coqui/XTTS-v2
- Voz de referencia humana: LibriVox `Степные сказки`, leida en ruso por Anastasiia Solokha.
- Fuente de referencia: https://archive.org/details/stepnyyeskazki_2204_librivox

Postproceso aplicado por `scripts/generate_xtts_audio.py`:

- MP3 mono a 24 kHz;
- `tempo=0.96`;
- margen inicial de 60 ms;
- cola de 350 ms;
- normalizacion loudness a -19 LUFS;
- bitrate 96 kbps.

El manifiesto de audio se genera desde `content/paruski-db.json`, `content/materials.json`, `content/materials-aspect.json` y `content/learning-notes.json`. El filtro actual excluye textos con letras latinas para evitar locutar glosas espanolas como si fueran ruso.
Tambien recoge `tts_text` de ejercicios de audio para publicar dialogos de comprension. Antes de llamar a XTTS, el script elimina puntuacion hablable del texto de entrada; asi el contenido escrito conserva puntos e interrogaciones, pero el modelo no pronuncia esos signos.

Estado conocido el 2026-07-06: tras la reparacion de puntuacion y la adicion de dialogos hay 1123 necesidades de audio validas. Las 1123 locuciones estan generadas en `content/audio/ru/` e indexadas en `content/audio-index.json`. El indice solo referencia archivos existentes, por lo que no deja enlaces rotos.

## Practica oral futura

Existe una seccion experimental `Hablar`, todavia sin grabacion ni procesamiento activo. Su finalidad futura es alojar ejercicios donde el alumno hable y un LLM local procese la respuesta en un entorno estructurado. La restriccion metodologica es que audio, transcripcion y feedback deben poder ejecutarse localmente o con consentimiento explicito, sin convertirlo en dependencia obligatoria de la web estatica.

## Validacion

Validaciones que deben ejecutarse antes de publicar:

```bash
find content data schemas -name '*.json' -exec jq empty {} +
./.venv/bin/python -m py_compile scripts/enrich_learning_content.py scripts/generate_audio_manifest.py scripts/generate_xtts_audio.py
./.venv/bin/python scripts/generate_audio_manifest.py --write --ext mp3 --voice xtts-v2-anastasiia-librivox-cpml-noncommercial
jq '.entries | length' content/audio-index.json
git diff --check
chromium --headless --disable-gpu --no-sandbox --virtual-time-budget=8000 --dump-dom http://127.0.0.1:8080/
```

Para una publicacion completa de audio, el numero de entradas del indice debe coincidir con `total` en `content/audio-worklist.json`.

Ultima validacion local:

- JSON valido en `content/`, `data/` y `schemas/`.
- Scripts Python compilados.
- `git diff --check` sin errores.
- `bun build assets/app.js --target=browser` empaqueta los modulos JS sin errores.
- Chromium headless no pudo usarse en esta pasada: el binario del entorno aborto con codigo 133 antes de devolver DOM.
- `content/audio-worklist.json`: 1123 necesidades.
- `content/audio-index.json`: 1123 entradas existentes.
