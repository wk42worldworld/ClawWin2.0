import React, { useState, useCallback } from 'react'

interface ApiKeyInputProps {
  providerName: string
  modelName: string
  baseUrl: string
  apiFormat: string
  modelId: string
  onBack: () => void
  onNext: (apiKey: string) => void
  onSkip?: () => void
}

const HELP_URLS: Record<string, string> = {
  MiniMax: 'https://platform.minimax.chat/',
  DeepSeek: 'https://platform.deepseek.com/',
  'Anthropic (Claude)': 'https://console.anthropic.com/',
  'OpenAI (GPT)': 'https://platform.openai.com/api-keys',
  'Moonshot / Kimi': 'https://platform.moonshot.cn/',
  'xAI (Grok)': 'https://console.x.ai/',
  'Z.AI / 智谱': 'https://open.bigmodel.cn/',
  '智谱 (Z.AI)': 'https://open.bigmodel.cn/',
  '通义千问 / Qwen': 'https://dashscope.console.aliyun.com/',
  '硅基流动 / SiliconFlow': 'https://cloud.siliconflow.cn/',
  'NVIDIA (NIM)': 'https://build.nvidia.com/',
  'Google (Gemini)': 'https://aistudio.google.com/apikey',
}

export const ApiKeyInput: React.FC<ApiKeyInputProps> = ({
  providerName,
  modelName,
  baseUrl,
  apiFormat,
  modelId,
  onBack,
  onNext,
  onSkip,
}) => {
  const [apiKey, setApiKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const handleTest = useCallback(async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult(null)

    try {
      const result = await window.electronAPI.setup.validateApiKey({
        baseUrl,
        apiFormat,
        apiKey: apiKey.trim(),
        modelId,
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, error: '验证过程发生异常' })
    } finally {
      setTesting(false)
    }
  }, [apiKey, baseUrl, apiFormat, modelId])

  const handleNext = useCallback(() => {
    if (apiKey.trim()) {
      onNext(apiKey.trim())
    }
  }, [apiKey, onNext])

  const helpUrl = HELP_URLS[providerName] ?? ''

  return (
    <div className="setup-page apikey-page">
      <h2 className="setup-title">输入 API Key</h2>
      <p className="setup-subtitle">
        请输入 {providerName} 的 API Key 以使用 {modelName}
      </p>

      <div className="apikey-form">
        <div className="apikey-input-group">
          <input
            type="password"
            className="input-field input-apikey"
            placeholder="请输入您的 API Key"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              setTestResult(null)
            }}
            autoFocus
          />
          <button
            className="btn-test"
            onClick={handleTest}
            disabled={!apiKey.trim() || testing}
          >
            {testing ? '验证中...' : '验证'}
          </button>
        </div>

        {testResult?.ok && (
          <div className="test-result test-success">API Key 验证通过！</div>
        )}
        {testResult && !testResult.ok && (
          <div className="test-result test-failed">
            {testResult.error || '连接失败，请检查 API Key 是否正确'}
          </div>
        )}

        {helpUrl && (
          <p className="apikey-help">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                window.electronAPI.shell.openExternal(helpUrl)
              }}
            >
              如何获取 {providerName} API Key？
            </a>
          </p>
        )}
      </div>

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        {onSkip && <button className="btn-secondary" onClick={onSkip}>跳过</button>}
        <button
          className="btn-primary"
          onClick={handleNext}
          disabled={!apiKey.trim()}
        >
          下一步
        </button>
      </div>
    </div>
  )
}
