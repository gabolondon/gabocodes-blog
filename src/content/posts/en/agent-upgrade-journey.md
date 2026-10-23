---
title: "Upgrading an LLM agent in production: speed was the goal, then the benchmark that changed the plan"
description: "I was asked to make an AI agent faster. The speed work was the easy half; building a benchmark with an LLM judge to know whether faster answers were still right was the half that changed the agent: 37 to 57 correct answers out of 61. With runnable example code."
problem: "A faster agent, but is it still answering well?"
tags: [llm-agents, benchmarking, llm-as-judge, caching, latency, langgraph, fastapi, security]
date: 2026-10-23
lang: en
i18n_key: agent-upgrade-journey
stack: [LangGraph, FastAPI, nginx, Docker Compose]
result: "37 → 57 of 61 correct answers"
repo_url: https://github.com/gabolondon/agent-upgrade-demo
terminal:
  - {text: "$ make bench", tone: cmd}
  - {text: "v1  p95 31.5 s  timeouts 2/20  sources 0/20", tone: bad}
  - {text: "v2  p95 12.0 s  timeouts 0/20  sources 7/20", tone: ok}
  - {text: "$ make demo-open", tone: cmd}
  - {text: "POST /dev-console/ask -> HTTP 200", tone: bad}
  - {text: "$ make demo-fixed", tone: cmd}
  - {text: "POST /dev-console/ask -> HTTP 403", tone: ok}
featured: true
---
The request was simple: make the agent faster. Some answers took almost three minutes. So I cached, streamed and cut the hops between models, and the waits came down.

The same week, I asked the question nobody had asked: faster, but is it still answering well? The only check was a person reading yesterday's answers, and automating it exposed what speed alone never would.

At the health-AI startup where I work, I own an AI assistant in our product. I can't show you that one, so the examples below use a personal-finance portfolio assistant. This is example code: it shows the pattern I used, not the production implementation. The numbers in the scoreboard come from the real system, and they are ratios and latencies only. The repo is at the end, and every snippet in this post is in it.

The story has two halves. The first one is speed, and it went roughly the way I expected. The second one is the benchmark, and it did not.

## Half one: speed

I believed the answers were fine and just slow. Measured, the slowness had two faces. The everyday answer took about 17 seconds at the median, which is long but tolerable. The tail was the real pain: a handful of questions that pulled a long history took 170 seconds, hit the client timeout or came back as a server error. And every chat opened with a report the agent wrote from scratch, 22 to 38 seconds of a user staring at nothing.

So the first half was plumbing. Four changes, all aimed at the time between "send" and "something useful on screen".

**Fewer hops.** The old agent was a small team: sub-agents fetched the data and summarized it before the agent that answered ever saw it. I had assumed they were saving it work. Measured, every hop cost a model call and lost detail, because the answer was written from summaries of the data, not the data. I flattened it: a small, fast model decides whether the question needs data at all, and one agent with the data tools wired in directly does the rest. Two fewer model calls on every question that needs a metric.

**A model per role.** Deciding "does this need the portfolio" is a cheap question. It does not need the big model. The triage runs on a small one; only the answer uses the large one.

**Streaming.** The old flow showed nothing until the writer finished. The new one streams typed events: a short status line while it works ("Checking your holdings"), then the answer word by word. Streaming does not make the total shorter. It makes the wait visible, and the screen changed with it: a rolling status strip instead of one frozen label.

**A cache for the opening report.** The data behind that report had barely changed since the user's last visit. Writing it from scratch on every open was paying for the same text again and again.

That last one is the interesting one, because the cache lied.

### Under the hood: the cache that lied

*Skip these `Under the hood` sections if you lead a team; the story reads without them.*

The idea is a content-addressed cache. Take everything the report depends on, compute a fingerprint (a hash) of it, and use that as the key. Same inputs: same report, served from storage in milliseconds. Change any input and the key changes, so a stale report can never be served.

The first version never hit. Same user, same data, a different fingerprint every time. The data layer returned rows in no stable order, so the same facts serialized to different bytes: **25 identical requests, 25 distinct payloads.** My first fix, a partial sort, was worse than none. The fix that worked was to stop hashing what the API sends and hash a normalized form of it instead.

