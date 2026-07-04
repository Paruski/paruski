# Roadmap de producto Paruski

Este documento recoge requisitos de producto para implementar después de estabilizar la arquitectura de la web y la sincronización con GitHub.

## Fuente de materiales

- Usar transcripciones de un curso de ruso básico solo como fuente de extracción.
- No subir las transcripciones originales ni texto bruto de las transcripciones.
- Subir únicamente material derivado y estructurado: lecciones, vocabulario, gramática, ejemplos, ejercicios, targets y metadatos didácticos.
- Revisar privacidad antes de cada carga de contenido.

## Progresión escalonada

- El aprendizaje debe estar organizado por niveles o etapas.
- Cada nivel debe declarar competencias mínimas medibles.
- El usuario debe demostrar una competencia mínima antes de acceder al siguiente nivel.
- El desbloqueo debe basarse en métricas variadas, no solo porcentaje global de aciertos.
- Las métricas candidatas incluyen dominio por vocabulario, reglas gramaticales, producción, comprensión, precisión reciente, estabilidad del recuerdo y errores recurrentes.

## Metodología de aprendizaje

- Implementar repetición espaciada por targets, no solo por ejercicio.
- Aplicar recuperación activa, feedback inmediato, intercalado, práctica de producción y análisis de errores recurrentes.
- Investigar y documentar las decisiones metodológicas antes de cerrar la implementación.
- La cola de repaso debe considerar dificultad, importancia, antigüedad, historial de errores, confianza y tiempo de respuesta.

## Gamificación moderada

- Añadir progreso cuantificable sin convertir la app en ruido visual.
- Mostrar recompensas útiles y sobrias: rachas, insignias, hitos, niveles, barras de avance y objetivos diarios/semanales.
- Las recompensas deben reforzar hábitos reales de aprendizaje, no solo acumulación superficial de puntos.
- Evitar mecánicas que incentiven respuestas rápidas pero descuidadas.

## Funciones sociales futuras

- Añadir comparación de nivel usando métricas diversas.
- Diseñar estas funciones con privacidad por defecto.
- No publicar datos personales ni asociables sin consentimiento explícito.
- Permitir comparación agregada o seudónima cuando sea posible.
- Separar progreso privado, métricas compartibles y datos públicos.

## Dependencias

Estas funciones dependen de:

1. sincronización GitHub estable y sin secretos en el repo;
2. esquema multidimensional de targets en ejercicios;
3. eventos de aprendizaje con identificadores únicos y datos suficientes;
4. política clara de privacidad y consentimiento;
5. estructura estable para cargar materiales extraídos.
