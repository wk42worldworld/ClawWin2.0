import { contextBridge, ipcRenderer } from 'electron'

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
  },

  // Config
  config: {
    readConfig: (): Promise<Record<string, unknown> | null> => ipcRenderer.invoke('config:readConfig'),
    getApiKey: (profileId: string): Promise<string | null> => ipcRenderer.invoke('config:getApiKey', profileId),
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
  },

  // Dialog
  dialog: {
    selectFolder: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('dialog:selectFolder', defaultPath),
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
