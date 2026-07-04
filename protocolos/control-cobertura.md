# Protocolo de control de cobertura

Este protocolo evita cerrar bloques de clases con huecos estructurales.

## Antes de modificar

1. Declarar alcance: clases, archivos y objetivo.
2. Leer los archivos afectados o sus índices.
3. Revisar pendientes previos.

## Durante la modificación

Cada clase del alcance debe comprobarse contra estas piezas:

| Pieza | Obligatoria cuando | Cierre permitido |
|---|---|---|
| Ficha | Siempre que se incorpore una clase | Existe y está en `01-clases/` |
| Gramática | La clase introduce regla o contraste | La regla aparece en `02-gramatica/` |
| Vocabulario | La clase introduce léxico o expresiones | Hay filas en `03-vocabulario/` o `No aplica` justificado |
| Repaso | La clase está vista o activa | Hay 3-5 ejercicios útiles en `04-repaso/` |
| Índice | Siempre | El estado del bloque queda reflejado |

## Después de modificar

1. Releer lo escrito.
2. Registrar pendientes reales.
3. No decir “cerrado” si queda una pieza crítica pendiente.

## Estados didácticos

- `preparado`: material estructurado, aún no necesariamente estudiado.
- `visto`: clase trabajada por el usuario.
- `activo`: entra en ejercicios de repaso.
- `pendiente`: falta una pieza estructural.
