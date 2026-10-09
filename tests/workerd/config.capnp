using Workerd = import "/workerd/workerd.capnp";

# No sockets or external network services. All upstreams are synthetic fixtures.
const config :Workerd.Config = (
  services = [
    (name = "success", worker = (
      compatibilityDate = "2026-10-09",
      modules = [
        (name = "test.mjs", esModule = embed "smoke.mjs"),
        (name = "worker.js", esModule = embed "../../dist/_worker.js")
      ],
      bindings = [(name = "MODE", text = "success")],
      globalOutbound = (name = "success", entrypoint = "upstream")
    )),
    (name = "redirect", worker = (
      compatibilityDate = "2026-10-09",
      modules = [
        (name = "test.mjs", esModule = embed "smoke.mjs"),
        (name = "worker.js", esModule = embed "../../dist/_worker.js")
      ],
      bindings = [(name = "MODE", text = "redirect")],
      globalOutbound = (name = "redirect", entrypoint = "upstream")
    )),
    (name = "publicnode", worker = (
      compatibilityDate = "2026-10-09",
      modules = [
        (name = "test.mjs", esModule = embed "smoke.mjs"),
        (name = "worker.js", esModule = embed "../../dist/_worker.js")
      ],
      bindings = [(name = "MODE", text = "publicnode")],
      globalOutbound = (name = "publicnode", entrypoint = "upstream")
    )),
    (name = "unknown-provider", worker = (
      compatibilityDate = "2026-10-09",
      modules = [
        (name = "test.mjs", esModule = embed "smoke.mjs"),
        (name = "worker.js", esModule = embed "../../dist/_worker.js")
      ],
      bindings = [(name = "MODE", text = "unknown-provider")],
      globalOutbound = (name = "unknown-provider", entrypoint = "upstream")
    )),
    (name = "retry-429", worker = (
      compatibilityDate = "2026-10-09",
      modules = [
        (name = "test.mjs", esModule = embed "smoke.mjs"),
        (name = "worker.js", esModule = embed "../../dist/_worker.js")
      ],
      bindings = [(name = "MODE", text = "retry-429")],
      globalOutbound = (name = "retry-429", entrypoint = "upstream")
    )),
    (name = "retry-503-date", worker = (
      compatibilityDate = "2026-10-09",
      modules = [
        (name = "test.mjs", esModule = embed "smoke.mjs"),
        (name = "worker.js", esModule = embed "../../dist/_worker.js")
      ],
      bindings = [(name = "MODE", text = "retry-503-date")],
      globalOutbound = (name = "retry-503-date", entrypoint = "upstream")
    )),
    (name = "retry-invalid", worker = (
      compatibilityDate = "2026-10-09",
      modules = [
        (name = "test.mjs", esModule = embed "smoke.mjs"),
        (name = "worker.js", esModule = embed "../../dist/_worker.js")
      ],
      bindings = [(name = "MODE", text = "retry-invalid")],
      globalOutbound = (name = "retry-invalid", entrypoint = "upstream")
    ))
  ]
);
