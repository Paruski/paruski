# Plan de ejecucion manual

Este documento existe para que la siguiente sesion pueda retomar el trabajo sin
rehacer el diagnostico.

## Estado actual

- Ya existe separacion entre practica `vocabulary`, `grammar` y `mixed`.
- Ya existen tres examenes por leccion: `vocabulary`, `grammar`, `mixed`.
- Ya no se desbloquea la siguiente leccion hasta aprobar los tres examenes.
- La practica guiada ya permite elegir modo: `Todo`, `Vocabulario`,
  `Gramatica`, `Mixto`.
- La leccion 1 tiene:
  - 100 lemas manuales;
  - 8 estructuras manuales;
  - 15 preguntas de examen de vocabulario;
  - 15 preguntas de examen de gramatica;
  - 15 preguntas de examen mixto;
  - un bloque pequeno de practica manual de los tres modos.

## Volumen objetivo por leccion

Cada leccion debe terminar con este minimo:

- 100 lemas.
- 5-10 estructuras nuevas.
- 4 ejercicios de vocabulario por lema.
  - ruso->español tipo test;
  - ruso->español respuesta abierta cuando proceda;
  - español->ruso tipo test;
  - español->ruso respuesta abierta.
- 50 ejercicios de gramatica pura.
- 50 ejercicios mixtos.
- al menos 6 listenings complejos.
  - 2 monologos;
  - 2 dialogos breves;
  - 2 conversaciones reales o semirreales con inferencia.
- 15 preguntas de examen de vocabulario.
- 15 preguntas de examen de gramatica.
- 15 preguntas de examen mixto.

## Regla editorial

No usar generadores de ejercicios para gramatica, mixtos, listening ni examenes.

El algoritmo automatico permitido es el de seleccion, no el de generacion.

La automatizacion permitida es:

- seleccionar que ejercicio manual mostrar segun modo, progreso, intercalado y
  no repeticion;
- seleccionar preguntas aleatorias dentro de bancos manuales ya escritos.
- generar, si se decide usarlo, vocabulario puro de recuperacion mecanica del
  tipo `como se dice X?`, siempre que sea una sola palabra o lema y quede fuera
  del nucleo manual de gramatica, mixto y listening.

La automatizacion no puede crear nuevos enunciados, distractores, respuestas,
conversaciones, audios, transformaciones ni variantes de ejercicios.

Solo se admite automatizacion para:

- validacion JSON;
- conteos;
- chequeo de rutas/imports;
- preguntas de vocabulario de traduccion aislada si se marcan como banco
  mecanico de recuperacion pura.

Todo ejercicio mixto, de gramatica y de listening debe ser authored a mano.
Los examenes de gramatica y mixtos deben ser authored a mano.
Evitar redundancia estructural: no encadenar varias preguntas equivalentes con
la misma estructura visible cuando no anaden dificultad, contraste o cambio de
direccion.

## Criterios de enunciado

- Prompt breve.
- Contexto claro.
- Sin revelar la estrategia de solucion.
- Evitar prompts del tipo:
  - "sin usar una traduccion literal de...";
  - "debes acertar lema y concordancia...";
  - "elige la version que...".
- Preferir:
  - `Traduce al ruso: "..."`.
  - `Corrige la frase.`
  - `Elige la frase rusa.`
  - `Completa la frase.`
  - `Escucha y responde.`

## Arquitectura de contenido

Archivos actuales relevantes:

- [content/manual-vocabulary.json](/home/berka/codex-dir/paruski/content/manual-vocabulary.json)
- [content/manual-grammar.json](/home/berka/codex-dir/paruski/content/manual-grammar.json)
- [content/manual-exercises.json](/home/berka/codex-dir/paruski/content/manual-exercises.json)
- [docs/b1-curriculum-80-lessons.md](/home/berka/codex-dir/paruski/docs/b1-curriculum-80-lessons.md)

Campos a mantener en ejercicios manuales:

- `exam_kind`: `vocabulary`, `grammar`, `mixed` para bancos y filtros.
- `exam_question_type`: categoria para muestreo aleatorio dentro del banco.
- `unlock_exam`: `true` solo para preguntas de examen.
- `design: "single_intent"` cuando el item sea deliberadamente focal.

## Orden de trabajo recomendado

1. Terminar de pulir la leccion 1.
2. Crear leccion 2 completa manual.
3. Crear lecciones 3-5 manuales antes de ampliar UI o audio.
4. Introducir listenings complejos authored.
5. Revisar la politica de examen si 15 preguntas por banco se queda corta.

## Backlog inmediato

1. Expandir la practica normal manual de la leccion 1.
   Ahora hay pocos items no-examen; hacen falta muchos mas para que `Todo` no
   dependa tanto del corpus heredado.
2. Recortar mas prompts verbosos en `manual-exercises.json`.
3. Crear bancos de listening manuales.
4. Añadir modo de practica visible tambien en ajustes si se quiere persistencia
   mas explicita.
5. Revisar si la leccion 1 deberia exigir tambien un minimo de listening en sus
   tres examenes.

## Riesgos

- El corpus heredado sigue coexistiendo con el manual.
- Mientras la practica manual siga siendo pequena, `all` mezclara authored nuevo
  con contenido antiguo.
- No hay todavia conversaciones reales en audio para la leccion 1.
- El volumen total pedido para 80 lecciones es enorme; sin disciplina editorial
  se volvera inconsistente.

## Definicion de completado por leccion

Una leccion se considera cerrada solo si:

- tiene sus 100 lemas;
- tiene sus 5-10 estructuras;
- tiene sus bancos de practica de los tres modos;
- tiene sus tres examenes completos;
- tiene listenings complejos;
- ha sido revisada para repeticion, longitud de prompt y densidad cognitiva.
