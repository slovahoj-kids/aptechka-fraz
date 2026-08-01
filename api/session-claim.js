// api/session-claim.js
//
// Вызывается только в момент реального входа (ввод email+PIN) — никогда
// при обычной загрузке страницы. Проверяет email+PIN+страну, затем
// закрепляет это устройство как единственное активное — тихо выбивая
// любое другое устройство, залогиненное с тем же email+PIN.

function kvHeaders() {
  return { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' };
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
async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  const res = await fetch(url, { method: 'POST', headers: kvHeaders(), body: JSON.stringify(value) });
  if (!res.ok) throw new Error(`KV set failed for ${key}: ${res.status}`);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  const country = typeof body.country === 'string' ? body.country.trim() : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

  if (!email || !pin || !country || !sessionId) {
    return res.status(400).json({ error: 'Email, PIN, страна и sessionId обязательны' });
  }

  const testEmails = (process.env.TEST_ACCESS_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (testEmails.includes(email)) {
    await kvSet(`session:${country}:${email}`, { sessionId, claimedAt: Date.now() });
    return res.status(200).json({ claimed: true });
  }

  try {
    const record = await kvGet(`sub:${country}:${email}`);
    if (!record || record.pin !== pin || record.status !== 'active') {
      return res.status(200).json({ claimed: false, reason: 'invalid_credentials' });
    }

    await kvSet(`session:${country}:${email}`, { sessionId, claimedAt: Date.now() });
    return res.status(200).json({ claimed: true });
  } catch (err) {
    console.error('session-claim error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
