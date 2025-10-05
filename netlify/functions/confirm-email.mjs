// netlify/functions/confirm-email.mjs
import crypto from "crypto";
import { getStore } from "@netlify/blobs";

const json = (s,b)=>({statusCode:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(b)});
const b64 = (s)=>Buffer.from(s,'base64').toString('utf8');
const verify = (token, secret) => {
  try {
    const [h,p,sig] = token.split(".");
    const expect = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest();
    const eq = crypto.timingSafeEqual(Buffer.from(sig.replace(/-/g,"+").replace(/_/g,"/")+"==","base64"), expect);
    if (!eq) return null;
    return JSON.parse(b64(p));
  } catch { return null; }
};
const storeOpts = () => {
  const siteID = process.env.NETLIFY_SITE_ID || "";
  const token  = process.env.NETLIFY_BLOBS_TOKEN || "";
  return siteID && token ? { siteID, token } : undefined;
};

export const handler = async (event) => {
  try {
    const token = event.queryStringParameters?.token || "";
    const secret = process.env.CODE_SIGNING_SECRET;
    if (!token || !secret) return json(400,{error:"Bad request"});
    const payload = verify(token, secret);
    if (!payload || payload.purpose !== "confirm" || Date.now() > (payload.exp||0)) {
      return json(400,{error:"Invalid or expired token"});
    }

    let persisted = true, persistError = null;
    try {
      const store = storeOpts()? getStore("email_codes", storeOpts()): getStore("email_codes");
      await store.set(`${payload.email.toLowerCase()}::confirmed`, JSON.stringify({ t: Date.now(), v: true }));
    } catch (e) {
      persisted = false;
      persistError = (e && (e.message || e.toString())) || "Blobs write failed";
      console.error("confirm-email: blobs write failed", e);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `
<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Email confirmed</title>
<link rel="stylesheet" href="/styles.css">
<div class="panel">
  <h1>Your email has been confirmed.</h1>
  <p><a href="/">Back to iamvirelia.org</a></p>
  ${persisted ? "" : `<p class="note">Technical note: we couldn't persist the confirm status (Blobs write failed). You may still verify your code.</p>`}
</div>`.trim(),
    };
  } catch (e) {
    console.error("confirm-email error", e);
    return { statusCode: 500, headers: { "Content-Type": "text/plain" }, body: "Unexpected error" };
  }
};
