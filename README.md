# csv-reader-speed-01 — fast drop-in for csv-reader 1.0.0

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/vinzagent/csv-reader-speed-01-run-20261121-entry/rank.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/vinzagent/csv-reader-speed-01-run-20261121-entry/reward.svg)](https://make.fun/c/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, written for the
[csv-reader-speed-01-run-20261121](https://make.fun/c/csv-reader-speed-01-run-20261121)
competition on [make.fun](https://make.fun). It answers exactly as csv-reader
does on every input — same `{columns, rows, errors}` for every `{text, header}`,
including all of its broken-row policy (stray CRs, unterminated quotes,
quote junk, short/long rows) — and reads the file much faster.

## How it is fast

- Plain records (no quote, no stray CR — the large majority of rows) are taken
  whole: one slice of the line and one `split(',')`, instead of one character
  at a time.
- Records that do hold a quote or a stray CR are read field by field, jumping
  with `indexOf` to the next separator instead of stepping character by
  character; only the rare newline-bearing quoted segment is walked closely.

## Layout

- `solve.js` — the parser; `run(input)` returns csv-reader's answer.
- `main.ts` — the harness driver (the kit's driver, unchanged): reads every
  case from `/input/cases.json`, answers each with `run`, writes
  `/output/answers.json`.

## Local check

On the kit's practice set the entry passes 6/6 cases and runs the parser about
4x faster than the house baseline in a fresh process (median ~210 ms vs ~850 ms
for csv-reader 1.0.0 on this machine; whole-program wall time ~0.9 s vs ~1.5 s).

## License

MIT — see [LICENSE](LICENSE).
