import { decodeEventLog, toEventSelector, type Hex } from "viem";
import { ABI } from "./abi";
import { ARC, BASE } from "./profiles";
import {
  as32,
  decodeMessage,
  eq,
  immutableDiff,
  ZERO,
  type Message,
} from "./message";
export type Observation = {
  status: string;
  observedAt: string;
  provenance: string;
  value: any;
  httpStatus?: number;
  retryAfter?: string;
  error?: string;
};
export type Input = {
  mode: string;
  sourceHash: string;
  destinationHash?: string;
  logIndex?: number;
  sourceChain: Observation;
  destinationChain: Observation;
  source: Observation;
  iris: Observation;
  destination: Observation;
  head: Observation;
  usedNonce?: Observation;
};
type Stage = { status: string; reason: string; [key: string]: any };
function stage(
  status: string,
  reason: string,
  extra: Record<string, any> = {},
): Stage {
  return { status, reason, ...extra };
}
function receiptMatches(r: any, requestedHash: string | undefined) {
  return (
    r !== null &&
    typeof r === "object" &&
    !Array.isArray(r) &&
    typeof requestedHash === "string" &&
    /^0x[\da-f]{64}$/i.test(requestedHash) &&
    typeof r.transactionHash === "string" &&
    /^0x[\da-f]{64}$/i.test(r.transactionHash) &&
    eq(r.transactionHash, requestedHash) &&
    (r.status === "0x0" || r.status === "0x1")
  );
}
function events(r: any) {
  if (!r || !Array.isArray(r.logs) || r.logs.length > 5000)
    throw Error("malformed_receipt");
  if (
    !/^0x[\da-f]{64}$/i.test(r.transactionHash) ||
    !/^0x[\da-f]{64}$/i.test(r.blockHash) ||
    !/^0x[\da-f]+$/i.test(r.blockNumber)
  )
    throw Error("missing_receipt_identity");
  const seen = new Set();
  return r.logs
    .map((l: any) => {
      if (
        !eq(l.transactionHash, r.transactionHash) ||
        !eq(l.blockHash, r.blockHash) ||
        !eq(l.blockNumber, r.blockNumber) ||
        l.removed !== false ||
        !/^0x[\da-f]+$/i.test(l.logIndex)
      )
        throw Error("log_receipt_provenance_mismatch");
      const index = Number(BigInt(l.logIndex));
      if (!Number.isSafeInteger(index) || seen.has(index))
        throw Error("duplicate_or_invalid_log_index");
      seen.add(index);
      try {
        const e = decodeEventLog({
          abi: ABI,
          data: l.data as Hex,
          topics: l.topics,
          strict: true,
        });
        return {
          name: e.eventName,
          args: e.args as any,
          index,
          address: l.address,
        };
      } catch {
        const known = ABI.find((e) => eq(toEventSelector(e), l.topics?.[0]));
        if (
          known &&
          (["MessageSent", "MessageReceived"].includes(known.name)
            ? eq(l.address, BASE.mt)
            : ["DepositForBurn", "MintAndWithdraw"].includes(known.name) &&
              eq(l.address, BASE.tm))
        )
          throw Error("malformed_canonical_evidence_event");
        return { name: "unrecognized", args: {}, index, address: l.address };
      }
    })
    .sort((a: any, b: any) => a.index - b.index);
}
function route(m: Message) {
  if (m.sourceDomain !== BASE.domain || m.destinationDomain !== ARC.domain)
    throw Error("unsupported_route");
  if (
    !eq(m.sender, as32(BASE.tm)) ||
    !eq(m.recipient, as32(ARC.tm)) ||
    !eq(m.burnToken, as32(BASE.token))
  )
    throw Error("route_contract_or_token_mismatch");
  if (
    m.mintRecipient === ZERO ||
    BigInt(m.amount) <= 0n ||
    BigInt(m.maxFee) >= BigInt(m.amount)
  )
    throw Error("invalid_burn_amount_recipient_or_max_fee");
}
export function evaluate(input: Input) {
  const coverage = {
    kind: "one_user_supplied_destination_receipt",
    destinationHash: input.destinationHash ?? null,
    scannedBlocks: 0,
    scope: "No chain search. Absence is unobserved, never unminted.",
  };
  const result = {
    summary: "unknown",
    source: stage("unknown", "Source evidence unavailable."),
    attestation: stage(
      "unavailable",
      "Circle observation has not been bound to a source message.",
    ),
    destination: stage(
      "unobserved",
      "No matching destination execution proven.",
    ),
    coverage,
    limitations: [
      "RPC and Iris responses are provider observations, not independently verified consensus.",
      "Attestation availability is reported by Iris; signatures are not locally cryptographically verified.",
      "Observed execution does not establish current wallet balance, spendability or application hook completion.",
      "Used nonce alone never proves this payout.",
    ],
  };
  if (
    input.sourceChain.status !== "ok" ||
    input.destinationChain.status !== "ok"
  ) {
    result.summary = "network_unknown";
    result.source = stage(
      "network_unknown",
      "Both chain IDs must be observed before interpreting receipts.",
    );
    return result;
  }
  if (
    !eq(input.sourceChain.value, "0x2105") ||
    !eq(input.destinationChain.value, "0x13b2")
  ) {
    result.summary = "wrong_network";
    result.source = stage(
      "wrong_network",
      "Expected Base 8453 and Arc 5042. Evidence interpretation stopped.",
    );
    return result;
  }
  if (input.source.status !== "ok") {
    result.source = stage(
      input.source.status,
      "Exact source RPC outcome retained.",
    );
    return result;
  }
  const sr = input.source.value;
  if (sr === null) {
    result.source = stage(
      "null_receipt",
      "Source RPC returned null; missing, pending or unavailable cannot be distinguished.",
    );
    return result;
  }
  if (!receiptMatches(sr, input.sourceHash)) {
    result.source = stage(
      "unknown",
      "Invalid source receipt object, status or transaction identity.",
    );
    return result;
  }
  if (sr.status === "0x0") {
    result.source = stage(
      "failed_receipt",
      "Source receipt reports execution failure.",
    );
    return result;
  }
  let m: Message;
  let selected: any;
  let identicalSourceLogs: number[] = [];
  try {
    const es = events(sr);
    const sent = es.filter(
      (e: any) => e.name === "MessageSent" && eq(e.address, BASE.mt),
    );
    const choices = sent.map((e: any) => ({
      logIndex: e.index,
      message: e.args.message,
    }));
    if (sent.length > 1 && input.logIndex === undefined) {
      result.source = stage(
        "selection_required",
        "Select a MessageSent logIndex explicitly.",
        { choices },
      );
      return result;
    }
    selected =
      input.logIndex === undefined
        ? sent[0]
        : sent.find((e: any) => e.index === input.logIndex);
    if (!selected) throw Error("source_message_not_found");
    m = decodeMessage(selected.args.message);
    route(m);
    identicalSourceLogs = sent.flatMap((e: any) => {
      try {
        return immutableDiff(m, decodeMessage(e.args.message)).length === 0
          ? [e.index]
          : [];
      } catch {
        return [];
      }
    });
    if (
      m.nonce !== ZERO ||
      m.finalityThresholdExecuted !== 0 ||
      m.feeExecuted !== "0" ||
      m.expirationBlock !== "0"
    )
      throw Error("unexpected_source_assigned_fields");
    const next =
      sent.find((e: any) => e.index > selected.index)?.index ?? Infinity;
    const burns = es.filter(
      (e: any) =>
        e.name === "DepositForBurn" &&
        eq(e.address, BASE.tm) &&
        e.index > selected.index &&
        e.index < next,
    );
    const matched = burns.filter(
      (e: any) =>
        eq(as32(e.args.burnToken), m.burnToken) &&
        eq(e.args.amount, m.amount) &&
        eq(as32(e.args.depositor), m.messageSender) &&
        eq(e.args.mintRecipient, m.mintRecipient) &&
        eq(e.args.destinationDomain, m.destinationDomain) &&
        eq(e.args.destinationTokenMessenger, m.recipient) &&
        eq(e.args.destinationCaller, m.destinationCaller) &&
        eq(e.args.maxFee, m.maxFee) &&
        eq(e.args.minFinalityThreshold, m.minFinalityThreshold) &&
        eq(e.args.hookData, m.hookData),
    );
    if (matched.length !== 1)
      throw Error(
        matched.length
          ? "ambiguous_source_burn"
          : "source_burn_message_mismatch",
      );
    result.source = stage(
      "proven",
      "Successful Base receipt contains canonical MessageSent and matching DepositForBurn.",
      {
        logIndex: selected.index,
        burnLogIndex: matched[0].index,
        blockHash: sr.blockHash,
        blockNumber: sr.blockNumber,
        message: m,
        choices,
      },
    );
  } catch (e) {
    result.source = stage("unknown", String((e as Error).message));
    return result;
  }
  if (identicalSourceLogs.length > 1) {
    result.attestation = stage(
      "ambiguous",
      "Multiple source messages share immutable fields; this nonce cannot be bound to the selected burn.",
      { sourceLogIndices: identicalSourceLogs },
    );
    return result;
  }
  if (input.iris.status !== "ok" || !input.iris.value) {
    result.attestation = stage(
      "unavailable",
      `Exact Iris outcome: ${input.iris.status}`,
    );
    return result;
  }
  let attested: Message;
  try {
    const ir = input.iris.value;
    if (
      !eq(ir.sourceTxHash, input.sourceHash) ||
      !Array.isArray(ir.messages) ||
      ir.messages.length > 100
    )
      throw Error("iris_source_identity_or_shape_mismatch");
    const candidates = ir.messages.flatMap((x: any) => {
      try {
        const msg = decodeMessage(x.message);
        return immutableDiff(m, msg).length === 0 ? [{ entry: x, msg }] : [];
      } catch {
        return [];
      }
    });
    if (candidates.length > 1) {
      result.attestation = stage(
        "ambiguous",
        "Multiple Iris messages share source immutable fields; nonce cannot be assigned safely.",
      );
      return result;
    }
    if (candidates.length !== 1)
      throw Error("iris_immutable_binding_not_proven");
    const { entry, msg } = candidates[0];
    attested = msg;
    if (entry.cctpVersion !== 2) throw Error("unsupported_iris_cctp_version");
    route(attested);
    if (
      entry.status !== "complete" ||
      !/^0x(?:[\da-fA-F]{130})+$/.test(entry.attestation ?? "")
    ) {
      result.attestation = stage(
        "pending",
        `Iris reported ${String(entry.status)}; complete attestation bytes unavailable.`,
        { irisStatus: entry.status },
      );
      return result;
    }
    const finality = attested.minFinalityThreshold <= 1000 ? 1000 : 2000;
    if (
      attested.nonce === ZERO ||
      ![1000, 2000].includes(attested.finalityThresholdExecuted) ||
      attested.finalityThresholdExecuted < finality ||
      BigInt(attested.feeExecuted) > BigInt(attested.maxFee) ||
      BigInt(attested.feeExecuted) >= BigInt(attested.amount)
    )
      throw Error("invalid_attested_nonce_finality_or_fee");
    const expiry = BigInt(attested.expirationBlock);
    const expired =
      expiry !== 0n &&
      input.head.status === "ok" &&
      BigInt(input.head.value) >= expiry;
    result.attestation = stage(
      expired ? "expired" : "available",
      expired
        ? "Iris reported a complete attestation whose expiration block has passed at the observed Arc head."
        : "Iris reported complete attestation bytes; immutable source fields match. This is not delivery.",
      {
        irisStatus: entry.status,
        nonce: attested.nonce,
        message: attested,
        expirationCheck:
          expiry === 0n
            ? "no_expiration"
            : input.head.status === "ok"
              ? expired
                ? "expired"
                : "not_expired_at_observed_head"
              : "unknown",
        allowedMutations: [
          "nonce",
          "finalityThresholdExecuted",
          "feeExecuted",
          "expirationBlock",
        ],
      },
    );
  } catch (e) {
    result.attestation = stage("unknown", (e as Error).message);
    return result;
  }
  if (input.destination.status === "not_requested") {
    result.summary = "source_proven_destination_unobserved";
    return result;
  }
  if (input.destination.status !== "ok") {
    result.destination = stage(
      input.destination.status,
      "Exact destination RPC outcome retained; execution not proven.",
    );
    return result;
  }
  const dr = input.destination.value;
  if (dr === null) {
    result.destination = stage(
      "null_receipt",
      "Destination RPC returned null; execution not observed.",
    );
    return result;
  }
  if (!receiptMatches(dr, input.destinationHash)) {
    result.destination = stage(
      "unknown",
      "destination_receipt_identity_or_status_mismatch",
    );
    return result;
  }
  if (dr.status === "0x0") {
    result.destination = stage(
      "failed_receipt",
      "Supplied destination receipt reports failure; another execution may exist outside this coverage.",
    );
    return result;
  }
  try {
    const es = events(dr);
    const received = es.filter(
      (e: any) => e.name === "MessageReceived" && eq(e.address, ARC.mt),
    );
    const matching = received.filter(
      (e: any) =>
        eq(e.args.nonce, attested.nonce) &&
        eq(e.args.sourceDomain, m.sourceDomain) &&
        eq(e.args.sender, m.sender) &&
        eq(
          e.args.finalityThresholdExecuted,
          attested.finalityThresholdExecuted,
        ) &&
        eq(e.args.messageBody, attested.body) &&
        (m.destinationCaller === ZERO ||
          eq(as32(e.args.caller), m.destinationCaller)),
    );
    if (matching.length !== 1)
      throw Error(
        matching.length
          ? "ambiguous_destination_receive"
          : "matching_destination_receive_unobserved",
      );
    const receive = matching[0];
    if (
      BigInt(attested.expirationBlock) !== 0n &&
      BigInt(dr.blockNumber) >= BigInt(attested.expirationBlock)
    )
      throw Error("destination_execution_after_message_expiration");
    const prev =
      received.filter((e: any) => e.index < receive.index).at(-1)?.index ?? -1;
    const mints = es.filter(
      (e: any) =>
        e.name === "MintAndWithdraw" &&
        eq(e.address, ARC.tm) &&
        e.index > prev &&
        e.index < receive.index,
    );
    const net = (BigInt(m.amount) - BigInt(attested.feeExecuted)).toString();
    if (mints.length !== 1)
      throw Error("ambiguous_or_missing_destination_mint");
    const mint = mints[0];
    if (
      !eq(as32(mint.args.mintRecipient), m.mintRecipient) ||
      !eq(mint.args.mintToken, ARC.token) ||
      !eq(mint.args.amount, net) ||
      !eq(mint.args.feeCollected, attested.feeExecuted)
    )
      throw Error("destination_recipient_token_net_fee_mismatch");
    result.destination = stage(
      "observed",
      "Canonical Arc MessageReceived and uniquely associated MintAndWithdraw match nonce, body, caller, recipient, token, net and fee.",
      {
        transactionHash: dr.transactionHash,
        blockHash: dr.blockHash,
        blockNumber: dr.blockNumber,
        receiveLogIndex: receive.index,
        mintLogIndex: mint.index,
        recipient: m.mintRecipient,
        token: ARC.token,
        gross: m.amount,
        net,
        fee: attested.feeExecuted,
        units: "USDC ERC-20 units (6 decimals)",
        caller: receive.args.caller,
      },
    );
    result.summary = "destination_execution_observed";
  } catch (e) {
    result.destination = stage("unknown", (e as Error).message);
  }
  return result;
}
export type ObservationOrigin =
  | "fixture-replay"
  | "live-collected"
  | "imported-unverified";
