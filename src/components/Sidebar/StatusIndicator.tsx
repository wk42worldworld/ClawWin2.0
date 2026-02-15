import React from 'react'
import type { GatewayState } from '../../types'

interface StatusIndicatorProps {
  state: GatewayState
  onRestart?: () => void
}

const STATE_LABELS: Record<GatewayState, string> = {
  starting: '启动中',
  ready: '已就绪',
  error: '连接错误',
  stopped: '已停止',
  restarting: '重启中',
}

const STATE_COLORS: Record<GatewayState, string> = {
  starting: '#f59e0b',
  ready: '#22c55e',
  error: '#ef4444',
  stopped: '#6b7280',
  restarting: '#f59e0b',
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ state, onRestart }) => {
  return (
    <div className="status-indicator">
      <div className="status-dot" style={{ backgroundColor: STATE_COLORS[state], ...(state === 'ready' ? { boxShadow: '0 0 12px rgba(16, 185, 129, 0.6)' } : {}) }} />
      <span className="status-text">{STATE_LABELS[state]}</span>
      {(state === 'error' || state === 'stopped') && onRestart && (
        <button className="btn-status-restart" onClick={onRestart}>
          重启
        </button>
      )}
    </div>
  )
}
