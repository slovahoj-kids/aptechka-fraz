// api/create-checkout-session.js
//
// Раздельные Price ID на страну — потому что у каждой страны (DE/ES) будет
// своя цена и объект в Stripe Dashboard. Заполнить реальные price_XXXX
// после того как продукты созданы в Stripe (см. README-TODO ниже).
//
// TODO перед запуском:
// 1. В Stripe Dashboard создать 2 продукта (или переиспользовать один продукт
//    с разными Price для DE и ES, если валюта/цена совпадают).
// 2. Вписать сюда реальные price_XXXX ID.
// 3. Прописать переменные окружения в Vercel:
//    STRIPE_SECRET_KEY, STRIPE_PUBLIC_KEY, STRIPE_WEBHOOK_SECRET

const PLAN_TO_PRICE_ID_BY_COUNTRY = {
  de: {
    '1_month': 'price_REPLACE_ME_DE_1M',
    '3_months': 'price_REPLACE_ME_DE_3M',
  },
  es: {
    '1_month': 'price_REPLACE_ME_ES_1M',
    '3_months': 'price_REPLACE_ME_ES_3M',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, plan, country, referral } = req.body || {};

    if (!email || !plan || !country) {
      return res.status(400).json({ error: 'Missing email, plan or country' });
    }

    const countryPrices = PLAN_TO_PRICE_ID_BY_COUNTRY[country];
    if (!countryPrices) {
      return res.status(400).json({ error: `Unknown country: ${country}` });
    }

    const priceId = countryPrices[plan];
    if (!priceId) {
      return res.status(400).json({ error: `Unknown plan: ${plan}` });
    }

    const origin = `https://${req.headers.host}`;

    const params = new URLSearchParams({
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      customer_email: email,
      success_url: `${origin}/${country}/?payment=success`,
      cancel_url: `${origin}/${country}/?payment=cancelled`,
      'metadata[country]': country,
      'metadata[plan]': plan,
    });

    if (referral) {
      params.append('client_reference_id', referral);
      params.append('metadata[referral]', referral);
    }

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      console.error('Stripe error:', session);
      return res.status(500).json({ error: 'Stripe session creation failed' });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
