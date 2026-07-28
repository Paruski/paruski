#!/usr/bin/env bash
# Lo mismo que exige CI antes de publicar, en local y en el mismo orden.
#
#   scripts/verificar.sh
#
# Se para en el primer fallo: cada comprobación supone que la anterior pasó.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── 1/3 · el curso se reproduce desde el generador"
python3 scripts/build_prototipo.py > /dev/null
if ! git diff --quiet curso/; then
  echo "   FALLA: curso/ no coincide con lo que produce el generador." >&2
  echo "   curso/ es contenido generado: corrige el generador, no el JSON." >&2
  git diff --stat curso/ >&2
  exit 1
fi
echo "   ok"

echo "── 2/3 · las invariantes se cumplen"
if command -v node > /dev/null; then
  node scripts/test_prototipo.mjs
elif command -v bun > /dev/null; then
  bun scripts/test_prototipo.mjs
else
  echo "   FALLA: hace falta node (o bun) para las pruebas." >&2
  exit 1
fi

echo "── 3/3 · el curso cumple el modelo de aprendizaje"
python3 scripts/verificar_modelo.py
if ! git diff --quiet docs/matrices.md; then
  echo "   Las matrices han cambiado: revísalas y añádelas al commit." >&2
  git diff --stat docs/matrices.md >&2
  exit 1
fi

echo
echo "Todo en regla: el curso se puede publicar."
