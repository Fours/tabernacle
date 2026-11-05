---
name: write-plan
description: Turn a chunk of Tabernacle work (a feature, a polish pass, a new area) into a step-by-step plan file in docs/plans/ that the run-plan skill can execute with sub-agents. Use when the user describes multi-step work and wants a plan, or says "plan this", "make a plan for", or "break this into steps".
---

# Write a plan

Write a plan that the `run-plan` skill can execute one step at a time. Each step goes to a
fresh sub-agent, so **every step must make sense on its own** when read next to `AGENTS.md`.

## 1. Gather context (keep it cheap)

- Read `AGENTS.md` (always loaded) and skim `docs/DECISIONS.md` for the areas the work touches.
- Read `docs/SPEC.md` if the work touches a biblical object.
- Look at `git log --oneline | head -20` and `docs/plans/` for any active plan. Only one plan
  should be active at a time. If one is unfinished, ask the user whether to finish it,
  replace it, or fold it into the new plan.
- Read code only as far as you need to size the steps and name the files. The sub-agents
  will read the rest.

## 2. Settle open questions before writing

Ask the user (in one batch) only about choices that change what gets built: interpretive
questions about the text, scope (in or out), and trade-offs between look and performance. For
anything with a sensible default, pick the default and note it in the plan as an assumption.

## 3. Size the steps

- One step is one coherent visual or behavioral outcome that a sub-agent can finish and check
  in a single context. A good size is roughly 70–170k tokens of sub-agent work.
- Split a step if it bundles several unrelated systems. For example, the old Step 7 combined
  tone mapping, bloom, fog, materials and 8 fixes, and cost 230k+ tokens.
- Order the steps so later ones build on earlier ones. Put shared building blocks (materials,
  reusable modules) first.
- If the next step will touch the same area, don't send a fix round for small cosmetic
  issues. Write them into the later step's brief as "carry-over notes".

## 4. Write `docs/plans/YYYY-MM-DD-<slug>.md`

Use this template:

```markdown
# Plan: <title>

**Status:** active
**Goal:** <1–3 sentences: what the user will see or be able to do when this is done>
**In scope / out of scope:** <bullets>
**Assumptions:** <defaults chosen without asking; each one moves to docs/DECISIONS.md when a step lands>

## Steps

- [ ] **Step 1: <name>** — model: <Opus|Sonnet> / effort: <medium|high>
  **Goal:** <what to build, concretely>
  **Files:** <the files the sub-agent should read and touch>
  **Spec:** <the AGENTS.md / SPEC.md / DECISIONS.md sections that apply>
  **Accept when:** <checkable criteria tied to named `?view=` presets, behaviors checked through
  `window.__tabernacle`, and budgets for performance and draw calls>
  **Carry-over notes:** <filled in by the orchestrator as earlier steps finish>

- [ ] **Step 2: ...**
```

**Choosing a model and effort for each step**

| Kind of step | Model | Effort |
|---|---|---|
| Visual judgment, cloth or geometry difficulty, shaders, post-processing | Opus | high |
| Small, tightly specified additions; placement; parameter tuning | Sonnet | medium–high |
| Mechanical edits or refactors with no visual judgment | Sonnet | medium |

Never use max effort for builders: the screenshot loop catches mistakes better. Haiku isn't
suitable for building steps.

**Acceptance criteria must be checkable from screenshots or code.** Name the exact presets,
and add new presets to the plan if a step needs a view that doesn't exist yet. Always include:
`npm run lint` and `npm run build` pass, the console shows no errors, and frame time and draw calls stay
within the baseline in `docs/DECISIONS.md`, unless the step says otherwise.

## 5. Hand off

Commit the plan file with a message like `Add plan: <title>`. Show the user a short summary:
the steps, the model for each, and any assumptions. Ask whether to start running it with
`run-plan`.
