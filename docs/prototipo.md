# Prototipo funcional (unidades 001–011)

Web estática, sin dependencias ni paso de compilación, publicada en GitHub Pages
desde la raíz del repositorio.

## Qué hay

| Pieza | Ruta |
| --- | --- |
| Shell de la web | `index.html` |
| Aplicación | `app/*.js`, `app/app.css` |
| Contenido de ejecución | `curso/curriculum.json`, `curso/unidades/unidad-0NN.json` |
| Texto de lección redactado (U001–U010) | `curso/fuentes/lecciones-001-010.json` |
| Generador de contenido | `scripts/build_prototipo.py` |
| Pruebas | `scripts/test_prototipo.mjs` |
| Web anterior | `legacy.html` (los antiguos `assets/` y `content/` siguen en su sitio) |

## Fuentes de contenido

1. `CLAUDE/paruski_b1_materials_l001_l010_v1_9_3_EDITADO.zip` — paquete corregido
   de las unidades 001–010: 650 ejercicios, 246 entradas de vocabulario,
   38 competencias, núcleos semánticos, trayectorias y plan de evaluación.
2. `CLAUDE/leccion_011_acusativo_inanimado.json` — unidad 011 completa.
3. `curso/fuentes/lecciones-001-010.json` — el texto explicativo de las diez
   primeras unidades, que el paquete no traía, redactado con la misma estructura
   de la 011: idea central, interferencia español-ruso, modelos mínimos y errores
   que bloquean.

`python3 scripts/build_prototipo.py` regenera `curso/` y deja el detalle en
`curso/informe-build.json`.

## Corrección automática de todos los ítems

El paquete original resolvía 190 ejercicios con rúbrica abierta, no comprobables
por máquina. En el prototipo **todo ítem se corrige solo**, y para no perder la
exigencia cognitiva se reconvierten en tareas de varios pasos apoyadas en los
campos estructurados que el propio material ya traía:

| Tipo original | Se convierte en |
| --- | --- |
| Diagnóstico y reparación | Elegir el fenómeno que falla + escribir la intervención reparada |
| Contraste semántico | Elegir la forma adecuada + elegir qué la distingue + escribirla |
| Inducción de regla | Elegir la regla frente a la regla rival + aplicarla a un caso nuevo |
| Crítica de retrotraducción | Escribir la versión correcta + identificar la pérdida |
| Transferencia guiada | Escribir la intervención + justificar la decisión lingüística |
| Contraejemplo | Escribir el contraejemplo + explicar qué invalida |
| Vacío de información | Escribir el intercambio completo; se exige cerrar las dos lagunas |

Los distractores conceptuales no se inventan: salen de `forbiddenClaims`,
`rivalRule`, `claimToRefute` y de los conjuntos de confusión declarados entre
competencias. Lo que no admite comprobación determinista no se publica: de 715
ítems de partida se publican 708 (`informe-build.json` recoge los 7 descartes).

Criterios de corrección, en `app/grader.js`:

- **ruso**: comparación normalizada (sin marca de acento editorial, ё = е,
  puntuación final opcional). Una sola letra de diferencia se marca como errata y
  se permite reintentar.
- **español**: cobertura de palabras de contenido con coincidencia por lema
  aproximado; con respuestas muy cortas, comparación completa sin acentos.
- **intercambios**: se exige la presencia de cada frase requerida, en cualquier orden.

## Modelo del alumno y repaso

El repaso se programa **sobre competencias**, no sobre ítems. Cada competencia
lleva seis dimensiones (`app/store.js`), tomadas del esquema de progreso del
paquete:

comprensión explícita · reconocimiento escrito · recuperación escrita ·
transferencia contextual · retención diferida · reconocimiento auditivo.

- Una elección múltiple acierta **reconocimiento**, nunca **recuperación**.
- La producción sin pista acredita **recuperación**; si además han pasado siete
  días o más, acredita **retención diferida**.
- Acertar con pista cuenta menos y queda registrado como dependencia de clave.
- Intervalos 1 · 3 · 7 · 16 · 35 · 70 · 140 días; un fallo devuelve la
  competencia a la cola inmediata y suma recaída.
- Al tocar repasar, se elige el ítem que ataca la **dimensión más débil** de esa
  competencia, evitando el ítem ya visto si hay otro que ejercite lo mismo en
  otro contexto.

## Exámenes y desbloqueo

Cada unidad tiene su examen (4–6 ítems, entre 8 y 12 pasos). No hay corrección
hasta el final. Se aprueba con el 80 % de pasos correctos y sólo entonces se
abre la unidad siguiente. Los ítems de examen nunca aparecen en la práctica.

## Audio

Se usa el banco estático del repositorio (`content/audio/ru`, 1253 locuciones
XTTS-v2): cubre 157 de las 254 entradas de vocabulario. Para lo no grabado se
recurre a la voz del navegador, señalada como provisional en la interfaz.

Pendiente: generar las locuciones que faltan con el mismo modelo y la misma
configuración del banco (`scripts/generate_xtts_audio.py`). No se ha podido hacer
aquí porque el entorno de trabajo no tiene GPU ni acceso al modelo XTTS-v2.

## Pruebas

```bash
npm install jsdom          # sólo para las pruebas
node scripts/test_prototipo.mjs
```

Comprueba integridad del contenido, los criterios de corrección, la construcción
de sesiones, el efecto de acertar y fallar sobre la programación del repaso, el
desbloqueo por examen y que las 1029 respuestas modelo del curso se autocorrijan
como correctas.

## Límites conocidos

- Materiales con revisión editorial hecha, pero **sin validación de hablante
  nativo**; así se declaran en la propia web.
- La dimensión auditiva no se evalúa todavía: no hay locución validada.
- El progreso se guarda en `localStorage`, sin sincronización entre dispositivos.
- Quedan 89 unidades por desarrollar.
