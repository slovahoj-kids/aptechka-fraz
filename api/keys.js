// api/keys.js
// ВАЖНО: сюда пишем ТОЛЬКО безопасные публичные значения.
// Никаких secret key, никаких токенов ElevenLabs/Stripe/Azure — только то,
// что можно спокойно увидеть в исходном коде страницы у любого посетителя.

export default function handler(req, res) {
  res.status(200).json({
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY || '',
    // Rewardful (если решим подключать реферальную программу и сюда)
    rewardfulSiteId: process.env.REWARDFUL_SITE_ID || '',
  });
}
