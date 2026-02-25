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
  getSkipUpdate: () => Promise<boolean>
  saveSkipUpdate: (skip: boolean) => Promise<{ ok: boolean; error?: string }>
}

interface ElectronSessions {
  save: (sessions: ChatSession[]) => Promise<{ ok: boolean; error?: string }>
  load: () => Promise<ChatSession[]>
}

interface ElectronDialog {
  selectFolder: (defaultPath?: string) => Promise<string | null>
}

interface ElectronFile {
  getPath: (file: File) => string
  copyToWorkspace: (srcPath: string) => Promise<{ ok: boolean; destPath?: string; error?: string }>
  saveImageFromClipboard: (base64: string, mimeType: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>
}

interface ElectronSkills {
  list: () => Promise<SkillInfo[]>
  getConfig: () => Promise<SkillsConfig>
  saveConfig: (config: SkillsConfig) => Promise<{ ok: boolean; error?: string }>
}

interface ElectronPairing {
  list: () => Promise<ChannelPairingGroup[]>
  approve: (channel: string, code: string) => Promise<{ id: string } | null>
  channels: () => Promise<string[]>
}

interface ElectronOllama {
  getStatus: () => Promise<OllamaStatus>
  install: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  listLocalModels: () => Promise<string[]>
  downloadModel: (modelId: string) => Promise<void>
  deleteModel: (modelId: string) => Promise<void>
  applyModel: (modelId: string) => Promise<void>
  getHardwareInfo: () => Promise<HardwareInfo>
  cancelDownload: () => Promise<void>
  getModelsDir: () => Promise<string>
  setModelsDir: (dir: string) => Promise<void>
  onProgress: (callback: (state: LocalModelState) => void) => () => void
  onStatusChange: (callback: (status: OllamaStatus) => void) => () => void
}

export interface UpdateInfo {
  version: string
  releaseNotes: string
  downloadUrl: string
  fileName: string
}

export interface DownloadProgress {
  percent: number
  transferredBytes: number
  totalBytes: number
}

interface ElectronApp {
  getVersion: () => Promise<string>
  checkForUpdate: () => Promise<UpdateInfo | null>
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void
  downloadUpdate: () => Promise<void>
  cancelDownload: () => Promise<void>
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
  installUpdate: () => Promise<void>
  hideToTray: () => Promise<void>
  quitApp: () => Promise<void>
  onCloseRequested: (callback: () => void) => () => void
  captureScreen: () => Promise<boolean>
  startScreenshot: () => Promise<boolean>
  onScreenshotCaptured: (callback: (data: { filePath: string; base64: string; fileName: string }) => void) => () => void
}

interface ElectronAPI {
  gateway: ElectronGateway
  setup: ElectronSetup
  shell: { openExternal: (url: string) => Promise<void>; openPath: (folderPath: string) => Promise<void> }
  app: ElectronApp
  config: ElectronConfig
  sessions: ElectronSessions
  dialog: ElectronDialog
  file: ElectronFile
  skills: ElectronSkills
  pairing: ElectronPairing
  ollama: ElectronOllama
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

export interface ChatAttachment {
  type: 'image' | 'file'
  fileName?: string
  filePath: string       // 本地完整路径
  mimeType?: string
  content?: string       // base64 内容（图片用，发送给 gateway）
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: ChatAttachment[]
  timestamp: number
  status?: 'sending' | 'queued' | 'streaming' | 'done' | 'error'
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
  requiresBins?: string[]
  requiresAnyBin?: boolean
  apiKey?: string
}

export interface SkillEntryConfig {
  enabled?: boolean
  apiKey?: string
  env?: Record<string, string>
  config?: Record<string, string>
}

export type SkillsConfig = Record<string, SkillEntryConfig>

// ===== Ollama / 本地模型 =====

export interface OllamaStatus {
  installed: boolean
  running: boolean
  version?: string
}

export interface LocalModelInfo {
  id: string
  name: string
  description: string
  size: string
  sizeBytes: number
  minMemory: string
  minMemoryBytes: number
  ggufRepo: string
  ggufFile: string
  tags: string[]
}

export interface LocalModelState {
  id: string
  status: 'available' | 'downloading' | 'importing' | 'ready' | 'error'
  progress?: number
  downloadedBytes?: number
  totalBytes?: number
  currentFile?: number
  totalFileCount?: number
  error?: string
}

export interface HardwareInfo {
  totalMemory: number
  freeMemory: number
  gpuName?: string
  gpuMemory?: number
}

// ===== Pairing =====

export interface PairingRequest {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

export interface ChannelPairingGroup {
  channel: string
  requests: PairingRequest[]
}
