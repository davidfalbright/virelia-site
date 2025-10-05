// netlify/functions/blobs-diagnostics.mjs
import { getStore } from "@netlify/blobs";

const json = (s, b) => ({
  statusCode: s,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(b),
});

const shortErr = (e) => ({
  name: e?.name || "Error",
  message: e?.message || String(e),
  code: e?.code,
});

function storeAuto(name) {
  // Try using Netlify's auto-injected context (production lambdas)
  return getStore(name);
}

function storeManual(name) {
  // Use PAT + SiteID if provided via env vars
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  if (!siteID || !token) {
    const err = new Error("Missing NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN");
    err.code = "MISSING_ENV";
    throw err;
  }
  return getStore(name, { siteID, token });
}

export const handler = async (event) => {
  const storeName =
    (event.queryStringParameters && event.queryStringParameters.store) ||
    "email_codes";

  const diag = {
    ok: true,
    store: storeName,
    siteId: process.env.NETLIFY_SITE_ID || null,
    env: {
      has_NETLIFY_SITE_ID: Boolean(process.env.NETLIFY_SITE_ID || ""),
      has_NETLIFY_BLOBS_TOKEN: Boolean(process.env.NETLIFY_BLOBS_TOKEN || ""),
    },
    node: process.version,
    runtime: {
      awsLambdaFn: process.env.AWS_LAMBDA_FUNCTION_NAME || null,
      region: process.env.AWS_REGION || null,
    },
    attempts: {
      auto: null,
      manual: null,
    },
  };

  // Use a deterministic test key so you can re-run and still read it
  const key = "__diagnostics__";
  const payload = { ok: true, ts: Date.now() };

  // ATTEMPT 1: auto-injected context
  try {
    const store = storeAuto(storeName);
    await store.set(key, JSON.stringify(payload));
    const roundTrip = await store.get(key, { type: "json" });
    diag.attempts.auto = { ok: true, mode: "auto", wrote: payload, read: roundTrip };
    return json(200, diag); // success via auto: no need to try manual
  } catch (e) {
    diag.attempts.auto = { ok: false, error: shortErr(e) };
  }

  // ATTEMPT 2: manual fallback with PAT + SiteID
  try {
    const store = storeManual(storeName);
    await store.set(key, JSON.stringify(payload));
    const roundTrip = await store.get(key, { type: "json" });
    diag.attempts.manual = { ok: true, mode: "manual", wrote: payload, read: roundTrip };
    return json(200, diag);
  } catch (e) {
    diag.attempts.manual = { ok: false, error: shortErr(e) };
    diag.ok = false;
    return json(200, diag);
  }
};
