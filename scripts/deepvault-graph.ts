import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { extractMeaningfulTokens } from '../src/lib/scoring'

export interface DeepVaultSiteDefinition {
  url: string
  name: string
}

export interface DeepVaultExportConfig {
  authMode: string
  baseUrl: string
  timeoutSeconds: number
  scopes: string[]
  siteUrls: string[]
  siteNames: string[]
  appId: string
  tenantId: string
  secretValue: string
}

export interface GraphSite {
  id: string
  displayName: string
  webUrl: string
  description?: string
}

export interface GraphDrive {
  id: string
  name: string
  webUrl?: string
}

export interface GraphDriveItem {
  id: string
  name: string
  webUrl?: string
  size?: number
  file?: { mimeType?: string }
  folder?: { childCount?: number }
  lastModifiedDateTime?: string
  createdDateTime?: string
  createdBy?: { user?: { displayName?: string } }
  lastModifiedBy?: { user?: { displayName?: string } }
  parentReference?: { driveId?: string; path?: string }
}

export interface CorpusDocumentLike {
  id: string
  siteId: string
  kind: string
  fileType?: string
  title: string
  path: string
  webUrl?: string
  author: string
  createdBy?: string
  lastModifiedBy?: string
  updatedAt: string
  summary: string
  directAnswer: string
  content: string
  tags: string[]
  access: Array<'analyst' | 'admin' | 'guest' | 'all'>
  source: string
}

export interface CorpusSiteLike {
  id: string
  name: string
  url: string
  libraryCount: number
  listCount: number
  status: 'synced' | 'restricted' | 'pending' | 'sync_failed'
  access: Array<'analyst' | 'admin' | 'guest' | 'all'>
  owner: string
}

export interface CorpusLike {
  schemaVersion?: string
  defaultUserRole: 'analyst' | 'admin' | 'guest'
  providers: Array<{ id: 'openai' | 'gemini' | 'anthropic'; name: string; ready: boolean }>
  sites: CorpusSiteLike[]
  syncRuns: Array<{
    id: string
    startedAt: string
    finishedAt: string
    scope: string
    status: 'synced' | 'restricted' | 'pending' | 'sync_failed'
    siteIds: string[]
    documentsSynced: number
    chunksWritten: number
    notes: string
  }>
  documents: CorpusDocumentLike[]
}

function parseCsv(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeHtmlToText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function contentHash(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function inferFileType(name: string, mimeType?: string): string {
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
  const fileTypeMap: Record<string, string> = {
    doc: 'document',
    docx: 'document',
    odt: 'document',
    rtf: 'document',
    pages: 'document',
    pdf: 'pdf',
    ppt: 'presentation',
    pptx: 'presentation',
    key: 'presentation',
    xls: 'spreadsheet',
    xlsx: 'spreadsheet',
    csv: 'spreadsheet',
    tsv: 'spreadsheet',
    numbers: 'spreadsheet',
    md: 'markdown',
    markdown: 'markdown',
    txt: 'text',
    json: 'json',
    xml: 'xml',
    html: 'html',
    htm: 'html',
    aspx: 'html',
    msg: 'email',
    eml: 'email',
  }

  if (fileTypeMap[extension]) {
    return fileTypeMap[extension]
  }
  if (mimeType?.startsWith('text/')) {
    return 'text'
  }
  if (mimeType === 'application/pdf') {
    return 'pdf'
  }
  return extension || 'file'
}

function buildSummary(text: string, fallback: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned || isMetadataOnlyText(cleaned)) {
    return fallback
  }
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0]
  return sentence.slice(0, 240) || fallback
}

function getGraphPersonName(value?: { user?: { displayName?: string } }): string {
  return value?.user?.displayName?.trim() || ''
}

function buildDirectAnswer(text: string, fallback: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned || isMetadataOnlyText(cleaned)) {
    return fallback
  }
  return cleaned.slice(0, 360)
}

