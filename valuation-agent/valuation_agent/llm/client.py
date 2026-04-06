"""LLM client using OpenRouter API (OpenAI-compatible endpoint).

Supports text and vision calls to Claude models via OpenRouter.
"""

import base64
import hashlib
import logging
import mimetypes
import time
from pathlib import Path
from typing import Optional

import httpx

from valuation_agent.config import settings

logger = logging.getLogger(__name__)

# Model tier mapping
MODEL_TIERS = {
    "reasoning": settings.openrouter_model_reasoning,
    "fast": settings.openrouter_model_fast,
    "vision": settings.openrouter_model_vision,
}


def _prompt_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:12]


def call_claude(
    prompt: str,
    *,
    model_tier: str = "reasoning",
    system: Optional[str] = None,
    max_tokens: int = 4096,
    images: Optional[list[dict]] = None,
    max_retries: int = 3,
) -> str:
    """Call an LLM via OpenRouter's OpenAI-compatible API.

    Args:
        prompt: The user message text.
        model_tier: 'reasoning', 'fast', or 'vision'.
        system: Optional system prompt.
        max_tokens: Maximum response tokens.
        images: Optional list of image content dicts for Vision calls.
        max_retries: Number of retry attempts.

    Returns:
        The text content of the response.
    """
    if not settings.openrouter_api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Add it to .env.local"
        )

    model = MODEL_TIERS.get(model_tier, settings.openrouter_model_reasoning)

    # Build messages
    messages = []
    if system:
        messages.append({"role": "system", "content": system})

    # Build user message content
    if images:
        # Multimodal: images + text
        content = []
        for img in images:
            content.append(img)
        content.append({"type": "text", "text": prompt})
        messages.append({"role": "user", "content": content})
    else:
        messages.append({"role": "user", "content": prompt})

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://luxury-auto-arbitrage.com",
        "X-Title": "Valuation Agent",
    }

    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": messages,
    }

    for attempt in range(1, max_retries + 1):
        start = time.perf_counter()
        try:
            with httpx.Client(timeout=120.0) as client:
                response = client.post(
                    f"{settings.openrouter_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()

            elapsed = time.perf_counter() - start

            # Extract response text
            text = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})

            logger.info(
                "LLM call | model=%s tier=%s tokens_in=%d tokens_out=%d "
                "latency=%.2fs prompt_hash=%s",
                model,
                model_tier,
                usage.get("prompt_tokens", 0),
                usage.get("completion_tokens", 0),
                elapsed,
                _prompt_hash(prompt),
            )
            return text

        except httpx.HTTPStatusError as e:
            elapsed = time.perf_counter() - start
            if e.response.status_code == 429:
                wait = 2**attempt
                logger.warning(
                    "Rate limited (attempt %d/%d), waiting %ds",
                    attempt, max_retries, wait,
                )
                time.sleep(wait)
            else:
                logger.error(
                    "API error %d (attempt %d/%d): %s (%.2fs)",
                    e.response.status_code,
                    attempt,
                    max_retries,
                    e.response.text[:200],
                    elapsed,
                )
                if attempt == max_retries:
                    raise
                time.sleep(2**attempt)

        except (httpx.ConnectError, httpx.ReadTimeout) as e:
            elapsed = time.perf_counter() - start
            logger.error(
                "Connection error (attempt %d/%d): %s (%.2fs)",
                attempt, max_retries, e, elapsed,
            )
            if attempt == max_retries:
                raise
            time.sleep(2**attempt)

    raise RuntimeError(f"LLM call failed after {max_retries} attempts")


def call_claude_vision(
    prompt: str,
    image_paths: list[str],
    *,
    model_tier: str = "vision",
    system: Optional[str] = None,
    max_tokens: int = 4096,
) -> str:
    """Send images to Claude Vision via OpenRouter.

    Args:
        prompt: The user message text.
        image_paths: List of local file paths to images.
        model_tier: Model tier (defaults to 'vision').
        system: Optional system prompt.
        max_tokens: Maximum response tokens.

    Returns:
        The text content of the response.
    """
    images = []
    for path_str in image_paths:
        path = Path(path_str)
        if not path.exists():
            logger.warning("Image not found, skipping: %s", path_str)
            continue

        mime_type = mimetypes.guess_type(str(path))[0] or "image/jpeg"
        with open(path, "rb") as f:
            data = base64.standard_b64encode(f.read()).decode("utf-8")

        images.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{data}",
                },
            }
        )

    if not images:
        logger.warning("No valid images found, calling without images")

    return call_claude(
        prompt,
        model_tier=model_tier,
        system=system,
        max_tokens=max_tokens,
        images=images if images else None,
    )


def load_prompt(prompt_name: str) -> str:
    """Load a prompt template from the prompts directory.

    Args:
        prompt_name: Filename without extension, e.g. 'enrichment'.

    Returns:
        The prompt text content.
    """
    prompts_dir = Path(__file__).parent / "prompts"
    prompt_file = prompts_dir / f"{prompt_name}.txt"
    if not prompt_file.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_file}")
    return prompt_file.read_text(encoding="utf-8")
