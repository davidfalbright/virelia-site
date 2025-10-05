import { getStore } from "@netlify/blobs";

export const handler = async (event, context) => {
  const email = (event.queryStringParameters?.email || "").trim().toLowerCase();
  if (!email) return j(400, { error: "email is required" });

  try {
    const store = getStore("email_codes", { context });   // <-- pass context
    const raw = await store.get(email);
    return raw ? j(200, JSON.parse(raw)) : j(404, { error: "not found" });
  } catch (e) {
    return j(500, { error: e.message });
  }
};

const j = (s, b) => ({
  statusCode: s,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(b),
});
