# Paruski

Curso interactivo de ruso para hispanohablantes. Web estática publicada en
GitHub Pages: https://paruski.github.io/paruski/

## Estado

Prototipo funcional con las **unidades 001–011**: lección, práctica con
corrección automática de todos los ítems, examen obligatorio para desbloquear la
unidad siguiente y repaso espaciado programado sobre competencias.

Documentación del prototipo: [`docs/prototipo.md`](docs/prototipo.md).

```bash
python3 scripts/build_prototipo.py   # regenera curso/ desde los materiales corregidos
node scripts/test_prototipo.mjs      # pruebas (requiere jsdom)
```

## Estructura

- `index.html`, `app/` — la web.
- `curso/` — contenido de ejecución generado.
- `CLAUDE/` — materiales corregidos de origen (U001–U010 y U011).
- `content/audio/` — banco de locuciones estáticas.
- `legacy.html`, `assets/` — versión anterior de la web, conservada.
- `00-indice/`…`06-recursos/`, `protocolos/` — materiales y protocolos previos.

## Regla de trabajo

No se considera cerrado un bloque de clases si falta alguna de estas piezas cuando corresponda:

1. ficha de clase;
2. vocabulario con ejemplo y pronunciación;
3. reglas nuevas en gramática acumulada;
4. ejercicios de repaso si la clase está activa o vista;
5. actualización del índice de cobertura.

## Web

La web funciona como aplicación estática en GitHub Pages. El progreso puede guardarse localmente y sincronizarse con el repositorio cuando esa función esté implementada.
