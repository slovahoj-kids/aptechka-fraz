// api/contact.js
// Принимает контактную форму и пересылает по email через Resend,
// с reply-to на отправителя, чтобы ответ уходил напрямую ему.

function kvHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function checkRateLimit(url, token, bucketKey, limit, windowSeconds) {
  try {
    const incrRes = await fetch(`${url}/incr/${encodeURIComponent(bucketKey)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const incrData = incrRes.ok ? await incrRes.json() : { result: 0 };
    const count = incrData.result || 0;
    if (count === 1) {
      await fetch(`${url}/expire/${encodeURIComponent(bucketKey)}/${windowSeconds}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    return count <= limit;
  } catch (e) {
    console.error('Rate limit check failed — failing open:', e);
    return true;
  }
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const body = request.body || {};
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 3000) : '';
  // Honeypot-поле — реальные пользователи его никогда не заполняют, боты обычно да.
  const honeypot = typeof body.website === 'string' ? body.website.trim() : '';

  if (honeypot) {
    return response.status(200).json({ ok: true }); // тихо игнорируем, притворяемся успехом
  }
  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Заполните имя, корректный email и сообщение.' });
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    const ip = (request.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const allowed = await checkRateLimit(kvUrl, kvToken, `rl:contact:${ip}`, 5, 3600);
    if (!allowed) {
      return response.status(429).json({ error: 'Слишком много сообщений. Попробуйте позже.' });
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured.');
    return response.status(500).json({ error: 'Форма временно недоступна.' });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1e293b;">
      <h2 style="color:#0B4EA2;">Новое сообщение с aptechkafraz.com</h2>
      <p><b>Имя:</b> ${escapeHtml(name)}</p>
      <p><b>Email:</b> ${escapeHtml(email)}</p>
      <p><b>Сообщение:</b></p>
      <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Аптечка фраз <noreply@noviydim.sk>',
        to: ['slovahoj.kids@gmail.com'],
        reply_to: email,
        subject: `Аптечка фраз — сообщение от ${name}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error('Resend error:', await res.text());
      return response.status(502).json({ error: 'Не удалось отправить сообщение.' });
    }
    return response.status(200).json({ ok: true });
  } catch (e) {
    console.error('Contact form send failed:', e);
    return response.status(500).json({ error: 'Не удалось отправить сообщение.' });
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
