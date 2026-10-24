---
title: "Redact locally, read in the cloud: 15 document extractors benchmarked on messy PDFs"
description: "I needed to pull tables out of reports from sources I don't control, in two languages, without personal data leaving my machine. I benchmarked 2 parsers, 9 local text models, 4 local vision models and a frontier cloud model, then built a fail-closed redaction gate. Part 1 of 2, with runnable example code."
problem: "Which extractor can you trust with documents you don't control?"
tags: [document-extraction, local-llms, ollama, vision-models, privacy, benchmarking, pymupdf]
date: 2026-10-23
lang: en
i18n_key: document-extraction-lanes
stack: [PyMuPDF, Ollama, Qwen3, Gemma 4, Qwen2.5-VL, Presidio]
result: "Best local: 79.8% exact rows · redacted cloud vision: 99–100% precision"
repo_url: https://github.com/gabolondon/extraction-lanes-demo
terminal:
  - {text: "$ make bench-lanes", tone: cmd}
  - {text: "layout  cert_en_clean    strict 100%  text layer ok", tone: ok}
  - {text: "layout  cert_es_stacked  strict 0%  broken (4 pages)", tone: bad}
  - {text: "$ make gate-demo", tone: cmd}
  - {text: "planted identifiers: 7/7 removed", tone: ok}
  - {text: "GATE DEMO: OK", tone: ok}
featured: false
---
The request sounded small. Someone at work needed a batch of reports turned into structured data. Then I opened the files: different sources, different layouts, a couple in English, a couple in Spanish, and one in a language I don't read at all. My first move was the predictable one. One script per source, because the same source would probably send more.

By the third script I knew where that road ends. Every new source is a new parser, every template change on their side is a silent break on mine, and nobody tells you on which Tuesday the template changed.

So I changed the plan. A model would read these locally, so nothing personal leaves my machine. And since I didn't trust one model, several would read the same page, with something in front of them that only checks.

This post is part one of what I found. It's my own side research, not something running in production at work, and the reports here are described generically: semi-structured documents with long tables of labeled values. The engineering and the numbers are real. The snippets are simplified versions of what's in a companion repo on a different domain. This is example code: it shows the pattern I used, not the production implementation. Part two is about the judge.

## The idea: lanes, and a judge that doesn't write

Here's the plan I started with, before I had a single number.

Small local models are erratic. They're not deterministic, they hallucinate, and the documents carried values people make decisions with, so I needed precision, not vibes. My answer to that was redundancy: several extractors, each one a lane, each reading the same page its own way. A plain parser reading the text layer. A language model reading the extracted text. A vision model reading the rendered page.

Then, in front of them, a judge. A model that builds the final output from the PDF is just one more extractor that can be wrong, so this one gets one job: compare what the lanes returned and decide. How many values did each lane find? Do they agree on this field? If they disagree, that's a failure to flag. And over time, more rules, until any PDF from any source can go in.

I expected the judge to be the hard part. For the first month, the hard part was finding out which lanes were worth judging.

### Under the hood: one interface for every lane

Skip these sections if you lead a team; they're for whoever has to build it.

Every lane returns the same reading type, so the scorer and the judge never care which lane produced it: one printed value with its label, unit and allowed range, plus the line it came from.

```python
# lanes/base.py (pattern, not the real implementation)
from dataclasses import dataclass
from typing import Protocol

@dataclass(frozen=True)
class Reading:
    page: int
    label: str          # as printed, e.g. "Pressure at 50% span"
    amount: str         # kept as text: "12,40" and "12.40" are both real
    unit: str
    span_text: str     # the allowed range as printed, "" if none
    evidence: str       # the source line, for audits

class Lane(Protocol):
    name: str
    def read(self, document: str) -> list[Reading]: ...
```

The `evidence` field looks redundant until the first time two lanes disagree and you need to know which one read the page and which one guessed.

## Before any model: a reference I could trust

I couldn't rank anything without an answer key, so that came first.

I took two sample reports from two different sources. The English one: 15 pages, 89 rows of data. The Spanish one: 14 pages, 126 rows, with decimal commas and every measurement printed twice in different formats. Claude transcribed every printed measurement from the page images, verbatim, and I reviewed and approved every row. That's my "golden" reference. It's two documents, so one or two rows move a percentage by about a point, and since it was built by reading page images, it may flatter the vision models a little. I'll come back to that.

Then the scoring, which turned out to matter more than I expected. I used three numbers, because each one hides a different failure:

