# Advanced exercise and exam design — Paruski

## Purpose

Paruski targets a high-verbal-ability learner. The app must stop rewarding
shallow repetition immediately after explanation. This document defines the
advanced challenge / inferential practice layer: the metadata, validator
gates, exercise families, and exam rules that ensure the learner must infer,
generalize, contrast, and transfer — not merely copy.

## Exercise value tiers

| Tier | Cognitive demand | Example types | Can unlock mastery? |
|------|-------------------|---------------|---------------------|
| Low  | Trivial recognition, answer in prompt | bare multiple-choice, cloze with visible answer | No |
| Medium | Recall + application to familiar context | text-input, error-correction, token-build | Partial |
| High  | Inference, transfer, contrast, combination, delayed recall | transform, contrastive MC, choice-grid, cumulative exam | Yes |

### What makes an item "low value"

- The correct answer appears verbatim in the prompt.
- The item can be solved by surface-level elimination (absurd distractors).
- It asks the learner to repeat or transcribe without meaning.
- It is shown immediately after explanation with no novel context.

### What makes an item "high value"

- Requires inferring a pattern from examples before the rule is stated.
- Requires applying a known pattern to a context not previously seen.
- Forces a choice between close morphological/syntactic competitors.
- Requires correcting a plausible Spanish-interference error.
- Transforms meaning under a semantic constraint.
- Combines several targets in one item.
- Appears in delayed mixed practice, not right after explanation.
- Is part of an exam where the exact item/context was not previously shown.

## Additive metadata fields

All fields are optional and backward-compatible. Existing exercises without
these fields continue to pass validation (they receive warnings, not errors).

### `quality` sub-fields

| Field | Type | Description |
|------|------|-------------|
| `requiresGeneralization` | bool | Learner must extend a pattern to a new lexical item or context |
| `requiresTransfer` | bool | Learner must apply a pattern in a context not directly taught |
| `novelContext` | bool | The prompt context differs from any practice item the learner has seen |
| `notImmediatelyAfterExplanation` | bool | The item is designed for delayed/mixed practice, not right after teaching |
| `contrastive` | bool | The item forces a choice between close competitors (кто vs что, это vs есть, etc.) |
| `combinesTargets` | bool | The item integrates multiple targets simultaneously (already existed, now validated) |
| `suitableForAdvancedLearner` | bool | The item is challenging enough for a high-verbal-ability learner |

### Top-level fields

| Field | Values | Description |
|------|--------|-------------|
| `exam_role` | `practice` \| `challenge` \| `unlock` \| `cumulative` \| `diagnostic` | Role of this item in the learning flow |
| `transfer_level` | `near` \| `medium` \| `far` | How far the transfer is from the taught pattern |
| `exposure_dependency` | `seen_pattern` \| `unseen_context` \| `unseen_combination` \| `inference_before_explanation` | What the learner must have seen vs infer |

## Validator gates

`scripts/validate_exercise_quality.py` now enforces two tiers of checks:

### Universal gates (all exercises)

- No answer in prompt
- Not trivial recognition
- Auto-correctable with deterministic grading
- Specific error-typed feedback
- Valid target_ids
- Choice items: 4 choices, 1 correct, 3+ diagnostic distractors

### Advanced gates (unlock exams + challenge items)

**Hard errors:**
- No answer in prompt (double-gated)
- Not trivial recognition
- Multiple-choice must require inference or application (not bare recognition)
- Must require application, inference, generalization, or transfer
- Feedback must be >= 60 characters
- Must declare `srs.countsAsEvidenceFor` (target-level evidence)
- `combinesTargets` requires >= 2 target_ids
- Trivial recognition must never be in an unlock exam
- Choice distractors must each declare a `diagnosticReason`

**Soft warnings (do not fail the build):**
- Unlock exam items should declare generalization/transfer/novelContext/notImmediatelyAfterExplanation
- Unlock exam items should declare at least one critical error

Warnings flag items that have not yet been upgraded. This allows progressive
migration without breaking the build.

## High-value exercise families

### A. Contrastive minimal-pair choice

The learner distinguishes close alternatives: nominative vs accusative, кто vs
что, это vs есть, animate vs inanimate, gender/number agreement.

**Design:** All four options are grammatically plausible; only one is correct
in context. Distractors must each carry a `diagnosticReason` explaining which
error they represent.

**Example (lesson 1, `foundation-l01-026`):**
- Prompt: "Esta es una abuela. Esto no es café." — choose the correct Russian.
- Distractors: missing negation, copula interference, wrong negation particle.
- Metadata: `contrastive: true`, `transfer_level: medium`, `exposure_dependency: unseen_combination`.

### B. Error correction under interference

The learner sees a plausible wrong Russian sentence caused by Spanish
interference and must repair only the relevant error.

**Design:** The display shows the incorrect sentence. The expected answer is
the corrected full sentence. The prompt names the interference type without
revealing the answer.

**Example (lesson 1, `foundation-l01-024`):**
- Type: error-correction
- Expected: "Что это? Это хлеб. Это не молоко."
- Critical errors: question_word_confusion, spanish_ser_estar_interference, wrong_negation_particle.

