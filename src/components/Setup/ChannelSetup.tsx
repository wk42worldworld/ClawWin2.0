import React from 'react'

interface ChannelSetupProps {
  onBack: () => void
  onNext: () => void
  onSkip: () => void
}

export const ChannelSetup: React.FC<ChannelSetupProps> = ({ onBack, onNext, onSkip }) => {
  return (
    <div className="setup-page channel-page">
      <h2 className="setup-title">消息渠道配置</h2>
      <p className="setup-subtitle">可选：配置额外的消息渠道</p>

      <div className="channel-list">
        <div className="channel-item">
          <span className="channel-name">网页聊天</span>
          <span className="channel-status channel-enabled">已启用</span>
        </div>
        <div className="channel-item">
          <span className="channel-name">微信</span>
          <span className="channel-status channel-coming">即将推出</span>
        </div>
        <div className="channel-item">
          <span className="channel-name">Telegram</span>
          <span className="channel-status channel-coming">即将推出</span>
        </div>
      </div>

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button className="btn-secondary" onClick={onSkip}>跳过</button>
        <button className="btn-primary" onClick={onNext}>下一步</button>
      </div>
    </div>
  )
}
