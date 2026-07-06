#!/usr/bin/env python3
"""Generate Paruski static MP3 audio files with Coqui XTTS-v2.

This script runs outside the browser app. It reads content/audio-worklist.json,
generates one compressed MP3 per suggested_path under content/audio/ru, and then
refreshes content/audio-index.json through scripts/generate_audio_manifest.py.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKLIST = REPO_ROOT / "content" / "audio-worklist.json"
DEFAULT_MANIFEST_SCRIPT = REPO_ROOT / "scripts" / "generate_audio_manifest.py"
CYRILLIC_RE = re.compile(r"[а-яё]", re.IGNORECASE)
LATIN_RE = re.compile(r"[a-záéíóúüñ]", re.IGNORECASE)


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


def speech_text(text: str) -> str:
    value = str(text or "").strip()
    if not CYRILLIC_RE.search(value) or LATIN_RE.search(value):
        return ""
    value = value.replace("→", " ... ")
    value = value.replace("/", " ... ")
    value = value.replace("+", " ")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def ffmpeg_filter(args: argparse.Namespace) -> str:
    filters = []
    if args.tempo and abs(args.tempo - 1.0) > 0.001:
        filters.append(f"atempo={args.tempo}")
    if args.start_silence_ms:
        filters.append(f"adelay={args.start_silence_ms}:all=1")
    if args.end_silence_ms:
        filters.append(f"apad=pad_dur={args.end_silence_ms / 1000:.3f}")
    if args.loudness:
        filters.append(f"loudnorm=I={args.loudness}:TP={args.true_peak}:LRA={args.lra}")
    return ",".join(filters)


def run_checked(command: list[str]) -> None:
    subprocess.run(command, check=True)


def postprocess_audio(wav_path: Path, output_path: Path, args: argparse.Namespace) -> None:
    command = [
        args.ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-i", str(wav_path),
        "-ac", "1",
        "-ar", str(args.sample_rate),
    ]
    audio_filter = ffmpeg_filter(args)
    if audio_filter:
        command.extend(["-af", audio_filter])
    command.extend([
        "-codec:a", "libmp3lame",
        "-b:a", args.bitrate,
        str(output_path),
    ])
    run_checked(command)


def load_tts(args: argparse.Namespace):
    if args.tts_home:
        os.environ["TTS_HOME"] = str(resolve(args.tts_home))
    if args.hf_home:
        os.environ["HF_HOME"] = str(resolve(args.hf_home))
    if args.xdg_data_home:
        os.environ["XDG_DATA_HOME"] = str(resolve(args.xdg_data_home))

    import torch
    from TTS.api import TTS

    tts = TTS(model_name=args.model_name, progress_bar=args.progress_bar)
    if args.device == "cuda" or (args.device == "auto" and torch.cuda.is_available()):
        tts.to("cuda")
        return tts, "cuda"
    return tts, "cpu"


def generate_item(tts: Any, item: dict[str, Any], args: argparse.Namespace) -> Path:
    output_path = resolve(item["suggested_path"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    text = speech_text(item["text"])
    if not text:
        raise ValueError(f"Empty TTS text for {item.get('id')}")

    with tempfile.TemporaryDirectory(prefix="paruski-xtts-") as tmp:
        wav_path = Path(tmp) / "speech.wav"
        tts.tts_to_file(
            text=text,
            file_path=str(wav_path),
            speaker_wav=str(args.speaker_wav),
            language=args.language,
            split_sentences=args.split_sentences,
        )
        partial_path = output_path.with_name(output_path.name + ".partial.mp3")
        try:
            postprocess_audio(wav_path, partial_path, args)
            partial_path.replace(output_path)
        except Exception:
            if partial_path.exists():
                partial_path.unlink()
            raise

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
    parser = argparse.ArgumentParser(description="Generate static MP3 audio for Paruski with Coqui XTTS-v2")
    parser.add_argument("--worklist", type=Path, default=DEFAULT_WORKLIST)
    parser.add_argument("--model-name", default="tts_models/multilingual/multi-dataset/xtts_v2")
    parser.add_argument("--speaker-wav", required=True, type=Path, help="Reference speaker WAV file")
    parser.add_argument("--language", default="ru")
    parser.add_argument("--voice", default="xtts-v2-anastasiia-librivox-cpml-noncommercial")
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    parser.add_argument("--tts-home", default="")
    parser.add_argument("--hf-home", default="")
    parser.add_argument("--xdg-data-home", default="")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--limit", type=int, default=0, help="Maximum files to generate in this run; 0 means no limit")
    parser.add_argument("--min-priority", type=int, default=0)
    parser.add_argument("--max-lesson", type=int, default=0)
    parser.add_argument("--kind", default="", help="Optional substring filter for item kind")
    parser.add_argument("--bitrate", default="96k")
    parser.add_argument("--sample-rate", type=int, default=24000)
    parser.add_argument("--tempo", type=float, default=0.96)
    parser.add_argument("--loudness", default="-19")
    parser.add_argument("--true-peak", default="-2")
    parser.add_argument("--lra", default="9")
    parser.add_argument("--start-silence-ms", type=int, default=60)
    parser.add_argument("--end-silence-ms", type=int, default=350)
    parser.add_argument("--force", action="store_true", help="Regenerate existing files")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--progress-bar", action="store_true")
    parser.add_argument("--split-sentences", action="store_true")
    args = parser.parse_args()

    args.worklist = resolve(args.worklist)
    args.speaker_wav = resolve(args.speaker_wav)
    if not args.speaker_wav.exists():
        raise FileNotFoundError(args.speaker_wav)

    payload = read_json(args.worklist)
    items = select_items(payload.get("items", []), args)
    print(f"Selected audio items: {len(items)}")
    print(f"Reference speaker: {args.speaker_wav}")
    print(f"Postprocess: tempo={args.tempo}, lead={args.start_silence_ms}ms, tail={args.end_silence_ms}ms, loudness={args.loudness} LUFS")

    if args.dry_run:
        for item in items[:30]:
            print(f"{item['suggested_path']} :: {item['text']} => {speech_text(item['text'])}")
        return 0

    tts, device = load_tts(args)
    print(f"Loaded {args.model_name} on {device}")

    started = time.time()
    failures: list[tuple[str, str]] = []
    for index, item in enumerate(items, start=1):
        try:
            path = generate_item(tts, item, args)
            elapsed = time.time() - started
            print(f"[{index}/{len(items)}] {path.relative_to(REPO_ROOT)} :: {item['text']} ({elapsed:.1f}s)")
        except Exception as exc:
            failures.append((item.get("id", item.get("text", "unknown")), str(exc)))
            print(f"[{index}/{len(items)}] FAILED {item.get('id')} :: {exc}", file=sys.stderr)

    if failures:
        print("Audio generation failures:", file=sys.stderr)
        for item_id, error in failures:
            print(f"- {item_id}: {error}", file=sys.stderr)
        return 1

    refresh_index(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
