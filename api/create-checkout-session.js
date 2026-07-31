// api/create-checkout-session.js
//
// Один план на страну (по образцу Pri Ruke — без деления на 1/3 месяца).
// Price ID уже реальные, взяты из Stripe Dashboard.

const PRICE_ID_BY_COUNTRY = {
  de: 'price_1TzLWzRLZSrXJTd8gkNsu80B',
  es: 'price_1TzLZtRLZSrXJTd87HLWZow0',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, country, referral } = req.body || {};

    if (!email || !country) {
      return res.status(400).json({ error: 'Missing email or country' });
    }

    const priceId = PRICE_ID_BY_COUNTRY[country];
    if (!priceId) {
      return res.status(400).json({ error: `Unknown country: ${country}` });
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
