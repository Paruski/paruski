# Paruski

Curso interactivo de ruso para hispanohablantes. Web estática, sin dependencias
ni paso de compilación, publicada en GitHub Pages desde la raíz del repositorio:
https://paruski.github.io/paruski/

Objetivo final: 100 unidades con lección, ejercicios y examen obligatorio para
desbloquear la siguiente, cubriendo todas las destrezas (pasiva y activa, texto y
audio, reconocer, recordar, inferir y producir), con repaso espaciado programado
sobre las competencias que hay debajo de los ítems y no sobre los ítems.

Estado: prototipo funcional con las unidades **001–011**.

## Antes de tocar nada

Lee `docs/prototipo.md`. Explica la arquitectura, de dónde sale cada pieza de
contenido y por qué las decisiones son las que son. `curso/informe-build.json`
recoge qué ítems se descartaron y por qué.

## Comandos

```bash
python3 scripts/build_prototipo.py         # regenera curso/ desde los materiales de CLAUDE/
node scripts/test_prototipo.mjs            # 44 comprobaciones (necesita: npm install jsdom)
python3 scripts/generar_audio.py --lista   # inventario de locuciones pendientes
python3 -m http.server 8000                # servir la web (file:// no funciona)
```

## Estructura

| Pieza | Ruta |
| --- | --- |
| Web | `index.html`, `app/*.js`, `app/app.css` |
| Contenido de ejecución (generado) | `curso/curriculum.json`, `curso/unidades/unidad-0NN.json` |
| Materiales de origen | `CLAUDE/*.zip`, `CLAUDE/leccion_011_*.json` |
| Lecciones redactadas U001–U010 | `curso/fuentes/lecciones-001-010.json` |
| Generadores | `scripts/build_prototipo.py`, `scripts/generar_audio.py` |
| Pruebas | `scripts/test_prototipo.mjs` |
| Web anterior | `legacy.html` (con sus antiguos `assets/` y `content/`) |

**`curso/` es contenido generado.** Nunca se edita a mano: se corrige
`scripts/build_prototipo.py` o `curso/fuentes/lecciones-001-010.json` y se
reconstruye. Un cambio directo en el JSON se pierde en el siguiente build.

## Invariantes

Hay pruebas que vigilan cada una de éstas. Si una falla, el problema es el
cambio, no la prueba.

1. **Todo ítem se corrige solo, de forma determinista.** Lo que no admita
   comprobación automática no se publica. No hay rúbricas que evalúe una persona.
2. **Ningún paso exige teclear diacríticos combinantes.** El acento editorial se
   muestra, se pregunta señalando la vocal tónica, pero no se escribe.
3. **Ninguna elección múltiple ofrece opciones indistinguibles en pantalla.**
   Dos formas que sólo difieren en un homoglifo latino (`хлеб` / `хлeб`) son la
   misma imagen: esas tareas son de escritura, no de elección.
4. **Los distractores no se inventan.** Salen del propio material: afirmaciones
   que declara falsas, la regla rival, o el fenómeno lingüístico de las
   competencias con las que la evaluada se confunde. Todas las opciones de una
   pregunta comparten forma gramatical, para que la correcta no se delate. Si no
   hay al menos dos distractores creíbles, la pregunta no se plantea.
5. **Las consignas no revelan la respuesta.** Ni en el enunciado, ni en el orden
   de presentación.
6. **Cada paso escrito declara qué se espera**: una frase, dos frases en
   cualquier orden, o una respuesta breve en español.
7. **Los ítems de examen no aparecen nunca en la práctica.**
8. **El repaso se programa sobre competencias**, atacando su dimensión más débil
   y buscando un contexto distinto del ya visto, no sobre ítems concretos.
9. **La corrección no premia el reconocimiento como si fuera recuperación.** Una
   elección múltiple acredita reconocimiento; producir sin pista acredita
   recuperación, y con siete días o más de intervalo, retención diferida.

## Criterios de corrección (`app/grader.js`)

- Ruso: comparación normalizada (sin marca de acento, ё = е salvo cuando la ё es
  justamente lo evaluado, mayúsculas y punto final indiferentes). Una sola letra
  de diferencia se marca como errata y permite reintentar.
- Español: cobertura de palabras de contenido por lema aproximado; con respuestas
  muy cortas, comparación completa sin acentos.
- Intercambios: se exige cada frase requerida, en cualquier orden.

La normalización de `app/util.js` y la de `scripts/build_prototipo.py` tienen que
seguir siendo equivalentes. Si se cambia una, se cambia la otra y se ejecutan las
pruebas: hay una que comprueba que las 1029 respuestas modelo del curso se
autocorrigen como correctas.

## Estilo

- Todo en español: interfaz, comentarios, mensajes de commit, nombres nuevos.
- JavaScript de navegador sin dependencias ni build: módulos ES nativos.
- Python de biblioteca estándar.
- Comentarios que expliquen por qué, no qué.

## Pendiente

1. **Validación de hablante nativo**: sigue sin hacerse, y así se declara en la web.
2. **La dimensión auditiva no se evalúa**: ya hay locución para las 941 frases y
   palabras del curso, pero ningún ítem la usa todavía.
3. **Ejercicios que no miden lo que dicen medir**: los de «Escritura cirílica»
   muestran la forma contaminada, que en pantalla es idéntica a la correcta, y
   sólo piden copiarla. Acreditan teclear en cirílico, no distinguir homóglifos,
   que es lo que declara su competencia. Decidir si se replantean o se retiran.
4. Unidades 012–100: no empezarlas hasta cerrar lo anterior.

Hecho: publicación, revisión visual en navegador, audio completo (941/941) y
recorrido de la ruta lección → tandas → examen → desbloqueo.
