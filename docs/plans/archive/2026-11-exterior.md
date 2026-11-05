# Plan (archived): Tabernacle exterior, night scene

**Status:** complete, 2026-11-05. Commits run from `b7a409e` to `7998f19`. These steps were run
with the `run-plan` workflow. The decisions made along the way are in `docs/DECISIONS.md`.

**Scope:** the outside of the Tabernacle: the courtyard enclosure, the bronze altar (plus the
laver) and the tent's exterior, at night, lit by the altar fire and torches. The player walks
in first person.

## Steps and outcomes

| # | Step | Model / effort | Rounds | Sub-agent tokens | Outcome |
|---|------|----------------|--------|------------------|---------|
| 1 | Layout blockout + both cameras + collision | Opus (default) | 1 | ~98k | Proportions verified on the `top` view; first-person walking with collision. |
| 2 | Courtyard walls in detail | Opus / high | 1 | ~119k | Instanced pillars, sockets, capitals, fillets, hooks; draped linen; embroidered gate; pegs and cords. |
| 3 | Bronze altar in detail | Sonnet / high | 1 | ~97k | Hollow altar with an earth hearth, horns, ledge, lattice grating, rings, poles, utensils; laver. |
| 4 | Tabernacle tent in detail | Opus / high | 1 | ~165k | Boards, sockets, bars, gold entrance pillars, layered draped coverings, clasps, pins. |
| 5 | Altar fire | Opus / high | 1 | ~126k | GPU fire (flames, embers, smoke), wood stack, flickering shadow-casting light. |
| 6 | Torches | Sonnet / medium | 1 | ~71k | 10 torches; 8 give light. |
| 7 | Shaders & post-processing | Opus / high | 1 | ~232k | ACES tone mapping, bloom, night grade, fog, heat shimmer, better materials; all earlier visual notes fixed. |
| 8 | Starry sky + first-person polish | Sonnet / medium | 1 | ~93k | Procedural sky dome; first person is the default; head bob; controls hint. |

## Lessons for future plans

- Every step converged in one round. Briefs that listed the exact files to read, the
  acceptance views and the relevant spec worked well.
- The orchestrator wrote quality notes into the brief of a *later* step (for example, "Step 7
  notes"). That worked better than sending a fix round back for cosmetic problems.
- Sonnet handled the small, tightly specified steps (altar, torches, sky) without trouble.
  Opus was used for cloth draping, the fire shaders and post-processing.
- Step 7 (post-processing) was the most expensive step: 95 tool calls. It bundled tone mapping,
  bloom, fog, materials and 8 cosmetic fixes. In future, split work that broad into two steps.
- The sub-agent's report is a claim, not proof. The orchestrator's own check found real issues
  more than once: a shadow light leak, torch heads that looked like pots, and a `simulate`
  call made with the wrong arguments.
