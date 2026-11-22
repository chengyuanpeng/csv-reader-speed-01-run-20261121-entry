// The harness driver: node runs this file (main.ts) in the sandbox. It loads every case
// from cases.json in the input directory, answers each one on its own with run() from
// solve.js, and writes the answers, in the cases' order, as JSON to the output directory.
// Outside the sandbox MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR name the two directories.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setFlagsFromString } from "node:v8";

// Run the parse with V8's incremental marking off, as the house baseline's driver does,
// so garbage collection pauses do not land inside the timed parse.
setFlagsFromString("--no-incremental-marking");

const solve = (await import(new URL("./solve.js", import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? "/input";
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

const cases = JSON.parse(readFileSync(join(inputDir, "cases.json"), "utf8")) as {
  id: string;
  input: unknown;
}[];

const answers: unknown[] = new Array(cases.length);
for (let k = 0; k < cases.length; k += 1) {
  answers[k] = solve.run(cases[k].input);
}

writeFileSync(join(outputDir, "answers.json"), JSON.stringify(answers));
