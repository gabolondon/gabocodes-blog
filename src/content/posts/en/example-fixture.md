---
title: 'Letting a bakery assistant take orders without double-booking the oven'
description: 'An example post for the blog fixture: a bakery order assistant that promised more loaves than the oven could bake, and the check that stopped it.'
problem: 'a chat assistant that can promise what the oven cannot bake'
tags: ['llm-agents', 'evals']
date: 2026-10-01
lang: en
i18n_key: example-fixture
stack: ['Python', 'FastAPI', 'LLM-as-judge']
result: '9 → 18 / 20 orders correct'
repo_url: 'https://github.com/example/example-repo'
terminal:
  - { text: '$ make bench', tone: cmd }
  - { text: 'v1  correct 9/20   overbooked 7', tone: bad }
  - { text: 'v2  correct 18/20  overbooked 0', tone: ok }
  - { text: '$ make demo-open', tone: cmd }
  - { text: 'POST /orders  200  # no capacity check', tone: dim }
  - { text: '$ make demo-fixed', tone: cmd }
  - { text: 'POST /orders  409  # oven is full', tone: ok }
featured: false
---

The bakery's order assistant was friendly, fast and wrong in one specific way: it said yes to everything. A customer asked for forty croissants for Saturday morning, the assistant confirmed, and the oven could bake thirty.

This post walks through how I found the failure, what I changed, and how I knew the change worked. Everything runs on an example bakery, so you can clone it and watch each step.

## The failure nobody saw

The assistant read the menu, the stock and the customer's message, and answered in natural language. It never touched the oven schedule, so it could not know the slot was full.

The first fix is the one most people reach for: tell the model about capacity in the prompt. It helped for a day. Then a long conversation pushed the capacity note out of the useful part of the context.

### Under the hood: the capacity check as code

The model proposes an order; plain code decides whether the oven can take it. The model never gets to say yes on its own.

```python title="orders/capacity.py"
def accept(order, schedule):
    slot = schedule.slot(order.pickup)
    if slot.used + order.units > slot.capacity:
        return Rejection(reason="oven is full", free=slot.capacity - slot.used)
    slot.used += order.units
    return Acceptance(order)
```

The rejection carries the free capacity, so the assistant can offer the closest slot instead of a flat no.

```python title="orders/offer.py"
def alternatives(order, schedule, n=2):
    slots = schedule.slots_with_room(order.units)
    return sorted(slots, key=lambda s: abs(s.start - order.pickup))[:n]
```

## Knowing it was fixed

A demo that works once proves nothing. I wrote twenty example conversations, each with a known right answer, and had a second model grade the assistant's replies against the schedule.

A judge only works if it sees the evidence. Mine got the schedule and the order along with the reply, and graded each rule on its own: capacity respected, alternative offered, price correct.

### Under the hood: a judge that votes

The judge is not deterministic either, so every reply is graded three times and the majority wins. Anything a program can check never goes to the judge.

```python title="bench/judge.py"
async def vote(reply, evidence, rules, n=3):
    verdicts = [await judge(reply, evidence, rules) for _ in range(n)]
    return {r: majority(v[r] for v in verdicts) for r in rules}
```

## The scoreboard

| Metric | Before | After |
|---|---|---|
| Correct orders | 9 / 20 | **18 / 20** |
| Overbooked slots | 7 | **0** |
| Replies with an alternative offered | 2 / 7 | **7 / 7** |
| Reply latency, p95 | 4.1 s | **3.2 s** |

One run per side, on the example schedule. The point is the shape of the change, not the exact numbers.

## What I would do again

Put the rule that must never break in code, and let the model do the talking around it. Then build the grader before you celebrate, because a green demo is not a measurement.

## Run it yourself

The example repo has both versions of the assistant and the benchmark.

```sh
git clone https://github.com/example/example-repo
make demo-open
make demo-fixed
make bench
```
