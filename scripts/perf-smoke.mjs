#!/usr/bin/env node

const base = (process.argv[2] || "https://gym-saas-starter.vercel.app").replace(/\/+$/, "");
const total = Number(process.argv[3] || 60);
const concurrency = Number(process.argv[4] || 10);

if (!Number.isInteger(total) || total < 1 || total > 1000) {
  throw new Error("total requests must be an integer from 1 to 1000");
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) {
  throw new Error("concurrency must be an integer from 1 to 50");
}

const url = `${base}/api/health`;
const latencies = [];
const statuses = new Map();
let next = 0;
let failures = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= total) return;

    const started = performance.now();
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: { "user-agent": "gym-saas-perf-smoke/1.0" },
      });
      await response.text();
      latencies.push(performance.now() - started);
      statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
      if (!response.ok) failures += 1;
    } catch (error) {
      latencies.push(performance.now() - started);
      failures += 1;
      statuses.set("network-error", (statuses.get("network-error") || 0) + 1);
      console.error(`request ${index + 1} failed:`, error?.message || error);
    }
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

const wallStarted = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
const wallMs = performance.now() - wallStarted;
latencies.sort((a, b) => a - b);

const summary = {
  target: url,
  total,
  concurrency,
  failures,
  statuses: Object.fromEntries(statuses),
  wall_ms: Math.round(wallMs),
  requests_per_second: Number((total / (wallMs / 1000)).toFixed(2)),
  latency_ms: {
    min: Math.round(latencies[0] || 0),
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    max: Math.round(latencies.at(-1) || 0),
  },
};

console.log(JSON.stringify(summary, null, 2));

if (failures > 0) process.exitCode = 1;
