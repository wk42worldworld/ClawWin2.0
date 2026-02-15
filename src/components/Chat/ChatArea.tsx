import React, { useRef, useEffect, useCallback, useState } from 'react'
import openclawLogo from '../../../assets/icon.png'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import type { ChatMessage } from '../../types'

interface ChatAreaProps {
  messages: ChatMessage[]
  onSend: (content: string) => void
  disabled?: boolean
  gatewayState: string
  isWaiting?: boolean
  gatewayPort?: number
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  onSend,
  disabled = false,
  gatewayState,
  isWaiting = false,
  gatewayPort = 39527,
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
      <div className="chat-header">
        <div className="chat-header-left" />
        <button
          className="chat-header-badge"
          onClick={() => window.electronAPI.shell.openExternal(`http://127.0.0.1:${gatewayPort}`)}
          title="打开 OpenClaw WebUI"
        >
          WebUI
        </button>
      </div>
      <div className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-content">
              <div className="chat-empty-icon">
                <span style={{fontSize: '60px', fontWeight: 900, color: '#323232'}}>?</span>
              </div>
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
                  <div className="avatar avatar-assistant">
                    <img src={openclawLogo} alt="AI" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                  </div>
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
          {gatewayState === 'starting' && '正在启动网关服务...'}
          {gatewayState === 'error' && '网关连接错误，正在尝试重连...'}
          {gatewayState === 'stopped' && '网关服务已停止'}
          {gatewayState === 'restarting' && '正在重启网关服务...'}
        </div>
      )}

      <InputArea
        onSend={onSend}
        disabled={disabled || !isReady}
        placeholder={isReady ? '输入消息...' : '等待网关服务就绪...'}
      />
    </div>
  )
}
