#!/usr/bin/env node

const base = (process.argv[2] || "https://gym-saas-starter.vercel.app").replace(/\/+$/, "");

const protectedRoutes = [
  "/check-in",
  "/classes",
  "/dashboard",
  "/leads",
  "/members",
  "/members/import",
  "/memberships",
  "/messages",
  "/payments",
  "/reports",
  "/search",
  "/settings",
  "/staff",
  "/training",
];

let checks = 0;
const failures = [];

function fail(message) {
  failures.push(message);
}

async function manualGet(path) {
  return fetch(`${base}${path}`, {
    redirect: "manual",
    cache: "no-store",
    headers: { "user-agent": "gym-saas-certification/1.0" },
  });
}

for (const route of protectedRoutes) {
  const response = await manualGet(route);
  const location = response.headers.get("location") || "";
  checks += 1;

  if (![302, 303, 307, 308].includes(response.status) || !location.includes("/login")) {
    fail(`${route}: expected redirect to /login, got ${response.status} ${location}`);
  }
}

{
  const response = await manualGet("/api/health");
  const body = await response.json().catch(() => null);
  checks += 1;
  if (response.status !== 200 || body?.ok !== true) {
    fail(`/api/health: expected 200 {ok:true}, got ${response.status}`);
  }
}

{
  const response = await manualGet("/api/cron/attendance-close");
  checks += 1;
  if (response.status !== 401) {
    fail(`/api/cron/attendance-close: expected 401 without CRON_SECRET, got ${response.status}`);
  }
}

{
  const response = await fetch(`${base}/api/access/process`, {
    method: "POST",
    redirect: "manual",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "user-agent": "gym-saas-certification/1.0",
    },
    body: JSON.stringify({ scan: "M1", mode: "toggle" }),
  });
  checks += 1;
  if (response.status !== 401) {
    fail(`/api/access/process: expected 401 when unauthenticated, got ${response.status}`);
  }
}

const result = {
  suite: "public-auth-boundaries",
  target: base,
  status: failures.length === 0 ? "PASS" : "FAIL",
  checks,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
