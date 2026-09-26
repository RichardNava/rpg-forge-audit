# Character-sheet generation model benchmark

Run: 2026-09-10T12:45:40.582Z

Production pipeline: sections -> fields -> calculations -> compile, 
through the real @repo/character-sheet-generation services.
Request shape: role-separated messages, max_tokens 8192, per-stage json_schema.

Fixtures: 1 (8 semantic + 1 prompt-injection probe).

## Fixtures

| id | role | lang | calc | concepts |
| --- | --- | --- | --- | --- |
| en-gm-npc-guard | npc | en | 0 | 4 groups |

## Results

| model | accepted | calls | first | replays (ok/fail) | total ms |
| --- | --- | --- | --- | --- | --- |
| @cf/meta/llama-3.3-70b-instruct-fp8-fast | 0/1 (0%) | 1 | 1 | 0 (0/0) | 788.2 |

### Per-fixture acceptance

| model | en-gm-npc-guard |
| --- | --- |
| @cf/meta/llama-3.3-70b-instruct-fp8-fast | FAIL |

Raw per-fixture JSON and per-model summaries: D:\code_projects\RPG_Forge\rpg-forge\tmp\phase-14.5-sheet-benchmark

This run consumed live Cloudflare Workers AI inference for 1 candidate models.