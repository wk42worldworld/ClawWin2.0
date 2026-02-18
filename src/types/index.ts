// ElectronAPI type - mirrors electron/preload.ts to avoid cross-boundary import
interface ElectronGateway {
  getStatus: () => Promise<GatewayStatus>
  start: () => Promise<void>
  stop: () => Promise<void>
  restart: () => Promise<void>
  getToken: () => Promise<string | null>
  getPort: () => Promise<number>
  signDeviceAuth: (params: {
    clientId: string
    clientMode: string
    role: string
    scopes: string[]
    token: string
    nonce?: string
  }) => Promise<{
    id: string
    publicKey: string
    signature: string
    signedAt: number
    nonce?: string
  }>
  onStateChanged: (callback: (state: GatewayState) => void) => () => void
  onLog: (callback: (log: GatewayLog) => void) => () => void
}

interface ElectronSetup {
  isFirstRun: () => Promise<boolean>
  getConfigPath: () => Promise<string>
  saveConfig: (config: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  validateApiKey: (params: {
    baseUrl: string
    apiFormat: string
    apiKey: string
    modelId: string
  }) => Promise<{ ok: boolean; error?: string }>
  getHomedir: () => Promise<string>
  getDefaultWorkspace: () => Promise<string>
}

interface ElectronConfig {
  readConfig: () => Promise<Record<string, unknown> | null>
  getApiKey: (profileId: string) => Promise<string | null>
  saveModelConfig: (params: {
    provider: string
    modelId: string
    modelName: string
    baseUrl: string
    apiFormat: string
    apiKey: string
    reasoning?: boolean
    contextWindow?: number
    maxTokens?: number
  }) => Promise<{ ok: boolean; error?: string }>
  getChannels: () => Promise<Record<string, Record<string, string>>>
  saveChannels: (channels: Record<string, Record<string, string>>) => Promise<{ ok: boolean; error?: string }>
  saveWorkspace: (workspace: string) => Promise<{ ok: boolean; error?: string }>
  getTimeout: () => Promise<number>
  saveTimeout: (ms: number) => Promise<{ ok: boolean; error?: string }>
}

interface ElectronSessions {
  save: (sessions: ChatSession[]) => Promise<{ ok: boolean; error?: string }>
  load: () => Promise<ChatSession[]>
}

interface ElectronDialog {
  selectFolder: (defaultPath?: string) => Promise<string | null>
}

interface ElectronSkills {
  list: () => Promise<SkillInfo[]>
  getConfig: () => Promise<SkillsConfig>
  saveConfig: (config: SkillsConfig) => Promise<{ ok: boolean; error?: string }>
}

interface ElectronAPI {
  gateway: ElectronGateway
  setup: ElectronSetup
  shell: { openExternal: (url: string) => Promise<void>; openPath: (folderPath: string) => Promise<void> }
  app: { getVersion: () => Promise<string> }
  config: ElectronConfig
  sessions: ElectronSessions
  dialog: ElectronDialog
  skills: ElectronSkills
}

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
  channels?: Record<string, Record<string, string>>
  skills?: SkillsConfig
}

export interface SkillInfo {
  name: string
  description: string
  emoji?: string
  homepage?: string
  source: 'bundled' | 'local' | 'workspace'
  enabled: boolean
  status: 'ready' | 'disabled' | 'blocked' | 'missing'
  missingReason?: string
  os?: string[]
  primaryEnv?: string
  requiresApiKey: boolean
  apiKey?: string
}

export interface SkillEntryConfig {
  enabled?: boolean
  apiKey?: string
  env?: Record<string, string>
  config?: Record<string, string>
}

export type SkillsConfig = Record<string, SkillEntryConfig>
