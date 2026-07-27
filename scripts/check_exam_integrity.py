"""Check exam exercises for ambiguities: possessive without person, ambiguous cloze, grammar-vocab integrity."""
import json
import sys
import re

with open('content/exercises.json') as f:
    exercises = json.load(f)
with open('content/vocabulary.json') as f:
    vocab_data = json.load(f)

errors = []
exam_exercises = [e for e in exercises if e.get('unlock_exam') or e.get('exam')]

# === Grammar-Vocabulary Integrity Check ===
lesson_lemmas = {}
for v in vocab_data:
    lesson_num = int(v.get('lesson', v.get('lessonId', '0')))
    lemma = v.get('lemma', v.get('russian', v.get('text', ''))).lower().strip()
    lesson_lemmas.setdefault(lesson_num, set()).add(lemma)

known_up_to = {}
for max_l in sorted(lesson_lemmas):
    ks = set()
    for l in range(1, max_l + 1):
        ks.update(lesson_lemmas.get(l, set()))
    known_up_to[max_l] = ks

function_words = {
    'это', 'не', 'и', 'в', 'на', 'у', 'с', 'к', 'о', 'по', 'за', 'от', 'до', 'для',
    'без', 'из', 'а', 'но', 'или', 'что', 'кто', 'как', 'где', 'когда', 'почему',
    'да', 'нет', 'вот', 'я', 'ты', 'он', 'она', 'оно', 'мы', 'вы', 'они',
    'меня', 'нас', 'тебя', 'вас', 'его', 'её', 'их', 'мне', 'тебе', 'нам', 'вам',
    'мой', 'моя', 'моё', 'мои', 'твой', 'твоя', 'твоё', 'твои',
    'наш', 'наша', 'наше', 'наши', 'ваш', 'ваша', 'ваше', 'ваши'
}

russian_re = re.compile(r'[а-яёА-ЯЁ]+(?:-[а-яёА-ЯЁ]+)?')

def lemma_matches(word, known):
    wl = word.lower()
    if wl in known:
        return True
    # Verb conjugation endings
    verb_endings = [
        ('ю', 1), ('ешь', 4), ('ет', 3), ('ем', 3),
        ('ете', 4), ('ют', 3), ('ит', 3), ('им', 3),
        ('ите', 4), ('ат', 3), ('ят', 3),
        ('л', 1), ('ла', 2), ('ло', 2), ('ли', 2),
        ('у', 1), ('ёшь', 4), ('ёт', 3), ('ёте', 4), ('ут', 3),
    ]
    for ending, min_stem in verb_endings:
        if wl.endswith(ending) and len(wl) > len(ending) + min_stem:
            stem = wl[:-len(ending)]
            for inf in ('ать', 'ять', 'ить', 'еть', 'оть', 'уть', 'ыть', 'ти', 'ть', 'чь'):
                if stem + inf in known:
                    return True
    # Noun plural/case endings
    noun_endings = [
        ('ы', 1), ('и', 1), ('ов', 2), ('ей', 2),
        ('ам', 2), ('ями', 3), ('ах', 2),
        ('а', 1), ('у', 1), ('ом', 2), ('е', 1),
    ]
    for ending, min_stem in noun_endings:
        if wl.endswith(ending) and len(wl) > len(ending) + min_stem:
            stem = wl[:-len(ending)]
            if stem in known:
                return True
    return False

for ex in exam_exercises:
    eid = ex.get('id', '?')
    lesson_raw = ex.get('lesson', ex.get('lessonId', ''))
    if isinstance(lesson_raw, str) and lesson_raw.startswith('lesson_'):
        lesson = int(lesson_raw.split('_')[1])
    else:
        try:
            lesson = int(lesson_raw) if str(lesson_raw).isdigit() else 0
        except (ValueError, TypeError):
            lesson = 0
    if lesson <= 0 or lesson > 5:
        continue
    if ex.get('exam_kind') != 'grammar':
        continue
    expected = ex.get('expected', ex.get('expectedAnswer', ''))
    prompt = str(ex.get('prompt', ''))
    # Skip if already has gloss
    if '=' in prompt:
        continue
    russian_words = russian_re.findall(expected)
    known = known_up_to.get(lesson, set())
    unknown = []
    for w in russian_words:
        wl = w.lower()
        if wl in function_words:
            continue
        if lemma_matches(wl, known):
            continue
        unknown.append(w)
    if unknown:
        errors.append(f"L{lesson} {eid}: grammar exam requires vocabulary not taught: {unknown[:5]}. prompt={repr(prompt[:100])}")

# === Original checks ===
for ex in exam_exercises:
    eid = ex.get('id', '?')
    lesson = ex.get('lesson', '?')
    prompt = str(ex.get('prompt', ''))
    expected = str(ex.get('expected', ''))
    display = str(ex.get('display', ''))
    etype = ex.get('type', '')

    # 1. Check cloze exercises with possessive gap
    if etype == 'cloze' and '___' in display:
        d_low = display.lower()
        if 'у ___' in d_low or 'у_ ___' in d_low or 'у ___' in d_low.replace(' ', ' '):
            p_low = prompt.lower()
            has_person = bool(re.search(r'\b(tú|yo|él|ella|nosotros|vosotros|ellos|usted)\b', p_low)) or '(tú)' in p_low or '(yo)' in p_low
            if not has_person:
                errors.append(f"L{lesson} {eid}: possessive cloze without person. prompt={repr(prompt[:120])} display={repr(display[:80])}")

    # 2. Check for display being empty in error-correction exam exercises
    if etype == 'error-correction' and not display and not re.search(r'[«"\'][^«"\'»]{3,}[»"\']', prompt):
        errors.append(f"L{lesson} {eid}: error-correction without source phrase. prompt={repr(prompt[:100])}")

print("=" * 60)
print("EXAM INTEGRITY CHECK")
print("=" * 60)
print(f"  Exam exercises checked: {len(exam_exercises)}")
if errors:
    print(f"  Errors: {len(errors)}")
    for e in errors:
        print(f"  ❌ {e}")
    sys.exit(1)
else:
    print("  ✅ All exam exercises are unambiguous")
    sys.exit(0)
