import { contextBridge, ipcRenderer, webUtils } from 'electron'

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

const electronAPI = {
  // Gateway
  gateway: {
    getStatus: (): Promise<GatewayStatus> => ipcRenderer.invoke('gateway:status'),
    start: (): Promise<void> => ipcRenderer.invoke('gateway:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('gateway:stop'),
    restart: (): Promise<void> => ipcRenderer.invoke('gateway:restart'),
    getToken: (): Promise<string | null> => ipcRenderer.invoke('gateway:getToken'),
    getPort: (): Promise<number> => ipcRenderer.invoke('gateway:getPort'),
    signDeviceAuth: (params: {
      clientId: string
      clientMode: string
      role: string
      scopes: string[]
      token: string
      nonce?: string
    }): Promise<{
      id: string
      publicKey: string
      signature: string
      signedAt: number
      nonce?: string
    }> => ipcRenderer.invoke('gateway:signDeviceAuth', params),
    onStateChanged: (callback: (state: GatewayState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: GatewayState) => callback(state)
      ipcRenderer.on('gateway:stateChanged', handler)
      return () => ipcRenderer.removeListener('gateway:stateChanged', handler)
    },
    onLog: (callback: (log: GatewayLog) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, log: GatewayLog) => callback(log)
      ipcRenderer.on('gateway:log', handler)
      return () => ipcRenderer.removeListener('gateway:log', handler)
    },
  },

  // Setup
  setup: {
    isFirstRun: (): Promise<boolean> => ipcRenderer.invoke('setup:isFirstRun'),
    getConfigPath: (): Promise<string> => ipcRenderer.invoke('setup:getConfigPath'),
    saveConfig: (config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('setup:saveConfig', config),
    validateApiKey: (params: {
      baseUrl: string
      apiFormat: string
      apiKey: string
      modelId: string
    }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('setup:validateApiKey', params),
    getHomedir: (): Promise<string> => ipcRenderer.invoke('setup:getHomedir'),
    getDefaultWorkspace: (): Promise<string> => ipcRenderer.invoke('setup:getDefaultWorkspace'),
  },

  // Shell
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (folderPath: string): Promise<void> => ipcRenderer.invoke('shell:openPath', folderPath),
  },

  // App
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    checkForUpdate: (): Promise<{ version: string; releaseNotes: string; downloadUrl: string; fileName: string } | null> => ipcRenderer.invoke('app:checkForUpdate'),
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string; downloadUrl: string; fileName: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { version: string; releaseNotes: string; downloadUrl: string; fileName: string }) => callback(info)
      ipcRenderer.on('app:updateAvailable', handler)
      return () => ipcRenderer.removeListener('app:updateAvailable', handler)
    },
    downloadUpdate: (): Promise<void> => ipcRenderer.invoke('app:downloadUpdate'),
    cancelDownload: (): Promise<void> => ipcRenderer.invoke('app:cancelDownload'),
    onDownloadProgress: (callback: (progress: { percent: number; transferredBytes: number; totalBytes: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: { percent: number; transferredBytes: number; totalBytes: number }) => callback(progress)
      ipcRenderer.on('app:downloadProgress', handler)
      return () => ipcRenderer.removeListener('app:downloadProgress', handler)
    },
    installUpdate: (): Promise<void> => ipcRenderer.invoke('app:installUpdate'),
    hideToTray: (): Promise<void> => ipcRenderer.invoke('app:hideToTray'),
    quitApp: (): Promise<void> => ipcRenderer.invoke('app:quitApp'),
    onCloseRequested: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('app:closeRequested', handler)
      return () => ipcRenderer.removeListener('app:closeRequested', handler)
    },
    captureScreen: (): Promise<boolean> => ipcRenderer.invoke('app:captureScreen'),
    startScreenshot: (): Promise<boolean> => ipcRenderer.invoke('app:startScreenshot'),
    onScreenshotCaptured: (callback: (data: { filePath: string; base64: string; fileName: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { filePath: string; base64: string; fileName: string }) => callback(data)
      ipcRenderer.on('screenshot:captured', handler)
      return () => ipcRenderer.removeListener('screenshot:captured', handler)
    },
  },

  // Config
  config: {
    readConfig: (): Promise<Record<string, unknown> | null> => ipcRenderer.invoke('config:readConfig'),
    getApiKey: (profileId: string): Promise<string | null> => ipcRenderer.invoke('config:getApiKey', profileId),
    saveApiKey: (params: { profileId: string; provider: string; key: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('config:saveApiKey', params),
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
    }): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('config:saveModelConfig', params),
    getChannels: (): Promise<Record<string, Record<string, string>>> => ipcRenderer.invoke('config:getChannels'),
    saveChannels: (channels: Record<string, Record<string, string>>): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('config:saveChannels', channels),
    saveWorkspace: (workspace: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('config:saveWorkspace', workspace),
    getTimeout: (): Promise<number> => ipcRenderer.invoke('config:getTimeout'),
    saveTimeout: (ms: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('config:saveTimeout', ms),
    getSkipUpdate: (): Promise<boolean> => ipcRenderer.invoke('config:getSkipUpdate'),
    saveSkipUpdate: (skip: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('config:saveSkipUpdate', skip),
    getAutoCompact: (): Promise<boolean> => ipcRenderer.invoke('config:getAutoCompact'),
    saveAutoCompact: (enabled: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('config:saveAutoCompact', enabled),
    getShellHints: (): Promise<boolean> => ipcRenderer.invoke('config:getShellHints'),
    saveShellHints: (enabled: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('config:saveShellHints', enabled),
    getAvailableModels: (): Promise<{ providerId: string; modelId: string; modelName: string; key: string; providerType: string }[]> =>
      ipcRenderer.invoke('config:getAvailableModels'),
  },

  // Sessions persistence
  sessions: {
    save: (sessions: unknown[]): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('sessions:save', sessions),
    load: (): Promise<unknown[]> => ipcRenderer.invoke('sessions:load'),
  },

  // Dialog
  dialog: {
    selectFolder: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder', defaultPath),
  },

  // File utilities (Electron 32+ removed File.path, use webUtils instead)
  file: {
    getPath: (file: File): string => webUtils.getPathForFile(file),
    copyToWorkspace: (srcPath: string): Promise<{ ok: boolean; destPath?: string; error?: string }> =>
      ipcRenderer.invoke('file:copyToWorkspace', srcPath),
    saveImageFromClipboard: (base64: string, mimeType: string): Promise<{ ok: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('file:saveImageFromClipboard', base64, mimeType),
  },

  // Skills
  skills: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('skills:list'),
    getConfig: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('skills:getConfig'),
    saveConfig: (config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('skills:saveConfig', config),
    canInstall: (skillName: string): Promise<{ canInstall: boolean; reason?: string }> =>
      ipcRenderer.invoke('skills:canInstall', skillName),
    installDep: (skillName: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('skills:installDep', skillName),
  },

  // Pairing
  pairing: {
    list: (): Promise<{ channel: string; requests: { id: string; code: string; createdAt: string; lastSeenAt: string; meta?: Record<string, string> }[] }[]> =>
      ipcRenderer.invoke('pairing:list'),
    approve: (channel: string, code: string): Promise<{ id: string } | null> =>
      ipcRenderer.invoke('pairing:approve', channel, code),
    channels: (): Promise<string[]> =>
      ipcRenderer.invoke('pairing:channels'),
  },

  // Ollama
  ollama: {
    getStatus: (): Promise<{ installed: boolean; running: boolean; version?: string }> =>
      ipcRenderer.invoke('ollama:getStatus'),
    install: (): Promise<void> => ipcRenderer.invoke('ollama:install'),
    start: (): Promise<void> => ipcRenderer.invoke('ollama:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('ollama:stop'),
    listLocalModels: (): Promise<string[]> => ipcRenderer.invoke('ollama:listModels'),
    downloadModel: (modelId: string): Promise<void> => ipcRenderer.invoke('ollama:downloadModel', modelId),
    deleteModel: (modelId: string): Promise<void> => ipcRenderer.invoke('ollama:deleteModel', modelId),
    applyModel: (modelId: string): Promise<void> => ipcRenderer.invoke('ollama:applyModel', modelId),
    getHardwareInfo: (): Promise<{ totalMemory: number; freeMemory: number; gpuName?: string; gpuMemory?: number }> =>
      ipcRenderer.invoke('ollama:getHardware'),
    cancelDownload: (): Promise<void> => ipcRenderer.invoke('ollama:cancelDownload'),
    getModelsDir: (): Promise<string> => ipcRenderer.invoke('ollama:getModelsDir'),
    setModelsDir: (dir: string): Promise<void> => ipcRenderer.invoke('ollama:setModelsDir', dir),
    getInstallDir: (): Promise<string> => ipcRenderer.invoke('ollama:getInstallDir'),
    setInstallDir: (dir: string): Promise<void> => ipcRenderer.invoke('ollama:setInstallDir', dir),
    onProgress: (callback: (state: { id: string; status: string; progress?: number; downloadedBytes?: number; totalBytes?: number; error?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: { id: string; status: string; progress?: number; downloadedBytes?: number; totalBytes?: number; error?: string }) => callback(state)
      ipcRenderer.on('ollama:progress', handler)
      return () => ipcRenderer.removeListener('ollama:progress', handler)
    },
    onStatusChange: (callback: (status: { installed: boolean; running: boolean; version?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: { installed: boolean; running: boolean; version?: string }) => callback(status)
      ipcRenderer.on('ollama:statusChange', handler)
      return () => ipcRenderer.removeListener('ollama:statusChange', handler)
    },
  },

  // Agents
  agents: {
    create: (params: { agentId: string; name: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('agents:create', params),
    delete: (params: { agentId: string }): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('agents:delete', params),
  },

  // ClawWinWeb API proxy
  cww: {
    login: (params: { serverUrl: string; email: string; password: string }) =>
      ipcRenderer.invoke('cww:login', params),
    register: (params: { serverUrl: string; email: string; password: string; nickname?: string; code: string }) =>
      ipcRenderer.invoke('cww:register', params),
    sendCode: (params: { serverUrl: string; email: string }) =>
      ipcRenderer.invoke('cww:sendCode', params),
    fetchModels: (params: { serverUrl: string; token: string }) =>
      ipcRenderer.invoke('cww:fetchModels', params),
    getProfile: (params: { serverUrl: string; token: string }) =>
      ipcRenderer.invoke('cww:getProfile', params),
    createOrder: (params: { serverUrl: string; token: string; amount: number; payType: string }) =>
      ipcRenderer.invoke('cww:createOrder', params),
    checkOrder: (params: { serverUrl: string; token: string; orderNo: string }) =>
      ipcRenderer.invoke('cww:checkOrder', params),
    getState: () =>
      ipcRenderer.invoke('cww:getState'),
    saveState: (state: { email: string; nickname: string; balance: number; serverUrl: string; encPassword?: string }) =>
      ipcRenderer.invoke('cww:saveState', state),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
