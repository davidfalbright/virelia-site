import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  try {
    const { email } = JSON.parse(event.body || "{}");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: "Invalid email" });
    }

    const store = getStore({ name: "email_status" }); // Ensure you're using the correct store

    const emailKey = email.trim().toLowerCase();
    const exists = await store.get(emailKey);

    if (!exists) {
      return json(404, { error: "Email not found" });
    }

    await store.delete(emailKey); // Delete the email from the blob storage

    return json(200, { ok: true, message: "Email successfully deleted" });
  } catch (err) {
    console.error("delete-email error:", err);
    return json(500, { error: "Unexpected server error" });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}
