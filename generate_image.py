"""Image generation via xAI Grok Imagine API.

Usage:
    from generate_image import generate_image
    image_bytes = await generate_image("A sunset over mountains")
"""

import os
import base64
import httpx

XAI_API_KEY = os.getenv("XAI_API_KEY", "")
XAI_BASE_URL = "https://api.x.ai/v1"


async def generate_image(
    prompt: str,
    *,
    model: str = "grok-imagine-image",
    aspect_ratio: str = "1:1",
    **kwargs,
) -> bytes:
    """Generate an image using xAI Grok Imagine API. Returns PNG bytes."""
    if not XAI_API_KEY:
        raise RuntimeError("XAI_API_KEY not set")

    payload = {
        "model": "grok-imagine-image",
        "prompt": prompt,
        "response_format": "b64_json",
        "n": 1,
    }
    # xAI supports aspect_ratio as a top-level param
    if aspect_ratio and aspect_ratio != "1:1":
        payload["aspect_ratio"] = aspect_ratio

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{XAI_BASE_URL}/images/generations",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {XAI_API_KEY}",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()

    # Response: { "data": [{ "b64_json": "...", "revised_prompt": "..." }] }
    images = data.get("data", [])
    if not images:
        raise RuntimeError("No image returned from xAI API")

    b64_data = images[0].get("b64_json") or images[0].get("url", "")
    if not b64_data:
        # If URL returned instead of base64, fetch the image
        url = images[0].get("url", "")
        if url:
            async with httpx.AsyncClient(timeout=60.0) as client:
                img_resp = await client.get(url)
                img_resp.raise_for_status()
                return img_resp.content
        raise RuntimeError("No image data in response")

    return base64.b64decode(b64_data)
