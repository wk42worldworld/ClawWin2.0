import React, { useState, useEffect, useCallback } from 'react'
import { MODEL_PROVIDERS } from '../../hooks/useSetup'
import type { ModelProvider, ModelInfo } from '../../types'
import { CustomSelect } from '../Common/CustomSelect'
import { LocalModelSettings } from './LocalModelSettings'

interface ModelSettingsProps {
  currentProvider?: string
  currentModel?: string
  onClose: () => void
  onSaved: () => void
}

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

export const ModelSettings: React.FC<ModelSettingsProps> = ({
  currentProvider,
  currentModel,
  onClose,
  onSaved,
}) => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('cloud')
  const [selectedProvider, setSelectedProvider] = useState<string>(currentProvider ?? '')
  const [selectedModel, setSelectedModel] = useState<string>(currentModel ?? '')
  const [apiKey, setApiKey] = useState<string>('')
  const [validating, setValidating] = useState(false)
  const [validateResult, setValidateResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; error?: string } | null>(null)

  // Custom model state
  const [customUrl, setCustomUrl] = useState('')
  const [customModelId, setCustomModelId] = useState('')
  const [customModelName, setCustomModelName] = useState('')
  const [customFormat, setCustomFormat] = useState('openai-completions')
  const [isCustom, setIsCustom] = useState(false)

  // Load current API key when provider changes
  useEffect(() => {
    if (!selectedProvider || selectedProvider === 'custom') return
    let cancelled = false

    window.electronAPI.config
      .getApiKey(`${selectedProvider}:default`)
      .then((key) => {
        if (!cancelled && key) {
          setApiKey(key)
        }
      })
      .catch(() => {
        // Ignore errors loading existing key
      })

    return () => {
      cancelled = true
    }
  }, [selectedProvider])

  const getProviderById = useCallback(
    (id: string): ModelProvider | undefined => {
      if (id === 'custom' && isCustom) {
        return {
          id: 'custom',
          name: '自定义',
          baseUrl: customUrl.trim().replace(/\/+$/, ''),
          apiFormat: customFormat,
          models: [{
            id: customModelId.trim(),
            name: customModelName.trim() || customModelId.trim(),
            reasoning: false,
            contextWindow: 128000,
            maxTokens: 8192,
          }],
        }
      }
      return MODEL_PROVIDERS.find((p) => p.id === id)
    },
    [isCustom, customUrl, customFormat, customModelId, customModelName]
  )

  const getModelById = useCallback(
    (providerId: string, modelId: string): ModelInfo | undefined => {
      const provider = getProviderById(providerId)
      return provider?.models.find((m) => m.id === modelId)
    },
    [getProviderById]
  )

  const selectedProviderObj = getProviderById(selectedProvider)
  const selectedModelObj = getModelById(selectedProvider, selectedModel)

  const currentProviderObj = getProviderById(currentProvider ?? '')
  const currentModelObj = getModelById(currentProvider ?? '', currentModel ?? '')

  const handleProviderSelect = useCallback(
    (providerId: string) => {
      setSelectedProvider(providerId)
      setSelectedModel('')
      setApiKey('')
      setValidateResult(null)
      setSaveResult(null)
      setIsCustom(false)
    },
    []
  )

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId)
      setValidateResult(null)
      setSaveResult(null)
    },
    []
  )

  const handleValidate = useCallback(async () => {
    if (!apiKey.trim() || !selectedProviderObj || !selectedModel) return

    setValidating(true)
    setValidateResult(null)

    try {
      const result = await window.electronAPI.setup.validateApiKey({
        baseUrl: selectedProviderObj.baseUrl,
        apiFormat: selectedProviderObj.apiFormat,
        apiKey: apiKey.trim(),
        modelId: selectedModel,
      })
      setValidateResult(result)
    } catch (err) {
      setValidateResult({ ok: false, error: '验证过程发生异常' })
    } finally {
      setValidating(false)
    }
  }, [apiKey, selectedProviderObj, selectedModel])

  const handleSave = useCallback(async () => {
    if (!selectedProviderObj || !selectedModelObj || !apiKey.trim()) return

    setSaving(true)
    setSaveResult(null)

    try {
      const result = await window.electronAPI.config.saveModelConfig({
        provider: selectedProviderObj.id,
        modelId: selectedModelObj.id,
        modelName: selectedModelObj.name,
        baseUrl: selectedProviderObj.baseUrl,
        apiFormat: selectedProviderObj.apiFormat,
        apiKey: apiKey.trim(),
        reasoning: selectedModelObj.reasoning,
        contextWindow: selectedModelObj.contextWindow,
        maxTokens: selectedModelObj.maxTokens,
      })

      setSaveResult(result)

      if (result.ok) {
        onSaved()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSaveResult({ ok: false, error: `保存失败: ${message}` })
    } finally {
      setSaving(false)
    }
  }, [selectedProviderObj, selectedModelObj, apiKey, onSaved])

  const canSave = selectedProvider && selectedModel && apiKey.trim()

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="model-settings-tabs">
            <button
              className={`model-settings-tab${activeTab === 'cloud' ? ' active' : ''}`}
              onClick={() => setActiveTab('cloud')}
            >
              云端模型
            </button>
            <button
              className={`model-settings-tab${activeTab === 'local' ? ' active' : ''}`}
              onClick={() => setActiveTab('local')}
            >
              本地模型
            </button>
          </div>
          <button className="settings-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {activeTab === 'cloud' ? (
          <>
        <div className="model-settings-body">
          {/* Current model display */}
          <div className="model-settings-current">
            <div className="model-settings-current-label">当前模型</div>
            <div className="model-settings-current-value">
              {currentProviderObj
                ? `${currentProviderObj.name} / ${currentModelObj?.name ?? currentModel ?? '未选择'}`
                : '未配置'}
            </div>
          </div>

          {/* Provider card grid with inline model sub-list */}
          <div className="model-settings-provider-grid">
            {MODEL_PROVIDERS.map((provider) => {
              const isSelected = selectedProvider === provider.id
              return (
                <div
                  key={provider.id}
                  className={`model-settings-provider-card${isSelected ? ' selected' : ''}`}
                >
                  <div
                    className="model-settings-provider-header"
                    onClick={() => handleProviderSelect(provider.id)}
                  >
                    <span className="model-settings-provider-name">{provider.name}</span>
                    <div className="model-settings-provider-tags">
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
                    </div>
                  </div>
                  {isSelected && (
                    <div className="model-settings-model-list">
                      {provider.models.map((model) => (
                        <div
                          key={model.id}
                          className={`model-settings-model-item${
                            selectedModel === model.id ? ' selected' : ''
                          }`}
                          onClick={() => handleModelSelect(model.id)}
                        >
                          <div className="model-settings-model-name">{model.name}</div>
                          <div className="model-settings-model-meta">
                            <span>上下文: {(model.contextWindow / 1000).toFixed(0)}K</span>
                            <span>最大输出: {(model.maxTokens / 1000).toFixed(0)}K</span>
                            {model.reasoning && <span className="model-badge">推理</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Custom provider card */}
            <div className={`model-settings-provider-card${isCustom ? ' selected' : ''}`}>
              <div
                className="model-settings-provider-header"
                onClick={() => {
                  setSelectedProvider('custom')
                  setSelectedModel('')
                  setIsCustom(true)
                  setValidateResult(null)
                  setSaveResult(null)
                }}
              >
                <span className="model-settings-provider-name">自定义</span>
                <span className="provider-tag tag-custom">自定义 API</span>
              </div>
              {isCustom && (
                <div className="model-settings-model-list custom-fields">
                  <input
                    type="text"
                    placeholder="API 地址，如 https://api.example.com/v1"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="input-field"
                  />
                  <input
                    type="text"
                    placeholder="模型 ID，如 gpt-4o"
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    className="input-field"
                  />
                  <input
                    type="text"
                    placeholder="显示名称（可选）"
                    value={customModelName}
                    onChange={(e) => setCustomModelName(e.target.value)}
                    className="input-field"
                  />
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
                    onClick={() => {
                      if (!customUrl.trim() || !customModelId.trim()) return
                      setSelectedProvider('custom')
                      setSelectedModel(customModelId.trim())
                    }}
                    disabled={!customUrl.trim() || !customModelId.trim()}
                  >
                    确认选择
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fixed footer: API Key + Save */}
        <div className="model-settings-footer">
          {selectedProvider && selectedModel ? (
            <>
              <div className="model-settings-apikey-row">
                <input
                  type="password"
                  className="input-field"
                  placeholder="请输入 API Key"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setValidateResult(null)
                    setSaveResult(null)
                  }}
                />
                <button
                  className="btn-test"
                  onClick={handleValidate}
                  disabled={!apiKey.trim() || validating}
                >
                  {validating ? '验证中...' : '验证'}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                >
                  {saving ? '保存中...' : '保存并应用'}
                </button>
              </div>
              {validateResult?.ok && (
                <div className="model-settings-status success">API Key 验证通过！</div>
              )}
              {validateResult && !validateResult.ok && (
                <div className="model-settings-status error">
                  {validateResult.error || '连接失败，请检查 API Key 是否正确'}
                </div>
              )}
              {saveResult?.ok && (
                <div className="model-settings-status success">配置已保存，正在重启网关...</div>
              )}
              {saveResult && !saveResult.ok && (
                <div className="model-settings-status error">
                  {saveResult.error || '保存失败，请重试'}
                </div>
              )}
            </>
          ) : (
            <div className="model-settings-footer-hint">请选择一个厂商和模型</div>
          )}
        </div>
          </>
        ) : (
          <LocalModelSettings onSaved={onSaved} />
        )}
      </div>
    </div>
  )
}
