import React from 'react'

interface SetupCompleteProps {
  providerName: string
  modelName: string
  apiKey: string
  workspace: string
  gatewayPort: number
  saving: boolean
  error: string | null
  onBack: () => void
  onComplete: () => void
}

/**
 * Mask an API key, showing only the last 4 characters.
 */
function maskApiKey(key: string): string {
  if (key.length <= 4) return '****'
  return '*'.repeat(key.length - 4) + key.slice(-4)
}

export const SetupComplete: React.FC<SetupCompleteProps> = ({
  providerName,
  modelName,
  apiKey,
  workspace,
  gatewayPort,
  saving,
  error,
  onBack,
  onComplete,
}) => {
  return (
    <div className="setup-page complete-page">
      <div className="complete-icon">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 12l2.5 2.5L16 9" />
        </svg>
      </div>
      <h2 className="setup-title">配置完成！</h2>
      <p className="setup-subtitle">请确认以下配置信息</p>

      <div className="complete-summary">
        <div className="summary-item">
          <span className="summary-label">服务提供商</span>
          <span className="summary-value">{providerName}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">AI 模型</span>
          <span className="summary-value">{modelName}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">API Key</span>
          <span className="summary-value summary-mono">{maskApiKey(apiKey)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">工作空间</span>
          <span className="summary-value summary-path">{workspace}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Gateway 端口</span>
          <span className="summary-value">{gatewayPort}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">配置状态</span>
          <span className="summary-value summary-success">准备就绪</span>
        </div>
      </div>

      {error && (
        <div className="setup-error" role="alert">
          <span className="error-icon">!</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button
          className="btn-primary btn-large"
          onClick={onComplete}
          disabled={saving}
        >
          {saving ? '正在保存配置...' : '开始使用'}
        </button>
      </div>
    </div>
  )
}
