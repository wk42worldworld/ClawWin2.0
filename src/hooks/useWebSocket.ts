import { useState, useEffect, useCallback, useRef } from 'react'
import { GatewayClient, type GatewayEventFrame, type GatewayHelloOk } from '../lib/gateway-protocol'
import type { ChatMessage } from '../types'

interface UseWebSocketOptions {
  url: string
  token?: string
  enabled: boolean
}

interface UseWebSocketReturn {
  connected: boolean
  hello: GatewayHelloOk | null
  sendMessage: (sessionKey: string, content: string) => void
  onMessageStream: React.MutableRefObject<((msg: ChatMessage) => void) | null>
  reconnect: () => void
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * 从 Gateway chat event payload 中提取文本内容
 * content 可能是 string 或 [{type:"text", text:"..."}] 格式
 */
function extractText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  const content = msg.content
  if (typeof content === 'string') return content
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

    const client = new GatewayClient({
      url,
      token,
      signDeviceAuth: (window as any).electronAPI?.gateway?.signDeviceAuth,
      onHello: (h) => {
        setConnected(true)
        setHello(h)
      },
      onEvent: (evt: GatewayEventFrame) => {
        handleEvent(evt)
      },
      onClose: () => {
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
    // DEBUG: 打印所有收到的 Gateway 事件
    console.log('[ws] event received:', evt.event, evt.event === 'chat' ? JSON.stringify(evt.payload).slice(0, 500) : '')

    // OpenClaw Gateway 用 "chat" 事件名传递聊天消息
    if (evt.event !== 'chat') return

    if (!evt.payload || typeof evt.payload !== 'object') return
    const payload = evt.payload as Record<string, unknown>
    const state = payload.state as string | undefined
    const runId = (payload.runId as string) || generateId()

    // DEBUG: 打印 chat 事件详情
    console.log('[ws] chat event:', { state, runId, hasMessage: !!payload.message, message: payload.message })

    if (state === 'delta') {
      // 流式增量更新
      const text = extractText(payload.message)
      console.log('[ws] delta text:', JSON.stringify(text?.slice(0, 200)))
      if (text) {
        // 累积文本（Gateway 可能发送完整累积内容或增量）
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
      console.log('[ws] final:', { extractedText: JSON.stringify(extractedText?.slice(0, 200)), bufferedText: JSON.stringify(bufferedText?.slice(0, 200)), finalText: JSON.stringify(text?.slice(0, 200)) })
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
    }
  }, [])

  const sendMessage = useCallback((sessionKey: string, content: string) => {
    const client = clientRef.current
    if (!client?.connected) {
      console.error('[ws] cannot send: not connected')
      return
    }

    const idempotencyKey = generateId()

    client.request('chat.send', {
      sessionKey,
      message: content,
      deliver: false,
      idempotencyKey,
    }).catch((err) => {
      console.error('[ws] chat.send failed:', err)
      // 通知 UI 发送失败
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

  return { connected, hello, sendMessage, onMessageStream, reconnect }
}
