#!/usr/bin/env python3
"""Verifica que el examen de vocabulario pueda seleccionar muestras variadas."""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

with open(ROOT / "content/exercises.json") as f:
    ex = json.load(f)

errors = []

# 1. There must be candidates for lesson 1
l1 = [e for e in ex if e['lesson'] == 1]
manual = [e for e in l1 if 'manual-authored' in e.get('source','')]
drills = [e for e in l1 if e.get('source') == 'vocab-drill']
total = len(manual) + len(drills)

if total < 5:
    errors.append(f"L1 vocab pool too small: {total} < 5")
else:
    print(f"  L1 vocab pool: {total} candidates (OK)")

# 2. Multiple attempts produce different samples
import random
def sample_vocab(seed):
    random.seed(seed)
    pool = manual + drills
    # Deduplicate by lemmaId
    seen_lemmas = set()
    selected = []
    for e in sorted(pool, key=lambda x: random.random()):
        lemma = e.get('lemmaId') or e.get('targets',{}).get('lemmas',[None])[0]
        if lemma and lemma not in seen_lemmas:
            selected.append(e['id'])
            seen_lemmas.add(lemma)
        if len(selected) >= 5:
            break
    return selected

samples = [sample_vocab(i) for i in range(10)]
if len(set(tuple(s) for s in samples)) == 1:
    errors.append("All 10 samples are identical!")
else:
    print(f"  Samples varied: {len(set(tuple(s) for s in samples))} unique out of 10 (OK)")

# 3. No lemmaId repeated within a sample
for i, s in enumerate(samples):
    ids_in_sample = [e['id'] for e in manual+drills if e['id'] in s]
    lemmas = []
    for sid in s:
        lems = [e.get('lemmaId') for e in (manual+drills) if e['id'] == sid and e.get('lemmaId')]
        lemmas.extend(lems)
    if len(lemmas) != len(set(lemmas)):
        errors.append(f"Sample {i}: repeated lemmaId!")
print("  No lemmaId repeats within samples (OK)" if not any("repeated lemmaId" in e for e in errors) else "")

# 4. All sample IDs exist in exercises.json
all_ids = {e['id'] for e in ex}
for i, s in enumerate(samples):
    missing = [sid for sid in s if sid not in all_ids]
    if missing:
        errors.append(f"Sample {i}: missing IDs: {missing}")
print(f"  All sample IDs exist in exercises.json (OK)")

# 5. No duplicate IDs in exercises.json
from collections import Counter
dups = {k: v for k, v in Counter(e['id'] for e in ex).items() if v > 1}
if dups:
    errors.append(f"Duplicate IDs in exercises.json: {len(dups)}")

# Check grammar/mixed exam pools
for l in range(1,6):
    les = [e for e in ex if e['lesson'] == l]
    for kind in ['grammar', 'mixed']:
        pool = [e for e in les if e.get('unlock_exam') and e.get('exam_kind') == kind]
        if len(pool) < 5:
            errors.append(f"L{l} {kind} exam pool too small: {len(pool)} < 5")

if errors:
    print(f"\nFAILURES ({len(errors)}):")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print(f"\nAll checks passed.")