export type Casefile = {
  schemaVersion: 1;
  route: "base-arc-mainnet";
  sourceHash: string;
  observations: {
    recordedAt: string;
    origin: ObservationOrigin;
    input: Input;
    analysis: ReturnType<typeof evaluate>;
  }[];
};
export const MAX_CASEFILE_BYTES = 2_000_000;
function boundedText(text: string) {
  if (new TextEncoder().encode(text).byteLength > MAX_CASEFILE_BYTES)
    throw Error("casefile_byte_limit_2000000_download_and_start_new_casefile");
  return text;
}
export function serializeCasefile(file: Casefile) {
  const text = boundedText(`${JSON.stringify(file, null, 2)}\n`);
  // Reserve the longer import marker so every own export can be reimported.
  boundedText(
    `${JSON.stringify(
      {
        ...file,
        observations: file.observations.map((o) => ({
          ...o,
          origin: "imported-unverified",
        })),
      },
      null,
      2,
    )}\n`,
  );
  return text;
}
export function importCasefile(text: string): Casefile {
  return normalizeCasefile(JSON.parse(boundedText(text)), true);
}
export function normalizeCasefile(
  previous: Casefile,
  imported = false,
): Casefile {
  if (
    previous?.schemaVersion !== 1 ||
    previous.route !== "base-arc-mainnet" ||
    !/^0x[\da-f]{64}$/i.test(previous.sourceHash) ||
    !Array.isArray(previous.observations) ||
    previous.observations.length < 1 ||
    previous.observations.length > 100
  )
    throw Error("incompatible_casefile_history");
  serializeCasefile(previous);
  const observations = previous.observations.map((o) => {
    if (
      !o?.input ||
      !eq(o.input.sourceHash, previous.sourceHash) ||
      typeof o.recordedAt !== "string" ||
      !Number.isFinite(Date.parse(o.recordedAt))
    )
      throw Error("invalid_history_observation");
    for (const key of [
      "sourceChain",
      "destinationChain",
      "source",
      "iris",
      "destination",
      "head",
    ] as const) {
      const x = o.input[key];
      if (
        !x ||
        typeof x.status !== "string" ||
        typeof x.observedAt !== "string" ||
        !Number.isFinite(Date.parse(x.observedAt)) ||
        typeof x.provenance !== "string"
      )
        throw Error("invalid_history_provenance");
    }
    const origin: ObservationOrigin =
      imported ||
      !["fixture-replay", "live-collected", "imported-unverified"].includes(
        o.origin,
      )
        ? "imported-unverified"
        : o.origin;
    return { ...o, origin, analysis: evaluate(o.input) };
  });
  const normalized = { ...previous, observations };
  serializeCasefile(normalized);
  return normalized;
}
export function appendCasefile(
  input: Input,
  previous?: Casefile,
  now = new Date().toISOString(),
  origin: ObservationOrigin = "imported-unverified",
): Casefile {
  if ((previous?.observations?.length ?? 0) >= 100)
    throw Error("history_limit_100_download_and_start_new_casefile");
  if (
    previous &&
    (previous.schemaVersion !== 1 ||
      previous.route !== "base-arc-mainnet" ||
      !eq(previous.sourceHash, input.sourceHash) ||
      !Array.isArray(previous.observations) ||
      previous.observations.length > 100)
  )
    throw Error("incompatible_casefile_history");
  const next: Casefile = {
    schemaVersion: 1,
    route: "base-arc-mainnet",
    sourceHash: input.sourceHash,
    observations: [
      ...(previous ? normalizeCasefile(previous).observations : []),
      { recordedAt: now, origin, input, analysis: evaluate(input) },
    ],
  };
  serializeCasefile(next);
  return next;
}
export function markdown(file: Casefile) {
  serializeCasefile(file);
  return boundedText(
    [
      `# Arc CCTP Casefile`,
      `Route: Base mainnet → Arc mainnet`,
      `Source: ${file.sourceHash}`,
      `Observations: ${file.observations.length}`,
      `Provider evidence; no recovery or funds return promise.`,
      ...file.observations.flatMap((o, i) => [
        `\n## Observation ${i + 1} — ${o.recordedAt} (${o.origin})`,
        `- Local origin: ${o.origin}. Input-declared mode is informational only. Imported observations are unverified.`,
        ...(["source", "attestation", "destination"] as const).map(
          (k) =>
            `- ${k}: **${o.analysis[k].status}** — ${o.analysis[k].reason}`,
        ),
        `- Coverage: ${JSON.stringify(o.analysis.coverage)}`,
        `- Provenance: ${JSON.stringify(
          Object.fromEntries(
            [
              "sourceChain",
              "destinationChain",
              "source",
              "iris",
              "destination",
              "head",
            ].map((k) => {
              const x = (o.input as any)[k];
              return [
                k,
                {
                  status: x.status,
                  observedAt: x.observedAt,
                  provenance: x.provenance,
                  httpStatus: x.httpStatus,
                  retryAfter: x.retryAfter,
                  error: x.error,
                },
              ];
            }),
          ),
        )}`,
        `- Evidence details: ${JSON.stringify({ source: o.analysis.source, destination: o.analysis.destination, attestation: o.analysis.attestation })}`,
        ...o.analysis.limitations.map((x) => `- Limit: ${x}`),
      ]),
      "",
    ].join("\n"),
  );
}
