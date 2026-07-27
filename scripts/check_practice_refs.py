"""Check guidedPracticeRefs are complete: error-correction/cloze must have a visible source phrase."""
import json
import sys
import re

with open('content/classes.json') as f:
    classes = json.load(f)
with open('content/exercises.json') as f:
    exercises = json.load(f)

ex_map = {e['id']: e for e in exercises}
errors = []

for lesson in classes:
    lid = lesson['lessonId']
    for ref in lesson.get('guidedPracticeRefs', []):
        ex = ex_map.get(ref)
        if not ex:
            errors.append(f"L{lid}: ref '{ref}' not found")
            continue
        
        prompt = str(ex.get('prompt', ''))
        display = str(ex.get('display', ''))
        etype = ex.get('type', '')
        
        # Check if display is present and meaningful
        has_display = bool(display and len(display) > 3)
        
        # Check if prompt itself contains the source phrase (quoted or with «»)
        has_source_in_prompt = bool(re.search(r'[«"\'][^«"\'»]{3,}[»"\']', prompt))
        
        # Check if prompt has a clear instruction and a quoted phrase
        has_instruction_and_phrase = len(prompt) > 30 and has_source_in_prompt
        
        # For error-correction: must have either display or source in prompt
        if etype in ('error-correction', 'cloze') and not has_display and not has_instruction_and_phrase:
            errors.append(f"L{lid} {ref}: {etype} without source phrase. prompt={repr(prompt[:100])}")
        
        # For text-input: prompt should be clear enough
        if etype == 'text-input' and len(prompt) < 20 and not has_display:
            errors.append(f"L{lid} {ref}: text-input prompt too short: {repr(prompt[:100])}")

print("=" * 60)
print("PRACTICE REFS COMPLETENESS CHECK")
print("=" * 60)
if errors:
    print(f"Errors: {len(errors)}")
    for e in errors:
        print(f"  ❌ {e}")
    sys.exit(1)
else:
    print("✅ All guidedPracticeRefs have complete, visible prompts")
    sys.exit(0)
