---
name: run-plan
description: Execute the active plan in docs/plans/ as an orchestrator. Start a fresh sub-agent for each step, verify its work yourself with the build and screenshots, tick the step, record decisions, and commit, step after step. Use when the user says "run the plan", "start step N", "continue the plan", or approves a plan written by write-plan.
---

# Run a plan (orchestrator)

You are the **orchestrator**. You don't implement steps yourself. For each step you start a
fresh sub-agent with a focused brief, then check its result independently. Fresh contexts keep
each step cheap and focused.

**How far to go:** if the user said to keep going (for example "continue until you hit an
impasse"), run step after step without checking in. Stop only for a real decision that
belongs to the user, a step that won't converge, or the end of the plan. Otherwise, do one
step and ask before starting the next.

## Loop

1. **Find the step.** Open the active plan, `docs/plans/*.md` with `Status: active`, not the
   files in `archive/`. Take the first unticked step. Check `git status` (it should be
   clean) and `git log --oneline | head`.
2. **Make sure the dev server is up.** Use `mcp__Claude_Browser__preview_list`, or
   `preview_start` with the `vite` config in `.claude/launch.json`. The port may move from
   5173 to 5174 if 5173 is taken, so put the actual URL in the brief.
3. **Start a sub-agent.** Call the Agent tool with `subagent_type: general-purpose` and the
   step's `model` and `effort`. Use the brief template below.
4. **Verify independently** when it reports back. Its report is a claim, not proof.
   - Run `git log --oneline` and `git status`. The work should be committed and the tree clean.
   - Run `npm run build`, then `rm -rf dist`.
   - Screenshot the acceptance presets yourself at `scale: 0.5`, with real night lighting
     unless the criteria say `light=work`.
   - Check `read_console_messages` with `onlyErrors`. Errors from mid-edit hot reloads can
     linger in the console, so reload and check again before blaming the current code.
   - Check that no shader program failed to compile:
     `__tabernacle.renderer.info.programs.filter(p => p.diagnostics && !p.diagnostics.runnable).length`
     should be 0.
   - Exercise behavior through `window.__tabernacle` (see "Debug handle" in AGENTS.md) rather
     than taking extra screenshots.
5. **Decide.**
   - **Criteria met:** tick the step in the plan. Move new decisions into `docs/DECISIONS.md`
     under the right heading, editing superseded entries in place. Add any cosmetic issues
     you noticed to a *later* step's "Carry-over notes". Commit as
     `Mark Step N complete: <summary>`.
   - **Not met:** start a **new** sub-agent with the same model and effort, and a brief that
     lists only the specific gaps.
     - If a Sonnet step still fails after 2 rounds, switch to Opus.
     - After about 3 failed rounds, stop and ask the user.
6. **Report briefly to the user** after each step: what changed, what you checked, and any
   deviations. Then continue.
7. **When the plan is done:**
   - Set `Status: complete`.
   - Add an outcomes table: rounds, sub-agent tokens and a one-line result per step.
   - Add lessons learned.
   - `git mv` the plan into `docs/plans/archive/` and commit.
   - Update the performance baseline in `docs/DECISIONS.md` if it changed.
   - Update AGENTS.md if the code map, URL parameters or presets changed.

## Brief template

```
You are implementing **Step N (<name>)** of the plan in /Users/kylewillett/Documents/Dev/tabernacle/<plan path>.
Read AGENTS.md first (conventions, debug handle, verification, commit rules). <Read docs/SPEC.md §X if a biblical object is involved.> Relevant decisions: docs/DECISIONS.md §<headings>.

Files to read: <exact list, with one line each saying what's there and any API to reuse>. Don't read others unless needed.

## Goal
<the step's goal, expanded into concrete requirements; include the carry-over notes>

## Verification
The dev server is at <URL> (hot reload). If it's unreachable, run `npm run dev -- --port <port>` in the background.
Use the built-in browser tools (mcp__Claude_Browser__*; load their schemas with ToolSearch if they're deferred). Take screenshots at scale 0.5.
Acceptance:
1. <criteria with named presets>
2. No console errors; `npm run build` passes; report draw calls and frame time (time renders through window.__tabernacle.composer — the hidden pane throttles requestAnimationFrame).

## Commits
Commit at logical stopping points; the build must pass before each commit. End each commit message with the attribution line from the session's system reminder. Don't push, and don't tick the plan checkbox (the orchestrator does that).

## Report
Keep it short: what was built, commit hashes, screenshots checked and what they showed, performance numbers, deviations or open questions, and suggested DECISIONS.md entries.
```

## Saving tokens

- Take screenshots at half scale, and only of the acceptance presets plus 1–2 close-ups.
- Briefs list exact files, so the sub-agent doesn't read the whole codebase.
- Use a fresh sub-agent for every fix round; never resume a sub-agent's context for a new step.
- Never read a sub-agent's output transcript file. Wait for its report.
