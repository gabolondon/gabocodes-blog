---
title: "Typed judges for document extraction: ten models benchmarked, and the bug they found in my code first"
description: "Part 2 of 2. I benchmarked Jev and nine local typed judges on the two decisions my extraction pipeline needed, routed each decision by what data it carries, and found that batching makes a hosted judge 75 times faster and small local ones worse. With runnable example code."
problem: "Can a small model decide whether an extracted value is right?"
tags: [document-extraction, llm-as-judge, typed-judges, local-llms, privacy, batching, benchmarking]
date: 2026-10-23
lang: en
i18n_key: document-extraction-judge
stack: [Jev, decider-4b, JevK5, gemma4, MLX, llama.cpp, Ollama]
result: "171 decisions: 131.5 s → 1.7 s for $0.0036, same accuracy"
repo_url: https://github.com/gabolondon/extraction-lanes-demo
terminal:
  - {text: "$ make bench-matcher", tone: cmd}
  - {text: "naive  129/160  accuracy 0.81  confident errors 3", tone: bad}
  - {text: "fixed  160/160  accuracy 1.00  confident errors 0", tone: ok}
  - {text: "$ make policy-demo", tone: cmd}
  - {text: "field_mapping     public   -> allowed", tone: ok}
  - {text: "line_attribution  personal -> REFUSED", tone: ok}
featured: false
---
My extraction research had been sitting untouched for weeks when Jev came out, and the judge I had designed in part one was still a diagram. Then a model showed up whose whole pitch was the job I had left unbuilt: you give it facts and a typed question, and it gives you back a pick, a probability for each option and a confidence. No free text to parse, nothing for it to make up.

Three days of benchmarks later, one number made me look twice. 171 of those decisions took 131.5 seconds when I sent them one by one. Batched, they took 1.7 seconds, with the same accuracy, and the whole run cost $0.0036.

But before it ranked a single judge, the benchmark found a bug in my own code. That's where this starts.

Quick recap of [part one](/writing/document-extraction-lanes/): I benchmarked 15 extractors on two reports, one English and one Spanish, found no local winner, and ended up with an architecture where personal data is redacted on my machine before anything reads it in the cloud. The reports are described generically: semi-structured documents with long tables of labeled values. It's my own side research, not something running in production. The engineering and the numbers are real. The snippets are simplified versions of what's in a companion repo on a different domain. This is example code: it shows the pattern I used, not the production implementation.

## What a typed judge is, and what I asked it

A typed judge doesn't write. You send it a state, the facts it needs, plus a question and a closed set of options. It answers with one option, a probability per option, and a confidence score. Jev, from TypeSafe, is a hosted model built for this. Around it there's a small scene of open models that speak the same shape: decision-tuned fine-tunes of 4B models, and readouts that turn a normal chat model into one by reading the probabilities of the option letters.

My original plan was a judge that compares extraction lanes and picks the right value per field. That arbiter was never built. What I benchmarked were the two decisions underneath it that my pipeline kept getting wrong, the ones any lane judge depends on:

1. **Field mapping.** A lane read a printed name like "Presión de entrada (bar)". Which known field in my app is that, or is it something new? 171 printed names from the two reports (45 English, 126 Spanish). The code builds a shortlist by fuzzy matching, and the judge picks one of them or an escape option. Nothing in those facts identifies a person, so a hosted judge is allowed.
2. **Line ownership.** A value sits on a line; which printed name does it belong to? The one on the same line, one wrapped above it, a header, or none, because it isn't a result at all. 109 rows (86 English, 23 Spanish). The facts are raw page lines, which may carry personal data, so this one runs locally or not at all.

The answer key was the same human-reviewed reference from part one.

And I tracked one metric above accuracy: **silent wrong**. A confident pick of a different known field, or the wrong owner. Not an abstention, not a "new". A wrong answer that looks right. In extraction, that's the one that reaches the user.

### Under the hood: the shape of a typed decision

Skip these sections if you lead a team; they're for whoever has to build it.

