import { useState, useEffect, useCallback } from 'react'
import type { SetupConfig, ModelProvider } from '../types'

export const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    apiFormat: 'openai-completions',
    models: [
      {
        id: 'MiniMax-M2.1',
        name: 'MiniMax M2.1',
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 8192,
      },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiFormat: 'openai-completions',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek V3',
        reasoning: false,
        contextWindow: 128000,
        maxTokens: 8192,
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek R1',
        reasoning: true,
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    apiFormat: 'anthropic-messages',
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 8192,
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        reasoning: false,
        contextWindow: 200000,
        maxTokens: 8192,
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    baseUrl: 'https://api.openai.com/v1',
    apiFormat: 'openai-completions',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        reasoning: false,
        contextWindow: 128000,
        maxTokens: 16384,
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        reasoning: true,
        contextWindow: 200000,
        maxTokens: 100000,
      },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot / Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiFormat: 'openai-completions',
    models: [
      {
        id: 'kimi-k2.5',
        name: 'Kimi K2.5',
        reasoning: false,
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    apiFormat: 'openai-completions',
    models: [
      {
        id: 'grok-3',
        name: 'Grok 3',
        reasoning: false,
        contextWindow: 131072,
        maxTokens: 8192,
      },
    ],
  },
  {
    id: 'zhipu',
    name: 'Z.AI / 智谱',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiFormat: 'openai-completions',
    models: [
      {
        id: 'glm-4-plus',
        name: 'GLM-4 Plus',
        reasoning: false,
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  },
]

export type SetupStep = 'welcome' | 'model' | 'apikey' | 'workspace' | 'gateway' | 'complete'

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
