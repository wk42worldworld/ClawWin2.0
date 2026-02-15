import React from 'react'
import type { ChatSession } from '../../types'

interface SessionListProps {
  sessions: ChatSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
}

const SESSION_COLORS = ['#E60012', '#00A2E0', '#FFCC00', '#4CAF50']
function getSessionColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length]
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}) => {
  return (
    <div className="session-list">
      <div className="session-list-header">
        <button className="btn-new-session" onClick={onNewSession} title="新对话">
          <span style={{fontSize: '18px'}}>+</span>
          <span>新对话</span>
        </button>
      </div>
      <div className="session-list-items">
        {sessions.length === 0 ? (
          <div className="session-empty">暂无对话记录</div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
              onClick={() => onSelectSession(session.id)}
            >
              {/* Active indicator bar */}
              <div className="session-active-indicator" />

              <span
                className="session-avatar"
                style={{ backgroundColor: getSessionColor(session.id) }}
              >
                {(session.title || '新对话').slice(0, 2)}
              </span>
              <div className="session-info">
                <div className="session-title">{session.title || '新对话'}</div>
                <div className="session-meta">
                  {session.messages?.length || 0} 条消息
                </div>
              </div>
              <button
                className="btn-delete-session"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteSession(session.id)
                }}
                title="删除"
              >
                &times;
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
