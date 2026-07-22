# Ashfall

Ashfall is Piro's first experiment in the alphabetic experiment series.

Each experiment owns the complete Piro research surface:

- `benchmarks/` — evaluation protocols and reports.
- `sources/` — dataset-generating source programs.
- `architectures/` — model architecture definitions.

The first source is `associative-recall`, which generates ordered
`PiroInput` observation packets for persistent-memory evaluation.

Each JSONL record has exactly this top-level shape:

```json
{
  "inputs": [
    { "parts": [{ "type": "text", "text": "key_017 = value_014" }] },
    { "parts": [{ "type": "text", "text": "token_005_027" }] },
    { "parts": [{ "type": "text", "text": "key_017" }] }
  ]
}
```

The source does not emit `write`, `distractors`, `query`, `label`, or role
metadata fields. The semantic role of each observation is inferable from its
content and ordered position in the input sequence.
