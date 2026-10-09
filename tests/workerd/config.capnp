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
    ))
  ]
);
