import React, { useState } from 'react'
import type { ModelProvider, ModelInfo } from '../../types'
import { CustomSelect } from '../Common/CustomSelect'

interface ModelSelectProps {
  providers: ModelProvider[]
  selectedProvider: string | undefined
  selectedModel: string | undefined
  onSelect: (provider: ModelProvider, model: ModelInfo) => void
  onBack: () => void
  onNext: () => void
  onSkip?: () => void
}

export const ModelSelect: React.FC<ModelSelectProps> = ({
  providers,
  selectedProvider,
  selectedModel,
  onSelect,
  onBack,
  onNext,
  onSkip,
}) => {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(selectedProvider ?? null)
  const [customUrl, setCustomUrl] = useState('')
  const [customModelId, setCustomModelId] = useState('')
  const [customModelName, setCustomModelName] = useState('')
  const [customFormat, setCustomFormat] = useState('openai-completions')
  const [customSelected, setCustomSelected] = useState(false)

  const PROVIDER_TAGS: Record<string, { label: string; className: string }> = {
    minimax: { label: '国内直连', className: 'tag-domestic' },
    deepseek: { label: '国内直连', className: 'tag-domestic' },
    anthropic: { label: '需科学上网', className: 'tag-international' },
    openai: { label: '需科学上网', className: 'tag-international' },
    moonshot: { label: '国内直连', className: 'tag-domestic' },
    xai: { label: '需科学上网', className: 'tag-international' },
    zhipu: { label: '国内直连 · 推荐', className: 'tag-recommended' },
    qwen: { label: '国内直连', className: 'tag-domestic' },
    siliconflow: { label: '国内直连 · 聚合', className: 'tag-domestic' },
    nvidia: { label: '需科学上网 · 免费额度', className: 'tag-international' },
    google: { label: '需科学上网', className: 'tag-international' },
  }

  const PROVIDER_KEY_URLS: Record<string, string> = {
    zhipu: 'https://open.bigmodel.cn/usercenter/apikeys',
    deepseek: 'https://platform.deepseek.com/api_keys',
    qwen: 'https://dashscope.console.aliyun.com/apiKey',
    moonshot: 'https://platform.moonshot.cn/console/api-keys',
    minimax: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    siliconflow: 'https://cloud.siliconflow.cn/account/ak',
    nvidia: 'https://build.nvidia.com/',
    openai: 'https://platform.openai.com/api-keys',
    anthropic: 'https://console.anthropic.com/settings/keys',
    google: 'https://aistudio.google.com/apikey',
    xai: 'https://console.x.ai/',
  }

  const handleProviderToggle = (providerId: string) => {
    setExpandedProvider((prev) => (prev === providerId ? null : providerId))
    setCustomSelected(false)
  }

  const handleCustomConfirm = () => {
    if (!customUrl.trim() || !customModelId.trim()) return
    const name = customModelName.trim() || customModelId.trim()
    const customProvider: ModelProvider = {
      id: 'custom',
      name: '自定义',
      baseUrl: customUrl.trim().replace(/\/+$/, ''),
      apiFormat: customFormat,
      models: [{
        id: customModelId.trim(),
        name,
        reasoning: false,
        contextWindow: 128000,
        maxTokens: 8192,
      }],
    }
    setCustomSelected(true)
    onSelect(customProvider, customProvider.models[0])
  }

  const isCustomExpanded = expandedProvider === 'custom'

  return (
    <div className="setup-page model-select-page">
      <h2 className="setup-title">选择 AI 模型</h2>
      <p className="setup-subtitle">选择一个 AI 服务提供商和模型</p>

      <div className="provider-list">
        {providers.map((provider, idx) => {
          const isExpanded = expandedProvider === provider.id
          const isProviderSelected = selectedProvider === provider.id && !customSelected
          return (
            <div
              key={provider.id}
              className={`provider-card${isExpanded ? ' expanded' : ''}${isProviderSelected ? ' selected' : ''}`}
              style={{ animationDelay: `${idx * 0.06}s` }}
            >
              <div
                className="provider-header"
                onClick={() => handleProviderToggle(provider.id)}
              >
                <span className="provider-name">{provider.name}</span>
                <div className="provider-header-right">
                  {PROVIDER_TAGS[provider.id] && (
                    <span className={`provider-tag ${PROVIDER_TAGS[provider.id].className}`}>
                      {PROVIDER_TAGS[provider.id].label}
                    </span>
                  )}
                  {PROVIDER_KEY_URLS[provider.id] && (
                    <button
                      className="provider-key-link"
                      title="获取 API Key"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.electronAPI.shell.openExternal(PROVIDER_KEY_URLS[provider.id])
                      }}
                    >
                      获取 Key
                    </button>
                  )}
                  <span className={`provider-chevron${isExpanded ? ' open' : ''}`}>▸</span>
                </div>
              </div>
              {isExpanded && (
                <div className="model-list">
                  {provider.models.map((model, mIdx) => (
                    <div
                      key={model.id}
                      className={`model-item model-item-animated ${
                        isProviderSelected && selectedModel === model.id ? 'selected' : ''
                      }`}
                      onClick={() => {
                        setCustomSelected(false)
                        onSelect(provider, model)
                      }}
                      style={{ animationDelay: `${mIdx * 0.03}s` }}
                    >
                      <div className="model-name">{model.name}</div>
                      <div className="model-meta">
                        {model.reasoning && <span className="model-badge">推理</span>}
                        <span>上下文: {(model.contextWindow / 1000).toFixed(0)}K</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Custom provider */}
        <div className={`provider-card${isCustomExpanded ? ' expanded' : ''}${customSelected ? ' selected' : ''}`}>
          <div
            className="provider-header"
            onClick={() => {
              setExpandedProvider((prev) => (prev === 'custom' ? null : 'custom'))
            }}
          >
            <span className="provider-name">自定义</span>
            <div className="provider-header-right">
              <span className="provider-tag tag-custom">自定义 API</span>
              <span className={`provider-chevron${isCustomExpanded ? ' open' : ''}`}>▸</span>
            </div>
          </div>
          {isCustomExpanded && (
            <div className="model-list custom-model-fields">
              <input
                type="text"
                placeholder="API 地址，如 https://api.example.com/v1"
                value={customUrl}
                onChange={(e) => { setCustomUrl(e.target.value); setCustomSelected(false) }}
                className="input-field"
              />
              <input
                type="text"
                placeholder="模型 ID，如 gpt-4o"
                value={customModelId}
                onChange={(e) => { setCustomModelId(e.target.value); setCustomSelected(false) }}
                className="input-field"
              />
              <input
                type="text"
                placeholder="显示名称（可选）"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                className="input-field"
              />
              <div className="custom-format-row">
                <CustomSelect
                  value={customFormat}
                  onChange={(val) => setCustomFormat(val)}
                  options={[
                    { value: 'openai-completions', label: 'OpenAI 兼容' },
                    { value: 'anthropic-messages', label: 'Anthropic 格式' },
                  ]}
                  className="custom-format-select"
                />
                <button
                  className="btn-primary btn-custom-confirm"
                  onClick={handleCustomConfirm}
                  disabled={!customUrl.trim() || !customModelId.trim()}
                >
                  {customSelected ? '已选择' : '确认选择'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        {onSkip && <button className="btn-secondary" onClick={onSkip}>跳过</button>}
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
