import React, { useState, useEffect, useCallback } from 'react'
import { MODEL_PROVIDERS } from '../../hooks/useSetup'
import type { ModelProvider, ModelInfo } from '../../types'
import { CustomSelect } from '../Common/CustomSelect'
import { LocalModelSettings } from './LocalModelSettings'

interface ModelSettingsProps {
  currentProvider?: string
  currentModel?: string
  initialTab?: 'cloud' | 'clawwin' | 'local'
  onClose: () => void
  onSaved: () => void
  onCwwStateChange?: (state: {
    loggedIn: boolean
    email: string
    nickname: string
    credits: number
  }) => void
}

const PROVIDER_TAGS: Record<string, { label: string; className: string }> = {
  clawwinweb: { label: '免Key·积分制', className: 'tag-recommended' },
  minimax: { label: '国内直连', className: 'tag-domestic' },
  deepseek: { label: '国内直连', className: 'tag-domestic' },
  anthropic: { label: '需科学上网', className: 'tag-international' },
  openai: { label: '需科学上网', className: 'tag-international' },
  moonshot: { label: '国内直连', className: 'tag-domestic' },
  xai: { label: '需科学上网', className: 'tag-international' },
  zhipu: { label: '国内直连', className: 'tag-domestic' },
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

const PROVIDER_TUTORIAL_URLS: Record<string, string> = {
  zhipu: 'https://open.bigmodel.cn/dev/howuse/introduction',
  deepseek: 'https://api-docs.deepseek.com/zh-cn/',
  qwen: 'https://help.aliyun.com/zh/model-studio/getting-started/',
  moonshot: 'https://platform.moonshot.cn/docs/intro',
  minimax: 'https://platform.minimaxi.com/document/introduction',
  siliconflow: 'https://docs.siliconflow.cn/quickstart',
  nvidia: 'https://build.nvidia.com/docs/getting-started',
  openai: 'https://platform.openai.com/docs/quickstart',
  anthropic: 'https://docs.anthropic.com/en/docs/initial-setup',
  google: 'https://ai.google.dev/gemini-api/docs/quickstart',
  xai: 'https://docs.x.ai/docs/quickstart',
}

export const ModelSettings: React.FC<ModelSettingsProps> = ({
  currentProvider,
  currentModel,
  initialTab,
  onClose,
  onSaved,
  onCwwStateChange,
}) => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'clawwin' | 'local'>(initialTab ?? 'clawwin')
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

  // ClawWinWeb state
  const [cwwView, setCwwView] = useState<'login' | 'register' | 'logged-in' | 'recharge'>('login')
  const [cwwEmail, setCwwEmail] = useState('')
  const [cwwPassword, setCwwPassword] = useState('')
  const [cwwNickname, setCwwNickname] = useState('')
  const [cwwCode, setCwwCode] = useState('')
  const [cwwToken, setCwwToken] = useState('')
  const [cwwCredits, setCwwCredits] = useState(0)
  const [cwwModels, setCwwModels] = useState<Array<{id:string;name:string;provider:string;inputRate:number;outputRate:number}>>([])
  const [cwwError, setCwwError] = useState('')
  const [cwwLoading, setCwwLoading] = useState(false)
  const [cwwCodeCountdown, setCwwCodeCountdown] = useState(0)
  const cwwServerUrl = 'https://www.mybotworld.com'
  const [rechargeAmount, setRechargeAmount] = useState(30)
  const [rechargeStatus, setRechargeStatus] = useState<'idle' | 'paying' | 'success'>('idle')
  const [showCustomRecharge, setShowCustomRecharge] = useState(false)
  const [customRechargeInput, setCustomRechargeInput] = useState('')
  const [cwwRefreshing, setCwwRefreshing] = useState(false)

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

  // 回填自定义模型配置
  useEffect(() => {
    if (currentProvider !== 'custom') return
    let cancelled = false

    window.electronAPI.config.readConfig().then((config) => {
      if (cancelled || !config) return
      const models = (config as Record<string, unknown>).models as Record<string, unknown> | undefined
      const providers = models?.providers as Record<string, Record<string, unknown>> | undefined
      const customProvider = providers?.custom
      if (!customProvider) return

      setIsCustom(true)
      setSelectedProvider('custom')
      if (customProvider.baseUrl) setCustomUrl(customProvider.baseUrl as string)
      if (customProvider.api) setCustomFormat(customProvider.api as string)

      const modelList = customProvider.models as Array<{ id?: string; name?: string }> | undefined
      const model = modelList?.[0]
      if (model) {
        setCustomModelId(model.id ?? '')
        setCustomModelName(model.name ?? '')
        setSelectedModel(model.id ?? '')
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [currentProvider])

  // ClawWinWeb: restore login state when clawwin tab selected
  useEffect(() => {
    if (activeTab !== 'clawwin') return
    setSelectedProvider('clawwinweb')
    let cancelled = false

    const restore = async () => {
      try {
        const state = await window.electronAPI.cww.getState()
        const savedKey = await window.electronAPI.config.getApiKey('clawwinweb:default')
        if (cancelled) return
        if (state && state.email && savedKey) {
          setCwwEmail(state.email || '')
          setCwwNickname(state.nickname || '')
          setCwwCredits(state.credits || 0)
          setCwwToken(savedKey)
          setApiKey(savedKey)
          setCwwView('logged-in')
          fetchCwwModelsAndProfile(savedKey)
        }
      } catch {
        // no saved state
      }
    }
    restore()

    return () => { cancelled = true }
  }, [activeTab])

  // ClawWinWeb: countdown timer for verification code
  useEffect(() => {
    if (cwwCodeCountdown <= 0) return
    const timer = setTimeout(() => setCwwCodeCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cwwCodeCountdown])

  const fetchCwwModelsAndProfile = useCallback(async (token: string) => {
    setCwwRefreshing(true)
    try {
      const [modelsRes, profileRes] = await Promise.all([
        window.electronAPI.cww.fetchModels({ serverUrl: cwwServerUrl, token }),
        window.electronAPI.cww.getProfile({ serverUrl: cwwServerUrl, token }),
      ])
      setCwwModels(modelsRes.models || [])
      setCwwCredits(profileRes.user?.credits ?? 0)
      setCwwNickname(profileRes.user?.nickname ?? '')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('401') || message.toLowerCase().includes('unauthorized')) {
        setCwwToken('')
        setApiKey('')
        setCwwView('login')
        setCwwError('登录已过期，请重新登录')
      }
    } finally {
      setCwwRefreshing(false)
    }
  }, [])

  const handleCwwLogin = useCallback(async () => {
    setCwwError('')
    setCwwLoading(true)
    try {
      const res = await window.electronAPI.cww.login({
        serverUrl: cwwServerUrl,
        email: cwwEmail,
        password: cwwPassword,
      })
      const token = res.token
      setCwwToken(token)
      setApiKey(token)
      setCwwCredits(res.user?.credits ?? 0)
      setCwwNickname(res.user?.nickname ?? '')
      setCwwView('logged-in')
      await window.electronAPI.cww.saveState({
        email: cwwEmail,
        nickname: res.user?.nickname ?? '',
        credits: res.user?.credits ?? 0,
        serverUrl: cwwServerUrl,
        encPassword: btoa(cwwPassword),
      })
      onCwwStateChange?.({ loggedIn: true, email: cwwEmail, nickname: res.user?.nickname ?? '', credits: res.user?.credits ?? 0 })
      fetchCwwModelsAndProfile(token)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setCwwError(message || '登录失败')
    } finally {
      setCwwLoading(false)
    }
  }, [cwwEmail, cwwPassword, fetchCwwModelsAndProfile])

  const handleCwwRegister = useCallback(async () => {
    setCwwError('')
    setCwwLoading(true)
    try {
      const res = await window.electronAPI.cww.register({
        serverUrl: cwwServerUrl,
        email: cwwEmail,
        password: cwwPassword,
        nickname: cwwNickname,
        code: cwwCode,
      })
      const token = res.token
      setCwwToken(token)
      setApiKey(token)
      setCwwCredits(res.user?.credits ?? 0)
      setCwwNickname(res.user?.nickname ?? '')
      setCwwView('logged-in')
      await window.electronAPI.cww.saveState({
        email: cwwEmail,
        nickname: res.user?.nickname ?? '',
        credits: res.user?.credits ?? 0,
        serverUrl: cwwServerUrl,
        encPassword: btoa(cwwPassword),
      })
      onCwwStateChange?.({ loggedIn: true, email: cwwEmail, nickname: res.user?.nickname ?? '', credits: res.user?.credits ?? 0 })
      fetchCwwModelsAndProfile(token)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setCwwError(message || '注册失败')
    } finally {
      setCwwLoading(false)
    }
  }, [cwwEmail, cwwPassword, cwwNickname, cwwCode, fetchCwwModelsAndProfile])

  const handleCwwSendCode = useCallback(async () => {
    setCwwError('')
    try {
      await window.electronAPI.cww.sendCode({ serverUrl: cwwServerUrl, email: cwwEmail })
      setCwwCodeCountdown(60)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setCwwError(message || '发送验证码失败')
    }
  }, [cwwEmail])

  const handleCwwLogout = useCallback(() => {
    setCwwToken('')
    setCwwModels([])
    setCwwCredits(0)
    setApiKey('')
    setCwwView('login')
    setCwwEmail('')
    setCwwPassword('')
    setCwwError('')
    window.electronAPI.cww.saveState({ email: '', nickname: '', credits: 0, serverUrl: cwwServerUrl }).catch(() => {})
    onCwwStateChange?.({ loggedIn: false, email: '', nickname: '', credits: 0 })
  }, [])

  const handleRecharge = useCallback(async () => {
    setCwwError('')
    setRechargeStatus('paying')
    try {
      const res = await window.electronAPI.cww.createOrder({
        serverUrl: cwwServerUrl,
        token: cwwToken,
        amount: rechargeAmount,
        payType: 'alipay',
      })
      if (res.payUrl) {
        window.electronAPI.shell.openExternal(res.payUrl)
      }
      // Poll for payment status
      const pollInterval = setInterval(async () => {
        try {
          const checkRes = await window.electronAPI.cww.checkOrder({
            serverUrl: cwwServerUrl,
            token: cwwToken,
            orderNo: res.orderNo,
          })
          if (checkRes.order?.status === 'paid') {
            clearInterval(pollInterval)
            setRechargeStatus('success')
            // Refresh credits
            try {
              const profileRes = await window.electronAPI.cww.getProfile({ serverUrl: cwwServerUrl, token: cwwToken })
              setCwwCredits(profileRes.user?.credits ?? 0)
              await window.electronAPI.cww.saveState({
                email: cwwEmail,
                nickname: cwwNickname,
                credits: profileRes.user?.credits ?? 0,
                serverUrl: cwwServerUrl,
              })
              onCwwStateChange?.({ loggedIn: true, email: cwwEmail, nickname: cwwNickname, credits: profileRes.user?.credits ?? 0 })
            } catch {}
          }
        } catch {
          clearInterval(pollInterval)
          setRechargeStatus('idle')
          setCwwError('查询订单状态失败')
        }
      }, 3000)
      // Auto-stop polling after 5 minutes
      setTimeout(() => clearInterval(pollInterval), 300000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setCwwError(message || '创建订单失败')
      setRechargeStatus('idle')
    }
  }, [cwwToken, rechargeAmount, cwwEmail, cwwNickname])

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
      if (id === 'clawwinweb' && cwwModels.length > 0) {
        return {
          id: 'clawwinweb',
          name: 'ClawWinWeb',
          baseUrl: `${cwwServerUrl}/api/v1`,
          apiFormat: 'openai-completions',
          models: cwwModels.map((m) => ({
            id: m.id,
            name: m.name,
            reasoning: false,
            contextWindow: 128000,
          })),
        }
      }
      return MODEL_PROVIDERS.find((p) => p.id === id)
    },
    [isCustom, customUrl, customFormat, customModelId, customModelName, cwwModels]
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
              className={`model-settings-tab${activeTab === 'clawwin' ? ' active' : ''}`}
              onClick={() => setActiveTab('clawwin')}
            >
              ClawWin模型
            </button>
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
            {MODEL_PROVIDERS.filter(p => p.id !== 'clawwinweb').map((provider) => {
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
                      {PROVIDER_TUTORIAL_URLS[provider.id] && (
                        <button
                          className="provider-tutorial-link"
                          title="查看配置教程"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.electronAPI.shell.openExternal(PROVIDER_TUTORIAL_URLS[provider.id])
                          }}
                        >
                          教程
                        </button>
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
                            {model.maxTokens && <span>最大输出: {(model.maxTokens / 1000).toFixed(0)}K</span>}
                            {model.reasoning && <span className="model-badge" title="推理模型速度慢不适合 Agent，请慎重使用">推理</span>}
                            {model.reasoning && <span className="model-reasoning-warn">速度慢，不适合 Agent</span>}
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
          {selectedProvider && selectedProvider !== 'clawwinweb' && selectedModel ? (
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
        ) : activeTab === 'clawwin' ? (
          <>
            <div className="model-settings-body">
              {/* 当前模型 */}
              <div className="model-settings-current">
                <div className="model-settings-current-label">当前模型</div>
                <div className="model-settings-current-value">
                  {currentProviderObj
                    ? `${currentProviderObj.name} / ${currentModelObj?.name ?? currentModel ?? '未选择'}`
                    : '未配置'}
                </div>
              </div>

              <p className="settings-hint" style={{ padding: '0 28px', margin: '0 0 8px' }}>
                聚合多家模型，价格低于官方 API，按积分计费，无需自备 Key
              </p>

              {/* ===== 登录视图 ===== */}
              {cwwView === 'login' && (
                <div className="cww-login-panel cww-panel-center">
                  <div className="cww-panel-title">登录 ClawWinWeb</div>
                  <input type="email" placeholder="邮箱" value={cwwEmail}
                    onChange={(e) => setCwwEmail(e.target.value)} />
                  <input type="password" placeholder="密码" value={cwwPassword}
                    onChange={(e) => setCwwPassword(e.target.value)} />
                  {cwwError && <div className="cww-error">{cwwError}</div>}
                  <div className="cww-login-actions">
                    <button className="btn-primary" onClick={handleCwwLogin}
                      disabled={cwwLoading || !cwwEmail.trim() || !cwwPassword.trim()}>
                      {cwwLoading ? '登录中...' : '登录'}
                    </button>
                  </div>
                  <div className="cww-login-link"
                    onClick={() => { setCwwView('register'); setCwwError('') }}>
                    没有账号？注册
                  </div>
                </div>
              )}

              {/* ===== 注册视图 ===== */}
              {cwwView === 'register' && (
                <div className="cww-login-panel cww-panel-center">
                  <div className="cww-panel-title">注册 ClawWinWeb</div>
                  <input type="email" placeholder="邮箱" value={cwwEmail}
                    onChange={(e) => setCwwEmail(e.target.value)} />
                  <input type="password" placeholder="密码" value={cwwPassword}
                    onChange={(e) => setCwwPassword(e.target.value)} />
                  <input type="text" placeholder="昵称" value={cwwNickname}
                    onChange={(e) => setCwwNickname(e.target.value)} />
                  <div className="cww-code-row">
                    <input type="text" placeholder="验证码" value={cwwCode}
                      onChange={(e) => setCwwCode(e.target.value)} />
                    <button className="btn-secondary" onClick={handleCwwSendCode}
                      disabled={cwwCodeCountdown > 0 || !cwwEmail.trim()}>
                      {cwwCodeCountdown > 0 ? `${cwwCodeCountdown}s` : '发送验证码'}
                    </button>
                  </div>
                  {cwwError && <div className="cww-error">{cwwError}</div>}
                  <div className="cww-login-actions">
                    <button className="btn-primary" onClick={handleCwwRegister}
                      disabled={cwwLoading || !cwwEmail.trim() || !cwwPassword.trim() || !cwwCode.trim()}>
                      {cwwLoading ? '注册中...' : '注册'}
                    </button>
                  </div>
                  <div className="cww-login-link"
                    onClick={() => { setCwwView('login'); setCwwError('') }}>
                    已有账号？登录
                  </div>
                </div>
              )}

              {/* ===== 已登录视图 ===== */}
              {cwwView === 'logged-in' && (
                <div>
                  <div className="cww-user-info">
                    <span className="cww-user-name">{cwwNickname || cwwEmail}</span>
                    <span className="cww-credits">积分: {cwwCredits}</span>
                    <button className="cww-btn-small"
                      onClick={() => { setCwwView('recharge'); setRechargeStatus('idle') }}>
                      充值
                    </button>
                    <button className="cww-btn-small" onClick={handleCwwLogout}>退出</button>
                    <button className="cww-btn-small" onClick={() => fetchCwwModelsAndProfile(cwwToken)}
                      disabled={cwwRefreshing}>
                      {cwwRefreshing ? '刷新中...' : '刷新模型'}
                    </button>
                  </div>
                  {cwwRefreshing && <div className="cww-refresh-bar"><div className="cww-refresh-bar-inner" /></div>}
                  {cwwError && <div className="cww-error">{cwwError}</div>}
                  {(() => {
                    // 推理模型关键词（不适合 Agent）
                    const REASONING_KEYWORDS = /\b(o[1-9]|o\d+-mini|r1|qwq|reasoner|thinking|deep-?think)\b/i
                    const isReasoningModel = (name: string, id: string) =>
                      REASONING_KEYWORDS.test(name) || REASONING_KEYWORDS.test(id)

                    const rates = cwwModels.map(m => (m.inputRate + m.outputRate) / 2).sort((a, b) => a - b)
                    const low = rates[Math.floor(rates.length / 3)] ?? 0
                    const high = rates[Math.floor(rates.length * 2 / 3)] ?? 0
                    return cwwModels.map((model) => {
                      const avg = (model.inputRate + model.outputRate) / 2
                      const costLevel = avg > high ? '大' : avg > low ? '中' : '小'
                      const costClass = avg > high ? 'high' : avg > low ? 'mid' : 'low'
                      const reasoning = isReasoningModel(model.name, model.id)
                      return (
                        <div key={model.id}
                          className={`model-settings-model-item${selectedModel === model.id ? ' selected' : ''}`}
                          onClick={() => handleModelSelect(model.id)}>
                          <div className="model-settings-model-name">{model.name}</div>
                          <div className="model-settings-model-meta">
                            <span>{model.provider}</span>
                            <span className={`cost-badge cost-${costClass}`}>积分消耗: {costLevel}</span>
                            {reasoning
                              ? <span className="model-reasoning-warn">推理模型，不适合 Agent</span>
                              : <span className="model-agent-badge">适合 Agent</span>
                            }
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}

              {/* ===== 充值视图（扩展版） ===== */}
              {cwwView === 'recharge' && (
                <div className="cww-recharge-panel">
                  {rechargeStatus === 'idle' && (
                    <>
                      <div className="cww-amount-grid">
                        {[10, 30, 50, 100, 500, 1000, 2000].map((amt) => (
                          <div key={amt}
                            className={`cww-amount-btn${rechargeAmount === amt && !showCustomRecharge ? ' selected' : ''}`}
                            onClick={() => { setRechargeAmount(amt); setShowCustomRecharge(false) }}>
                            {amt} 元
                          </div>
                        ))}
                        <div
                          className={`cww-amount-btn${showCustomRecharge ? ' selected' : ''}`}
                          onClick={() => setShowCustomRecharge(true)}>
                          自定义
                        </div>
                      </div>
                      {showCustomRecharge && (
                        <input type="number" className="input-field"
                          placeholder="输入金额 (1-10000)"
                          value={customRechargeInput}
                          onChange={(e) => {
                            setCustomRechargeInput(e.target.value)
                            const val = parseInt(e.target.value, 10)
                            if (val >= 1 && val <= 10000) setRechargeAmount(val)
                          }}
                          min={1} max={10000}
                          style={{ marginBottom: '12px' }}
                        />
                      )}
                      {cwwError && <div className="cww-error">{cwwError}</div>}
                      <div className="cww-login-actions">
                        <button className="btn-primary" onClick={handleRecharge}>
                          充值 {rechargeAmount} 元
                        </button>
                        <button className="btn-secondary" onClick={() => setCwwView('logged-in')}>
                          返回
                        </button>
                      </div>
                    </>
                  )}
                  {rechargeStatus === 'paying' && (
                    <>
                      <div className="cww-recharge-info">请在浏览器中完成支付，支付完成后将自动更新积分...</div>
                      <div className="cww-login-actions">
                        <button className="btn-secondary"
                          onClick={() => { setRechargeStatus('idle'); setCwwView('logged-in') }}>
                          返回
                        </button>
                      </div>
                    </>
                  )}
                  {rechargeStatus === 'success' && (
                    <>
                      <div className="cww-recharge-success">充值成功！当前积分: {cwwCredits}</div>
                      <div className="cww-login-actions">
                        <button className="btn-primary"
                          onClick={() => { setRechargeStatus('idle'); setCwwView('logged-in') }}>
                          返回
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ClawWin Tab Footer */}
            <div className="model-settings-footer">
              {cwwView === 'logged-in' && selectedModel ? (
                <>
                  <div className="model-settings-apikey-row">
                    <span className="cww-footer-info">
                      已登录: {cwwNickname || cwwEmail} · 积分: {cwwCredits}
                    </span>
                    <button className="btn-primary" onClick={handleSave} disabled={saving}>
                      {saving ? '保存中...' : '保存并应用'}
                    </button>
                  </div>
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
                <div className="model-settings-footer-hint">
                  {cwwView === 'logged-in' ? '请选择一个模型' : '请先登录 ClawWinWeb'}
                </div>
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
