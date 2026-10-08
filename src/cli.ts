import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  appendCasefile,
  markdown,
  type Input,
  type Casefile,
} from "./casefile";
import { collect } from "./collector";
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    destination: { type: "string" },
    logIndex: { type: "string" },
    fixture: { type: "string" },
    previous: { type: "string" },
    out: { type: "string" },
    markdown: { type: "boolean" },
  },
});
let input: Input;
if (values.fixture) input = JSON.parse(await readFile(values.fixture, "utf8"));
else if (values.source)
  input = await collect(
    values.source,
    values.destination,
    values.logIndex === undefined ? undefined : Number(values.logIndex),
  );
else
  throw Error(
    "Use --fixture fixtures/completed.json, or --source PUBLIC_SOURCE_HASH [--destination PUBLIC_DESTINATION_HASH] [--logIndex N].",
  );
if (values.fixture && values.logIndex !== undefined)
  input.logIndex = Number(values.logIndex);
const previous: Casefile | undefined = values.previous
  ? JSON.parse(await readFile(values.previous, "utf8"))
  : undefined;
const file = appendCasefile(input, previous);
const output = values.markdown ? markdown(file) : JSON.stringify(file, null, 2);
if (values.out) await writeFile(values.out, `${output}\n`);
else console.log(output);
