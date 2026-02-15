import React, { useRef, useEffect, useCallback, useState } from 'react'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import type { ChatMessage } from '../../types'

interface ChatAreaProps {
  messages: ChatMessage[]
  onSend: (content: string) => void
  disabled?: boolean
  gatewayState: string
  isWaiting?: boolean
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  onSend,
  disabled = false,
  gatewayState,
  isWaiting = false,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Auto-scroll to bottom when new messages arrive or typing indicator shows
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, autoScroll, isWaiting])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 100)
  }, [])

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(console.error)
  }, [])

  const isReady = gatewayState === 'ready'

  return (
    <div className="chat-area">
      <div className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-content">
              <div className="chat-empty-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h3>ClawWin</h3>
              <p>你的 AI 助手，随时准备为您服务</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onCopy={() => handleCopy(msg.content)}
              />
            ))}
            {isWaiting && (
              <div className="message-bubble message-assistant message-bubble-waiting">
                <div className="message-avatar">
                  <div className="avatar avatar-assistant">AI</div>
                </div>
                <div className="message-body">
                  <div className="message-content">
                    <div className="typing-dots">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!isReady && (
        <div className="chat-status-bar">
          {gatewayState === 'starting' && '正在启动 Gateway...'}
          {gatewayState === 'error' && 'Gateway 连接错误，正在尝试重连...'}
          {gatewayState === 'stopped' && 'Gateway 已停止'}
          {gatewayState === 'restarting' && '正在重启 Gateway...'}
        </div>
      )}

      <InputArea
        onSend={onSend}
        disabled={disabled || !isReady}
        placeholder={isReady ? '输入消息... (Enter 发送, Shift+Enter 换行)' : '等待 Gateway 就绪...'}
      />
    </div>
  )
}