- **Strict**: rows where value, unit and both limits are exactly right, divided by the reference rows. Recall-style and harsh.
- **Precision and recall on name plus value**: of what the lane returned, how much was right; of what's on the page, how much it found. Space-insensitive, for a reason you'll see in a minute.
- **Invented rows**: returned rows whose name appears nowhere in the reference. In this kind of work, the scariest number on the sheet.

### Under the hood: scoring that can see an invented row

```python
# score/rows.py (pattern, not the real implementation)
def norm(name: str) -> str:
    # space-insensitive: "P r e s i ó n" and "Presión" compare equal
    return "".join(name.lower().split())

def score(found: list[Reading], gold: list[Reading]) -> dict:
    labels = {norm(g.label) for g in gold}
    pairs = {(norm(g.label), g.amount) for g in gold}
    full = {(norm(g.label), g.amount, g.unit, g.span_text) for g in gold}

    strict = sum((norm(r.label), r.amount, r.unit, r.span_text) in full for r in found)
    hits = sum((norm(r.label), r.amount) in pairs for r in found)
    invented = [r for r in found if norm(r.label) not in labels]
    return {
        "strict": strict / len(gold),
        "precision": hits / max(len(found), 1),
        "recall": hits / len(gold),
        "invented": len(invented),
    }
```

Count invented rows separately from wrong rows. A wrong value next to a real name gets caught by a human who knows the domain. A row that never existed, with a plausible name and a plausible number, gets through.

## Lane one: the parsers, and a text layer that lied

I started with what's free: no model at all. Two rule-based parsers. One built on PyMuPDF word boxes, grouping words into lines by their vertical position and into columns by the gaps between them. The other was pdfplumber's table extraction, which fell back to scanning text lines because neither report draws borders around its tables.

They were absurdly fast. The PyMuPDF layout parser did the whole English report in about 2 milliseconds and got 60.7% of the rows exactly right, pdfplumber 56.2%, with zero GPUs.

On the Spanish report both got zero. That report stacks the value, the unit and the limits vertically under each name, and both parsers assume one line is one row. They were built for one layout, which is exactly the problem I was trying to escape.

But the more interesting failure on that report had nothing to do with parsers.

The Spanish PDF's text layer was broken. On screen it looked perfect. Extracted as text, it had a space between every single character: "P r e s i ó n" instead of "Presión". Every text-based approach started from garbage, and every text reader I tried, from 4B to 26B, scored under 7% strict on that report.

It would have been very easy to conclude the models were bad at Spanish. They weren't. When I compared name and value with the spaces ignored, the same models were recovering up to 96% of the Spanish rows. The input was the problem. If I had trusted the first table, I would have thrown away the best models for the wrong reason.

### Under the hood: detect the letter-spaced layer before you blame the model

```python
# lanes/text_layer.py (pattern, not the real implementation)
import re

SPACED = re.compile(r"(?:\b\w\s){4,}\w\b")   # "P r e s i ó n"

def is_letter_spaced(page_text: str, threshold: float = 0.3) -> bool:
    lines = [l for l in page_text.splitlines() if l.strip()]
    if not lines:
        return False
    spaced = sum(bool(SPACED.search(l)) for l in lines)
    return spaced / len(lines) >= threshold

def join_spaced(line: str) -> str:
    # join single characters separated by single spaces; keep real word gaps
    return re.sub(r"(?<=\S) (?=\S(?:\s|$))", "", line)
```

A check like this costs nothing and turns "the model is bad" into "the input is bad". The fix itself can be a collapse step, a different extractor, or the vision lane, which never reads the text layer at all.

## Lane two: nine local text models

Next, language models reading the extracted text. All of them ran on Ollama on my laptop, a 24 GB MacBook Pro, one call per page, schema-constrained JSON out. Ollama's default quantization unless the tag says otherwise. Everything ran in one day.

English report, 89 rows. Strict %, precision / recall %, invented rows, seconds per page:

| Model (vendor) | Strict | P / R | Invented | s/page |
|---|---|---|---|---|
| gemma4 26B (Google) | 75.3 | 100 / 96.6 | 0 | 13.2 |
| qwen3 14B (Alibaba) | **79.8** | 95.4 / 93.3 | 2 | 18.7 |
| gemma4 12B (Google) | 73.0 | 96.5 / 92.1 | 1 | 19.1 |
| gemma4 26B-A4B, MoE, QAT build (Google) | 73.0 | 95.5 / 94.4 | 1 | 8.2 |
| phi4 14B (Microsoft) | 60.7 | 89.5 / 86.5 | 0 | 28.2 |
| gemma3 12B (Google) | 53.9 | 93.2 / 92.1 | 4 | 20.4 |
| qwen3 30B-A3B, MoE (Alibaba) | 42.7 | 91.2 / 69.7 | 4 | **7.9** |
| community 4B fine-tune of Gemma, Q8 | 31.5 | 70.5 / 69.7 | 13 | 9.7 |
| qwen3.5 9B, as text (Alibaba) | 0 | 0 / 0 | 0 | 12.5 |

