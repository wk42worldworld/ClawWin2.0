import React, { useRef, useEffect, useCallback, useState } from 'react'
import { MessageBubble } from './MessageBubble'
import { InputArea } from './InputArea'
import type { ChatMessage, ChatAttachment } from '../../types'

interface ChatAreaProps {
  messages: ChatMessage[]
  onSend: (content: string, attachments?: ChatAttachment[]) => void
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
  const scrollRafRef = useRef(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(0 as unknown as ReturnType<typeof setTimeout>)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const [screenshotToast, setScreenshotToast] = useState<string | null>(null)

  // Auto-scroll to bottom when new messages arrive or typing indicator shows
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, autoScroll, isWaiting])

  // 清理 rAF 和 toast timer
  useEffect(() => {
    return () => {
      cancelAnimationFrame(scrollRafRef.current)
      clearTimeout(toastTimerRef.current)
    }
  }, [])

  // rAF 节流的滚动事件处理，带滞后区间防闪烁
  const handleScroll = useCallback(() => {
    cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = requestAnimationFrame(() => {
      if (!scrollRef.current) return
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      setAutoScroll(distanceFromBottom < 100)
      setShowScrollTop(prev => scrollTop > 200 ? true : scrollTop < 120 ? false : prev)
      setShowScrollBottom(prev => distanceFromBottom > 200 ? true : distanceFromBottom < 120 ? false : prev)
    })
  }, [])

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
    setAutoScroll(true)
  }, [])

  const handleCopy = useCallback((content: string) => {
    navigator.clipboard.writeText(content).catch(console.error)
  }, [])

  // 截屏：捕获窗口并写入剪贴板
  const handleScreenshot = useCallback(async () => {
    clearTimeout(toastTimerRef.current)
    try {
      await window.electronAPI.app.captureScreen()
      setScreenshotToast('已复制到剪贴板')
    } catch {
      setScreenshotToast('截屏失败，请重试')
    }
    toastTimerRef.current = setTimeout(() => setScreenshotToast(null), 2000)
  }, [])

  // 监听 Ctrl+Alt+A 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        handleScreenshot()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleScreenshot])

  const isReady = gatewayState === 'ready'

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-left" />
        <div className="chat-header-right">
          <button
            className="chat-header-badge"
            onClick={handleScreenshot}
            title="截屏 (Ctrl+Alt+A)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            截屏
          </button>
          <button
            className="chat-header-badge"
            onClick={() => window.electronAPI.shell.openExternal(`http://127.0.0.1:${gatewayPort}`)}
            title="打开 OpenClaw WebUI"
          >
            WebUI
          </button>
        </div>
      </div>
      <div className="chat-messages-wrapper">
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

        {/* 滚动导航按钮 */}
        <div className="chat-scroll-buttons">
          <button
            className={`chat-scroll-btn ${showScrollTop ? 'visible' : 'hidden'}`}
            onClick={scrollToTop}
            title="回到顶部"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            className={`chat-scroll-btn ${showScrollBottom ? 'visible' : 'hidden'}`}
            onClick={scrollToBottom}
            title="回到底部"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* 截屏提示 toast */}
      {screenshotToast && (
        <div className="screenshot-toast">{screenshotToast}</div>
      )}

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
        disabled={disabled || !isReady || isWaiting}
        placeholder={!isReady ? '等待网关服务就绪...' : isWaiting ? 'AI 正在回复中...' : '输入消息...'}
      />
    </div>
  )
}
