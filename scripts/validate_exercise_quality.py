#!/usr/bin/env python3
"""Validate Paruski static exercises against the strict protocol gates.

Extended with advanced cognitive-demand gates for unlock-exam and challenge
items so that simple recognition practice cannot unlock mastery on its own.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
FOUNDATION_LESSONS = {1, 2, 3, 4, 5}
TARGET_PER_FOUNDATION_LESSON = 100
EXAM_PER_FOUNDATION_LESSON = 20
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
CHOICE_TYPES = {"multiple-choice", "listen-choice"}
FORBIDDEN_PROMPTS = [
    "Elige la frase rusa que aplica",
    "Estructura que conviene reconocer",
    "Selecciona el ejemplo",
    "Reconoce la estructura",
    "Frase de práctica",
    "Ejemplo de uso",
]

# Fields that signal cognitive demand (all optional / additive)
ADVANCED_QUALITY_FIELDS = {
    "requiresGeneralization",
    "requiresTransfer",
    "novelContext",
    "notImmediatelyAfterExplanation",
    "contrastive",
    "combinesTargets",
    "suitableForAdvancedLearner",
}
ADVANCED_EXAM_ROLES = {"challenge", "unlock", "cumulative", "diagnostic"}
ADVANCED_TRANSFER_LEVELS = {"near", "medium", "far"}
ADVANCED_EXPOSURE_DEPS = {
    "seen_pattern",
    "unseen_context",
    "unseen_combination",
    "inference_before_explanation",
}
TRIVIAL_TYPES = {"multiple-choice"}  # recognition-only unless enriched


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


_ADVANCED_WARNINGS: list[str] = []


def main() -> int:
    errors: list[str] = []
    exercises = read_json(REPO_ROOT / "content" / "exercises.json")
    target_ids = build_target_ids()

    counts = Counter(int(exercise.get("lesson") or 0) for exercise in exercises)
    for lesson in sorted(FOUNDATION_LESSONS):
      if counts[lesson] != TARGET_PER_FOUNDATION_LESSON:
          errors.append(f"lesson {lesson}: expected {TARGET_PER_FOUNDATION_LESSON} exercises, found {counts[lesson]}")
      exam_count = sum(1 for exercise in exercises if int(exercise.get("lesson") or 0) == lesson and exercise.get("unlock_exam"))
      if exam_count != EXAM_PER_FOUNDATION_LESSON:
          errors.append(f"lesson {lesson}: expected {EXAM_PER_FOUNDATION_LESSON} unlock exam exercises, found {exam_count}")

    for index, exercise in enumerate(exercises):
        label = exercise.get("id") or f"exercise[{index}]"
        errors.extend(validate_exercise(label, exercise, target_ids))

    if _ADVANCED_WARNINGS:
        print(f"Advanced metadata upgrade warnings ({len(_ADVANCED_WARNINGS)} items):", file=sys.stderr)
        for warning in _ADVANCED_WARNINGS:
            print(f"  ! {warning}", file=sys.stderr)
    if errors:
        print("Exercise quality validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"Exercise quality validation passed: {len(exercises)} static exercises checked.")
    return 0


def validate_exercise(label: str, exercise: dict[str, Any], target_ids: set[str]) -> list[str]:
    errors: list[str] = []
    for field in ("id", "lesson", "skill", "type", "prompt", "expected", "target_ids", "targets", "feedback", "difficulty", "importance", "modality", "direction"):
        if exercise.get(field) in (None, "", [], {}):
            errors.append(f"{label}: missing required field {field}")

    type_ = str(exercise.get("type") or "")
    if type_ not in ALLOWED_TYPES:
        errors.append(f"{label}: type is not deterministically auto-correctable: {type_}")
    if type_ == "production-prompt" or exercise.get("allow_contains"):
        errors.append(f"{label}: open/contains grading is forbidden")

    prompt = str(exercise.get("prompt") or "")
    expected = str(exercise.get("expected") or "")
    for phrase in FORBIDDEN_PROMPTS:
        if phrase.lower() in prompt.lower():
            errors.append(f"{label}: forbidden prompt phrase: {phrase}")
    if expected and len(normalize(expected)) > 1 and normalize(expected) in normalize(prompt):
        errors.append(f"{label}: expected answer appears in prompt")

    for target_id in exercise.get("target_ids") or []:
        if target_id not in target_ids:
            errors.append(f"{label}: unknown target_id {target_id}")

    feedback = exercise.get("feedback") or {}
    if len(str(feedback.get("incorrect") or "")) < 40:
        errors.append(f"{label}: feedback is too weak")
    if not (feedback.get("byErrorType") or feedback.get("errorSpecific")):
        errors.append(f"{label}: missing error-specific feedback")

    targets = exercise.get("targets") or {}
    for field in ("primary", "skills", "modality", "direction", "processing", "difficulty", "importance"):
        if targets.get(field) in (None, "", [], {}):
            errors.append(f"{label}: targets missing {field}")

    quality = exercise.get("quality") or {}
    if int(quality.get("score") or 0) < 12:
        errors.append(f"{label}: quality score below 12")
    if quality.get("isTrivialRecognition"):
        errors.append(f"{label}: marked as trivial recognition")
    if quality.get("answerGivenInPrompt"):
        errors.append(f"{label}: marked as answer given in prompt")
    if exercise.get("auto_correctable") is not True:
        errors.append(f"{label}: not marked auto_correctable")

    if type_ in CHOICE_TYPES:
        choices = exercise.get("choices") or []
        if len(choices) != 4:
            errors.append(f"{label}: choice exercise must have exactly 4 choices")
        if sum(1 for choice in choices if choice.get("correct")) != 1:
            errors.append(f"{label}: choice exercise must have exactly one correct choice")
        if len(exercise.get("distractors") or []) < 3:
            errors.append(f"{label}: missing diagnostic distractors")

    if type_ == "token-build":
        tokens = exercise.get("tokens") or []
        if len(tokens) < 4:
            errors.append(f"{label}: token-build must include distractor tokens")

    if type_ == "choice-grid":
        items = exercise.get("items") or []
        if len(items) < 2:
            errors.append(f"{label}: choice-grid must include at least two decisions")
        for item_index, item in enumerate(items):
            choices = item.get("choices") or []
            if len(choices) < 3:
                errors.append(f"{label}: choice-grid item {item_index} has too few choices")
            if item.get("expected") not in choices:
                errors.append(f"{label}: choice-grid item {item_index} expected answer is not a choice")

    if exercise.get("unlock_exam"):
        if int(quality.get("score") or 0) < 12:
            errors.append(f"{label}: exam exercise below quality threshold")
        if type_ not in {"text-input", "error-correction", "listen-choice", "cloze", "multiple-choice", "transform", "token-build", "choice-grid"}:
            errors.append(f"{label}: exam exercise type not allowed")

    # ── Advanced cognitive-demand gates ──────────────────────────────
    adv_errors, adv_warnings = validate_advanced_metadata(label, exercise)
    errors.extend(adv_errors)
    _ADVANCED_WARNINGS.extend(adv_warnings)
    return errors


def is_advanced_item(exercise: dict[str, Any]) -> bool:
    """True if this exercise is an unlock exam, a challenge item, or has an
    advanced exam_role."""
    if exercise.get("unlock_exam"):
        return True
    if exercise.get("exam_challenge") or exercise.get("challenge"):
        return True
    role = str(exercise.get("exam_role") or "").lower()
    return role in ADVANCED_EXAM_ROLES


def validate_advanced_metadata(label: str, exercise: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Enforce higher standards for unlock exams and challenge items without
    rejecting ordinary practice.

    Returns (errors, warnings).  Hard errors are raised only when an item
    already declares advanced metadata or violates a universal quality gate
    (answer-in-prompt, trivial recognition, etc.).  Warnings are issued for
    exam items that have not yet been upgraded with cognitive-demand fields.
    """
    errors: list[str] = []
    warnings: list[str] = []
    if not is_advanced_item(exercise):
        return errors, warnings

    quality = exercise.get("quality") or {}
    type_ = str(exercise.get("type") or "")
    expected = str(exercise.get("expected") or "")
    prompt = str(exercise.get("prompt") or "")

    # ── Universal hard gates (apply to ALL advanced items) ───────────

    # 1. No answer in prompt
    if expected and len(normalize(expected)) > 1 and normalize(expected) in normalize(prompt):
        errors.append(f"{label}: advanced/exam item must not reveal answer in prompt")

    # 2. Not trivial recognition
    if quality.get("isTrivialRecognition"):
        errors.append(f"{label}: advanced/exam item must not be trivial recognition")
    if type_ in TRIVIAL_TYPES and not quality.get("requiresInference") and not quality.get("requiresApplication"):
        errors.append(f"{label}: multiple-choice exam item must require inference or application, not bare recognition")

    # 3. Requires application or inference (hard gate)
    requires_application = bool(quality.get("requiresApplication"))
    requires_inference = bool(quality.get("requiresInference"))
    requires_generalization = bool(quality.get("requiresGeneralization"))
    requires_transfer = bool(quality.get("requiresTransfer"))
    if not (requires_application or requires_inference or requires_generalization or requires_transfer):
        errors.append(
            f"{label}: advanced/exam item must require application, inference, "
            "generalization, or transfer"
        )

    # 4. Specific feedback (at least 60 chars for advanced items)
    feedback = exercise.get("feedback") or {}
    if len(str(feedback.get("incorrect") or "")) < 60:
        errors.append(f"{label}: advanced/exam feedback must be specific (>= 60 chars)")

    # 5. Target-level evidence
    srs = exercise.get("srs") or {}
    evidence = srs.get("countsAsEvidenceFor") or []
    if not evidence:
        errors.append(f"{label}: advanced/exam item must declare target-level evidence (srs.countsAsEvidenceFor)")

    # 6. Combination of targets consistency
    target_ids = exercise.get("target_ids") or []
    if quality.get("combinesTargets") and len(target_ids) < 2:
        errors.append(f"{label}: marked combinesTargets but has fewer than 2 target_ids")

    # 7. Trivial recognition must never unlock mastery
    if exercise.get("unlock_exam") and quality.get("isTrivialRecognition"):
        errors.append(f"{label}: trivial recognition must never be in an unlock exam")

    # ── Hard gates for choice-based tasks ────────────────────────────
    if type_ in CHOICE_TYPES:
        distractors = exercise.get("distractors") or []
        if len(distractors) < 3:
            errors.append(f"{label}: advanced choice item must have at least 3 diagnostic distractors")
        else:
            for index, distractor in enumerate(distractors):
                if not (distractor.get("diagnosticReason") or distractor.get("diagnostic_reason")):
                    errors.append(
                        f"{label}: advanced choice distractor {index} must declare a "
                        "diagnostic reason"
                    )

    # ── Validate optional additive fields when present ───────────────
    transfer_level = str(exercise.get("transfer_level") or "").lower()
    if transfer_level and transfer_level not in ADVANCED_TRANSFER_LEVELS:
        errors.append(
            f"{label}: transfer_level must be one of {sorted(ADVANCED_TRANSFER_LEVELS)}, "
            f"got '{transfer_level}'"
        )

    exposure_dep = str(exercise.get("exposure_dependency") or "").lower()
    if exposure_dep and exposure_dep not in ADVANCED_EXPOSURE_DEPS:
        errors.append(
            f"{label}: exposure_dependency must be one of {sorted(ADVANCED_EXPOSURE_DEPS)}, "
            f"got '{exposure_dep}'"
        )

    # ── Soft gates: warnings for missing upgrade metadata ────────────
    # These do not fail the build but flag items that should be upgraded.
    if exercise.get("unlock_exam"):
        has_transfer_meta = (
            quality.get("requiresGeneralization")
            or quality.get("requiresTransfer")
            or quality.get("novelContext")
            or quality.get("notImmediatelyAfterExplanation")
        )
        if not has_transfer_meta:
            warnings.append(
                f"{label}: unlock exam item not yet upgraded with generalization / transfer / "
                "novelContext / notImmediatelyAfterExplanation"
            )
        critical = (exercise.get("diagnostics") or {}).get("criticalErrors") or []
        if not critical:
            warnings.append(
                f"{label}: unlock exam item has no critical errors declared in diagnostics.criticalErrors"
            )

    return errors, warnings


def build_target_ids() -> set[str]:
    vocabulary = read_json(REPO_ROOT / "content" / "vocabulary.json")
    materials = read_json(REPO_ROOT / "content" / "materials.json")
    ids: set[str] = set()
    for item in vocabulary:
        if item.get("russian"):
            ids.add(target_id("vocabulary", item["russian"]))
    for entry in materials.get("classes", []):
        for text in entry.get("v", []):
            ids.add(target_id("vocabulary", text))
        for text in entry.get("g", []):
            ids.add(target_id("grammar", text))
    return ids


def target_id(kind: str, text: str) -> str:
    key = f"{kind}:{normalize(text)}"
    return f"ru-{kind}-{hash_string(key)}"


def normalize(value: str) -> str:
    text = str(value or "").strip().lower()
    text = "".join(ch for ch in unicodedata.normalize("NFD", text) if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[?.!\u00bf\u00a1,;:\u00ab\u00bb\u201c\u201d\"']", "", text)
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


if __name__ == "__main__":
    raise SystemExit(main())