Spanish report, 126 rows, name plus value with the spaces ignored (strict is meaningless there):

| Model | P / R | Invented | s/page |
|---|---|---|---|
| gemma4 26B | 96.5 / 86.5 | 4 | 17.0 |
| qwen3 14B | 94.5 / **96.0** | 5 | 37.8 |
| gemma4 12B | 87.0 / 63.5 | 7 | 35.2 |
| gemma4 26B-A4B, MoE | 79.3 / 57.9 | 0 | 12.1 |
| qwen3 30B-A3B, MoE | 87.7 / 45.2 | 2 | 9.5 |
| gemma3 12B | 85.6 / 61.1 | 9 | 34.3 |
| community 4B fine-tune of Gemma | 60.8 / 46.8 | 36 | 13.8 |
| phi4 14B | 30.6 / 30.2 | 12 | 35.5 |

The big dense models were good. gemma4 26B returned 86 English rows and every one of them was right, with nothing invented. qwen3 14B had the best strict score in English and the best recall in Spanish. If accuracy were the only question, I'd have stopped here.

It wasn't. Thirteen to 38 seconds per page means three to nine minutes for one report. phi4 was the extreme: 35.5 seconds per Spanish page on average, almost two minutes on the densest one, and only about 30% of the Spanish rows to show for it.

So I believed the fix was a lighter model. That belief lasted one run.

The mixture-of-experts models only activate part of the network per token, and they flew: about 8 seconds per page. They also dropped pages without telling anyone. qwen3 30B-A3B returned zero rows on 4 English pages and 6 Spanish pages that had data on them, and recovered 45% of the Spanish rows. The gemma4 MoE returned nothing for three Spanish pages. No error, no warning. An empty list, as if the page were blank.

That's the failure I fear most in extraction. Not "I couldn't read this". Incomplete data delivered with a straight face.

The rest of the failure list, because every one of them would bite in production:

- **The densest page stalls models.** On the heaviest Spanish page, gemma4 12B spent 148 seconds and gemma3 12B 109 seconds, and both came back with zero rows. gemma4 26B pulled 32 rows out of the same page in 50.5 seconds.
- **Thinking mode eats the answer.** The gemma4 models returned empty content until I set `think=False`. A hidden reasoning trace of about 2,800 tokens used up the whole output budget, and the response ended with `done_reason == "length"` and nothing in it.
- **A domain fine-tune invents.** The community 4B fine-tune, the one model built for this kind of document, invented 13 rows in English, 7 of them on a page with no data at all, and 36 in Spanish. 37% of what it returned in Spanish never existed.
- **A model that can't do structured output in text mode.** qwen3.5 9B returned zero rows on all 15 English pages as a text model. My hypothesis is a clash between structured output and its thinking mode; I didn't confirm it. The same model works in vision mode.

### Under the hood: the page call, and the flag that made it work

```python
# lanes/text_llm.py (pattern, not the real implementation)
import json, ollama

INSTRUCTIONS = open("prompts/read_page.txt").read()   # copy as printed, [] if none

def read_page(model: str, page_text: str, schema: dict) -> list[dict]:
    resp = ollama.chat(
        model=model,
        messages=[{"role": "system", "content": INSTRUCTIONS},
                  {"role": "user", "content": page_text}],
        format=schema,     # schema-constrained JSON
        think=False,       # without this, gemma4 spent the budget thinking
        options={"temperature": 0},
    )
    if resp.done_reason == "length":
        raise RuntimeError("truncated: output budget used up")  # never return []
    return json.loads(resp.message.content)["rows"]
```

The line I'd copy into any pipeline is the `done_reason` check. A truncated answer that parses as an empty list is how a fast model turns into silent data loss.

## Lane three: four local vision models

If the text layer is the problem, read the picture instead. Same pages, rendered at 150 DPI, sent to local vision models. Schema mode returned empty on some of them, so these used prompt-based JSON.

One caveat first, and I'm putting it here instead of at the end: these vision runs, and the cloud runs in the next section, were hand-run with scripts outside the main harness, on de-identified inputs, and their raw outputs aren't in the benchmark folder. I read them as strong evidence, not a controlled benchmark. They report precision, not recall.

