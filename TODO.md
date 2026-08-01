# Что доделать перед первым деплоем

## Environment Variables (Vercel → Settings → Environment Variables)
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLIC_KEY`
- `STRIPE_WEBHOOK_SECRET` (появится после создания webhook в Stripe Dashboard)
- `ELEVENLABS_API_KEY`
- `TEST_ACCESS_EMAILS` (через запятую, без пробелов)
- `STORAGE_KV_REST_API_URL` / `STORAGE_KV_REST_API_TOKEN` — Vercel создал сам при подключении KV, проверить что появились

## Stripe
- Создать продукты/цены для DE и ES (1 месяц / 3 месяца — по образцу Pri Ruke)
- Вписать реальные price_XXXX в `api/create-checkout-session.js`
- Создать Webhook endpoint: `https://aptechkafraz.com/api/stripe-webhook`
  события: `checkout.session.completed`, `customer.subscription.deleted`

## ElevenLabs
- Клонировать голос под немецкий язык
- Клонировать голос под испанский язык
- Клонировать/переиспользовать голос под английскую fallback-дорожку
- Вписать 3 voice ID в `api/tts.js`

## Контент
- `data/scenarios-de.json` и `data/scenarios-es.json` — сейчас только названия сценариев,
  массивы `phrases` пустые. Наполнение фразами — следующий большой блок работы.
- Разделы `/de/` и `/es/` (сами HTML-страницы с интерфейсом Довідник/Практика) — ещё не созданы,
  index.html пока просто линкует на них.

## Уже готово
- Домен aptechkafraz.com подключён к Vercel
- Vercel KV создан и подключен (aptechka-fraz-kv)
- Структура api/ по образцу Pri Ruke (checkout, webhook, subscription-status, tts, keys)
- Черновой список сценариев DE (19 шт.) и ES (17 шт.) с распределением на аватаров Анна/Виктор
- Английская аудио-дорожка заложена в архитектуру tts.js с самого начала
