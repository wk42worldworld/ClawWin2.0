import { app, BrowserWindow, ipcMain, Menu, shell, globalShortcut } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { GatewayManager } from './gateway-manager'
import { isFirstRun, getOpenclawConfigPath, writeSetupConfig, validateApiKey } from './setup-wizard'
import { getNodePath, getOpenclawPath } from './node-runtime'
import { signDeviceAuth, type DeviceAuthParams } from './device-identity'

let mainWindow: BrowserWindow | null = null
let gatewayManager: GatewayManager | null = null

const DIST = path.join(__dirname, '../dist')
const PRELOAD = path.join(__dirname, 'preload.js')

// Icon path: in packaged app, assets are in resources/; in dev, relative to dist-electron/
function getIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'icon.ico')
  }
  return path.join(__dirname, '../assets/icon.ico')
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

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(DIST, 'index.html'))
  }

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
    await gatewayManager?.start()
  })

  ipcMain.handle('gateway:stop', async () => {
    await gatewayManager?.stop()
  })

  ipcMain.handle('gateway:restart', async () => {
    await gatewayManager?.restart()
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

  // Open folder in file explorer
  ipcMain.handle('shell:openPath', (_event, folderPath: string) => {
    shell.openPath(folderPath)
  })

  // Get app version
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  // Sign device auth for gateway connect handshake
  ipcMain.handle('gateway:signDeviceAuth', (_event, params: DeviceAuthParams) => {
    return signDeviceAuth(params)
  })
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
  createWindow()
  initGatewayManager()

  // Auto-start gateway if not first run
  if (!isFirstRun()) {
    gatewayManager?.start()
  }
})

app.on('window-all-closed', async () => {
  await gatewayManager?.stop()
  app.quit()
})

app.on('before-quit', async () => {
  await gatewayManager?.stop()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
