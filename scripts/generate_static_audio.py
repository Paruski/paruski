#!/usr/bin/env python3
"""Generate static MP3 audio files from content/audio-worklist.json.

This script is intentionally outside the browser app. It runs locally, writes
compressed audio files under content/audio/ru, and then refreshes
content/audio-index.json so GitHub Pages can serve the files as static assets.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKLIST = REPO_ROOT / "content" / "audio-worklist.json"
DEFAULT_MANIFEST_SCRIPT = REPO_ROOT / "scripts" / "generate_audio_manifest.py"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve(path: str | Path) -> Path:
    value = Path(path)
    return value if value.is_absolute() else REPO_ROOT / value


def item_lesson_min(item: dict[str, Any]) -> int:
    lessons = [int(value) for value in item.get("lesson_refs", []) if str(value).isdigit()]
    return min(lessons) if lessons else 999


def select_items(items: list[dict[str, Any]], args: argparse.Namespace) -> list[dict[str, Any]]:
    selected = []
    for item in items:
        output_path = resolve(item["suggested_path"])
        if output_path.exists() and not args.force:
            continue
        if int(item.get("priority", 0)) < args.min_priority:
            continue
        if args.max_lesson and item_lesson_min(item) > args.max_lesson:
            continue
        if args.kind and args.kind not in str(item.get("kind", "")):
            continue
        selected.append(item)
    selected.sort(key=lambda item: (-int(item.get("priority", 0)), item_lesson_min(item), item.get("normalized_text", "")))
    return selected[:args.limit] if args.limit else selected


def run_checked(command: list[str], *, input_text: str | None = None) -> None:
    subprocess.run(command, input=input_text, text=input_text is not None, check=True)


def generate_item(item: dict[str, Any], args: argparse.Namespace) -> Path:
    output_path = resolve(item["suggested_path"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    text = str(item["text"]).strip()

    with tempfile.TemporaryDirectory(prefix="paruski-audio-") as tmp:
        tmp_dir = Path(tmp)
        input_path = tmp_dir / "input.txt"
        wav_path = tmp_dir / "speech.wav"
        input_path.write_text(text + "\n", encoding="utf-8")

        run_checked([
            args.piper,
            "-m", str(args.model),
            "-c", str(args.config),
            "-i", str(input_path),
            "-f", str(wav_path),
            "--sentence-silence", str(args.sentence_silence),
            "--length-scale", str(args.length_scale),
        ])

        run_checked([
            args.ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel", "error",
            "-i", str(wav_path),
            "-ac", "1",
            "-ar", "24000",
            "-af", f"loudnorm=I={args.loudness}:TP=-1.5:LRA=11",
            "-codec:a", "libmp3lame",
            "-b:a", args.bitrate,
            str(output_path),
        ])

    return output_path


def refresh_index(args: argparse.Namespace) -> None:
    run_checked([
        sys.executable,
        str(DEFAULT_MANIFEST_SCRIPT),
        "--write",
        "--ext", "mp3",
        "--voice", args.voice,
    ])


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate static MP3 audio for Paruski with a local Piper voice")
    parser.add_argument("--worklist", type=Path, default=DEFAULT_WORKLIST)
    parser.add_argument("--piper", default="piper", help="Piper executable")
    parser.add_argument("--model", required=True, type=Path, help="Piper .onnx model")
    parser.add_argument("--config", required=True, type=Path, help="Piper .onnx.json config")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg executable")
    parser.add_argument("--voice", default="piper-ru_RU-irina-medium", help="Voice label stored in audio-index.json")
    parser.add_argument("--limit", type=int, default=0, help="Maximum files to generate in this run; 0 means no limit")
    parser.add_argument("--min-priority", type=int, default=0)
    parser.add_argument("--max-lesson", type=int, default=0)
    parser.add_argument("--kind", default="", help="Optional substring filter for item kind")
    parser.add_argument("--bitrate", default="64k")
    parser.add_argument("--loudness", default="-18")
    parser.add_argument("--sentence-silence", type=float, default=0.2)
    parser.add_argument("--length-scale", type=float, default=1.0)
    parser.add_argument("--force", action="store_true", help="Regenerate existing files")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    args.worklist = resolve(args.worklist)
    args.model = resolve(args.model)
    args.config = resolve(args.config)

    payload = read_json(args.worklist)
    items = select_items(payload.get("items", []), args)
    print(f"Selected audio items: {len(items)}")

    if args.dry_run:
        for item in items[:20]:
            print(f"{item['suggested_path']} :: {item['text']}")
        return 0

    for index, item in enumerate(items, start=1):
        path = generate_item(item, args)
        print(f"[{index}/{len(items)}] {path.relative_to(REPO_ROOT)}")

    refresh_index(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