```python
# judge/decision.py (pattern, not the real implementation)
from dataclasses import dataclass

@dataclass
class Decision:
    pick: str
    probabilities: dict[str, float]   # one per choice
    margin: float                     # p1 - p2: how sure, relative to the runner-up

def field_mapping_question(name: str, unit: str, limits: str, lang: str,
                           shortlist: list[str]) -> tuple[dict, str, list[str]]:
    facts = {"label": name, "context": f"{unit} {limits} ({lang})"}
    question = "Which catalog field is this printed label?"
    choices = shortlist + ["something_else"]
    return facts, question, choices

def accept(d: Decision, threshold: float) -> bool:
    # auto-accept only above the threshold; the rest goes to a human
    return d.margin >= threshold and d.pick != "something_else"
```

The judge never sees a free-text prompt asking "is this correct?". It sees a closed question with options my code built. That's what makes the answer checkable and the confidence usable as a gate.

## The benchmark found my bug first

Before any judge, I ran the baselines: plain code, no model. The fuzzy matcher my pipeline used to map printed names to fields.

Accuracy: 0.33. And about 79 silent wrong answers out of 171.

That was my code, and it had been mapping things wrong with total confidence. The cause was almost funny. In the Spanish report, a handful of generic words appear in almost every name, generic filler words that say nothing about the field. My matcher scored the whole string, so those shared words dominated the score, and about 20 different Spanish names collapsed onto the same field. On the unique names, 50 silent wrong.

The fix was to strip those words before scoring and switch to a scorer that compares tokens regardless of order. Silent wrong on the unique names went from 50 to 9, on the whole set from 79 to 12, and accuracy from 0.33 to 0.58. Same set, same reference, an afternoon of work.

I didn't expect that. The benchmark was built to rank judges, and the first thing it ranked was me.

The same pass found two smaller defects in my field catalog. And the layout rule for line ownership, "the name is in the first column", scored 0.91 on English and 0.00 on Spanish, 23 out of 23 wrong, because Spanish names wrap above the value.

My takeout and lesson: build the benchmark before you trust your baseline. Mine was the worst system in the room.

### Under the hood: filler words that drown the signal

```python
# catalog/matcher.py (pattern, not the real implementation)
from collections import Counter
from rapidfuzz import fuzz, process

def filler_words(aliases: list[str], share: float = 0.33) -> set[str]:
    # words present in more than a third of names say nothing about the field
    counts = Counter(w for a in aliases for w in set(a.lower().split()))
    return {w for w, c in counts.items() if c / len(aliases) > share}

def clean(name: str, filler: set[str]) -> str:
    return " ".join(w for w in name.lower().split() if w not in filler)

def nearest_fields(name: str, catalog: dict[str, str], filler: set[str], k: int = 8):
    cleaned = {code: clean(alias, filler) for code, alias in catalog.items()}
    return process.extract(clean(name, filler), cleaned,
                           scorer=fuzz.token_set_ratio, limit=k)
```

Derive the filler list from your own catalog, not from a hand-written stop list. The words that hurt you are the ones your sources repeat, and those change with every new source.

## Ten judges on field mapping

Then the judges. Same 171 names, one run per configuration, on my 24 GB MacBook Pro for everything local. Every local model is listed with its runtime and precision, because those change results, and none of these is the authors' reference setup.

| Judge | Runtime, precision | Accuracy | Correct /171 | Silent wrong | Judge seconds |
|---|---|---|---|---|---|
| Jev 1.13, batched 8 names × 8 parallel (TypeSafe, hosted) | vendor API | **0.98** | 167 | 3 | **1.7** |
| Jev 1.13, one by one | vendor API | 0.97 | 166 | 3 | 131.5 |
| decider-4b v2 (fine-tune of Qwen3.5-4B) | PyTorch on MPS | 0.97 | 166 | 3 | 119 |
| gemma4 12B (Google), zero-shot | Ollama, Q4_K_M | 0.97 | 166 | 4 | 458 |
| tev1-4B experimental (Together AI, LoRA on Qwen3.5-4B) | MLX, bf16 | 0.96 | 165 | 2 | 127 |
| JevK5 v0.2 (open fine-tune of Qwen3.5-4B) | llama.cpp, Q8_0 | 0.95 | 162 | 5 | 125 |
| reflex-4b (open Jev re-creation, frozen Qwen3.5-4B) | PyTorch on MPS, fp16 | 0.95 | 163 | 7 | 215 |
| Qwen3.5-4B zero-shot via TypeLLM, one option order | MLX, bf16 | 0.92 | 157 | 10 | 112 |
| Ornith 1.5 9B, reasoning off | Ollama, Q8_0 | 0.88 | ~150 | 15 | ~338 |
| Laya typed-decisions 421M (ModernBERT head) | laya-mlx, fp16 | 0.60 | ~103 | 44 | ~16 |
| Laya multilingual 322M | laya-mlx, fp16 | 0.49 | ~84 | 61 | ~6 |
| My matcher, fixed | code | 0.58 | 99 | 12 | <1 |
| My matcher, original | code | 0.33 | ~56 | ~79 | <1 |

