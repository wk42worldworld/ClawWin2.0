import { app, BrowserWindow, ipcMain, Menu, shell, globalShortcut, Tray, dialog, clipboard, nativeImage } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { GatewayManager } from './gateway-manager'
import { isFirstRun, getOpenclawConfigPath, writeSetupConfig, validateApiKey } from './setup-wizard'
import { getNodePath, getOpenclawPath } from './node-runtime'
import { signDeviceAuth, type DeviceAuthParams } from './device-identity'
import { scanSkills, getSkillsConfig, saveSkillsConfig } from './skills-scanner'
import { OllamaManager } from './ollama-manager'
import { checkForUpdate, downloadUpdate, installUpdate, cancelDownload, type UpdateInfo } from './update-checker'

let mainWindow: BrowserWindow | null = null
let gatewayManager: GatewayManager | null = null
let tray: Tray | null = null
let isQuitting = false
let pendingUpdateInfo: UpdateInfo | null = null
let downloadedInstallerPath: string | null = null
let ollamaManager: OllamaManager | null = null

const DIST = path.join(__dirname, '../dist')
const PRELOAD = path.join(__dirname, 'preload.js')

// Icon path: in packaged app, assets are in resources/; in dev, relative to dist-electron/
function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'icon.ico')
  }
  return path.join(__dirname, '../assets/icon.ico')
}

