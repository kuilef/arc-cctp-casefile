import "./style.css";
import {
  appendCasefile,
  importCasefile,
  serializeCasefile,
  MAX_CASEFILE_BYTES,
  markdown,
  type Casefile,
  type Input,
  type ObservationOrigin,
} from "./casefile";
const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const source = get<HTMLInputElement>("source"),
  destination = get<HTMLInputElement>("destination"),
  notice = get("notice"),
  selector = get<HTMLSelectElement>("message-select");
let current: Input | undefined;
let currentOrigin: ObservationOrigin = "imported-unverified";
let file: Casefile | undefined;
function element(tag: string, text = "", cls = "") {
  const e = document.createElement(tag);
  e.textContent = text;
  e.className = cls;
  return e;
}
function consume(input: Input, origin: ObservationOrigin) {
  const next = appendCasefile(
    input,
    file?.sourceHash.toLowerCase() === input.sourceHash.toLowerCase()
      ? file
      : undefined,
    undefined,
    origin,
  );
  file = next;
  current = input;
  currentOrigin = origin;
  render();
}
function render() {
  if (!file) return;
  const last = file.observations.at(-1);
  if (!last) return;
  const analysis = last.analysis;
  notice.textContent =
    last.origin === "fixture-replay"
      ? `SYNTHETIC FIXTURE · ${analysis.summary}. This is an invented test case. No live transfer was verified.`
      : last.origin === "live-collected"
        ? `PUBLIC PROVIDER OBSERVATION · ${analysis.summary}. Collected ${last.recordedAt}.`
        : `IMPORTED UNVERIFIED · ${analysis.summary}. Imported data is untrusted; analysis was recomputed locally. Recorded ${last.recordedAt}.`;
  const evidence = get("evidence");
  evidence.replaceChildren();
  for (const [index, key, title] of [
    [1, "source", "Source burn"],
    [2, "attestation", "Circle attestation"],
    [3, "destination", "Destination execution"],
  ] as const) {
    const stage = analysis[key];
    const card = element("section", "", "panel stage");
    const head = element("div", "", "stage-head");
    head.append(
      element("div", String(index).padStart(2, "0"), "step"),
      element("h3", title),
      element("span", stage.status, `badge ${stage.status}`),
    );
    card.append(head, element("p", stage.reason));
    if (key === "destination" && stage.status === "observed") {
      const metrics = element("div", "", "metrics");
      for (const [k, label] of [
        ["gross", "Burned · gross"],
        ["net", "Recipient · net"],
        ["fee", "Receiver fee"],
      ]) {
        const metric = element("div", `${stage[k]} units6`, "metric");
        metric.append(element("small", label));
        metrics.append(metric);
      }
      card.append(metrics);
    }
    const details = element("details");
    details.append(
      element("summary", "Inspect evidence fields"),
      element("pre", JSON.stringify(stage, null, 2)),
    );
    card.append(details);
    evidence.append(card);
  }
  const choices = analysis.source.choices ?? [];
  get("selection-panel").hidden = choices.length < 2;
  selector.replaceChildren(new Option("Choose explicitly…", ""));
  for (const c of choices)
    selector.add(
      new Option(`MessageSent logIndex ${c.logIndex}`, String(c.logIndex)),
    );
  selector.value =
    current?.logIndex === undefined ? "" : String(current.logIndex);
  get("exports").hidden = false;
  const history = get("history");
  history.replaceChildren();
  for (const [i, o] of file.observations.entries())
    history.append(
      element(
        "div",
        `${i + 1}. ${o.recordedAt} · ${o.origin} · source log ${o.input.logIndex ?? o.analysis.source.logIndex ?? "unselected"} · ${o.analysis.destination.status}`,
        "history-row",
      ),
    );
}
get<HTMLFormElement>("case-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = get<HTMLButtonElement>("collect");
  button.disabled = true;
  notice.textContent = "Reading fixed official RPCs and Circle Iris…";
  try {
    const params = new URLSearchParams({ source: source.value.trim() });
    if (destination.value.trim())
      params.set("destination", destination.value.trim());
    const r = await fetch(`/api/case?${params}`, { credentials: "omit" });
    if (!r.ok)
      throw Error(
        `Collection unavailable (${r.status}). A 429 means the demo is busy; wait at least 90 seconds. Other failures leave earlier observations intact.`,
      );
    consume(await r.json(), "live-collected");
  } catch (err) {
    notice.textContent = (err as Error).message;
  } finally {
    button.disabled = false;
  }
});
get("replay").addEventListener("click", async () => {
  try {
    const r = await fetch(
      `/fixtures/${get<HTMLSelectElement>("sample").value}.json`,
    );
    if (!r.ok) throw Error("Fixture unavailable");
    const input: Input = await r.json();
    source.value = input.sourceHash;
    destination.value = input.destinationHash ?? "";
    consume(input, "fixture-replay");
  } catch (err) {
    notice.textContent = (err as Error).message;
  }
});
selector.addEventListener("change", () => {
  try {
    if (current && selector.value !== "")
      consume({ ...current, logIndex: Number(selector.value) }, currentOrigin);
  } catch (err) {
    notice.textContent = (err as Error).message;
  }
});
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
get("json").addEventListener("click", () => {
  if (file)
    download(
      "arc-cctp-casefile.json",
      serializeCasefile(file),
      "application/json",
    );
});
get("markdown").addEventListener("click", () => {
  if (file) download("arc-cctp-casefile.md", markdown(file), "text/markdown");
});
get<HTMLInputElement>("import").addEventListener("change", async (e) => {
  try {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    if (f.size > MAX_CASEFILE_BYTES)
      throw Error("Import exceeds casefile byte budget (2 MB)");
    const parsed: Casefile = importCasefile(await f.text());
    if (
      parsed.schemaVersion !== 1 ||
      parsed.route !== "base-arc-mainnet" ||
      !/^0x[\da-f]{64}$/i.test(parsed.sourceHash) ||
      !Array.isArray(parsed.observations) ||
      parsed.observations.length < 1 ||
      parsed.observations.length > 100
    )
      throw Error("Invalid casefile");
    for (const o of parsed.observations) {
      if (o.input.sourceHash.toLowerCase() !== parsed.sourceHash.toLowerCase())
        throw Error("Mixed source history");
    }
    file = parsed;
    current = file.observations.at(-1)?.input;
    currentOrigin = "imported-unverified";
    if (!current) throw Error("Empty history");
    source.value = file.sourceHash;
    destination.value = current.destinationHash ?? "";
    render();
  } catch (err) {
    notice.textContent = `Import rejected: ${(err as Error).message}`;
  }
});