In the example repo, the portfolio API misbehaves on purpose the same way: it shuffles rows, stamps every row with per-request noise, and lets floats wobble in the last digits. This is the normalizer the cache hashes:

```python
# agent_v2/fingerprint.py (pattern, not the real implementation)
FLOAT_DIGITS = 6
VOLATILE_KEYS = {"retrieved_on", "trace_id"}

def _normalise(obj: Any) -> Any:
    if isinstance(obj, bool) or obj is None or isinstance(obj, str | int):
        return obj
    if isinstance(obj, float):
        r = round(obj, FLOAT_DIGITS)
        return 0.0 if r == 0 else (int(r) if r == int(r) else r)
    if isinstance(obj, dict):
        return {
            str(k): _normalise(v)
            for k, v in sorted(obj.items(), key=lambda kv: str(kv[0]))
            if k not in VOLATILE_KEYS
        }
    if isinstance(obj, list | tuple):
        items = [_normalise(v) for v in obj]
        return sorted(items, key=lambda v: json.dumps(v, sort_keys=True, separators=(",", ":")))
    raise TypeError(f"cannot normalise {type(obj).__name__}")
```

Sorted keys, sorted rows, rounded floats, volatile fields dropped. After that: 25 runs, one payload.

Order was not the only way it lied. The rest were the same family: the cache answering when it should not have, or not answering when it should. Each got a fix and a regression test.

One more thing a cache in front of a slow model needs: when two callers ask for the same report at the same moment, only one of them should pay for it. The other waits for that result instead of starting its own:

```python
# agent_v2/cache.py (pattern, not the real implementation)
async def get_or_compute(
    self, key: str, compute: Callable[[], Awaitable[str]]
) -> tuple[str, bool]:
    """Return (value, cached). Concurrent callers for one key compute only once."""
    hit = self.get(key)
    if hit is not None:
        return hit, True
    lock = self.locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = self.get(key)
        if hit is not None:
            return hit, True
        value = await compute()  # an exception here propagates: nothing is stored
        ...
```

Result on the real system: 22.4 to 38.5 seconds fresh, 1.9 to 2.3 seconds cached, word for word identical in 11 of 11 conversations.

## The door I found open

While I was moving that cache from memory into a database, I deployed to staging to compare before and after. I knew the service's URL, so I opened it in a browser.

It let me in. No login, nothing.

I believed that service could only be reached by our own backend, the one the frontend talks to. That was the configuration everyone read. It was not the configuration that ran. The deployment had two access rules: the restrictive one, and an older "allow everyone" rule from the service's early testing days that nobody had removed from the deployment script. When both exist, the open one wins.

Nothing leaked. Personal and internal data sat behind further layers of authentication that this door did not open, and I went through the logs to confirm that nothing outside our own traffic had touched it. But some endpoints behind that door reached the LLM directly. Anyone with the URL could have pointed a bot at them and run up the bill. It was closed everywhere, and it stayed closed.

The real stack is not mine to describe. The class of bug is, and it is common enough to be worth reproducing.

### Under the hood: compose says closed, the script opens it

The example repo has three services on a private network: a `web-gateway` that the client talks to (it requires a token), the `advisor` (the agent), and an `edge` (nginx) in front of the advisor. Read the compose file and the intent is clear:

```yaml
# deploy/docker-compose.yml (pattern, not the real implementation)
  edge:
    image: nginx:1.27-alpine
    entrypoint: ["/bin/sh", "/start-edge.sh"]
    volumes:
      - ./edge/start-edge.sh:/start-edge.sh:ro
    environment:
      EDGE_ACCESS: internal   # the intent: only the backplane may call the advisor
      UPSTREAM: advisor:8102
      INTERNAL_CIDR: 10.77.0.0/24
```

Internal only. But the container does not run that intent; it runs a start script that renders the nginx rules from the environment, and the script still carries a block from early testing. It is on by default, it logs nothing, and nothing in the compose file mentions it:

