// api/speech-token.js
//
// Выдаёт короткоживущий токен Azure Speech, чтобы raw-ключ никогда
// не попадал в браузер. Переиспользует тот же Azure-ресурс, что уже
// используется в Pri Ruke / SlovAhoj Kids (регион germanywestcentral) —
// отдельно платить за новый ресурс не нужно.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const region = process.env.AZURE_SPEECH_REGION;
    const key = process.env.AZURE_SPEECH_KEY;

    const response = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': key },
      }
    );

    if (!response.ok) {
      return res.status(500).json({ error: 'Failed to issue speech token' });
    }

    const token = await response.text();
    return res.status(200).json({ token, region });
  } catch (err) {
    console.error('speech-token error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
