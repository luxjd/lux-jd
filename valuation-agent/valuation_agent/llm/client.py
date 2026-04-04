"""Claude API wrapper with retry, logging, and model tiering."""

import hashlib
import logging
import time
from pathlib import Path
from typing import Optional

import anthropic

from valuation_agent.config import settings

logger = logging.getLogger(__name__)

# Model tier mapping
MODEL_TIERS = {
    "reasoning": settings.claude_model_reasoning,
    "fast": settings.claude_model_fast,
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
    """Call Claude API with retry logic and logging.

    Args:
        prompt: The user message text.
        model_tier: 'reasoning' (Sonnet) or 'fast' (Haiku).
        system: Optional system prompt.
        max_tokens: Maximum response tokens.
        images: Optional list of image content blocks for Vision calls.
        max_retries: Number of retry attempts.

    Returns:
        The text content of Claude's response.
    """
    model = MODEL_TIERS.get(model_tier, settings.claude_model_reasoning)
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Build message content
    content: list[dict] = []
    if images:
        content.extend(images)
    content.append({"type": "text", "text": prompt})

    messages = [{"role": "user", "content": content}]

    for attempt in range(1, max_retries + 1):
        start = time.perf_counter()
        try:
            kwargs: dict = {
                "model": model,
                "max_tokens": max_tokens,
                "messages": messages,
            }
            if system:
                kwargs["system"] = system

            response = client.messages.create(**kwargs)
            elapsed = time.perf_counter() - start

            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            text = response.content[0].text

            logger.info(
                "LLM call | model=%s tier=%s tokens_in=%d tokens_out=%d "
                "latency=%.2fs prompt_hash=%s",
                model,
                model_tier,
                input_tokens,
                output_tokens,
                elapsed,
                _prompt_hash(prompt),
            )
            return text

        except anthropic.RateLimitError:
            wait = 2**attempt
            logger.warning("Rate limited (attempt %d/%d), waiting %ds", attempt, max_retries, wait)
            time.sleep(wait)
        except anthropic.APIError as e:
            elapsed = time.perf_counter() - start
            logger.error("API error (attempt %d/%d): %s (%.2fs)", attempt, max_retries, e, elapsed)
            if attempt == max_retries:
                raise
            time.sleep(2**attempt)

    raise RuntimeError(f"Failed after {max_retries} attempts")


def call_claude_vision(
    prompt: str,
    image_paths: list[str],
    *,
    model_tier: str = "reasoning",
    system: Optional[str] = None,
    max_tokens: int = 4096,
) -> str:
    """Send images to Claude Vision for analysis.

    Args:
        prompt: The user message text.
        image_paths: List of local file paths to images.
        model_tier: 'reasoning' or 'fast'.
        system: Optional system prompt.
        max_tokens: Maximum response tokens.

    Returns:
        The text content of Claude's response.
    """
    import base64
    import mimetypes

    images = []
    for path_str in image_paths:
        path = Path(path_str)
        if not path.exists():
            logger.warning("Image not found: %s", path_str)
            continue

        mime_type = mimetypes.guess_type(str(path))[0] or "image/jpeg"
        with open(path, "rb") as f:
            data = base64.standard_b64encode(f.read()).decode("utf-8")

        images.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mime_type,
                    "data": data,
                },
            }
        )

    if not images:
        logger.warning("No valid images provided, calling without images")

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
