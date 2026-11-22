# csv-reader-speed-01 — a faster drop-in for csv-reader 1.0.0

[![bounty](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/chengyuanpeng/csv-reader-speed-01-run-20261121-entry/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/chengyuanpeng/csv-reader-speed-01-run-20261121-entry/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

An entry for the make.fun bounty [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121):
answer every case exactly as make.fun's own csv-reader 1.0.0 answers it — the same
`{columns, rows, errors}` for every input, broken rows and all — and do it in less CPU
time than the reference.

## How it works

`solve.js` is a dependency-free ES module exporting `run(input)`. Where the reference
walks the text one character at a time and grows each field character by character, this
reader jumps straight to the next character that can change the reading — a comma, a
quote, an LF or a CR — with `String.indexOf`, and copies each uninterrupted run of a
field with a single `slice`. A field with no surprises costs one slice; stray CRs,
doubled quotes and junk after a closing quote stitch a few slices together on the rare
paths that need them. All of the reference's edge behaviour is reproduced exactly:

- a leading U+FEFF is dropped; blank lines hold no record;
- a lone CR outside quotes is dropped and reported as `stray_cr`;
- inside quotes, `""` is one quote and each CRLF or lone CR reads as one LF;
- text after a closing quote is appended as it stands (`quote_junk`);
- a quote that never closes turns literal and the field is re-read unquoted
  (`unterminated_quote`);
- rows are padded or cut to the first record's width (`short_row` / `long_row`), and
  every error carries the line its record starts on and the record's row index.

`main.ts` is the harness driver: it reads `/input/cases.json`, answers each case with
`run`, and writes `/output/answers.json`.

## Layout

- `main.ts` — the driver the harness runs (`node main.ts`, Node 22)
- `solve.js` — the reader itself
- `LICENSE` — MIT
