import React from 'react'

interface UserChoicePageProps {
  onClawWin: () => void
  onCustom: () => void
  onSkip: () => void
}

export const UserChoicePage: React.FC<UserChoicePageProps> = ({ onClawWin, onCustom, onSkip }) => {
  return (
    <div className="setup-page welcome-page">
      <h1 className="setup-title">选择使用方式</h1>
      <p className="setup-subtitle">请选择适合您的方式开始</p>

      <div className="setup-features">
        <div className="feature-item choice-card" onClick={onClawWin}>
          <span className="feature-icon">&#9889;</span>
          <div>
            <strong>开箱即用</strong>
            <p>注册 ClawWin 云模型，新用户赠送免费额度，20+ 顶级 AI 即刻可用。之后仍可配置自定义 API Key、本地大模型</p>
          </div>
          <span className="choice-arrow">&#8250;</span>
        </div>
        <div className="feature-item choice-card" onClick={onCustom}>
          <span className="feature-icon">&#128295;</span>
          <div>
            <strong>自配 API Key</strong>
            <p>我有直接配置厂商大模型 API Key 的知识，虽然更贵，但我为知识付费，之后再注册</p>
          </div>
          <span className="choice-arrow">&#8250;</span>
        </div>
        <div className="feature-item choice-card" onClick={onSkip}>
          <span className="feature-icon">&#9203;</span>
          <div>
            <strong>之后再配置</strong>
            <p>跳过模型配置，先体验界面，稍后在设置中配置</p>
          </div>
          <span className="choice-arrow">&#8250;</span>
        </div>
      </div>
    </div>
  )
}
