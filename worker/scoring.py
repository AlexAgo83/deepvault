from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple


STOP_WORDS: Set[str] = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "give",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "of",
    "on",
    "or",
    "our",
    "please",
    "show",
    "summarize",
    "tell",
    "the",
    "to",
    "what",
    "when",
    "which",
    "who",
    "with",
    "you",
}

GENERIC_DOC_TOKENS: Set[str] = {
    "content",
    "copy",
    "doc",
    "docs",
    "document",
    "documents",
    "draft",
    "file",
    "files",
    "final",
    "image",
    "images",
    "library",
    "libraries",
    "list",
    "lists",
    "note",
    "notes",
    "page",
    "pages",
    "path",
    "pdf",
    "ppt",
    "pptx",
    "presentation",
    "shared",
    "sharepoint",
    "sheet",
    "sheets",
    "slide",
    "slides",
    "source",
    "sources",
    "spreadsheet",
    "tab",
    "tabs",
    "text",
    "track",
    "tracking",
    "version",
}

ANALYSIS_STATUS_FRESH = "analyzed"
ANALYSIS_CONFIDENCE_THRESHOLD = 0.7
MAX_ENRICHMENT_BONUS_RATIO = 0.15

TITLE_WEIGHT = 8
SUMMARY_WEIGHT = 6
SECTION_HEADING_WEIGHT = 7
SECTION_CONTENT_WEIGHT = 4
CONTENT_WEIGHT = 4
TAG_WEIGHT = 5
PATH_WEIGHT = 2
AUTHOR_WEIGHT = 3
FILE_TYPE_WEIGHT = 2


def normalize_text(value: str) -> str:
    return "".join(
        character.lower() if character.isalnum() else " "
        for character in str(value or "")
    ).strip()


def tokenize(value: str) -> List[str]:
    normalized = normalize_text(value)
    if not normalized:
        return []
    return [token for token in normalized.split() if token and token not in STOP_WORDS]


def is_meaningful_token(token: str) -> bool:
    return bool(token) and token not in STOP_WORDS and token not in GENERIC_DOC_TOKENS


def extract_meaningful_tokens(value: Any) -> List[str]:
    if isinstance(value, (list, tuple)):
        text = " ".join(str(part) for part in value)
    else:
        text = str(value or "")

    seen: Set[str] = set()
    result: List[str] = []
    for token in tokenize(text):
        if is_meaningful_token(token) and token not in seen:
            result.append(token)
            seen.add(token)
    return result


def _normalize_sections(sections: Optional[Sequence[Dict[str, Any]]]) -> List[Tuple[str, str]]:
    result: List[Tuple[str, str]] = []
    for section in sections or []:
        result.append(
            (
                normalize_text(str(section.get("heading", ""))),
                normalize_text(str(section.get("content", ""))),
            )
        )
    return result


def _confidence_bonus_ratio(confidence: float) -> float:
    normalized_confidence = _normalize_confidence(confidence)
    if normalized_confidence < ANALYSIS_CONFIDENCE_THRESHOLD:
        return 0.0

    scaled = (normalized_confidence - ANALYSIS_CONFIDENCE_THRESHOLD) / (
        1.0 - ANALYSIS_CONFIDENCE_THRESHOLD
    )
    bounded = max(0.0, min(scaled, 1.0))
    return bounded * MAX_ENRICHMENT_BONUS_RATIO


def _normalize_confidence(confidence: float) -> float:
    # The analyze pipeline writes confidence on a 55-95 scale, but older tests and
    # transitional payloads may still provide a 0..1 ratio. Accept both formats.
    if confidence > 1.0:
        return max(0.0, min(confidence / 100.0, 1.0))
    return max(0.0, min(confidence, 1.0))


def _enrichment_ready(document: Dict[str, Any]) -> bool:
    analysis = document.get("analysis")
    if not isinstance(analysis, dict):
        return False

    status = analysis.get("status")
    confidence = analysis.get("confidence")
    return (
        status == ANALYSIS_STATUS_FRESH
        and isinstance(confidence, (int, float))
        and _normalize_confidence(float(confidence)) >= ANALYSIS_CONFIDENCE_THRESHOLD
    )


def _merge_keywords(base_tags: Iterable[Any], analysis_keywords: Iterable[Any]) -> List[str]:
    return [str(tag) for tag in list(base_tags) + list(analysis_keywords)]


def prepare_document_for_scoring(document: Dict[str, Any]) -> Dict[str, Any]:
    prepared = dict(document)
    analysis = document.get("analysis")

    if _enrichment_ready(document) and isinstance(analysis, dict):
        # Prefer fresh enrichment fields only when the analyze confidence is high
        # enough to trust. Unenriched or low-confidence documents keep the static
        # field path unchanged.
        analysis_summary = str(analysis.get("summary") or "").strip()
        analysis_keywords = analysis.get("keywords") or []
        analysis_sections = analysis.get("sections") or []

        if analysis_summary:
            prepared["summary"] = analysis_summary
        prepared["tags"] = _merge_keywords(document.get("tags") or [], analysis_keywords)
        if analysis_sections:
            prepared["sections"] = analysis_sections

    return prepared


def get_document_score(document: Dict[str, Any], query: str) -> float:
    tokens = tokenize(query)
    if not tokens:
        return 0.0

    prepared = prepare_document_for_scoring(document)

    title_tokens = set(extract_meaningful_tokens(prepared.get("title", "")))
    summary_tokens = set(extract_meaningful_tokens(prepared.get("summary", "")))
    tag_tokens = set(extract_meaningful_tokens(prepared.get("tags", [])))
    path_tokens = set(extract_meaningful_tokens(prepared.get("path", "")))
    author_tokens = set(extract_meaningful_tokens(prepared.get("author", ""))) if prepared.get("author") else set()
    file_type_tokens = set(tokenize(str(prepared.get("fileType", "")))) if prepared.get("fileType") else set()
    normalized_content = normalize_text(str(prepared.get("content", "")))
    section_fields = _normalize_sections(prepared.get("sections"))

    score = 0.0
    for token in tokens:
        if token in title_tokens:
            score += TITLE_WEIGHT
        if token in summary_tokens:
            score += SUMMARY_WEIGHT
        if section_fields:
            for heading, content in section_fields:
                if token in heading:
                    score += SECTION_HEADING_WEIGHT
                if token in content:
                    score += SECTION_CONTENT_WEIGHT
        elif token in normalized_content:
            score += CONTENT_WEIGHT
        if token in tag_tokens:
            score += TAG_WEIGHT
        if token in path_tokens:
            score += PATH_WEIGHT
        if token in author_tokens:
            score += AUTHOR_WEIGHT
        if token in file_type_tokens:
            score += FILE_TYPE_WEIGHT

    analysis = document.get("analysis")
    if score > 0 and _enrichment_ready(document) and isinstance(analysis, dict):
        # The confidence multiplier is intentionally bounded so enriched documents
        # can outrank equivalent plain matches without overwhelming better raw hits.
        confidence = float(analysis["confidence"])
        score += score * _confidence_bonus_ratio(confidence)

    return score


def rank_documents(documents: Sequence[Dict[str, Any]], query: str) -> List[Tuple[Dict[str, Any], float]]:
    ranked = [(document, get_document_score(document, query)) for document in documents]
    return sorted(ranked, key=lambda entry: entry[1], reverse=True)
