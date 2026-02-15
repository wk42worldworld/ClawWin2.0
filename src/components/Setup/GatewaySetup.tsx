import React, { useState, useCallback } from 'react'

interface GatewaySetupProps {
  port: number
  token: string
  onBack: () => void
  onNext: (port: number) => void
}

export const GatewaySetup: React.FC<GatewaySetupProps> = ({
  port: initialPort,
  token,
  onBack,
  onNext,
}) => {
  const [port, setPort] = useState(initialPort)
  const [copied, setCopied] = useState(false)
  const [portError, setPortError] = useState<string | null>(null)

  const handleCopyToken = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select input text
    }
  }, [token])

  const handlePortChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (isNaN(val)) {
      setPort(0)
      setPortError('请输入有效的端口号')
      return
    }
    setPort(val)
    if (val < 1024 || val > 65535) {
      setPortError('端口号需在 1024 - 65535 之间')
    } else {
      setPortError(null)
    }
  }, [])

  const handleNext = useCallback(() => {
    if (port < 1024 || port > 65535) {
      setPortError('端口号需在 1024 - 65535 之间')
      return
    }
    onNext(port)
  }, [port, onNext])

  return (
    <div className="setup-page gateway-setup">
      <h2 className="setup-title">Gateway 配置</h2>
      <p className="setup-subtitle">配置本地 Gateway 服务</p>

      <div className="gateway-form">
        <div className="gateway-description">
          <div className="info-card">
            <span className="info-icon">&#128268;</span>
            <div>
              <strong>什么是 Gateway？</strong>
              <p>Gateway 是 ClawWin 的本地服务，负责与 AI 模型通信。它运行在您的电脑上，处理所有 API 请求和会话管理。</p>
            </div>
          </div>
        </div>

        <div className="gateway-field">
          <label className="input-label" htmlFor="gateway-port">
            服务端口
          </label>
          <input
            id="gateway-port"
            type="number"
            className="input-field input-port"
            value={port}
            onChange={handlePortChange}
            min={1024}
            max={65535}
          />
          {portError && (
            <div className="gateway-error">{portError}</div>
          )}
        </div>

        <div className="gateway-field">
          <label className="input-label" htmlFor="gateway-token">
            认证令牌 <span className="label-hint">（自动生成，用于安全通信）</span>
          </label>
          <div className="token-input-group">
            <input
              id="gateway-token"
              type="text"
              className="input-field input-token"
              value={token}
              readOnly
            />
            <button
              className="btn-copy"
              onClick={handleCopyToken}
              title="复制令牌"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        <div className="gateway-field">
          <label className="input-label">绑定模式</label>
          <div className="gateway-bind-info">
            <span className="bind-badge">loopback</span>
            <span className="bind-desc">仅本机访问 - 外部网络无法连接，安全可靠</span>
          </div>
        </div>
      </div>

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button
          className="btn-primary"
          onClick={handleNext}
          disabled={!!portError}
        >
          下一步
        </button>
      </div>
    </div>
  )
}
