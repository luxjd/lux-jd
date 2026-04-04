"""Auction sheet OCR + parsing via Claude Vision."""

import json
import logging

from valuation_agent.llm.client import call_claude_vision, load_prompt

logger = logging.getLogger(__name__)


async def parse_auction_sheet(sheet_path: str) -> dict:
    """Parse a Japanese auction inspection sheet image using Claude Vision.

    Args:
        sheet_path: Local file path to the auction sheet image.

    Returns:
        Parsed auction sheet data as a dictionary.
    """
    prompt = load_prompt("sheet_parsing")

    try:
        response = call_claude_vision(
            prompt=prompt,
            image_paths=[sheet_path],
            model_tier="reasoning",
            system="You are an expert Japanese vehicle auction sheet analyst. Return only valid JSON.",
        )
        data = json.loads(response)
        logger.info(
            "Auction sheet parsed: grade=%s, confidence=%.2f",
            data.get("overall_grade"),
            data.get("confidence", 0),
        )
        return data

    except (json.JSONDecodeError, KeyError) as e:
        logger.error("Failed to parse auction sheet response: %s", e)
        return {"error": str(e), "confidence": 0.0}
