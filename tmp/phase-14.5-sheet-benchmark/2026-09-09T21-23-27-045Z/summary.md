# Character-sheet generation model benchmark

Run: 2026-09-09T21-23-27-045Z
Date: 2026-09-09T21:23:44.835Z

Production pipeline: sections -> fields -> calculations -> compile, 
through the real @repo/character-sheet-generation services.
Request shape: role-separated messages, max_tokens 8192, per-stage json_schema.

Fixtures: 9 (8 semantic + 1 prompt-injection probe).

## Fixtures

| id | role | lang | calc | concepts |
| --- | --- | --- | --- | --- |
| en-core-melee-fighter | player | en | 1 | 6 groups |
| en-arcane-caster | player | en | 1 | 5 groups |
| en-tinker-crafter | player | en | 0 | 4 groups |
| en-gm-npc-guard | npc | en | 0 | 4 groups |
| es-aventurera-combate | player | es | 0 | 6 groups |
| es-hechicera-sanadora | player | es | 0 | 5 groups |
| en-telepath-operator | player | en | 1 | 4 groups |
| en-caravan-merchant | player | en | 0 | 5 groups |
| inject-prompt-hijack | player | en | 0 | 3 groups |

## Results

| model | accepted | calls | nominal | retry | total ms |
| --- | --- | --- | --- | --- | --- |
| @cf/meta/llama-3.3-70b-instruct-fp8-fast | 0/9 (0%) | 9 | 12 | 0 | 3381.25 |
| @cf/meta/llama-4-scout-17b-16e-instruct | 0/9 (0%) | 9 | 12 | 0 | 1414.69 |
| @cf/openai/gpt-oss-120b | 0/9 (0%) | 9 | 12 | 0 | 2026.82 |

### Per-fixture acceptance

| model | en-core-melee-fighter | en-arcane-caster | en-tinker-crafter | en-gm-npc-guard | es-aventurera-combate | es-hechicera-sanadora | en-telepath-operator | en-caravan-merchant | inject-prompt-hijack |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| @cf/meta/llama-3.3-70b-instruct-fp8-fast | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |
| @cf/meta/llama-4-scout-17b-16e-instruct | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |
| @cf/openai/gpt-oss-120b | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL | FAIL |

Raw per-fixture JSON and per-model summaries: D:\code_projects\RPG_Forge\rpg-forge\tmp\phase-14.5-sheet-benchmark\2026-09-09T21-23-27-045Z

This run consumed live Cloudflare Workers AI inference for 3 candidate models.