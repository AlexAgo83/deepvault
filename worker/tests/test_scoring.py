from __future__ import annotations

from worker.scoring import (
    ANALYSIS_CONFIDENCE_THRESHOLD,
    extract_meaningful_tokens,
    get_document_score,
    rank_documents,
    tokenize,
)


BASE_DOCUMENT = {
    "title": "Notes",
    "summary": "General notes",
    "content": "Some flat content",
    "tags": [],
    "path": "/Documents/Notes.md",
}


def test_tokenize_matches_existing_stop_word_behavior() -> None:
    assert tokenize("What is the Q3 budget for the pilot site?") == ["q3", "budget", "pilot", "site"]


def test_extract_meaningful_tokens_skips_generic_noise() -> None:
    assert extract_meaningful_tokens("Shared documents for the Smart Connector PDF") == ["smart", "connector"]


def test_unenriched_scoring_keeps_static_weight_ordering() -> None:
    title_match = get_document_score(
        {
            "title": "Q3 Budget",
            "summary": "Pilot budget summary",
            "content": "Budget content",
            "tags": ["finance"],
            "path": "/Documents/Q3 Budget.docx",
        },
        "q3 budget",
    )
    content_match = get_document_score(
        {
            "title": "Notes",
            "summary": "General notes",
            "content": "Q3 budget discussed here",
            "tags": ["finance"],
            "path": "/Documents/Notes.docx",
        },
        "q3 budget",
    )

    assert title_match > content_match


def test_high_confidence_enrichment_boosts_rank_with_preferred_fields() -> None:
    unenriched = {
        "id": "plain",
        "title": "Quarterly planning memo",
        "summary": "General planning notes",
        "content": "Generic planning content",
        "tags": ["planning"],
        "path": "/Documents/planning-memo.docx",
    }
    enriched = {
        **unenriched,
        "id": "enriched",
        "analysis": {
            "status": "analyzed",
            "summary": "Budget approval and operating reserve guidance",
            "keywords": ["budget", "approval"],
            "sections": [{"heading": "Operating Reserve", "content": "Budget approval target is six percent."}],
            "confidence": 0.95,
        },
    }

    ranked = rank_documents([unenriched, enriched], "budget approval operating reserve")

    assert ranked[0][0]["id"] == "enriched"
    assert ranked[0][1] > ranked[1][1]


def test_low_confidence_enrichment_does_not_apply_bonus_or_preferred_fields() -> None:
    low_confidence = {
        "id": "low-confidence",
        "title": "Quarterly planning memo",
        "summary": "General planning notes",
        "content": "Generic planning content",
        "tags": ["planning"],
        "path": "/Documents/planning-memo.docx",
        "analysis": {
            "status": "analyzed",
            "summary": "Budget approval and operating reserve guidance",
            "keywords": ["budget", "approval"],
            "sections": [{"heading": "Operating Reserve", "content": "Budget approval target is six percent."}],
            "confidence": ANALYSIS_CONFIDENCE_THRESHOLD - 0.05,
        },
    }
    plain = {
        "id": "plain",
        "title": "Quarterly planning memo",
        "summary": "General planning notes",
        "content": "Generic planning content",
        "tags": ["planning"],
        "path": "/Documents/planning-memo.docx",
    }

    assert get_document_score(low_confidence, "budget approval operating reserve") == get_document_score(
        plain,
        "budget approval operating reserve",
    )