| Model (vendor) | EN precision | EN invented | ES precision | ES invented | s/page |
|---|---|---|---|---|---|
| qwen2.5-VL 7B (Alibaba) | 99% | 0 | 75% | 17 (21%) | ~23 |
| qwen3.5 9B, vision (Alibaba) | 87% | 9 (10%) | 35% | 41 (62%) | 22–41 |
| MiniCPM-V 8B (OpenBMB) | 14% | 51 (72%) | 7% | 35 (52%) | ~11 |
| Llama 3.2 Vision 11B (Meta) | did not load: my Ollama build lacked its architecture | | | | |

qwen2.5-VL was clean on English, 99% precision and nothing invented, while finding about 80% of the rows. On Spanish it collapsed: a fifth of what it returned didn't exist. qwen3.5 in vision mode looked great on one page, and I nearly stopped there; at full scale it invented 62% of its Spanish rows. MiniCPM-V invented most of what it returned in both languages.

That's the dangerous property of vision models in this job. They read what's printed on the page, which is exactly why you want them, and sometimes they read what isn't.

## Lane four: the cloud I didn't want to use

This is where my plan broke.

I had started with one rule: everything local, no cloud. But I needed a ceiling. How good can this get at all? So I ran the same pages through a frontier cloud model, in two modes, on redacted inputs. At work we already use one like it under a zero-retention agreement, and even so, I didn't want raw personal data going anywhere. So everything that went out was redacted first.

| Mode | EN precision | EN invented | ES precision | ES invented | s/page |
|---|---|---|---|---|---|
| Frontier model, text (page text + a hint about the letter spacing) | 94% | low | 98% | low | 9.2 / 14.2 |
| Frontier model, vision (redacted page images) | **100%** | **0** | **99%** | **1** | 9.7 / 12.8 |

Hand-run, as I said, and the times include the network round trip. In vision mode it was right on 99 to 100% of what it returned in both languages, invented one row across two reports, and recovered about 97% of the Spanish rows. Both cloud modes covered both reports in about five and a half minutes each.

It wasn't faster than the fastest local models: 10 to 13 seconds a page against 8 for the MoE models. It was just in a different league on accuracy, and it was faster than every local model that was also accurate: both reports in about a quarter less time than gemma4 26B needed for the same two.

Text mode deserves a footnote. Its prompt carried a hint about the letter spacing that the local models never got, so the comparison isn't clean. Vision mode didn't need the hint; it never sees the text layer.

That morning my goal was "zero bytes to the cloud". By the evening, the question had changed. If a page can be stripped of everything personal before it leaves the machine, the cloud stops being the risk. The unredacted page is the risk. So the work moved from "find a local model good enough" to "make redaction good enough that sending is safe".

My reading on cost, and it's a reading, not a measurement: per document, a hosted call costs me less than keeping a GPU machine sized for a 26B model running for this, and it's done in minutes instead of hours. I didn't measure a bill in this research, so I won't put a number on it.

## The gate: redact locally, fail closed

So redaction stopped being a side concern and became the architecture. A page doesn't reach any cloud model unless it passes a gate that runs entirely on my machine.

The gate has three steps, and the design choice in each one is about failure, not success.

**Detect.** A union of detectors: label rules (a "Name:" label means the next words are a name), patterns (phones, emails, ID numbers, addresses), and Microsoft's Presidio with spaCy language models for person names in English and Spanish. An allow-list wins over every detector, because a redaction that eats the data is useless.

**Redact.** PyMuPDF redaction annotations, then `apply_redactions()`, which removes the text from the page, not just draws a black box over it. Then the page is rendered to a PNG. That image is what may leave.

**Verify, twice, two different ways.** Layer A re-scans the redacted page with the text detectors. Layer B is a local vision model that reads the rendered image and answers one question: is there any personal data left on this page? The second check has to be different from the first. If layer A missed a name because the detector didn't know it, running the same detector again will miss it again.

And the rule that matters: fail closed. Any error, any refusal, any answer the code can't parse, anything that isn't a clean pass blocks the page, and the rendered image is discarded. A verifier that crashes must not look like a verifier that found nothing.

A thing whose job is to catch what you didn't think of gets tested in two directions:

- **Leaks.** A synthetic one-page document with five planted identifiers. If a single one survives, the build fails.
- **Over-redaction.** One page of a real, already de-identified report goes through the gate and must pass, with a known measurement still readable afterwards.

I built the gate with coding agents in a spec-driven loop: written spec, plan, then each task to an implementer agent with tests first, a reviewer agent on every commit, fixes, re-review. From first to last code commit: 1 hour 25 minutes, with a few dozen new tests. The reviews caught three critical problems. The one I remember best: an early version read a refusal from the vision verifier as "nothing found". Fail-open, in the one component whose entire job is failing closed.

