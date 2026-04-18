from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

import httpx

from worker.app.config import Settings
from worker.app.services.corpus_service import CorpusService
from worker.scoring import get_document_score, normalize_text, tokenize


DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
PROMPT_CACHING_BETA = "prompt-caching-2024-07-31"


@dataclass
class SearchResult:
    document: Dict[str, Any]
    score: float
    permitted: bool


@dataclass
class RemoteAttemptResult:
    result: Optional[Dict[str, Any]]
    error_preview: Optional[str] = None


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
        fallback = self._build_fallback_result(
            grounding,
            provider=effective_provider,
            query=query,
            prompt=prompt,
            mode="grounded-only" if grounding["status"] != "answered" else "fallback",
        )

        if grounding["status"] != "answered":
            return fallback

        remote_attempt = self._run_remote_answer(
            provider=effective_provider,
            query=query,
            role=role,
            grounding=grounding,
            prompt=prompt,
            history=history or [],
        )
        if remote_attempt.result is not None:
            return remote_attempt.result

        return self._build_fallback_result(
            grounding,
            provider=effective_provider,
            query=query,
            prompt=prompt,
            mode="fallback",
            error_preview=remote_attempt.error_preview,
        )

    def _build_fallback_result(
        self,
        grounding: Dict[str, Any],
        *,
        provider: str,
        query: str,
        prompt: str,
        mode: str,
        error_preview: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self._build_result(
            status=grounding["status"],
            provider=provider,
            query=query,
            answer=grounding["localAnswer"],
            sources=grounding["sources"],
            denied_sources=grounding["deniedSources"],
            chunk_count=grounding["chunkCount"],
            token_count=grounding["tokenCount"],
            input_token_count=None,
            output_token_count=None,
            usage_kind="local",
            latency_ms=grounding["latencyMs"],
            mode=mode,
            prompt=prompt,
            error_preview=error_preview,
            model=None,
        )

    def _build_result(
        self,
        *,
        status: str,
        provider: str,
        query: str,
        answer: str,
        sources: List[Dict[str, Any]],
        denied_sources: List[Dict[str, Any]],
        chunk_count: int,
        token_count: int,
        input_token_count: Optional[int],
        output_token_count: Optional[int],
        usage_kind: str,
        latency_ms: int,
        mode: str,
        prompt: str,
        error_preview: Optional[str],
        model: Optional[str],
    ) -> Dict[str, Any]:
        return {
            "status": status,
            "provider": provider,
            "query": query,
            "answer": answer,
            "model": model,
            "sources": sources,
            "deniedSources": denied_sources,
            "chunkCount": chunk_count,
            "tokenCount": token_count,
            "inputTokenCount": input_token_count,
            "outputTokenCount": output_token_count,
            "usageKind": usage_kind,
            "latencyMs": latency_ms,
            "confidence": self._build_confidence(status=status, sources=sources, denied_sources=denied_sources, chunk_count=chunk_count, mode=mode),
            "trace": {
                "mode": mode,
                "providerTracePreview": self._build_provider_trace_preview(mode, provider, answer, error_preview),
                "prompt": prompt,
            },
        }

    def _run_remote_answer(
        self,
        *,
        provider: str,
        query: str,
        role: str,
        grounding: Dict[str, Any],
        prompt: str,
        history: Sequence[Dict[str, str]],
    ) -> RemoteAttemptResult:
        if provider == "openai":
            return self._run_openai_remote_answer(query=query, role=role, provider=provider, grounding=grounding, prompt=prompt)
        if provider == "gemini":
            return self._run_gemini_remote_answer(query=query, role=role, provider=provider, grounding=grounding, prompt=prompt)
        return self._run_anthropic_remote_answer(
            query=query,
            role=role,
            provider=provider,
            grounding=grounding,
            prompt=prompt,
            history=history,
        )

    def _run_openai_remote_answer(
        self,
        *,
        query: str,
        role: str,
        provider: str,
        grounding: Dict[str, Any],
        prompt: str,
    ) -> RemoteAttemptResult:
        api_key, model = self._get_provider_runtime_config("openai")
        if not api_key:
            return RemoteAttemptResult(result=None, error_preview="OpenAI API key missing")

        try:
            response = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "authorization": f"Bearer {api_key}",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "temperature": 0,
                    "max_tokens": 512,
                    "messages": [
                        {"role": "system", "content": self._build_system_prompt(role=role, provider=provider)},
                        {"role": "user", "content": prompt},
                    ],
                },
                timeout=30.0,
            )
            if response.status_code >= 400:
                return RemoteAttemptResult(result=None, error_preview=self._build_http_error_preview(response))

            payload = response.json()
            answer = str(payload.get("choices", [{}])[0].get("message", {}).get("content") or grounding["localAnswer"]).strip()
            usage = payload.get("usage") or {}
            usage_snapshot = self._build_usage_snapshot(
                input_token_count=self._as_positive_int(usage.get("prompt_tokens")),
                output_token_count=self._as_positive_int(usage.get("completion_tokens")),
                fallback_token_count=self._as_positive_int(usage.get("total_tokens")) or grounding["tokenCount"],
            )
            return RemoteAttemptResult(
                result=self._build_result(
                    status=grounding["status"],
                    provider=provider,
                    query=query,
                    answer=answer,
                    sources=grounding["sources"],
                    denied_sources=grounding["deniedSources"],
                    chunk_count=grounding["chunkCount"],
                    token_count=usage_snapshot["totalTokenCount"],
                    input_token_count=usage_snapshot["inputTokenCount"],
                    output_token_count=usage_snapshot["outputTokenCount"],
                    usage_kind=usage_snapshot["usageKind"],
                    latency_ms=grounding["latencyMs"],
                    mode="remote",
                    prompt=prompt,
                    error_preview=None,
                    model=model,
                )
            )
        except httpx.HTTPError:
            return RemoteAttemptResult(result=None, error_preview="OpenAI request failed")

    def _run_gemini_remote_answer(
        self,
        *,
        query: str,
        role: str,
        provider: str,
        grounding: Dict[str, Any],
        prompt: str,
    ) -> RemoteAttemptResult:
        api_key, model = self._get_provider_runtime_config("gemini")
        if not api_key:
            return RemoteAttemptResult(result=None, error_preview="Gemini API key missing")

        try:
            response = httpx.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                headers={
                    "content-type": "application/json",
                    "x-goog-api-key": api_key,
                },
                json={
                    "systemInstruction": {
                        "parts": [{"text": self._build_system_prompt(role=role, provider=provider)}],
                    },
                    "contents": [
                        {
                            "role": "user",
                            "parts": [{"text": prompt}],
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0,
                        "maxOutputTokens": 512,
                    },
                },
                timeout=30.0,
            )
            if response.status_code >= 400:
                return RemoteAttemptResult(result=None, error_preview=self._build_http_error_preview(response))

            payload = response.json()
            parts = payload.get("candidates", [{}])[0].get("content", {}).get("parts") or []
            answer = "\n".join(str(part.get("text") or "").strip() for part in parts if str(part.get("text") or "").strip()).strip()
            answer = answer or grounding["localAnswer"]
            usage = payload.get("usageMetadata") or {}
            usage_snapshot = self._build_usage_snapshot(
                input_token_count=self._as_positive_int(usage.get("promptTokenCount")),
                output_token_count=self._as_positive_int(usage.get("candidatesTokenCount")),
                fallback_token_count=self._as_positive_int(usage.get("totalTokenCount")) or grounding["tokenCount"],
            )
            return RemoteAttemptResult(
                result=self._build_result(
                    status=grounding["status"],
                    provider=provider,
                    query=query,
                    answer=answer,
                    sources=grounding["sources"],
                    denied_sources=grounding["deniedSources"],
                    chunk_count=grounding["chunkCount"],
                    token_count=usage_snapshot["totalTokenCount"],
                    input_token_count=usage_snapshot["inputTokenCount"],
                    output_token_count=usage_snapshot["outputTokenCount"],
                    usage_kind=usage_snapshot["usageKind"],
                    latency_ms=grounding["latencyMs"],
                    mode="remote",
                    prompt=prompt,
                    error_preview=None,
                    model=model,
                )
            )
        except httpx.HTTPError:
            return RemoteAttemptResult(result=None, error_preview="Gemini request failed")

    def _run_anthropic_remote_answer(
        self,
        *,
        query: str,
        role: str,
        provider: str,
        grounding: Dict[str, Any],
        prompt: str,
        history: Sequence[Dict[str, str]],
    ) -> RemoteAttemptResult:
        api_key, model = self._get_provider_runtime_config("anthropic")
        if not api_key:
            return RemoteAttemptResult(result=None, error_preview="Anthropic API key missing")

        try:
            response = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "content-type": "application/json",
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "anthropic-beta": PROMPT_CACHING_BETA,
                },
                json={
                    "model": model,
                    "max_tokens": 512,
                    "temperature": 0,
                    "system": [
                        {
                            "type": "text",
                            "text": self._build_system_prompt(role=role, provider=provider),
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": f"Question: {query}"},
                                {
                                    "type": "text",
                                    "text": self._build_grounding_context(grounding, history=history),
                                    "cache_control": {"type": "ephemeral"},
                                },
                            ],
                        }
                    ],
                },
                timeout=30.0,
            )
            if response.status_code >= 400:
                return RemoteAttemptResult(result=None, error_preview=self._build_http_error_preview(response))

            payload = response.json()
            answer = self._extract_anthropic_text(payload) or grounding["localAnswer"]
            usage = payload.get("usage") or {}
            usage_snapshot = self._build_usage_snapshot(
                input_token_count=self._as_positive_int(usage.get("input_tokens")),
                output_token_count=self._as_positive_int(usage.get("output_tokens")),
                fallback_token_count=grounding["tokenCount"],
            )
            return RemoteAttemptResult(
                result=self._build_result(
                    status=grounding["status"],
                    provider=provider,
                    query=query,
                    answer=answer,
                    sources=grounding["sources"],
                    denied_sources=grounding["deniedSources"],
                    chunk_count=grounding["chunkCount"],
                    token_count=usage_snapshot["totalTokenCount"],
                    input_token_count=usage_snapshot["inputTokenCount"],
                    output_token_count=usage_snapshot["outputTokenCount"],
                    usage_kind=usage_snapshot["usageKind"],
                    latency_ms=grounding["latencyMs"],
                    mode="remote",
                    prompt=prompt,
                    error_preview=None,
                    model=model,
                )
            )
        except httpx.HTTPError:
            return RemoteAttemptResult(result=None, error_preview="Anthropic request failed")

    def _get_provider_runtime_config(self, provider: str) -> tuple[str, str]:
        model_override = (self._settings.bishop_model or "").strip()
        if provider == "openai":
            return (self._settings.openai_api_key.strip(), model_override or DEFAULT_OPENAI_MODEL)
        if provider == "gemini":
            return (self._settings.gemini_api_key.strip(), model_override or DEFAULT_GEMINI_MODEL)
        return (self._settings.anthropic_api_key.strip(), model_override or DEFAULT_ANTHROPIC_MODEL)

    def _build_system_prompt(self, *, role: str, provider: str) -> str:
        return "\n".join(
            [
                "You are Bishop, a grounded assistant.",
                f"Role: {role}",
                f"Provider: {provider}",
                "Use the conversation history to preserve follow-up context, but keep factual claims grounded in the corpus context in the user message.",
                "Answer in one concise grounded paragraph.",
            ]
        )

    def _build_grounding_context(self, grounding: Dict[str, Any], *, history: Sequence[Dict[str, str]]) -> str:
        history_lines = [f"- {item.get('role', 'user')}: {self._truncate(item.get('text') or '')}" for item in history if item.get("text")]
        source_lines = [self._build_source_line(source, index) for index, source in enumerate(grounding["sources"])]
        denied_lines = [f"- {source['title']} | {source['siteName']} | {source['path']}" for source in grounding["deniedSources"]]
        return "\n".join(
            [
                *(["Conversation history:", *history_lines] if history_lines else []),
                f"Grounding status: {grounding['status']}",
                "Sources:",
                *(source_lines or ["- none"]),
                "Denied sources:",
                *(denied_lines or ["- none"]),
            ]
        )

    def _build_source_line(self, source: Dict[str, Any], index: int) -> str:
        parts = [source["title"], source["siteName"], source["path"], source["summary"]]
        if source.get("author"):
            parts.append(f"by {source['author']}")
        if source.get("sectionHint"):
            parts.append(f"\u00a7 {source['sectionHint']}")
        return f"{index + 1}. {' | '.join(parts)}"

    def _build_http_error_preview(self, response: httpx.Response) -> str:
        try:
            error_text = response.text.strip()
        except Exception:
            error_text = ""
        return f"HTTP {response.status_code}{f': {error_text}' if error_text else ''}"

    def _extract_anthropic_text(self, payload: Dict[str, Any]) -> str:
        blocks = payload.get("content") or []
        texts = [str(block.get("text") or "").strip() for block in blocks if block.get("type") == "text" and str(block.get("text") or "").strip()]
        return "\n".join(texts).strip()

    def _build_usage_snapshot(
        self,
        *,
        input_token_count: Optional[int],
        output_token_count: Optional[int],
        fallback_token_count: int,
    ) -> Dict[str, Any]:
        has_input = isinstance(input_token_count, int) and input_token_count > 0
        has_output = isinstance(output_token_count, int) and output_token_count > 0
        total_token_count = (input_token_count or 0) + (output_token_count or 0)
        if has_input and has_output:
            return {
                "inputTokenCount": input_token_count,
                "outputTokenCount": output_token_count,
                "totalTokenCount": total_token_count,
                "usageKind": "provider",
            }
        if fallback_token_count > 0:
            return {
                "inputTokenCount": None,
                "outputTokenCount": None,
                "totalTokenCount": fallback_token_count,
                "usageKind": "partial",
            }
        return {
            "inputTokenCount": None,
            "outputTokenCount": None,
            "totalTokenCount": 0,
            "usageKind": "local",
        }

    def _as_positive_int(self, value: Any) -> Optional[int]:
        if isinstance(value, bool):
            return None
        if isinstance(value, int) and value > 0:
            return value
        return None

    def _build_provider_trace_preview(self, mode: str, provider: str, answer: str, error_preview: Optional[str]) -> str:
        if error_preview:
            return f"{provider} error: {self._truncate(error_preview)}"
        if mode == "remote":
            return f"{provider} response: {self._truncate(answer)}"
        return f"Local fallback: {self._truncate(answer)}"

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
        history_lines = [f"- {'Bishop' if item.get('role') == 'assistant' else 'You'}: {self._truncate(item.get('text') or '')}" for item in history if item.get("text")]
        source_lines = [self._build_source_line(source, index) for index, source in enumerate(grounding["sources"])]
        denied_lines = [f"- {source['title']} | {source['siteName']} | {source['path']}" for source in grounding["deniedSources"]]
        return "\n".join(
            [
                "You are Bishop, a grounded assistant.",
                f"Role: {role}",
                f"Provider: {provider}",
                f"Question: {query}",
                *(["Conversation history:", *history_lines] if history_lines else []),
                f"Grounding status: {grounding['status']}",
                "Use only the grounded context below.",
                "Sources:",
                *(source_lines or ["- none"]),
                "Denied sources:",
                *(denied_lines or ["- none"]),
                "Answer in one concise grounded paragraph.",
            ]
        )

    def _build_confidence(
        self,
        *,
        status: str,
        sources: Sequence[Dict[str, Any]],
        denied_sources: Sequence[Dict[str, Any]],
        chunk_count: int,
        mode: str,
    ) -> int:
        score = 76 if mode == "remote" else 61 if mode == "grounded-only" else 54
        score += min(14, len(sources) * 4)
        score += min(8, round(chunk_count / 2))
        if status == "answered":
            score += 6
        elif status == "no_permitted_sources":
            score -= 10
        else:
            score -= 4
        if len(denied_sources) > len(sources):
            score -= 2
        return max(0, min(100, round(score)))

    def _truncate(self, value: str, max_length: int = 180) -> str:
        normalized = " ".join(value.split()).strip()
        if len(normalized) <= max_length:
            return normalized
        return f"{normalized[: max_length - 1].rstrip()}…"
