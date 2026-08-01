// api/tts.js
//
// Серверный прокси к ElevenLabs — ключ никогда не попадает в браузер.
// Голоса переиспользованы из Pri Ruke: Zuzana → Анна, Marek → Виктор.
// Один и тот же voice ID озвучивает любой язык (немецкий/испанский/английский)
// через мультиязычную модель — язык задаётся не голосом, а самим текстом фразы.

const VOICE_ID_BY_AVATAR = {
  official: 'JNkSF641Hg8h9ltRox3p', // Анна (= Zuzana из Pri Ruke)
  everyday: 'vXrLJ7Hgyb248TxLqwbp', // Виктор (= Marek из Pri Ruke)
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, avatar } = req.body || {};

    if (!text || !avatar) {
      return res.status(400).json({ error: 'Missing text or avatar' });
    }

    const voiceId = VOICE_ID_BY_AVATAR[avatar];
    if (!voiceId) {
      return res.status(400).json({ error: `Unknown avatar: ${avatar}` });
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