Two limits I'm declaring. The PDFs I used were already de-identified, so the gate's recall on raw documents was never measured. And Presidio still tags some measurement labels as person names and some numbers as IDs; I fixed three allow-list defects and left that over-redaction open.

### Under the hood: fail closed is a type, not a habit

```python
# gate/check.py (pattern, not the real implementation)
from pathlib import Path

class HoldPage(Exception):
    """The page stays on this machine."""

def cleared_for_upload(image: Path, text_after: str, rescan, second_reader) -> Path:
    try:
        if rescan(text_after):                     # first check: the redacted text
            raise HoldPage("text still has personal data")
        answer = second_reader(image)              # second check: a different reader
        if answer.strip().lower() != "clean":      # refusal, "maybe", junk: all hold
            raise HoldPage(f"reader said {answer!r}")
        return image                               # the only way out
    except Exception:
        image.unlink(missing_ok=True)              # nothing left to send by accident
        raise HoldPage("not cleared") from None
```

The only path that returns an image is the one where both checks said so explicitly. Everything else, including bugs I haven't written yet, raises with the file gone.

## The scoreboard

Two reports (EN 15 pages / 89 rows, ES 14 pages / 126 rows), one day, a 24 GB MacBook Pro, one run per configuration.

- Rule-based parsers, EN strict: 60.7% (PyMuPDF layout) and 56.2% (pdfplumber), in milliseconds.
- Rule-based parsers, ES strict: 0% for both (stacked layout).
- Every text reader, ES strict: under 7%, caused by the letter-spaced text layer.
- Best local text model, EN strict: 79.8% (qwen3 14B, 18.7 s/page).
- Most precise local text model, EN: 86 of 86 returned rows correct, 0 invented (gemma4 26B, 13.2 s/page).
- Best local recall, ES: 96.0% (qwen3 14B, 37.8 s/page).
- Fastest local text model: 7.9 s/page (qwen3 30B-A3B), with 10 pages returned empty that had data.
- Most invented rows, local text: 36 of 97 returned in ES (community 4B fine-tune).
- Best local vision model, EN: 99% precision, 0 invented; ES: 21% invented (qwen2.5-VL 7B, hand-run).
- Frontier cloud model, vision, on redacted pages: 100% / 99% precision, 1 invented row across both reports, 10–13 s/page with network (hand-run).
- Redaction gate: 5 of 5 planted identifiers must be caught or the build fails; built in 1 h 25 min with coding agents; recall on raw documents not measured.
- Count: 15 extractors = 2 parsers + 13 models; qwen3.5 9B and the frontier model each ran in two modes.

## My takeaway

My reading: there is no best extractor. Every lane I tested was the best one at something and broke on something else, and the parsers broke on a layout, the text models on a broken text layer, the fast models on completeness and the vision models on honesty.

What decided the architecture wasn't which model reads best. It was what each step is allowed to see. The page with personal data stays on my machine, and on my machine the job is redaction, done by rules and small models and checked twice. The page that's safe to send can go to the model that reads best. That split cost me my starting rule, everything local, and it was the right trade.

So the first number I read now is invented rows, then accuracy.

Limits, declared. Two documents, one per language, so this is direction, not a leaderboard. The cloud and local vision numbers were hand-run and report precision only. The reference was built from page images, which may favor vision readers. And the judge I started with, the one that compares lanes and decides, was designed but never built in this research. I stopped there.

Part two is what happened when I picked it up again: a model built for exactly that kind of decision, nine others like it, and a bug the benchmark found in my own code before it ranked a single judge.

## Run it yourself

The companion repo, `extraction-lanes-demo`, rebuilds the pattern on an example domain: calibration certificates for industrial instruments, in English and Spanish, with a stacked layout, wrapped names and a text layer broken on purpose (it renders fine and extracts wrong). This is example code: it shows the pattern I used, not the production implementation. The numbers it prints come from its own example corpus, not from the work described above.

What it demonstrates:

- Three lanes behind one interface (layout parser, local text model, local vision model) and a scorer that reports strict, precision, recall, invented rows (the repo calls them phantom rows) and empty pages. The layout lane fails on two of the three example certificates, on purpose.
- A broken text layer and a check that names it, so the bench blames the input instead of the lane.
- A fail-closed redaction gate, with a planted-identifier test that fails the build on a single miss.

```bash
make install
make corpus          # generates the example PDFs and their reference CSVs
make test            # offline, no models needed
make bench-lanes     # needs Ollama; TEXT_MODEL / VISION_MODEL to change models
make gate-demo
```
