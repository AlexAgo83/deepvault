import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMockCorpusBundle } from '../src/data/corpus'
import { buildBishopPrompt, groundQuestion, orchestrateBishopAnswer } from '../src/lib/bishop'

const corpus = getMockCorpusBundle().corpus

describe('bishop orchestration helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('grounds inventory style questions before any LLM call', () => {
    const grounding = groundQuestion(corpus, 'What SharePoint sites are available for the Finance team?', {
      role: 'analyst',
      provider: 'openai',
    })

    expect(grounding.status).toBe('no_answer')
    expect(grounding.sources).toHaveLength(0)
    expect(grounding.localAnswer).toContain('SharePoint site inventory')
  })

  it('builds a grounded prompt from permitted sources', () => {
    const grounding = groundQuestion(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
    })

    const prompt = buildBishopPrompt({
      query: 'What is the budget for Q3 2025?',
      role: 'analyst',
      provider: 'openai',
      grounding,
    })

    expect(grounding.status).toBe('answered')
    expect(grounding.sources).not.toHaveLength(0)
    expect(prompt).toContain('Use only the grounded context below.')
    expect(prompt).toContain('Sources:')
    expect(prompt).toContain('Q3 2025 budget')
  })

  it('includes conversation history in the prompt when provided', () => {
    const grounding = groundQuestion(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
    })

    const prompt = buildBishopPrompt({
      query: 'What is the budget for Q3 2025?',
      role: 'analyst',
      provider: 'openai',
      grounding,
      conversationHistory: [
        { role: 'user', text: 'What did we discuss earlier?' },
        { role: 'assistant', text: 'We talked about the budget.' },
      ],
    })

    expect(prompt).toContain('Conversation history:')
    expect(prompt).toContain('- You: What did we discuss earlier?')
    expect(prompt).toContain('- Bishop: We talked about the budget.')
  })

  it('omits conversation history from the prompt when it is not provided', () => {
    const grounding = groundQuestion(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
    })

    const prompt = buildBishopPrompt({
      query: 'What is the budget for Q3 2025?',
      role: 'analyst',
      provider: 'openai',
      grounding,
    })

    expect(prompt).not.toContain('Conversation history:')
  })

  it('keeps denied sources visible in the grounding contract', () => {
    const grounding = groundQuestion(corpus, 'What are the restricted launch notes for the restricted pilot site?', {
      role: 'guest',
      provider: 'openai',
    })

    expect(grounding.status).toBe('no_permitted_sources')
    expect(grounding.deniedSources).not.toHaveLength(0)
    expect(grounding.localAnswer).toContain('current role cannot access')
  })

  it('falls back locally when no remote endpoint is configured', async () => {
    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
    })

    expect(result.mode).toBe('fallback')
    expect(result.answer).toContain('Q3 2025 budget')
  })

  it('keeps grounded-only answers explicit when the query has no answerable sources', async () => {
    const result = await orchestrateBishopAnswer(corpus, 'What SharePoint sites are available for the Finance team?', {
      role: 'analyst',
      provider: 'openai',
    })

    expect(result.mode).toBe('grounded-only')
    expect(result.status).toBe('no_answer')
  })

  it('uses a remote orchestration endpoint when it is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Remote answer from Bishop orchestration.',
        chunkCount: 42,
        tokenCount: 420,
        latencyMs: 84,
      }),
    })

    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
      endpoint: 'https://example.test/bishop',
      fetchImpl: fetchMock as typeof fetch,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.mode).toBe('remote')
    expect(result.answer).toBe('Remote answer from Bishop orchestration.')
    expect(result.chunkCount).toBe(42)
    expect(result.tokenCount).toBe(420)
    expect(result.latencyMs).toBe(84)
  })

  it('uses OpenAI when the provider is openai and the API key is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'OpenAI remote answer.',
            },
          },
        ],
        usage: {
          prompt_tokens: 111,
          completion_tokens: 22,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
      openaiApiKey: 'test-openai-key',
      bishopModel: 'gpt-test-model',
      conversationHistory: [
        { role: 'user', text: 'What did we discuss earlier?' },
        { role: 'assistant', text: 'We talked about the budget.' },
      ],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.mode).toBe('remote')
    expect(result.answer).toBe('OpenAI remote answer.')
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.tokenCount).toBe(133)
    expect(result.confidenceScore).toBeGreaterThan(70)
    expect(result.providerTracePreview).toContain('OpenAI remote answer.')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer test-openai-key',
        'content-type': 'application/json',
      },
    })

    const body = JSON.parse(init.body as string) as {
      model: string
      temperature: number
      max_tokens: number
      messages: Array<{ role: string; content: string }>
    }
    expect(body).toMatchObject({
      model: 'gpt-test-model',
      temperature: 0,
      max_tokens: 512,
    })
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('Use the conversation history to preserve follow-up context')
    expect(body.messages[1].role).toBe('user')
    expect(body.messages[1].content).toContain('Use only the grounded context below.')
    expect(body.messages[1].content).toContain('Conversation history:')
    expect(body.messages[1].content).toContain('- You: What did we discuss earlier?')
    expect(body.messages[1].content).toContain('- Bishop: We talked about the budget.')
  })

  it('uses Gemini when the provider is gemini and the API key is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Gemini remote answer.' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 88,
          candidatesTokenCount: 34,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'gemini',
      geminiApiKey: 'test-gemini-key',
      bishopModel: 'gemini-test-model',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.mode).toBe('remote')
    expect(result.answer).toBe('Gemini remote answer.')
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.tokenCount).toBe(122)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent?key=test-gemini-key')
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    })

    const body = JSON.parse(init.body as string) as {
      generationConfig: { temperature: number; maxOutputTokens: number }
      systemInstruction: { parts: Array<{ text: string }> }
      contents: Array<{ role: string; parts: Array<{ text: string }> }>
    }
    expect(body.generationConfig).toMatchObject({
      temperature: 0,
      maxOutputTokens: 512,
    })
    expect(body.systemInstruction.parts[0].text).toContain('Use the conversation history to preserve follow-up context')
    expect(body.contents[0].role).toBe('user')
    expect(body.contents[0].parts[0].text).toContain('Use only the grounded context below.')
  })

  it('uses Anthropic Claude when the API key is available', async () => {
    const createMock = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Claude remote answer.' }],
      usage: {
        input_tokens: 123,
        output_tokens: 45,
      },
    })
    const anthropicClient = {
      beta: {
        messages: {
          create: createMock,
        },
      },
    }

    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'anthropic',
      anthropicApiKey: 'test-api-key',
      bishopModel: 'claude-test-model',
      anthropicClient: anthropicClient as never,
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(result.mode).toBe('remote')
    expect(result.answer).toBe('Claude remote answer.')
    expect(result.chunkCount).toBeGreaterThan(0)
    expect(result.tokenCount).toBe(168)

    const [request] = createMock.mock.calls[0]
    expect(request).toMatchObject({
      model: 'claude-test-model',
      max_tokens: 512,
      temperature: 0,
      betas: ['prompt-caching-2024-07-31'],
    })
    expect((request as { system: Array<{ cache_control?: { type?: string } }> }).system[0].cache_control).toEqual({
      type: 'ephemeral',
    })
    expect(
      (request as { messages: Array<{ content: Array<{ cache_control?: { type?: string } }> }> }).messages[0].content[1]
        .cache_control,
    ).toEqual({ type: 'ephemeral' })
  })

  it('falls back locally when Anthropic is selected without an API key', async () => {
    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'anthropic',
    })

    expect(result.mode).toBe('fallback')
    expect(result.answer).toContain('Q3 2025 budget')
  })

  it('falls back locally when the Anthropic client throws', async () => {
    const createMock = vi.fn().mockRejectedValue(new Error('anthropic unavailable'))
    const anthropicClient = {
      beta: {
        messages: {
          create: createMock,
        },
      },
    }

    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'anthropic',
      anthropicApiKey: 'test-api-key',
      anthropicClient: anthropicClient as never,
    })

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(result.mode).toBe('fallback')
    expect(result.answer).toContain('Q3 2025 budget')
  })

  it('falls back locally when the remote orchestration endpoint returns 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'upstream unavailable',
      json: async () => ({
        answer: '',
      }),
    })

    const result = await orchestrateBishopAnswer(corpus, 'What is the budget for Q3 2025?', {
      role: 'analyst',
      provider: 'openai',
      endpoint: 'https://example.test/bishop',
      fetchImpl: fetchMock as typeof fetch,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.mode).toBe('fallback')
    expect(result.answer).toContain('Q3 2025 budget')
    expect(result.confidenceScore).toBeGreaterThan(0)
    expect(result.providerTracePreview).toContain('status 500')
  })
})
