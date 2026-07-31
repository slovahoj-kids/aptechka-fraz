// api/tts.js
//
// Серверный прокси к ElevenLabs — ключ никогда не попадает в браузер.
// voiceId выбирается по языку: немецкий, испанский или английский (fallback-дорожка).
// Реальные voice ID проставить после клонирования голосов в ElevenLabs.

const VOICE_ID_BY_LANG = {
  de: 'REPLACE_ME_VOICE_ID_DE',
  es: 'REPLACE_ME_VOICE_ID_ES',
  en: 'REPLACE_ME_VOICE_ID_EN', // третья, английская дорожка на каждую фразу
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, lang } = req.body || {};

    if (!text || !lang) {
      return res.status(400).json({ error: 'Missing text or lang' });
    }

    const voiceId = VOICE_ID_BY_LANG[lang];
    if (!voiceId) {
      return res.status(400).json({ error: `Unsupported lang: ${lang}` });
    }

    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
        }),
      }
    );

    if (!elevenResponse.ok) {
      const errText = await elevenResponse.text();
      console.error('ElevenLabs error:', errText);
      return res.status(500).json({ error: 'TTS generation failed' });
    }

    const audioBuffer = await elevenResponse.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error('tts error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
