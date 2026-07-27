"""Validate content/classes.json for pedagogical integrity."""
import json
import sys
import os

errors = []
warnings = []

# Load classes
with open('content/classes.json') as f:
    classes = json.load(f)

# Load exercises for ref checking
exercises_path = 'content/exercises.json'
ex_ids = set()
if os.path.exists(exercises_path):
    with open(exercises_path) as f:
        for ex in json.load(f):
            ex_ids.add(ex.get('id'))

# Load curriculum for status checking
curr_path = 'content/curriculum.json'
curr_status = {}
if os.path.exists(curr_path):
    with open(curr_path) as f:
        for l in json.load(f):
            curr_status[l['number']] = l.get('status', 'planned')

# 1. There should be classes for lessons 1-5
found_ids = [c['lessonId'] for c in classes]
for i in range(1, 6):
    if i not in found_ids:
        errors.append(f"Missing class for lesson {i}")

# 2. Required fields
REQUIRED_FIELDS = ['lessonId', 'title', 'goal', 'whyItMatters', 'spanishInterference',
                   'sections', 'summary', 'errorsToWatch', 'nextStep']

for c in classes:
    lid = c.get('lessonId', '?')
    for field in REQUIRED_FIELDS:
        if field not in c or (isinstance(c[field], str) and not c[field].strip()):
            errors.append(f"L{lid}: missing or empty required field '{field}'")
        if field == 'sections' and not c[field]:
            errors.append(f"L{lid}: sections is empty")

    # 3. Each section should have minimum fields
    for si, s in enumerate(c.get('sections', [])):
        if 'id' not in s:
            errors.append(f"L{lid} section {si}: missing 'id'")
        if 'type' not in s:
            errors.append(f"L{lid} section {si}: missing 'type'")
        if 'title' not in s:
            errors.append(f"L{lid} section {si}: missing 'title'")
        if 'content' not in s:
            errors.append(f"L{lid} section {si}: missing 'content'")

    # 4. At least one contrast or spanishInterference
    if not c.get('spanishInterference', '').strip():
        has_contrast = any(s.get('contrasts') for s in c.get('sections', []))
        if not has_contrast:
            errors.append(f"L{lid}: no contrast or spanishInterference found")

    # 5. Micro-checks present
    total_mc = sum(len(s.get('microChecks', [])) for s in c.get('sections', []))
    if total_mc == 0:
        warnings.append(f"L{lid}: no micro-checks found")

    # 6. guidedPracticeRefs point to existing exercises
    for ref in c.get('guidedPracticeRefs', []):
        if ref not in ex_ids:
            errors.append(f"L{lid}: guidedPracticeRef '{ref}' not found in exercises.json")

    # 7. At least one example
    total_ex = sum(len(s.get('examples', [])) for s in c.get('sections', []))
    if total_ex == 0:
        errors.append(f"L{lid}: no examples found")

    # 8. Check for excessive lemmaId repetition in guidedPracticeRefs
    # (we can't check lemmaIds without loading full exercises, but we can check ref count)
    refs = c.get('guidedPracticeRefs', [])
    if len(refs) > 6:
        warnings.append(f"L{lid}: {len(refs)} guidedPracticeRefs (max 6 recommended)")

    # 9. Lessons 6+ should not be marked complete
    if lid >= 6 and curr_status.get(lid) == 'complete':
        warnings.append(f"L{lid}: marked complete in curriculum but has no implemented exercises")

    # 10. examAvailable is boolean
    if 'examAvailable' not in c:
        warnings.append(f"L{lid}: missing 'examAvailable' field")

# Report
print("=" * 60)
print("CLASSES VALIDATION")
print("=" * 60)
print(f"  Classes found: {len(classes)}")
print(f"  IDs: {found_ids}")
print(f"  Errors: {len(errors)}")
print(f"  Warnings: {len(warnings)}")

for e in errors:
    print(f"  ❌ ERROR: {e}")
for w in warnings:
    print(f"  ⚠️  {w}")

if errors:
    print("\n  ❌ FAILED")
    sys.exit(1)
else:
    print("\n  ✅ PASSED")
    sys.exit(0)
