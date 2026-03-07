"""Audio/TTS generation via ElevenLabs API.

Usage:
    from generate_audio import generate_audio, generate_dialogue
    audio_bytes = await generate_audio("Hello world", voice="kore")
"""

import os
import httpx

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"

# Map friendly voice names to ElevenLabs voice IDs
# Using popular ElevenLabs voices
VOICE_MAP = {
    "kore": "JBFqnCBsd6RMkjVDRZzb",       # George
    "charon": "ErXwobaYiN019PkySvjV",      # Antoni
    "puck": "TX3LPaxmHKxFdv7VOQHJ",       # Liam
    "fenrir": "VR6AewLTigWG4xSOukaG",      # Arnold
    "leda": "EXAVITQu4vr4xnSDxMaL",       # Sarah
    "orus": "onwK4e9ZLuTAKqWW03F9",        # Daniel
    "vale": "Xb7hH8MSUJpSbSDYk0k2",       # Alice
    "zephyr": "9BWtsMINqrJLrRacOk9x",      # Aria
    # Fallback: use the voice name as-is (might be a voice ID)
}

MODEL_MAP = {
    "gemini_2_5_pro_tts": "eleven_turbo_v2_5",
    "elevenlabs_tts_v3": "eleven_multilingual_v2",
}


async def generate_audio(
    text: str,
    *,
    voice: str = "kore",
    model: str = "gemini_2_5_pro_tts",
) -> bytes:
    """Generate TTS audio using ElevenLabs API. Returns MP3 bytes."""
    if not ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY not set")

    voice_id = VOICE_MAP.get(voice, voice)
    el_model = MODEL_MAP.get(model, "eleven_turbo_v2_5")

    payload = {
        "text": text,
        "model_id": el_model,
        "output_format": "mp3_44100_128",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{ELEVENLABS_BASE_URL}/text-to-speech/{voice_id}",
            headers={
                "Content-Type": "application/json",
                "xi-api-key": ELEVENLABS_API_KEY,
            },
            json=payload,
        )
        resp.raise_for_status()
        return resp.content


async def generate_dialogue(
    dialogue: list,
    *,
    model: str = "gemini_2_5_pro_tts",
) -> bytes:
    """Generate multi-speaker dialogue by concatenating TTS segments."""
    if not dialogue:
        raise RuntimeError("No dialogue provided")

    # Generate each line and concatenate the MP3 bytes
    all_audio = b""
    for line in dialogue:
        speaker = line.get("speaker", "kore")
        text = line.get("text", "")
        if not text:
            continue
        segment = await generate_audio(text, voice=speaker, model=model)
        all_audio += segment

    if not all_audio:
        raise RuntimeError("No audio generated from dialogue")

    return all_audio
