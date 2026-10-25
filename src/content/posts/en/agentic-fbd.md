---
title: "Reading an agent's plan like a PLC program: building agentic-fbd, function block diagrams for Claude Code"
description: "Agent plans are long, and the gap between what the agent means and what I mean is where my bugs come from. So I went back to the language I programmed PLCs in at a hydroelectric plant and built an open-source Claude Code skill that turns logic into function block diagrams, both ways."
problem: "How do I keep the mental model of code an agent writes for me?"
tags: [claude-code, coding-agents, function-block-diagram, developer-tools, open-source, typescript]
date: 2026-10-24
lang: en
i18n_key: agentic-fbd
stack: [Claude Code, TypeScript, React Flow, elkjs, JSON Schema, Ajv, Vitest]
result: "60 commits to v0.3.0 in six days; the first real diagram went from 26 flags to 4"
repo_url: https://github.com/gabolondon/agentic-fbd
repo_kind: project
terminal:
  - {text: "$ node dist/cli.mjs validate other-free-text.logic.json", tone: cmd}
  - {text: "ok   other-free-text.logic.json: no issues", tone: ok}
  - {text: "$ node dist/cli.mjs validate bare-number.logic.json", tone: cmd}
  - {text: "ok   bare-number.logic.json: 1 warning", tone: dim}
  - {text: "warning [type-meaning] ... fits by shape but the types differ in meaning: number -> OptionId?", tone: bad}
featured: false
---
The questionnaire had looked simple on the ticket. It had several steps, some questions had sub-questions, and some of those only appeared depending on what you answered above them. I was turning it from one long form into an interactive, step-by-step version with Claude Code, and we went around in circles for far too long.

I knew that codebase well. I had written most of it by hand, back when the assistants I had were good at completing a line and not much more. Claude knew the new questionnaire well, because Claude had written it. Neither of us knew the other half. Part of the state lived in other places in the app, so every time I asked for a change, Claude built what it thought made sense and lost track of state somewhere else in the code. Conditional questions showed up when they shouldn't, answers ended up in the wrong place, and fixing one path broke another. I had assumed TypeScript and enough context in the prompt would keep us aligned: the types gave Claude the shape of the data, and I pasted in the rest. I got there in the end, but it cost far more time and tokens than it should have.

What stayed with me wasn't the bug. It was that I couldn't see what Claude was about to build, and Claude couldn't see what I had already built. For the last two weeks I've been thinking about the tool I wished I'd had then, sketching versions of it, and today the one I liked best is open source. It came out of a language I hadn't used in years.

This post is how it works and how it got built: the format, the type check that would have caught my bug, the viewer, how a diagram becomes the basis of a plan, what I got wrong along the way, and the bug it did catch on that same questionnaire. The repo is public, and the code below is the real thing.

## The plan I couldn't read

When you work in plan mode, Claude Code writes you a plan before it touches anything. It's a good habit and I use it every day. The problem is the plan itself: it's long, it's prose, and the logic is spread across paragraphs. Reading it properly is tedious, so under time pressure you skim it, approve it, and check the result by trying the input and looking at the output. That's how bugs get in, and it's how I got in trouble with the questionnaire.

When I sat down to write the problem out, I found three gaps:

1. **Plans ignore the logic that's already there.** The code works for today's request, and the next feature brings the integration bugs.
2. **I lose the mental model.** The app runs, but extending it, debugging it or even verifying it now depends on the agent.
3. **Review collapses to input and output.** I check that the output looks right and move on without understanding what's in between.

Reading all the code would fix all three, but it's slow. What I wanted was a translator. My intent turned into something precise the agent can plan from, and the agent's intent turned into something I can read in a minute.

My first attempt was the obvious one: ask Claude to draw diagrams while planning. Flowcharts, sequence diagrams, whatever fit. It helped a little. But a diagram drawn as an illustration has no room for the data. It shows boxes and arrows, not what travels on the arrows, where the state lives, or which piece of code each box is. And I couldn't write on it. It was a picture of a plan, and a picture can't take a correction back to the agent.

