"""Video generation via xAI Grok Imagine Video API.

Usage:
    from generate_video import generate_video
    video_bytes = await generate_video("A wave crashing on shore")
"""

import os
import asyncio
import httpx

XAI_API_KEY = os.getenv("XAI_API_KEY", "")
XAI_BASE_URL = "https://api.x.ai/v1"

# Max poll time: 5 minutes (video gen can take a while)
MAX_POLL_SECONDS = 300
POLL_INTERVAL = 5


async def generate_video(
    prompt: str,
    *,
    model: str = "grok-imagine-video",
    aspect_ratio: str = "16:9",
    duration: int = 8,
    **kwargs,
) -> bytes:
    """Generate a video using xAI Grok Imagine Video API. Returns MP4 bytes."""
    if not XAI_API_KEY:
        raise RuntimeError("XAI_API_KEY not set")

    # Clamp duration to supported values
    if duration not in (5, 10, 15):
        duration = 10 if duration >= 8 else 5

    payload = {
        "model": "grok-imagine-video",
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "resolution": "720p",
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {XAI_API_KEY}",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Submit generation request
        resp = await client.post(
            f"{XAI_BASE_URL}/videos/generations",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    request_id = data.get("request_id")
    if not request_id:
        raise RuntimeError(f"No request_id returned: {data}")

    # Step 2: Poll until done
    elapsed = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        while elapsed < MAX_POLL_SECONDS:
            await asyncio.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL

            poll_resp = await client.get(
                f"{XAI_BASE_URL}/videos/{request_id}",
                headers={"Authorization": f"Bearer {XAI_API_KEY}"},
            )
            poll_resp.raise_for_status()
            poll_data = poll_resp.json()

            status = poll_data.get("status", "")
            if status == "done":
                video_url = poll_data.get("video", {}).get("url", "")
                if not video_url:
                    raise RuntimeError("Video done but no URL returned")
                # Download the video
                dl_resp = await client.get(video_url, timeout=120.0)
                dl_resp.raise_for_status()
                return dl_resp.content
            elif status in ("expired", "failed", "error"):
                raise RuntimeError(f"Video generation {status}: {poll_data}")

    raise RuntimeError(f"Video generation timed out after {MAX_POLL_SECONDS}s")
