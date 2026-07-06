#!/usr/bin/env python3
"""Validate Paruski exercise quality gates that can be checked statically."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_PROMPTS = [
    "Elige la frase rusa que aplica",
    "Estructura que conviene reconocer",
    "Selecciona el ejemplo",
    "Reconoce la estructura",
    "Frase de práctica",
    "Ejemplo de uso",
]
CHOICE_TYPES = {"multiple_choice", "multiple-choice", "listen-choice", "listen_choice", "audio_mcq", "audio-choice"}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    errors: list[str] = []
    exercises = read_json(REPO_ROOT / "content" / "exercises.json")
    for index, exercise in enumerate(exercises):
        label = exercise.get("id") or f"exercise[{index}]"
        prompt = str(exercise.get("prompt") or "")
        expected = str(exercise.get("expected") or "")
        for phrase in FORBIDDEN_PROMPTS:
            if phrase.lower() in prompt.lower():
                errors.append(f"{label}: forbidden prompt phrase: {phrase}")
        for field in ("id", "lesson", "skill", "type", "prompt", "expected"):
            if not exercise.get(field):
                errors.append(f"{label}: missing required field {field}")
        if not (exercise.get("targets") or exercise.get("target_ids") or exercise.get("tags")):
            errors.append(f"{label}: missing target signal (targets, target_ids or tags)")
        if expected and len(expected) > 2 and normalize(expected) in normalize(prompt):
            errors.append(f"{label}: expected answer appears in prompt")
        if str(exercise.get("type")) in CHOICE_TYPES:
            choices = exercise.get("choices") or []
            if len(choices) < 3:
                errors.append(f"{label}: choice exercise has fewer than 3 choices")
            if choices and not any(choice.get("correct") for choice in choices):
                errors.append(f"{label}: choice exercise has no marked correct choice")

    if errors:
        print("Exercise quality validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"Exercise quality validation passed: {len(exercises)} static exercises checked.")
    return 0


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


if __name__ == "__main__":
    raise SystemExit(main())
