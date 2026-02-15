import React from 'react'
import type { ChatSession } from '../../types'

interface SessionListProps {
  sessions: ChatSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
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
        <span>对话列表</span>
        <button className="btn-new-session" onClick={onNewSession} title="新对话">
          +
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
              <div className="session-title">{session.title || '新对话'}</div>
              <div className="session-meta">
                {new Date(session.updatedAt).toLocaleDateString('zh-CN')}
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