## A language I already knew

Years ago I worked in control and automation at a hydroelectric plant. A lot of that work was programming PLCs, and a lot of the PLC programming was in function block diagrams: FBD, one of the IEC 61131-3 languages. If you've never seen one, picture a schematic where every block is a function with typed inputs on the left and typed outputs on the right, and wires carry values between them. You read the flow left to right. When a block is itself a whole program, you double-click it and you're one layer down.

I remembered how easy it was to understand logic that way. You don't need much text. The types on the wires tell you what moves, the blocks tell you what happens, and the layers keep each sheet small. An engineer can read a sheet at a glance and point at the wire that's wrong.

That's the abstraction I wanted between me and Claude Code. I'd been sketching versions of the idea for a while; on a Saturday evening, October 17, I dictated the one I liked best into a Claude Code session, with the questionnaire as the first case. The first commit landed the next day.

### Under the hood: one JSON file, no coordinates

*Skip the "Under the hood" sections if you lead a team; the story reads without them.*

The diagram is a single JSON file per subject, `logic/<subject-id>.logic.json`, in the repo you're working on. Claude writes it, a CLI validates it, and a local viewer draws it. The top-level shape is small: a `subject`, named `types`, reusable `blockTypes`, `nodes`, `wires` and `risks`. Nodes come in nine kinds: trigger, function, state, decision, external, result, group, instance and pin.

Two decisions shaped everything else.

**No coordinates.** The agent never writes a position. Layout is computed in the viewer with elkjs, level by level. If I drag blocks around by hand, those positions go to a side file, `<subject-id>.layout.json`, that the agent is told never to write. Positions are tokens the agent would spend for nothing, and they're the first thing to go stale.

**Types are named by meaning.** A wire doesn't carry `number`, it carries `OptionId`. This is the part that comes straight from the questionnaire. Here's a trimmed piece of the design example that ships with the skill, for an "Other" option with free text added to a list:

```json
"types": {
  "OptionId": "number",
  "Answer": { "oneOf": [
    { "kind": "'option'", "optionId": "OptionId" },
    { "kind": "'text'",   "text": "string" } ] }
},
"blockTypes": {
  "OtherOption": {
    "label": "Other option",
    "inputs":  { "selected": "OptionId?", "text": "string?" },
    "outputs": { "answer": "Answer" },
    "change": "new"
  }
}
```

`OtherOption` is a reusable block. Every step that needs an "Other" field is an `instance` of it, so when the block type changes, every instance shows up as affected, even four levels down the question tree.

## The bug that became the first example

Back to the questionnaire, because the tool's first worked example comes from it. The questionnaire stored the options you picked by numeric id. Later, an "Other" option with free text was added. When someone typed a number into that free text (an age, a year), the code read it as an option id and saved the wrong answer. The same pattern lived in many steps, at different depths of the question tree, which is why it was hard to find.

In TypeScript, both of those values are a `number`. The compiler is happy. The shape fits and the meaning is wrong, and no amount of structural typing will tell you.

So the type check in agentic-fbd is nominal. If two names match, the wire is fine. If they differ, it still compares the shapes underneath, but a match gets demoted to a warning: it fits by shape, it means something else. Only a shape that can't fit at all is an error. And anything the checker can't resolve stays neutral. The design spec calls that rule "no false reds": if the tool cries wolf, you stop looking at the colors.

### Under the hood: the nominal check

This is the core of it, from `packages/core/src/types/compat.ts`:

```ts
// Names are nominal.
if (s.k === 'name' && t.k === 'name') {
  if (s.name === t.name) return 'ok';
  const rs = env.resolve(s.name);
  const rt = env.resolve(t.name);
  if (!rs || !rt) return 'unknown';
  return demote(check(rs, rt, env, next));
}
if (s.k === 'name') {
  const rs = env.resolve(s.name);
  return rs ? demote(check(rs, t, env, next)) : 'unknown';
}
```

