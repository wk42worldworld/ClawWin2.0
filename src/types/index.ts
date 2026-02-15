import type { ElectronAPI } from '../electron/preload'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export type GatewayState = 'starting' | 'ready' | 'error' | 'stopped' | 'restarting'

export interface GatewayStatus {
  state: GatewayState
  port: number
  error?: string
}

export interface GatewayLog {
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  status?: 'sending' | 'streaming' | 'done' | 'error'
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface ModelProvider {
  id: string
  name: string
  models: ModelInfo[]
  baseUrl: string
  apiFormat: string
}

export interface ModelInfo {
  id: string
  name: string
  reasoning: boolean
  contextWindow: number
  maxTokens: number
}

export interface SetupConfig {
  provider: string
  modelId: string
  modelName: string
  apiKey: string
  baseUrl?: string
  apiFormat?: string
  reasoning?: boolean
  contextWindow?: number
  maxTokens?: number
  workspace?: string
  gatewayPort?: number
  gatewayToken?: string
}
