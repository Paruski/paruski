# Events

Esta carpeta guarda eventos de aprendizaje diarios en formato NDJSON.

Convención prevista:

- `YYYY-MM-DD.ndjson` para eventos diarios.
- Cada línea es un evento JSON independiente.
- Cada evento debe tener `event_id` para poder fusionar y deduplicar.
- No guardar claves ni datos personales innecesarios.