`demote` turns an `ok` into a `warning`. There are four results (ok, warning, error, unknown), and the viewer paints the wires grey, amber, red, or leaves them neutral. Type expressions are parsed by a small hand-written parser: primitives, names, literals, `T[]`, `T?`, `Record<K,V>`, objects and tagged unions. Anything it can't parse becomes `unknown`, never red.

The validator runs in two passes. First the JSON Schema (Ajv; the same schema file is the skill's format reference, so there's one source of truth). Only if the shape is sound does it run the integrity checks a schema can't express: dangling references, duplicate ids, cycles in the group tree, a block type that contains itself, pins that don't match their block type, and the wire types. The messages are written so Claude can fix them on its own.

To see the questionnaire bug in the validator, I took a copy of the bundled example and changed the trigger's output from `OptionId` to a bare `number`:

```text
$ node dist/cli.mjs validate bare-number.logic.json
ok   bare-number.logic.json: 1 warning
  warning [type-meaning] wire "w1" (...) fits by shape but the types differ in meaning: number -> OptionId?
```

Exit code 0: a warning doesn't fail validation, it asks you to look. Change the same output to `string` and you get `error [type-mismatch]` and exit code 1. One honest note: the tool didn't exist when I first fought that bug. This is the wire it would have flagged. It got its chance later, on the same questionnaire, and I'll come back to that.

## The first night

The design spec, a throwaway UI prototype and an implementation plan were committed on October 18. I'd asked for sketches before any real code, and not as chat artifacts: a static prototype I could click. Once that looked like what I had in my head (JSON blueprints written by Claude, a React Flow viewer to read them), the rest landed in the same night's commits: the format and its JSON Schema, the type parser and the nominal check, the validator and the `validate` command, the view model, the ELK layout, the React Flow viewer with layers, Before/After and risks, the `open` command with live reload, and the skill itself.

