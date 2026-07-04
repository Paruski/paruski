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

## Experiencia motivadora

- La web debe ser agradable, sencilla y fácil de usar.
- Debe minimizar obstáculos para empezar a practicar y volver cada día.
- Debe resultar adictiva en el buen sentido: progreso claro, sesiones cortas, recompensas útiles y sensación frecuente de avance real.
- La motivación no debe depender solo de gamificación; también debe venir de comprensión rápida, mejora visible y aplicación real de lo aprendido.
- Cada bloque debe conectar lo aprendido con frases, situaciones o tareas comunicativas reales.
- Evitar pantallas densas, fricción innecesaria y decisiones ambiguas para el usuario.

## Tipos de ejercicios

- Soportar ejercicios variados: elección múltiple, respuesta abierta, completar huecos, traducción, dictado, transcripción, comprensión lectora y comprensión oral.
- Incluir ejercicios con imágenes: elegir imagen, describir imagen, asociar palabra e imagen, audio a imagen y producción guiada por imagen.
- Incluir ejercicios con audio: transcripción, dictado, comprensión con elección múltiple, audio a imagen, audio a traducción y respuesta abierta.
- Cada ejercicio debe declarar modalidad: texto, imagen, audio o combinaciones multimodales.
- El sistema debe registrar métricas específicas: reintentos, repeticiones de audio, tiempo de respuesta, confianza, tipo de error y targets afectados.
- Los ejercicios de producción propia deben tener corrección flexible, pero los de elección múltiple deben evaluar opciones explícitas.

## Imágenes y audio

- Las imágenes didácticas generadas deben ser simples, reutilizables y coherentes visualmente.
- Guardar imágenes derivadas en `assets/images/` con nombres estables y sin datos personales.
- Para audio, soportar archivos pregrabados en `assets/audio/` y texto TTS como alternativa.
- Si se usa una herramienta TTS externa o local, generar los archivos fuera del navegador y subir solo los audios finales.
- Nunca subir claves de servicios TTS al repo ni exponerlas en la web.
- Mantener un fallback con SpeechSynthesis del navegador cuando no exista audio pregrabado.

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
5. estructura estable para cargar materiales extraídos;
6. esquema multimedia de ejercicios con imágenes, audio y TTS.
