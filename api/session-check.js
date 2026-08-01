// api/session-check.js
//
// Вызывается периодически в фоне (не на каждое действие), чтобы понять —
// это устройство всё ещё единственное активное для аккаунта, или кто-то
// залогинился с тем же email+PIN на другом устройстве позже. Если да —
// возвращает active:false, и клиент должен сам себя разлогинить.

function kvHeaders() {
  return { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` };
}
async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: kvHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  try {
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch {
    return data.result;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const country = typeof body.country === 'string' ? body.country.trim() : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

  if (!email || !country || !sessionId) {
    return res.status(400).json({ error: 'Email, страна и sessionId обязательны' });
  }

  const session = await kvGet(`session:${country}:${email}`);
  const active = !!session && session.sessionId === sessionId;
  return res.status(200).json({ active });
}