I also wrote down the anti-goals with numbers, because a tool like this dies from ceremony. If drawing the diagram costs more than it saves, nobody uses it. The skill file should be around 200 lines (it's 178 today). A medium subject should fit in about 25 blocks per level. The first diagram should come from one focused pass over the code, not a repo crawl. A cluttered first view counts as a failure even if it's technically correct. And mapping a whole repo in one go is a non-goal.

There's one rule I'm glad I added that night: when to use the skill at all. If I explicitly ask for a diagram, it runs. If I'm designing something with non-trivial logic and didn't ask, Claude offers it in one line and waits. For simple tasks it stays out of the way. Some tasks don't deserve a diagram.

### Under the hood: layers on demand

A diagram starts at the top: triggers, one group per system or stage, results. Five to twelve blocks per level. Sub-areas stay as groups marked `explored: false`, with declared inputs and outputs so wires can reach them, and nothing inside. When I want to know more about one of them, I double-click it in the viewer and get a request ready to paste, built in `SidePanel.tsx`:

```ts
const request = `Explain "${node.label}" (${id}) in ${filePath}`;
```

Claude then reads only that group's code, adds its children, rewires the wires that ended on the group's ports to the real children, and drops `explored`, so I pay for depth only where I ask for it.

On the viewer side, the view model opens child groups breadth-first while the visible count stays within a budget of 25 blocks. Groups that don't fit, and every unexplored group, are drawn as closed boxes:

```ts
const open = new Set<string>();
const top = kids(resolved.rootGroup);
let count = top.length;
const queue = top.filter(canOpen);
while (queue.length) {
  const g = queue.shift()!;
  const children = kids(g.id);
  if (count - 1 + children.length > NODE_BUDGET) continue;
  count += children.length - 1;
  open.add(g.id);
  queue.push(...children.filter(canOpen));
}
```

The whole view model is a pure function of the document, the path you're looking at and the Before/After toggle. That makes it easy to test, which matters when the input is written by an agent.

## The first real diagram was unreadable

The next day I pointed it at a real subject from work, the kind the tool was for. The diagram came back valid. It passed every check, it matched the code, and I couldn't read it. Too many blocks on the top level, group boxes bristling with ports, wires crossing the whole canvas.

My first fix came from the same place as the idea: electronics. In a schematic, when a wire would cross the whole sheet, you don't draw it. You put a labeled flag at each end, a net label, and the reader matches the names. So the viewer started drawing wires that touched a shared hub as pairs of flags, bundled the ports on closed boxes so each box had one port per outside endpoint, and the skill got structure rules: 5 to 12 blocks per level, each store inside the area that uses it, and big subjects split into linked diagrams.

It was better. Then I used it for the rest of the day and changed my mind. On software diagrams, flags where a plain line would do made the flow harder to follow. In a schematic you're tracing a signal you already know exists. In a software diagram you're trying to understand the flow, and every flag is a jump you have to make in your head. Habits from electronics didn't all carry over.

So the rule flipped the same afternoon: lines first, flags as the last resort. On that first real diagram the flag count went from 26 to 4.

### Under the hood: when a wire becomes a flag

No wire becomes flags because of what it connects anymore. The "hub rule" is gone, and the skill doesn't decide how wires are drawn. After a layout, the viewer turns a wire into a pair of flags only when a line would really be hard to follow:

- it crosses or overlaps three or more other wires (worst first);
- it's long and crosses something, or it's very long;
- it loops back, which counts as long sooner.

Cycles in the graph have to be broken somewhere to lay it out left to right, and the right place depends on the diagram. So the layout tries several cycle-breaking strategies (depth-first, greedy, greedy in model order, model order) and keeps the cheapest, where cost is the length of the wires left as lines, with backward wires counted double, plus a fixed cost per flagged wire. Top-level triggers are pinned to the first column, and the skill writes blocks in story order so the viewer knows which way loops run. ELK ports are fixed in position, so the offsets are known before routing.

The same day I added hand arrangement: drag blocks, and the positions are saved to the layout side file.

## Where the state lives

I spent the next two days not committing anything, just using it and talking through the next phase. And I kept getting lost in the same thing that had burned me in the questionnaire: where the state lived. A component, a store, browser storage, the database, and whether it survived a reload.

That became the Data box. Click a block and the viewer tells you what it reads, what it writes, and where each piece of that data lives. Click a state and you see who reads it and who writes it. The skill requires every `state` to carry a `store`, written from the code and not from a guessed category: `"Zustand store · lost on reload"`, `"Postgres table bookings"`. It's free text on purpose, so the agent doesn't have to bend reality into my categories.

The second half of that phase came straight from the questionnaire too: **reuse before creating**. In Design mode, before proposing a new state, Claude has to look for an existing store that already holds that data and wire the new blocks to it. A new store needs a reason. And the validator flags a new state with the same type as an existing one as `similar-store`. Two stores holding the same data is how state gets out of sync, and an agent that can't see the first one will happily create the second.

### Under the hood: computed, not written

Nothing in the Data box is written by the agent. It's all computed from what the file already has: ports, wires, states and type info. From `packages/core/src/data/dataBox.ts`:

```ts
// The Data box (design spec §6.8): what a block reads and writes,
// and where that data lives. Everything here is computed from
// ports, wires, states and `typeInfo`; nothing new in the file.

export type DataBox =
  | { kind: 'block'; reads: DataItem[]; writes: DataItem[]; responses: DataItem[] }
  | { kind: 'state'; holds: DataItem; readBy: DataUse[]; writtenBy: DataUse[] }
  | { kind: 'boundary'; reads: DataItem[]; writes: DataItem[]; inside: number };
```

For a block, it follows the wires on each port to the other end; if that end is a state, the badge is the state's `store`, otherwise it's "from A, B" or "to A, B". When a type resolves to an object, its fields are expanded up to four levels deep. That principle held for the whole phase: show more without making the agent write more.

## The diagram talks back

Reading was half of what I wanted. The other half was writing: telling Claude what I mean in the diagram itself, not in another paragraph of chat.

I decided early that the viewer would not become an editor that owns the logic. I don't add blocks and wires in the UI; I ask Claude and it does it. What I can do in the viewer is small and precise: rename a block, a port or a function, change a type or a trigger, remove a block or a wire, leave a note. Those edits are written with the same Design marks Claude uses (`change`, `before`, `note`) and they're requests, not changes. A renamed block means "rename this in the code". A note means "do this, then delete the note". When I'm done, "Copy for agent" gives me the text to paste: the file path and one line per item with its id and code location.

I designed that phase with the tool itself. Claude wrote the Design diagram of the Data box and the viewer edits (44 nodes, 64 wires, 7 risks), I read it, questioned it, approved it, and the implementation was planned and built against it on October 22. A few hours later I made my first real round trip: an edit in the viewer, pasted back, implemented and checked by the agent. That diagram is in the repo, in `logic/`, next to the code it describes.

This is the part I care about most. When something matters, I don't let Claude start a plan from my prose. I let it draw the internals as blocks first, I fix the blocks, and the plan cites the JSON. The skill ends every approved Design diagram the same way: it asks whether to continue to the implementation plan using the diagram as its basis.

### Under the hood: two writers, one file

When two writers share one file, someone overwrites someone. The protocol is three files and three rules:

- `<subject-id>.draft.json` holds my unsaved viewer edits. **Before editing a diagram, Claude checks for it.** If it exists, Claude doesn't touch the diagram; it says so and waits.
- If my save overwrote edits Claude had made in the meantime, those go to `<subject-id>.review.json`. Claude compares it with my version, re-applies what still makes sense on top, then deletes it.
- `<subject-id>.layout.json` is mine. Claude never writes it.

If I only say "I edited the diagram", Claude reads `git diff` on the file.

## Diagrams that stay true

A diagram that drifts from the code is worse than no diagram, so after a designed change is implemented, the skill folds it back into living documentation. The mode goes back to `understand`, `new` and `modified` become plain existing blocks, removed items are deleted, `before`, change notes and leftover notes are dropped, resolved risks go, open ones stay, and the `code` references are updated to the real files and symbols. Then it runs:

```bash
node dist/cli.mjs validate logic/<subject-id>.logic.json --check-code .
```

`--check-code` warns about any block whose `code.file` or `code.symbol` no longer exists. Then the diagram is committed with the implementation. One file per subject; older versions live in git history, not as copies.

The next time something breaks in that area, neither Claude nor I start from zero.

## The same bug, caught this time

The questionnaire wasn't done with me. About a week ago I built an export of the questionnaire's answers, and one column looked absurd. Take a question that asks for a count (the real one was different): someone answers 17, and the export says Wednesday. The export was treating that plain number as a lookup id, and option 17 in some list happened to be a day of the week. The same bug class as the "Other" option: a bare number flowing where an id was expected.

I found that one field, asked Claude to fix it, and Claude fixed that one field. I believed that was the end of it.

Then I had to change that export again. This time I ran agentic-fbd before planning, to see what Claude was going to touch at the code level. The diagram came back with a risk on two more fields with the same problem. Three fields in total, and I had only seen one. I fixed the other two in the same change, before it shipped.

That's the moment the tool paid for itself for me. Claude is the one that found the two fields. The diagram is what made it follow every wire that type travels on, and it turned the answer into something I could check in a minute instead of a paragraph I'd skim.

## Shipping it

On October 23 I renamed it. "Logic builder" was too generic, and it kept giving me doubts. agentic-fbd says what it is: agentic function block diagrams. I looked for something similar by that name and didn't find it. There are other diagram tools for agents; none of them helped me think like an engineer, which is the whole point.

The same day I moved it to a public repo with an MIT license, gave the viewer a new theme, and fixed a dependency security advisory. On October 24 it got a website in English and Spanish, a demo mode that runs the viewer from static files, GitHub Pages deploys, and v0.3.0. To have something real to show, I pointed it at the React version of TodoMVC, the classic app every framework implements against the same spec. The diagram found four places where that app departs from the spec: todos aren't persisted, so a reload empties the list; Escape doesn't cancel an edit; the "mark all" checkbox reads the filtered list but toggles the whole one; and one action is handled by the reducer but never sent. You can open that diagram on the site and see the four risks yourself.

From the first commit on October 18 to v0.3.0 on October 24 was under a week: 60 commits to the release, on five working days, with two days in the middle spent using it and thinking. The thinking and sketching before that took about another week.

## The scoreboard

- Repo to release: 6 days, from the first commit on October 18 to v0.3.0 on October 24, after about two weeks of thinking and sketching earlier versions.
- Bug class caught before a user saw it: 2 more fields, on top of the 1 I had found myself.
- Commits to v0.3.0: 60, on 5 working days (12, 3, 17, 10 and 18).
- Tests: 274 passing, in 23 files, at v0.3.0.
- Skill file: 178 lines, against a target of about 200.
- Readability: 5 to 12 blocks per level written, up to 25 visible blocks per view.
- First real diagram: flags drawn, 26 before the lines-first rule, 4 after.
- The tool designed with itself: 44 nodes, 64 wires, 7 risks; planned and implemented against.
- TodoMVC (React): 37 nodes, 4 departures from the spec found.

## My takeaway

This is my opinion, and it comes from one person using one tool for a couple of weeks on top of years of being burned the other way.

Coding agents are now good enough that you can ship without understanding what you shipped. I don't want to. When an app has lots of conditionals and state at different levels and something breaks, the agent has to walk every layer to find where the data comes from. If I understand the logic, I often know where the problem is just by looking at what state the app is in, and I can tell Claude exactly where to look instead of paying for the investigation in tokens and time. That has already happened to me on projects with many conditionals and states at different levels. So my read is this: the diagram is a translator, both ways. Claude's plan becomes something I can read in a minute, and my idea becomes JSON it can plan from. That's how I keep the mental model of what I ship instead of handing it to the agent, and I think that's what separates someone who just wants the output from an engineer who wants to know what they're building. agentic-fbd is for the second kind, the curious ones.

I believe that if I'd had this when I fought the questionnaire, it would have taken a fraction of the time and tokens, and the result would have been better. I can't measure that; it's the conviction that made me build the tool. What I can say is what it costs: a diagram is one more artifact to review, Design mode is slower than letting the agent just go, and on simple tasks it's ceremony. That's why the skill only offers itself when the logic is non-trivial, and stays quiet otherwise.

Limits, plainly. The repo is a week old. It runs in Claude Code only; the format, the viewer and the CLI don't depend on Claude, and a Codex version is one of my next steps. Some things are still on the list: following one piece of data through every block on the canvas, grouping states by where they live, adding blocks from the UI, undo per edit.

## Run it yourself

agentic-fbd is a Claude Code plugin. It needs Node.js 20 or later, and nothing gets installed into your projects: the viewer and the CLI ship prebuilt.

```text
/plugin marketplace add gabolondon/agentic-fbd
/plugin install agentic-fbd@agentic-fbd
```

Then ask in plain words: "Explain how authorization works here, with a logic diagram", or "Design adding an 'Other' option to the questionnaire as a logic diagram before we plan it". Claude writes the JSON, validates it and gives you a local URL. Double-click a group to go one layer deeper, click a block to read what it does and where its code is, open Risks, flip Before/After on a design. If you'd rather look first, the site has the TodoMVC diagram running in the browser.

The repo is open source, MIT: [github.com/gabolondon/agentic-fbd](https://github.com/gabolondon/agentic-fbd). I'm sharing it because it has made my day-to-day with Claude Code clearer, and it feels good to talk to the agent in a language I trust. If it helps one person, once, that's enough for me. If you want to help make it better, issues and pull requests are welcome. Either way, I'll keep using it and keep improving it.