I went in expecting a decision like this to need a big model. The top of that table is a tie, and two of the four tied judges run 4B weights on my laptop. Jev, decider-4b, gemma4 12B and tev1 are statistically indistinguishable on this set: a paired test between them gives p = 1.0. One run per configuration on two reports means about ±2.6 points of noise on 171 cases. Every judge beats the code baselines by a mile (p < 0.0001).

What separates them is everything around the accuracy:

- **gemma4 12B is accurate and its confidence is useless.** Every answer reads as about 1.0, wrong ones included, so a confidence gate passes everything. That's partly my readout: the alternatives fall outside Ollama's top-20 log-probabilities. It's also 458 seconds, four times the 4B models.
- **decider-4b has the best gate.** At a 0.9 threshold it auto-accepted 131 of 171 with zero errors among them. Zero in 131 still allows up to about 2.8% on bigger sets, but it's the cleanest gate I saw.
- **Small classifiers aren't judges.** The Laya heads are fast, 18 to 44 ms per case, and lost: 44 and 61 silent wrong. With a 1,024-token context they may simply not be built for this task and these languages.
- **Option order matters.** The zero-shot Qwen3.5-4B readout through TypeLLM, with one option order, had 10 silent wrong against 7 for reflex, which averages two orders. That's position bias, and fixing it costs double the tokens.
- **A reasoning model with reasoning off is not a fair test.** Ornith 1.5 9B came in at 0.88 with 15 silent wrong. I ran it with thinking off, so this measures the model doing something it wasn't built for.

## Batching: 75 times faster in the cloud, worse at home

Back to the number from the top. Jev, field mapping, 171 names:

| Configuration | Accuracy | Silent wrong | Seconds | Speed-up | Cost, all 171 |
|---|---|---|---|---|---|
| One name per request, sequential | 0.97 | 3 | 131.5 | 1× | $0.0053 |
| One name per request, 8 parallel | 0.97 | 3 | 11.6 | 11× | $0.0053 |
| 8 names per request, sequential | 0.98 | 2 | 11.5 | 11× | $0.0036 |
| **8 names per request, 8 parallel** | **0.98** | **3** | **1.7** | **75×** | **$0.0036** |
| 16 names per request, 4 parallel | 0.94 | 4 | 2.0 | 65× | $0.0035 |
| 32 names per request | 0.67 | 8 | 4.1 | 32× | $0.0034 |

Batching 8 names per request cut input tokens by about a third, from 732 to 498 per name, because the shared part of the prompt is sent once. Accuracy held at 8. At 16 it dipped (not significant), and at 32 it collapsed to 0.67, the only drop that is significant. One more thing moved: confidence shifts when you batch. At 8 per request, the 0.9 gate only auto-accepted about half, so I retuned it to 0.7, which auto-accepted 92% at 0.99 accuracy.

That was one day, one account, one region. The price behind those cents is the vendor's ($0.042 per million input tokens at the time), not something I negotiated.

So I believed batching was a free speed-up, and I tried it on the local judges. It wasn't.

| Local judge | One by one: accuracy / silent wrong | 8 per request: accuracy / silent wrong | Speed |
|---|---|---|---|
| decider-4b v2 | 0.97 / 3 | 0.93 / 7 | slower (0.5×) |
| JevK5 v0.2 | 0.95 / 5 | 0.88 / 18 | slower (0.6×) |
| tev1-4B | 0.96–0.97 / 2 | 0.92 / 9 | same |
| reflex-4b | 0.95 / 7 | 0.85 / 25 | slower (0.8×) |
| Qwen3.5-4B via TypeLLM | 0.92 / 10 | 0.81 / 28 | slower (0.8×) |
| gemma4 12B | 0.97 / 4 | 0.97 / 4 | slower (0.6×) |

