import { downloadTextFile } from '../../lib/file-download'
import type { AppModel } from '../../hooks/useAppModel'

function buildBishopExportJson({ messages, question }: { messages: AppModel['messages']; question: string }) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      question,
      messages,
    },
    null,
    2,
  )
}

function buildBishopExportMarkdown({ messages, question }: { messages: AppModel['messages']; question: string }) {
  return [
    '# Bishop conversation export',
    '',
    `Exported at ${new Date().toISOString()}`,
    `Question: ${question || 'none'}`,
    '',
    ...messages.map((message) => `- ${message.role}: ${message.text}`),
  ].join('\n')
}

export function createBishopExportHandlers({
  messages,
  question,
}: {
  messages: AppModel['messages']
  question: string
}) {
  return {
    exportJson: () =>
      downloadTextFile(
        `deepvault-bishop-${new Date().toISOString().slice(0, 10)}.json`,
        buildBishopExportJson({ messages, question }),
        'application/json',
      ),
    exportMarkdown: () =>
      downloadTextFile(
        `deepvault-bishop-${new Date().toISOString().slice(0, 10)}.md`,
        buildBishopExportMarkdown({ messages, question }),
        'text/markdown',
      ),
  }
}
