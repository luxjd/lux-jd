"""Claude Vision photo analysis for vehicle condition assessment."""

import json
import logging

from valuation_agent.llm.client import call_claude_vision, load_prompt
from valuation_agent.schemas import ConditionAssessment, ConditionGrade

logger = logging.getLogger(__name__)

# Maximum photos to send in a single Vision call
MAX_PHOTOS = 10


def select_representative_photos(photo_paths: list[str]) -> list[str]:
    """Select a representative set of photos if more than MAX_PHOTOS provided.

    Prioritizes: exterior front 3/4, rear 3/4, profile, interior overview,
    dashboard, engine bay, wheel close-up, and up to 3 detail shots.
    """
    if len(photo_paths) <= MAX_PHOTOS:
        return photo_paths
    # Simple strategy: take first MAX_PHOTOS (improve with classification later)
    logger.info(
        "Selecting %d representative photos from %d uploaded",
        MAX_PHOTOS,
        len(photo_paths),
    )
    return photo_paths[:MAX_PHOTOS]


async def analyze_photos(
    photo_paths: list[str],
    make: str,
    model: str,
    year: int,
) -> ConditionAssessment:
    """Analyze vehicle photos using Claude Vision.

    Args:
        photo_paths: List of local file paths to vehicle photos.
        make: Vehicle brand.
        model: Vehicle model name.
        year: Vehicle year.

    Returns:
        ConditionAssessment with scores and observations.
    """
    if not photo_paths:
        logger.warning("No photos provided for analysis")
        return ConditionAssessment(
            photo_analysis_summary="No photos provided",
            condition_confidence=0.3,
        )

    selected = select_representative_photos(photo_paths)
    prompt_template = load_prompt("photo_analysis")
    prompt = prompt_template.format(make=make, model=model, year=year)

    try:
        response = call_claude_vision(
            prompt=prompt,
            image_paths=selected,
            model_tier="reasoning",
            system="You are an expert luxury vehicle appraiser. Return only valid JSON.",
        )

        data = json.loads(response)

        # Map numeric scores to condition grade
        avg_score = (data.get("exterior_score", 5) + data.get("interior_score", 5)) / 2
        grade = _score_to_grade(avg_score)

        return ConditionAssessment(
            overall_grade=grade,
            overall_grade_numeric=avg_score,
            exterior_score=data.get("exterior_score", 5.0),
            exterior_notes=data.get("exterior_notes", []),
            interior_score=data.get("interior_score", 5.0),
            interior_notes=data.get("interior_notes", []),
            modification_notes=data.get("visible_modifications", []),
            photo_analysis_summary=data.get("overall_impression", ""),
            condition_confidence=data.get("confidence", 0.5),
        )

    except (json.JSONDecodeError, KeyError) as e:
        logger.error("Failed to parse photo analysis response: %s", e)
        return ConditionAssessment(
            photo_analysis_summary="Photo analysis failed — could not parse LLM response",
            condition_confidence=0.3,
        )


def _score_to_grade(score: float) -> ConditionGrade:
    if score >= 9.0:
        return ConditionGrade.EXCELLENT
    if score >= 7.5:
        return ConditionGrade.VERY_GOOD
    if score >= 6.0:
        return ConditionGrade.GOOD
    if score >= 4.0:
        return ConditionGrade.FAIR
    return ConditionGrade.POOR
