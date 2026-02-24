import { useState, useEffect, useCallback, useRef } from 'react'
import { GatewayClient, type GatewayEventFrame, type GatewayHelloOk } from '../lib/gateway-protocol'
import type { ChatMessage, ChatAttachment } from '../types'

interface UseWebSocketOptions {
  url: string
  token?: string
  enabled: boolean
}

interface UseWebSocketReturn {
  connected: boolean
  hello: GatewayHelloOk | null
  sendMessage: (sessionKey: string, content: string, attachments?: ChatAttachment[]) => void
  onMessageStream: React.MutableRefObject<((msg: ChatMessage) => void) | null>
  reconnect: () => void
  client: GatewayClient | null
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * 从 Gateway chat event payload 中提取文本内容
 * content 可能是 string、{content: string}、{content: [{type:"text", text:"..."}]} 等格式
 */
function extractText(message: unknown): string {
  // 直接是字符串
  if (typeof message === 'string') return message
  if (!message || typeof message !== 'object') return ''

  const msg = message as Record<string, unknown>
  const content = msg.content

  // content 是字符串
  if (typeof content === 'string') return content

  // content 是数组 [{type: "text", text: "..."}, ...]
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        if (typeof block === 'string') return block
        if (block && typeof block === 'object' && 'text' in block) {
          return (block as { text: string }).text
        }
        return ''
      })
      .join('')
  }

  // 备用：直接使用 text 字段
  if (typeof msg.text === 'string') return msg.text

  return ''
}

export function useWebSocket({ url, token, enabled }: UseWebSocketOptions): UseWebSocketReturn {
  const [connected, setConnected] = useState(false)
  const [hello, setHello] = useState<GatewayHelloOk | null>(null)
  const clientRef = useRef<GatewayClient | null>(null)
  const onMessageStream = useRef<((msg: ChatMessage) => void) | null>(null)
  // 追踪每个 runId 的累积文本（用于 delta 流式更新）
  const streamBufferRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!enabled || !url) return

    console.log('[ws] creating GatewayClient:', { url, hasToken: !!token })

    const client = new GatewayClient({
      url,
      token,
      signDeviceAuth: window.electronAPI?.gateway?.signDeviceAuth,
      onHello: (h) => {
        console.log('[ws] handshake completed (hello-ok received)')
        setConnected(true)
        setHello(h)
      },
      onEvent: (evt: GatewayEventFrame) => {
        handleEvent(evt)
      },
      onClose: (info) => {
        console.log('[ws] connection closed:', info.code, info.reason)
        setConnected(false)
      },
      onError: (err) => {
        console.error('[ws] error:', err.message)
      },
    })

    client.start()
    clientRef.current = client

    return () => {
      client.stop()
      clientRef.current = null
      setConnected(false)
    }
  }, [url, token, enabled])

  const handleEvent = useCallback((evt: GatewayEventFrame) => {
    console.log('[ws] event received:', evt.event, evt.event === 'chat' ? JSON.stringify(evt.payload).slice(0, 500) : '')

    // OpenClaw Gateway 用 "chat" 事件名传递聊天消息
    if (evt.event !== 'chat') return

    if (!evt.payload || typeof evt.payload !== 'object') return
    const payload = evt.payload as Record<string, unknown>
    const state = payload.state as string | undefined
    const runId = (payload.runId as string) || generateId()

    console.log('[ws] chat event:', { state, runId, hasMessage: !!payload.message })

    if (state === 'delta') {
      // 流式增量更新
      const text = extractText(payload.message)
      if (text) {
        streamBufferRef.current.set(runId, text)

        const msg: ChatMessage = {
          id: runId,
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
          status: 'streaming',
        }
        onMessageStream.current?.(msg)
      }
    } else if (state === 'final') {
      // 最终完整响应
      const extractedText = extractText(payload.message)
      const bufferedText = streamBufferRef.current.get(runId)
      const text = extractedText || bufferedText || ''
      streamBufferRef.current.delete(runId)

      const msg: ChatMessage = {
        id: runId,
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
        status: 'done',
      }
      onMessageStream.current?.(msg)
    } else if (state === 'error') {
      const errorMessage = (payload.errorMessage as string) || '发生错误'
      streamBufferRef.current.delete(runId)

      const msg: ChatMessage = {
        id: runId,
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now(),
        status: 'error',
      }
      onMessageStream.current?.(msg)
    } else if (state === 'aborted') {
      // 被中断的响应，使用已有内容
      const text = streamBufferRef.current.get(runId) || '（已中断）'
      streamBufferRef.current.delete(runId)

      const msg: ChatMessage = {
        id: runId,
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
        status: 'done',
      }
      onMessageStream.current?.(msg)
    } else if (state === 'terminated') {
      // 上下文耗尽或进程被终止
      const buffered = streamBufferRef.current.get(runId) || ''
      streamBufferRef.current.delete(runId)
      const hint = '\n\n---\n> 回复被中断，可能是上下文空间不足。建议点击「压缩」后重试。'

      const msg: ChatMessage = {
        id: runId,
        role: 'assistant',
        content: buffered + hint,
        timestamp: Date.now(),
        status: 'done',
      }
      onMessageStream.current?.(msg)
    }
  }, [])

  const sendMessage = useCallback((sessionKey: string, content: string, attachments?: ChatAttachment[]) => {
    const client = clientRef.current
    if (!client) {
      console.error('[ws] cannot send: no client instance')
      const msg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '无法发送消息：WebSocket 客户端未初始化，请检查网关状态',
        timestamp: Date.now(),
        status: 'error',
      }
      onMessageStream.current?.(msg)
      return
    }

    const idempotencyKey = generateId()

    // Build gateway attachments with file paths (backend reads files itself)
    const gatewayAttachments = attachments
      ?.filter((a) => a.filePath)
      .map((a) => ({
        type: a.type,
        mimeType: a.mimeType,
        fileName: a.fileName,
        filePath: a.filePath,
      }))

    const payload: Record<string, unknown> = {
      sessionKey,
      message: content,
      deliver: false,
      idempotencyKey,
    }
    if (gatewayAttachments && gatewayAttachments.length > 0) {
      payload.attachments = gatewayAttachments
    }

    client.request('chat.send', payload).catch((err) => {
      console.error('[ws] chat.send failed:', err)
      const msg: ChatMessage = {
        id: idempotencyKey,
        role: 'assistant',
        content: `发送失败: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
        status: 'error',
      }
      onMessageStream.current?.(msg)
    })
  }, [])

  const reconnect = useCallback(() => {
    clientRef.current?.stop()
    clientRef.current?.start()
  }, [])

  return { connected, hello, sendMessage, onMessageStream, reconnect, client: clientRef.current }
}
