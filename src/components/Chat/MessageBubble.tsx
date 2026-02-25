import React, { useCallback } from 'react'
import type { ChatMessage } from '../../types'

function isImageFile(mimeType?: string, fileName?: string): boolean {
  if (mimeType && mimeType.startsWith('image/')) return true
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
  }
  return false
}

/** Convert a local file path to a file:// URL (handles Windows backslashes, CJK, spaces, special chars) */
function filePathToUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  // Encode each path segment to handle spaces, CJK, #, % etc.
  const encoded = normalized.split('/').map((seg) => encodeURIComponent(seg)).join('/')
  // Ensure triple-slash for absolute paths: file:///C%3A/...  →  need colon unescaped for drive letter
  if (/^[a-zA-Z]:\//.test(normalized)) {
    // Re-insert the colon for the drive letter (encodeURIComponent escapes it to %3A)
    return `file:///${encoded.replace('%3A', ':')}`
  }
  return `file://${encoded}`
}

interface ContentSegment {
  type: 'text' | 'image'
  value: string
}

/**
 * Parse message content for embedded screenshot/image references.
 * Detects multiple formats:
 *   1. [screenshot: C:\path\to\file.jpg]
 *   2. `C:\path\to\file.png` (backtick-wrapped)
 *   3. Bare Windows paths like C:\...\file.jpg
 *   4. Bare Unix paths like /tmp/.../file.png
 */
function parseContentWithImages(content: string): ContentSegment[] {
  const imgExts = 'jpg|jpeg|png|gif|webp|bmp'
  // Match: [screenshot: path], `path`, or bare Windows/Unix image paths
  const pattern = new RegExp(
    '\\[screenshot:\\s*([^\\]]+\\.(?:' + imgExts + '))\\s*\\]' +
    '|`([A-Za-z]:\\\\[^`]+\\.(?:' + imgExts + '))`' +
    '|`(/[^`]+\\.(?:' + imgExts + '))`' +
    '|(?<![`\\w])([A-Za-z]:\\\\[^\\s"\'<>]+\\.(?:' + imgExts + '))(?![`\\w])',
    'gi'
  )
  const segments: ContentSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null) {
    const filePath = (match[1] || match[2] || match[3] || match[4]).trim()
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'image', value: filePath })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) })
  }

  if (segments.length === 0) {
    segments.push({ type: 'text', value: content })
  }

  return segments
}

interface MessageBubbleProps {
  message: ChatMessage
  onCopy?: () => void
  onRetry?: () => void
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onCopy, onRetry }) => {
  const isUser = message.role === 'user'
  const isQueued = message.status === 'queued'
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'

  const handleFileClick = useCallback((filePath: string) => {
    // Open file with system default application via Electron shell
    window.electronAPI?.shell?.openPath?.(filePath)
  }, [])

  const attachments = message.attachments
  const hasAttachments = attachments && attachments.length > 0
  const isSingleAttachment = hasAttachments && attachments.length === 1

  const displayContent = message.content

  return (
    <div className={`message-bubble ${isUser ? 'message-user' : 'message-assistant'} ${isStreaming ? 'message-bubble-streaming' : ''} ${isError ? 'message-error-bubble' : ''} ${isQueued ? 'message-queued' : ''}`}>
      <div className="message-body">
        <div className={`message-content ${isStreaming ? 'message-streaming' : ''} ${isError ? 'message-error-content' : ''}${hasAttachments ? ' has-attachments' : ''}`}>
          {hasAttachments && (
            <div className={`message-attachments${isSingleAttachment ? ' single' : ''}`}>
              {attachments.filter((a) => a.filePath).map((att, index) => {
                const isImage = isImageFile(att.mimeType, att.fileName)

                if (isImage) {
                  const imgSrc = att.content && att.mimeType
                    ? `data:${att.mimeType};base64,${att.content}`
                    : att.content
                      ? `data:image/png;base64,${att.content}`
                      : filePathToUrl(att.filePath)
                  return (
                    <img
                      key={index}
                      src={imgSrc}
                      alt={att.fileName || 'image'}
                      className="message-attachment-img"
                      onClick={() => handleFileClick(att.filePath)}
                    />
                  )
                }

                // Non-image file: show file name with icon
                return (
                  <div
                    key={index}
                    className="message-attachment-file"
                    onClick={() => handleFileClick(att.filePath)}
                    title={att.filePath}
                  >
                    <svg className="message-file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="message-file-name">{att.fileName || att.filePath.split(/[\\/]/).pop()}</span>
                  </div>
                )
              })}
            </div>
          )}
          {(displayContent || isStreaming) && (
            <div className="message-text">
              {!isUser && displayContent ? (
                parseContentWithImages(displayContent).map((segment, idx) => {
                  if (segment.type === 'image') {
                    return (
                      <img
                        key={`inline-img-${idx}`}
                        src={filePathToUrl(segment.value)}
                        alt="screenshot"
                        className="message-inline-screenshot"
                        onClick={() => handleFileClick(segment.value)}
                      />
                    )
                  }
                  return <span key={`text-${idx}`}>{segment.value}</span>
                })
              ) : (
                displayContent || (isStreaming ? '...' : '')
              )}
              {isStreaming && <span className="streaming-cursor" />}
            </div>
          )}
        </div>
        {isStreaming && (
          <div className="message-streaming-status">
            <span className="streaming-pulse-dot" />
            正在输入...
          </div>
        )}
        {isQueued && (
          <div className="message-queued-hint">排队中，等待当前回复结束</div>
        )}
        {isError && (
          <div className="message-error">
            发送失败
            {onRetry && (
              <button className="btn-retry" onClick={onRetry}>重试</button>
            )}
          </div>
        )}
        <div className="message-actions">
          {!isUser && message.status === 'done' && onCopy && (
            <button className="btn-action" onClick={onCopy} title="复制">
              复制
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