Worse and no faster. The 4B judges picked up between 4 and 18 extra silent wrong answers, and the JevK5 drop is significant (p = 0.004). Only gemma4 12B held its accuracy, and it got slower. My reading of why, without a clean measurement behind it: about 90% of each question is its own option list, so batching saves very little shared prompt, and a small model has to keep eight option lists apart in one context.

On line ownership, sending the whole page per request may help the larger models: gemma4 12B went from 8 to 3 silent wrong, suggestive at p = 0.06, and slower. For the 4B models, nothing changed or it got worse.

### Under the hood: batching without losing track of the options

```python
# judge/batch.py (pattern, not the real implementation)
def batch_prompt(items: list[tuple[dict, list[str]]]) -> str:
    lines = ["Answer each item with the letter of one choice."]
    for i, (facts, choices) in enumerate(items, start=1):
        lines.append(f"\nItem {i}: {facts}")
        for letter, choice in zip("ABCDEFGHIJ", choices):
            lines.append(f"  {letter}) {choice}")
    return "\n".join(lines)

def chunks(seq: list, size: int):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]

# hosted, built for it: chunks of 8, 8 requests in flight
# local 4B: chunks of 1, and measure before changing it
```

Keep the batch size a setting per backend, not a constant. The right value was 8 for one judge and 1 for every small local one, on the same task.

## Where each decision is allowed to run

Line ownership is the other half, and it carries raw page text. That text can hold personal data, so it never goes to a hosted judge, and a policy check in code enforces it rather than a wiki page. Jev was never run on it.

| Judge | Accuracy | Correct /109 | Silent wrong | Judge seconds |
|---|---|---|---|---|
| JevK5 v0.2, one row per request | **0.97** | 106 | 3 | ~83 |
| gemma4 12B, whole page per request | 0.97 | 106 | 3 | 404 |
| reflex-4b, whole page | 0.95 | 104 | 5 | 141 |
| Ornith 1.5 9B | 0.94 | 102 | 6 | ~207 |
| decider-4b v2, per row | 0.93 | 101 | 8 | ~60 |
| Qwen3.5-4B via TypeLLM, per row | 0.93 | 101 | 8 | 54 |
| tev1-4B, per row | 0.91 | 99 | 10 | 77 |
| Layout rule "first column" | 0.72 | 78 | 31 | <1 |

JevK5, the open re-creation running locally in llama.cpp at Q8, led here: 3 silent wrong, and the difference against tev1 is significant (7 to 0, p = 0.016). Against the 0.93 group it's suggestive (p = 0.06), not proven. Jev has no number on this task by design, so I can't say how JevK5 compares with its namesake here.

That split is the architecture I'm keeping. Facts without personal data can go to the best judge wherever it runs. Raw page text gets a local judge, one row at a time.

### Under the hood: the policy lives in code, not in a wiki

```python
# judge/policy.py (pattern, not the real implementation)
from dataclasses import dataclass

@dataclass(frozen=True)
class Task:
    name: str
    data_class: str          # "public" or "personal"

@dataclass(frozen=True)
class Runner:
    name: str
    leaves_machine: bool

class EgressRefused(Exception):
    pass

def check(task: Task, runner: Runner) -> None:
    if task.data_class != "public" and runner.leaves_machine:
        raise EgressRefused(f"{task.name} carries personal data; {runner.name} is remote")

FIELD_MAPPING = Task("field_mapping", "public")       # no personal data
LINE_ATTRIBUTION = Task("line_attribution", "personal")  # raw page lines
```

Two properties, one on each side: the task says what it carries, the runner says where it runs. Adding a new hosted judge can't quietly widen what leaves the machine, because nothing about the tasks changes.

## What broke along the way

A benchmark across ten judges on a laptop is mostly fighting runtimes. The list, because each one cost me an evening and might save you one:

