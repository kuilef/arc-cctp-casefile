import { readFile, writeFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  appendCasefile,
  importCasefile,
  serializeCasefile,
  MAX_CASEFILE_BYTES,
  markdown,
  type Input,
  type Casefile,
  type ObservationOrigin,
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
async function readBounded(path: string) {
  if ((await stat(path)).size > MAX_CASEFILE_BYTES)
    throw Error("casefile_byte_limit_2000000");
  return readFile(path, "utf8");
}
if (values.fixture) input = JSON.parse(await readBounded(values.fixture));
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
  ? importCasefile(await readBounded(values.previous))
  : undefined;
const origin: ObservationOrigin = values.fixture
  ? "fixture-replay"
  : "live-collected";
const file = appendCasefile(input, previous, undefined, origin);
const output = values.markdown ? markdown(file) : serializeCasefile(file);
if (values.out) await writeFile(values.out, output);
else console.log(output);
