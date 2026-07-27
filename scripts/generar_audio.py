#!/usr/bin/env python3
"""Genera las locuciones que le faltan al curso (unidades 001–011).

Uso típico en una máquina con GPU:

    python3 scripts/generar_audio.py --lista                  # qué falta y cuánto
    python3 scripts/generar_audio.py --engine silero          # rápido, sin voz de referencia
    python3 scripts/generar_audio.py --engine xtts --speaker-wav voz.wav
    python3 scripts/generar_audio.py --engine f5 --speaker-wav voz.wav --ref-text "…"

Motores
-------
silero  v4_ru. Ligero (~50 MB), corre de sobra en una RTX 3060 y, sobre todo,
        admite marcar el acento con «+» delante de la vocal tónica: para un curso
        de idiomas eso vale más que medio punto de naturalidad, porque garantiza
        que la palabra se oye con el acento que enseña la ficha.
xtts    Coqui XTTS-v2. Es el motor con el que se grabó el banco actual
        (voz anastasiia-librivox), así que es la opción si quieres que las frases
        nuevas suenen igual que las 1253 ya existentes. Necesita 6 s de audio de
        referencia. No controla el acento léxico.
f5      F5-TTS. Mejor prosodia en frases largas; requiere un checkpoint con ruso.
        Igual que XTTS, no controla el acento.

Recomendación: `silero` para palabras sueltas del vocabulario (acento exacto) y
`xtts` para frases y microdiálogos (continuidad con el banco). El script permite
lanzar cada pasada por separado con --solo.

Salida: MP3 mono en content/audio/curso/ e índice en curso/audio.json, que la web
lee además del banco antiguo. No se toca content/audio-index.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURSO = ROOT / "curso"
OUT_DIR = ROOT / "content" / "audio" / "curso"
INDEX = CURSO / "audio.json"
PENDING = CURSO / "audio-pendiente.json"
OLD_INDEX = ROOT / "content" / "audio-index.json"

CYR = re.compile(r"[Ѐ-ӿ]")
LATIN = re.compile(r"[A-Za-z]")

SLUG = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}


def strip_stress(text: str) -> str:
    text = unicodedata.normalize("NFD", text or "")
    return unicodedata.normalize("NFC", text.replace("́", "").replace("̀", ""))


def key_of(text: str) -> str:
    return strip_stress(text).strip().lower()


def slugify(text: str) -> str:
    plain = strip_stress(text).lower()
    out = "".join(SLUG.get(ch, ch if ch.isalnum() else "-") for ch in plain)
    out = re.sub(r"-+", "-", out).strip("-")
    return out[:48] or "audio"


def filename(text: str) -> str:
    digest = hashlib.sha256(strip_stress(text).encode("utf-8")).hexdigest()[:8]
    return f"{slugify(text)}-{digest}.mp3"


# ------------------------------------------------------------------ inventario


def unit_files() -> list[Path]:
    return sorted((CURSO / "unidades").glob("unidad-*.json"))


def is_russian(text: str) -> bool:
    """Sólo se locuta ruso puro: nada con letras latinas ni con huecos."""
    if not text or not CYR.search(text):
        return False
    if LATIN.search(text):
        return False
    if "_" in text or "…" in text or "→" in text:
        return False
    return True


def collect_targets() -> list[dict]:
    """Todo el ruso que la web puede llegar a reproducir, con su procedencia."""
    seen: dict[str, dict] = {}

    def add(text: str, kind: str, unit: int, stressed: str | None = None):
        text = (text or "").strip()
        if not is_russian(text):
            return
        key = key_of(text)
        entry = seen.setdefault(key, {
            "text": strip_stress(text), "stressed": None, "kinds": set(), "units": set(),
        })
        entry["kinds"].add(kind)
        entry["units"].add(unit)
        if stressed and "́" in stressed and not entry["stressed"]:
            entry["stressed"] = stressed

    for path in unit_files():
        data = json.loads(path.read_text(encoding="utf-8"))
        n = data["unit"]["unit"]
        for section in data["unit"].get("sections", []):
            for example in section.get("examples", []):
                add(example.get("model"), "leccion:modelo", n, example.get("model"))
            for pair in section.get("items", []):
                add(pair.get("right"), "leccion:correccion", n, pair.get("right"))
        for v in data.get("vocabulary", []):
            add(v.get("lemma"), "vocabulario", n, v.get("stressed"))
            add(v.get("exampleRu"), "vocabulario:ejemplo", n)
        for item in data.get("items", []):
            add(item.get("input"), "ejercicio:enunciado", n)
            add(item.get("reference"), "ejercicio:referencia", n)
            for step in item.get("steps", []):
                if step.get("language") == "es":
                    continue
                for accepted in step.get("accepted", []):
                    add(accepted, "ejercicio:respuesta", n)
                for option in step.get("options", []) or []:
                    add(option, "ejercicio:opcion", n)

    out = []
    for key, entry in sorted(seen.items()):
        out.append({
            "key": key,
            "text": entry["text"],
            "stressed": entry["stressed"],
            "kinds": sorted(entry["kinds"]),
            "units": sorted(entry["units"]),
            "words": len(entry["text"].split()),
        })
    return out


def existing_bank() -> dict[str, str]:
    bank: dict[str, str] = {}
    if OLD_INDEX.exists():
        data = json.loads(OLD_INDEX.read_text(encoding="utf-8"))
        for entry in data.get("entries", []):
            path = ROOT / entry["audio_path"]
            if path.exists():
                bank[key_of(entry.get("text", ""))] = entry["audio_path"]
    if INDEX.exists():
        data = json.loads(INDEX.read_text(encoding="utf-8"))
        for entry in data.get("entries", []):
            if (ROOT / entry["path"]).exists():
                bank[key_of(entry["text"])] = entry["path"]
    return bank


# --------------------------------------------------------------------- motores


def silero_stress(text: str, stressed: str | None) -> str:
    """Traduce «соба́ка» al formato de acento de Silero: «соб+ака»."""
    if not stressed or "́" not in stressed:
        return text
    out = ""
    for ch in unicodedata.normalize("NFC", stressed):
        if ch == "́":
            continue
        out += ch
    marked = ""
    chars = list(unicodedata.normalize("NFC", stressed))
    for i, ch in enumerate(chars):
        if ch == "́":
            continue
        if i + 1 < len(chars) and chars[i + 1] == "́":
            marked += "+"
        marked += ch
    return marked if marked else out


class Silero:
    name = "silero-v4-ru"

    def __init__(self, args):
        import torch
        self.torch = torch
        device = torch.device(args.device if args.device != "auto"
                              else ("cuda" if torch.cuda.is_available() else "cpu"))
        self.model, _ = torch.hub.load(
            repo_or_dir="snakers4/silero-models", model="silero_tts",
            language="ru", speaker="v4_ru", trust_repo=True)
        self.model.to(device)
        self.speaker = args.voice or "kseniya"
        self.rate = args.sample_rate

    def synth(self, text: str, stressed: str | None, wav_path: Path):
        payload = silero_stress(text, stressed)
        self.model.save_wav(text=payload, speaker=self.speaker,
                            sample_rate=48000, audio_path=str(wav_path))


class Xtts:
    name = "xtts-v2"

    def __init__(self, args):
        import torch
        from TTS.api import TTS
        if not args.speaker_wav:
            sys.exit("XTTS necesita --speaker-wav con 6 s de la voz de referencia.")
        self.speaker_wav = args.speaker_wav
        self.tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2",
                       progress_bar=False)
        if args.device == "cuda" or (args.device == "auto" and torch.cuda.is_available()):
            self.tts.to("cuda")

    def synth(self, text: str, stressed: str | None, wav_path: Path):
        self.tts.tts_to_file(text=text, speaker_wav=self.speaker_wav,
                             language="ru", file_path=str(wav_path))


class F5:
    name = "f5-tts"

    def __init__(self, args):
        from f5_tts.api import F5TTS
        if not args.speaker_wav:
            sys.exit("F5-TTS necesita --speaker-wav (y conviene --ref-text).")
        self.api = F5TTS(model=args.f5_model, device=None if args.device == "auto" else args.device)
        self.ref = args.speaker_wav
        self.ref_text = args.ref_text or ""

    def synth(self, text: str, stressed: str | None, wav_path: Path):
        self.api.infer(ref_file=self.ref, ref_text=self.ref_text, gen_text=text,
                       file_wave=str(wav_path))


ENGINES = {"silero": Silero, "xtts": Xtts, "f5": F5}


def to_mp3(wav_path: Path, mp3_path: Path, args) -> None:
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    filters = [f"loudnorm=I={args.loudness}:TP=-1.5:LRA=11"]
    if args.pad_ms:
        filters.append(f"adelay={args.pad_ms}:all=1")
        filters.append(f"apad=pad_dur={args.pad_ms / 1000:.3f}")
    subprocess.run([
        args.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
        "-ac", "1", "-ar", str(args.sample_rate), "-af", ",".join(filters),
        "-codec:a", "libmp3lame", "-b:a", args.bitrate, str(mp3_path),
    ], check=True)


# ------------------------------------------------------------------------ main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", choices=sorted(ENGINES), default="silero")
    ap.add_argument("--lista", action="store_true", help="sólo inventariar lo que falta")
    ap.add_argument("--solo", choices=["palabras", "frases"], help="limitar la pasada")
    ap.add_argument("--limite", type=int, default=0)
    ap.add_argument("--unidad", type=int, default=0, help="generar sólo una unidad")
    ap.add_argument("--rehacer", action="store_true", help="regenerar aunque ya exista el archivo")
    ap.add_argument("--voice", default="", help="voz (silero: aidar, baya, kseniya, xenia, eugene)")
    ap.add_argument("--speaker-wav", default="", help="audio de referencia (xtts, f5)")
    ap.add_argument("--ref-text", default="", help="transcripción del audio de referencia (f5)")
    ap.add_argument("--f5-model", default="F5TTS_v1_Base")
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--sample-rate", type=int, default=24000)
    ap.add_argument("--bitrate", default="64k")
    ap.add_argument("--loudness", default="-16")
    ap.add_argument("--pad-ms", type=int, default=120)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    args = ap.parse_args()

    targets = collect_targets()
    bank = existing_bank()
    missing = [t for t in targets if t["key"] not in bank]
    if args.unidad:
        missing = [t for t in missing if args.unidad in t["units"]]
    if args.solo == "palabras":
        missing = [t for t in missing if t["words"] == 1]
    elif args.solo == "frases":
        missing = [t for t in missing if t["words"] > 1]

    PENDING.write_text(json.dumps({
        "total": len(targets),
        "conAudio": len(targets) - len([t for t in targets if t["key"] not in bank]),
        "pendientes": len(missing),
        "items": missing,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"objetivos de locución: {len(targets)}")
    print(f"ya grabados en el banco: {len(targets) - len([t for t in targets if t['key'] not in bank])}")
    print(f"pendientes en esta pasada: {len(missing)}")
    print(f"  palabras sueltas: {len([t for t in missing if t['words'] == 1])}")
    print(f"  frases: {len([t for t in missing if t['words'] > 1])}")
    print(f"lista escrita en {PENDING.relative_to(ROOT)}")
    if args.lista:
        return 0
    if not missing:
        return 0

    engine = ENGINES[args.engine](args)
    entries = []
    if INDEX.exists():
        entries = json.loads(INDEX.read_text(encoding="utf-8")).get("entries", [])
    known = {e["text"]: e for e in entries}

    todo = missing[:args.limite] if args.limite else missing
    for i, target in enumerate(todo, 1):
        mp3 = OUT_DIR / filename(target["text"])
        rel = str(mp3.relative_to(ROOT))
        if mp3.exists() and not args.rehacer:
            known[target["text"]] = {"text": target["text"], "path": rel, "engine": engine.name}
            continue
        with tempfile.TemporaryDirectory(prefix="paruski-tts-") as tmp:
            wav = Path(tmp) / "out.wav"
            try:
                engine.synth(target["text"], target["stressed"], wav)
                to_mp3(wav, mp3, args)
            except Exception as error:  # noqa: BLE001
                print(f"  [!] {target['text']}: {error}")
                continue
        known[target["text"]] = {
            "text": target["text"], "path": rel, "engine": engine.name,
            "voice": args.voice or None, "units": target["units"],
        }
        print(f"  [{i}/{len(todo)}] {target['text']} → {rel}")

    INDEX.write_text(json.dumps({
        "version": 1,
        "note": "Locuciones generadas para el curso; complementan content/audio-index.json.",
        "entries": sorted(known.values(), key=lambda e: e["text"]),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"índice actualizado: {INDEX.relative_to(ROOT)} ({len(known)} entradas)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
