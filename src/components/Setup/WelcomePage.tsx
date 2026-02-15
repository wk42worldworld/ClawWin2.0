import React from 'react'

interface WelcomePageProps {
  onNext: () => void
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onNext }) => {
  return (
    <div className="setup-page welcome-page">
      <div className="setup-logo">
        <svg width="80" height="80" viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="45" fill="#2563eb" />
          <text x="50" y="62" textAnchor="middle" fill="white" fontSize="36" fontWeight="bold">CW</text>
        </svg>
      </div>
      <h1 className="setup-title">欢迎使用 ClawWin</h1>
      <p className="setup-subtitle">你的专属 AI 助手</p>
      <p className="setup-description">
        只需几步简单配置，即可开始与 AI 对话。
      </p>
      <div className="setup-features">
        <div className="feature-item">
          <span className="feature-icon">&#9889;</span>
          <div>
            <strong>多模型支持</strong>
            <p>DeepSeek、MiniMax、Claude、GPT 等主流模型</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">&#128274;</span>
          <div>
            <strong>本地运行</strong>
            <p>所有数据保存在本地，隐私安全有保障</p>
          </div>
        </div>
        <div className="feature-item">
          <span className="feature-icon">&#127760;</span>
          <div>
            <strong>中文优先</strong>
            <p>全中文界面，专为中文用户优化</p>
          </div>
        </div>
      </div>
      <button className="btn-primary btn-large" onClick={onNext}>
        开始配置
      </button>
    </div>
  )
}