### C. Contextual production without immediate model

The learner receives a situation in Spanish and must produce Russian without
seeing the target form in the prompt.

**Design:** `text-input` type, `es_to_ru` direction. The prompt describes a
communicative situation, not a form to repeat.

**Example (lesson 1, `foundation-l01-013`):**
- Prompt: "En una escena con dos imágenes, primero preguntas por una persona y luego descartas una mascota."
- Expected: "Кто это? Это мальчик. Это не собака."
- Metadata: `requiresTransfer: true`, `novelContext: true`, `combinesTargets: true`.

### D. Transformation with semantic constraint

Change form while preserving meaning: singular → plural, subject/person/
negation change, gender swap.

**Design:** `transform` type. The prompt specifies what to change and what to
preserve. Grading is exact-match.

### E. Token-build with adversarial distractors

Distractors must be plausible and diagnose common mistakes, not absurd.

**Design:** `token-build` type with >= 4 tokens. Distractor tokens are chosen
from the same paradigm (e.g., есть, что, не) so the learner must select
correctly.

### F. Choice-grid / multi-decision item

One item requires several linked decisions: pronoun + case + word order +
copula omission.

**Design:** `choice-grid` type with >= 2 items, each with >= 3 choices.
Grading: all items must match. The JS evaluator serializes answers as JSON.

### G. Cumulative unlock exam

Mixed targets from previous lessons, novel contexts, no immediate scaffolding,
no exact repeated practice item.

**Design:** `unlock_exam: true`, `exam_role: "unlock"`. The scheduler
`buildExamSession` selects 20 items, preferring high `cognitiveDemandScore`.
Items shown immediately after explanation should not count as strong mastery
evidence (handled by `exerciseEvidenceWeight` in learner-model).

### H. Inference-before-explanation item

The learner sees 2–3 short examples and must infer which new sentence is
grammatical or what pattern explains the contrast.

**Design:** `multiple-choice` type with `processing: "inference"` in targets.
All distractors are plausible sentences. The learner must reason from the
examples to the rule. Grading is deterministic (exact choice match).

## Exam design rules

1. **Novel contexts:** Unlock exams must use contexts the learner has not
   seen in practice items. `novelContext: true` in metadata.

2. **Delayed and mixed:** Exam items span multiple targets from the lesson.
   The scheduler's `selectDiverseExercises` enforces `maxPerTarget: 2` and
   `maxPerType: 5`.

3. **Production + diagnosis + transformation + contrast:** The 20-item exam
   should include multiple cognitive types. `orderExamExercises` now sorts by
   `cognitiveDemandScore` first, then difficulty, then quality score.

4. **Exam evidence counts more:** `exerciseEvidenceWeight` in learner-model
   multiplies mastery gains by 1.5 for exam items, with additional bonuses for
   transfer, generalization, contrastive, and combinesTargets.

5. **Multiple-choice is allowed but gated:** MC can appear in exams only if
   distractors are plausible and diagnostic (each must have a
   `diagnosticReason`). Bare recognition MC is penalized (weight × 0.7).

6. **Trivial recognition never unlocks:** The validator hard-rejects any
   unlock_exam item with `isTrivialRecognition: true`.

7. **Immediate repetition does not count as strong mastery:** Items with
   `notImmediatelyAfterExplanation: true` get a 1.1× evidence bonus. Items
   without this flag that are shown right after explanation are implicitly
   weaker evidence.

## Current upgrade status

- **Lessons 1–2:** All 40 unlock-exam items upgraded with full cognitive-
  demand metadata (`requiresGeneralization`, `requiresTransfer`, `novelContext`,
  `notImmediatelyAfterExplanation`, `contrastive`, `suitableForAdvancedLearner`,
  `transfer_level`, `exposure_dependency`, `exam_role: "unlock"`).
- **Lessons 3–5:** 60 unlock-exam items still need upgrade (flagged as warnings
  by the validator, not errors).
- **Practice items:** First 3 lesson-1 practice items tagged with
  `suitableForAdvancedLearner` and `contrastive` fields for calibration.

## What still needs manual review

1. **Lessons 3–5 exam items:** 60 items need the same hand-curated metadata
   upgrade applied to lessons 1–2. Each item should be individually assessed
   for `requiresGeneralization`, `transfer_level`, and `exposure_dependency`
   based on its content.

2. **Practice item diversity:** Some practice items in lessons 1–2 are
   near-duplicates (same prompt template, different lexical item). Consider
   varying the communicative context to reduce template repetition.

3. **Transform and choice-grid exercises:** These types are supported by
   renderers and the validator but have no authored examples in
   `exercises.json` yet. Authoring a few would add high-value variety.

4. **Inference-before-explanation items:** No items currently use the
   `inference_before_explanation` exposure dependency. This family requires
   careful authoring: 2–3 examples in the prompt, a forced choice, and
   deterministic grading.

5. **Cumulative exams:** No `exam_role: "cumulative"` items exist yet. These
   would mix targets across lessons and require scheduler support for
   cross-lesson exam assembly.
