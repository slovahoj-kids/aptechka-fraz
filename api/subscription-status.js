// api/subscription-status.js
//
// Проверяет пару email+PIN и возвращает текущий статус доступа.
// Вызывается сразу после ввода email+PIN, и периодически в фоне
// (не на каждой загрузке страницы) чтобы обновить закэшированный флаг.

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

async function checkRateLimit(bucketKey, limit, windowSeconds) {
  try {
    const url = process.env.KV_REST_API_URL;
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(bucketKey)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    const incrData = incrRes.ok ? await incrRes.json() : { result: 0 };
    const count = incrData.result || 0;
    if (count === 1) {
      await fetch(`${url}/expire/${encodeURIComponent(bucketKey)}/${windowSeconds}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
    }
    return count <= limit;
  } catch (e) {
    console.error('Rate limit check failed — failing open:', e);
    return true;
  }
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

  if (!email || !pin || !country) {
    return res.status(400).json({ error: 'Email, PIN и страна обязательны' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const allowed = await checkRateLimit(`rl:sub-status:${ip}:${email}`, 10, 600);
  if (!allowed) {
    return res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' });
  }

  const testEmails = (process.env.TEST_ACCESS_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (testEmails.includes(email)) {
    return res.status(200).json({ active: true, source: 'test-allowlist' });
  }

  try {
    const record = await kvGet(`sub:${country}:${email}`);

    if (!record || record.pin !== pin) {
      return res.status(200).json({ active: false, reason: 'invalid_credentials' });
    }
    if (record.status !== 'active') {
      return res.status(200).json({ active: false, reason: 'inactive_subscription' });
    }

    return res.status(200).json({ active: true });
  } catch (err) {
    console.error('subscription-status error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
