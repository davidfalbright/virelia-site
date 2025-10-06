import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { email } = JSON.parse(event.body || '{}');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Invalid email' });

    const emailKey = email.trim().toLowerCase();
    const usersStore = getStore({ name: 'user_credentials' });

    // Delete email record from the user_credentials store
    await usersStore.delete(emailKey);

    // Optionally, delete email index as well (if applicable)
    const emailIndexStore = getStore({ name: 'email_index' });
    await emailIndexStore.delete(emailKey);

    return json(200, { ok: true, message: `Successfully deleted account for ${email}` });
  } catch (err) {
    console.error("delete-email error:", err);
    return json(500, { error: 'Unexpected server error' });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}
