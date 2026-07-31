// api/subscription-status.js
//
// Фронтенд дергает этот эндпоинт, чтобы понять — платный доступ активен или нет.
// TEST_ACCESS_EMAILS — та же идея, что в SlovAhoj Kids/Pri Ruke: список email
// через запятую в переменной окружения, которым доступ открыт без оплаты
// (для тебя и тестеров).

async function kvGet(key) {
  const url = `${process.env.STORAGE_KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.STORAGE_KV_REST_API_TOKEN}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.result ? JSON.parse(data.result) : null;
}

export default async function handler(req, res) {
  const { email, country } = req.query;

  if (!email || !country) {
    return res.status(400).json({ error: 'Missing email or country' });
  }

  const testEmails = (process.env.TEST_ACCESS_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (testEmails.includes(email.toLowerCase())) {
    return res.status(200).json({ active: true, source: 'test-allowlist' });
  }

  try {
    const record = await kvGet(`sub:${country}:${email.toLowerCase()}`);
    const active = record?.status === 'active';
    return res.status(200).json({ active, source: 'stripe' });
  } catch (err) {
    console.error('subscription-status error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
