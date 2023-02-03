// Simple 'mod' host
// Copyright 2023 by Thorsten von Eicken

import Modules from "modules"

trace("SimpleHost starting\n")

if (Modules.has("check")) {
  try {
    Modules.importNow("check")()
    if (!Modules.has("app")) throw new Error("Module 'app' not found")
    let app = Modules.importNow("app")
    trace("===== Launching app =====\n")
    app()
    trace("App is done\n")
  } catch (e) {
    trace(`Error running mod: ${e.stack}\n`)
  }
} else {
  trace("SimpleHost ready, no module installed...\n")
}
