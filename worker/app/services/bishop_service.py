from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from worker.app.config import Settings
from worker.app.services.corpus_service import CorpusService
from worker.scoring import get_document_score, normalize_text, tokenize


@dataclass
class SearchResult:
    document: Dict[str, Any]
    score: float
    permitted: bool


class BishopService:
    def __init__(self, settings: Settings, corpus_service: CorpusService) -> None:
        self._settings = settings
        self._corpus_service = corpus_service

    def query(
        self,
        *,
        query: str,
        role: str = "analyst",
        provider: Optional[str] = None,
        history: Optional[Sequence[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        corpus = self._corpus_service.load_corpus_payload()
        effective_provider = provider or self._settings.bishop_provider or "openai"
        grounding = self._ground_question(corpus, query, role=role, provider=effective_provider)
        prompt = self._build_prompt(query=query, role=role, provider=effective_provider, grounding=grounding, history=history or [])

        return {
            "status": grounding["status"],
            "provider": effective_provider,
            "query": query,
            "answer": grounding["localAnswer"],
            "sources": grounding["sources"],
            "deniedSources": grounding["deniedSources"],
            "chunkCount": grounding["chunkCount"],
            "tokenCount": grounding["tokenCount"],
            "usageKind": "local",
            "latencyMs": grounding["latencyMs"],
            "confidence": self._build_confidence(grounding),
            "trace": {
                "mode": "grounded-only",
                "providerTracePreview": f"Local worker answer: {self._truncate(grounding['localAnswer'])}",
                "prompt": prompt,
            },
        }

    def _ground_question(self, corpus: Dict[str, Any], query: str, *, role: str, provider: str) -> Dict[str, Any]:
        normalized_query = normalize_text(query)
        if "sharepoint sites" in normalized_query or "available sites" in normalized_query:
            return {
                "status": "no_answer",
                "provider": provider,
                "query": query,
                "localAnswer": "DeepVault is answering from indexed document content, not from SharePoint site inventory.",
                "sources": [],
                "deniedSources": [],
                "chunkCount": 0,
                "tokenCount": 0,
                "latencyMs": 0,
            }

        all_results = self._search_documents(corpus, query, role=role, include_denied=True)
        denied_matches = [entry for entry in all_results if not entry.permitted]
        permitted_matches = [entry for entry in all_results if entry.permitted]
        denied_sources = [self._build_source(entry.document, entry.score, corpus, query=query) for entry in denied_matches]

        if not permitted_matches:
            if denied_matches:
                return {
                    "status": "no_permitted_sources",
                    "provider": provider,
                    "query": query,
                    "localAnswer": "I found relevant content, but your current role cannot access the matching sources.",
                    "sources": [],
                    "deniedSources": denied_sources,
                    "chunkCount": 0,
                    "tokenCount": 0,
                    "latencyMs": 0,
                }
            return {
                "status": "no_answer",
                "provider": provider,
                "query": query,
                "localAnswer": "No relevant content was found in the indexed pilot corpus.",
                "sources": [],
                "deniedSources": [],
                "chunkCount": 0,
                "tokenCount": 0,
                "latencyMs": 0,
            }

        sources = [self._build_source(entry.document, entry.score, corpus, query=query) for entry in permitted_matches[:3]]
        primary = permitted_matches[0].document
        local_answer = self._summarize_sentence(primary, query)
        return {
            "status": "answered",
            "provider": provider,
            "query": query,
            "localAnswer": local_answer,
            "sources": sources,
            "deniedSources": denied_sources,
            "chunkCount": len(sources) * 6,
            "tokenCount": min(2400, 120 + len(query) * 12 + sum(len(source["snippet"]) for source in sources)),
            "latencyMs": min(2400, 180 + len(sources) * 90 + len(query) * 4),
        }

    def _search_documents(self, corpus: Dict[str, Any], query: str, *, role: str, include_denied: bool) -> List[SearchResult]:
        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        results: List[SearchResult] = []
        for document in corpus.get("documents", []):
            prepared = dict(document)
            analysis = document.get("analysis") or {}
            if analysis.get("status") == "analyzed":
                if analysis.get("summary"):
                    prepared["summary"] = analysis["summary"]
                if analysis.get("keywords"):
                    prepared["tags"] = [*(document.get("tags") or []), *analysis["keywords"]]
                if analysis.get("sections"):
                    prepared["sections"] = analysis["sections"]

            score = get_document_score(prepared, query)
            minimum_score = 8 if len(query_tokens) > 1 else 4
            permitted = self._can_access(document, role)
            if score >= minimum_score and (include_denied or permitted):
                results.append(SearchResult(document=document, score=score, permitted=permitted))

        return sorted(
            results,
            key=lambda entry: (
                entry.score,
                entry.document.get("updatedAt", ""),
            ),
            reverse=True,
        )

    def _can_access(self, document: Dict[str, Any], role: str) -> bool:
        access = document.get("access") or []
        return role in access or "all" in access

    def _build_source(self, document: Dict[str, Any], score: float, corpus: Dict[str, Any], *, query: str) -> Dict[str, Any]:
        return {
            "id": document["id"],
            "title": document["title"],
            "siteId": document["siteId"],
            "siteName": self._get_site_name(corpus, document["siteId"]),
            "path": document["path"],
            "webUrl": document.get("webUrl"),
            "updatedAt": document["updatedAt"],
            "author": document["author"],
            "score": score,
            "summary": self._preferred_summary(document),
            "tags": [*(document.get("tags") or []), *self._preferred_keywords(document)],
            "access": document.get("access") or [],
            "snippet": document.get("directAnswer") or document.get("summary") or "",
            "source": document.get("source") or "",
            "sectionHint": self._find_section_hint(document, query),
            "fileType": document.get("fileType"),
        }

    def _get_site_name(self, corpus: Dict[str, Any], site_id: str) -> str:
        for site in corpus.get("sites", []):
            if site.get("id") == site_id:
                return site.get("name") or site_id
        return site_id

    def _preferred_summary(self, document: Dict[str, Any]) -> str:
        analysis = document.get("analysis") or {}
        if analysis.get("status") == "analyzed" and str(analysis.get("summary") or "").strip():
            return str(analysis["summary"]).strip()
        return str(document.get("summary") or "")

    def _preferred_keywords(self, document: Dict[str, Any]) -> List[str]:
        analysis = document.get("analysis") or {}
        if analysis.get("status") == "analyzed" and isinstance(analysis.get("keywords"), list):
            return [str(item) for item in analysis["keywords"]]
        return []

    def _preferred_sections(self, document: Dict[str, Any]) -> List[Dict[str, Any]]:
        analysis = document.get("analysis") or {}
        if analysis.get("status") == "analyzed" and isinstance(analysis.get("sections"), list) and analysis["sections"]:
            return analysis["sections"]
        return document.get("sections") or []

    def _summarize_sentence(self, document: Dict[str, Any], query: str) -> str:
        if document.get("directAnswer"):
            return str(document["directAnswer"])
        tokens = tokenize(query)
        for section in self._preferred_sections(document):
            heading = normalize_text(str(section.get("heading", "")))
            content = normalize_text(str(section.get("content", "")))
            if any(token in heading or token in content for token in tokens):
                return str(section.get("content") or "")
        content = str(document.get("content") or "")
        for sentence in content.split(". "):
            if any(token in normalize_text(sentence) for token in tokens):
                return sentence.strip()
        return self._preferred_summary(document) or content.split(".")[0]

    def _find_section_hint(self, document: Dict[str, Any], query: str) -> Optional[str]:
        tokens = tokenize(query)
        for section in self._preferred_sections(document):
            heading = str(section.get("heading") or "")
            content = str(section.get("content") or "")
            normalized_heading = normalize_text(heading)
            normalized_content = normalize_text(content)
            if any(token in normalized_heading or token in normalized_content for token in tokens):
                return heading
        return None

    def _build_prompt(
        self,
        *,
        query: str,
        role: str,
        provider: str,
        grounding: Dict[str, Any],
        history: Sequence[Dict[str, str]],
    ) -> str:
        history_lines = [f"- {item.get('role', 'user')}: {self._truncate(item.get('text') or '')}" for item in history if item.get("text")]
        source_lines = [
            f"{index + 1}. {source['title']} | {source['siteName']} | {source['path']} | {source['summary']}"
            for index, source in enumerate(grounding["sources"])
        ]
        return "\n".join(
            [
                "You are Bishop, a grounded assistant.",
                f"Role: {role}",
                f"Provider: {provider}",
                f"Question: {query}",
                *(["Conversation history:", *history_lines] if history_lines else []),
                f"Grounding status: {grounding['status']}",
                "Sources:",
                *(source_lines or ["- none"]),
                "Answer in one concise grounded paragraph.",
            ]
        )

    def _build_confidence(self, grounding: Dict[str, Any]) -> int:
        score = 61
        score += min(14, len(grounding["sources"]) * 4)
        score += min(8, round(grounding["chunkCount"] / 2))
        if grounding["status"] == "answered":
            score += 6
        elif grounding["status"] == "no_permitted_sources":
            score -= 10
        else:
            score -= 4
        return max(0, min(100, round(score)))

    def _truncate(self, value: str, max_length: int = 180) -> str:
        normalized = " ".join(value.split()).strip()
        if len(normalized) <= max_length:
            return normalized
        return f"{normalized[: max_length - 1].rstrip()}…"
