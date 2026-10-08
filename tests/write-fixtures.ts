import { mkdir, writeFile } from "node:fs/promises";
import { fixture, obs, event, message, pad, address } from "./helpers";
await mkdir("fixtures", { recursive: true });
const completed = fixture();
const unobserved = fixture();
unobserved.destination = obs(null, "not_requested");
const unavailable = fixture();
unavailable.iris = obs(null, "http_429");
const multi = fixture();
multi.source.value.logs.push(
  event(
    "MessageSent",
    { message: message({ mintRecipient: pad(address("e")) }) },
    7,
  ),
);
for (const [name, input] of Object.entries({
  completed,
  unobserved,
  unavailable,
  multi,
}))
  await writeFile(
    `fixtures/${name}.json`,
    `${JSON.stringify(input, null, 2)}\n`,
  );
