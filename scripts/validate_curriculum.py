#!/usr/bin/env python3
"""Validate content/curriculum.json: 80 lessons, required fields, status consistency."""
import json, sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
errors = []

with open(ROOT / 'content/curriculum.json') as f:
    cur = json.load(f)

if len(cur) != 80:
    errors.append(f"Expected 80 lessons, got {len(cur)}")

nums = [l['number'] for l in cur]
if nums != list(range(1, 81)):
    errors.append("Lessons not numbered 1-80 sequentially")

ids = [l['id'] for l in cur]
dups = {k: v for k, v in Counter(ids).items() if v > 1}
if dups:
    errors.append(f"Duplicate IDs: {dups}")

required = [
    'id','number','title','approxLevel','status','communicativeTheme','summary',
    'communicativeObjectives','grammarObjectives','activeVocabularyThemes',
    'passiveVocabularyThemes','newStructures','recycledStructures','cases',
    'skills','typicalErrorsForSpanishSpeakers','criticalTargets',
    'expectedProduction','expectedComprehension','closingExam','unlockCriteria',
    'previousLessonLinks','implementationNotes'
]
for entry in cur:
    n = entry['number']
    for f in required:
        if f not in entry:
            errors.append(f"L{n}: missing '{f}'")

valid_statuses = {'complete', 'partial', 'planned', 'needs_review'}
for entry in cur:
    n, st = entry['number'], entry.get('status', '')
    if st not in valid_statuses:
        errors.append(f"L{n}: invalid status '{st}'")

for entry in cur[:5]:
    if entry.get('status') == 'planned':
        errors.append(f"L{entry['number']}: 'planned' but has real content")

for entry in cur[5:]:
    if entry.get('status') == 'complete':
        errors.append(f"L{entry['number']}: 'complete' but no exercises")

for entry in cur:
    if not entry.get('communicativeObjectives') and not entry.get('grammarObjectives'):
        errors.append(f"L{entry['number']}: no objectives")

for entry in cur[:5]:
    e = entry.get('closingExam', {})
    for kind in ('vocabulary', 'grammar', 'mixed', 'full'):
        if not e.get(kind):
            errors.append(f"L{entry['number']}: missing {kind} exam")
for entry in cur[5:]:
    e = entry.get('closingExam', {})
    for kind in ('vocabulary', 'grammar', 'mixed', 'full'):
        if e.get(kind):
            errors.append(f"L{entry['number']}: has {kind} exam but no exercises")

if errors:
    print(f"CURRICULUM VALIDATION: {len(errors)} FAILURES")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
print(f"CURRICULUM VALIDATION: PASSED ({len(cur)} lessons, all checks OK)")
