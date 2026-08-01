// api/stripe-webhook.js
//
// Проверяет подпись Stripe (без npm-библиотек, встроенным Node crypto),
// генерирует и отправляет 6-значный PIN на email при первой оплате
// (по образцу Pri Ruke), и закрывает доступ при отмене подписки.
//
// Ключ в KV — email + страна, т.к. Германия и Испания это отдельные
// подписки: sub:${country}:${email}
//
// Endpoint в Stripe Dashboard → Webhooks:
//   https://aptechkafraz.com/api/stripe-webhook
// события: checkout.session.completed, customer.subscription.deleted

import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('='))
  );
  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

async function kvSet(key, value) {
  const url = `${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
}

async function kvGet(key) {
  const url = `${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (data.result === null || data.result === undefined) return null;
  try {
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  } catch {
    return data.result;
  }
}

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 цифр
}

const COUNTRY_LABEL = { de: 'Германия', es: 'Испания' };

async function sendPinEmail(email, pin, country) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not configured.');
    return;
  }
  const label = COUNTRY_LABEL[country] || country;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#142033;">
      <h2 style="color:#0B4EA2;">Аптечка фраз</h2>
      <p>Спасибо за оформление подписки (${label})!</p>
      <p style="font-size:18px;">Ваш код доступа: <span style="font-family:monospace; background:#F1F4F7; padding:4px 10px; border-radius:6px;">${pin}</span></p>
      <p>Введите этот код вместе с email на любом устройстве, чтобы получить полный доступ.</p>
      <p>Вопросы? Пишите: slovahoj.kids@gmail.com</p>
    </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Аптечка фраз <noreply@noviydim.sk>',
        to: [email],
        subject: 'Ваш код доступа — Аптечка фраз',
        html,
      }),
    });
    if (!res.ok) console.error('Resend error:', await res.text());
  } catch (e) {
    console.error('sendPinEmail failed:', e);
  }
}

async function updateSubscriptionByCustomerId(customerId, patch) {
  const mapping = await kvGet(`customer:${customerId}`);
  if (!mapping?.email || !mapping?.country) {
    console.warn(`No email/country on file for Stripe customer ${customerId}.`);
    return;
  }
  const key = `sub:${mapping.country}:${mapping.email}`;
  const existing = (await kvGet(key)) || {};
  await kvSet(key, { ...existing, ...patch, customerId, updatedAt: Date.now() });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['stripe-signature'];

  let valid = false;
  try {
    valid = verifyStripeSignature(rawBody.toString('utf8'), signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    valid = false;
  }

  if (!valid) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody.toString('utf8'));
  const obj = event.data.object;

  try {
    if (event.type === 'checkout.session.completed') {
      const email = (obj.customer_email || obj.customer_details?.email || '').toLowerCase();
      const country = obj.metadata?.country || 'unknown';
      const customerId = obj.customer;

      if (email && customerId) {
        await kvSet(`customer:${customerId}`, { email, country });

        const key = `sub:${country}:${email}`;
        const existing = await kvGet(key);
        // Новый PIN только при первой оплате — повторная оплата (например,
        // реактивация после отмены) не должна аннулировать уже известный PIN.
        const pin = existing?.pin || generatePin();

        await kvSet(key, {
          ...(existing || {}),
          email,
          country,
          customerId,
          subscriptionId: obj.subscription,
          pin,
          status: 'active',
          updatedAt: Date.now(),
        });

        if (!existing?.pin) {
          await sendPinEmail(email, pin, country);
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      await updateSubscriptionByCustomerId(obj.customer, { status: 'inactive' });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
