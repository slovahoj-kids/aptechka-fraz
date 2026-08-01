# =============================================================
# Аптечка фраз — генерация аудио через ElevenLabs
# Запускать в Google Colab. Вставь этот код в одну ячейку и запусти.
# =============================================================

# --- Шаг 1: вставь сюда свой ElevenLabs API-ключ ---
ELEVENLABS_API_KEY = "ВСТАВЬ_СЮДА_КЛЮЧ"

# --- Voice ID (уже известны, менять не нужно) ---
VOICE_ID_BY_AVATAR = {
    "official": "JNkSF641Hg8h9ltRox3p",  # Анна (Zuzana)
    "everyday": "vXrLJ7Hgyb248TxLqwbp",  # Виктор (Marek)
}

# --- Ссылки на JSON со сценариями (из твоего GitHub-репозитория) ---
SCENARIO_URLS = {
    "de": "https://raw.githubusercontent.com/slovahoj-kids/aptechka-fraz/main/data/scenarios-de.json",
    "es": "https://raw.githubusercontent.com/slovahoj-kids/aptechka-fraz/main/data/scenarios-es.json",
}

# =============================================================
# Дальше ничего менять не нужно — просто запусти ячейку.
# =============================================================

import json
import os
import time
import zipfile
import requests

OUTPUT_DIR = "/content/audio"
os.makedirs(OUTPUT_DIR, exist_ok=True)


def tts_generate(text, voice_id):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {"text": text, "model_id": "eleven_multilingual_v2"}
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code != 200:
        print(f"  ОШИБКА ({response.status_code}): {text[:50]}... — {response.text[:200]}")
        return None
    return response.content


total_generated = 0
total_failed = 0

for country, url in SCENARIO_URLS.items():
    print(f"\n=== Обработка страны: {country.upper()} ===")
    data = requests.get(url).json()
    lang_key = data["language"]  # "de" или "es"

    country_dir = os.path.join(OUTPUT_DIR, country)
    os.makedirs(country_dir, exist_ok=True)

    for scenario in data["scenarios"]:
        scenario_id = scenario["id"]
        avatar = scenario["avatar"]
        voice_id = VOICE_ID_BY_AVATAR[avatar]

        for idx, phrase in enumerate(scenario["phrases"], start=1):
            for track_lang, filename_suffix in [(lang_key, lang_key), ("en", "en")]:
                text = phrase.get(track_lang)
                if not text:
                    continue

                filename = f"{scenario_id}-{idx}-{filename_suffix}.mp3"
                filepath = os.path.join(country_dir, filename)

                if os.path.exists(filepath):
                    continue  # уже сгенерировано (на случай повторного запуска)

                print(f"  Генерирую: {filename}")
                audio = tts_generate(text, voice_id)

                if audio:
                    with open(filepath, "wb") as f:
                        f.write(audio)
                    total_generated += 1
                else:
                    total_failed += 1

                time.sleep(0.5)  # пауза, чтобы не упереться в rate limit

print(f"\n=== ГОТОВО ===")
print(f"Сгенерировано: {total_generated}")
print(f"Ошибок: {total_failed}")

# --- Упаковка в zip для скачивания ---
zip_path = "/content/aptechka-fraz-audio.zip"
with zipfile.ZipFile(zip_path, "w") as zipf:
    for root, dirs, files in os.walk(OUTPUT_DIR):
        for file in files:
            filepath = os.path.join(root, file)
            arcname = os.path.relpath(filepath, OUTPUT_DIR)
            zipf.write(filepath, arcname)

print(f"\nАрхив готов: {zip_path}")
print("Скачай его через панель файлов слева (иконка папки) — правый клик → Download")

# Если хочешь скачать автоматически (сработает не во всех браузерах):
try:
    from google.colab import files
    files.download(zip_path)
except Exception as e:
    print("Автоскачивание не сработало, скачай вручную из панели файлов слева:", e)
