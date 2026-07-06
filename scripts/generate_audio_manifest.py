#!/usr/bin/env python3
"""Generate Paruski static-audio manifests from the central course database.

The script reads content/paruski-db.json as the source of truth, resolves the
canonical material sources declared there, deduplicates Russian targets and
examples, scans a static audio directory, and writes:

- content/audio-worklist.json: every text that should be recorded/synthesised.
- content/audio-index.json: only entries whose audio file already exists.

It uses only Python's standard library so it can run anywhere.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = REPO_ROOT / "content" / "paruski-db.json"
DEFAULT_AUDIO_DIR = REPO_ROOT / "content" / "audio" / "ru"
DEFAULT_INDEX = REPO_ROOT / "content" / "audio-index.json"
DEFAULT_WORKLIST = REPO_ROOT / "content" / "audio-worklist.json"

CYRILLIC_SLUG = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

AUDIO_EXTS = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".opus": "audio/ogg",
    ".m4a": "audio/mp4",
}

CYRILLIC_RE = re.compile(r"[а-яё]", re.IGNORECASE)
LATIN_RE = re.compile(r"[a-záéíóúüñ]", re.IGNORECASE)


@dataclass
class AudioNeed:
    text: str
    language: str = "ru"
    kind: str = "target"
    normalized_text: str = ""
    id: str = ""
    source_refs: list[str] = field(default_factory=list)
    lesson_refs: list[int] = field(default_factory=list)
    priority: int = 50

    def as_json(self, repo_root: Path, audio_dir: Path, ext: str) -> dict[str, Any]:
        filename = filename_for(self.text, ext)
        return {
            "id": self.id,
            "language": self.language,
            "kind": self.kind,
            "text": self.text,
            "normalized_text": self.normalized_text,
            "suggested_path": relpath(audio_dir / filename, repo_root),
            "source_refs": sorted(set(self.source_refs)),
            "lesson_refs": sorted(set(self.lesson_refs)),
            "priority": self.priority,
        }


def read_json(path: Path, fallback: Any | None = None) -> Any:
    if not path.exists():
        if fallback is not None:
            return fallback
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def relpath(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def normalize(text: str) -> str:
    text = str(text or "").strip().lower()
    text = re.sub(r"[?.!¿¡,;:«»“”\"'()\[\]{}]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(text: str, max_len: int = 64) -> str:
    text = normalize(text)
    chars: list[str] = []
    for ch in text:
        if ch in CYRILLIC_SLUG:
            chars.append(CYRILLIC_SLUG[ch])
        elif ch.isascii() and ch.isalnum():
            chars.append(ch.lower())
        elif ch.isspace() or ch in "-_/":
            chars.append("-")
    slug = re.sub(r"-+", "-", "".join(chars)).strip("-") or "audio"
    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]
    if len(slug) > max_len:
        slug = slug[:max_len].rstrip("-")
    return f"{slug}-{digest}"


def filename_for(text: str, ext: str) -> str:
    ext = ext if ext.startswith(".") else f".{ext}"
    return f"{slugify(text)}{ext}"


def audio_duration_ms(path: Path) -> int | None:
    if path.suffix.lower() != ".wav":
        return None
    try:
        with wave.open(str(path), "rb") as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            if not rate:
                return None
            return round(frames / rate * 1000)
    except wave.Error:
        return None


def resolve_repo_path(repo_root: Path, maybe_relative: str) -> Path:
    path = Path(maybe_relative)
    return path if path.is_absolute() else repo_root / path


def add_need(needs: dict[str, AudioNeed], text: str, *, kind: str, source_ref: str, lesson_refs: Iterable[int] = (), priority: int = 50) -> None:
    normalized = normalize(text)
    if not normalized:
        return
    if not is_recordable_russian(text):
        return
    key = f"ru:{normalized}"
    item = needs.get(key)
    if item is None:
        item = AudioNeed(
            id=f"ru-audio-{slugify(text)}",
            language="ru",
            kind=kind,
            text=str(text).strip(),
            normalized_text=normalized,
            source_refs=[],
            lesson_refs=[],
            priority=priority,
        )
        needs[key] = item
    item.source_refs.append(source_ref)
    item.lesson_refs.extend(int(x) for x in lesson_refs if isinstance(x, int) or str(x).isdigit())
    item.priority = max(item.priority, priority)
    if item.kind != kind:
        item.kind = "mixed"


def is_recordable_russian(text: str) -> bool:
    value = str(text or "").strip()
    if not CYRILLIC_RE.search(value):
        return False
    if LATIN_RE.search(value):
        return False
    return True


def collect_needs(repo_root: Path, db_path: Path, include_examples: bool = True) -> list[AudioNeed]:
    db = read_json(db_path)
    sources = (db.get("canonical_sources") or {}).get("ru", {})
    materials_path = resolve_repo_path(repo_root, sources.get("legacy_materials", "content/materials.json"))
    aspect_path = resolve_repo_path(repo_root, sources.get("legacy_aspect_materials", "content/materials-aspect.json"))
    notes_path = resolve_repo_path(repo_root, sources.get("learning_notes", "content/learning-notes.json"))
    exercises_path = resolve_repo_path(repo_root, sources.get("exercises", "content/exercises.json"))
    vocabulary_path = resolve_repo_path(repo_root, sources.get("vocabulary", "content/vocabulary.json"))

    needs: dict[str, AudioNeed] = {}

    for card in db.get("cards", []):
      if card.get("language", "ru") == "ru":
        add_need(needs, card.get("text", ""), kind="card", source_ref="paruski-db:cards", priority=100)
        if include_examples:
            for example in card.get("examples", []):
                add_need(needs, example, kind="example", source_ref=f"paruski-db:card:{card.get('id', 'card')}", priority=62)

    vocabulary = read_json(vocabulary_path, [])
    if include_examples:
        for item in vocabulary:
            lesson = int(item.get("lesson") or 0) if str(item.get("lesson") or "").isdigit() else 0
            add_need(
                needs,
                item.get("example", ""),
                kind="example:vocabulary",
                source_ref=f"vocabulary:{item.get('id', item.get('russian', 'item'))}",
                lesson_refs=[lesson] if lesson else [],
                priority=61,
            )

    for label, path in (("materials", materials_path), ("materials-aspect", aspect_path)):
        data = read_json(path, {"classes": []})
        for cls in data.get("classes", []):
            lesson = int(cls.get("l") or 0)
            for text in cls.get("v", []):
                add_need(needs, text, kind="target:vocabulario", source_ref=f"{label}:class:{lesson}", lesson_refs=[lesson], priority=80)
            for text in cls.get("g", []):
                add_need(needs, text, kind="target:patrón", source_ref=f"{label}:class:{lesson}", lesson_refs=[lesson], priority=70)

    notes = read_json(notes_path, {"notes": []})
    for note in notes.get("notes", []):
        lesson_refs = [int(x) for x in note.get("lessons", []) if str(x).isdigit()]
        if include_examples:
            for example in note.get("examples", []):
                add_need(needs, example, kind="example", source_ref=f"learning-notes:{note.get('id', 'note')}", lesson_refs=lesson_refs, priority=60)

    exercises = read_json(exercises_path, [])
    if include_examples:
        for exercise in exercises:
            text = str(exercise.get("tts_text") or "").strip()
            if not text:
                continue
            exercise_type = str(exercise.get("type") or "")
            priority = 66 if exercise_type in {"listen-choice", "listen_choice", "audio_mcq", "audio-choice"} else 58
            add_need(
                needs,
                text,
                kind=f"exercise:{exercise_type or 'audio'}",
                source_ref=f"exercise:{exercise.get('id', 'unknown')}",
                lesson_refs=[int(exercise.get("lesson") or 0)] if str(exercise.get("lesson") or "").isdigit() else [],
                priority=priority,
            )

    return sorted(needs.values(), key=lambda item: (-item.priority, min(item.lesson_refs or [999]), item.normalized_text))


def find_audio_for_text(audio_dir: Path, text: str, preferred_ext: str) -> Path | None:
    preferred = audio_dir / filename_for(text, preferred_ext)
    if preferred.exists():
        return preferred
    stem = slugify(text)
    for ext in AUDIO_EXTS:
        candidate = audio_dir / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    return None


def build_index(repo_root: Path, audio_dir: Path, needs: list[AudioNeed], preferred_ext: str, voice: str) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    for need in needs:
        audio_path = find_audio_for_text(audio_dir, need.text, preferred_ext)
        if not audio_path:
            continue
        mime = AUDIO_EXTS.get(audio_path.suffix.lower(), "application/octet-stream")
        entries.append({
            "id": need.id,
            "text": need.text,
            "normalized_text": need.normalized_text,
            "kind": need.kind,
            "audio_path": relpath(audio_path, repo_root),
            "mime": mime,
            "duration_ms": audio_duration_ms(audio_path),
            "voice": voice,
            "source": "generated_static",
            "source_refs": sorted(set(need.source_refs)),
            "lesson_refs": sorted(set(need.lesson_refs)),
            "preload": need.priority >= 90,
        })
    return {
        "schema_version": 2,
        "policy": "static_audio_learning_materials_only_no_private_data",
        "language": "ru",
        "mime_default": AUDIO_EXTS.get(preferred_ext if preferred_ext.startswith('.') else f'.{preferred_ext}', "audio/mpeg"),
        "source_database": relpath(DEFAULT_DB, repo_root) if DEFAULT_DB.exists() else "content/paruski-db.json",
        "storage_strategy": "static files referenced from this index; do not embed large base64 audio in JavaScript",
        "entries": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Paruski static-audio worklist and index from content/paruski-db.json")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="Central course database path")
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR, help="Directory containing generated audio files")
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX, help="Output audio index JSON")
    parser.add_argument("--worklist", type=Path, default=DEFAULT_WORKLIST, help="Output synthesis worklist JSON")
    parser.add_argument("--ext", default="mp3", choices=["mp3", "wav", "ogg", "m4a"], help="Preferred audio extension for suggested filenames")
    parser.add_argument("--voice", default="local-generated", help="Voice label to store in audio-index.json")
    parser.add_argument("--no-examples", action="store_true", help="Only include targets/cards, not example sentences")
    parser.add_argument("--write", action="store_true", help="Write JSON files. Without this, only print a summary.")
    args = parser.parse_args()

    repo_root = REPO_ROOT
    db_path = resolve_repo_path(repo_root, str(args.db))
    audio_dir = resolve_repo_path(repo_root, str(args.audio_dir))
    index_path = resolve_repo_path(repo_root, str(args.index))
    worklist_path = resolve_repo_path(repo_root, str(args.worklist))
    preferred_ext = "." + args.ext.lstrip(".")

    needs = collect_needs(repo_root, db_path, include_examples=not args.no_examples)
    worklist = {
        "schema_version": 1,
        "source_database": relpath(db_path, repo_root),
        "language": "ru",
        "audio_dir": relpath(audio_dir, repo_root),
        "preferred_ext": preferred_ext,
        "total": len(needs),
        "items": [need.as_json(repo_root, audio_dir, preferred_ext) for need in needs],
    }
    index = build_index(repo_root, audio_dir, needs, preferred_ext, args.voice)

    missing = len(needs) - len(index["entries"])
    print(f"Audio needs: {len(needs)}")
    print(f"Existing audio files indexed: {len(index['entries'])}")
    print(f"Missing audio files: {missing}")
    print(f"Worklist: {relpath(worklist_path, repo_root)}")
    print(f"Index: {relpath(index_path, repo_root)}")

    if args.write:
        write_json(worklist_path, worklist)
        write_json(index_path, index)
        print("Wrote worklist and index.")
    else:
        print("Dry run only. Add --write to update JSON files.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
