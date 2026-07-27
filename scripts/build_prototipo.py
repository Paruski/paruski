#!/usr/bin/env python3
"""Construye el contenido de ejecución del prototipo Paruski (U001–U011).

Fuentes:
  - CLAUDE/paruski_b1_materials_l001_l010_v1_9_3_EDITADO.zip  (materiales corregidos L001–L010)
  - CLAUDE/leccion_011_acusativo_inanimado.json               (unidad 011)
  - curso/fuentes/lecciones-001-010.json                      (texto de lección redactado para el prototipo)

Salida: curso/*.json  (contenido estático que consume la web)

Principio rector: todo ítem publicado debe ser corregible por la aplicación de forma
determinista. Los ejercicios con rúbrica abierta se reconvierten en tareas de varios
pasos (producción escrita + decisión conceptual) sin rebajar la exigencia cognitiva.
Lo que no se puede corregir, no se publica.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZIP = ROOT / "CLAUDE" / "paruski_b1_materials_l001_l010_v1_9_3_EDITADO.zip"
L011 = ROOT / "CLAUDE" / "leccion_011_acusativo_inanimado.json"
AUTHORED = ROOT / "curso" / "fuentes" / "lecciones-001-010.json"
OUT = ROOT / "curso"
AUDIO_INDEX = ROOT / "content" / "audio-index.json"

CYR = re.compile(r"[Ѐ-ӿ]")
ZIP_PREFIX = "paruski_b1_materials_l001_l010_v1_9_3_editado/content/"

# ---------------------------------------------------------------- utilidades


def has_cyr(text: str | None) -> bool:
    return bool(text) and bool(CYR.search(text))


def strip_stress(text: str) -> str:
    """Elimina el acento editorial (U+0301) y normaliza."""
    text = unicodedata.normalize("NFD", text)
    text = text.replace("́", "").replace("̀", "")
    return unicodedata.normalize("NFC", text)


def norm_answer(text: str) -> str:
    """Normalización de respuesta para comparación determinista.

    - sin acento editorial, sin espacios redundantes
    - ё -> е (se acepta la escritura sin diéresis, habitual en ruso real)
    - minúsculas
    - comillas y guiones unificados; punto final opcional
    """
    text = strip_stress(text or "").strip().lower()
    text = text.replace("ё", "е")
    text = re.sub(r"[«»\"“”„']", "", text)
    text = text.replace("—", "-").replace("–", "-")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*([,.;:!?])", r"\1", text)
    text = re.sub(r"[.]+$", "", text)
    return text.strip()


SPANISH_STOP = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a", "en",
    "y", "e", "o", "u", "que", "es", "son", "esta", "este", "esto", "ese", "esa", "eso",
    "se", "su", "sus", "lo", "le", "por", "para", "con", "sin", "no", "si", "ya", "muy",
    "hay", "ser", "esta", "aqui", "alli", "pero", "como", "cual", "donde", "quien",
}


def content_tokens(text: str) -> list[str]:
    """Palabras de contenido de una respuesta en español, para la corrección tolerante."""
    plain = strip_stress(text or "").lower()
    plain = re.sub(r"[^0-9a-zñáéíóúü\s]", " ", plain)
    out = []
    for word in plain.split():
        if word in SPANISH_STOP or len(word) < 3:
            continue
        if word not in out:
            out.append(word)
    return out


def sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [p.strip() for p in parts if p.strip()]


def as_statement(claim: str) -> str:
    """Convierte «que X sea Y» (forbiddenClaims) en una afirmación legible."""
    claim = claim.strip()
    claim = re.sub(r"^que\s+", "", claim)
    claim = re.sub(r"\bsea\b", "es", claim)
    claim = re.sub(r"\bconstituya\b", "constituye", claim)
    claim = re.sub(r"\bpueda\b", "puede", claim)
    claim = re.sub(r"\btenga\b", "tiene", claim)
    claim = re.sub(r"\bse use\b", "se usa", claim)
    return claim[0].upper() + claim[1:] if claim else claim


def clean_concept(concept: str) -> str:
    concept = concept.strip().rstrip(".")
    return concept[0].upper() + concept[1:] if concept else concept


def load_zip_json(name: str):
    with zipfile.ZipFile(ZIP) as zf:
        return json.loads(zf.read(ZIP_PREFIX + name).decode("utf-8"))


# ------------------------------------------------------- conversión de ítems

DIMENSION_BY_MODE = {
    "choice": "reconocimiento_escrito",
    "written": "recuperacion_escrita",
    "concept": "comprension_explicita",
    "listening": "reconocimiento_auditivo",
    "transfer": "transferencia_contextual",
}

TYPE_LABEL = {
    "contextual_choice": "Elección en contexto",
    "cloze": "Hueco",
    "transformation": "Transformación",
    "translation_ru_es": "Traducción ru → es",
    "translation_es_ru": "Traducción es → ru",
    "production": "Producción",
    "reading_comprehension": "Comprensión lectora",
    "diagnostic_repair": "Diagnóstico y reparación",
    "semantic_contrast": "Contraste semántico",
    "inductive_generalization": "Inducción de regla",
    "backtranslation_critique": "Crítica de retrotraducción",
    "constrained_transfer": "Transferencia guiada",
    "information_gap_reconstruction": "Vacío de información",
    "exam": "Examen",
}


OPEN_TYPES = {
    "diagnostic_repair", "semantic_contrast", "inductive_generalization",
    "backtranslation_critique", "constrained_transfer", "information_gap_reconstruction",
}


def normalize_item(e: dict) -> dict:
    """Homogeneiza los ítems de la unidad 011 con el esquema del paquete L001–L010."""
    e = dict(e)
    se = dict(e.get("structuredExpected") or {})

    if e.get("referenceAnswer") and not se.get("referenceAnswer"):
        se["referenceAnswer"] = e["referenceAnswer"]
    # el referenceAnswer de la 011 mezcla forma rusa y explicación: separa la forma
    ref = se.get("referenceAnswer")
    if ref and has_cyr(ref):
        ru_parts = [s for s in sentences(ref) if has_cyr(s)]
        if ru_parts:
            se.setdefault("referenceRussian", " ".join(ru_parts))

    if e["type"] == "constrained_transfer" and not se.get("referenceResponse"):
        if se.get("referenceRussian"):
            se["referenceResponse"] = se["referenceRussian"]
    if e["type"] == "information_gap_reconstruction" and not se.get("referenceExchange"):
        if se.get("referenceRussian"):
            se["referenceExchange"] = se["referenceRussian"]
    if e["type"] == "inductive_generalization" and not se.get("novelApplication"):
        if se.get("referenceRussian"):
            se["novelApplication"] = se["referenceRussian"]
    if e["type"] == "diagnostic_repair" and not se.get("originalOrDefectiveForm"):
        if e.get("input"):
            se["originalOrDefectiveForm"] = e["input"]
    e["structuredExpected"] = se

    if not e.get("responseMode"):
        if e.get("options") or e.get("distractors"):
            e["responseMode"] = "exact"
        elif e.get("expectedAnswer"):
            e["responseMode"] = "exact" if e["type"] != "exam" else "structured_response"
        elif e["type"] in OPEN_TYPES:
            e["responseMode"] = "open_rubric"
        elif se.get("referenceRussian"):
            e["responseMode"] = "exact"
            e["expectedAnswer"] = se["referenceRussian"]
    return e


class Builder:
    def __init__(self) -> None:
        self.skills: dict[str, dict] = {}
        self.kernels: dict[str, dict] = {}
        self.concept_pool: list[tuple[str, str]] = []  # (skillId, concepto)
        self.dropped: Counter = Counter()
        self.drop_log: list[dict] = []

    # -- pasos ------------------------------------------------------------

    def step_choice(self, sid, prompt, options, correct, explain=None, dimension="reconocimiento_escrito"):
        opts = []
        seen = set()
        for opt in options:
            key = norm_answer(opt)
            if not opt or key in seen:
                continue
            seen.add(key)
            opts.append(opt)
        if norm_answer(correct) not in {norm_answer(o) for o in opts}:
            opts.insert(0, correct)
        if len(opts) < 2:
            return None
        return {
            "id": sid,
            "kind": "choice",
            "prompt": prompt,
            "options": opts,
            "answer": correct,
            "explain": explain or {},
            "dimension": dimension,
        }

    def step_written(self, sid, prompt, accepted, *, language="ru", dimension="recuperacion_escrita",
                     placeholder=None, hint=None, required_tokens=None, mode="exact"):
        accepted = [a for a in accepted if a and a.strip()]
        if not accepted:
            return None
        return {
            "id": sid,
            "kind": "written",
            "prompt": prompt,
            "language": language,
            "accepted": accepted,
            "acceptedNorm": sorted({norm_answer(a) for a in accepted}),
            "requiredTokens": required_tokens or [],
            "mode": mode,
            "placeholder": placeholder,
            "hint": hint,
            "dimension": dimension,
        }

    def step_multiwritten(self, sid, prompt, parts, dimension="transferencia_contextual"):
        """Varias frases obligatorias, en cualquier orden, en un solo campo."""
        parts = [p for p in parts if has_cyr(p)]
        if not parts:
            return None
        return {
            "id": sid,
            "kind": "written",
            "prompt": prompt,
            "language": "ru",
            "accepted": [" ".join(parts)],
            "acceptedNorm": [norm_answer(" ".join(parts))],
            "requiredFragments": [norm_answer(p) for p in parts],
            "referenceParts": parts,
            "mode": "fragments",
            "dimension": dimension,
        }

    # -- distractores conceptuales ---------------------------------------

    def concept_options(self, item, correct_concept, count=3):
        wrong: list[str] = []
        se = item.get("structuredExpected") or {}
        for claim in se.get("forbiddenClaims", []) or []:
            wrong.append(as_statement(claim))
        if se.get("rivalRule"):
            wrong.append(clean_concept(se["rivalRule"]))
        if se.get("claimToRefute"):
            wrong.append(clean_concept(se["claimToRefute"]))

        skill = self.skills.get(item.get("skillId") or "")
        if skill:
            for conf in skill.get("commonConfusions", []) or []:
                for other in self.skills.values():
                    if other["skillId"] == skill["skillId"]:
                        continue
                    if conf in (other.get("commonConfusions") or []):
                        wrong.append(clean_concept(
                            f"Aquí lo que se pone en juego es {other['linguisticPhenomenon']}"))
        # relleno estable: conceptos de otras competencias del mismo dominio
        if len(wrong) < count and skill:
            for other_sid, concept in self.concept_pool:
                if other_sid == skill["skillId"]:
                    continue
                if other_sid in (skill.get("prerequisites") or []):
                    continue
                if concept.lower() == correct_concept.lower():
                    continue
                wrong.append(concept)
                if len(wrong) >= count + 2:
                    break

        out, seen = [], {correct_concept.lower()}
        for w in wrong:
            if not w or w.lower() in seen:
                continue
            seen.add(w.lower())
            out.append(w)
            if len(out) >= count:
                break
        return out

    # -- conversores por tipo --------------------------------------------

    def convert(self, item: dict) -> dict | None:
        kind = item["type"]
        mode = item.get("responseMode")
        se = item.get("structuredExpected") or {}
        base = {
            "id": item["id"],
            "unit": item["lessonNumber"],
            "type": kind,
            "typeLabel": TYPE_LABEL.get(kind, kind),
            "phase": item.get("phase"),
            "skillId": item.get("skillId"),
            "skillIds": sorted(set(filter(None, [item.get("skillId")] + (item.get("skillIds") or [])))),
            "scenario": item.get("semanticScenario"),
            "function": item.get("communicativeFunction"),
            "kernelId": item.get("semanticKernelId"),
            "prompt": item["prompt"],
            "input": item.get("input"),
            "steps": [],
            "reference": se.get("referenceAnswer") or item.get("expectedAnswer"),
            "notes": [clean_concept(c) for c in (se.get("requiredConcepts") or [])],
        }
        sid = item["id"]

        # --- ítems cerrados ya corregibles -------------------------------
        if mode in ("exact", "closed_variants", "semiopen", "structured_response"):
            answer = item.get("expectedAnswer") or se.get("referenceAnswer")
            if not answer:
                return self.drop(item, "sin respuesta de referencia")
            accepted = list(dict.fromkeys(
                [answer] + (item.get("acceptedAnswers") or [])
                + [p.get("canonical") for p in (item.get("answerPatterns") or []) if p.get("canonical")]))
            if item.get("distractors"):
                opts = [answer] + list(item["distractors"])
                explain = {}
                for bad, diag in (item.get("distractorDiagnostics") or {}).items():
                    explain[bad] = diag.get("whyItFails") or diag.get("meaning")
                step = self.step_choice(sid + "/a", item["prompt"], opts, answer, explain)
                if not step:
                    return self.drop(item, "opciones insuficientes")
                base["steps"].append(step)
                # segundo paso productivo: escribir la forma correcta
                if has_cyr(answer):
                    base["steps"].append(self.step_written(
                        sid + "/b", "Escríbela ahora tú, sin elegir.", accepted,
                        hint="Reproduce la forma completa."))
            elif kind == "diagnostic_repair" and se.get("requiredConcepts"):
                diag = clean_concept(se["requiredConcepts"][0])
                defective = se.get("originalOrDefectiveForm") or item.get("input")
                cstep = self.step_choice(
                    sid + "/a",
                    f"¿Qué fenómeno falla en «{defective}»?" if defective else "¿Qué fenómeno falla aquí?",
                    [diag] + self.concept_options(item, diag), diag,
                    dimension="comprension_explicita")
                if cstep:
                    base["steps"].append(cstep)
                base["steps"].append(self.step_written(
                    sid + "/b", "Escribe la intervención reparada.", accepted))
            else:
                language = "ru" if has_cyr(answer) else "es"
                tokens = [] if language == "ru" else content_tokens(answer)
                # con respuestas muy breves no hay palabras de contenido suficientes:
                # en ese caso se compara la forma completa, sin acentos ni puntuación
                grading = "exact" if language == "ru" or len(tokens) < 2 else "tokens"
                tokens = tokens if grading == "tokens" else []
                step = self.step_written(
                    sid + "/a", item["prompt"], accepted, language=language,
                    mode=grading, required_tokens=tokens,
                    dimension="recuperacion_escrita" if language == "ru" else "comprension_explicita")
                if not step:
                    return self.drop(item, "sin respuesta")
                base["steps"].append(step)
            base["steps"] = [s for s in base["steps"] if s]
            return base if base["steps"] else self.drop(item, "sin pasos")

        # --- ítems abiertos: reconversión --------------------------------
        if kind == "diagnostic_repair":
            correction = se.get("requiredCorrection") or se.get("referenceRussian") or se.get("referenceAnswer")
            if not has_cyr(correction):
                return self.drop(item, "reparación no verificable")
            defective = se.get("originalOrDefectiveForm") or item.get("input")
            concepts = [clean_concept(c) for c in se.get("requiredConcepts", [])]
            diag = concepts[0] if concepts else None
            base["prompt"] = item["prompt"]
            if diag:
                options = self.concept_options(item, diag)
                step = self.step_choice(
                    sid + "/a",
                    f"¿Qué fenómeno falla en «{defective}»?" if defective else "¿Qué fenómeno falla aquí?",
                    [diag] + options, diag, dimension="comprension_explicita")
                if step:
                    base["steps"].append(step)
            base["steps"].append(self.step_written(
                sid + "/b", "Escribe la intervención reparada, sin cambiar participantes ni intención.",
                [correction]))
            base["steps"] = [s for s in base["steps"] if s]
            return base if base["steps"] else self.drop(item, "sin pasos")

        if kind == "backtranslation_critique":
            correction = se.get("requiredCorrection") or se.get("referenceRussian") or se.get("referenceAnswer")
            if not has_cyr(correction):
                return self.drop(item, "corrección no verificable")
            concepts = [clean_concept(c) for c in se.get("requiredConcepts", [])]
            base["steps"].append(self.step_written(
                sid + "/a", "Escribe la versión rusa que sí conserva el original.", [correction]))
            if concepts:
                options = self.concept_options(item, concepts[0])
                step = self.step_choice(
                    sid + "/b", "¿Qué se perdía o deformaba en la versión candidata?",
                    [concepts[0]] + options, concepts[0], dimension="comprension_explicita")
                if step:
                    base["steps"].append(step)
            base["steps"] = [s for s in base["steps"] if s]
            return base if base["steps"] else self.drop(item, "sin pasos")

        if kind == "semantic_contrast":
            forms = se.get("formsCompared") or []
            preferred = se.get("preferredForScenario")
            if len(forms) < 2:
                forms = [m.group(1).strip() for m in
                         re.finditer(r"^[AB]:\s*(.+)$", item.get("input") or "", re.M)]
            if not preferred:
                cand = se.get("referenceAnswer") or ""
                cand = sentences(cand)[0] if cand else ""
                if has_cyr(cand):
                    preferred = cand.strip()
            if not preferred or len(forms) < 2:
                return self.drop(item, "contraste sin formas comparadas")
            if norm_answer(preferred) not in {norm_answer(f) for f in forms}:
                forms = [preferred] + forms
            other = [f for f in forms if norm_answer(f) != norm_answer(preferred)]
            step = self.step_choice(
                sid + "/a", "¿Cuál de las dos formas corresponde a esta situación?",
                [preferred] + other + ["Las dos son intercambiables aquí."], preferred)
            if not step:
                return self.drop(item, "opciones insuficientes")
            base["steps"].append(step)
            concepts = [clean_concept(c) for c in se.get("requiredConcepts", [])]
            if concepts:
                options = self.concept_options(item, concepts[0])
                cstep = self.step_choice(
                    sid + "/b", "¿Qué distingue a la forma elegida?",
                    [concepts[0]] + options, concepts[0], dimension="comprension_explicita")
                if cstep:
                    base["steps"].append(cstep)
            if has_cyr(preferred):
                base["steps"].append(self.step_written(
                    sid + "/c", "Escribe la forma adecuada para fijarla.", [preferred]))
            base["steps"] = [s for s in base["steps"] if s]
            return base

        if kind == "inductive_generalization":
            rival = se.get("rivalRule")
            novel = se.get("novelApplication")
            concepts = [clean_concept(c) for c in se.get("requiredConcepts", [])]
            rule = concepts[0] if concepts else None
            if not rule or not rival:
                return self.drop(item, "inducción sin regla contrastable")
            base["prompt"] = item["prompt"]
            step = self.step_choice(
                sid + "/a", "De las dos reglas, ¿cuál explica los datos?",
                [rule, clean_concept(rival)] + self.concept_options(item, rule, count=2),
                rule, dimension="comprension_explicita")
            if step:
                base["steps"].append(step)
            if novel:
                base["steps"].append(self.step_written(
                    sid + "/b", f"Aplica la regla al caso nuevo: «{novel}» → escribe la forma correcta.",
                    [novel] if has_cyr(novel) else [novel],
                    language="ru" if has_cyr(novel) else "es",
                    mode="exact" if has_cyr(novel) else "tokens",
                    required_tokens=[] if has_cyr(novel) else content_tokens(novel),
                    dimension="transferencia_contextual"))
            base["steps"] = [s for s in base["steps"] if s]
            return base if base["steps"] else self.drop(item, "sin pasos")

        if kind == "constrained_transfer":
            if se.get("requiredCounterexample"):
                counter = se["requiredCounterexample"]
                if not has_cyr(counter):
                    return self.drop(item, "contraejemplo no verificable")
                base["steps"].append(self.step_written(
                    sid + "/a", "Escribe un contraejemplo en ruso que refute la afirmación.",
                    [counter], dimension="transferencia_contextual"))
                concepts = [clean_concept(c) for c in se.get("requiredConcepts", [])]
                if concepts:
                    options = self.concept_options(item, concepts[0])
                    step = self.step_choice(
                        sid + "/b", "¿Por qué ese ejemplo refuta la afirmación?",
                        [concepts[0]] + options, concepts[0], dimension="comprension_explicita")
                    if step:
                        base["steps"].append(step)
                base["steps"] = [s for s in base["steps"] if s]
                return base if base["steps"] else self.drop(item, "sin pasos")

            response = se.get("referenceResponse") or se.get("referenceRussian") or se.get("referenceAnswer")
            if not has_cyr(response or ""):
                return self.drop(item, "transferencia sin respuesta rusa")
            parts = [s for s in sentences(response) if has_cyr(s)]
            step = (self.step_multiwritten(sid + "/a", "Escribe la intervención completa en ruso.", parts)
                    if len(parts) > 1 else
                    self.step_written(sid + "/a", "Escribe la intervención en ruso.", [response],
                                      dimension="transferencia_contextual"))
            if not step:
                return self.drop(item, "sin respuesta")
            base["steps"].append(step)
            concepts = [clean_concept(c) for c in se.get("requiredConcepts", [])]
            if concepts:
                options = self.concept_options(item, concepts[0])
                cstep = self.step_choice(
                    sid + "/b", "¿Qué decisión lingüística resuelve esta situación?",
                    [concepts[0]] + options, concepts[0], dimension="comprension_explicita")
                if cstep:
                    base["steps"].append(cstep)
            base["steps"] = [s for s in base["steps"] if s]
            return base

        if kind == "information_gap_reconstruction":
            exchange = se.get("referenceExchange") or se.get("referenceRussian") or se.get("referenceAnswer")
            parts = [s for s in sentences(exchange or "") if has_cyr(s)]
            if not parts:
                return self.drop(item, "intercambio no verificable")
            gaps = [se.get("gapForA"), se.get("gapForB")]
            prompt = "Escribe el intercambio mínimo que cierra las dos lagunas."
            if all(gaps):
                prompt += f" A necesita: {gaps[0]}. B necesita: {gaps[1]}."
            step = self.step_multiwritten(sid + "/a", prompt, parts)
            if not step:
                return self.drop(item, "sin partes")
            base["steps"].append(step)
            return base

        return self.drop(item, f"tipo sin conversor: {kind}/{mode}")

    def drop(self, item, reason):
        self.dropped[reason] += 1
        self.drop_log.append({"id": item["id"], "type": item["type"], "reason": reason})
        return None


# ------------------------------------------------------------------ montaje


def main() -> int:
    b = Builder()

    skills_raw = load_zip_json("skills_l001_l010_v1_9_3.json")
    vocab_raw = load_zip_json("vocabulary_l001_l010_v1_9_3.json")
    ex_raw = load_zip_json("exercises_l001_l010_v1_9_3.json")
    kernels_raw = load_zip_json("semantic_kernels_l001_l010_v1_9_3.json")
    trajectories = load_zip_json("skill_trajectories_l001_l010_v1_9_3.json")
    l011 = json.loads(L011.read_text(encoding="utf-8"))
    authored = json.loads(AUTHORED.read_text(encoding="utf-8"))

    # --- competencias -----------------------------------------------------
    skills = {}
    for s in skills_raw:
        skills[s["skillId"]] = {
            "skillId": s["skillId"],
            "domain": s.get("domain"),
            "linguisticPhenomenon": s.get("linguisticPhenomenon"),
            "prerequisites": s.get("prerequisites", []),
            "commonConfusions": s.get("commonConfusions", []),
            "unit": int(s["introducedInLesson"].split("_")[1]),
            "kind": s.get("skillKind", "atomicSkill"),
        }
    for s in authored.get("skills011", []):
        skills[s["skillId"]] = s
    b.skills = skills
    b.concept_pool = [(sid, clean_concept(f"Aquí lo decisivo es {sk['linguisticPhenomenon']}"))
                      for sid, sk in skills.items() if sk.get("linguisticPhenomenon")]

    b.kernels = {k["id"]: k for k in kernels_raw}

    # mapa ejercicio -> competencia, a partir de skills.exerciseIds
    ex_skill = {}
    for s in skills_raw:
        for eid in s.get("exerciseIds", []) or []:
            ex_skill.setdefault(eid, s["skillId"])
    # etapas de trayectoria (para el orden pedagógico)
    stage_of = {}
    for t in trajectories:
        for stage in t.get("stages", []):
            for eid in stage.get("exerciseIds", []) or []:
                stage_of.setdefault(eid, stage["stage"])

    # --- ejercicios -------------------------------------------------------
    all_items = []
    for e in ex_raw:
        e = normalize_item(e)
        e.setdefault("skillId", ex_skill.get(e["id"]))
        e["stage"] = stage_of.get(e["id"], "practice")
        all_items.append(e)

    # unidad 011
    for e in l011["exercises"]:
        e = normalize_item(e)
        e["lessonNumber"] = 11
        e["stage"] = "practice"
        all_items.append(e)

    runtime = []
    for e in all_items:
        conv = b.convert(e)
        if conv:
            conv["stage"] = e.get("stage", "practice")
            runtime.append(conv)

    # --- vocabulario ------------------------------------------------------
    vocab = []
    for v in vocab_raw:
        vocab.append({
            "id": v["id"],
            "unit": int(v["introducedIn"].split("_")[1]),
            "lemma": v.get("formRussian") or v["lemma"],
            "stressed": v.get("stressMarked"),
            "translation": v.get("translation"),
            "pos": v.get("partOfSpeech"),
            "feature": v.get("feature"),
            "exampleRu": v.get("exampleRu"),
            "exampleEs": v.get("exampleEs"),
            "recycleIn": [int(x.split("_")[1]) for x in (v.get("recycleIn") or [])],
        })
    for v in l011["vocabulary"]:
        vocab.append({
            "id": v["id"],
            "unit": 11,
            "lemma": v["lemma"],
            "stressed": v.get("stressMarked"),
            "translation": v.get("translation"),
            "pos": v.get("partOfSpeech"),
            "feature": v.get("feature"),
            "exampleRu": v.get("exampleRu"),
            "exampleEs": v.get("exampleEs"),
            "conjugation": v.get("conjugation"),
            "recycleIn": [],
        })

    # --- audio ------------------------------------------------------------
    audio_map = {}
    if AUDIO_INDEX.exists():
        idx = json.loads(AUDIO_INDEX.read_text(encoding="utf-8"))
        for entry in idx.get("entries", []):
            audio_map[norm_answer(entry.get("text", ""))] = entry["audio_path"]
    for v in vocab:
        path = audio_map.get(norm_answer(v["lemma"]))
        if path:
            v["audio"] = path

    # --- unidades ---------------------------------------------------------
    lessons = {int(l["lessonNumber"]): l for l in authored["lessons"]}
    lessons[11] = l011["lesson"]

    units = []
    for n in range(1, 12):
        lesson = lessons[n]
        u_items = [i for i in runtime if i["unit"] == n]
        practice = [i for i in u_items if i["phase"] != "exam"]
        exam = [i for i in u_items if i["phase"] == "exam"]
        u_skills = sorted({sid for sid, s in skills.items() if s["unit"] == n})
        units.append({
            "unit": n,
            "id": f"unidad-{n:03d}",
            "title": lesson["title"],
            "cefr": lesson.get("cefr", "A1"),
            "objective": lesson.get("objective"),
            "prerequisiteSkills": lesson.get("prerequisiteSkills", []),
            "newSkills": lesson.get("newSkills", u_skills),
            "sections": lesson.get("sections", []),
            "vocabCount": len([v for v in vocab if v["unit"] == n]),
            "practiceCount": len(practice),
            "examCount": len(exam),
        })

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "unidades").mkdir(exist_ok=True)

    for i in runtime:
        for st in i["steps"]:
            if st.get("prompt") and st["prompt"].strip() == (i.get("prompt") or "").strip():
                st["prompt"] = ("Escribe tu respuesta." if st["kind"] == "written"
                                else "Elige la formulación adecuada.")

    for u in units:
        n = u["unit"]
        payload = {
            "unit": u,
            "vocabulary": [v for v in vocab if v["unit"] == n],
            "items": [i for i in runtime if i["unit"] == n],
        }
        (OUT / "unidades" / f"unidad-{n:03d}.json").write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    curriculum = {
        "version": "prototipo-1.0",
        "generated": "build_prototipo.py",
        "source": "paruski_b1_materials_l001_l010_v1_9_3_EDITADO + leccion_011",
        "units": [{k: u[k] for k in
                   ("unit", "id", "title", "cefr", "objective", "newSkills",
                    "vocabCount", "practiceCount", "examCount")} for u in units],
        "skills": list(skills.values()),
        "passMark": 0.8,
    }
    (OUT / "curriculum.json").write_text(
        json.dumps(curriculum, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    report = {
        "itemsIn": len(all_items),
        "itemsOut": len(runtime),
        "dropped": dict(b.dropped),
        "byType": dict(Counter(i["type"] for i in runtime)),
        "byUnit": {str(n): len([i for i in runtime if i["unit"] == n]) for n in range(1, 12)},
        "examByUnit": {str(n): len([i for i in runtime if i["unit"] == n and i["phase"] == "exam"])
                       for n in range(1, 12)},
        "stepKinds": dict(Counter(s["kind"] for i in runtime for s in i["steps"])),
        "vocab": len(vocab),
        "vocabWithAudio": len([v for v in vocab if v.get("audio")]),
        "skills": len(skills),
        "dropLog": b.drop_log,
    }
    (OUT / "informe-build.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    print(json.dumps({k: v for k, v in report.items() if k != "dropLog"},
                     ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