function isMetadataOnlyText(text: string): boolean {
  return /^Source:\s/i.test(text) && /\bPath:\s/i.test(text)
}

function buildTags(siteName: string, driveName: string, itemPath: string, kind: string, title: string, text: string): string[] {
  const firstSentence = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0]
  const candidates = [
    title,
    siteName,
    driveName,
    kind,
    ...itemPath.split('/').filter(Boolean).map((part) => part.replace(/\.[^.]+$/, '')),
    firstSentence,
  ]

  const tags: string[] = []
  for (const candidate of candidates) {
    for (const token of extractMeaningfulTokens(candidate)) {
      if (!tags.includes(token)) {
        tags.push(token)
      }
      if (tags.length >= 12) {
        return tags
      }
    }
  }

  return tags
}

const TEXTUAL_MIME_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/xhtml+xml']
const TEXTUAL_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'aspx'])
const MAX_TEXT_DOWNLOAD_BYTES = 256 * 1024

function encodeDrivePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export type DeepVaultProgressReporter = (_message: string) => void

export interface ExportSiteCorpusOptions {
  updatedAfter?: string | null
}

export interface ExportSiteCorpusResult {
  site: CorpusSiteLike
  documents: CorpusDocumentLike[]
  currentDocumentIds: string[]
  driveCount: number
  listCount: number
  skippedDocuments: number
}

export function buildDeepVaultExportConfig(): DeepVaultExportConfig {
  return {
    authMode: (process.env.DEEPVAULT_ENTRA_AUTH_MODE || 'delegated').trim().toLowerCase(),
    baseUrl: process.env.DEEPVAULT_ENTRA_BASE_URL || 'https://graph.microsoft.com/v1.0',
    timeoutSeconds: Number(process.env.DEEPVAULT_ENTRA_TIMEOUT_SECONDS || 30),
    scopes: parseCsv(process.env.DEEPVAULT_ENTRA_SCOPES || 'Sites.Read.All,User.Read,Files.Read.All'),
    siteUrls: parseCsv(process.env.DEEPVAULT_ENTRA_SITES),
    siteNames: parseCsv(process.env.DEEPVAULT_PILOT_SITE_NAMES),
    appId: process.env.DEEPVAULT_ENTRA_APP_ID || '',
    tenantId: process.env.DEEPVAULT_ENTRA_TENANT_ID || '',
    secretValue: process.env.DEEPVAULT_ENTRA_SECRET_VALUE || '',
  }
}

export function buildSiteDefinitions(config: DeepVaultExportConfig): DeepVaultSiteDefinition[] {
  return config.siteUrls.map((url, index) => ({
    url,
    name: config.siteNames[index] || new URL(url).hostname,
  }))
}

async function postForm<T>(url: string, form: URLSearchParams): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Auth request failed (${response.status}): ${text}`)
  }
  return JSON.parse(text) as T
}

async function acquireDelegatedToken(config: DeepVaultExportConfig): Promise<string> {
  const base = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0`
  const deviceCode = await postForm<{
    device_code: string
    interval: number
    message?: string
    user_code: string
    verification_uri: string
    expires_in: number
  }>(`${base}/devicecode`, new URLSearchParams({
    client_id: config.appId,
    scope: config.scopes.join(' '),
  }))

  console.log(deviceCode.message || `Open ${deviceCode.verification_uri} and enter code ${deviceCode.user_code}.`)

  const deadline = Date.now() + deviceCode.expires_in * 1000
  const pollInterval = Math.max(5, deviceCode.interval || 5) * 1000

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
    const tokenForm = new URLSearchParams()
    tokenForm.set('grant_type', 'urn:ietf:params:oauth:grant-type:device_code')
    tokenForm.set('client_id', config.appId)
    tokenForm.set('device_code', deviceCode.device_code)
    if (config.secretValue) {
      tokenForm.set('client_secret', config.secretValue)
    }
    const tokenResponse = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenForm,
    })
    const payload = (await tokenResponse.json()) as { access_token?: string; error?: string; error_description?: string }
    if (payload.access_token) {
      return payload.access_token
    }
    if (payload.error === 'authorization_pending') {
      continue
    }
    if (payload.error === 'slow_down') {
      await new Promise((resolve) => setTimeout(resolve, pollInterval * 2))
      continue
    }
    throw new Error(`Device code flow failed: ${payload.error_description || payload.error || 'unknown error'}`)
  }

  throw new Error('Device code flow expired before authorization completed.')
}

