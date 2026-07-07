#!/usr/bin/env python3
"""Generate audited, automatically correctable exercises for lessons 1-5.

The generator intentionally publishes only closed or exact-answer exercises.
Open production can be valuable, but it is not safe for deterministic grading.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXERCISES_PATH = ROOT / "content" / "exercises.json"
AUDIT_JSON_PATH = ROOT / "docs" / "exercise-audit-first5.json"
AUDIT_MD_PATH = ROOT / "docs" / "exercise-audit-first5.md"

FOUNDATION_LESSONS = {1, 2, 3, 4, 5}
TARGET_PER_LESSON = 100
EXAM_PER_LESSON = 20
ITERATIONS = 10

ALLOWED_TYPES = {
    "text-input",
    "multiple-choice",
    "listen-choice",
    "cloze",
    "transform",
    "dictation",
    "error-correction",
    "token-build",
    "choice-grid",
}

TYPE_PRIORITY = [
    "text-input",
    "error-correction",
    "token-build",
    "choice-grid",
    "cloze",
    "multiple-choice",
    "listen-choice",
    "transform",
    "dictation",
]

FORBIDDEN_PROMPTS = [
    "Elige la frase rusa que aplica",
    "Estructura que conviene reconocer",
    "Selecciona el ejemplo",
    "Reconoce la estructura",
    "Frase de práctica",
    "Ejemplo de uso",
]


def main() -> int:
    existing = read_json(EXERCISES_PATH)
    vocabulary = read_json(ROOT / "content" / "vocabulary.json")
    materials = read_json(ROOT / "content" / "materials.json")
    audio_entries = read_json(ROOT / "content" / "audio-index.json").get("entries", [])
    audio_texts = {normalize_text(entry.get("text", "")) for entry in audio_entries}
    target_ids = build_target_ids(vocabulary, materials)

    legacy_audit = audit_existing(existing)
    pool = generate_pool(vocabulary, materials, audio_texts)
    cycle_reports = []
    selected = []

    for cycle in range(1, ITERATIONS + 1):
        valid, rejected = validate_pool(pool, target_ids)
        selected = select_lesson_sets(valid)
        selected_rejected = []
        for exercise in selected:
            reasons = validate_exercise(exercise, target_ids)
            if reasons:
                selected_rejected.append({"id": exercise.get("id"), "reasons": reasons})
        cycle_reports.append({
            "cycle": cycle,
            "candidate_count": len(pool),
            "valid_candidates": len(valid),
            "rejected_candidates": len(rejected),
            "selected_count": len(selected),
            "selected_rejected": selected_rejected,
            "by_lesson": {
                str(lesson): Counter(item["type"] for item in selected if item["lesson"] == lesson)
                for lesson in sorted(FOUNDATION_LESSONS)
            },
        })
        if selected_rejected:
            bad_ids = {item["id"] for item in selected_rejected}
            pool = [item for item in valid if item.get("id") not in bad_ids]
        else:
            pool = selected

    final_errors = validate_final(selected, target_ids)
    if final_errors:
        raise SystemExit("\n".join(final_errors))

    write_json(EXERCISES_PATH, selected)
    write_audit(existing, legacy_audit, selected, cycle_reports)
    return 0


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_text(value: str) -> str:
    text = str(value or "").strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[?.!¿¡,;:«»“”\"']", "", text)
    return re.sub(r"\s+", " ", text).strip()


def hash_string(value: str) -> str:
    hash_value = 2166136261
    for ch in str(value or ""):
        hash_value ^= ord(ch)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if hash_value == 0:
        return "0"
    out = ""
    while hash_value:
        hash_value, rem = divmod(hash_value, 36)
        out = alphabet[rem] + out
    return out


def target_id(kind: str, text: str) -> str:
    key = f"{kind}:{normalize_text(text)}"
    return f"ru-{kind}-{hash_string(key)}"


def build_target_ids(vocabulary, materials) -> set[str]:
    ids = set()
    for item in vocabulary:
        if item.get("russian"):
            ids.add(target_id("vocabulary", item["russian"]))
    for entry in materials.get("classes", []):
        for text in entry.get("v", []):
            ids.add(target_id("vocabulary", text))
        for text in entry.get("g", []):
            ids.add(target_id("grammar", text))
    return ids


def audit_existing(exercises):
    audit = []
    for exercise in exercises:
        lesson = int(exercise.get("lesson") or 999)
        reasons = []
        status = "discarded"
        if lesson in FOUNDATION_LESSONS:
            reasons.append("Reemplazado por corpus fundacional validado de 100 ejercicios para la lección.")
        else:
            reasons.append("Fuera del bloque fundacional: se retira del JSON estático para no publicar ejercicios sin auditoría completa.")
        if exercise.get("type") == "production-prompt" or exercise.get("allow_contains"):
            reasons.append("Corrección no fiable: acepta por contains y puede dar falsos positivos.")
        if exercise.get("type") == "listen-choice" and transcription_choice(exercise):
            reasons.append("Listening de transcripción/repetición, no comprensión semántica.")
        if not exercise.get("target_ids") and not exercise.get("targets"):
            reasons.append("No declara targets suficientes para SRS y diagnóstico.")
        if any(phrase.lower() in str(exercise.get("prompt", "")).lower() for phrase in FORBIDDEN_PROMPTS):
            reasons.append("Contiene una frase prohibida por el protocolo.")
        if exercise.get("type") not in ALLOWED_TYPES:
            reasons.append(f"Tipo legacy no registrado directamente: {exercise.get('type')}.")
        audit.append({
            "id": exercise.get("id"),
            "lesson": lesson if lesson != 999 else None,
            "type": exercise.get("type"),
            "status": status,
            "reasons": reasons,
        })
    return audit


def transcription_choice(exercise) -> bool:
    prompt = str(exercise.get("prompt", ""))
    choices = exercise.get("choices") or []
    russian_choices = sum(1 for choice in choices if re.search(r"[а-яё]", str(choice.get("label") or choice.get("value") or ""), re.I))
    return bool(re.search(r"frase que has oído|lo que has oído", prompt, re.I)) and russian_choices >= max(2, len(choices) - 1)


def generate_pool(vocabulary, materials, audio_texts):
    by_lesson = defaultdict(list)
    for item in vocabulary:
        lesson = int(item.get("lesson") or 999)
        if lesson in FOUNDATION_LESSONS:
            by_lesson[lesson].append(item)
    grammar_by_lesson = {
        int(entry.get("l")): entry.get("g", [])
        for entry in materials.get("classes", [])
        if int(entry.get("l") or 999) in FOUNDATION_LESSONS
    }
    pool = []
    counters = defaultdict(int)
    pool.extend(lesson_one(by_lesson[1], grammar_by_lesson, audio_texts, counters))
    pool.extend(lesson_two(by_lesson[2], grammar_by_lesson, audio_texts, counters))
    pool.extend(lesson_three(by_lesson[3], grammar_by_lesson, audio_texts, counters))
    pool.extend(lesson_four(by_lesson[4], grammar_by_lesson, audio_texts, counters))
    pool.extend(lesson_five(by_lesson[5], grammar_by_lesson, audio_texts, counters))
    add_authored_exercises(pool, counters, grammar_by_lesson, 1, {item["russian"]: item for item in by_lesson[1]}, authored_lesson_one())
    add_authored_exercises(pool, counters, grammar_by_lesson, 2, {item["russian"]: item for item in by_lesson[2]}, authored_lesson_two())
    add_authored_exercises(pool, counters, grammar_by_lesson, 3, {item["russian"]: item for item in by_lesson[3]}, authored_lesson_three())
    add_authored_exercises(pool, counters, grammar_by_lesson, 4, {item["russian"]: item for item in by_lesson[4]}, authored_lesson_four())
    add_authored_exercises(pool, counters, grammar_by_lesson, 5, {item["russian"]: item for item in by_lesson[5]}, authored_lesson_five())
    return pool


def next_id(counters, lesson):
    counters[lesson] += 1
    return f"foundation-l{lesson:02d}-{counters[lesson]:03d}"


def cap_ru(value: str) -> str:
    value = str(value or "").strip()
    return value[:1].upper() + value[1:] if value else value


def primary_es(value: str) -> str:
    return str(value or "").split("/")[0].strip()


MASS_ES = {"agua", "café", "leche", "pan", "té", "música", "radio"}
PLURAL_ES = {"niños", "cartas", "mapas"}
FEM_ES = {
    "abuela", "niña", "chica", "hija", "esposa", "mujer", "gata", "mamá", "madre",
    "familia", "hermana", "tía", "persona", "ciudad", "calle", "avenida", "plaza",
    "torre", "tienda", "oficina de correos", "escuela", "universidad", "estación",
    "farmacia", "parada", "iglesia", "profesión", "actriz", "revista", "canción",
    "clase", "lección", "palabra", "película"
}


def indefinite_es(value: str) -> str:
    base = primary_es(value)
    if base in MASS_ES:
        return base
    if base in PLURAL_ES or base.endswith("s"):
        return base
    article = "una" if base in FEM_ES or base.endswith(("a", "ción", "sión", "dad")) else "un"
    return f"{article} {base}"


def definite_es(value: str) -> str:
    base = primary_es(value)
    if base in PLURAL_ES or base.endswith("s"):
        return f"los {base}"
    article = "la" if base in FEM_ES or base.endswith(("a", "ción", "sión", "dad")) else "el"
    return f"{article} {base}"


def identity_sentence_es(value: str) -> str:
    base = primary_es(value)
    if base in MASS_ES:
        return f"Esto es {base}"
    if base in PLURAL_ES or base.endswith("s"):
        return f"Estos son {base}"
    if base in FEM_ES or base.endswith(("a", "ción", "sión", "dad")):
        return f"Esta es {indefinite_es(base)}"
    if base in {"hombre", "chico", "niño", "abuelo", "hermano", "tío", "padre", "marido", "hijo"}:
        return f"Este es {indefinite_es(base)}"
    return f"Esto es {indefinite_es(base)}"


def negative_identity_sentence_es(value: str) -> str:
    sentence = identity_sentence_es(value)
    return sentence.replace(" es ", " no es ", 1).replace(" son ", " no son ", 1)


def vocab_target(item) -> str:
    return target_id("vocabulary", item["russian"])


def vocab_target_for(by_ru, ru) -> str:
    item = by_ru.get(ru)
    return vocab_target(item) if item else target_id("vocabulary", ru)


def grammar_target(grammar_by_lesson, lesson, text) -> str:
    if text in grammar_by_lesson.get(lesson, []):
        return target_id("grammar", text)
    return target_id("grammar", text)


def make_exercise(
    *,
    counters,
    lesson,
    type_,
    prompt,
    expected,
    target_ids,
    primary,
    lemmas,
    structures,
    skill,
    modality,
    direction,
    processing,
    difficulty,
    context="",
    display="",
    display_expected="",
    tts_text="",
    choices=None,
    items=None,
    tokens=None,
    distractors=None,
    accepted=None,
    diagnostics=None,
    exam=False,
    challenge=False,
    curated=False,
    exam_role="",
    source=None,
    design="",
):
    feedback = feedback_for(primary, structures, type_)
    target_set = sorted(set(target_ids))
    exercise = {
        "id": next_id(counters, lesson),
        "lesson": lesson,
        "lessonId": f"lesson_{lesson:03d}",
        "source": source or ("authored-foundation-v2" if curated else "generated-foundation-v1"),
        "type": type_,
        "skill": skill,
        "modality": modality,
        "direction": direction,
        "processing": processing,
        "difficulty": difficulty,
        "importance": 0.88 if exam else 0.72,
        "prompt": prompt,
        "context": context,
        "display": display,
        "expected": expected,
        "expectedAnswer": expected,
        "accepted": accepted or [],
        "acceptedAnswers": accepted or [],
        "display_expected": display_expected or expected,
        "tts_text": tts_text,
        "choices": choices or None,
        "items": items or [],
        "tokens": tokens or [],
        "distractors": distractors or [],
        "target_ids": target_set,
        "targets": {
            "primary": primary,
            "secondary": structures[1:],
            "lemmas": sorted(set(lemmas)),
            "structures": structures,
            "cases": diagnostics.get("cases", []) if diagnostics else [],
            "morphology": diagnostics.get("morphology", []) if diagnostics else [],
            "syntax": diagnostics.get("syntax", []) if diagnostics else [],
            "skills": [skill, processing],
            "modality": modality,
            "direction": direction,
            "processing": processing,
            "difficulty": difficulty,
            "importance": 0.88 if exam else 0.72,
        },
        "diagnostics": {
            "possibleErrors": diagnostics.get("possibleErrors", []) if diagnostics else ["lexical_recall_error"],
            "criticalErrors": diagnostics.get("criticalErrors", []) if diagnostics else [],
        },
        "feedback": feedback,
        "srs": {
            "scheduleByTarget": True,
            "countsAsEvidenceFor": [f"{target}:{skill}" for target in sorted(set(target_ids))],
            "doesNotCountAsMasteryFor": ["free_production"] if type_ in {"multiple-choice", "listen-choice"} else [],
        },
        "quality": {
            "status": "approved",
            "score": quality_score(type_, difficulty),
            "requiresUnderstanding": type_ != "dictation",
            "requiresRecall": type_ not in {"multiple-choice", "listen-choice"},
            "requiresApplication": type_ in {"text-input", "cloze", "transform", "error-correction"},
            "requiresInference": bool(challenge),
            "combinesTargets": bool(challenge or len(target_set) >= 3 or len(structures) >= 2),
            "authoredAsWhole": bool(curated),
            "isTrivialRecognition": False,
            "answerGivenInPrompt": False,
            "hasSpecificFeedback": True,
            "hasPlausibleDistractors": type_ in {"multiple-choice", "listen-choice"},
            "suitableForUnlockExam": exam,
        },
        "challenge": bool(challenge),
        "curated": bool(curated),
        "design": design or None,
        "exam_role": exam_role or None,
        "auto_correctable": True,
        "unlock_exam": exam,
        "weight": 0.44 if exam else 0.32,
    }
    return exercise


def feedback_for(primary, structures, type_):
    target = primary or (structures[0] if structures else "target")
    return {
        "correct": f"Correcto: aplicas {target} en una tarea corregible automáticamente.",
        "incorrect": f"Revisa {target}: la respuesta debe respetar significado, forma rusa y la estructura {', '.join(structures) or target}.",
        "byErrorType": {
            "opcion_incorrecta": f"La opción elegida no expresa {target} en este contexto.",
            "forma_o_estructura": f"El fallo está en la forma o estructura de {target}.",
            "recuperacion_incorrecta": f"Recupera la forma rusa exacta asociada a {target}.",
            "percepcion_auditiva": f"Vuelve a escuchar y decide por significado, no por parecido gráfico.",
            "respuesta_vacia": "No hay evidencia de dominio si la respuesta está vacía.",
        },
    }


def quality_score(type_, difficulty):
    base = {
        "multiple-choice": 13,
        "listen-choice": 15,
        "cloze": 14,
        "text-input": 16,
        "transform": 16,
        "error-correction": 18,
        "dictation": 12,
        "token-build": 17,
        "choice-grid": 16,
    }.get(type_, 0)
    return min(20, base + max(0, difficulty - 3))


def choice_values(correct, distractors):
    values = [correct, *[item["text"] for item in distractors]]
    unique = []
    seen = set()
    for value in values:
        key = normalize_text(value)
        if key and key not in seen:
            seen.add(key)
            unique.append(value)
    values = unique[:4]
    return [
        {"label": value, "value": value, "correct": normalize_text(value) == normalize_text(correct)}
        for value in values
    ]


def choice_distractors(values, reasons):
    return [{"text": value, "diagnosticReason": reasons[index % len(reasons)]} for index, value in enumerate(values)]


def spanish_choices(correct, items, current_ru):
    values = []
    for item in items:
        if item["russian"] == current_ru:
            continue
        values.append(primary_es(item.get("spanish", "")))
    return choice_distractors(values[:3], ["confusion_semantic_field", "lexical_contrast", "similar_lesson_item"])


def russian_identity_choices(correct, items, prefix="Это "):
    values = []
    for item in items:
        sentence = f"{prefix}{item['russian']}."
        if normalize_text(sentence) != normalize_text(correct):
            values.append(sentence)
    return choice_distractors(values[:3], ["same_structure_wrong_lemma", "semantic_distractor", "nearby_vocabulary"])


def add_listen(pool, audio_texts, **kwargs):
    if normalize_text(kwargs.get("tts_text") or kwargs.get("expected")) in audio_texts:
        pool.append(make_exercise(**kwargs))


def authored_targets(by_ru, grammar_by_lesson, lesson, vocab=None, grammar=None):
    ids = [vocab_target_for(by_ru, item) for item in (vocab or [])]
    ids.extend(grammar_target(grammar_by_lesson, lesson, item) for item in (grammar or []))
    return ids


def add_authored_exercises(pool, counters, grammar_by_lesson, lesson, by_ru, specs):
    for spec in specs:
        choices = None
        distractors = []
        if spec["type"] in {"multiple-choice", "listen-choice"}:
            distractors = choice_distractors(spec["distractors"], spec["distractor_reasons"])
            choices = choice_values(spec["expected"], distractors)
        pool.append(make_exercise(
            counters=counters,
            lesson=lesson,
            type_=spec["type"],
            prompt=spec["prompt"],
            expected=spec["expected"],
            target_ids=authored_targets(by_ru, grammar_by_lesson, lesson, spec.get("vocab"), spec.get("grammar")),
            primary=spec["primary"],
            lemmas=spec.get("lemmas", []),
            structures=spec["structures"],
            skill=spec.get("skill") or skill_for_authored_type(spec["type"]),
            modality=spec.get("modality", "text"),
            direction=spec.get("direction", "mixed"),
            processing=spec.get("processing", "inference"),
            difficulty=spec.get("difficulty", 5),
            context=spec.get("context", ""),
            display=spec.get("display", ""),
            display_expected=spec.get("display_expected", ""),
            tts_text=spec.get("tts_text", ""),
            choices=choices,
            items=spec.get("items"),
            tokens=spec.get("tokens"),
            distractors=distractors,
            accepted=spec.get("accepted"),
            diagnostics={
                "possibleErrors": spec.get("possibleErrors", ["semantic_misread", "form_error"]),
                "criticalErrors": spec.get("criticalErrors", []),
                "cases": spec.get("cases", []),
                "morphology": spec.get("morphology", []),
                "syntax": spec.get("syntax", []),
            },
            challenge=True,
            curated=True,
            exam_role=spec.get("exam_role", "practice"),
            design=spec.get("design", ""),
        ))


def skill_for_authored_type(type_):
    return {
        "multiple-choice": "grammar_transfer",
        "listen-choice": "listening",
        "cloze": "grammar_transfer",
        "error-correction": "grammar_transfer",
        "text-input": "production",
        "transform": "grammar_transfer",
        "dictation": "listening",
    }.get(type_, "production")


def authored_lesson_one():
    return [
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "design": "single_intent",
            "prompt": "Ves una persona en una foto. ¿Qué pregunta rusa encaja mejor?",
            "expected": "Кто это?",
            "distractors": ["Что это?", "Это кто?", "Это что?"],
            "distractor_reasons": ["object_question_for_person", "spanish_word_order", "object_question_for_person"],
            "primary": "single_person_question",
            "vocab": [],
            "grammar": ["кто это?", "что это?"],
            "lemmas": ["кто", "что", "это"],
            "structures": ["кто это?", "question_choice"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "La escena exige distinguir persona frente a objeto. El enunciado no contiene la respuesta rusa.",
            "possibleErrors": ["question_word_confusion", "spanish_word_order"],
            "criticalErrors": ["question_word_confusion"],
        },
        {
            "type": "token-build",
            "exam_role": "practice",
            "design": "single_intent",
            "prompt": "Construye una identificación natural para una mujer en una foto.",
            "expected": "Это женщина.",
            "tokens": ["Это", "женщина.", "есть", "не", "Что", "Кто"],
            "primary": "single_identify_woman_tokens",
            "vocab": ["женщина"],
            "grammar": ["это + существительное"],
            "lemmas": ["это", "женщина"],
            "structures": ["это + существительное", "token_order"],
            "direction": "context_to_ru",
            "processing": "construction",
            "context": "Hay fichas distractoras; no basta pulsarlas todas.",
            "possibleErrors": ["spanish_ser_estar_interference", "question_word_confusion", "extra_token"],
            "criticalErrors": ["spanish_ser_estar_interference"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "design": "single_intent",
            "prompt": "Corrige sólo la interferencia española de la frase.",
            "display": "Frase incorrecta: Это есть чай.",
            "expected": "Это чай.",
            "primary": "single_remove_copula_tea",
            "vocab": ["чай"],
            "grammar": ["это + существительное"],
            "lemmas": ["это", "чай"],
            "structures": ["это + существительное", "sin быть/есть en presente"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "La forma correcta no aparece en el enunciado; hay que reparar la frase.",
            "possibleErrors": ["spanish_ser_estar_interference"],
            "criticalErrors": ["spanish_ser_estar_interference"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "design": "single_intent",
            "prompt": "El objeto señalado no es leche. Completa la partícula que niega identidad.",
            "display": "Это ____ молоко.",
            "expected": "не",
            "primary": "single_negation_particle_milk",
            "vocab": ["молоко"],
            "grammar": ["это не + существительное"],
            "lemmas": ["это", "не", "молоко"],
            "structures": ["это не + существительное"],
            "direction": "context_to_ru",
            "processing": "application",
            "context": "El hueco decide entre negar identidad o existencia.",
            "possibleErrors": ["wrong_negation_particle"],
            "criticalErrors": ["wrong_negation_particle"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "design": "single_intent",
            "prompt": "Alguien señala pan y otro lo confunde con una bebida. ¿Qué corrección mínima conserva que no es esa bebida?",
            "expected": "Это не кофе.",
            "distractors": ["Это нет кофе.", "Это кофе.", "Не это кофе."],
            "distractor_reasons": ["wrong_negation_particle", "negation_missing", "wrong_word_order"],
            "primary": "single_not_coffee_choice",
            "vocab": ["кофе"],
            "grammar": ["это не + существительное"],
            "lemmas": ["это", "не", "кофе"],
            "structures": ["это не + существительное"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "La pregunta no pide traducir dos ideas; pide elegir la negación correcta.",
            "possibleErrors": ["wrong_negation_particle", "wrong_word_order"],
            "criticalErrors": ["wrong_negation_particle"],
        },
        {
            "type": "token-build",
            "exam_role": "practice",
            "design": "single_intent",
            "prompt": "Construye la pregunta rusa adecuada para un objeto desconocido.",
            "expected": "Что это?",
            "tokens": ["Что", "это?", "Кто", "это", "есть", "не"],
            "primary": "single_object_question_tokens",
            "vocab": [],
            "grammar": ["что это?", "кто это?"],
            "lemmas": ["что", "кто", "это"],
            "structures": ["что это?", "token_order"],
            "direction": "context_to_ru",
            "processing": "construction",
            "context": "Las fichas incluyen la pregunta de persona como distractor.",
            "possibleErrors": ["question_word_confusion", "extra_token"],
            "criticalErrors": ["question_word_confusion"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "design": "single_intent",
            "prompt": "Repara la negación: la frase no debe afirmar existencia, sino negar identidad.",
            "display": "Frase incorrecta: Это нет вода.",
            "expected": "Это не вода.",
            "primary": "single_repair_not_water",
            "vocab": ["вода"],
            "grammar": ["это не + существительное"],
            "lemmas": ["это", "не", "вода"],
            "structures": ["это не + существительное"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "El enunciado contiene el error, no la respuesta.",
            "possibleErrors": ["wrong_negation_particle"],
            "criticalErrors": ["wrong_negation_particle"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "design": "single_intent",
            "prompt": "Completa la palabra interrogativa para preguntar por una persona.",
            "display": "____ это?",
            "expected": "Кто",
            "primary": "single_who_gap",
            "vocab": [],
            "grammar": ["кто это?", "что это?"],
            "lemmas": ["кто", "что", "это"],
            "structures": ["кто это?"],
            "direction": "context_to_ru",
            "processing": "application",
            "context": "La decisión es persona frente a cosa.",
            "possibleErrors": ["question_word_confusion"],
            "criticalErrors": ["question_word_confusion"],
        },
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En una foto familiar preguntas quién aparece y respondes sin traducir "es": "¿Quién es? Es una mujer."',
            "expected": "Кто это? Это женщина.",
            "primary": "authored_family_photo_question",
            "vocab": ["женщина"],
            "grammar": ["кто это?", "это + существительное"],
            "lemmas": ["кто", "это", "женщина"],
            "structures": ["кто это?", "это + существительное"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "La pregunta es por una persona, no por un objeto; la respuesta no lleva есть.",
            "possibleErrors": ["question_word_confusion", "spanish_ser_estar_interference"],
            "criticalErrors": ["question_word_confusion", "spanish_ser_estar_interference"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige el intercambio. La pregunta es válida, pero las respuestas copian estructuras españolas.",
            "display": "Frase incorrecta: Кто это? Это есть женщина. Это нет девочка.",
            "expected": "Кто это? Это женщина. Это не девочка.",
            "primary": "authored_family_photo_correction",
            "vocab": ["женщина", "девочка"],
            "grammar": ["кто это?", "это + существительное", "это не + существительное"],
            "lemmas": ["кто", "женщина", "девочка", "не"],
            "structures": ["кто это?", "это + существительное", "это не + существительное"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Hay que quitar есть y sustituir нет por не sin cambiar la identidad.",
            "possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'Una niña señala una taza y alguien duda entre té y café. Elige la secuencia que pregunta por la cosa y responde: "Es té, no café."',
            "expected": "Что это? Это чай. Это не кофе.",
            "distractors": ["Кто это? Это чай. Это не кофе.", "Что это? Это есть чай. Это не кофе.", "Что это? Это чай. Это нет кофе."],
            "distractor_reasons": ["person_question_for_object", "spanish_ser_estar_interference", "wrong_negation_particle"],
            "primary": "authored_tea_not_coffee",
            "vocab": ["чай", "кофе"],
            "grammar": ["что это?", "это + существительное", "это не + существительное"],
            "lemmas": ["что", "чай", "кофе", "не"],
            "structures": ["что это?", "это + существительное", "это не + существительное"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "El contraste exige elegir что, no кто, y negar con не.",
            "possibleErrors": ["question_word_confusion", "spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["question_word_confusion", "wrong_negation_particle"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa sólo la parte que falta para que el diálogo diga: "¿Qué es esto? Es leche, no agua."',
            "display": "Что это? Это молоко. Это ____.",
            "expected": "не вода",
            "primary": "authored_milk_not_water_gap",
            "vocab": ["молоко", "вода"],
            "grammar": ["что это?", "это + существительное", "это не + существительное"],
            "lemmas": ["молоко", "вода", "не"],
            "structures": ["это не + существительное", "что это?"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "El hueco exige negar identidad, no existencia.",
            "possibleErrors": ["wrong_negation_particle", "lexical_recall_error"],
            "criticalErrors": ["wrong_negation_particle"],
        },
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En una mesa alguien confunde dos bebidas. Di: "¿Qué es esto? Es café. No es té."',
            "expected": "Что это? Это кофе. Это не чай.",
            "primary": "authored_coffee_not_tea",
            "vocab": ["кофе", "чай"],
            "grammar": ["что это?", "это + существительное", "это не + существительное"],
            "lemmas": ["что", "кофе", "чай", "не"],
            "structures": ["что это?", "это + существительное", "это не + существительное"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "La pregunta es por cosa; la segunda frase descarta una alternativa cercana.",
            "possibleErrors": ["question_word_confusion", "wrong_negation_particle", "lexical_recall_error"],
            "criticalErrors": ["question_word_confusion", "wrong_negation_particle"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige el diálogo sin cambiar que se pregunta por una cosa, se identifica agua y se descarta pan.",
            "display": "Frase incorrecta: Кто это? Это есть вода. Это нет хлеб.",
            "expected": "Что это? Это вода. Это не хлеб.",
            "primary": "authored_water_not_bread_correction",
            "vocab": ["вода", "хлеб"],
            "grammar": ["что это?", "это + существительное", "это не + существительное"],
            "lemmas": ["что", "вода", "хлеб", "не"],
            "structures": ["что это?", "это + существительное", "это не + существительное"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Corrige pregunta, cópula y negación en una sola escena.",
            "possibleErrors": ["question_word_confusion", "spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["question_word_confusion", "spanish_ser_estar_interference", "wrong_negation_particle"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa la alternativa descartada: "¿Quién es? Es papá. No es tío."',
            "display": "Кто это? Это папа. Это не ____.",
            "expected": "дядя",
            "primary": "authored_father_not_uncle_gap",
            "vocab": ["папа", "дядя"],
            "grammar": ["кто это?", "это + существительное", "это не + существительное"],
            "lemmas": ["кто", "папа", "дядя", "не"],
            "structures": ["кто это?", "это не + существительное"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "El hueco no pide cualquier familiar: descarta exactamente tío.",
            "possibleErrors": ["lexical_recall_error", "wrong_family_role"],
            "criticalErrors": ["wrong_family_role"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'En una foto aparece una hermana, y alguien propone "madre". Elige la secuencia que pregunta por persona, identifica hermana y descarta madre.',
            "expected": "Кто это? Это сестра. Это не мама.",
            "distractors": ["Что это? Это сестра. Это не мама.", "Кто это? Это есть сестра. Это не мама.", "Кто это? Это сестра. Это нет мама."],
            "distractor_reasons": ["object_question_for_person", "spanish_ser_estar_interference", "wrong_negation_particle"],
            "primary": "authored_sister_not_mother",
            "vocab": ["сестра", "мама"],
            "grammar": ["кто это?", "это + существительное", "это не + существительное"],
            "lemmas": ["кто", "сестра", "мама", "не"],
            "structures": ["кто это?", "это + существительное", "это не + существительное"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "La escena exige sostener tipo de pregunta, identidad y negación.",
            "possibleErrors": ["question_word_confusion", "spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["question_word_confusion", "wrong_negation_particle"],
        },
        {
            "type": "text-input",
            "exam_role": "exam",
            "prompt": 'En una escena con dos imágenes, primero preguntas por una persona y luego descartas una mascota: "¿Quién es? Es un niño. No es un perro."',
            "expected": "Кто это? Это мальчик. Это не собака.",
            "primary": "authored_exam_boy_not_dog",
            "vocab": ["мальчик", "собака"],
            "grammar": ["кто это?", "это + существительное", "это не + существительное"],
            "lemmas": ["кто", "мальчик", "собака", "не"],
            "structures": ["кто это?", "это + существительное", "это не + существительное"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "La persona activa кто; la negación se expresa con не.",
            "possibleErrors": ["question_word_confusion", "wrong_negation_particle", "spanish_ser_estar_interference"],
            "criticalErrors": ["question_word_confusion", "wrong_negation_particle"],
        },
        {
            "type": "error-correction",
            "exam_role": "exam",
            "prompt": "Corrige la mini-escena sin cambiar el significado: preguntan por una cosa, identifican pan y descartan leche.",
            "display": "Frase incorrecta: Кто это? Это есть хлеб. Это нет молоко.",
            "expected": "Что это? Это хлеб. Это не молоко.",
            "primary": "authored_exam_bread_not_milk_correction",
            "vocab": ["хлеб", "молоко"],
            "grammar": ["что это?", "это + существительное", "это не + существительное"],
            "lemmas": ["что", "хлеб", "молоко", "не"],
            "structures": ["что это?", "это + существительное", "это не + существительное"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Hay tres decisiones: pregunta de cosa, ausencia de cópula y negación con не.",
            "possibleErrors": ["question_word_confusion", "spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["question_word_confusion", "spanish_ser_estar_interference", "wrong_negation_particle"],
        },
    ]


def authored_lesson_two():
    return [
        {"type": "text-input", "exam_role": "practice", "design": "single_intent", "prompt": "Ubica un banco en el punto donde estás. Escribe una sola frase rusa.", "expected": "Банк здесь.", "primary": "single_bank_here", "vocab": ["банк", "здесь"], "grammar": ["где? здесь / там"], "lemmas": ["банк", "здесь"], "structures": ["где? здесь / там"], "direction": "context_to_ru", "processing": "production", "context": "Una ubicación, no una identificación.", "possibleErrors": ["wrong_deictic", "identification_not_location"], "criticalErrors": ["wrong_deictic"]},
        {"type": "token-build", "exam_role": "practice", "design": "single_intent", "prompt": "Construye una frase que ubique una farmacia lejos de ti.", "expected": "Аптека там.", "tokens": ["Аптека", "там.", "здесь", "Это", "банк", "не"], "primary": "single_pharmacy_there_tokens", "vocab": ["аптека", "там"], "grammar": ["где? здесь / там"], "lemmas": ["аптека", "там"], "structures": ["где? здесь / там", "token_order"], "direction": "context_to_ru", "processing": "construction", "context": "Hay distractores de identificación y deíctico.", "possibleErrors": ["wrong_deictic", "extra_token"], "criticalErrors": ["wrong_deictic"]},
        {"type": "error-correction", "exam_role": "practice", "design": "single_intent", "prompt": "Corrige la frase para que sea una ubicación natural.", "display": "Frase incorrecta: Это здесь парк.", "expected": "Парк здесь.", "primary": "single_park_here_correction", "vocab": ["парк", "здесь"], "grammar": ["где? здесь / там"], "lemmas": ["парк", "здесь"], "structures": ["где? здесь / там", "sin verbo estar"], "direction": "ru_to_ru", "processing": "diagnosis", "context": "La respuesta no aparece: debes transformar identificación copiada en ubicación.", "possibleErrors": ["identification_not_location", "spanish_word_order"], "criticalErrors": ["spanish_ser_estar_interference"]},
        {"type": "cloze", "exam_role": "practice", "design": "single_intent", "prompt": "Completa el deíctico para un museo que está lejos en el mapa.", "display": "Музей ____.", "expected": "там", "primary": "single_museum_there_gap", "vocab": ["музей", "там"], "grammar": ["где? здесь / там"], "lemmas": ["музей", "там"], "structures": ["где? здесь / там"], "direction": "context_to_ru", "processing": "application", "context": "El hueco decide distancia deíctica.", "possibleErrors": ["wrong_deictic"], "criticalErrors": ["wrong_deictic"]},
        {"type": "multiple-choice", "exam_role": "practice", "design": "single_intent", "prompt": "Quieres sustituir метро por un pronombre ruso. ¿Cuál encaja?", "expected": "оно", "distractors": ["он", "она", "они"], "distractor_reasons": ["wrong_gender", "wrong_gender", "wrong_number"], "primary": "single_metro_pronoun", "vocab": ["метро"], "grammar": ["он / она / оно"], "lemmas": ["метро", "оно"], "structures": ["он / она / оно"], "direction": "ru_to_ru", "processing": "inference", "context": "Decide por género gramatical ruso.", "possibleErrors": ["wrong_gender", "wrong_number"], "criticalErrors": ["wrong_gender"]},
        {"type": "token-build", "exam_role": "practice", "design": "single_intent", "prompt": "Construye una pregunta breve para localizar una casa.", "expected": "Где дом?", "tokens": ["Где", "дом?", "это", "Дом", "здесь", "там"], "primary": "single_where_house_tokens", "vocab": ["дом"], "grammar": ["где? здесь / там"], "lemmas": ["где", "дом"], "structures": ["где?", "token_order"], "direction": "context_to_ru", "processing": "construction", "context": "No uses las fichas de respuesta como si fueran parte de la pregunta.", "possibleErrors": ["statement_instead_of_question", "extra_token"], "criticalErrors": ["statement_instead_of_question"]},
        {"type": "error-correction", "exam_role": "practice", "design": "single_intent", "prompt": "Corrige el deíctico: la calle debe quedar cerca del hablante.", "display": "Frase incorrecta: Улица там.", "expected": "Улица здесь.", "primary": "single_street_here_correction", "vocab": ["улица", "здесь", "там"], "grammar": ["где? здесь / там"], "lemmas": ["улица", "здесь", "там"], "structures": ["где? здесь / там"], "direction": "ru_to_ru", "processing": "diagnosis", "context": "Sólo cambia la ubicación, no el sustantivo.", "possibleErrors": ["wrong_deictic"], "criticalErrors": ["wrong_deictic"]},
        {"type": "cloze", "exam_role": "practice", "design": "single_intent", "prompt": "Completa con la palabra rusa para escuela en una ubicación cercana.", "display": "____ здесь.", "expected": "Школа", "primary": "single_school_here_gap", "vocab": ["школа", "здесь"], "grammar": ["где? здесь / там"], "lemmas": ["школа", "здесь"], "structures": ["где? здесь / там"], "direction": "context_to_ru", "processing": "application", "context": "El hueco no pide una frase entera; pide el lugar correcto.", "possibleErrors": ["lexical_recall_error"], "criticalErrors": []},
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'Un taxista confirma dos referencias: "El banco está aquí. La farmacia está allí." Escríbelo en ruso sin verbo estar.',
            "expected": "Банк здесь. Аптека там.",
            "primary": "authored_taxi_bank_pharmacy",
            "vocab": ["банк", "аптека", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["банк", "аптека", "здесь", "там"],
            "structures": ["где? здесь / там", "sin verbo estar"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Son dos ubicaciones contrapuestas; no son identificaciones con это.",
            "possibleErrors": ["wrong_deictic", "identification_not_location", "spanish_ser_estar_interference"],
            "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'Estás señalando un mapa: "La escuela está allí; el metro está aquí." Elige la opción que no invierte aquí/allí.',
            "expected": "Школа там. Метро здесь.",
            "distractors": ["Школа здесь. Метро там.", "Это школа. Метро здесь.", "Школа там. Это метро."],
            "distractor_reasons": ["deictic_reversal", "first_clause_identification", "second_clause_identification"],
            "primary": "authored_map_school_metro",
            "vocab": ["школа", "метро", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["школа", "метро", "здесь", "там"],
            "structures": ["где? здесь / там", "sin verbo estar"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "La trampa no es léxica: es seguir el deíctico de cada lugar.",
            "possibleErrors": ["wrong_deictic", "identification_not_location"],
            "criticalErrors": ["wrong_deictic"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige la indicación de la calle. Mantén ciudad aquí y parque allí.",
            "display": "Frase incorrecta: Это здесь город. Парк здесь.",
            "expected": "Город здесь. Парк там.",
            "primary": "authored_city_park_correction",
            "vocab": ["город", "парк", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["город", "парк", "здесь", "там"],
            "structures": ["где? здесь / там", "sin verbo estar"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Hay que corregir estructura y deíctico, no sólo reordenar palabras.",
            "possibleErrors": ["spanish_word_order", "wrong_deictic", "spanish_ser_estar_interference"],
            "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa la segunda ubicación: "La calle está aquí. La plaza está allí."',
            "display": "Улица здесь. Площадь ____.",
            "expected": "там",
            "primary": "authored_street_square_gap",
            "vocab": ["улица", "площадь", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["улица", "площадь", "здесь", "там"],
            "structures": ["где? здесь / там"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "El hueco comprueba el contraste, no una palabra aislada.",
            "possibleErrors": ["wrong_deictic"],
            "criticalErrors": ["wrong_deictic"],
        },
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En una visita breve dices: "La iglesia está allí. El mercado está aquí."',
            "expected": "Церковь там. Рынок здесь.",
            "primary": "authored_church_market",
            "vocab": ["церковь", "рынок", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["церковь", "рынок", "здесь", "там"],
            "structures": ["где? здесь / там", "sin verbo estar"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Dos lugares con deícticos cruzados; no se usa это.",
            "possibleErrors": ["wrong_deictic", "identification_not_location"],
            "criticalErrors": ["wrong_deictic"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige la nota para que diga que la universidad está aquí y el centro allí.",
            "display": "Frase incorrecta: Это университет здесь. Центр здесь.",
            "expected": "Университет здесь. Центр там.",
            "primary": "authored_university_center_correction",
            "vocab": ["университет", "центр", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["университет", "центр", "здесь", "там"],
            "structures": ["где? здесь / там", "sin verbo estar"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Corrige la identificación copiada y el segundo deíctico.",
            "possibleErrors": ["identification_not_location", "wrong_deictic", "spanish_word_order"],
            "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa la primera ubicación: "El café está aquí. La torre está allí."',
            "display": "Кафе ____. Башня там.",
            "expected": "здесь",
            "primary": "authored_cafe_tower_gap",
            "vocab": ["кафе", "башня", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["кафе", "башня", "здесь", "там"],
            "structures": ["где? здесь / там"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "El hueco comprueba si sigues la primera ubicación, no el patrón final.",
            "possibleErrors": ["wrong_deictic"],
            "criticalErrors": ["wrong_deictic"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'Alguien pregunta por orientación: "La plaza está aquí; el parque está allí." Elige la frase rusa que mantiene el contraste.',
            "expected": "Площадь здесь. Парк там.",
            "distractors": ["Площадь там. Парк здесь.", "Это площадь. Парк там.", "Площадь здесь. Это парк."],
            "distractor_reasons": ["deictic_reversal", "first_clause_identification", "second_clause_identification"],
            "primary": "authored_square_park",
            "vocab": ["площадь", "парк", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["площадь", "парк", "здесь", "там"],
            "structures": ["где? здесь / там", "sin verbo estar"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "Debe leerse toda la frase: los dos lugares son ubicaciones.",
            "possibleErrors": ["wrong_deictic", "identification_not_location"],
            "criticalErrors": ["wrong_deictic"],
        },
        {
            "type": "text-input",
            "exam_role": "exam",
            "prompt": 'En una llamada perdida das dos datos útiles: "El museo está aquí. La estación está allí." Escríbelo en ruso.',
            "expected": "Музей здесь. Станция там.",
            "primary": "authored_exam_museum_station",
            "vocab": ["музей", "станция", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["музей", "станция", "здесь", "там"],
            "structures": ["где? здесь / там", "sin verbo estar"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Dos ubicaciones, dos deícticos, cero cópula.",
            "possibleErrors": ["wrong_deictic", "spanish_ser_estar_interference"],
            "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"],
        },
        {
            "type": "error-correction",
            "exam_role": "exam",
            "prompt": "Corrige el mensaje para que diga: la tienda está allí y la parada está aquí.",
            "display": "Frase incorrecta: Магазин здесь. Это остановка здесь.",
            "expected": "Магазин там. Остановка здесь.",
            "primary": "authored_exam_shop_stop_correction",
            "vocab": ["магазин", "остановка", "здесь", "там"],
            "grammar": ["где? здесь / там"],
            "lemmas": ["магазин", "остановка", "здесь", "там"],
            "structures": ["где? здесь / там", "sin verbo estar"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "La primera cláusula tiene el deíctico equivocado; la segunda copia una identificación.",
            "possibleErrors": ["wrong_deictic", "identification_not_location", "spanish_word_order"],
            "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"],
        },
    ]


def authored_lesson_three():
    return [
        {"type": "multiple-choice", "exam_role": "practice", "design": "single_intent", "prompt": "Quieres referirte a una mujer ya mencionada. ¿Qué pronombre sujeto ruso corresponde?", "expected": "она", "distractors": ["он", "оно", "они"], "distractor_reasons": ["wrong_gender", "wrong_gender", "wrong_number"], "primary": "single_she_pronoun", "vocab": ["она"], "grammar": ["я / ты / он / она / мы / вы / они"], "lemmas": ["она"], "structures": ["я / ты / он / она / мы / вы / они"], "direction": "context_to_ru", "processing": "inference", "context": "Decisión de pronombre, no de vocabulario profesional.", "possibleErrors": ["wrong_pronoun", "wrong_gender"], "criticalErrors": ["wrong_pronoun"]},
        {"type": "token-build", "exam_role": "practice", "design": "single_intent", "prompt": "Construye una frase natural para decir que él es médico.", "expected": "Он врач.", "tokens": ["Он", "врач.", "есть", "она", "не", "учитель"], "primary": "single_he_doctor_tokens", "vocab": ["он", "врач"], "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"], "lemmas": ["он", "врач"], "structures": ["профессия без связки", "token_order"], "direction": "context_to_ru", "processing": "construction", "context": "Las fichas incluyen la interferencia есть como trampa.", "possibleErrors": ["spanish_ser_estar_interference", "wrong_pronoun", "extra_token"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_pronoun"]},
        {"type": "error-correction", "exam_role": "practice", "design": "single_intent", "prompt": "Corrige la cópula copiada del español.", "display": "Frase incorrecta: Она есть актриса.", "expected": "Она актриса.", "primary": "single_actress_no_copula", "vocab": ["она", "актриса"], "grammar": ["профессия без связки"], "lemmas": ["она", "актриса"], "structures": ["профессия без связки", "sin быть/есть en presente"], "direction": "ru_to_ru", "processing": "diagnosis", "context": "La profesión en presente no necesita есть.", "possibleErrors": ["spanish_ser_estar_interference"], "criticalErrors": ["spanish_ser_estar_interference"]},
        {"type": "cloze", "exam_role": "practice", "design": "single_intent", "prompt": "Completa la profesión para decir que yo soy estudiante.", "display": "Я ____.", "expected": "студент", "primary": "single_i_student_gap", "vocab": ["я", "студент"], "grammar": ["профессия без связки"], "lemmas": ["я", "студент"], "structures": ["профессия без связки"], "direction": "context_to_ru", "processing": "application", "context": "No añadas verbo copulativo.", "possibleErrors": ["lexical_recall_error", "spanish_ser_estar_interference"], "criticalErrors": ["spanish_ser_estar_interference"]},
        {"type": "text-input", "exam_role": "practice", "design": "single_intent", "prompt": "Escribe una frase natural para decir que él es ingeniero.", "expected": "Он инженер.", "primary": "single_he_engineer_text", "vocab": ["он", "инженер"], "grammar": ["профессия без связки"], "lemmas": ["он", "инженер"], "structures": ["профессия без связки"], "direction": "context_to_ru", "processing": "production", "context": "Una sola predicación profesional sin cópula.", "possibleErrors": ["spanish_ser_estar_interference", "wrong_pronoun", "lexical_recall_error"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_pronoun"]},
        {"type": "token-build", "exam_role": "practice", "design": "single_intent", "prompt": "Construye la pregunta informal para saber quién eres tú.", "expected": "Кто ты?", "tokens": ["Кто", "ты?", "это", "я", "есть", "что"], "primary": "single_who_are_you_tokens", "vocab": ["ты"], "grammar": ["кто ты?", "я / ты / он / она / мы / вы / они"], "lemmas": ["кто", "ты"], "structures": ["кто ты?", "token_order"], "direction": "context_to_ru", "processing": "construction", "context": "No es una pregunta con это.", "possibleErrors": ["wrong_question_structure", "extra_token"], "criticalErrors": ["wrong_question_structure"]},
        {"type": "error-correction", "exam_role": "practice", "design": "single_intent", "prompt": "Repara la negación de profesión.", "display": "Frase incorrecta: Он нет учитель.", "expected": "Он не учитель.", "primary": "single_not_teacher_correction", "vocab": ["он", "учитель"], "grammar": ["профессия без связки"], "lemmas": ["он", "учитель", "не"], "structures": ["не + profesión"], "direction": "ru_to_ru", "processing": "diagnosis", "context": "No se niega con нет ante el predicado nominal.", "possibleErrors": ["wrong_negation_particle"], "criticalErrors": ["wrong_negation_particle"]},
        {"type": "cloze", "exam_role": "practice", "design": "single_intent", "prompt": "Completa la profesión negada: ella no es médica.", "display": "Она не ____.", "expected": "врач", "primary": "single_she_not_doctor_gap", "vocab": ["она", "врач"], "grammar": ["профессия без связки"], "lemmas": ["она", "врач", "не"], "structures": ["не + profesión"], "direction": "context_to_ru", "processing": "application", "context": "El hueco pide la profesión, no una partícula.", "possibleErrors": ["lexical_recall_error"], "criticalErrors": []},
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En una presentación corriges dos suposiciones: "Ella es médica. Él no es profesor."',
            "expected": "Она врач. Он не учитель.",
            "primary": "authored_intro_doctor_not_teacher",
            "vocab": ["она", "он", "врач", "учитель"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["она", "он", "врач", "учитель", "не"],
            "structures": ["профессия без связки", "не + profesión"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "La profesión afirmativa no lleva cópula; la profesión negada usa не.",
            "possibleErrors": ["spanish_ser_estar_interference", "wrong_pronoun", "wrong_negation_position"],
            "criticalErrors": ["spanish_ser_estar_interference", "wrong_pronoun"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'En una ficha aparecen dos personas: "Él es ingeniero; ella no es actriz." Elige la frase que conserva ambos sujetos.',
            "expected": "Он инженер. Она не актриса.",
            "distractors": ["Она инженер. Он не актриса.", "Он есть инженер. Она не актриса.", "Он инженер. Она актриса."],
            "distractor_reasons": ["subject_swap", "spanish_ser_estar_interference", "negation_missing"],
            "primary": "authored_profile_engineer_not_actress",
            "vocab": ["он", "она", "инженер", "актриса"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["он", "она", "инженер", "актриса", "не"],
            "structures": ["профессия без связки", "не + profesión"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "Las opciones obligan a seguir sujeto, profesión y polaridad a la vez.",
            "possibleErrors": ["subject_swap", "spanish_ser_estar_interference", "negation_missing"],
            "criticalErrors": ["wrong_pronoun", "spanish_ser_estar_interference"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige la frase de presentación. No cambies profesiones ni sujetos.",
            "display": "Frase incorrecta: Она есть актриса. Он нет врач.",
            "expected": "Она актриса. Он не врач.",
            "primary": "authored_actress_not_doctor_correction",
            "vocab": ["она", "он", "актриса", "врач"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["она", "он", "актриса", "врач", "не"],
            "structures": ["профессия без связки", "не + profesión"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Debes reparar cópula y negación nominal sin alterar el significado.",
            "possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa la segunda profesión para que diga: "Yo soy estudiante. Tú no eres policía."',
            "display": "Я студент. Ты не ____.",
            "expected": "полицейский",
            "primary": "authored_student_not_police_gap",
            "vocab": ["я", "ты", "студент", "полицейский"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["я", "ты", "студент", "полицейский", "не"],
            "structures": ["профессия без связки", "не + profesión"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "El hueco es léxico, pero la frase sólo es correcta si no añades cópula.",
            "possibleErrors": ["lexical_recall_error", "spanish_ser_estar_interference"],
            "criticalErrors": ["spanish_ser_estar_interference"],
        },
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En una presentación informal dices: "Yo soy estudiante. Ella no es gerente."',
            "expected": "Я студент. Она не менеджер.",
            "primary": "authored_student_not_manager",
            "vocab": ["я", "она", "студент", "менеджер"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["я", "она", "студент", "менеджер", "не"],
            "structures": ["профессия без связки", "не + profesión"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Dos sujetos distintos y una negación nominal sin cópula.",
            "possibleErrors": ["wrong_pronoun", "spanish_ser_estar_interference", "wrong_negation_position"],
            "criticalErrors": ["wrong_pronoun", "spanish_ser_estar_interference"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige la presentación. Conserva que él es escritor y ella no es periodista.",
            "display": "Frase incorrecta: Он есть писатель. Она нет журналист.",
            "expected": "Он писатель. Она не журналист.",
            "primary": "authored_writer_not_journalist_correction",
            "vocab": ["он", "она", "писатель", "журналист"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["он", "она", "писатель", "журналист", "не"],
            "structures": ["профессия без связки", "не + profesión"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Repara dos interferencias españolas sin cambiar sujetos.",
            "possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa el pronombre para que diga: "Ella es actriz. Él no es artista."',
            "display": "Она актриса. ____ не артист.",
            "expected": "Он",
            "primary": "authored_actress_he_not_artist_gap",
            "vocab": ["она", "он", "актриса", "артист"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["она", "он", "актриса", "артист", "не"],
            "structures": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "El hueco comprueba sujeto, no la profesión.",
            "possibleErrors": ["wrong_pronoun", "wrong_gender"],
            "criticalErrors": ["wrong_pronoun"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'En una conversación: "Tú eres profesor. Yo no soy colega." Elige la opción que mantiene la persona gramatical.',
            "expected": "Ты преподаватель. Я не коллега.",
            "distractors": ["Я преподаватель. Ты не коллега.", "Ты есть преподаватель. Я не коллега.", "Ты преподаватель. Я нет коллега."],
            "distractor_reasons": ["person_swap", "spanish_ser_estar_interference", "wrong_negation_particle"],
            "primary": "authored_you_teacher_me_not_colleague",
            "vocab": ["ты", "я", "преподаватель", "коллега"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["ты", "я", "преподаватель", "коллега", "не"],
            "structures": ["профессия без связки", "не + profesión"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "La dificultad es persona gramatical más cópula cero más negación.",
            "possibleErrors": ["person_swap", "spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["wrong_pronoun", "spanish_ser_estar_interference"],
        },
        {
            "type": "text-input",
            "exam_role": "exam",
            "prompt": 'En una entrevista breve dices: "Nosotros somos periodistas. Ellos no son escritores."',
            "expected": "Мы журналисты. Они не писатели.",
            "primary": "authored_exam_we_journalists_not_writers",
            "vocab": ["мы", "они", "журналист", "писатель"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["мы", "они", "журналисты", "писатели", "не"],
            "structures": ["профессия без связки", "не + profesión", "plural_profession"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Exige plural contextual y negación nominal sin cópula.",
            "possibleErrors": ["wrong_number", "spanish_ser_estar_interference", "wrong_negation_position"],
            "criticalErrors": ["wrong_number", "spanish_ser_estar_interference"],
        },
        {
            "type": "error-correction",
            "exam_role": "exam",
            "prompt": "Corrige la identificación profesional de dos personas sin intercambiar los pronombres.",
            "display": "Frase incorrecta: Он есть актёр. Она нет студентка.",
            "expected": "Он актёр. Она не студентка.",
            "primary": "authored_exam_actor_not_student_correction",
            "vocab": ["он", "она", "актёр", "студентка"],
            "grammar": ["профессия без связки", "я / ты / он / она / мы / вы / они"],
            "lemmas": ["он", "она", "актёр", "студентка", "не"],
            "structures": ["профессия без связки", "не + profesión"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Cópula y negación son los errores; sujetos y profesiones se conservan.",
            "possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"],
            "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"],
        },
    ]


def authored_lesson_four():
    return [
        {"type": "multiple-choice", "exam_role": "practice", "design": "single_intent", "prompt": "Después de хочу, ¿qué forma rusa encaja para leer?", "expected": "Я хочу читать.", "distractors": ["Я хочу читаю.", "Я читаю хотеть.", "Я читать."], "distractor_reasons": ["conjugated_after_hochu", "wrong_word_order", "infinitive_as_predicate"], "primary": "single_want_read_choice", "vocab": ["читать"], "grammar": ["что делать?"], "lemmas": ["хочу", "читать"], "structures": ["я хочу + infinitivo"], "direction": "context_to_ru", "processing": "inference", "context": "La operación es régimen tras хочу.", "possibleErrors": ["wrong_infinitive_after_hochu"], "criticalErrors": ["wrong_infinitive_after_hochu"]},
        {"type": "token-build", "exam_role": "practice", "design": "single_intent", "prompt": "Construye una frase para decir que escribes ahora, sin deseo.", "expected": "Я пишу.", "tokens": ["Я", "пишу.", "писать", "хочу", "ты", "не"], "primary": "single_i_write_tokens", "vocab": ["писать"], "grammar": ["я делаю / ты делаешь"], "lemmas": ["я", "писать", "пишу"], "structures": ["я + verbo en 1ª persona", "token_order"], "direction": "context_to_ru", "processing": "construction", "context": "Las fichas incluyen infinitivo y хочу como distractores.", "possibleErrors": ["infinitive_instead_of_conjugated", "extra_token"], "criticalErrors": ["infinitive_instead_of_conjugated"]},
        {"type": "error-correction", "exam_role": "practice", "design": "single_intent", "prompt": "Corrige el infinitivo usado como predicado con я.", "display": "Frase incorrecta: Я читать.", "expected": "Я читаю.", "primary": "single_i_read_correction", "vocab": ["читать"], "grammar": ["я делаю / ты делаешь"], "lemmas": ["я", "читать", "читаю"], "structures": ["я + verbo en 1ª persona"], "direction": "ru_to_ru", "processing": "diagnosis", "context": "Con я necesitas forma conjugada.", "possibleErrors": ["infinitive_instead_of_conjugated"], "criticalErrors": ["infinitive_instead_of_conjugated"]},
        {"type": "cloze", "exam_role": "practice", "design": "single_intent", "prompt": "Completa el infinitivo que depende de хочу para trabajar.", "display": "Я хочу ____.", "expected": "работать", "primary": "single_want_work_gap", "vocab": ["работать"], "grammar": ["что делать?"], "lemmas": ["хочу", "работать"], "structures": ["я хочу + infinitivo"], "direction": "context_to_ru", "processing": "application", "context": "El hueco no se conjuga.", "possibleErrors": ["wrong_infinitive_after_hochu"], "criticalErrors": ["wrong_infinitive_after_hochu"]},
        {"type": "text-input", "exam_role": "practice", "design": "single_intent", "prompt": "Escribe una frase rusa para decir que descansas.", "expected": "Я отдыхаю.", "primary": "single_i_rest_text", "vocab": ["отдыхать"], "grammar": ["я делаю / ты делаешь"], "lemmas": ["я", "отдыхать", "отдыхаю"], "structures": ["я + verbo en 1ª persona"], "direction": "context_to_ru", "processing": "production", "context": "Una acción real; no uses infinitivo solo.", "possibleErrors": ["infinitive_instead_of_conjugated"], "criticalErrors": ["infinitive_instead_of_conjugated"]},
        {"type": "token-build", "exam_role": "practice", "design": "single_intent", "prompt": "Construye una frase para decir que quieres pasear.", "expected": "Я хочу гулять.", "tokens": ["Я", "хочу", "гулять.", "гуляю", "ты", "не"], "primary": "single_want_walk_tokens", "vocab": ["гулять"], "grammar": ["что делать?"], "lemmas": ["я", "хочу", "гулять"], "structures": ["я хочу + infinitivo", "token_order"], "direction": "context_to_ru", "processing": "construction", "context": "La forma conjugada está como distractor.", "possibleErrors": ["conjugated_after_hochu", "extra_token"], "criticalErrors": ["wrong_infinitive_after_hochu"]},
        {"type": "error-correction", "exam_role": "practice", "design": "single_intent", "prompt": "Repara la forma verbal tras хочу.", "display": "Frase incorrecta: Я хочу работаю.", "expected": "Я хочу работать.", "primary": "single_want_work_correction", "vocab": ["работать"], "grammar": ["что делать?"], "lemmas": ["я", "хочу", "работать"], "structures": ["я хочу + infinitivo"], "direction": "ru_to_ru", "processing": "diagnosis", "context": "Tras хочу no va la forma conjugada.", "possibleErrors": ["wrong_infinitive_after_hochu"], "criticalErrors": ["wrong_infinitive_after_hochu"]},
        {"type": "cloze", "exam_role": "practice", "design": "single_intent", "prompt": "Completa la forma de primera persona para saber/conocer.", "display": "Я ____.", "expected": "знаю", "primary": "single_i_know_gap", "vocab": ["знать"], "grammar": ["я делаю / ты делаешь"], "lemmas": ["я", "знать", "знаю"], "structures": ["я + verbo en 1ª persona"], "direction": "context_to_ru", "processing": "application", "context": "Aquí no hay хочу; necesitas forma conjugada.", "possibleErrors": ["infinitive_instead_of_conjugated", "lexical_recall_error"], "criticalErrors": ["infinitive_instead_of_conjugated"]},
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En tu agenda distingues deseo y acción real: "Quiero leer. Escribo."',
            "expected": "Я хочу читать. Я пишу.",
            "primary": "authored_agenda_want_read_write",
            "vocab": ["читать", "писать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "читать", "писать", "пишу"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "La primera frase exige infinitivo; la segunda exige forma conjugada.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"],
            "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
            "morphology": ["present_1sg"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'Una nota contrasta plan y presente: "Quiero trabajar. Descanso." Elige la opción que no intercambia deseo y acción.',
            "expected": "Я хочу работать. Я отдыхаю.",
            "distractors": ["Я хочу работаю. Я отдыхаю.", "Я хочу работать. Я отдыхать.", "Я работаю. Я хочу отдыхать."],
            "distractor_reasons": ["conjugated_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"],
            "primary": "authored_plan_work_rest",
            "vocab": ["работать", "отдыхать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "работать", "отдыхать", "отдыхаю"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "Cada distractor falla por una razón distinta de régimen verbal.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"],
            "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige las dos frases. Una necesita infinitivo tras хочу; la otra necesita forma de yo.",
            "display": "Frase incorrecta: Я хочу читаю. Я писать.",
            "expected": "Я хочу читать. Я пишу.",
            "primary": "authored_want_read_write_correction",
            "vocab": ["читать", "писать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "читать", "писать", "пишу"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "No es una sustitución mecánica: cada cláusula impone una forma verbal distinta.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
            "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
            "morphology": ["present_1sg"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa la forma verbal para que diga: "Quiero pensar. Sé."',
            "display": "Я хочу думать. Я ____.",
            "expected": "знаю",
            "primary": "authored_want_think_know_gap",
            "vocab": ["думать", "знать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["думать", "знать", "знаю", "хочу"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "La primera frase ya contiene el infinitivo; el hueco exige la forma conjugada.",
            "possibleErrors": ["infinitive_instead_of_conjugated", "lexical_recall_error"],
            "criticalErrors": ["infinitive_instead_of_conjugated"],
            "morphology": ["present_1sg"],
        },
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En una nota de hábitos dices: "Quiero pasear. Trabajo."',
            "expected": "Я хочу гулять. Я работаю.",
            "primary": "authored_want_walk_work",
            "vocab": ["гулять", "работать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "гулять", "работать", "работаю"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Plan y acción real no usan la misma forma verbal.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
            "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige la nota. Conserva desayunar y cenar, pero usa la forma verbal que pide cada frase.",
            "display": "Frase incorrecta: Я хочу завтракаю. Я ужинать.",
            "expected": "Я хочу завтракать. Я ужинаю.",
            "primary": "authored_breakfast_dinner_correction",
            "vocab": ["завтракать", "ужинать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "завтракать", "ужинать", "ужинаю"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "La primera cláusula no se conjuga; la segunda sí.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
            "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa el infinitivo tras хочу: "Quiero descansar. Como."',
            "display": "Я хочу ____. Я обедаю.",
            "expected": "отдыхать",
            "primary": "authored_rest_lunch_gap",
            "vocab": ["отдыхать", "обедать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "отдыхать", "обедать", "обедаю"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "El hueco exige infinitivo porque depende de хочу.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "lexical_recall_error"],
            "criticalErrors": ["wrong_infinitive_after_hochu"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'Quieres decir: "Quiero ayudar. Busco." Elige la opción que no usa infinitivo como predicado.',
            "expected": "Я хочу помогать. Я ищу.",
            "distractors": ["Я хочу помогаю. Я ищу.", "Я хочу помогать. Я искать.", "Я помогаю. Я хочу искать."],
            "distractor_reasons": ["conjugated_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"],
            "primary": "authored_help_search_choice",
            "vocab": ["помогать", "искать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "помогать", "искать", "ищу"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "Hay que seguir la función de cada verbo, no sólo reconocer el lexema.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"],
            "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
        },
        {
            "type": "text-input",
            "exam_role": "exam",
            "prompt": 'En un mensaje dices dos cosas distintas: "Quiero abrir. Cierro."',
            "expected": "Я хочу открывать. Я закрываю.",
            "primary": "authored_exam_want_open_close",
            "vocab": ["открывать", "закрывать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "открывать", "закрывать", "закрываю"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "El examen fuerza transferencia: no basta copiar el último verbo visto.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated", "lexical_recall_error"],
            "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
        },
        {
            "type": "error-correction",
            "exam_role": "exam",
            "prompt": "Corrige el contraste entre deseo y acción. Conserva ayudar y buscar.",
            "display": "Frase incorrecta: Я хочу помогаю. Я искать.",
            "expected": "Я хочу помогать. Я ищу.",
            "primary": "authored_exam_help_search_correction",
            "vocab": ["помогать", "искать"],
            "grammar": ["что делать?", "я делаю / ты делаешь"],
            "lemmas": ["хочу", "помогать", "искать", "ищу"],
            "structures": ["я хочу + infinitivo", "я + verbo en 1ª persona"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Hay que diagnosticar dos errores distintos, no sólo reconocer vocabulario.",
            "possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
            "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"],
        },
    ]


def authored_lesson_five():
    return [
        {"type": "multiple-choice", "exam_role": "practice", "design": "single_intent", "prompt": "Quieres decir que escuchas música. ¿Qué frase usa objeto directo sin preposición?", "expected": "Я слушаю музыку.", "distractors": ["Я слушаю в музыку.", "Я слушать музыку.", "Я играю музыку."], "distractor_reasons": ["wrong_preposition_with_object", "infinitive_instead_of_conjugated", "wrong_verb"], "primary": "single_listen_music_choice", "vocab": ["слушать", "музыка"], "grammar": ["слушать / изучать / покупать + что"], "lemmas": ["слушать", "слушаю", "музыка", "музыку"], "structures": ["слушать / изучать / покупать + что"], "direction": "context_to_ru", "processing": "inference", "context": "La trampa es importar в donde no toca.", "possibleErrors": ["wrong_preposition_with_object", "wrong_object_form"], "criticalErrors": ["wrong_preposition_with_object"]},
        {"type": "token-build", "exam_role": "practice", "design": "single_intent", "prompt": "Construye una frase para decir que juegas al fútbol.", "expected": "Я играю в футбол.", "tokens": ["Я", "играю", "в", "футбол.", "слушаю", "не"], "primary": "single_play_football_tokens", "vocab": ["футбол"], "grammar": ["играть в + игра"], "lemmas": ["я", "играть", "играю", "в", "футбол"], "structures": ["играть в + игра", "token_order"], "direction": "context_to_ru", "processing": "construction", "context": "Hay un verbo distractor para evitar construcción automática.", "possibleErrors": ["missing_preposition", "wrong_verb", "extra_token"], "criticalErrors": ["missing_preposition"]},
        {"type": "error-correction", "exam_role": "practice", "design": "single_intent", "prompt": "Corrige la preposición sobrante con escuchar.", "display": "Frase incorrecta: Я слушаю в музыку.", "expected": "Я слушаю музыку.", "primary": "single_listen_music_correction", "vocab": ["слушать", "музыка"], "grammar": ["слушать / изучать / покупать + что"], "lemmas": ["слушать", "слушаю", "музыка", "музыку"], "structures": ["слушать / изучать / покупать + что"], "direction": "ru_to_ru", "processing": "diagnosis", "context": "Escuchar toma objeto directo aquí.", "possibleErrors": ["wrong_preposition_with_object"], "criticalErrors": ["wrong_preposition_with_object"]},
        {"type": "cloze", "exam_role": "practice", "design": "single_intent", "prompt": "Completa la preposición obligatoria con ajedrez.", "display": "Я играю ____ шахматы.", "expected": "в", "primary": "single_chess_preposition_gap", "vocab": ["шахматы"], "grammar": ["играть в + игра"], "lemmas": ["играть", "шахматы", "в"], "structures": ["играть в + игра"], "direction": "context_to_ru", "processing": "application", "context": "La preposición pertenece a jugar, no al objeto directo de escuchar/comprar.", "possibleErrors": ["missing_preposition"], "criticalErrors": ["missing_preposition"]},
        {"type": "text-input", "exam_role": "practice", "design": "single_intent", "prompt": "Escribe una frase rusa para decir que estudias ruso.", "expected": "Я изучаю русский язык.", "primary": "single_study_russian_text", "vocab": ["изучать", "русский язык"], "grammar": ["слушать / изучать / покупать + что"], "lemmas": ["изучать", "изучаю", "русский язык"], "structures": ["слушать / изучать / покупать + что"], "direction": "context_to_ru", "processing": "production", "context": "Una acción real con objeto directo.", "possibleErrors": ["infinitive_instead_of_conjugated", "wrong_preposition_with_object"], "criticalErrors": ["infinitive_instead_of_conjugated"]},
        {"type": "token-build", "exam_role": "practice", "design": "single_intent", "prompt": "Construye una frase para decir que compras leche.", "expected": "Я покупаю молоко.", "tokens": ["Я", "покупаю", "молоко.", "в", "играю", "не"], "primary": "single_buy_milk_tokens", "vocab": ["покупать", "молоко"], "grammar": ["слушать / изучать / покупать + что"], "lemmas": ["покупать", "покупаю", "молоко"], "structures": ["слушать / изучать / покупать + что", "token_order"], "direction": "context_to_ru", "processing": "construction", "context": "No uses la ficha в: comprar no la necesita aquí.", "possibleErrors": ["wrong_preposition_with_object", "extra_token"], "criticalErrors": ["wrong_preposition_with_object"]},
        {"type": "error-correction", "exam_role": "practice", "design": "single_intent", "prompt": "Corrige la frase para jugar a fútbol.", "display": "Frase incorrecta: Я играю футбол.", "expected": "Я играю в футбол.", "primary": "single_play_football_correction", "vocab": ["футбол"], "grammar": ["играть в + игра"], "lemmas": ["играть", "играю", "футбол", "в"], "structures": ["играть в + игра"], "direction": "ru_to_ru", "processing": "diagnosis", "context": "Falta la preposición propia de juegos/deportes.", "possibleErrors": ["missing_preposition"], "criticalErrors": ["missing_preposition"]},
        {"type": "cloze", "exam_role": "practice", "design": "single_intent", "prompt": "Completa el objeto directo para una frase negativa con la radio.", "display": "Я не слушаю ____.", "expected": "радио", "primary": "single_not_listen_radio_gap", "vocab": ["слушать", "радио"], "grammar": ["слушать / изучать / покупать + что"], "lemmas": ["слушать", "радио", "не"], "structures": ["слушать / изучать / покупать + что", "не + глагол"], "direction": "context_to_ru", "processing": "application", "context": "La negación no convierte el objeto en frase preposicional.", "possibleErrors": ["lexical_recall_error", "wrong_preposition_with_object"], "criticalErrors": ["wrong_preposition_with_object"]},
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En una conversación separas dos actividades: "Escucho música. No juego a fútbol."',
            "expected": "Я слушаю музыку. Я не играю в футбол.",
            "primary": "authored_music_not_football",
            "vocab": ["слушать", "музыка", "футбол"],
            "grammar": ["слушать / изучать / покупать + что", "играть в + игра"],
            "lemmas": ["слушать", "слушаю", "музыка", "музыку", "играть", "футбол", "не"],
            "structures": ["слушать / изучать / покупать + что", "не + глагол", "играть в + игра"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Objeto directo sin preposición; jugar a deporte con в; negación antes del verbo.",
            "possibleErrors": ["wrong_object_form", "wrong_preposition", "missing_preposition", "wrong_negation_position"],
            "criticalErrors": ["wrong_object_form", "missing_preposition", "wrong_negation_position"],
            "cases": ["accusative"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'Quieres decir: "Compro leche. No escucho la radio." Elige la opción que no convierte el objeto directo en frase con в.',
            "expected": "Я покупаю молоко. Я не слушаю радио.",
            "distractors": ["Я покупаю в молоко. Я не слушаю радио.", "Я покупаю молоко. Я нет слушаю радио.", "Я хочу покупать молоко. Я слушаю радио."],
            "distractor_reasons": ["wrong_preposition_with_object", "wrong_negation_particle", "meaning_reversal_or_aspect"],
            "primary": "authored_buy_milk_not_radio",
            "vocab": ["покупать", "молоко", "слушать", "радио"],
            "grammar": ["слушать / изучать / покупать + что"],
            "lemmas": ["покупать", "покупаю", "молоко", "слушать", "слушаю", "радио", "не"],
            "structures": ["слушать / изучать / покупать + что", "не + глагол"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "La opción correcta mantiene acción real y negación verbal.",
            "possibleErrors": ["wrong_preposition", "wrong_negation_particle", "meaning_reversal_or_aspect"],
            "criticalErrors": ["wrong_preposition", "wrong_negation_position"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige las dos frases. No confundas objeto directo con jugar a un juego.",
            "display": "Frase incorrecta: Я слушаю в музыку. Я нет играю футбол.",
            "expected": "Я слушаю музыку. Я не играю в футбол.",
            "primary": "authored_music_football_correction",
            "vocab": ["слушать", "музыка", "футбол"],
            "grammar": ["слушать / изучать / покупать + что", "играть в + игра"],
            "lemmas": ["слушать", "слушаю", "музыка", "музыку", "играть", "футбол", "не"],
            "structures": ["слушать / изучать / покупать + что", "не + глагол", "играть в + игра"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "La corrección separa tres reglas que el español puede mezclar.",
            "possibleErrors": ["wrong_preposition", "wrong_negation_particle", "missing_preposition"],
            "criticalErrors": ["wrong_object_form", "missing_preposition", "wrong_negation_position"],
            "cases": ["accusative"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa la parte que falta: "Estudio ruso. No juego al ajedrez."',
            "display": "Я изучаю русский язык. Я не играю ____ шахматы.",
            "expected": "в",
            "primary": "authored_russian_not_chess_gap",
            "vocab": ["изучать", "русский язык", "шахматы"],
            "grammar": ["слушать / изучать / покупать + что", "играть в + игра"],
            "lemmas": ["изучать", "русский язык", "играть", "шахматы", "в", "не"],
            "structures": ["слушать / изучать / покупать + что", "не + глагол", "играть в + игра"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "La primera frase no usa в; la segunda sí, por играть в.",
            "possibleErrors": ["missing_preposition", "wrong_preposition_domain"],
            "criticalErrors": ["missing_preposition"],
        },
        {
            "type": "text-input",
            "exam_role": "practice",
            "prompt": 'En una frase de contraste dices: "Leo una palabra. No juego al billar."',
            "expected": "Я читаю слово. Я не играю в бильярд.",
            "primary": "authored_word_not_billiards",
            "vocab": ["читать", "слово", "бильярд"],
            "grammar": ["слушать / изучать / покупать + что", "играть в + игра"],
            "lemmas": ["читать", "читаю", "слово", "играть", "бильярд", "не", "в"],
            "structures": ["слушать / изучать / покупать + что", "не + глагол", "играть в + игра"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Un objeto directo y un juego con в en la misma respuesta.",
            "possibleErrors": ["wrong_object_form", "missing_preposition", "wrong_negation_position"],
            "criticalErrors": ["missing_preposition", "wrong_negation_position"],
        },
        {
            "type": "error-correction",
            "exam_role": "practice",
            "prompt": "Corrige la frase. Debe decir que compras una revista y no juegas a las cartas.",
            "display": "Frase incorrecta: Я покупаю в журнал. Я нет играю карты.",
            "expected": "Я покупаю журнал. Я не играю в карты.",
            "primary": "authored_magazine_cards_correction",
            "vocab": ["покупать", "журнал", "карты"],
            "grammar": ["слушать / изучать / покупать + что", "играть в + игра"],
            "lemmas": ["покупать", "покупаю", "журнал", "играть", "карты", "не", "в"],
            "structures": ["слушать / изучать / покупать + что", "не + глагол", "играть в + игра"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Corrige preposición sobrante con comprar, negación verbal y в con jugar.",
            "possibleErrors": ["wrong_preposition_with_object", "wrong_negation_particle", "missing_preposition"],
            "criticalErrors": ["wrong_preposition_with_object", "missing_preposition", "wrong_negation_position"],
        },
        {
            "type": "cloze",
            "exam_role": "practice",
            "prompt": 'Completa el objeto correcto: "Escucho una canción. No compro leche."',
            "display": "Я слушаю песню. Я не покупаю ____.",
            "expected": "молоко",
            "primary": "authored_song_not_milk_gap",
            "vocab": ["слушать", "песня", "покупать", "молоко"],
            "grammar": ["слушать / изучать / покупать + что"],
            "lemmas": ["слушать", "песню", "покупать", "молоко", "не"],
            "structures": ["слушать / изучать / покупать + что", "не + глагол"],
            "direction": "es_to_ru",
            "processing": "application",
            "context": "El hueco no admite preposición: es objeto directo de comprar.",
            "possibleErrors": ["wrong_object_form", "wrong_preposition_with_object", "lexical_recall_error"],
            "criticalErrors": ["wrong_preposition_with_object"],
        },
        {
            "type": "multiple-choice",
            "exam_role": "practice",
            "prompt": 'Quieres decir: "Estudio ruso. Juego al baloncesto." Elige la opción que usa objeto directo y jugar con в.',
            "expected": "Я изучаю русский язык. Я играю в баскетбол.",
            "distractors": ["Я изучаю в русский язык. Я играю в баскетбол.", "Я изучаю русский язык. Я играю баскетбол.", "Я хочу изучать русский язык. Я играю в баскетбол."],
            "distractor_reasons": ["wrong_preposition_with_object", "missing_preposition", "meaning_changed_to_want"],
            "primary": "authored_russian_basketball_choice",
            "vocab": ["изучать", "русский язык", "баскетбол"],
            "grammar": ["слушать / изучать / покупать + что", "играть в + игра"],
            "lemmas": ["изучать", "изучаю", "русский язык", "играть", "баскетбол", "в"],
            "structures": ["слушать / изучать / покупать + что", "играть в + игра"],
            "direction": "context_to_ru",
            "processing": "inference",
            "context": "La opción correcta no aplica в a estudiar, sólo a jugar.",
            "possibleErrors": ["wrong_preposition_with_object", "missing_preposition", "meaning_changed_to_want"],
            "criticalErrors": ["wrong_preposition_with_object", "missing_preposition"],
        },
        {
            "type": "text-input",
            "exam_role": "exam",
            "prompt": 'En una respuesta compacta dices: "Leo un mensaje. No compro una revista."',
            "expected": "Я читаю сообщение. Я не покупаю журнал.",
            "primary": "authored_exam_message_not_magazine",
            "vocab": ["читать", "сообщение", "покупать", "журнал"],
            "grammar": ["слушать / изучать / покупать + что"],
            "lemmas": ["читать", "читаю", "сообщение", "покупать", "покупаю", "журнал", "не"],
            "structures": ["слушать / изучать / покупать + что", "не + глагол"],
            "direction": "es_to_ru",
            "processing": "production",
            "context": "Dos objetos directos; la negación no introduce нет.",
            "possibleErrors": ["wrong_object_form", "wrong_negation_particle", "infinitive_instead_of_conjugated"],
            "criticalErrors": ["wrong_negation_position", "infinitive_instead_of_conjugated"],
            "cases": ["accusative"],
        },
        {
            "type": "error-correction",
            "exam_role": "exam",
            "prompt": "Corrige la respuesta. Conserva billar y canción, pero repara preposición, objeto y negación.",
            "display": "Frase incorrecta: Я играю бильярд. Я нет слушаю в песню.",
            "expected": "Я играю в бильярд. Я не слушаю песню.",
            "primary": "authored_exam_billiards_song_correction",
            "vocab": ["бильярд", "слушать", "песня"],
            "grammar": ["слушать / изучать / покупать + что", "играть в + игра"],
            "lemmas": ["играть", "бильярд", "слушать", "слушаю", "песня", "песню", "не", "в"],
            "structures": ["играть в + игра", "слушать / изучать / покупать + что", "не + глагол"],
            "direction": "ru_to_ru",
            "processing": "diagnosis",
            "context": "Es una prueba de transferencia: jugar exige в; escuchar no.",
            "possibleErrors": ["missing_preposition", "wrong_negation_particle", "wrong_preposition_with_object", "wrong_object_form"],
            "criticalErrors": ["missing_preposition", "wrong_negation_position", "wrong_object_form"],
            "cases": ["accusative"],
        },
    ]


def lesson_one(items, grammar_by_lesson, audio_texts, counters):
    lesson = 1
    pool = []
    by_ru = {item["russian"]: item for item in items}
    g_esto = grammar_target(grammar_by_lesson, lesson, "это + существительное")
    g_neg = grammar_target(grammar_by_lesson, lesson, "это не + существительное")
    for item in items:
        ru = item["russian"]
        es = primary_es(item.get("spanish"))
        identity = identity_sentence_es(es)
        negative_identity = negative_identity_sentence_es(es)
        tid = vocab_target(item)
        target_ids = [tid, g_esto]
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "{identity}."', expected=f"Это {ru}.", target_ids=target_ids, primary=f"lemma:{ru}", lemmas=[ru], structures=["это + существительное"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Identificación básica sin verbo copulativo en presente.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "lexical_recall_error"], "criticalErrors": ["spanish_ser_estar_interference"], "syntax": ["no_present_copula"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "{negative_identity}."', expected=f"Это не {ru}.", target_ids=[tid, g_neg], primary=f"negation:{ru}", lemmas=[ru], structures=["это не + существительное"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Negación básica: не va antes del sustantivo.", diagnostics={"possibleErrors": ["wrong_negation_position", "lexical_recall_error"], "criticalErrors": ["wrong_negation_position"], "syntax": ["negation_before_noun"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa la frase para decir "{identity}".', display="Это ____.", expected=ru, target_ids=target_ids, primary=f"lemma:{ru}", lemmas=[ru], structures=["это + существительное"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=2, context="El hueco exige recuperar el sustantivo ruso correcto.", diagnostics={"possibleErrors": ["lexical_recall_error"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres identificar {indefinite_es(es)}. Elige la frase rusa natural.', expected=f"Это {ru}.", choices=choice_values(f"Это {ru}.", russian_identity_choices(f"Это {ru}.", items)), distractors=russian_identity_choices(f"Это {ru}.", items), target_ids=target_ids, primary=f"lemma:{ru}", lemmas=[ru], structures=["это + существительное"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=2, context="Todas las opciones tienen la misma estructura; debes leer el significado.", diagnostics={"possibleErrors": ["semantic_lemma_confusion"]}))
        add_listen(pool, audio_texts, counters=counters, lesson=lesson, type_="listen-choice", prompt="Escucha la frase. ¿Qué identifica la persona?", expected=es, tts_text=f"Это {ru}.", choices=choice_values(es, spanish_choices(es, items, ru)), distractors=spanish_choices(es, items, ru), target_ids=target_ids, primary=f"listening:{ru}", lemmas=[ru], structures=["audio_to_meaning", "это + существительное"], skill="listening", modality="audio", direction="audio_to_meaning", processing="comprehension", difficulty=3, context="Responde por significado; no transcribas.", diagnostics={"possibleErrors": ["percepcion_auditiva", "semantic_lemma_confusion"]})
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige la frase rusa. Evita copiar el "es" español con есть.', display=f"Frase incorrecta: Это есть {ru}.", expected=f"Это {ru}.", target_ids=target_ids, primary="no_present_copula", lemmas=[ru], structures=["это + существительное", "sin быть/есть en presente"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=4, context="En ruso básico, это + sustantivo no necesita verbo equivalente a ser/estar.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference"], "criticalErrors": ["spanish_ser_estar_interference"], "syntax": ["no_present_copula"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige la negación rusa. No traduzcas "no es" como нет.', display=f"Frase incorrecta: Это нет {ru}.", expected=f"Это не {ru}.", target_ids=[tid, g_neg], primary="это не + существительное", lemmas=[ru], structures=["это не + существительное"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=4, context="нет niega existencia; aquí la negación de identificación es не.", diagnostics={"possibleErrors": ["wrong_negation_particle"], "criticalErrors": ["wrong_negation_particle"], "syntax": ["negation_before_noun"]}))
    for question, expected, structure in [
        ('Traduce al ruso: "¿Quién es?"', "Кто это?", "кто это?"),
        ('Traduce al ruso: "¿Qué es esto?"', "Что это?", "что это?"),
    ]:
        gid = grammar_target(grammar_by_lesson, lesson, structure)
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=question, expected=expected, target_ids=[gid], primary=structure, lemmas=[], structures=[structure], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Pregunta básica con это.", diagnostics={"possibleErrors": ["question_word_confusion"], "criticalErrors": ["question_word_confusion"]}))
    composite_ids = [vocab_target_for(by_ru, "бабушка"), vocab_target_for(by_ru, "кофе"), g_esto, g_neg]
    composite_expected = "Это бабушка. Это не кофе."
    composite_distractors = choice_distractors(
        ["Это бабушка. Это кофе.", "Это есть бабушка. Это не кофе.", "Это бабушка. Это нет кофе."],
        ["negation_missing", "spanish_ser_estar_interference", "wrong_negation_particle"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "Esta es una abuela. Esto no es café."', expected=composite_expected, target_ids=composite_ids, primary="composite_identity_negation", lemmas=["бабушка", "кофе", "не"], structures=["это + существительное", "это не + существительное"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="Combina identificación y negación sin añadir verbo copulativo.", challenge=True, diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle", "lexical_recall_error"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"], "syntax": ["no_present_copula", "negation_before_noun"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar dos ideas: "Esta es una abuela. Esto no es café." Elige la opción rusa que mantiene ambas.', expected=composite_expected, choices=choice_values(composite_expected, composite_distractors), distractors=composite_distractors, target_ids=composite_ids, primary="composite_identity_negation", lemmas=["бабушка", "кофе", "не"], structures=["это + существительное", "это не + существительное"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="Todas las opciones son parecidas; sólo una conserva identificación, negación y ausencia de cópula.", challenge=True, diagnostics={"possibleErrors": ["negation_missing", "spanish_ser_estar_interference", "wrong_negation_particle"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. Hay interferencia española en la cópula y en la negación.', display="Frase incorrecta: Это есть бабушка. Это нет кофе.", expected=composite_expected, target_ids=composite_ids, primary="composite_identity_negation", lemmas=["бабушка", "кофе", "не"], structures=["это + существительное", "это не + существительное", "sin быть/есть en presente"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="Debes corregir dos errores distintos en una respuesta única.", challenge=True, diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"], "syntax": ["no_present_copula", "negation_before_noun"]}))
    second_ids = [vocab_target_for(by_ru, "брат"), vocab_target_for(by_ru, "чай"), g_esto, g_neg]
    second_expected = "Это брат. Это не чай."
    second_distractors = choice_distractors(
        ["Это брат. Это чай.", "Это не брат. Это чай.", "Это есть брат. Это нет чай."],
        ["negation_missing", "negation_applied_to_wrong_clause", "double_spanish_interference"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "Este es un hermano. Esto no es té."', expected=second_expected, target_ids=second_ids, primary="composite_identity_negation_variant", lemmas=["брат", "чай", "не"], structures=["это + существительное", "это не + существительное"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="La dificultad es conservar qué cláusula se afirma y cuál se niega.", challenge=True, diagnostics={"possibleErrors": ["negation_applied_to_wrong_clause", "spanish_ser_estar_interference", "lexical_recall_error"], "criticalErrors": ["negation_applied_to_wrong_clause", "spanish_ser_estar_interference"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar: "Este es un hermano. Esto no es té." Elige la opción que mantiene la polaridad de cada frase.', expected=second_expected, choices=choice_values(second_expected, second_distractors), distractors=second_distractors, target_ids=second_ids, primary="composite_identity_negation_variant", lemmas=["брат", "чай", "не"], structures=["это + существительное", "это не + существительное"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="No sirve detectar palabras sueltas: la negación debe caer en la segunda frase.", challenge=True, diagnostics={"possibleErrors": ["negation_missing", "negation_applied_to_wrong_clause"], "criticalErrors": ["negation_applied_to_wrong_clause"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. La primera no debe llevar cópula y la segunda no debe usar нет.', display="Frase incorrecta: Это есть брат. Это нет чай.", expected=second_expected, target_ids=second_ids, primary="composite_identity_negation_variant", lemmas=["брат", "чай", "не"], structures=["это + существительное", "это не + существительное", "sin быть/есть en presente"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="Repara dos interferencias españolas sin cambiar el significado.", challenge=True, diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"]}))
    return pool


def lesson_two(items, grammar_by_lesson, audio_texts, counters):
    lesson = 2
    pool = []
    by_ru = {item["russian"]: item for item in items}
    places = [item for item in items if item["russian"] not in {"здесь", "там"}]
    g_where = grammar_target(grammar_by_lesson, lesson, "где? здесь / там")
    g_gender = grammar_target(grammar_by_lesson, lesson, "он / она / оно")
    for item in places:
        ru = item["russian"]
        cap = cap_ru(ru)
        es = primary_es(item.get("spanish"))
        place = definite_es(es)
        tid = vocab_target(item)
        pronoun = pronoun_for(ru)
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "{place.capitalize()} está aquí."', expected=f"{cap} здесь.", target_ids=[tid, g_where], primary=f"location_here:{ru}", lemmas=[ru, "здесь"], structures=["где? здесь / там"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Ubicación básica sin verbo estar.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_deictic"], "criticalErrors": ["spanish_ser_estar_interference"], "syntax": ["no_present_copula_location"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "{place.capitalize()} está allí."', expected=f"{cap} там.", target_ids=[tid, g_where], primary=f"location_there:{ru}", lemmas=[ru, "там"], structures=["где? здесь / там"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Distingue aquí/allí.", diagnostics={"possibleErrors": ["wrong_deictic"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa para decir que "{place}" está aquí.', display="_____ здесь.", expected=cap, target_ids=[tid, g_where], primary=f"location_here:{ru}", lemmas=[ru, "здесь"], structures=["где? здесь / там"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=2, context="Recupera el lugar y conserva здесь.", diagnostics={"possibleErrors": ["lexical_recall_error"]}))
        distractors = choice_distractors([f"{cap} там.", f"Это {ru}.", f"{cap} не здесь."], ["wrong_deictic", "identification_not_location", "wrong_negation"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres decir que "{place}" está aquí. Elige la frase rusa.', expected=f"{cap} здесь.", choices=choice_values(f"{cap} здесь.", distractors), distractors=distractors, target_ids=[tid, g_where], primary=f"location_here:{ru}", lemmas=[ru, "здесь"], structures=["где? здесь / там"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=3, context="Las opciones contrastan identificación, negación y ubicación.", diagnostics={"possibleErrors": ["wrong_deictic", "identification_not_location"]}))
        pronoun_distractors = choice_distractors([value for value in ["он", "она", "оно", "они"] if value != pronoun][:3], ["wrong_gender", "wrong_number", "form_confusion"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres sustituir "{ru}" por un pronombre. ¿Cuál encaja?', expected=pronoun, choices=choice_values(pronoun, pronoun_distractors), distractors=pronoun_distractors, target_ids=[tid, g_gender], primary=f"gender_pronoun:{ru}", lemmas=[ru, pronoun], structures=["он / она / оно"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="recognition", difficulty=3, context="Decide por género gramatical ruso, no por género natural español.", diagnostics={"possibleErrors": ["wrong_gender"], "criticalErrors": ["wrong_gender"], "morphology": ["gender"]}))
        add_listen(pool, audio_texts, counters=counters, lesson=lesson, type_="listen-choice", prompt="Escucha la frase. ¿Dónde está el lugar mencionado?", expected=f"{es} aquí", tts_text=f"{cap} здесь.", choices=choice_values(f"{es} aquí", choice_distractors([f"{es} allí", f"no es {es}", "preguntan dónde está"], ["wrong_deictic", "negation_confusion", "question_statement_confusion"])), distractors=choice_distractors([f"{es} allí", f"no es {es}", "preguntan dónde está"], ["wrong_deictic", "negation_confusion", "question_statement_confusion"]), target_ids=[tid, g_where], primary=f"listening_location:{ru}", lemmas=[ru, "здесь"], structures=["audio_to_meaning", "где? здесь / там"], skill="listening", modality="audio", direction="audio_to_meaning", processing="comprehension", difficulty=4, context="La respuesta depende de entender здесь.", diagnostics={"possibleErrors": ["percepcion_auditiva", "wrong_deictic"]})
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige la frase rusa. No copies el orden español "está aquí".', display=f"Frase incorrecta: Это здесь {ru}.", expected=f"{cap} здесь.", target_ids=[tid, g_where], primary=f"location_here:{ru}", lemmas=[ru, "здесь"], structures=["где? здесь / там", "sin verbo estar"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=4, context="Para ubicar: sustantivo + здесь/там.", diagnostics={"possibleErrors": ["spanish_word_order", "spanish_ser_estar_interference"], "criticalErrors": ["spanish_ser_estar_interference"], "syntax": ["noun_deictic"]}))
    composite_ids = [vocab_target_for(by_ru, "аптека"), vocab_target_for(by_ru, "банк"), vocab_target_for(by_ru, "здесь"), vocab_target_for(by_ru, "там"), g_where]
    composite_expected = "Аптека здесь. Банк там."
    composite_distractors = choice_distractors(
        ["Аптека там. Банк здесь.", "Это аптека. Это банк.", "Аптека здесь. Банк здесь."],
        ["deictic_reversal", "identification_not_location", "one_location_not_contrasted"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "La farmacia está aquí. El banco está allí."', expected=composite_expected, target_ids=composite_ids, primary="composite_location_contrast", lemmas=["аптека", "банк", "здесь", "там"], structures=["где? здесь / там", "sin verbo estar"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="Contrasta dos lugares sin verbo estar y sin convertir ubicación en identificación.", challenge=True, diagnostics={"possibleErrors": ["wrong_deictic", "spanish_ser_estar_interference", "identification_not_location"], "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"], "syntax": ["noun_deictic"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres contrastar dos ubicaciones: "La farmacia está aquí. El banco está allí." Elige la opción rusa precisa.', expected=composite_expected, choices=choice_values(composite_expected, composite_distractors), distractors=composite_distractors, target_ids=composite_ids, primary="composite_location_contrast", lemmas=["аптека", "банк", "здесь", "там"], structures=["где? здесь / там", "sin verbo estar"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="La respuesta exige conservar ambos deícticos y no caer en это.", challenge=True, diagnostics={"possibleErrors": ["wrong_deictic", "identification_not_location"], "criticalErrors": ["wrong_deictic"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos ubicaciones rusas. Una frase copia el español y la otra pierde el contraste aquí/allí.', display="Frase incorrecta: Это здесь аптека. Банк здесь.", expected=composite_expected, target_ids=composite_ids, primary="composite_location_contrast", lemmas=["аптека", "банк", "здесь", "там"], structures=["где? здесь / там", "sin verbo estar"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="Hay que reparar estructura y significado, no sólo una palabra.", challenge=True, diagnostics={"possibleErrors": ["spanish_word_order", "wrong_deictic", "spanish_ser_estar_interference"], "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"], "syntax": ["noun_deictic"]}))
    second_ids = [vocab_target_for(by_ru, "музей"), vocab_target_for(by_ru, "школа"), vocab_target_for(by_ru, "здесь"), vocab_target_for(by_ru, "там"), g_where]
    second_expected = "Музей там. Школа здесь."
    second_distractors = choice_distractors(
        ["Музей здесь. Школа там.", "Это музей. Школа здесь.", "Музей там. Это школа."],
        ["deictic_reversal", "first_clause_identification", "second_clause_identification"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "El museo está allí. La escuela está aquí."', expected=second_expected, target_ids=second_ids, primary="composite_location_contrast_variant", lemmas=["музей", "школа", "здесь", "там"], structures=["где? здесь / там", "sin verbo estar"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="Ahora el contraste invierte el orden aquí/allí y exige no usar это.", challenge=True, diagnostics={"possibleErrors": ["wrong_deictic", "identification_not_location", "spanish_ser_estar_interference"], "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar: "El museo está allí. La escuela está aquí." Elige la opción que no invierte los deícticos.', expected=second_expected, choices=choice_values(second_expected, second_distractors), distractors=second_distractors, target_ids=second_ids, primary="composite_location_contrast_variant", lemmas=["музей", "школа", "здесь", "там"], structures=["где? здесь / там", "sin verbo estar"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="La trampa principal es responder por patrón, no por significado.", challenge=True, diagnostics={"possibleErrors": ["deictic_reversal", "identification_not_location"], "criticalErrors": ["wrong_deictic"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. Mantén museo allí y escuela aquí.', display="Frase incorrecta: Это там музей. Школа там.", expected=second_expected, target_ids=second_ids, primary="composite_location_contrast_variant", lemmas=["музей", "школа", "здесь", "там"], structures=["где? здесь / там", "sin verbo estar"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="Debes corregir una estructura copiada y un deíctico equivocado.", challenge=True, diagnostics={"possibleErrors": ["spanish_word_order", "wrong_deictic"], "criticalErrors": ["wrong_deictic", "spanish_ser_estar_interference"]}))
    return pool


def pronoun_for(ru):
    if ru in {"метро", "кафе"} or ru.endswith(("о", "е")):
        return "оно"
    if ru.endswith(("а", "я")) or ru in {"площадь", "церковь"}:
        return "она"
    return "он"


def lesson_three(items, grammar_by_lesson, audio_texts, counters):
    lesson = 3
    pool = []
    by_ru = {item["russian"]: item for item in items}
    pronouns = {"я": "yo", "ты": "tú", "он": "él", "она": "ella", "мы": "nosotros", "вы": "usted / vosotros", "они": "ellos"}
    professions = [item for item in items if item["russian"] not in pronouns and item["russian"] not in {"работа", "профессия"}]
    g_prof = grammar_target(grammar_by_lesson, lesson, "профессия без связки")
    g_pronouns = grammar_target(grammar_by_lesson, lesson, "я / ты / он / она / мы / вы / они")
    for item in professions:
        ru = item["russian"]
        es = primary_es(item.get("spanish"))
        tid = vocab_target(item)
        subject = "Она" if ru.endswith("а") and ru not in {"коллега"} else "Он"
        subject_es = "Ella" if subject == "Она" else "Él"
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "{subject_es} es {es}."', expected=f"{subject} {ru}.", target_ids=[tid, g_prof], primary=f"profession_no_copula:{ru}", lemmas=[ru, subject.lower()], structures=["профессия без связки"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Profesión en presente sin verbo ser/estar.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_pronoun"], "criticalErrors": ["spanish_ser_estar_interference"], "syntax": ["no_present_copula"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "Esta persona es {es}."', expected=f"Это {ru}.", target_ids=[tid, g_prof], primary=f"profession_identification:{ru}", lemmas=[ru], structures=["это + profesión"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Identificación de profesión sin verbo copulativo.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "lexical_recall_error"], "criticalErrors": ["spanish_ser_estar_interference"], "syntax": ["no_present_copula"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa para decir "{subject_es} es {es}".', display=f"{subject} ____.", expected=ru, target_ids=[tid, g_prof], primary=f"profession_no_copula:{ru}", lemmas=[ru, subject.lower()], structures=["профессия без связки"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=2, context="El hueco es la profesión rusa.", diagnostics={"possibleErrors": ["lexical_recall_error"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa para identificar la profesión "{es}".', display="Это ____.", expected=ru, target_ids=[tid, g_prof], primary=f"profession_identification:{ru}", lemmas=[ru], structures=["это + profesión"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=2, context="Recupera la profesión rusa sin añadir есть.", diagnostics={"possibleErrors": ["lexical_recall_error", "spanish_ser_estar_interference"]}))
        distractors = choice_distractors([f"{subject} есть {ru}.", f"Это {ru}.", f"Я {ru}."], ["spanish_ser_estar_interference", "identification_not_profession_statement", "wrong_subject"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres decir "{subject_es} es {es}". Elige la frase rusa natural.', expected=f"{subject} {ru}.", choices=choice_values(f"{subject} {ru}.", distractors), distractors=distractors, target_ids=[tid, g_prof], primary=f"profession_no_copula:{ru}", lemmas=[ru, subject.lower()], structures=["профессия без связки"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=3, context="No uses есть para profesiones en presente.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_subject"]}))
        identify_distractors = choice_distractors([f"Это есть {ru}.", f"{subject} {ru}.", f"Это не {ru}."], ["spanish_ser_estar_interference", "statement_about_person_not_identification", "wrong_negation"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres señalar que esta persona es {es}. Elige la frase rusa natural.', expected=f"Это {ru}.", choices=choice_values(f"Это {ru}.", identify_distractors), distractors=identify_distractors, target_ids=[tid, g_prof], primary=f"profession_identification:{ru}", lemmas=[ru], structures=["это + profesión"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=3, context="Identifica sin añadir un verbo ser/estar.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_negation"]}))
        add_listen(pool, audio_texts, counters=counters, lesson=lesson, type_="listen-choice", prompt="Escucha la frase. ¿Qué profesión se atribuye?", expected=f"{subject_es.lower()} es {es}", tts_text=f"{subject} {ru}.", choices=choice_values(f"{subject_es.lower()} es {es}", choice_distractors([f"yo soy {es}", f"{subject_es.lower()} no es {es}", f"preguntan por {es}"], ["wrong_subject", "negation_confusion", "question_statement_confusion"])), distractors=choice_distractors([f"yo soy {es}", f"{subject_es.lower()} no es {es}", f"preguntan por {es}"], ["wrong_subject", "negation_confusion", "question_statement_confusion"]), target_ids=[tid, g_prof], primary=f"listening_profession:{ru}", lemmas=[ru, subject.lower()], structures=["audio_to_meaning", "профессия без связки"], skill="listening", modality="audio", direction="audio_to_meaning", processing="comprehension", difficulty=4, context="Identifica sujeto y profesión.", diagnostics={"possibleErrors": ["percepcion_auditiva", "wrong_subject"]})
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige la frase rusa. No traduzcas "es" con есть.', display=f"Frase incorrecta: {subject} есть {ru}.", expected=f"{subject} {ru}.", target_ids=[tid, g_prof], primary="profession_no_copula", lemmas=[ru, subject.lower()], structures=["профессия без связки"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=4, context="En presente, profesión sin cópula.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference"], "criticalErrors": ["spanish_ser_estar_interference"], "syntax": ["no_present_copula"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige la identificación rusa. En presente no hace falta есть.', display=f"Frase incorrecta: Это есть {ru}.", expected=f"Это {ru}.", target_ids=[tid, g_prof], primary="profession_identification_no_copula", lemmas=[ru], structures=["это + profesión", "sin быть/есть en presente"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=4, context="Это + sustantivo/profesión funciona sin verbo copulativo.", diagnostics={"possibleErrors": ["spanish_ser_estar_interference"], "criticalErrors": ["spanish_ser_estar_interference"], "syntax": ["no_present_copula"]}))
    for ru, es in pronouns.items():
        tid = target_id("vocabulary", ru)
        distractors = choice_distractors([value for value in pronouns if value != ru][:3], ["wrong_person", "wrong_number", "pronoun_confusion"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'En una frase rusa necesitas el pronombre sujeto "{es}". ¿Cuál es?', expected=ru, choices=choice_values(ru, distractors), distractors=distractors, target_ids=[tid, g_pronouns], primary=f"subject_pronoun:{ru}", lemmas=[ru], structures=["я / ты / он / она / мы / вы / они"], skill="recognition", modality="text", direction="es_to_ru", processing="recognition", difficulty=2, context="Pronombre sujeto, no objeto.", diagnostics={"possibleErrors": ["wrong_person", "wrong_number"]}))
    composite_ids = [vocab_target_for(by_ru, "она"), vocab_target_for(by_ru, "он"), vocab_target_for(by_ru, "актриса"), vocab_target_for(by_ru, "врач"), g_prof, g_pronouns]
    composite_expected = "Она актриса. Он не врач."
    composite_distractors = choice_distractors(
        ["Она актриса. Он врач.", "Она есть актриса. Он не врач.", "Она актёр. Он не врач."],
        ["negation_missing", "spanish_ser_estar_interference", "wrong_profession_gender_or_lemma"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "Ella es actriz. Él no es médico."', expected=composite_expected, target_ids=composite_ids, primary="composite_profession_negation", lemmas=["она", "он", "актриса", "врач", "не"], structures=["профессия без связки", "я / ты / он / она / мы / вы / они", "не + profesión"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="Combina pronombre, profesión sin cópula y negación de profesión.", challenge=True, diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_pronoun", "wrong_negation_position", "lexical_recall_error"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_pronoun"], "syntax": ["no_present_copula", "не + nominal_predicate"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar: "Ella es actriz. Él no es médico." Elige la opción que conserva sujeto, profesión y negación.', expected=composite_expected, choices=choice_values(composite_expected, composite_distractors), distractors=composite_distractors, target_ids=composite_ids, primary="composite_profession_negation", lemmas=["она", "он", "актриса", "врач", "не"], structures=["профессия без связки", "я / ты / он / она / мы / вы / они", "не + profesión"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="No basta reconocer una profesión: hay que mantener contraste de sujeto y negación.", challenge=True, diagnostics={"possibleErrors": ["negation_missing", "spanish_ser_estar_interference", "wrong_profession_gender_or_lemma"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_pronoun"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. Una traduce "es" literalmente y la otra niega mal la profesión.', display="Frase incorrecta: Она есть актриса. Он нет врач.", expected=composite_expected, target_ids=composite_ids, primary="composite_profession_negation", lemmas=["она", "он", "актриса", "врач", "не"], structures=["профессия без связки", "не + profesión", "sin быть/есть en presente"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="Debes corregir simultáneamente cópula y partícula negativa.", challenge=True, diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"], "syntax": ["no_present_copula", "не + nominal_predicate"]}))
    second_ids = [vocab_target_for(by_ru, "он"), vocab_target_for(by_ru, "она"), vocab_target_for(by_ru, "инженер"), vocab_target_for(by_ru, "актриса"), g_prof, g_pronouns]
    second_expected = "Он инженер. Она не актриса."
    second_distractors = choice_distractors(
        ["Он есть инженер. Она не актриса.", "Он инженер. Она актриса.", "Она инженер. Он не актриса."],
        ["spanish_ser_estar_interference", "negation_missing", "subject_swap"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "Él es ingeniero. Ella no es actriz."', expected=second_expected, target_ids=second_ids, primary="composite_profession_negation_variant", lemmas=["он", "она", "инженер", "актриса", "не"], structures=["профессия без связки", "я / ты / он / она / мы / вы / они", "не + profesión"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="Combina profesión afirmativa y profesión negada con sujetos distintos.", challenge=True, diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_pronoun", "wrong_negation_position"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_pronoun"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar: "Él es ingeniero. Ella no es actriz." Elige la opción que no intercambia sujetos ni polaridad.', expected=second_expected, choices=choice_values(second_expected, second_distractors), distractors=second_distractors, target_ids=second_ids, primary="composite_profession_negation_variant", lemmas=["он", "она", "инженер", "актриса", "не"], structures=["профессия без связки", "я / ты / он / она / мы / вы / они", "не + profesión"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="Las opciones obligan a seguir sujeto, profesión y negación a la vez.", challenge=True, diagnostics={"possibleErrors": ["subject_swap", "negation_missing", "spanish_ser_estar_interference"], "criticalErrors": ["wrong_pronoun", "spanish_ser_estar_interference"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. Quita la cópula española y restaura la negación nominal.', display="Frase incorrecta: Он есть инженер. Она нет актриса.", expected=second_expected, target_ids=second_ids, primary="composite_profession_negation_variant", lemmas=["он", "она", "инженер", "актриса", "не"], structures=["профессия без связки", "не + profesión", "sin быть/есть en presente"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="Corrige dos interferencias sin alterar los sujetos.", challenge=True, diagnostics={"possibleErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"], "criticalErrors": ["spanish_ser_estar_interference", "wrong_negation_particle"]}))
    return pool


VERB_FORMS = {
    "гулять": "гуляю",
    "делать": "делаю",
    "думать": "думаю",
    "завтракать": "завтракаю",
    "закрывать": "закрываю",
    "знать": "знаю",
    "играть": "играю",
    "искать": "ищу",
    "обедать": "обедаю",
    "отдыхать": "отдыхаю",
    "открывать": "открываю",
    "писать": "пишу",
    "помогать": "помогаю",
    "работать": "работаю",
    "ужинать": "ужинаю",
    "читать": "читаю",
}

SPANISH_1SG = {
    "pasear": "paseo",
    "hacer": "hago",
    "pensar": "pienso",
    "desayunar": "desayuno",
    "cerrar": "cierro",
    "saber": "sé",
    "jugar": "juego",
    "buscar": "busco",
    "comer": "como",
    "descansar": "descanso",
    "abrir": "abro",
    "escribir": "escribo",
    "ayudar": "ayudo",
    "trabajar": "trabajo",
    "cenar": "ceno",
    "leer": "leo",
}


def lesson_four(items, grammar_by_lesson, audio_texts, counters):
    lesson = 4
    pool = []
    by_ru = {item["russian"]: item for item in items}
    verbs = [item for item in items if item["russian"] in VERB_FORMS]
    nouns = [item for item in items if item["russian"] not in VERB_FORMS]
    g_action = grammar_target(grammar_by_lesson, lesson, "я делаю / ты делаешь")
    g_inf = grammar_target(grammar_by_lesson, lesson, "что делать?")
    for item in verbs:
        ru = item["russian"]
        form = VERB_FORMS[ru]
        es = primary_es(item.get("spanish"))
        es_1sg = SPANISH_1SG.get(es, es)
        tid = vocab_target(item)
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "Quiero {es}."', expected=f"Я хочу {ru}.", target_ids=[tid, g_inf], primary=f"infinitive_after_хочу:{ru}", lemmas=[ru, "хочу"], structures=["я хочу + infinitivo"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Después de хочу se mantiene el infinitivo.", diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu"], "criticalErrors": ["wrong_infinitive_after_hochu"], "syntax": ["хочу + infinitive"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "Yo {es_1sg}."', expected=f"Я {form}.", target_ids=[tid, g_action], primary=f"first_person_singular:{ru}", lemmas=[ru, form], structures=["я + verbo en 1ª persona"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=3, context="Usa forma conjugada, no infinitivo.", diagnostics={"possibleErrors": ["infinitive_instead_of_conjugated"], "criticalErrors": ["infinitive_instead_of_conjugated"], "morphology": ["present_1sg"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa con el infinitivo ruso: "Quiero {es}".', display="Я хочу ____.", expected=ru, target_ids=[tid, g_inf], primary=f"infinitive_after_хочу:{ru}", lemmas=[ru], structures=["я хочу + infinitivo"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=2, context="El hueco no se conjuga.", diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa con la forma de "yo {es_1sg}".', display="Я ____.", expected=form, target_ids=[tid, g_action], primary=f"first_person_singular:{ru}", lemmas=[ru, form], structures=["я + verbo en 1ª persona"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=3, context="Aquí sí necesitas forma conjugada.", diagnostics={"possibleErrors": ["infinitive_instead_of_conjugated"], "morphology": ["present_1sg"]}))
        distractors = choice_distractors([f"Я {ru}.", f"Я {form}т.", f"Мне {form}."], ["infinitive_instead_of_conjugated", "wrong_person_ending", "spanish_subject_interference"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres decir "Yo {es_1sg}". Elige la frase rusa correcta.', expected=f"Я {form}.", choices=choice_values(f"Я {form}.", distractors), distractors=distractors, target_ids=[tid, g_action], primary=f"first_person_singular:{ru}", lemmas=[ru, form], structures=["я + verbo en 1ª persona"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=3, context="Distingue infinitivo y forma conjugada.", diagnostics={"possibleErrors": ["infinitive_instead_of_conjugated", "wrong_person_ending"]}))
        add_listen(pool, audio_texts, counters=counters, lesson=lesson, type_="listen-choice", prompt="Escucha la frase. ¿Qué hace la persona?", expected=f"yo {es_1sg}", tts_text=f"Я {form}.", choices=choice_values(f"yo {es_1sg}", choice_distractors([f"quiero {es}", f"tú {es_1sg}", "no funciona"], ["infinitive_vs_action", "wrong_subject", "unrelated_lesson_contrast"])), distractors=choice_distractors([f"quiero {es}", f"tú {es_1sg}", "no funciona"], ["infinitive_vs_action", "wrong_subject", "unrelated_lesson_contrast"]), target_ids=[tid, g_action], primary=f"listening_action:{ru}", lemmas=[ru, form], structures=["audio_to_meaning", "я + verbo en 1ª persona"], skill="listening", modality="audio", direction="audio_to_meaning", processing="comprehension", difficulty=4, context="No basta reconocer el verbo: distingue acción real de deseo.", diagnostics={"possibleErrors": ["percepcion_auditiva", "infinitive_vs_action"]})
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt="Corrige la frase rusa. Con я necesitas verbo conjugado.", display=f"Frase incorrecta: Я {ru}.", expected=f"Я {form}.", target_ids=[tid, g_action], primary=f"first_person_singular:{ru}", lemmas=[ru, form], structures=["я + verbo en 1ª persona"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=4, context="El infinitivo solo no funciona como predicado con я.", diagnostics={"possibleErrors": ["infinitive_instead_of_conjugated"], "criticalErrors": ["infinitive_instead_of_conjugated"], "morphology": ["present_1sg"]}))
    for item in nouns:
        ru = item["russian"]
        es = primary_es(item.get("spanish"))
        tid = vocab_target(item)
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "Esto es {es}."', expected=f"Это {ru}.", target_ids=[tid], primary=f"lemma:{ru}", lemmas=[ru], structures=["это + существительное"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=2, context="Vocabulario técnico reciclado con это.", diagnostics={"possibleErrors": ["lexical_recall_error"]}))
    composite_ids = [vocab_target_for(by_ru, "читать"), vocab_target_for(by_ru, "писать"), g_inf, g_action]
    composite_expected = "Я хочу читать. Я пишу."
    composite_distractors = choice_distractors(
        ["Я хочу читаю. Я пишу.", "Я хочу читать. Я писать.", "Я читаю. Я хочу писать."],
        ["conjugated_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "Quiero leer. Escribo."', expected=composite_expected, target_ids=composite_ids, primary="composite_want_infinitive_action", lemmas=["читать", "писать", "пишу", "хочу"], structures=["я хочу + infinitivo", "я + verbo en 1ª persona"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="Contrasta infinitivo exigido por хочу con forma conjugada independiente.", challenge=True, diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"], "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"], "morphology": ["present_1sg"], "syntax": ["хочу + infinitive"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar: "Quiero leer. Escribo." Elige la opción que no confunde deseo, infinitivo y acción real.', expected=composite_expected, choices=choice_values(composite_expected, composite_distractors), distractors=composite_distractors, target_ids=composite_ids, primary="composite_want_infinitive_action", lemmas=["читать", "писать", "пишу", "хочу"], structures=["я хочу + infinitivo", "я + verbo en 1ª persona"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="La opción correcta aplica dos reglas distintas en frases contiguas.", challenge=True, diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"], "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. Decide dónde va infinitivo y dónde va forma conjugada.', display="Frase incorrecta: Я хочу читаю. Я писать.", expected=composite_expected, target_ids=composite_ids, primary="composite_want_infinitive_action", lemmas=["читать", "писать", "пишу", "хочу"], structures=["я хочу + infinitivo", "я + verbo en 1ª persona"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="No basta cambiar una terminación: cada frase impone una forma verbal distinta.", challenge=True, diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"], "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"], "morphology": ["present_1sg"], "syntax": ["хочу + infinitive"]}))
    second_ids = [vocab_target_for(by_ru, "работать"), vocab_target_for(by_ru, "отдыхать"), g_inf, g_action]
    second_expected = "Я хочу работать. Я отдыхаю."
    second_distractors = choice_distractors(
        ["Я хочу работаю. Я отдыхаю.", "Я хочу работать. Я отдыхать.", "Я работаю. Я хочу отдыхать."],
        ["conjugated_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "Quiero trabajar. Descanso."', expected=second_expected, target_ids=second_ids, primary="composite_want_infinitive_action_variant", lemmas=["работать", "отдыхать", "отдыхаю", "хочу"], structures=["я хочу + infinitivo", "я + verbo en 1ª persona"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="La primera frase expresa deseo; la segunda, acción real en primera persona.", challenge=True, diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"], "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar: "Quiero trabajar. Descanso." Elige la opción que aplica la forma verbal adecuada en cada frase.', expected=second_expected, choices=choice_values(second_expected, second_distractors), distractors=second_distractors, target_ids=second_ids, primary="composite_want_infinitive_action_variant", lemmas=["работать", "отдыхать", "отдыхаю", "хочу"], structures=["я хочу + infinitivo", "я + verbo en 1ª persona"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="Responder exige distinguir deseo de acción, no reconocer un solo verbo.", challenge=True, diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated", "meaning_reversal"], "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. La forma tras хочу y la forma con я no son intercambiables.', display="Frase incorrecta: Я хочу работаю. Я отдыхать.", expected=second_expected, target_ids=second_ids, primary="composite_want_infinitive_action_variant", lemmas=["работать", "отдыхать", "отдыхаю", "хочу"], structures=["я хочу + infinitivo", "я + verbo en 1ª persona"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="Hay que diagnosticar dos errores de forma verbal en una sola respuesta.", challenge=True, diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"], "criticalErrors": ["wrong_infinitive_after_hochu", "infinitive_instead_of_conjugated"]}))
    return pool


OBJECT_PHRASES = [
    ("слушать", "музыка", "музыку", "escucho música", "escuchar música"),
    ("слушать", "радио", "радио", "escucho la radio", "escuchar la radio"),
    ("слушать", "песня", "песню", "escucho una canción", "escuchar una canción"),
    ("изучать", "русский язык", "русский язык", "estudio ruso", "estudiar ruso"),
    ("покупать", "журнал", "журнал", "compro una revista", "comprar una revista"),
    ("покупать", "молоко", "молоко", "compro leche", "comprar leche"),
    ("читать", "журнал", "журнал", "leo una revista", "leer una revista"),
    ("читать", "сообщение", "сообщение", "leo un mensaje", "leer un mensaje"),
    ("читать", "слово", "слово", "leo una palabra", "leer una palabra"),
]

GAME_WORDS = ["футбол", "баскетбол", "шахматы", "карты", "бильярд"]


def lesson_five(items, grammar_by_lesson, audio_texts, counters):
    lesson = 5
    pool = []
    by_ru = {item["russian"]: item for item in items}
    g_object = grammar_target(grammar_by_lesson, lesson, "слушать / изучать / покупать + что")
    g_game = grammar_target(grammar_by_lesson, lesson, "играть в + игра")
    for verb, noun, obj, es_action, es_inf in OBJECT_PHRASES:
        if verb not in by_ru or noun not in by_ru:
            continue
        verb_form = VERB_FORMS.get(verb, verb.replace("ть", "ю"))
        expected = f"Я {verb_form} {obj}."
        target_ids = [vocab_target(by_ru[verb]), vocab_target(by_ru[noun]), g_object]
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "Yo {es_action}."', expected=expected, target_ids=target_ids, primary=f"object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj], structures=["слушать / изучать / покупать + что"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=4, context="Usa verbo conjugado y objeto directo natural.", diagnostics={"possibleErrors": ["wrong_object_form", "infinitive_instead_of_conjugated"], "criticalErrors": ["wrong_object_form"], "cases": ["accusative"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "Quiero {es_inf}".', expected=f"Я хочу {verb} {obj}.", target_ids=target_ids, primary=f"want_object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj, "хочу"], structures=["я хочу + infinitivo", "слушать / изучать / покупать + что"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=4, context="Después de хочу, el verbo queda en infinitivo y conserva su objeto.", diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu", "wrong_object_form"], "criticalErrors": ["wrong_infinitive_after_hochu"], "cases": ["accusative"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa el objeto directo para decir "yo {es_action}".', display=f"Я {verb_form} ____.", expected=obj, target_ids=target_ids, primary=f"object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj], structures=["слушать / изучать / покупать + что"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=3, context="El hueco es el objeto que recibe la acción.", diagnostics={"possibleErrors": ["wrong_object_form"], "cases": ["accusative"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa el verbo conjugado para decir "yo {es_action}".', display=f"Я ____ {obj}.", expected=verb_form, target_ids=target_ids, primary=f"object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj, verb_form], structures=["слушать / изучать / покупать + что", "я + verbo en 1ª persona"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=3, context="El objeto ya está dado; recupera el verbo conjugado.", diagnostics={"possibleErrors": ["infinitive_instead_of_conjugated"], "morphology": ["present_1sg"]}))
        distractors = choice_distractors([f"Я {verb} {obj}.", f"Я {verb_form} {noun}.", f"Я {verb_form} в {obj}."], ["infinitive_instead_of_conjugated", "wrong_object_form", "wrong_preposition"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres decir "yo {es_action}". Elige la frase rusa correcta.', expected=expected, choices=choice_values(expected, distractors), distractors=distractors, target_ids=target_ids, primary=f"object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj], structures=["слушать / изучать / покупать + что"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=4, context="Distingue infinitivo, objeto directo y preposición innecesaria.", diagnostics={"possibleErrors": ["wrong_object_form", "wrong_preposition"]}))
        want_distractors = choice_distractors([f"Я хочу {verb_form} {obj}.", f"Я {verb} {obj}.", f"Я хочу {verb} в {obj}."], ["conjugated_after_hochu", "missing_hochu", "wrong_preposition"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres decir "quiero {es_inf}". Elige la frase rusa correcta.', expected=f"Я хочу {verb} {obj}.", choices=choice_values(f"Я хочу {verb} {obj}.", want_distractors), distractors=want_distractors, target_ids=target_ids, primary=f"want_object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj, "хочу"], structures=["я хочу + infinitivo", "слушать / изучать / покупать + что"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=4, context="хочу exige infinitivo, no forma conjugada.", diagnostics={"possibleErrors": ["wrong_infinitive_after_hochu", "wrong_preposition"]}))
        add_listen(pool, audio_texts, counters=counters, lesson=lesson, type_="listen-choice", prompt="Escucha la frase. ¿Qué acción realiza la persona?", expected=f"yo {es_action}", tts_text=expected, choices=choice_values(f"yo {es_action}", choice_distractors([f"quiero {es_inf}", "juego a un deporte", "preguntan qué hago"], ["infinitive_vs_action", "wrong_structure", "question_statement_confusion"])), distractors=choice_distractors([f"quiero {es_inf}", "juego a un deporte", "preguntan qué hago"], ["infinitive_vs_action", "wrong_structure", "question_statement_confusion"]), target_ids=target_ids, primary=f"listening_object:{verb}_{noun}", lemmas=[verb, noun, obj], structures=["audio_to_meaning", "слушать / изучать / покупать + что"], skill="listening", modality="audio", direction="audio_to_meaning", processing="comprehension", difficulty=5, context="Comprensión de acción y objeto.", diagnostics={"possibleErrors": ["percepcion_auditiva", "wrong_object_form"]})
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt="Corrige la frase rusa. El objeto directo no se introduce con в aquí.", display=f"Frase incorrecta: Я {verb_form} в {obj}.", expected=expected, target_ids=target_ids, primary=f"object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj], structures=["слушать / изучать / покупать + что"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="в se usa con играть в; no con este objeto directo.", diagnostics={"possibleErrors": ["wrong_preposition"], "criticalErrors": ["wrong_preposition"], "cases": ["accusative"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt="Corrige la frase rusa. Con я necesitas el verbo conjugado.", display=f"Frase incorrecta: Я {verb} {obj}.", expected=expected, target_ids=target_ids, primary=f"object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj, verb_form], structures=["слушать / изучать / покупать + что", "я + verbo en 1ª persona"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="El infinitivo no funciona solo con sujeto я.", diagnostics={"possibleErrors": ["infinitive_instead_of_conjugated"], "criticalErrors": ["infinitive_instead_of_conjugated"], "morphology": ["present_1sg"]}))
        negative_expected = f"Я не {verb_form} {obj}."
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "No {es_action}".', expected=negative_expected, target_ids=target_ids, primary=f"negative_object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj, "не"], structures=["не + глагол", "слушать / изучать / покупать + что"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=4, context="La negación va antes del verbo y el objeto directo se mantiene.", diagnostics={"possibleErrors": ["wrong_negation_position", "wrong_object_form"], "criticalErrors": ["wrong_negation_position"], "cases": ["accusative"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt="Corrige la frase rusa. Para negar una acción se usa не antes del verbo.", display=f"Frase incorrecta: Я нет {verb_form} {obj}.", expected=negative_expected, target_ids=target_ids, primary=f"negative_object_phrase:{verb}_{noun}", lemmas=[verb, noun, obj, "не"], structures=["не + глагол", "слушать / изучать / покупать + что"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="нет no sustituye a не delante de un verbo conjugado.", diagnostics={"possibleErrors": ["wrong_negation_particle"], "criticalErrors": ["wrong_negation_particle"], "syntax": ["не + verb"]}))
    for game in GAME_WORDS:
        if game not in by_ru:
            continue
        es = primary_es(by_ru[game].get("spanish"))
        target_ids = [vocab_target(by_ru[game]), g_game]
        expected = f"Я играю в {game}."
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "Juego a {es}."', expected=expected, target_ids=target_ids, primary=f"играть_в:{game}", lemmas=["играть", game], structures=["играть в + игра"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=4, context="Con juegos y deportes se usa играть в.", diagnostics={"possibleErrors": ["missing_preposition", "wrong_preposition"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "Quiero jugar a {es}."', expected=f"Я хочу играть в {game}.", target_ids=target_ids, primary=f"want_играть_в:{game}", lemmas=["играть", game, "хочу"], structures=["я хочу + infinitivo", "играть в + игра"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=4, context="хочу + infinitivo, y играть conserva в con juegos/deportes.", diagnostics={"possibleErrors": ["missing_preposition", "wrong_infinitive_after_hochu"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa la preposición para decir "juego a {es}".', display=f"Я играю ____ {game}.", expected="в", target_ids=target_ids, primary=f"играть_в:{game}", lemmas=["играть", game], structures=["играть в + игра"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=3, context="No omitas la preposición.", diagnostics={"possibleErrors": ["missing_preposition"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa la preposición para decir "quiero jugar a {es}".', display=f"Я хочу играть ____ {game}.", expected="в", target_ids=target_ids, primary=f"want_играть_в:{game}", lemmas=["играть", game, "хочу"], structures=["я хочу + infinitivo", "играть в + игра"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=4, context="Incluso tras хочу, играть в mantiene la preposición.", diagnostics={"possibleErrors": ["missing_preposition"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
        distractors = choice_distractors([f"Я играю {game}.", f"Я играю на {game}.", f"Я играю к {game}."], ["missing_preposition", "wrong_preposition_instrument", "wrong_preposition"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres decir "juego a {es}". Elige la frase rusa correcta.', expected=expected, choices=choice_values(expected, distractors), distractors=distractors, target_ids=target_ids, primary=f"играть_в:{game}", lemmas=["играть", game], structures=["играть в + игра"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=4, context="Contrasta jugar a deporte/juego con tocar instrumento.", diagnostics={"possibleErrors": ["missing_preposition", "wrong_preposition"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
        want_game_distractors = choice_distractors([f"Я хочу играю в {game}.", f"Я хочу играть {game}.", f"Я хочу играть на {game}."], ["conjugated_after_hochu", "missing_preposition", "wrong_preposition"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres decir "quiero jugar a {es}". Elige la frase rusa correcta.', expected=f"Я хочу играть в {game}.", choices=choice_values(f"Я хочу играть в {game}.", want_game_distractors), distractors=want_game_distractors, target_ids=target_ids, primary=f"want_играть_в:{game}", lemmas=["играть", game, "хочу"], structures=["я хочу + infinitivo", "играть в + игра"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=4, context="Debes aplicar dos restricciones: infinitivo tras хочу y в con juegos.", diagnostics={"possibleErrors": ["missing_preposition", "wrong_infinitive_after_hochu"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
        add_listen(pool, audio_texts, counters=counters, lesson=lesson, type_="listen-choice", prompt="Escucha la frase. ¿A qué juega la persona?", expected=f"juega a {es}", tts_text=expected, choices=choice_values(f"juega a {es}", choice_distractors(["escucha música", f"compra {es}", "toca un instrumento"], ["wrong_action", "wrong_verb", "wrong_preposition_domain"])), distractors=choice_distractors(["escucha música", f"compra {es}", "toca un instrumento"], ["wrong_action", "wrong_verb", "wrong_preposition_domain"]), target_ids=target_ids, primary=f"listening_играть_в:{game}", lemmas=["играть", game], structures=["audio_to_meaning", "играть в + игра"], skill="listening", modality="audio", direction="audio_to_meaning", processing="comprehension", difficulty=5, context="Comprende acción y complemento.", diagnostics={"possibleErrors": ["percepcion_auditiva", "wrong_preposition_domain"]})
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt="Corrige la frase rusa. Con juegos/deportes no se omite в.", display=f"Frase incorrecta: Я играю {game}.", expected=expected, target_ids=target_ids, primary=f"играть_в:{game}", lemmas=["играть", game], structures=["играть в + игра"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="играть в se usa con juegos y deportes.", diagnostics={"possibleErrors": ["missing_preposition"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt="Corrige la frase rusa. Después de хочу va infinitivo, y играть necesita в.", display=f"Frase incorrecta: Я хочу играю {game}.", expected=f"Я хочу играть в {game}.", target_ids=target_ids, primary=f"want_играть_в:{game}", lemmas=["играть", game, "хочу"], structures=["я хочу + infinitivo", "играть в + игра"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="La frase mezcla una forma conjugada y omite la preposición.", diagnostics={"possibleErrors": ["missing_preposition", "wrong_infinitive_after_hochu"], "criticalErrors": ["missing_preposition", "wrong_infinitive_after_hochu"], "syntax": ["играть в"]}))
        negative_expected = f"Я не играю в {game}."
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt=f'Traduce al ruso: "No juego a {es}."', expected=negative_expected, target_ids=target_ids, primary=f"negative_играть_в:{game}", lemmas=["играть", game, "не"], structures=["не + глагол", "играть в + игра"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=4, context="La negación va antes del verbo; в no desaparece.", diagnostics={"possibleErrors": ["missing_preposition", "wrong_negation_position"], "criticalErrors": ["missing_preposition"], "syntax": ["не + verb", "играть в"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="cloze", prompt=f'Completa la preposición para decir "no juego a {es}".', display=f"Я не играю ____ {game}.", expected="в", target_ids=target_ids, primary=f"negative_играть_в:{game}", lemmas=["играть", game, "не"], structures=["не + глагол", "играть в + игра"], skill="grammar_transfer", modality="text", direction="es_to_ru", processing="transformation", difficulty=4, context="La negación no cambia la preposición de играть в.", diagnostics={"possibleErrors": ["missing_preposition"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
        negative_distractors = choice_distractors([f"Я не играю {game}.", f"Я нет играю в {game}.", f"Я не играю на {game}."], ["missing_preposition", "wrong_negation_particle", "wrong_preposition"])
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt=f'Quieres decir "no juego a {es}". Elige la frase rusa correcta.', expected=negative_expected, choices=choice_values(negative_expected, negative_distractors), distractors=negative_distractors, target_ids=target_ids, primary=f"negative_играть_в:{game}", lemmas=["играть", game, "не"], structures=["не + глагол", "играть в + игра"], skill="recognition", modality="text", direction="context_to_ru", processing="recognition", difficulty=4, context="Distingue не, нет y la preposición в.", diagnostics={"possibleErrors": ["missing_preposition", "wrong_negation_particle"], "criticalErrors": ["missing_preposition"], "syntax": ["не + verb", "играть в"]}))
        pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt="Corrige la frase rusa. La negación no elimina в.", display=f"Frase incorrecta: Я не играю {game}.", expected=negative_expected, target_ids=target_ids, primary=f"negative_играть_в:{game}", lemmas=["играть", game, "не"], structures=["не + глагол", "играть в + игра"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="Incluso en negativo: играть в + juego/deporte.", diagnostics={"possibleErrors": ["missing_preposition"], "criticalErrors": ["missing_preposition"], "syntax": ["играть в"]}))
    composite_ids = [vocab_target_for(by_ru, "слушать"), vocab_target_for(by_ru, "музыка"), vocab_target_for(by_ru, "футбол"), g_object, g_game]
    composite_expected = "Я слушаю музыку. Я не играю в футбол."
    composite_distractors = choice_distractors(
        ["Я слушаю в музыку. Я не играю в футбол.", "Я слушаю музыку. Я нет играю футбол.", "Я хочу слушать музыку. Я играю в футбол."],
        ["wrong_preposition_with_object", "wrong_negation_and_missing_preposition", "meaning_reversal_or_aspect"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "Escucho música. No juego a fútbol."', expected=composite_expected, target_ids=composite_ids, primary="composite_object_negated_game", lemmas=["слушать", "музыка", "музыку", "играть", "футбол", "не"], structures=["слушать / изучать / покупать + что", "не + глагол", "играть в + игра"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="Distingue objeto directo sin preposición, negación verbal y играть в.", challenge=True, diagnostics={"possibleErrors": ["wrong_object_form", "wrong_preposition", "missing_preposition", "wrong_negation_position"], "criticalErrors": ["wrong_object_form", "missing_preposition", "wrong_negation_position"], "cases": ["accusative"], "syntax": ["не + verb", "играть в"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar: "Escucho música. No juego a fútbol." Elige la opción que conserva objeto directo, negación y играть в.', expected=composite_expected, choices=choice_values(composite_expected, composite_distractors), distractors=composite_distractors, target_ids=composite_ids, primary="composite_object_negated_game", lemmas=["слушать", "музыка", "музыку", "играть", "футбол", "не"], structures=["слушать / изучать / покупать + что", "не + глагол", "играть в + игра"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="Cada distractor falla en una restricción distinta; hay que leer la frase completa.", challenge=True, diagnostics={"possibleErrors": ["wrong_preposition", "wrong_negation_particle", "meaning_reversal_or_aspect"], "criticalErrors": ["wrong_object_form", "missing_preposition", "wrong_negation_position"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. No confundas objeto directo con играть в, y no uses нет ante verbo.', display="Frase incorrecta: Я слушаю в музыку. Я нет играю футбол.", expected=composite_expected, target_ids=composite_ids, primary="composite_object_negated_game", lemmas=["слушать", "музыка", "музыку", "играть", "футбол", "не"], structures=["слушать / изучать / покупать + что", "не + глагол", "играть в + игра"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="La corrección exige separar tres reglas que el español puede mezclar.", challenge=True, diagnostics={"possibleErrors": ["wrong_preposition", "wrong_negation_particle", "missing_preposition"], "criticalErrors": ["wrong_object_form", "missing_preposition", "wrong_negation_position"], "cases": ["accusative"], "syntax": ["не + verb", "играть в"]}))
    second_ids = [vocab_target_for(by_ru, "покупать"), vocab_target_for(by_ru, "молоко"), vocab_target_for(by_ru, "слушать"), vocab_target_for(by_ru, "радио"), g_object]
    second_expected = "Я покупаю молоко. Я не слушаю радио."
    second_distractors = choice_distractors(
        ["Я покупаю в молоко. Я не слушаю радио.", "Я покупаю молоко. Я нет слушаю радио.", "Я хочу покупать молоко. Я слушаю радио."],
        ["wrong_preposition_with_object", "wrong_negation_particle", "meaning_reversal_or_aspect"]
    )
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="text-input", prompt='Traduce al ruso como dos frases: "Compro leche. No escucho la radio."', expected=second_expected, target_ids=second_ids, primary="composite_object_negation_variant", lemmas=["покупать", "покупаю", "молоко", "слушать", "слушаю", "радио", "не"], structures=["слушать / изучать / покупать + что", "не + глагол"], skill="production", modality="text", direction="es_to_ru", processing="production", difficulty=5, context="Combina objeto directo afirmativo y objeto directo negado sin introducir preposiciones.", challenge=True, diagnostics={"possibleErrors": ["wrong_object_form", "wrong_preposition", "wrong_negation_particle"], "criticalErrors": ["wrong_preposition", "wrong_negation_position"], "cases": ["accusative"], "syntax": ["не + verb"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="multiple-choice", prompt='Quieres expresar: "Compro leche. No escucho la radio." Elige la opción que no convierte objeto directo en frase preposicional ni deseo.', expected=second_expected, choices=choice_values(second_expected, second_distractors), distractors=second_distractors, target_ids=second_ids, primary="composite_object_negation_variant", lemmas=["покупать", "покупаю", "молоко", "слушать", "слушаю", "радио", "не"], structures=["слушать / изучать / покупать + что", "не + глагол"], skill="grammar_transfer", modality="text", direction="context_to_ru", processing="inference", difficulty=5, context="La opción correcta mantiene acción real y negación verbal.", challenge=True, diagnostics={"possibleErrors": ["wrong_preposition", "wrong_negation_particle", "meaning_reversal_or_aspect"], "criticalErrors": ["wrong_preposition", "wrong_negation_position"]}))
    pool.append(make_exercise(counters=counters, lesson=lesson, type_="error-correction", prompt='Corrige las dos frases rusas. No añadas preposición al objeto directo y no uses нет con verbo.', display="Frase incorrecta: Я покупаю в молоко. Я нет слушаю радио.", expected=second_expected, target_ids=second_ids, primary="composite_object_negation_variant", lemmas=["покупать", "покупаю", "молоко", "слушать", "слушаю", "радио", "не"], structures=["слушать / изучать / покупать + что", "не + глагол"], skill="grammar_transfer", modality="text", direction="ru_to_ru", processing="diagnosis", difficulty=5, context="La corrección separa objeto directo y negación verbal.", challenge=True, diagnostics={"possibleErrors": ["wrong_preposition", "wrong_negation_particle"], "criticalErrors": ["wrong_preposition", "wrong_negation_position"], "cases": ["accusative"], "syntax": ["не + verb"]}))
    return pool


def validate_pool(pool, target_ids):
    valid = []
    rejected = []
    for exercise in pool:
        reasons = validate_exercise(exercise, target_ids)
        if reasons:
            rejected.append({"id": exercise.get("id"), "reasons": reasons})
        else:
            valid.append(exercise)
    return valid, rejected


def validate_exercise(exercise, target_ids):
    reasons = []
    for field in ["id", "lesson", "type", "prompt", "expected", "target_ids", "targets", "feedback", "difficulty", "importance", "modality", "direction"]:
        if exercise.get(field) in (None, "", [], {}):
            reasons.append(f"missing_{field}")
    if exercise.get("type") not in ALLOWED_TYPES:
        reasons.append("not_auto_correctable_type")
    if exercise.get("type") == "production-prompt" or exercise.get("allow_contains"):
        reasons.append("open_or_contains_grading")
    if any(phrase.lower() in str(exercise.get("prompt", "")).lower() for phrase in FORBIDDEN_PROMPTS):
        reasons.append("forbidden_prompt")
    expected = normalize_text(exercise.get("expected", ""))
    prompt = normalize_text(exercise.get("prompt", ""))
    if expected and expected in prompt:
        reasons.append("answer_in_prompt")
    for target in exercise.get("target_ids") or []:
        if target not in target_ids:
            reasons.append(f"unknown_target:{target}")
    feedback = exercise.get("feedback") or {}
    if len(str(feedback.get("incorrect", ""))) < 40:
        reasons.append("weak_feedback")
    quality = exercise.get("quality") or {}
    if int(quality.get("score") or 0) < 12:
        reasons.append("quality_below_12")
    if exercise.get("type") in {"multiple-choice", "listen-choice"}:
        choices = exercise.get("choices") or []
        if len(choices) != 4:
            reasons.append("choice_count_not_4")
        if sum(1 for choice in choices if choice.get("correct")) != 1:
            reasons.append("choice_correct_count_not_1")
        if len(exercise.get("distractors") or []) < 3:
            reasons.append("missing_distractor_reasons")
    if exercise.get("type") == "token-build":
        tokens = exercise.get("tokens") or []
        if len(tokens) < 4:
            reasons.append("token_build_too_few_tokens")
    if exercise.get("type") == "choice-grid":
        items = exercise.get("items") or []
        if len(items) < 2:
            reasons.append("choice_grid_too_few_items")
        for index, item in enumerate(items):
            choices = item.get("choices") or []
            expected_item = item.get("expected")
            if len(choices) < 3:
                reasons.append(f"choice_grid_item_{index}_too_few_choices")
            if expected_item not in choices:
                reasons.append(f"choice_grid_item_{index}_expected_not_in_choices")
    return reasons


def select_lesson_sets(pool):
    selected = []
    by_lesson = defaultdict(list)
    for exercise in pool:
        by_lesson[int(exercise["lesson"])].append(exercise)
    for lesson in sorted(FOUNDATION_LESSONS):
        buckets = {type_: [] for type_ in TYPE_PRIORITY}
        for exercise in by_lesson[lesson]:
            buckets.setdefault(exercise["type"], []).append(exercise)
        for bucket in buckets.values():
            bucket.sort(key=lambda item: (
                item.get("design") != "single_intent",
                not item.get("curated"),
                not item.get("challenge"),
                item.get("exam_role") == "exam",
                -int(item.get("difficulty") or 0),
                -int((item.get("quality") or {}).get("score") or 0),
                item.get("id", ""),
            ))
        lesson_items = []
        cursor = 0
        while len(lesson_items) < TARGET_PER_LESSON:
            made_progress = False
            for type_ in TYPE_PRIORITY:
                bucket = buckets.get(type_, [])
                if cursor < len(bucket) and len(lesson_items) < TARGET_PER_LESSON:
                    lesson_items.append(bucket[cursor])
                    made_progress = True
            if not made_progress:
                break
            cursor += 1
        if len(lesson_items) < TARGET_PER_LESSON:
            raise SystemExit(f"Lesson {lesson} only has {len(lesson_items)} valid exercises.")
        mark_exam_items(lesson_items)
        selected.extend(renumber_lesson(lesson_items[:TARGET_PER_LESSON], lesson))
    return selected


def mark_exam_items(items):
    all_exam_candidates = [
        item for item in items
        if item["type"] in {"text-input", "error-correction", "listen-choice", "cloze", "multiple-choice"}
        and item.get("exam_role") != "practice"
    ]
    exam_candidates = sorted([
        item for item in all_exam_candidates
        if int(item.get("difficulty") or 0) >= 3
    ], key=lambda item: (
        item.get("exam_role") != "exam",
        not item.get("curated"),
        not item.get("challenge"),
        -int(item.get("difficulty") or 0),
        -int((item.get("quality") or {}).get("score") or 0),
        item.get("id", ""),
    ))
    chosen = []
    challenge_exam_limit = 10

    def can_add_to_exam(item):
        if not item.get("challenge"):
            return True
        return sum(1 for chosen_item in chosen if chosen_item.get("challenge")) < challenge_exam_limit

    def add_exam_item(item):
        if item in chosen or not can_add_to_exam(item):
            return False
        chosen.append(item)
        return True

    for type_ in ["text-input", "error-correction", "multiple-choice", "cloze", "listen-choice"]:
        for item in exam_candidates:
            if item["type"] == type_ and add_exam_item(item):
                break
    for item in exam_candidates:
        if len(chosen) >= EXAM_PER_LESSON:
            break
        if item.get("exam_role") == "exam":
            add_exam_item(item)
    for item in exam_candidates:
        if len(chosen) >= EXAM_PER_LESSON:
            break
        add_exam_item(item)
    chosen_ids = {id(item) for item in chosen[:EXAM_PER_LESSON]}
    for item in items:
        exam = id(item) in chosen_ids
        item["unlock_exam"] = exam
        item["quality"]["suitableForUnlockExam"] = exam
        if exam:
            item["exam_challenge"] = True
            item["difficulty"] = 5
            item["targets"]["difficulty"] = 5
            item["quality"]["score"] = max(18, int(item["quality"].get("score") or 0))
            item["quality"]["requiresUnderstanding"] = True
            item["quality"]["requiresRecall"] = True
            item["quality"]["requiresApplication"] = True
            item["importance"] = 0.88
            item["targets"]["importance"] = 0.88
            item["weight"] = 0.44


def renumber_lesson(items, lesson):
    output = []
    for index, item in enumerate(items, start=1):
        next_item = json.loads(json.dumps(item, ensure_ascii=False))
        next_item["id"] = f"foundation-l{lesson:02d}-{index:03d}"
        output.append(next_item)
    return output


def validate_final(selected, target_ids):
    errors = []
    counts = Counter(item["lesson"] for item in selected)
    for lesson in sorted(FOUNDATION_LESSONS):
        if counts[lesson] != TARGET_PER_LESSON:
            errors.append(f"lesson_{lesson}_count_{counts[lesson]}")
        exam_count = sum(1 for item in selected if item["lesson"] == lesson and item.get("unlock_exam"))
        if exam_count < EXAM_PER_LESSON:
            errors.append(f"lesson_{lesson}_exam_count_{exam_count}")
        types = Counter(item["type"] for item in selected if item["lesson"] == lesson)
        for required in ["text-input", "error-correction", "listen-choice", "cloze", "multiple-choice"]:
            if not types[required]:
                errors.append(f"lesson_{lesson}_missing_{required}")
    for exercise in selected:
        reasons = validate_exercise(exercise, target_ids)
        if reasons:
            errors.append(f"{exercise['id']}: {', '.join(reasons)}")
    return errors


def write_audit(existing, legacy_audit, selected, cycle_reports):
    discarded = [item for item in legacy_audit if item["status"] == "discarded"]
    retained = [item for item in legacy_audit if item["status"] != "discarded"]
    summary = {
        "protocol": "PROTOCOLO_ESTRICTO_DE_GENERACION_DE_EJERCICIOS_PARUSKI",
        "iterations": ITERATIONS,
        "legacy_total": len(existing),
        "legacy_retained": len(retained),
        "legacy_discarded": len(discarded),
        "generated_total": len(selected),
        "generated_by_lesson": Counter(item["lesson"] for item in selected),
        "generated_by_type": Counter(item["type"] for item in selected),
        "exam_by_lesson": {
            str(lesson): sum(1 for item in selected if item["lesson"] == lesson and item.get("unlock_exam"))
            for lesson in sorted(FOUNDATION_LESSONS)
        },
    }
    write_json(AUDIT_JSON_PATH, {
        "summary": summary,
        "legacy_review": legacy_audit,
        "cycles": cycle_reports,
        "generated_examples": selected[:20],
    })
    lines = [
        "# Auditoría de ejercicios fundacionales Paruski",
        "",
        "Este informe documenta la sustitución del corpus estático anterior por ejercicios corregibles automáticamente.",
        "",
        "## Decisión",
        "",
        f"- Ejercicios legacy revisados: {len(existing)}.",
        f"- Ejercicios legacy conservados: {len(retained)}.",
        f"- Ejercicios legacy descartados: {len(discarded)}.",
        f"- Ejercicios nuevos publicados: {len(selected)}.",
        "- Criterio de corrección: elección con una única opción correcta o respuesta exacta con variantes cerradas.",
        "- No se publica ningún ejercicio `production-prompt` ni ningún ejercicio con `allow_contains`.",
        "",
        "## Cobertura nueva",
        "",
    ]
    by_lesson = Counter(item["lesson"] for item in selected)
    by_type_lesson = defaultdict(Counter)
    for item in selected:
        by_type_lesson[item["lesson"]][item["type"]] += 1
    for lesson in sorted(FOUNDATION_LESSONS):
        lines.append(f"- Lección {lesson}: {by_lesson[lesson]} ejercicios; examen: {summary['exam_by_lesson'][str(lesson)]}; tipos: {dict(by_type_lesson[lesson])}.")
    lines.extend([
        "",
        "## Bucle de validación",
        "",
    ])
    for report in cycle_reports:
        rejected = report["rejected_candidates"] + len(report["selected_rejected"])
        lines.append(f"- Ciclo {report['cycle']}: candidatos {report['candidate_count']}, válidos {report['valid_candidates']}, rechazados {rejected}, seleccionados {report['selected_count']}.")
    reason_counts = Counter(reason for item in discarded for reason in item["reasons"])
    lines.extend([
        "",
        "## Motivos de descarte legacy",
        "",
    ])
    for reason, count in reason_counts.most_common():
        lines.append(f"- {count}: {reason}")
    lines.extend([
        "",
        "## Listado legacy revisado",
        "",
        "El detalle completo está en `docs/exercise-audit-first5.json`. Resumen por id:",
        "",
    ])
    for item in legacy_audit:
        reasons = "; ".join(item["reasons"])
        lines.append(f"- `{item['id']}`: {item['status']} ({reasons})")
    AUDIT_MD_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
