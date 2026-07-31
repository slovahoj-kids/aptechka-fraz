// api/stripe-webhook.js
//
// Проверяет подпись Stripe (без npm-библиотек, встроенным Node crypto)
// и пишет статус подписки в Vercel KV, ключ — email + страна.
// В Stripe Dashboard → Webhooks добавить endpoint:
//   https://aptechkafraz.com/api/stripe-webhook
// события: checkout.session.completed, customer.subscription.updated,
//          customer.subscription.deleted

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
  const url = `${process.env.STORAGE_KV_REST_API_URL}/set/${encodeURIComponent(key)}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STORAGE_KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
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
      const email = obj.customer_email || obj.customer_details?.email;
      const country = obj.metadata?.country || 'unknown';
      if (email) {
        await kvSet(`sub:${country}:${email}`, {
          status: 'active',
          country,
          plan: obj.metadata?.plan || null,
          customerId: obj.customer,
          subscriptionId: obj.subscription,
          updatedAt: Date.now(),
        });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      // Опционально: подтянуть email по customerId через Stripe API и пометить inactive.
      // Оставлено как TODO — по аналогии с Pri Ruke, добавить при первом реальном тесте отмены подписки.
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('stripe-webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
