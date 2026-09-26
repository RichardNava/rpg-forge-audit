# 2C2B remote context-instruction extraction validation

Run: 2026-09-11T23:50:51.472Z | runId: 2026-09-11T23-49-53-785Z
Results directory: D:\code_projects\RPG_Forge\rpg-forge\tmp\phase-14.5-2c2b-extraction\2026-09-11T23-49-53-785Z

## 1. Files changed

- spikes/phase-14/extraction-validation/config.ts
- spikes/phase-14/extraction-validation/signatures.ts
- spikes/phase-14/extraction-validation/fixtures.ts
- spikes/phase-14/extraction-validation/classify.ts
- spikes/phase-14/extraction-validation/scoring.ts
- spikes/phase-14/extraction-validation/remote-port.ts
- spikes/phase-14/extraction-validation/harness.ts
- spikes/phase-14/extraction-validation/matrix.ts
- spikes/phase-14/extraction-validation/report.ts
- spikes/phase-14/extraction-validation/wrangler.jsonc
- spikes/phase-14/extraction-validation/src/worker.ts
- spikes/phase-14/extraction-validation/src/worker.test.ts
- spikes/phase-14/extraction-validation/fixtures.test.ts
- spikes/phase-14/extraction-validation/matrix.test.ts
- spikes/phase-14/extraction-validation/scoring.test.ts
- spikes/phase-14/scripts/run-instruction-extraction-validation.ts
- spikes/phase-14/vitest.config.ts
- spikes/phase-14/package.json
- spikes/phase-14/sheet-benchmark/src/stage-config.ts

## 2. Command executed

`pnpm --filter @rpg-forge/phase-14-spikes benchmark:extraction-validation`

## 3. Resolved experiment matrix

1 model x 13 fixtures.
- model: @cf/meta/llama-4-scout-17b-16e-instruct
- fixtures: F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13

## 4. Model

`@cf/meta/llama-4-scout-17b-16e-instruct` (pinned; no model from environment or config).

## 5. Fixture-by-fixture results

| id | mode | lang | expected ops | attempts | replay | outcome | checks | class |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | pc | en | field.add | 1 | no | ok | fail: kinds, params | D | (actual: field.remove) |
| F2 | pc | en | field.replace | 1 | no | ok | fail: params | D | (actual: field.replace) |
| F3 | pc | en | field.rename | 1 | no | ok | fail: kinds, params | D | (actual: field.replace) |
| F4 | pc | en | field.set_value | 2 | yes | invalid_proposal | fail: count, kinds, params, detail | F | (actual: []) |
| F5 | pc | en | field.constrain | 2 | yes | invalid_proposal | fail: count, kinds, params, detail | F | (actual: []) |
| F6 | npc | en |  | 2 | yes | invalid_proposal | fail: detail | F | (actual: []) |
| F7 | npc | en | name | 1 | no | ok | all | PASS | (actual: name) |
| F8 | npc | en | portrait | 1 | no | ok | fail: count, kinds, params, detail | D | (actual: name, name, name) |
| F9 | pc | en |  | 1 | no | ok | all | PASS | (actual: []) |
| F10 | pc | en |  | 1 | no | ok | fail: count, kinds, params, forbidden-op | D | (actual: field.replace) |
| F11 | npc | en | field.replace, field.set_value, name, portrait | 1 | no | ok | fail: count, kinds, params, order, detail | D | (actual: name, field.replace) |
| F12 | npc | es | field.replace, field.set_value, name | 1 | no | ok | fail: count, kinds, params, order | D | (actual: name, field.replace) |
| F13 | pc | en | field.add | 1 | no | ok | fail: count, kinds, params | D | (actual: []) |

## 6. Critical fixture summary

Critical set: 0/7 passed (F1 F2 F6 F8 F10 F11 F12).

## 7. ADD-vs-REPLACE result

F1 ("Add Vigor") must emit exactly ADD Vigor; F2 ("Replace Constitution with Vigor") must emit exactly REPLACE Constitution->Vigor. ADD must not become REPLACE and REPLACE must not become ADD.
- F1: FAIL (class D; actual ops: field.remove)
- F2: FAIL (class D; actual ops: field.replace)

## 8. Qualitative-vs-numeric result

F6 ("Make him very strong") must emit no SET_VALUE/CONSTRAIN; F5 ("Strength cannot exceed 18") must emit exactly CONSTRAIN max=18.
- F6: FAIL (class F; actual ops: [])
- F5: FAIL (class F; actual ops: [])

## 9. Ambiguous-replacement result

F10 ("Use Vigor instead" with no source) must not fabricate a REPLACE; an empty proposal list (optionally with a target-not-actionable diagnostic) is the only accepted result.
- F10: FAIL (class D; actual ops: field.replace)

## 10. NPC portrait gating result

F8 (NPC portrait request) must keep the explicit visual details; F9 (PC sheet with a portrait request) must show no portrait in the final gated result (deterministic app-side gating is accepted).
- F8: FAIL (class D; actual ops: name, name, name)
- F9: PASS (class PASS; actual ops: [])

## 11. Spanish fixture result

Spanish "Sustituye Constitución por Vigor [...]" must emit REPLACE Constitución->Vigor, SET_VALUE Vigor=15, name Gruk in order, preserving the accented source label.
- F12: FAIL (class D; actual ops: name, field.replace)

## 12. Mixed-order result

Mixed "Replace Constitution with Vigor, set Vigor to 15, name the character Gruk, and add an image of a large blue troll" must preserve the exact stated order.
- F11: FAIL (class D; actual ops: name, field.replace)

## 13. Schema/replay reliability