```sh
# deploy/edge/start-edge.sh (pattern, not the real implementation)
RULES=""

# temporary: open for early testing
if [ "${OPEN_DEBUG:-1}" = "1" ]; then
  RULES="${RULES}    allow all;
"
fi

if [ "${EDGE_ACCESS:-}" = "internal" ]; then
  RULES="${RULES}    allow ${INTERNAL_CIDR};
    deny all;
"
fi
```

nginx evaluates `allow` and `deny` in order and stops at the first match. `allow all;` comes first, so the internal-only rule never gets a vote. `docker compose config` shows a closed service; the rendered `advisor.conf` shows an open one.

The advisor also has an endpoint left on from local development that calls the model directly, with no session and no token. `make demo-open` calls it three times from your own machine, outside the private network:

```text
POST /dev-console/ask -> HTTP 200
POST /dev-console/ask -> HTTP 200
POST /dev-console/ask -> HTTP 200
{"calls":3,"est_cost_usd":0.006} -> HTTP 200
```

Three calls, six-tenths of a cent at an illustrative price. A bot does not stop at three. `make demo-fixed` removes the legacy block and turns the console off: the same calls get `403`, and the gateway, from inside the network, still gets `200`.

Building the demo taught me the same lesson a second time. My first "fixed" version still let my laptop in. Docker had attached the published port to the private network, so nginx saw my machine as `10.77.0.1`, inside the allowed range. Where the firewall thinks you are calling from matters as much as the rule. The fix was to mark the private network `internal`, so published traffic can only arrive through the public one.

The rule I took from it: test access from the outside, as a stranger, after every deploy. A rule you read is a claim. A request from outside is a measurement.

## The question nobody had asked

With the speed work under way, I asked myself whether the faster answers were still right, and I had no way to answer.

The way we checked quality was people. The domain experts on the team would read the agent's answers and tell me, usually the next day, which ones were wrong. That loop was slow, impossible to repeat on demand, and easy to skip when everyone was busy. It could not tell me whether a change I made this afternoon broke something, and it certainly could not compare two whole versions of the product.

Speed was the goal. Measuring was the job nobody had automated.

## Half two: the benchmark

### Three generations of "is this answer good"

This was not the first attempt, and the earlier ones explain the design.

1. **By hand.** Experts reading answers against what they knew a good answer should say. Accurate, slow, unrepeatable.
2. **A first, simpler checker.** Months earlier I had written a script that played scripted conversations against the agent, ran simple deterministic checks and asked an LLM for a verdict on each answer. Its flaw was structural: the judge graded blind. It saw the answer but not the data behind it, so a correct figure it could not check looked the same as an invented one. Its verdicts could not be compared across runs either.
3. **The rebuild.** Same skeleton, new judge. It sees what it needs to verify an answer, explains every verdict, and every run is stored, so two runs or two environments can be compared.

The first version of the rebuild took an afternoon: six commits in forty minutes, with an AI coding agent doing the typing.

### Turning expert knowledge into rules a judge can check

The experts already had their expectations written down, as prose. That turned out to be the right format. An LLM judge can read a plain-English rule ("states the date the prices are from") and check an answer against it. A regex cannot.

So scenarios became data files, not code, with the rules attached to each question.

Then the questions. I did not want only my questions; I wanted the ones the people who know the domain, the product and the customers would ask. I rewrote the benchmark's guide without the technical words, with a worked example of how to add a question, and asked the whole company for questions from every point of view. Answers came back in a shared spreadsheet. I checked the sheet against the repo. Then I brought every rule down to one wording, because the sheet held several versions of the same rule.

This is where the days went. Not in code. In other people's calendars, and in getting many ways of saying the same thing down to one.

### Making the judge trustworthy

A judge you do not trust is worse than no judge, because it makes noise look like data. Tuning mine taught me two things worth stealing.

**Give the judge the evidence, or do not ask it about evidence.** A judge that sees only the question and the answer cannot tell an invented number from a real one it was never shown. Picture an answer that says a fund charges 0.4% a year. The figure is in the factsheet the agent fetched. A judge without the factsheet calls it made up. Pass the judge whatever the answer was built from.

