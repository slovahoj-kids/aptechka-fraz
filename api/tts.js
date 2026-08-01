// api/tts.js
//
// Серверный прокси к ElevenLabs — ключ никогда не попадает в браузер.
// Голоса теперь нативные под каждый язык (не переиспользуем Zuzana/Marek
// напрямую) — так как ElevenLabs сохраняет акцент исходного голоса при
// смене языка, для DE/ES взяты отдельные голоса из библиотеки ElevenLabs,
// промаркированные платформой как German / Spanish.
//
// Основной путь генерации аудио — Colab-скрипт (generate_audio_colab.py),
// этот эндпоинт держим на случай live-генерации в будущем (например,
// для новых фраз без пересборки всего Colab-прогона).

const VOICE_ID_BY_AVATAR_AND_COUNTRY = {
  official: { de: 'h8PCn0HukMaFj1sJwcjY', es: 'imFXYz8XIletRKLZZQaA' }, // Анна
  everyday: { de: 'VHYWoxffK1pFlM1dtRb0', es: 'lxKLOtQettK0KcpfGqVT' }, // Виктор
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, avatar, country } = req.body || {};

    if (!text || !avatar || !country) {
      return res.status(400).json({ error: 'Missing text, avatar or country' });
    }

    const voiceId = VOICE_ID_BY_AVATAR_AND_COUNTRY[avatar]?.[country];
    if (!voiceId) {
      return res.status(400).json({ error: `Unknown avatar/country combination: ${avatar}/${country}` });
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