- **fp16 on Apple's MPS returned all-zero logits** for the Qwen3.5-4B letter readout. bf16 works. I added a smoke check that rejects uniform or all-zero probabilities before a run starts.
- **Memory.** reflex-4b ran out of memory at the default MPS limit; removing the limit grew the process to 21 GB and the Mac started swapping, so those timings went in the bin. A limit of 1.0 (about 17.7 GB) worked.
- **gemma4 isn't supported in mlx-lm**, so it ran on Ollama only.
- **A model vanished from Hugging Face** mid-benchmark (HTTP 401). Only a third-party copy was left. Not run.
- **Two judges need CUDA.** Hopper and Cygnet assume NVIDIA GPUs. I wrote wrappers for both; Hopper passed one smoke request, neither was benchmarked.
- **Failed hosted calls** are scored as abstentions, never as guesses.

And the gap I'd close first: I never ran a big general-purpose model as a judge baseline. "Why not just ask a frontier model?" is a fair question, and I have no data on it.

## The scoreboard

Two reports, 171 field-mapping names and 109 line-ownership rows, one run per configuration, a 24 GB MacBook Pro for local runs, my runtimes and quantizations (not the authors' reference setups). Differences inside the top tier are not statistically significant.

- My original matcher: 0.33 accuracy, about 79 silent wrong of 171.
- My matcher after the fix the benchmark forced: 0.58 accuracy, 12 silent wrong.
- Field mapping, top tier (tie, p = 1.0): Jev 0.97–0.98, decider-4b 0.97, gemma4 12B 0.97, tev1-4B 0.96–0.97.
- Best confidence gate: decider-4b, 131 of 171 auto-accepted, 0 errors among them.
- Line ownership, local only: JevK5 v0.2 0.97, 3 silent wrong of 109; layout rule 0.72, 31 silent wrong.
- Jev, 171 decisions: 131.5 s one by one → 1.7 s at 8 per request × 8 parallel (75×), $0.0053 → $0.0036, accuracy 0.97 → 0.98.
- Jev at 32 per request: accuracy 0.67.
- Local 4B judges at 8 per request: +4 to +18 silent wrong, 0.5× to 1.0× speed.

## My takeaway

Part one ended with no best extractor. Part two ends with four judges tied on my data, and the real differences are in places a leaderboard doesn't show: whether the confidence means anything, what batching does to it, and what data the decision carries.

So here's where I landed, as my opinion, from these two benchmarks:

1. **Extraction:** redact on the machine with a gate that fails closed, then let a frontier vision model read the redacted page. No local lane came close on both accuracy and speed.
2. **Decisions without personal data** (field mapping): a hosted typed judge, batched at 8 with 8 in flight, gated on its confidence. 1.7 seconds and about a third of a cent for both reports.
3. **Decisions on raw page text** (line ownership): a local 4B decision-tuned judge, one item per request. JevK5 led here; never batched until measured.
4. **Everything:** score silent wrong next to accuracy, and build the reference before you trust any baseline, mine included.

That cost me the "all local" rule from part one, three days of runtime fights and the belief that my matcher was fine.

What's next is the thing this series started with: the lane arbiter that compares lanes and decides per field. It's still a design. The difference is that now I know which judge to put in it, where each decision may run, and how I'll know if it's wrong.

## Run it yourself

The companion repo, `extraction-lanes-demo`, is shared with part one. This is example code: it shows the pattern I used, not the production implementation. It runs on an example domain, calibration certificates for industrial instruments, and the numbers it prints come from its own example corpus, not from the benchmarks above.

What it demonstrates for this part:

- The typed-decision shape (facts, question, choices → pick, probabilities, margin) with a local backend and a generic hosted one.
- The egress policy: a task carrying personal data is refused by any backend that leaves the machine, before the network call.
- A naive matcher next to the fixed one, with filler words derived from the catalog, so you can watch confident errors drop.
- Batch size and concurrency as settings, so you can measure what batching does to your own judge.

```bash
make install
make corpus
make test             # offline
make bench-matcher    # naive vs fixed matcher, no models needed
make policy-demo      # the policy refusing a personal-data task on a remote backend
make bench-judge JUDGE=ollama JUDGE_MODEL=<any local model> BATCH=1
```
