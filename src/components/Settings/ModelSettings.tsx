import React, { useState, useEffect, useCallback } from 'react'
import { MODEL_PROVIDERS } from '../../hooks/useSetup'
import type { ModelProvider, ModelInfo } from '../../types'

interface ModelSettingsProps {
  currentProvider?: string
  currentModel?: string
  onClose: () => void
  onSaved: () => void
}

const PROVIDER_TAGS: Record<string, { label: string; className: string }> = {
  minimax: { label: '国内直连', className: 'tag-domestic' },
  deepseek: { label: '国内直连 · 推荐', className: 'tag-recommended' },
  anthropic: { label: '需科学上网', className: 'tag-international' },
  openai: { label: '需科学上网', className: 'tag-international' },
  moonshot: { label: '国内直连', className: 'tag-domestic' },
  xai: { label: '需科学上网', className: 'tag-international' },
  zhipu: { label: '国内直连', className: 'tag-domestic' },
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({
  currentProvider,
  currentModel,
  onClose,
  onSaved,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<string>(currentProvider ?? '')
  const [selectedModel, setSelectedModel] = useState<string>(currentModel ?? '')
  const [apiKey, setApiKey] = useState<string>('')
  const [validating, setValidating] = useState(false)
  const [validateResult, setValidateResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; error?: string } | null>(null)

  // Load current API key when provider changes
  useEffect(() => {
    if (!selectedProvider) return
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
    (id: string): ModelProvider | undefined => MODEL_PROVIDERS.find((p) => p.id === id),
    []
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
          <h2>大模型配置</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

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
                    {PROVIDER_TAGS[provider.id] && (
                      <span className={`provider-tag ${PROVIDER_TAGS[provider.id].className}`}>
                        {PROVIDER_TAGS[provider.id].label}
                      </span>
                    )}
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
          </div>

          {/* API Key section */}
          {selectedProvider && selectedModel && (
            <div className="model-settings-apikey-section">
              <label className="model-settings-apikey-label">API Key</label>
              <div className="model-settings-apikey-row">
                <input
                  type="password"
                  className="input-field"
                  placeholder="请输入您的 API Key"
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
              </div>

              {validateResult?.ok && (
                <div className="model-settings-status success">
                  API Key 验证通过！
                </div>
              )}
              {validateResult && !validateResult.ok && (
                <div className="model-settings-status error">
                  {validateResult.error || '连接失败，请检查 API Key 是否正确'}
                </div>
              )}
            </div>
          )}

          {/* Save result feedback */}
          {saveResult && !saveResult.ok && (
            <div className="model-settings-status error">
              {saveResult.error || '保存失败，请重试'}
            </div>
          )}
          {saveResult?.ok && (
            <div className="model-settings-status success">
              配置已保存，正在重启网关...
            </div>
          )}

          {/* Save button */}
          <div className="model-settings-actions">
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!canSave || saving}
            >
              {saving ? '保存中...' : '保存并应用'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
