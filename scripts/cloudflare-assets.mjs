import { cp } from "node:fs/promises";
await cp("fixtures", "dist/fixtures", { recursive: true });
