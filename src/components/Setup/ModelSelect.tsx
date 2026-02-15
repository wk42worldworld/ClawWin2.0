import React, { useState } from 'react'
import type { ModelProvider, ModelInfo } from '../../types'

interface ModelSelectProps {
  providers: ModelProvider[]
  selectedProvider: string | undefined
  selectedModel: string | undefined
  onSelect: (provider: ModelProvider, model: ModelInfo) => void
  onBack: () => void
  onNext: () => void
}

export const ModelSelect: React.FC<ModelSelectProps> = ({
  providers,
  selectedProvider,
  selectedModel,
  onSelect,
  onBack,
  onNext,
}) => {
  const [customUrl, setCustomUrl] = useState('')

  const PROVIDER_TAGS: Record<string, { label: string; className: string }> = {
    minimax: { label: '国内直连', className: 'tag-domestic' },
    deepseek: { label: '国内直连 · 推荐', className: 'tag-recommended' },
    anthropic: { label: '需科学上网', className: 'tag-international' },
    openai: { label: '需科学上网', className: 'tag-international' },
    moonshot: { label: '国内直连', className: 'tag-domestic' },
    xai: { label: '需科学上网', className: 'tag-international' },
    zhipu: { label: '国内直连', className: 'tag-domestic' },
  }

  return (
    <div className="setup-page model-select-page">
      <h2 className="setup-title">选择 AI 模型</h2>
      <p className="setup-subtitle">选择一个 AI 服务提供商和模型</p>

      <div className="provider-list">
        {providers.map((provider) => (
          <div key={provider.id} className="provider-card">
            <div className="provider-header">
              <span className="provider-name">{provider.name}</span>
              {PROVIDER_TAGS[provider.id] && (
                <span className={`provider-tag ${PROVIDER_TAGS[provider.id].className}`}>
                  {PROVIDER_TAGS[provider.id].label}
                </span>
              )}
            </div>
            <div className="model-list">
              {provider.models.map((model) => (
                <div
                  key={model.id}
                  className={`model-item ${
                    selectedProvider === provider.id && selectedModel === model.id ? 'selected' : ''
                  }`}
                  onClick={() => onSelect(provider, model)}
                >
                  <div className="model-name">{model.name}</div>
                  <div className="model-meta">
                    {model.reasoning && <span className="model-badge">推理</span>}
                    <span>上下文: {(model.contextWindow / 1000).toFixed(0)}K</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Custom provider */}
        <div className="provider-card">
          <div className="provider-header">
            <span className="provider-name">自定义</span>
            <span className="provider-tag tag-custom">自定义 API</span>
          </div>
          <div className="custom-url-input">
            <input
              type="text"
              placeholder="https://your-api.example.com/v1"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button
          className="btn-primary"
          onClick={onNext}
          disabled={!selectedProvider || !selectedModel}
        >
          下一步
        </button>
      </div>
    </div>
  )
}
