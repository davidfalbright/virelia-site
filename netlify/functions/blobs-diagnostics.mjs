// netlify/functions/blobs-diagnostics.mjs
import { getStore } from "@netlify/blobs";

export const handler = async () => {
  const siteID = !!process.env.NETLIFY_SITE_ID;
  const token  = !!process.env.NETLIFY_BLOBS_TOKEN;

  let write = false, error = null;
  try {
    const store = getStore({
      name: "email_codes",
      siteID: process.env.NETLIFY_SITE_ID,
      token : process.env.NETLIFY_BLOBS_TOKEN,
    });
    await store.set("_diag", JSON.stringify({ t: Date.now() }));
    write = true;
  } catch (e) {
    error = e.message || String(e);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ siteIdFromEnv: siteID, tokenFromEnv: token, storeWriteOk: write, error }),
  };
};
