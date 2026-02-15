import React from 'react'
import openclawLogo from '../../../assets/icon.png'
import type { ChatMessage } from '../../types'

interface MessageBubbleProps {
  message: ChatMessage
  onCopy?: () => void
  onRetry?: () => void
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onCopy, onRetry }) => {
  const isUser = message.role === 'user'
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'

  return (
    <div className={`message-bubble ${isUser ? 'message-user' : 'message-assistant'} ${isStreaming ? 'message-bubble-streaming' : ''} ${isError ? 'message-error-bubble' : ''}`}>
      <div className="message-avatar">
        {isUser ? (
          <div className="avatar avatar-user"><b>P1</b></div>
        ) : (
          <div className="avatar avatar-assistant">
            <img src={openclawLogo} alt="AI" style={{ width: 20, height: 20, objectFit: 'contain' }} />
          </div>
        )}
      </div>
      <div className="message-body">
        <div className={`message-content ${isStreaming ? 'message-streaming' : ''} ${isError ? 'message-error-content' : ''}`}>
          {message.content || (isStreaming ? '...' : '')}
          {isStreaming && <span className="streaming-cursor" />}
        </div>
        {isStreaming && (
          <div className="message-streaming-status">
            <span className="streaming-pulse-dot" />
            正在输入...
          </div>
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
