# Aprendizaje basado en evidencia

Paruski debe tratar el aprendizaje como el centro del producto. La interfaz,
los ejercicios, el calendario, el audio y la medicion de progreso existen para
hacer que el alumno use ruso de forma cada vez mas autonoma.

## Principios de diseno

### Recuperacion activa

El alumno aprende mejor cuando intenta recuperar una forma o significado antes
de ver la respuesta. La app usa ejercicios como actos de aprendizaje, no como
un examen separado.

Aplicacion:

- la sesion presenta una explicacion breve solo cuando ayuda;
- despues exige elegir, completar, transformar, escuchar o producir;
- el feedback aparece despues del intento;
- los fallos vuelven pronto al plan.

Fuente base: Dunlosky et al. (2013) clasifican la practica de test como tecnica
de alta utilidad; Roediger y Karpicke (2006) muestran mejora de retencion
demorada con test-enhanced learning.

### Practica distribuida y repeticion espaciada

El mismo material reaparece cuando empieza a costar recuperarlo. Lo facil se
aleja, lo fallado vuelve antes.

Aplicacion:

- cada target tiene `next_due_at` e `interval_days`;
- el scheduler prioriza material vencido, nuevo, fallado y de bajo dominio;
- el calendario muestra repasos futuros;
- la confianza declarada modifica el intervalo.

Fuente base: Dunlosky et al. (2013) consideran la practica distribuida de alta
utilidad; los modelos de curva de olvido son habituales en tutores de
vocabulario y repeticion espaciada.

### Intercalado

Las sesiones no deben bloquearse en un solo tipo de material. Mezclar vocabulario,
gramatica, escucha y produccion obliga al alumno a discriminar y elegir.

Aplicacion:

- `interleaveTargets()` mezcla targets por tipo y nivel;
- `chooseExerciseType()` alterna modalidades;
- el rendimiento se mide por competencias, no solo por leccion.

### Feedback correctivo

El feedback debe indicar la forma esperada y el foco de error. No debe limitarse
a decir correcto/incorrecto.

Aplicacion:

- cada evaluador devuelve `error_type`;
- el evento guarda respuesta, esperado, confianza, tiempo y competencias;
- el modelo adaptativo aumenta prioridad de errores recurrentes.

Fuente base: la investigacion sobre corrective feedback en adquisicion de segundas
lenguas respalda que el feedback ayuda cuando conecta significado y forma y
permite reintento.

### Uso semantico, no declarativo

Aprender ruso no es recordar en que leccion aparece algo ni copiar formatos
internos. El alumno debe aplicar formas a significado, contexto y funcion.

Aplicacion:

- los ejercicios de gramatica generados eligen frases rusas que aplican una
  estructura, no nombres de reglas;
- se evita pedir copiar barras, metacodigo o frases largas sin apoyo;
- se introducen tareas de produccion semantica cuando el target ya tiene cierta
  evidencia;
- `content/competencies.json` separa competencias comunicativas, gramaticales,
  lexicas, morfologicas, modales y de recuperacion.

### Carga cognitiva razonable

El esfuerzo debe estar en el ruso. Si una respuesta falla por puntuacion,
barra, formato o una alternativa igualmente valida, el ejercicio esta mal
planteado.

Aplicacion:

- la evaluacion normaliza puntuacion, `ё/e` y variantes con barras;
- acepta variantes razonables y respuestas que contienen el target cuando la
  tarea es de produccion lexica;
- el scheduler filtra ejercicios estaticos de escritura cuando la respuesta es
  demasiado larga o no contiene ruso.

## Fuentes principales

- Dunlosky, Rawson, Marsh, Nathan & Willingham (2013), *Improving Students'
  Learning With Effective Learning Techniques*. DOI: `10.1177/1529100612453266`.
- Roediger & Karpicke (2006), *Test-Enhanced Learning*. DOI:
  `10.1111/j.1467-9280.2006.01693.x`.
- Lyster, Saito & Sato (2013), *Oral corrective feedback in second language
  classrooms*. DOI: `10.1017/S0261444812000365`.

## Regla de producto

Toda funcion nueva debe responder a una de estas preguntas:

- que recupera el alumno de memoria;
- que significado expresa o comprende;
- que feedback recibe;
- cuando volvera a repasarlo;
- que competencia observable mejora;
- como reduce o evita carga cognitiva irrelevante.

Si no responde a ninguna, no pertenece al nucleo de aprendizaje.