**When a rule fails everywhere, suspect the rule.** Before you blame the agent, run the same rule against the old version. If it fails on both, at the same rate, it is measuring something neither version controls: the test data, the environment, the wording of the rule. I had one like that. I swapped it for a plain check and said so in the report, so the score did not hide the swap.

Two more decisions made the verdicts stable. Anything a program can check (is the output empty, is it well-formed) moved out of the judge and into plain code. And because the agent is not deterministic and neither is the judge, benchmark runs sample the judge three times per answer and take the majority.

### Under the hood: rules as data, and a judge that votes

A scenario in the example repo is a YAML file: a conversation, its questions, and the rules each answer must meet. This one carries an example rule for the example domain:

```yaml
# bench/scenarios.yaml (pattern, not the real implementation)
rules:
  lists_holdings: "names at least two of the instruments the client holds"

conversations:
  - id: healthy-portfolio
    account_id: c1
    questions:
      - q: "What do I currently hold?"
        rules: [lists_holdings]
```

The judge is sampled an odd number of times per answer. The verdict on each rule is the majority, and the grade is the median, so one noisy sample cannot flip a result:

```python
# bench/judge.py (pattern, not the real implementation)
def aggregate(votes: list[dict]) -> dict:
    """Majority vote per rule and median grade. An odd sample count means there is always a majority."""
    n = len(votes)
    if n % 2 == 0:
        raise ValueError("use an odd number of judge samples")
    rule_ids = list(votes[0]["rules"])
    rules = {rid: Counter(v["rules"][rid] for v in votes).most_common(1)[0][0] for rid in rule_ids}
    reasons = [v["reason"] for v in votes]
    return {
        "rules": rules,
        "grade": statistics.median(v["grade"] for v in votes),
        "reason": reasons[len(reasons) // 2],
    }
```

On the calendar, the tuning spread over three days. In hours, it was a few short sessions. The hard part of an LLM judge is not the hours. It is noticing when it is grading blind.

### Production against the release

With a judge I trusted, I ran the same scripted conversations against production and against the release: same judge, same rules, same test user, one run each. Eleven conversations, 61 turns per side. A turn passes only if every rule on it passes; a conversation passes only if every turn does.

Two details kept the comparison honest. The opening report was excluded from every latency figure, because the release served it from the cache and production wrote it fresh; a cache hit is not a better model. And the run was not clean. Partway through, the production side lost its session and the rest of its conversations came back as errors. I re-ran only that slice on a fresh session, merged it, and wrote that down in the report.

What it caught were two different problems. Correctness gaps spread across many questions, and a latency tail that the median never showed.

### Fixing the agent, with the benchmark as the referee

Not every fix came from the benchmark, and I want to be precise about which did. The flattening was latency work and happened in the first half, before the benchmark ever ran against a test environment. These came after it:

- **Small, targeted prompt changes.** The loop was mechanical: run the suite, group the failed rules, change the prompt for that group, add a unit test for the behavior, run the suite again. I had the agent recommend first, without touching code, decided rule by rule, and only then built.
- **Missing citations.** In some answers the agent produced no clickable sources at all. Two parts of the system disagreed on how a source should be written down, and each one passed its own tests. I found it reading a recorded log, not in a score.
- **Bounded history and a compact response.** A data tool returned a user's whole history on every call, repeating every field name on every row. My first guess was to cap the rows. The real cost was the format. The fix was a bounded range and a response that does not repeat the field names on every row.

- **Errors that looked like data.** A helper handed the model an error response shaped like a normal result, and the model read it as a fact about the portfolio. The fix: every tool result now says whether the call worked, so a broken tool never reads as an empty account.

The release carried all of these together, so the comparison measures the bundle. It cannot tell you which change bought which point. In the example repo every change is a flag, so you can measure each one there.

## The scoreboard

Real system, production against the release, one run per side:

- Correct turns: 37 of 61 → 57 of 61.
- Conversations fully passing: 0 of 11 → 8 of 11.
- Failed rules: 31, over 24 questions → 5, over 4 questions.
- Answers with clickable sources: 14 of 50 → 39 of 50.
- Tail: one answer at 170 s, one client timeout, one server error → those three questions answered in 22 to 28 s; slowest release answer 35 s.
- Answer latency, p95: 46.3 s → 30.7 s. Median roughly flat, 17 s → 20 s.
- Opening report: 22.4 to 38.5 s fresh → 1.9 to 2.3 s cached, identical in 11 of 11.