Fixtures passed without a replay: 2/13.
Provider calls: 16; replays used: 3; replays that recovered to a valid result: 0. Persistent invalid proposals classify as B (JSON parse) / C (schema) / F (replay failed to correct).

## 14. Latency/token usage

Total elapsed: 30924ms; total provider calls: 16; total reported output tokens: 0.

Per fixture:

  - F1: calls=1 total=2737.55ms first=2728.28ms
  - F2: calls=1 total=813.39ms first=810.93ms
  - F3: calls=1 total=2418.97ms first=2417.62ms
  - F4: calls=2 total=14975.43ms first=12478.83ms
  - F5: calls=2 total=2130.39ms first=1129.32ms
  - F6: calls=2 total=1745.5ms first=1089.81ms
  - F7: calls=1 total=523.17ms first=521.83ms
  - F8: calls=1 total=1312.38ms first=1311.63ms
  - F9: calls=1 total=764ms first=762.91ms
  - F10: calls=1 total=684.32ms first=683.6ms
  - F11: calls=1 total=877.94ms first=876.69ms
  - F12: calls=1 total=1151.47ms first=1150.24ms
  - F13: calls=1 total=789.5ms first=788.76ms

## 15. Failure classifications A-F

- D (semantic extraction): 8
- F (correction replay): 3

## 16. Overall A/B/C/D classification

Overall: **C** — PHASE 14.5 2C2B REMOTE VALIDATION COMPLETE — MODEL FAILED CRITICAL SEMANTICS

## 17. Prompt/schema change recommendation

At least one critical fixture failed. Before editing the system prompt or schema, replay this exact matrix once to confirm stability and inspect the recorded raws for the failing critical fixtures.

## 18. No-production-integration confirmation

No production package, provider adapter, workflow, route, D1/R2 resource or live-generation wiring was changed by this iteration. The experiment lives entirely under spikes/phase-14 and writes only to tmp/.

## 19. SHEET_GENERATION_MODEL unset confirmation

Confirmed: SHEET_GENERATION_MODEL is unset (verified at run start).

## 20. git status --short

```
M apps/rules-worker/drizzle/meta/_journal.json
 M apps/rules-worker/package.json
 M apps/rules-worker/src/deps.ts
 M apps/rules-worker/src/env.ts
 M apps/rules-worker/src/handler.test.ts
 M apps/rules-worker/src/handler.ts
 M apps/rules-worker/src/index.ts
 M apps/rules-worker/src/infrastructure/ai-errors.ts
 M apps/rules-worker/src/infrastructure/db/schema.ts
 M apps/rules-worker/src/infrastructure/rulebook-cleaner.ts
 M apps/rules-worker/src/rulebook-handler.ts
 M apps/rules-worker/src/rules-context-handler.test.ts
 M apps/rules-worker/src/rules-context.workerd.test.ts
 M apps/rules-worker/src/test/fakes.ts
 M apps/rules-worker/src/transport/errors.ts
 M apps/rules-worker/src/transport/schemas.ts
 M apps/rules-worker/wrangler.jsonc
 M docs/architecture/adr/052-workerd-acroform-pdf-renderer.md
 M docs/architecture/adr/053-embedding-model-and-vectorize-metric.md
 M docs/architecture/adr/054-zod4-canonical-schema.md
 M docs/architecture/adr/README.md
 M docs/architecture/spikes/phase-14/01-pdf-page-extraction.md
 M docs/architecture/spikes/phase-14/02-embedding-benchmark.md
 M docs/architecture/spikes/phase-14/03-structured-ai-benchmark.md
 M docs/architecture/spikes/phase-14/04-pdf-acroform-renderer.md
 M docs/architecture/spikes/phase-14/08-closeout-cleanup-audit.md
 M packages/character-sheet-schema/src/index.test.ts
 M packages/character-sheet-schema/src/index.ts
 M packages/rules-context/src/index.ts
 M pnpm-lock.yaml
 M spikes/phase-14/package.json
 M spikes/phase-14/tsconfig.json
 M spikes/phase-14/vitest.config.ts
?? .opencode/skills/vercel-react-best-practices/
?? .opencode/skills/web-design-guidelines/
?? apps/rules-worker/drizzle/0003_dazzling_punisher.sql
?? apps/rules-worker/drizzle/meta/0003_snapshot.json
?? apps/rules-worker/src/character-sheet-generation-workflow.ts
?? apps/rules-worker/src/character-sheet-handler.test.ts
?? apps/rules-worker/src/character-sheet-handler.ts
?? apps/rules-worker/src/infrastructure/ai-sheet-generation.test.ts
?? apps/rules-worker/src/infrastructure/ai-sheet-generation.ts
?? apps/rules-worker/src/infrastructure/character-sheet-workflow.ts
?? apps/rules-worker/src/infrastructure/character-sheet-workflow.workerd.test.ts
?? apps/rules-worker/src/infrastructure/db/sheet-run-repository.ts
?? apps/rules-worker/src/infrastructure/db/sheet-run-repository.workerd.test.ts
?? apps/rules-worker/src/infrastructure/r2-sheet-artifacts.ts
?? apps/rules-worker/src/infrastructure/r2-sheet-artifacts.workerd.test.ts
?? docs/architecture/adr/055-section-title-degeneracy-personas.md
?? packages/character-sheet-generation/
?? skills-lock.json
?? spikes/phase-14/extraction-validation/
?? spikes/phase-14/scripts/run-instruction-extraction-validation.ts
?? spikes/phase-14/scripts/run-sheet-benchmark.ts
?? spikes/phase-14/sheet-benchmark/
?? tmp/
```

PHASE 14.5 2C2B REMOTE VALIDATION COMPLETE — MODEL FAILED CRITICAL SEMANTICS