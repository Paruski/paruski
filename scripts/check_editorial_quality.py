"""Check editorial quality: quoting conventions, ambiguous prompts, runtime safety."""
import json
import re
import sys

errors = []

with open('content/exercises.json') as f:
    exercises = json.load(f)

# 1. Check quoting in exercises L1-5
bad_quotes = 0
for ex in exercises:
    lesson = int(ex.get('lesson', 0))
    if lesson < 1 or lesson > 5:
        continue
    prompt = str(ex.get('prompt', ''))
    if '"' in prompt:
        errors.append(f"BAD_QUOTE: L{lesson} {ex.get('id')}: still has ASCII quotes: {prompt[:80]}")
        bad_quotes += 1
    # Check single quotes not part of apostrophes
    if "'" in prompt and '«' not in prompt:
        cleaned = re.sub(r"\b\w+'\w+\b", '', prompt)  # remove internal apostrophes
        cleaned = re.sub(r"\b\w+’\w+\b", '', cleaned)  # remove curly apostrophes too
        if "'" in cleaned or '’' in cleaned:
            errors.append(f"BAD_QUOTE: L{lesson} {ex.get('id')}: still has single quotes: {prompt[:80]}")

# 2. Check for ambiguous 'у ... есть' prompts
person_markers_es = ['tú', 'tu ', 'tuyo', 'tus', 'yo', 'mi ', 'mío', 'mía',
                     'él', 'ella', 'nosotros', 'nosotras',
                     'vosotros', 'vosotras', 'ellos', 'ellas', 
                     'usted', 'ustedes', 'quién', 'quien', 'quiénes',
                     'tienes', 'tiene', 'tenéis', 'tienen', 'tengo', 'tenemos']
person_markers_ru = ['я ', 'ты ', 'он ', 'она ', 'оно ', 'мы ', 'вы ', 'они ']

ambiguous = 0
for ex in exercises:
    lesson = int(ex.get('lesson', 0))
    if lesson < 1 or lesson > 5:
        continue
    expected = str(ex.get('expected', ''))
    prompt = str(ex.get('prompt', ''))
    display = str(ex.get('display', ''))
    e_low = expected.lower()
    
    if not any(w in e_low for w in ['у тебя', 'у меня', 'у нас', 'у вас', 'у него', 'у неё', 'у них']):
        continue
    if ex.get('type') == 'error-correction' and display:
        continue
    
    combined = (prompt + ' ' + display).lower()
    has_person = any(m in combined for m in person_markers_es + person_markers_ru)
    
    if not has_person and ex.get('type') in ('text-input', 'production-prompt', 'transform', 'cloze'):
        errors.append(f"AMBIGUOUS: L{lesson} {ex.get('id')} expected={expected[:60]} prompt={prompt[:80]}")
        ambiguous += 1

# 3. Check runtime content-store doesn't load auxiliary JSONs
with open('assets/core/content-store.js') as f:
    content_store = f.read()
if 'vocab-drills.json' in content_store:
    errors.append("CONTENT_STORE: vocab-drills.json still loaded at runtime")
if 'authored-' in content_store:
    errors.append("CONTENT_STORE: authored-* JSONs still referenced at runtime")

# Report
print("=" * 60)
print("EDITORIAL QUALITY CHECK")
print("=" * 60)
if bad_quotes:
    print(f"  ASCII or single quotes in L1-5 prompts: {bad_quotes}  ❌")
else:
    print(f"  ASCII or single quotes in L1-5 prompts: 0  ✅")
if ambiguous:
    print(f"  Ambiguous 'у + есть' prompts: {ambiguous}  ❌")
else:
    print(f"  Ambiguous 'у + есть' prompts: 0  ✅")
aux_issues = any('CONTENT_STORE' in e for e in errors)
print(f"  Runtime loads auxiliary JSONs: {'Yes  ❌' if aux_issues else 'No  ✅'}")

if errors:
    print("\n  Details:")
    for e in errors:
        print(f"    - {e}")
    sys.exit(1)
else:
    print("\n  All editorial checks passed.")
    sys.exit(0)