Four questions still fail, and all four failed in production too. None of them is about safety or wrong data; they are answers that miss one required element. One run per side is one sample: a 20-turn gap is far above the noise I saw elsewhere, but it is still one run. And the cause of the tail is my best reading, not a measurement: there was no per-step timing to prove it. The best fit is a question that pulled a long history through a verbose response, which is exactly what the compact response fixed.

## My takeaway

The median barely moved. The tail and the correctness did, and I would not have seen either one without the benchmark. The numbers killed the idea I started with, that this was a speed job.

My reading: measure before you optimize, and build the measurement first even when nobody asked for it. It is slower and less fun than the plumbing. The code was an afternoon; the trust took days of other people's time and a judge I had to keep catching out.

If I did it again, the benchmark would also knock on the door from outside. A suite that checks whether answers are right should check, on every deploy, that a stranger without credentials gets nothing. The example repo does.

## Run it yourself

The companion repo, `agent-upgrade-demo`, is example code: it shows the patterns I used, not the production implementation. Python, FastAPI, LangGraph, and any OpenAI-compatible model: a deterministic fake model by default, so everything runs offline with no key; OpenRouter or a local Ollama when you want real answers. I ran it through OpenRouter with `deepseek/deepseek-v4.1-flash-1017` answering and judging, and `openai/gpt-oss-120b` doing the triage.

- `make api`, then `make serve-v1` and `make serve-v2`: the example portfolio API, the slow agent (planner, specialists, writer) and the upgraded one (triage, one agent with direct tools, cache, compact payload, streaming).
- `make chat AGENT=v1` against `make chat`: feel the difference. Delete `.cache/reports.sqlite` to watch the opening report go slow again, then fast.
- `make bench` and `make compare`: the benchmark with the 3-sample judge, v1 against v2.
- Every improvement is a flag you can switch off: `make bench AGENT=v2 FLAGS="COMPACT=0"`, `"DIRECT_TOOLS=0"`, `"MODEL_PER_ROLE=0"`, `"STREAMING=0"`, `"CACHE=0"`. That is the measurement the real release could not give me: what each layer bought on its own.
- `make demo-open`, `make demo-fixed`, `make demo-down`: the open door, with Docker. `bench security` checks it offline.

What it measured on my laptop, one run each, so read the latencies as a direction, not a law:

| | v1 (slow) | v2 (upgraded) |
|---|---|---|
| Answer latency, p50 | 8.6 s | 6.1 s |
| Answer latency, p95 | 31.5 s | 12.0 s |
| Timeouts | 2 of 20 | 0 of 20 |
| Opening report, first time | 12.4 s | 5.6 s |
| Opening report, reopened | 22.9 s | 0.27 s |
| First thing on screen | 8.6 s | under 0.01 s |
| Answers with titled sources | 0 of 20 | 7 of 20 |
| Correct answers (judge) | 11 of 20 | 12 of 20 |

Switching flags off one at a time told the expected story where the effect is large: with `DIRECT_TOOLS=0` the p95 went back to 24.9 s, with `CACHE=0` reopening the report took 4.7 s again, and with `STREAMING=0` the first thing on screen took 3.4 s. The smaller flags were inside the noise of a single run.

Two honest limits. First, the example repo reproduces the speed half of this story, not the quality half: correctness is about the same for both versions, because the rules and prompts that moved the real numbers are exactly what I cannot publish. Second, the same model answers and judges here, which flatters the answers; use a different judge model if you want to trust the grades.

And the example repo's own judge reproduced the lesson of this post on its first real run. One reply said the answer named four holdings, more than the rule asked for, and still recorded the rule as failed. The parser expected one line format and the model wrote another, so every unparsed verdict counted as a failure. Fixing the parser moved v1 from 3 to 11 correct out of 20. The repo now keeps each judge's raw reply next to its verdict, and `bench rejudge` re-grades stored answers without running the agents again.
