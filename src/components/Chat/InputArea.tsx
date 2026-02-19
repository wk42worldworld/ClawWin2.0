import React, { useState, useRef, useCallback } from 'react'
import type { ChatAttachment } from '../../types'

const MAX_ATTACHMENTS = 5

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function isImageFile(mimeType?: string, fileName?: string): boolean {
  if (mimeType && mimeType.startsWith('image/')) return true
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
  }
  return false
}

interface AttachmentWithPreview {
  type: 'image' | 'file'
  fileName: string
  filePath: string
  mimeType?: string
  content?: string       // base64 for images
  /** blob URL for image thumbnail; undefined for non-image files */
  previewUrl?: string
  size: number
}

interface InputAreaProps {
  onSend: (content: string, attachments?: ChatAttachment[]) => void
  disabled?: boolean
  placeholder?: string
}

export const InputArea: React.FC<InputAreaProps> = ({
  onSend,
  disabled = false,
  placeholder = '输入消息...',
}) => {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<AttachmentWithPreview[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showError = useCallback((msg: string) => {
    setError(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setError(null), 3000)
  }, [])

  // Read a file as base64 string
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip data URL prefix: "data:image/png;base64,..."
        const base64 = result.split(',')[1] || ''
        resolve(base64)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  // Process files: extract local file paths via Electron's file.path
  const processFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      const currentCount = attachments.length
      const remainingSlots = MAX_ATTACHMENTS - currentCount

      if (remainingSlots <= 0) {
        showError(`最多只能添加 ${MAX_ATTACHMENTS} 个文件`)
        return
      }

      const filesToProcess = fileArray.slice(0, remainingSlots)
      if (fileArray.length > remainingSlots) {
        showError(`已达上限，仅添加了前 ${remainingSlots} 个文件`)
      }

      // Process each file (async for image base64 reading)
      const processOne = async (file: File): Promise<AttachmentWithPreview | null> => {
        let filePath = ''
        try {
          filePath = window.electronAPI.file.getPath(file)
        } catch {
          // fallback: clipboard paste files have no backing path
        }
        if (!filePath) {
          showError(`无法获取文件路径: ${file.name}，请使用拖放或文件选择`)
          return null
        }

        const isImage = isImageFile(file.type, file.name)
        const previewUrl = isImage ? URL.createObjectURL(file) : undefined

        // Read base64 for images so gateway can pass them to AI model
        let content: string | undefined
        if (isImage) {
          try {
            content = await readFileAsBase64(file)
          } catch {
            // non-critical: image will still show path in text
          }
        }

        return {
          type: isImage ? 'image' : 'file',
          fileName: file.name,
          filePath,
          mimeType: file.type || undefined,
          content,
          previewUrl,
          size: file.size,
        }
      }

      Promise.all(filesToProcess.map(processOne)).then((results) => {
        const newAttachments = results.filter((a): a is AttachmentWithPreview => a !== null)
        if (newAttachments.length > 0) {
          setAttachments((prev) => [...prev, ...newAttachments])
        }
      })
    },
    [attachments.length, showError]
  )

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const removed = prev[index]
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl)
      }
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  // Send: copy files to workspace, append paths to message text + pass attachments
  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    const hasText = trimmed.length > 0
    const hasAtt = attachments.length > 0

    if ((!hasText && !hasAtt) || disabled) return

    // Copy files to workspace so gateway can access them
    const resolvedAttachments = hasAtt
      ? await Promise.all(
          attachments.map(async (a) => {
            const result = await window.electronAPI.file.copyToWorkspace(a.filePath)
            return { ...a, filePath: result.ok && result.destPath ? result.destPath : a.filePath }
          })
        )
      : []

    // Build content with workspace paths appended
    let content = trimmed
    if (resolvedAttachments.length > 0) {
      const paths = resolvedAttachments.map((a) => a.filePath).join('\n')
      content = content ? `${content}\n${paths}` : paths
    }

    // Build ChatAttachment[] with base64 content for images
    const chatAttachments: ChatAttachment[] | undefined = resolvedAttachments.length > 0
      ? resolvedAttachments.map(({ type, fileName, filePath, mimeType, content: base64 }) => ({
          type,
          fileName,
          filePath,
          mimeType,
          content: base64,
        }))
      : undefined

    onSend(content, chatAttachments)
    setInput('')
    for (const att of attachments) {
      if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
    }
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = '64px'
    }
  }, [input, attachments, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.max(64, Math.min(textarea.scrollHeight + 8, 200)) + 'px'
  }, [])

  // Paste: clipboard paste often lacks file.path in Electron
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = e.clipboardData
      if (!clipboardData) return

      const files: File[] = []

      if (clipboardData.files.length > 0) {
        for (const file of Array.from(clipboardData.files)) {
          files.push(file)
        }
      }

      if (files.length === 0 && clipboardData.items) {
        for (const item of Array.from(clipboardData.items)) {
          if (item.kind === 'file') {
            const file = item.getAsFile()
            if (file) files.push(file)
          }
        }
      }

      if (files.length > 0) {
        // Check if files have backing paths (clipboard paste blobs don't)
        const hasPath = files.some((f) => {
          try {
            return !!window.electronAPI.file.getPath(f)
          } catch {
            return false
          }
        })
        if (!hasPath) {
          showError('粘贴图片暂不支持，请使用拖放或文件选择方式添加')
          e.preventDefault()
          return
        }
        e.preventDefault()
        processFiles(files)
      }
    },
    [processFiles, showError]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files)
      }
      e.target.value = ''
    },
    [processFiles]
  )

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current += 1
    if (dragCounterRef.current === 1) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current -= 1
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDragging(false)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files)
      }
    },
    [processFiles]
  )

  const canSend = !disabled && (input.trim().length > 0 || attachments.length > 0)

  return (
    <div
      className={`input-area${isDragging ? ' dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="input-drag-overlay">
          拖放文件到此处
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="input-error-toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {/* Input container */}
      <div className="input-container">
        {/* Preview strip */}
        {attachments.length > 0 && (
          <div className="input-preview-strip">
            {attachments.map((att, index) => (
              <div key={index} className="input-preview-item">
                {att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.fileName}
                    className="input-preview-thumb"
                  />
                ) : (
                  <div className="input-preview-file-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                )}
                <div className="input-preview-info">
                  <span className="input-preview-name" title={att.fileName}>
                    {att.fileName.length > 12
                      ? att.fileName.slice(0, 9) + '...'
                      : att.fileName}
                  </span>
                  <span className="input-preview-size">{formatFileSize(att.size)}</span>
                </div>
                <button
                  className="input-preview-remove"
                  onClick={() => removeAttachment(index)}
                  title="移除文件"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="input-row">
          <button
            className="input-attachment-btn"
            onClick={handleAttachClick}
            disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
            title={
              attachments.length >= MAX_ATTACHMENTS
                ? `最多 ${MAX_ATTACHMENTS} 个文件`
                : '添加文件'
            }
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Hidden file input — accept all file types */}
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <textarea
            ref={textareaRef}
            className="input-textarea"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
          />
        </div>
      </div>

      <button
        className="btn-send"
        onClick={handleSend}
        disabled={!canSend}
        title="发送消息"
      >
        &#x21B5;
      </button>
    </div>
  )
}
