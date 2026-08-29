#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tsc = path.join(root, "node_modules", ".bin", "tsc");
const temp = mkdtempSync(path.join(os.tmpdir(), "gym-timezone-cert-"));

function findFile(dir, filename) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      const nested = findFile(full, filename);
      if (nested) return nested;
    } else if (name === filename) {
      return full;
    }
  }
  return null;
}

try {
  execFileSync(
    tsc,
    [
      "src/lib/time.ts",
      "--target",
      "ES2022",
      "--module",
      "CommonJS",
      "--moduleResolution",
      "Node",
      "--skipLibCheck",
      "--outDir",
      temp,
    ],
    { cwd: root, stdio: "pipe" },
  );

  const compiled = findFile(temp, "time.js");
  assert.ok(compiled, "Compiled time.js was not produced.");

  const require = createRequire(import.meta.url);
  const { wallTimeToUtcIso, dateInTimeZone } = require(compiled);

  assert.equal(
    wallTimeToUtcIso("2026-08-29T12:00", "UTC"),
    "2026-08-29T12:00:00.000Z",
  );

  assert.equal(
    wallTimeToUtcIso("2026-08-29T12:00", "Asia/Beirut"),
    "2026-08-29T09:00:00.000Z",
  );

  assert.throws(
    () => wallTimeToUtcIso("2026-03-29T02:30", "Europe/Paris"),
    /does not exist or is ambiguous/,
    "Paris spring-forward gap must be rejected.",
  );

  assert.throws(
    () => wallTimeToUtcIso("2026-10-25T02:30", "Europe/Paris"),
    /does not exist or is ambiguous/,
    "Paris fall-back duplicate must be rejected.",
  );

  assert.throws(
    () => wallTimeToUtcIso("2026-11-01T01:30", "America/New_York"),
    /does not exist or is ambiguous/,
    "New York fall-back duplicate must be rejected.",
  );

  assert.throws(
    () => wallTimeToUtcIso("2026-04-05T01:45", "Australia/Lord_Howe"),
    /does not exist or is ambiguous/,
    "Lord Howe 30-minute fall-back duplicate must be rejected.",
  );

  assert.equal(
    dateInTimeZone(new Date("2026-08-28T22:30:00.000Z"), "Asia/Beirut"),
    "2026-08-29",
  );

  console.log(
    JSON.stringify(
      {
        suite: "timezone",
        status: "PASS",
        checks: 7,
        zones: ["UTC", "Asia/Beirut", "Europe/Paris", "America/New_York", "Australia/Lord_Howe"],
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
