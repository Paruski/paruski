# Paruski

Aplicación estática para organizar y practicar el aprendizaje del ruso.

## Objetivo

Centralizar materiales versionables: apuntes, vocabulario, repaso, transcripciones procesadas, protocolos y recursos auxiliares.

## Estructura

- `00-indice/`: mapas del curso, estado de cobertura y decisiones de organización.
- `01-clases/`: fichas por clase en Markdown.
- `02-gramatica/`: gramática acumulada y notas conceptuales.
- `03-vocabulario/`: vocabulario en CSV/TSV/Markdown.
- `04-repaso/`: ejercicios activos y tarjetas de práctica.
- `05-transcripciones/`: transcripciones originales o depuradas.
- `06-recursos/`: enlaces, bibliografía y material auxiliar.
- `protocolos/`: reglas de mantenimiento y control de calidad.

## Regla de trabajo

No se considera cerrado un bloque de clases si falta alguna de estas piezas cuando corresponda:

1. ficha de clase;
2. vocabulario con ejemplo y pronunciación;
3. reglas nuevas en gramática acumulada;
4. ejercicios de repaso si la clase está activa o vista;
5. actualización del índice de cobertura.

## Web

La web funciona como aplicación estática en GitHub Pages. El progreso puede guardarse localmente y sincronizarse con el repositorio cuando esa función esté implementada.
