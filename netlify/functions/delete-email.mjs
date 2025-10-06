import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { emails } = JSON.parse(event.body || '{}');
    if (!Array.isArray(emails) || emails.length === 0) {
      return json(400, { error: 'No emails provided' });
    }

    const store = getStore({ name: 'email_status' }); // Modify to match the store you're using

    for (const email of emails) {
      await store.delete(email.trim().toLowerCase());
    }

    return json(200, { ok: true, message: 'Emails deleted successfully' });
  } catch (err) {
    console.error("delete-emails error:", err);
    return json(500, { error: 'Unexpected server error' });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}
