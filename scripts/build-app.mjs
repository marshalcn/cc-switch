#!/usr/bin/env node
// Build the Tauri app (executable only, no installers).
//
// Why not just `pnpm tauri build`? @tauri-apps/cli's `tauri.js` decides how to
// invoke the native CLI by looking at the basename of `process.argv[0]`:
//
//   const binStem = path.parse(bin).name.toLowerCase()
//   if (/(nodejs|node|bun|electron)-?[0-9]*$/.test(binStem)) { ... }
//   else { args.unshift(bin) }   // "we don't know what started us"
//
// When the package manager runs under an Electron-hosted Node (VS Code's
// extension host, a JetBrains IDE, the DSH desktop shell), `argv[0]` is the
// host executable -- `Code.exe`, `electron.exe`, `DSH Desktop.exe` -- which
// matches neither branch, so the host path is pushed in as if it were a
// subcommand and the CLI dies with:
//
//   error: unrecognized subcommand 'D:\\...\\Code.exe'
//
// Re-executing the JS entry point with the real `node` makes `argv[0]` end in
// `node`, so the normal path is taken. This also matters for correctness
// beyond the error: `tauri build` passes `--features tauri/custom-protocol`,
// and a bare `cargo build --release` does not. Without that feature the binary
// embeds no frontend assets and falls back to `devUrl`, so the window opens on
// `http://localhost:3000` and shows ERR_CONNECTION_REFUSED.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");

/** Absolute path to the real Node binary, not whatever shim is on PATH. */
function realNode() {
  // process.execPath is the Node running this script. When that is an Electron
  // host it is exactly the value we must not hand to tauri.js, so prefer a
  // conventional Node install when one exists.
  const candidates = [
    process.env.PnpmNodePath,
    process.env.NODE_BINARY,
    process.execPath,
    "C:\\Program Files\\nodejs\\node.exe",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return process.execPath;
}

const tauriEntry = require.resolve("@tauri-apps/cli/tauri.js");
const node = realNode();

// Forward everything after the script name; `--` keeps tauri's own flags intact.
const args = process.argv.slice(2);
const result = spawnSync(node, [tauriEntry, "build", ...args], {
  stdio: "inherit",
  cwd: repoRoot,
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
