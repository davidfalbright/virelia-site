// netlify/functions/blobs-diagnostics.mjs
import { getStore } from "@netlify/blobs";

const json = (s,b)=>({statusCode:s,headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const opts = () => {
  const siteID = process.env.NETLIFY_SITE_ID || "";
  const token  = process.env.NETLIFY_BLOBS_TOKEN || "";
  return siteID && token ? { siteID, token } : undefined;
};

export const handler = async () => {
  const out = {
    siteIdFromEnv: !!process.env.NETLIFY_SITE_ID,
    tokenFromEnv:  !!process.env.NETLIFY_BLOBS_TOKEN,
    storeWriteOk:  null,
    error: null,
  };
  try {
    const store = opts() ? getStore("email_codes", opts()) : getStore("email_codes");
    await store.set("healthcheck", JSON.stringify({ ok: true, t: Date.now() }));
    out.storeWriteOk = true;
  } catch (e) {
    out.storeWriteOk = false;
    out.error = e?.message || String(e);
  }
  return json(200, out);
};
