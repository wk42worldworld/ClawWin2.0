import { useState, useEffect, useCallback } from 'react'
import type { SetupConfig, ModelProvider } from '../types'

export const MODEL_PROVIDERS: ModelProvider[] = [
  // ── 国内直连 ──
  {
    id: 'zhipu',
    name: '智谱 (Z.AI)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiFormat: 'openai-completions',
    models: [
      { id: 'glm-5', name: 'GLM-5', reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', reasoning: false, contextWindow: 128000, maxTokens: 4096 },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', reasoning: false, contextWindow: 128000, maxTokens: 4096 },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiFormat: 'openai-completions',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', reasoning: true, contextWindow: 128000, maxTokens: 8192 },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问 / Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiFormat: 'openai-completions',
    models: [
      { id: 'qwen-max', name: 'Qwen Max', reasoning: false, contextWindow: 32768, maxTokens: 8192 },
      { id: 'qwen-plus', name: 'Qwen Plus', reasoning: false, contextWindow: 131072, maxTokens: 8192 },
      { id: 'qwen-turbo', name: 'Qwen Turbo', reasoning: false, contextWindow: 131072, maxTokens: 8192 },
      { id: 'qwq-plus', name: 'QwQ Plus', reasoning: true, contextWindow: 131072, maxTokens: 16384 },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiFormat: 'openai-completions',
    models: [
      { id: 'kimi-k2.5', name: 'Kimi K2.5', reasoning: false, contextWindow: 128000, maxTokens: 8192 },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    apiFormat: 'openai-completions',
    models: [
      { id: 'MiniMax-M2.1', name: 'MiniMax M2.1', reasoning: false, contextWindow: 200000, maxTokens: 8192 },
    ],
  },
  {
    id: 'siliconflow',
    name: '硅基流动 / SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiFormat: 'openai-completions',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', reasoning: true, contextWindow: 128000, maxTokens: 8192 },
      { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B', reasoning: false, contextWindow: 131072, maxTokens: 8192 },
    ],
  },
  {
    id: 'nvidia',
    name: 'NVIDIA (NIM)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiFormat: 'openai-completions',
    models: [
      { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1', reasoning: true, contextWindow: 128000, maxTokens: 8192 },
      { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', reasoning: false, contextWindow: 131072, maxTokens: 8192 },
      { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', reasoning: false, contextWindow: 131072, maxTokens: 8192 },
      { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5', reasoning: false, contextWindow: 128000, maxTokens: 8192 },
      { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', name: 'Nemotron Ultra 253B', reasoning: true, contextWindow: 131072, maxTokens: 8192 },
      { id: 'mistralai/mistral-small-24b-instruct-2501', name: 'Mistral Small 24B', reasoning: false, contextWindow: 32768, maxTokens: 8192 },
    ],
  },
  // ── 需科学上网 ──
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    baseUrl: 'https://api.openai.com/v1',
    apiFormat: 'openai-completions',
    models: [
      { id: 'gpt-5.2', name: 'GPT-5.2', reasoning: false, contextWindow: 400000, maxTokens: 128000 },
      { id: 'gpt-5.1', name: 'GPT-5.1', reasoning: false, contextWindow: 400000, maxTokens: 128000 },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', reasoning: true, contextWindow: 400000, maxTokens: 128000 },
      { id: 'o3', name: 'o3', reasoning: true, contextWindow: 200000, maxTokens: 100000 },
      { id: 'o4-mini', name: 'o4-mini', reasoning: true, contextWindow: 200000, maxTokens: 100000 },
      { id: 'gpt-4.1', name: 'GPT-4.1', reasoning: false, contextWindow: 1047576, maxTokens: 32768 },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', reasoning: false, contextWindow: 1047576, maxTokens: 32768 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    apiFormat: 'anthropic-messages',
    models: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', reasoning: false, contextWindow: 200000, maxTokens: 128000 },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', reasoning: false, contextWindow: 200000, maxTokens: 64000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', reasoning: false, contextWindow: 200000, maxTokens: 64000 },
      { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', reasoning: false, contextWindow: 200000, maxTokens: 64000 },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', reasoning: false, contextWindow: 200000, maxTokens: 64000 },
    ],
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiFormat: 'openai-completions',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', reasoning: true, contextWindow: 1048576, maxTokens: 65536 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', reasoning: false, contextWindow: 1048576, maxTokens: 8192 },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    apiFormat: 'openai-completions',
    models: [
      { id: 'grok-3', name: 'Grok 3', reasoning: false, contextWindow: 131072, maxTokens: 8192 },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', reasoning: true, contextWindow: 131072, maxTokens: 8192 },
    ],
  },
]

export type SetupStep = 'welcome' | 'model' | 'apikey' | 'workspace' | 'gateway' | 'channels' | 'skills' | 'complete'

/**
 * Generate a random 48-character hex token for gateway authentication.
 */
function generateGatewayToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Get default workspace path via IPC if available, otherwise use a fallback.
 */
async function fetchDefaultWorkspace(): Promise<string> {
  try {
    return await window.electronAPI.setup.getDefaultWorkspace()
  } catch {
    return 'C:/Users/User/openclaw'
  }
}

interface UseSetupReturn {
  step: SetupStep
  config: Partial<SetupConfig>
  providers: ModelProvider[]
  isFirstRun: boolean
  isLoading: boolean
  isSaving: boolean
  saveError: string | null
  clearError: () => void
  setStep: (step: SetupStep) => void
  updateConfig: (partial: Partial<SetupConfig>) => void
  saveConfig: () => Promise<boolean>
  startGateway: () => Promise<void>
}

export function useSetup(): UseSetupReturn {
  const [step, setStep] = useState<SetupStep>('welcome')
  const [config, setConfig] = useState<Partial<SetupConfig>>(() => ({
    gatewayPort: 39527,
    gatewayToken: generateGatewayToken(),
  }))
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.electronAPI.setup.isFirstRun(),
      fetchDefaultWorkspace(),
    ]).then(([first, defaultWorkspace]) => {
      setIsFirstRun(first)
      setConfig((prev) => ({ ...prev, workspace: prev.workspace ?? defaultWorkspace }))
      setIsLoading(false)
    }).catch((err) => {
      console.error('[useSetup] 初始化失败:', err)
      setIsFirstRun(false)
      setIsLoading(false)
    })
  }, [])

  const updateConfig = useCallback((partial: Partial<SetupConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }))
  }, [])

  const saveConfig = useCallback(async (): Promise<boolean> => {
    setSaveError(null)
    setIsSaving(true)
    try {
      // Validate required fields before attempting to save
      const cfg = config
      if (!cfg.provider || !cfg.modelId || !cfg.modelName || !cfg.apiKey) {
        const missing: string[] = []
        if (!cfg.provider) missing.push('服务提供商')
        if (!cfg.modelId) missing.push('模型')
        if (!cfg.modelName) missing.push('模型名称')
        if (!cfg.apiKey) missing.push('API Key')
        setSaveError(`配置信息不完整，缺少: ${missing.join(', ')}`)
        return false
      }

      const providerModelKey = `${cfg.provider}/${cfg.modelId}`
      const now = new Date().toISOString()

      const fullConfig: Record<string, unknown> = {
        // Pass raw setup fields for the electron side
        provider: cfg.provider,
        modelId: cfg.modelId,
        modelName: cfg.modelName,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        apiFormat: cfg.apiFormat,
        reasoning: cfg.reasoning,
        contextWindow: cfg.contextWindow,
        maxTokens: cfg.maxTokens,
        workspace: cfg.workspace,
        gatewayPort: cfg.gatewayPort,
        gatewayToken: cfg.gatewayToken,
        channels: cfg.channels,
        skills: cfg.skills,
        // Pre-built structure hints
        _providerModelKey: providerModelKey,
        _now: now,
      }

      const result = await window.electronAPI.setup.saveConfig(fullConfig)
      if (!result.ok) {
        setSaveError(result.error || '保存配置失败，请检查文件写入权限后重试')
      }
      return result.ok
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('保存配置时发生错误:', err)
      setSaveError(`保存配置时发生错误: ${message}`)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [config])

  const startGateway = useCallback(async () => {
    await window.electronAPI.gateway.start()
  }, [])

  const clearError = useCallback(() => {
    setSaveError(null)
  }, [])

  return {
    step,
    config,
    providers: MODEL_PROVIDERS,
    isFirstRun,
    isLoading,
    isSaving,
    saveError,
    clearError,
    setStep,
    updateConfig,
    saveConfig,
    startGateway,
  }
}
