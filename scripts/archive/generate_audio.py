"""Audio/TTS generation via Edge TTS (Microsoft Neural voices, no API key needed).

Usage:
    from generate_audio import generate_audio, generate_dialogue
    audio_bytes = await generate_audio("Hello world", voice="kore")
"""

import edge_tts

# Map friendly voice names to Edge TTS neural voices
VOICE_MAP = {
    "kore": "en-US-GuyNeural",
    "charon": "en-US-ChristopherNeural",
    "puck": "en-GB-RyanNeural",
    "fenrir": "en-US-EricNeural",
    "leda": "en-US-JennyNeural",
    "orus": "en-US-DavisNeural",
    "vale": "en-US-AriaNeural",
    "zephyr": "en-US-SaraNeural",
    "rachel": "en-US-MichelleNeural",
    "adam": "en-US-BrandonNeural",
}


async def generate_audio(
    text: str,
    *,
    voice: str = "kore",
    model: str = "gemini_2_5_pro_tts",
) -> bytes:
    """Generate TTS audio using Edge TTS. Returns MP3 bytes."""
    if not text:
        raise RuntimeError("No text provided")

    tts_voice = VOICE_MAP.get(voice, "en-US-GuyNeural")

    communicate = edge_tts.Communicate(text, tts_voice)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]

    if not audio_data:
        raise RuntimeError("No audio generated")

    return audio_data


async def generate_dialogue(
    dialogue: list,
    *,
    model: str = "gemini_2_5_pro_tts",
) -> bytes:
    """Generate multi-speaker dialogue by concatenating TTS segments."""
    if not dialogue:
        raise RuntimeError("No dialogue provided")

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