function createTray() {
  const iconPath = getIconPath()
  tray = new Tray(iconPath)
  tray.setToolTip('ClawWin')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: async () => {
        isQuitting = true
        try {
          await gatewayManager?.stop()
        } catch { /* ignore */ }
        tray?.destroy()
        tray = null
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function createWindow() {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 1100,
    minHeight: 780,
    title: 'ClawWin',
    icon: getIconPath(),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#2D2D2D',
      symbolColor: '#ffffff',
      height: 36,
    },
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 注册 DevTools 快捷键（Ctrl+Shift+I 和 F12）
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      input.key === 'F12'
    ) {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // Fallback: show window after timeout even if ready-to-show hasn't fired
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 5000)

  // Show window on load failure
  mainWindow.webContents.on('did-fail-load', () => {
    mainWindow?.show()
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 右键上下文菜单（复制、粘贴、剪切、全选）
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []

    if (params.isEditable) {
      // 输入框：剪切、复制、粘贴、全选
      menuItems.push(
        { label: '剪切', role: 'cut', enabled: params.editFlags.canCut },
        { label: '复制', role: 'copy', enabled: params.editFlags.canCopy },
        { label: '粘贴', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: '全选', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      )
    } else if (params.selectionText) {
      // 有选中文字：复制、全选
      menuItems.push(
        { label: '复制', role: 'copy' },
        { type: 'separator' },
        { label: '全选', role: 'selectAll' },
      )
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'))
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupIPC() {
  // Gateway status query
  ipcMain.handle('gateway:status', () => {
    return gatewayManager?.getStatus() ?? { state: 'stopped', port: 0 }
  })

  // Gateway start/stop/restart
  ipcMain.handle('gateway:start', async () => {
    try { await gatewayManager?.start() } catch (err) { console.error('gateway:start failed:', err) }
  })

  ipcMain.handle('gateway:stop', async () => {
    try { await gatewayManager?.stop() } catch (err) { console.error('gateway:stop failed:', err) }
  })

  ipcMain.handle('gateway:restart', async () => {
    try { await gatewayManager?.restart() } catch (err) { console.error('gateway:restart failed:', err) }
  })

  // First run detection
  ipcMain.handle('setup:isFirstRun', () => {
    return isFirstRun()
  })

  // Get config path
  ipcMain.handle('setup:getConfigPath', () => {
    return getOpenclawConfigPath()
  })

  // Save config from setup wizard
  ipcMain.handle('setup:saveConfig', (_event, config: Record<string, unknown>) => {
    return writeSetupConfig(config)
  })

  // Validate API key
  ipcMain.handle('setup:validateApiKey', (_event, params: {
    baseUrl: string
    apiFormat: string
    apiKey: string
    modelId: string
  }) => {
    return validateApiKey(params)
  })

  // Get user home directory
  ipcMain.handle('setup:getHomedir', () => {
    return os.homedir()
  })

  // Get default workspace path
  ipcMain.handle('setup:getDefaultWorkspace', () => {
    return path.join(os.homedir(), 'openclaw')
  })

  // Get gateway token from config
  ipcMain.handle('gateway:getToken', () => {
    try {
      const configPath = getOpenclawConfigPath()
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return config?.gateway?.auth?.token ?? null
      }
    } catch {
      // ignore
    }
    return null
  })

  // Get gateway port
  ipcMain.handle('gateway:getPort', () => {
    return gatewayManager?.getPort() ?? 39527
  })

  // Open external URL
  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
  })

  // Open path in file explorer or with default app
  ipcMain.handle('shell:openPath', (_event, folderPath: string) => {
    try {
      // Expand ~ to home directory on all platforms
      const resolved = folderPath.replace(/^~/, os.homedir())
      // Only mkdir for paths that don't exist and look like directories (no extension)
      if (!fs.existsSync(resolved)) {
        const hasExt = /\.[^/\\]+$/.test(resolved)
        if (!hasExt) {
          fs.mkdirSync(resolved, { recursive: true })
        }
      }
      shell.openPath(resolved)
    } catch (err) {
      console.error('shell:openPath failed:', err)
    }
  })

  // Get app version
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  // Update checker
  ipcMain.handle('app:downloadUpdate', async () => {
    if (!pendingUpdateInfo) throw new Error('No update available')
    downloadedInstallerPath = await downloadUpdate(pendingUpdateInfo.downloadUrl, pendingUpdateInfo.fileName, (progress) => {
      mainWindow?.webContents.send('app:downloadProgress', progress)
    })
  })

  ipcMain.handle('app:installUpdate', async () => {
    if (!downloadedInstallerPath) throw new Error('No downloaded installer')
    // 先停掉子进程，避免安装程序与残留进程冲突
    try { await gatewayManager?.stop() } catch { /* ignore */ }
    try { await ollamaManager?.stop() } catch { /* ignore */ }
    installUpdate(downloadedInstallerPath)
  })

  ipcMain.handle('app:cancelDownload', () => {
    cancelDownload()
  })

  // 截屏：捕获当前窗口并写入剪贴板
  ipcMain.handle('app:captureScreen', async () => {
    if (!mainWindow) throw new Error('No window')
    const image = await mainWindow.webContents.capturePage()
    clipboard.writeImage(image)
    return true
  })

  // Sign device auth for gateway connect handshake
  ipcMain.handle('gateway:signDeviceAuth', (_event, params: DeviceAuthParams) => {
    try {
      return signDeviceAuth(params)
    } catch (err) {
      console.error('gateway:signDeviceAuth failed:', err)
      throw err
    }
  })

  // ===== Config IPC handlers =====

  // Read full openclaw.json config
  ipcMain.handle('config:readConfig', () => {
    try {
      const configPath = getOpenclawConfigPath()
      if (!fs.existsSync(configPath)) return null
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      return null
    }
  })

  // Get API key for a provider
  ipcMain.handle('config:getApiKey', (_event, profileId: string) => {
    try {
      const authFile = path.join(os.homedir(), '.openclaw', 'auth-profiles.json')
      if (!fs.existsSync(authFile)) return null
      const auth = JSON.parse(fs.readFileSync(authFile, 'utf-8'))
      return auth?.profiles?.[profileId]?.key ?? null
    } catch {
      return null
    }
  })

  // Save model and API key config (merge into existing config)
  ipcMain.handle('config:saveModelConfig', (_event, params: {
    provider: string
    modelId: string
    modelName: string
    baseUrl: string
    apiFormat: string
    apiKey: string
    reasoning?: boolean
    contextWindow?: number
    maxTokens?: number
  }) => {
    try {
      const configPath = getOpenclawConfigPath()
      // Ensure .openclaw directory exists
      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
      const config = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        : {}

      const providerModelKey = `${params.provider}/${params.modelId}`
      const now = new Date().toISOString()

      // Update agents.defaults.model.primary
      if (!config.agents) config.agents = {}
      if (!config.agents.defaults) config.agents.defaults = {}
      if (!config.agents.defaults.model) config.agents.defaults.model = {}
      config.agents.defaults.model.primary = providerModelKey

      // Update agents.defaults.models
      if (!config.agents.defaults.models) config.agents.defaults.models = {}
      config.agents.defaults.models[providerModelKey] = { alias: params.modelName }

      // Update models.providers
      if (!config.models) config.models = { mode: 'merge' }
      if (!config.models.providers) config.models.providers = {}
      config.models.providers[params.provider] = {
        baseUrl: params.baseUrl,
        api: params.apiFormat,
        models: [{
          id: params.modelId,
          name: params.modelName,
          reasoning: params.reasoning ?? false,
          input: ['text'],
          contextWindow: params.contextWindow ?? 200000,
          maxTokens: params.maxTokens ?? 8192,
        }],
      }

      // Update auth.profiles
      if (!config.auth) config.auth = {}
      if (!config.auth.profiles) config.auth.profiles = {}
      config.auth.profiles[`${params.provider}:default`] = {
        provider: params.provider,
        mode: 'api_key',
      }

      // Update meta
      if (!config.meta) config.meta = {}
      config.meta.lastTouchedAt = now

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

      // Write auth-profiles.json (API key)
      if (params.apiKey) {
        const openclawHome = path.join(os.homedir(), '.openclaw')
        const authFile = path.join(openclawHome, 'auth-profiles.json')
        let existingAuth: Record<string, unknown> = { profiles: {} }
        if (fs.existsSync(authFile)) {
          try { existingAuth = JSON.parse(fs.readFileSync(authFile, 'utf-8')) } catch { /* ignore */ }
        }
        if (!existingAuth.profiles || typeof existingAuth.profiles !== 'object') {
          existingAuth.profiles = {}
        }
        ;(existingAuth.profiles as Record<string, unknown>)[`${params.provider}:default`] = {
          provider: params.provider,
          type: 'api_key',
          key: params.apiKey,
        }
        const authJson = JSON.stringify(existingAuth, null, 2)
        fs.writeFileSync(authFile, authJson, 'utf-8')
        // Also write to agent directory
        const agentDir = path.join(openclawHome, 'agents', 'main', 'agent')
        fs.mkdirSync(agentDir, { recursive: true })
        fs.writeFileSync(path.join(agentDir, 'auth-profiles.json'), authJson, 'utf-8')
      }

      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Read channels config
  ipcMain.handle('config:getChannels', () => {
    try {
      const configPath = getOpenclawConfigPath()
      if (!fs.existsSync(configPath)) return {}
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return config?.channels ?? {}
    } catch {
      return {}
    }
  })

  // Save channels config (merge into existing config)
  ipcMain.handle('config:saveChannels', (_event, channels: Record<string, Record<string, string>>) => {
    try {
      const configPath = getOpenclawConfigPath()
      // Ensure .openclaw directory exists
      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
      const config = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        : {}

      if (channels && Object.keys(channels).length > 0) {
        config.channels = channels
      } else {
        delete config.channels
      }

      if (!config.meta) config.meta = {}
      config.meta.lastTouchedAt = new Date().toISOString()

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Save workspace path
  ipcMain.handle('config:saveWorkspace', (_event, workspace: string) => {
    try {
      const configPath = getOpenclawConfigPath()
      // Ensure .openclaw directory exists
      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
      const config = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        : {}

      if (!config.agents) config.agents = {}
      if (!config.agents.defaults) config.agents.defaults = {}
      config.agents.defaults.workspace = workspace

      if (!config.meta) config.meta = {}
      config.meta.lastTouchedAt = new Date().toISOString()

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ClawWin UI config file (separate from openclaw.json to avoid schema conflicts)
  const UI_CONFIG_FILE = path.join(os.homedir(), '.openclaw', 'clawwin-ui.json')

  function readUiConfig(): Record<string, unknown> {
    try {
      if (fs.existsSync(UI_CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(UI_CONFIG_FILE, 'utf-8'))
      }
    } catch { /* ignore */ }
    return {}
  }

  function writeUiConfig(config: Record<string, unknown>) {
    const dir = path.dirname(UI_CONFIG_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(UI_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  }

  // Get response timeout (ms)
  ipcMain.handle('config:getTimeout', () => {
    try {
      const ui = readUiConfig()
      return (ui.responseTimeout as number) ?? 60000
    } catch {
      return 60000
    }
  })

  // Save response timeout (ms)
  ipcMain.handle('config:saveTimeout', (_event, ms: number) => {
    try {
      const ui = readUiConfig()
      ui.responseTimeout = Math.max(15000, Math.min(600000, ms))
      writeUiConfig(ui)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ===== Sessions persistence =====

  const SESSIONS_FILE = path.join(os.homedir(), '.openclaw', 'sessions.json')

  ipcMain.handle('sessions:save', (_event, sessions: unknown[]) => {
    try {
      const dir = path.dirname(SESSIONS_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sessions:load', () => {
    try {
      if (!fs.existsSync(SESSIONS_FILE)) return []
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'))
    } catch {
      return []
    }
  })

  // Copy file to workspace uploads directory (bypass gateway sandbox)
  ipcMain.handle('file:copyToWorkspace', async (_event, srcPath: string) => {
    try {
      const configPath = getOpenclawConfigPath()
      let workspace = path.join(os.homedir(), 'openclaw')
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        workspace = config?.agents?.defaults?.workspace || workspace
      }
      const uploadsDir = path.join(workspace, 'uploads')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

      const baseName = path.basename(srcPath)
      const timestamp = Date.now()
      const destName = `${timestamp}-${baseName}`
      const destPath = path.join(uploadsDir, destName)

      fs.copyFileSync(srcPath, destPath)
      return { ok: true, destPath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Native folder picker dialog
  ipcMain.handle('dialog:selectFolder', async (_event, defaultPath?: string) => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择文件夹',
      defaultPath: defaultPath || os.homedir(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ===== Skills IPC handlers =====
  ipcMain.handle('skills:list', () => {
    try {
      return scanSkills()
    } catch (err) {
      console.error('skills:list failed:', err)
      return []
    }
  })

  ipcMain.handle('skills:getConfig', () => {
    try {
      return getSkillsConfig()
    } catch {
      return {}
    }
  })

  ipcMain.handle('skills:saveConfig', (_event, config: Record<string, unknown>) => {
    return saveSkillsConfig(config as Record<string, { enabled?: boolean; apiKey?: string; env?: Record<string, string> }>)
  })

  // ===== Ollama IPC handlers =====
  ipcMain.handle('ollama:getStatus', () => ollamaManager?.getStatus() ?? { installed: false, running: false })
  ipcMain.handle('ollama:install', async () => { await ollamaManager?.install() })
  ipcMain.handle('ollama:start', async () => { await ollamaManager?.start() })
  ipcMain.handle('ollama:stop', async () => { await ollamaManager?.stop() })
  ipcMain.handle('ollama:listModels', () => ollamaManager?.listLocalModels() ?? [])
  ipcMain.handle('ollama:downloadModel', async (_event, modelId: string) => { await ollamaManager?.downloadModel(modelId) })
  ipcMain.handle('ollama:deleteModel', async (_event, modelId: string) => { await ollamaManager?.deleteModel(modelId) })
  ipcMain.handle('ollama:applyModel', async (_event, modelId: string) => { await ollamaManager?.applyModel(modelId) })
  ipcMain.handle('ollama:getHardware', () => ollamaManager?.getHardwareInfo() ?? { totalMemory: 0, freeMemory: 0 })
  ipcMain.handle('ollama:cancelDownload', () => { ollamaManager?.cancelDownload() })
}

function initGatewayManager() {
  const nodePath = getNodePath()
  const openclawPath = getOpenclawPath()

  gatewayManager = new GatewayManager({
    nodePath,
    openclawPath,
    port: 39527,
    onStateChange: (state) => {
      mainWindow?.webContents.send('gateway:stateChanged', state)
    },
    onLog: (level, message) => {
      mainWindow?.webContents.send('gateway:log', { level, message })
    },
  })
}

app.whenReady().then(async () => {
  setupIPC()
  initGatewayManager()
  ollamaManager = new OllamaManager()

  // Auto-start gateway if not first run (before creating window so state is ready)
  if (!isFirstRun()) {
    gatewayManager?.start()

    // 如果配置的是本地模型（Ollama），自动启动 Ollama 服务
    try {
      const configPath = getOpenclawConfigPath()
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        const primaryModel = config?.agents?.defaults?.model?.primary ?? ''
        if (primaryModel.startsWith('ollama/')) {
          ollamaManager?.start().catch((err) => {
            console.error('Auto-start Ollama failed:', err)
          })
        }
      }
    } catch { /* ignore config read errors */ }
  }

  createWindow()
  ollamaManager?.setMainWindow(mainWindow)
  createTray()

  // 启动后检查更新
  mainWindow?.webContents.on('did-finish-load', () => {
    checkForUpdate().then((info) => {
      if (info) {
        pendingUpdateInfo = info
        mainWindow?.webContents.send('app:updateAvailable', info)
      }
    }).catch(() => { /* 静默失败 */ })
  })
})

app.on('window-all-closed', () => {
  // Don't quit — tray keeps the app alive. Quit is handled by tray menu or app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  // Gateway stop is handled by tray exit handler.
  // This is a fallback for other quit paths (e.g. OS shutdown).
  gatewayManager?.stop().catch(() => {})
  tray?.destroy()
  tray = null
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