async function acquireClientCredentialsToken(config: DeepVaultExportConfig): Promise<string> {
  const base = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0`
  const tokenForm = new URLSearchParams()
  tokenForm.set('client_id', config.appId)
  tokenForm.set('client_secret', config.secretValue)
  tokenForm.set('grant_type', 'client_credentials')
  tokenForm.set('scope', 'https://graph.microsoft.com/.default')
  const token = await postForm<{ access_token: string }>(`${base}/token`, tokenForm)
  return token.access_token
}

export async function acquireGraphAccessToken(config: DeepVaultExportConfig): Promise<string> {
  if (!config.appId || !config.tenantId) {
    throw new Error('DEEPVAULT_ENTRA_APP_ID and DEEPVAULT_ENTRA_TENANT_ID are required.')
  }

  if (config.authMode === 'client_credentials' || config.authMode === 'application' || config.authMode === 'app_only') {
    if (!config.secretValue) {
      throw new Error('DEEPVAULT_ENTRA_SECRET_VALUE is required for application auth mode.')
    }
    return acquireClientCredentialsToken(config)
  }

  try {
    return await acquireDelegatedToken(config)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (config.secretValue && message.includes('AADSTS7000218')) {
      console.log('Device code flow requires client credentials in this tenant. Falling back to client_credentials.')
      return acquireClientCredentialsToken(config)
    }
    throw error
  }
}

export class GraphClient {
  private readonly baseUrl: string
  private readonly accessToken: string
  private readonly timeoutSeconds: number

  constructor(baseUrl: string, accessToken: string, timeoutSeconds: number) {
    this.baseUrl = baseUrl
    this.accessToken = accessToken
    this.timeoutSeconds = timeoutSeconds
  }

  private resolveUrl(pathOrUrl: string): string {
    return pathOrUrl.startsWith('http') ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`
  }

  private async request(url: string, init: RequestInit = {}, retryCount = 0): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutSeconds * 1000)
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(init.headers || {}),
        },
      })
      if ((response.status === 429 || response.status === 503 || response.status === 504) && retryCount < 3) {
        const retryAfter = Number(response.headers.get('retry-after') || 1)
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000))
        return this.request(url, init, retryCount + 1)
      }
      return response
    } finally {
      clearTimeout(timeout)
    }
  }

  async getJson<T>(path: string): Promise<T> {
    const response = await this.request(this.resolveUrl(path))
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Graph request failed (${response.status}): ${text}`)
    }
    return JSON.parse(text) as T
  }

  async getText(path: string): Promise<{ text: string; contentType: string }> {
    const response = await this.request(this.resolveUrl(path))
    if (!response.ok) {
      throw new Error(`Graph content request failed (${response.status})`)
    }
    const contentType = response.headers.get('content-type') || ''
    const text = contentType.includes('text') || contentType.includes('json') || contentType.includes('html')
      ? await response.text()
      : new TextDecoder().decode(await response.arrayBuffer())
    return { text, contentType }
  }

  async listAll<TItem>(path: string, report?: DeepVaultProgressReporter, label?: string): Promise<TItem[]> {
    const items: TItem[] = []
    let nextUrl: string | undefined = this.resolveUrl(path)
    let pageIndex = 0
    while (nextUrl) {
      pageIndex += 1
      const page: { value: TItem[]; '@odata.nextLink'?: string } = await this.getJson(nextUrl)
      items.push(...page.value)
      report?.(`${label || 'Graph'} page ${pageIndex}: fetched ${page.value.length} items (total ${items.length})`)
      nextUrl = page['@odata.nextLink']
    }
    return items
  }
}

export function siteUrlToGraphPath(siteUrl: string): string {
  const parsed = new URL(siteUrl)
  return `/sites/${parsed.hostname}:${parsed.pathname}`
}

async function tryDownloadText(client: GraphClient, itemPath: string): Promise<string> {
  const candidates = [`${itemPath}/content?format=html`, `${itemPath}/content?format=text`, `${itemPath}/content`]
  for (const candidate of candidates) {
    try {
      const { text, contentType } = await client.getText(candidate)
      if (contentType.includes('html') || candidate.includes('format=html')) {
        return normalizeHtmlToText(text)
      }
      return text.replaceAll('\u0000', '').trim()
    } catch {
      continue
    }
  }
  return ''
}

function parseUpdatedAfter(updatedAfter?: string | null): number | null {
  if (!updatedAfter) {
    return null
  }
  const parsed = Date.parse(updatedAfter)
  return Number.isNaN(parsed) ? null : parsed
}

function isNewerThanCutoff(timestamp: string | undefined, cutoffMs: number | null): boolean {
  if (cutoffMs === null) {
    return true
  }
  if (!timestamp) {
    return true
  }
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) {
    return true
  }
  return parsed > cutoffMs
}

function isTextualItem(name: string, mimeType?: string): boolean {
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
  if (extension && TEXTUAL_EXTENSIONS.has(extension)) {
    return true
  }
  if (!mimeType) {
    return false
  }
  return TEXTUAL_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
}

async function crawlDriveItems(
  client: GraphClient,
  siteId: string,
  siteName: string,
  drive: GraphDrive,
  rootPath = '',
  report?: DeepVaultProgressReporter,
  updatedAfter?: string | null,
): Promise<{ documents: CorpusDocumentLike[]; currentDocumentIds: string[]; skippedDocuments: number }> {
  const cutoffMs = parseUpdatedAfter(updatedAfter)
  report?.(`[${siteName}] Scanning ${drive.name}${rootPath ? `/${rootPath}` : ''}`)
  const items = await client.listAll<GraphDriveItem>(
    rootPath
      ? `/drives/${drive.id}/root:/${encodeDrivePath(rootPath)}:/children?$top=200`
      : `/drives/${drive.id}/root/children?$top=200`,
    report,
    `[${siteName}] ${drive.name}${rootPath ? `/${rootPath}` : ''}`,
  )
  const documents: CorpusDocumentLike[] = []
  const currentDocumentIds: string[] = []
  let skippedDocuments = 0

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const currentPath = `${rootPath}/${item.name}`.replace(/\/+/g, '/')
    if (item.folder) {
      const nested = await crawlDriveItems(client, siteId, siteName, drive, currentPath, report, updatedAfter)
      documents.push(...nested.documents)
      currentDocumentIds.push(...nested.currentDocumentIds)
      skippedDocuments += nested.skippedDocuments
      continue
    }

    if (index > 0 && index % 100 === 0) {
      report?.(`[${siteName}] ${drive.name}${rootPath ? `/${rootPath}` : ''}: processed ${index}/${items.length} items`)
    }

    const extension = item.name.includes('.') ? item.name.split('.').pop()?.toLowerCase() || '' : ''
    const documentId = contentHash(`${siteId}:${drive.id}:${item.id}`)
    currentDocumentIds.push(documentId)
    if (!isNewerThanCutoff(item.lastModifiedDateTime || item.createdDateTime, cutoffMs)) {
      skippedDocuments += 1
      report?.(
        `[${siteName}] ${drive.name}${currentPath} skipped unchanged item last modified at ${item.lastModifiedDateTime || item.createdDateTime || 'unknown timestamp'}`,
      )
      continue
    }
    const rawText = item.file
      && isTextualItem(item.name, item.file.mimeType)
      && (typeof item.size !== 'number' || item.size <= MAX_TEXT_DOWNLOAD_BYTES)
      ? await tryDownloadText(client, `/drives/${drive.id}/items/${item.id}`)
      : ''
    if (item.file && !rawText && typeof item.size === 'number' && item.size > MAX_TEXT_DOWNLOAD_BYTES) {
      report?.(
        `[${siteName}] ${drive.name}${currentPath} over size limit (${item.size} bytes), keeping metadata only`,
      )
    }
    const fallbackText = `Source: ${item.name}. Path: ${currentPath}.`
    const text = rawText || fallbackText
    const normalizedPath = `/${drive.name}${currentPath.startsWith('/') ? currentPath : `/${currentPath}`}`.replace(/\/+/g, '/')
    const title = stripExtension(item.name)

    documents.push({
      id: documentId,
      siteId,
      kind: extension || 'file',
      fileType: inferFileType(item.name, item.file?.mimeType),
      title,
      path: normalizedPath,
      webUrl: item.webUrl,
      author: siteName,
      createdBy: getGraphPersonName(item.createdBy),
      lastModifiedBy: getGraphPersonName(item.lastModifiedBy),
      updatedAt: item.lastModifiedDateTime || item.createdDateTime || new Date().toISOString(),
      summary: buildSummary(text, title),
      directAnswer: buildDirectAnswer(text, title),
      content: text.slice(0, 4000),
      tags: buildTags(siteName, drive.name, currentPath, extension || 'file', title, text),
      access: ['analyst', 'admin'],
      source: 'SharePoint',
    })
  }

  return { documents, currentDocumentIds, skippedDocuments }
}

export async function exportSiteCorpus(
  client: GraphClient,
  siteDefinition: DeepVaultSiteDefinition,
  report?: DeepVaultProgressReporter,
  options: ExportSiteCorpusOptions = {},
): Promise<ExportSiteCorpusResult> {
  report?.(`[${siteDefinition.name}] Resolving site ${siteDefinition.url}`)
  const site = await client.getJson<GraphSite>(siteUrlToGraphPath(siteDefinition.url))
  report?.(`[${siteDefinition.name}] Site resolved as ${site.displayName}`)
  const drives = await client.listAll<GraphDrive>(`/sites/${site.id}/drives?$top=100`, report, `[${siteDefinition.name}] drives`)
  const lists = await client.listAll<{ id: string }>(`/sites/${site.id}/lists?$top=100`, report, `[${siteDefinition.name}] lists`)
  const documents: CorpusDocumentLike[] = []
  const currentDocumentIds: string[] = []
  let skippedDocuments = 0
  report?.(`[${siteDefinition.name}] Found ${drives.length} libraries and ${lists.length} lists`)

  for (const drive of drives) {
    report?.(`[${siteDefinition.name}] Crawling library ${drive.name}`)
    const nestedDocuments = await crawlDriveItems(
      client,
      site.id,
      siteDefinition.name || site.displayName,
      drive,
      '',
      report,
      options.updatedAfter,
    )
    documents.push(...nestedDocuments.documents)
    currentDocumentIds.push(...nestedDocuments.currentDocumentIds)
    skippedDocuments += nestedDocuments.skippedDocuments
    report?.(`[${siteDefinition.name}] Library ${drive.name} yielded ${nestedDocuments.documents.length} documents`)
  }

  report?.(`[${siteDefinition.name}] Completed with ${documents.length} documents (${skippedDocuments} skipped)`)

  return {
    site: {
      id: site.id,
      name: siteDefinition.name || site.displayName,
      url: site.webUrl,
      libraryCount: drives.length,
      listCount: lists.length,
      status: 'synced',
      access: ['analyst', 'admin'],
      owner: siteDefinition.name || site.displayName,
    },
    documents,
    currentDocumentIds,
    driveCount: drives.length,
    listCount: lists.length,
    skippedDocuments,
  }
}

export async function writeCorpusFile(path: string, corpus: CorpusLike): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8')
}
