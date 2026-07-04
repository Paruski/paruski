# Repeticion espaciada y analitica de errores

Los ejercicios deben declarar que examinan. Sin esa informacion, el sistema solo sabe si una respuesta concreta fue correcta, pero no sabe que vocabulario, estructura o habilidad debe reforzar.

## Unidad de evaluacion

Cada ejercicio apunta a varios objetivos:

- vocabulario;
- regla gramatical;
- estructura;
- habilidad;
- tipo de produccion.

Ejemplo conceptual:

```json
{
  "id": "ex-019-001",
  "lesson": 19,
  "skill": "gramatica",
  "targets": {
    "vocabulary": ["vocab-019-igrat-v", "vocab-futbol"],
    "grammar": ["grammar-019-igrat-v"],
    "structures": ["verb-plus-v-plus-accusative"],
    "abilities": ["production", "case-selection"]
  }
}
```

## Que se guarda al responder

El evento debe copiar los `targets` del ejercicio. Asi se puede actualizar el dominio de cada vocabulario, regla y habilidad.

## Programacion del repaso

La prioridad futura debe combinar:

- fallos recientes;
- baja confianza;
- tiempo desde ultimo intento;
- dificultad del item;
- importancia de la estructura;
- errores recurrentes;
- si la clase esta activa.

## Error util

No basta con `correct=false`. El sistema debe intentar clasificar errores:

- preposicion omitida;
- caso incorrecto;
- genero incorrecto;
- conjugacion incorrecta;
- orden incorrecto;
- vocabulario equivocado;
- respuesta vacia;
- forma casi correcta.

## Criterio de cierre

Una clase no esta consolidada si solo se aciertan frases aisladas. Deben estar estables sus objetivos: vocabulario, reglas, estructuras y habilidades.
