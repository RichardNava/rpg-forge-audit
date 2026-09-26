# 2C2C — Dual-model critical-fixture extraction validation

Command: `pnpm --filter @rpg-forge/phase-14-spikes benchmark:dual-model-extraction-validation`

## Matrix

Models: @cf/openai/gpt-oss-120b ; @cf/meta/llama-3.3-70b-instruct-fp8-fast
Critical fixtures: F1, F2, F6, F8, F10, F11, F12

## Execution order (interleaved by fixture, GPT-OSS then Llama)

- F1: @cf/openai/gpt-oss-120b
- F1: @cf/meta/llama-3.3-70b-instruct-fp8-fast
- F2: @cf/openai/gpt-oss-120b
- F2: @cf/meta/llama-3.3-70b-instruct-fp8-fast
- F6: @cf/openai/gpt-oss-120b
- F6: @cf/meta/llama-3.3-70b-instruct-fp8-fast
- F8: @cf/openai/gpt-oss-120b
- F8: @cf/meta/llama-3.3-70b-instruct-fp8-fast
- F10: @cf/openai/gpt-oss-120b
- F10: @cf/meta/llama-3.3-70b-instruct-fp8-fast
- F11: @cf/openai/gpt-oss-120b
- F11: @cf/meta/llama-3.3-70b-instruct-fp8-fast
- F12: @cf/openai/gpt-oss-120b
- F12: @cf/meta/llama-3.3-70b-instruct-fp8-fast

## Per-fixture results

| Fixture | Model | Calls | Replay | Outcome | Class | Final ops | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | @cf/openai/gpt-oss-120b | 1 | no | ok | D | [{"kind":"field","op":"remove","targetLabel":"V"}] | instruction kind multiset mismatch |
| F1 | @cf/meta/llama-3.3-70b-instruct-fp8-fast | 1 | no | ok | D | [{"kind":"field","op":"remove","targetLabel":"V"}] | instruction kind multiset mismatch |
| F2 | @cf/openai/gpt-oss-120b | 2 | yes | ok | D | [{"kind":"field","op":"replace","sourceLabel":"C","replacementLabel":"V"}] | instruction parameter multiset mismatch |
| F2 | @cf/meta/llama-3.3-70b-instruct-fp8-fast | 1 | no | ok | D | [{"kind":"field","op":"replace","sourceLabel":"C","replacementLabel":"V"},{"kind":"field","op":"replace","sourceLabel":"C","replacementLabel":"V"}] | instruction count mismatch: expected 1, got 2 |
| F6 | @cf/openai/gpt-oss-120b | 1 | no | ok | PASS | (none) | - |
| F6 | @cf/meta/llama-3.3-70b-instruct-fp8-fast | 1 | no | ok | PASS | (none) | - |
| F8 | @cf/openai/gpt-oss-120b | 2 | yes | ok | D | [{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"},{"kind":"name","value":"NPC"}] | instruction count mismatch: expected 1, got 64; portrait description missed required explicit detail tokens |
| F8 | @cf/meta/llama-3.3-70b-instruct-fp8-fast | 1 | no | ok | D | (none) | instruction count mismatch: expected 1, got 0; portrait description missed required explicit detail tokens |
| F10 | @cf/openai/gpt-oss-120b | 2 | yes | invalid_proposal | F | (none) | portrait description missed required explicit detail tokens |
| F10 | @cf/meta/llama-3.3-70b-instruct-fp8-fast | 1 | no | ok | D | [{"kind":"field","op":"replace","sourceLabel":"C","replacementLabel":"V"}] | instruction count mismatch: expected 0, got 1; forbidden op appeared in the final result: field.replace |
| F11 | @cf/openai/gpt-oss-120b | 1 | no | ok | D | [{"kind":"field","op":"replace","sourceLabel":"C","replacementLabel":"V"},{"kind":"field","op":"set_value","targetLabel":"V","value":15},{"kind":"name","value":"Gruk"}] | instruction count mismatch: expected 4, got 3; instruction order differs from the stated request order; portrait description missed required explicit detail tokens |
| F11 | @cf/meta/llama-3.3-70b-instruct-fp8-fast | 1 | no | ok | D | [{"kind":"field","op":"replace","sourceLabel":"C","replacementLabel":"V"},{"kind":"field","op":"set_value","targetLabel":"V","value":15},{"kind":"name","value":"Gruk"}] | instruction count mismatch: expected 4, got 3; instruction order differs from the stated request order; portrait description missed required explicit detail tokens |
| F12 | @cf/openai/gpt-oss-120b | 2 | yes | ok | D | [{"kind":"field","op":"replace","sourceLabel":"S","replacementLabel":"V"},{"kind":"field","op":"replace","sourceLabel":"S","replacementLabel":"V"},{"kind":"name","value":"Gruk"}] | instruction kind multiset mismatch; instruction order differs from the stated request order |
| F12 | @cf/meta/llama-3.3-70b-instruct-fp8-fast | 1 | no | ok | D | [{"kind":"field","op":"replace","sourceLabel":"C","replacementLabel":"V"},{"kind":"field","op":"set_value","targetLabel":"V","value":15},{"kind":"name","value":"G"}] | instruction parameter multiset mismatch; instruction order differs from the stated request order |

## Performance comparison

| Metric | GPT-OSS 120B | Llama 3.3 70B |
| --- | --- | --- |
| Critical passes / 7 | 1 | 1 |
| First-attempt passes / 7 | 1 | 1 |
| Replays | 4 | 0 |
| Replay recoveries | 3 | 0 |
| Schema failures | 1 | 0 |
| JSON parse failures | 3 | 0 |
| Provider/transport errors | 0 | 0 |
| Semantic failures | 5 | 6 |
| Total calls | 11 | 7 |
| Total latency (ms) | 231738.25 | 22400.69 |
| Mean fixture latency (ms) | 33105.46 | 3200.10 |
| Median fixture latency (ms) | 32844.46 | 3092.14 |
| Max fixture latency (ms) | 80842.65 | 4523.07 |
| Mean first-attempt latency (ms) | 19996.18 | 3198.88 |
| Token usage | N/A (provider did not expose usage) | N/A (provider did not expose usage) |

p95 fixture latency: not meaningful with 7 samples per model; max shown above for reference.

## Model classifications

GPT-OSS 120B: **FAILS EXTRACTION CONTRACT** (1/7 critical)
Llama 3.3 70B: **FAILS EXTRACTION CONTRACT** (1/7 critical)

## Historical Scout reference (2C2B, untouched artifacts)

Scout: 2/13 overall, 0/7 critical. Included for context only; not part of this matrix.

## Comparison classification

PHASE 14.5 2C2C COMPLETE — MODEL SEARCH STOPPED FOR PHASE 14.5
