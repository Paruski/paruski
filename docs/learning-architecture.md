# Arquitectura de aprendizaje

Paruski repasa targets linguisticos, no ejercicios aislados. Un ejercicio es una muestra concreta de vocabulario, estructura, habilidad, modalidad y direccion; el evento copia esos targets para que el historial siga siendo interpretable si el ejercicio cambia.

## Progresion

- `unlockedLessonMax` indica hasta donde puede consultar el usuario.
- `studyLessonMax` indica hasta donde puede practicar la sesion guiada.
- La calibracion tipo Elo ordena dificultad dentro de `studyLessonMax`, pero no permite saltos a lecciones lejanas si las anteriores no estan cubiertas.
- Una leccion se considera cubierta solo cuando hay exposicion suficiente a sus targets, cobertura de gramatica y dominio medio minimo.

## SRS

Cada target guarda intentos, aciertos, fallos, lapsos, dominio por habilidad, `interval_days` y `next_due_at`.

- Un acierto aumenta dominio e intervalo segun seguridad inferida.
- Un error o `No sé` reduce dominio, incrementa lapses y vuelve pronto.
- `Resolver luego` reprograma sin aumentar dominio ni contar como fallo completo.
- Produccion, transformacion y escucha afectan habilidades distintas; reconocer una opcion no equivale a dominar produccion.

## Eventos

Cada evento guarda:

- accion usada: `responder`, `no_se` o `resolver_luego`;
- targets y snapshot de metadatos;
- competencias inferidas;
- respuesta, esperado, error, tiempo, dificultad e importancia;
- estado SRS antes y despues.

Esta estructura permite auditar el progreso por target aunque se amplie el curriculo.
