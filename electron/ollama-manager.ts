import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import https from 'node:https'
import http from 'node:http'
import type { BrowserWindow } from 'electron'

// 预置模型列表 - 从 hf-mirror.com 下载 GGUF（按推荐度排序，最新最强在前）
const LOCAL_MODELS = [
  // ===== 推荐首选（8GB 内存） =====
  {
    id: 'qwen3:8b',
    name: 'Qwen3 8B',
    description: '最新通义千问3，思考+对话双模式，中文最强',
    size: '5.0GB',
    sizeBytes: 5_368_000_000,
    minMemory: '8GB',
    minMemoryBytes: 8_589_934_592,
    ggufRepo: 'Qwen/Qwen3-8B-GGUF',
    ggufFile: 'qwen3-8b-q4_k_m.gguf',
    tags: ['推荐', '中文强', '推理'],
  },
  {
    id: 'glm-z1:9b',
    name: 'GLM-Z1 9B',
    description: '智谱深度推理模型，数学能力极强，中文优秀',
    size: '6.2GB',
    sizeBytes: 6_656_000_000,
    minMemory: '8GB',
    minMemoryBytes: 8_589_934_592,
    ggufRepo: 'bartowski/THUDM_GLM-Z1-9B-0414-GGUF',
    ggufFile: 'THUDM_GLM-Z1-9B-0414-Q4_K_M.gguf',
    tags: ['推理', '中文强'],
  },
  {
    id: 'deepseek-r1:7b',
    name: 'DeepSeek-R1 7B',
    description: '深度推理蒸馏版，数学/代码/逻辑推理强',
    size: '4.7GB',
    sizeBytes: 5_046_000_000,
    minMemory: '8GB',
    minMemoryBytes: 8_589_934_592,
    ggufRepo: 'unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF',
    ggufFile: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    tags: ['推理'],
  },
  // ===== 进阶选择（16GB 内存） =====
  {
    id: 'qwen3:14b',
    name: 'Qwen3 14B',
    description: '更强的 Qwen3，效果显著提升，推荐 16GB 用户',
    size: '9.0GB',
    sizeBytes: 9_660_000_000,
    minMemory: '16GB',
    minMemoryBytes: 17_179_869_184,
    ggufRepo: 'Qwen/Qwen3-14B-GGUF',
    ggufFile: 'qwen3-14b-q4_k_m.gguf',
    tags: ['推荐', '中文强', '推理'],
  },
  {
    id: 'deepseek-r1:14b',
    name: 'DeepSeek-R1 14B',
    description: '更强推理蒸馏版，复杂任务首选',
    size: '9.0GB',
    sizeBytes: 9_660_000_000,
    minMemory: '16GB',
    minMemoryBytes: 17_179_869_184,
    ggufRepo: 'unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF',
    ggufFile: 'DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
    tags: ['推理'],
  },
  {
    id: 'gemma3:12b',
    name: 'Gemma 3 12B',
    description: 'Google 最新开源模型，128K 上下文，多语言',
    size: '7.3GB',
    sizeBytes: 7_840_000_000,
    minMemory: '10GB',
    minMemoryBytes: 10_737_418_240,
    ggufRepo: 'unsloth/gemma-3-12b-it-GGUF',
    ggufFile: 'gemma-3-12b-it-Q4_K_M.gguf',
    tags: ['多语言'],
  },
  // ===== 高配选择（24GB+ 内存） =====
  {
    id: 'qwen3:32b',
    name: 'Qwen3 32B',
    description: '大参数 Qwen3，各项能力大幅提升',
    size: '19.8GB',
    sizeBytes: 21_260_000_000,
    minMemory: '24GB',
    minMemoryBytes: 25_769_803_776,
    ggufRepo: 'Qwen/Qwen3-32B-GGUF',
    ggufFile: 'Qwen3-32B-Q4_K_M.gguf',
    tags: ['高配', '推理', '中文强'],
  },
  {
    id: 'qwen3:30b-a3b',
    name: 'Qwen3 30B-A3B',
    description: 'MoE 架构，30B 参数仅需 3B 运算，性价比极高',
    size: '18.6GB',
    sizeBytes: 19_972_000_000,
    minMemory: '24GB',
    minMemoryBytes: 25_769_803_776,
    ggufRepo: 'Qwen/Qwen3-30B-A3B-GGUF',
    ggufFile: 'qwen3-30b-a3b-q4_k_m.gguf',
    tags: ['高配', 'MoE', '推理'],
  },
  {
    id: 'glm4.7-flash:30b',
    name: 'GLM-4.7 Flash',
    description: '智谱最强开源模型，MoE 架构，AIME 91.6分',
    size: '18.3GB',
    sizeBytes: 19_650_000_000,
    minMemory: '24GB',
    minMemoryBytes: 25_769_803_776,
    ggufRepo: 'unsloth/GLM-4.7-Flash-GGUF',
    ggufFile: 'GLM-4.7-Flash-Q4_K_M.gguf',
    tags: ['高配', 'MoE', '推理', '中文强'],
  },
  {
    id: 'deepseek-r1:32b',
    name: 'DeepSeek-R1 32B',
    description: '最强推理蒸馏版，接近 GPT-4o 推理水平',
    size: '19.9GB',
    sizeBytes: 21_370_000_000,
    minMemory: '24GB',
    minMemoryBytes: 25_769_803_776,
    ggufRepo: 'unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF',
    ggufFile: 'DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf',
    tags: ['高配', '推理'],
  },
  // ===== 专业级（48-64GB 内存） =====
  {
    id: 'llama3.3:70b',
    name: 'Llama 3.3 70B',
    description: 'Meta 最强开源模型，综合能力强',
    size: '42.5GB',
    sizeBytes: 45_618_000_000,
    minMemory: '48GB',
    minMemoryBytes: 51_539_607_552,
    ggufRepo: 'bartowski/Llama-3.3-70B-Instruct-GGUF',
    ggufFile: 'Llama-3.3-70B-Instruct-Q4_K_M.gguf',
    tags: ['专业级', '英文强'],
  },
  {
    id: 'llama4-scout:109b',
    name: 'Llama 4 Scout 109B',
    description: 'Meta 最新 MoE 模型，10M 上下文，多模态',
    size: '65.4GB',
    sizeBytes: 70_214_000_000,
    minMemory: '80GB',
    minMemoryBytes: 85_899_345_920,
    ggufRepo: 'unsloth/Llama-4-Scout-17B-16E-Instruct-GGUF',
    ggufFile: '',
    ggufSubfolder: 'Q4_K_M',
    ggufFilePattern: 'Llama-4-Scout-17B-16E-Instruct-Q4_K_M',
    ggufFileParts: 2,
    tags: ['专业级', 'MoE'],
  },
  // ===== 旗舰级（128GB+ 内存） =====
  {
    id: 'qwen3:235b-a22b',
    name: 'Qwen3 235B-A22B',
    description: '通义千问旗舰 MoE，235B 参数 22B 激活，最强中文',
    size: '142GB',
    sizeBytes: 152_500_000_000,
    minMemory: '192GB',
    minMemoryBytes: 206_158_430_208,
    ggufRepo: 'unsloth/Qwen3-235B-A22B-GGUF',
    ggufFile: '',
    ggufSubfolder: 'Q4_K_M',
    ggufFilePattern: 'Qwen3-235B-A22B-Q4_K_M',
    ggufFileParts: 3,
    tags: ['旗舰', 'MoE', '推理', '中文强'],
  },
  {
    id: 'glm-4.7:358b',
    name: 'GLM-4.7 358B',
    description: '智谱旗舰 MoE 模型，全面超越 GPT-4o',
    size: '216GB',
    sizeBytes: 231_900_000_000,
    minMemory: '256GB',
    minMemoryBytes: 274_877_906_944,
    ggufRepo: 'unsloth/GLM-4.7-GGUF',
    ggufFile: '',
    ggufSubfolder: 'Q4_K_M',
    ggufFilePattern: 'GLM-4.7-Q4_K_M',
    ggufFileParts: 5,
    tags: ['旗舰', 'MoE', '推理', '中文强'],
  },
  {
    id: 'deepseek-r1:671b',
    name: 'DeepSeek-R1 671B',
    description: 'DeepSeek 满血版，最强开源推理模型',
    size: '404GB',
    sizeBytes: 433_800_000_000,
    minMemory: '512GB',
    minMemoryBytes: 549_755_813_888,
    ggufRepo: 'unsloth/DeepSeek-R1-GGUF',
    ggufFile: '',
    ggufSubfolder: 'DeepSeek-R1-Q4_K_M',
    ggufFilePattern: 'DeepSeek-R1-Q4_K_M',
    ggufFileParts: 9,
    tags: ['旗舰', 'MoE', '推理'],
  },
  {
    id: 'glm-5:744b',
    name: 'GLM-5 744B',
    description: '智谱最新旗舰，744B MoE，开源最强之一',
    size: '456GB',
    sizeBytes: 489_600_000_000,
    minMemory: '512GB',
    minMemoryBytes: 549_755_813_888,
    ggufRepo: 'unsloth/GLM-5-GGUF',
    ggufFile: '',
    ggufSubfolder: 'Q4_K_M',
    ggufFilePattern: 'GLM-5-Q4_K_M',
    ggufFileParts: 11,
    tags: ['旗舰', 'MoE', '推理', '中文强'],
  },
  {
    id: 'kimi-k2:1t',
    name: 'Kimi K2 1T',
    description: 'Moonshot 旗舰，1万亿参数 MoE，32B 激活',
    size: '621GB',
    sizeBytes: 666_900_000_000,
    minMemory: '768GB',
    minMemoryBytes: 824_633_720_832,
    ggufRepo: 'unsloth/Kimi-K2-Instruct-GGUF',
    ggufFile: '',
    ggufSubfolder: 'Q4_K_M',
    ggufFilePattern: 'Kimi-K2-Instruct-Q4_K_M',
    ggufFileParts: 13,
    tags: ['旗舰', 'MoE', '中文强'],
  },
  // ===== 轻量选择（4GB 内存） =====
  {
    id: 'qwen2.5:3b',
    name: 'Qwen2.5 3B',
    description: '超轻量通义千问，4GB 内存即可运行',
    size: '2.0GB',
    sizeBytes: 2_150_000_000,
    minMemory: '4GB',
    minMemoryBytes: 4_294_967_296,
    ggufRepo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
    ggufFile: 'qwen2.5-3b-instruct-q4_k_m.gguf',
    tags: ['轻量'],
  },
]

export { LOCAL_MODELS }

export class OllamaManager {
  private ollamaDir: string
  private ollamaExe: string
  private modelsDir: string
  private process: ChildProcess | null = null
  private downloadAbort: AbortController | null = null
  private pullRequest: http.ClientRequest | null = null
  private mainWindow: BrowserWindow | null = null

  // 下载地址列表（按优先级尝试，中国大陆可访问）
  private static OLLAMA_DOWNLOAD_URLS = [
    'https://ollama.com/download/ollama-windows-amd64.zip',                         // 官方 CDN
    'https://github.moeyy.xyz/https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip',  // GitHub 镜像代理
    'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip',  // GitHub 原始地址（备选）
  ]

  constructor(ollamaBaseDir?: string) {
    const baseDir = ollamaBaseDir ?? path.join(os.homedir(), '.openclaw')
    this.ollamaDir = path.join(baseDir, 'ollama')
    this.ollamaExe = path.join(this.ollamaDir, 'ollama.exe')
    this.modelsDir = path.join(this.ollamaDir, 'models')

    // 从 clawwin-ui.json 读取已保存的自定义存储目录
    try {
      const uiConfigPath = path.join(os.homedir(), '.openclaw', 'clawwin-ui.json')
      if (fs.existsSync(uiConfigPath)) {
        const uiConfig = JSON.parse(fs.readFileSync(uiConfigPath, 'utf-8'))
        if (uiConfig.ollamaModelsDir && typeof uiConfig.ollamaModelsDir === 'string') {
          this.modelsDir = uiConfig.ollamaModelsDir
        }
      }
    } catch { /* ignore config read errors */ }
  }

  getModelsDir(): string {
    return this.modelsDir
  }

  setModelsDir(dir: string): void {
    this.modelsDir = dir
  }

  setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win
  }

  private sendProgress(state: { id: string; status: string; progress?: number; downloadedBytes?: number; totalBytes?: number; currentFile?: number; totalFileCount?: number; error?: string }) {
    this.mainWindow?.webContents.send('ollama:progress', state)
  }

  private sendStatus(status: { installed: boolean; running: boolean; version?: string }) {
    this.mainWindow?.webContents.send('ollama:statusChange', status)
  }

  async getStatus(): Promise<{ installed: boolean; running: boolean; version?: string }> {
    const installed = fs.existsSync(this.ollamaExe)
    if (!installed) return { installed: false, running: false }

    try {
      const resp = await this.httpGet('http://127.0.0.1:11434/api/version')
      const data = JSON.parse(resp)
      return { installed: true, running: true, version: data.version }
    } catch {
      return { installed: true, running: false }
    }
  }

  async install(): Promise<void> {
    // Ensure directory exists
    fs.mkdirSync(this.ollamaDir, { recursive: true })

    const zipPath = path.join(this.ollamaDir, 'ollama-download.zip')

    // 按优先级依次尝试下载源
    this.sendProgress({ id: '__ollama_install__', status: 'downloading', progress: 0 })

    let lastError: Error | null = null
    for (const url of OllamaManager.OLLAMA_DOWNLOAD_URLS) {
      try {
        await this.downloadFile(url, zipPath, (progress, downloaded, total) => {
          this.sendProgress({ id: '__ollama_install__', status: 'downloading', progress, downloadedBytes: downloaded, totalBytes: total })
        })
        lastError = null
        break
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        // 清理失败的下载文件，尝试下一个源
        try { fs.unlinkSync(zipPath) } catch { /* ignore */ }
        try { fs.unlinkSync(zipPath + '.downloading') } catch { /* ignore */ }
      }
    }
    if (lastError) throw new Error(`所有下载源均失败: ${lastError.message}`)

    // Extract - ollama zip contains ollama.exe at root
    this.sendProgress({ id: '__ollama_install__', status: 'importing', progress: 100 })

    // Use PowerShell to extract on Windows
    await new Promise<void>((resolve, reject) => {
      execFile('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${this.ollamaDir}' -Force`
      ], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // Clean up zip
    try { fs.unlinkSync(zipPath) } catch { /* ignore */ }

    // Verify
    if (!fs.existsSync(this.ollamaExe)) {
      // ollama.exe might be in a subdirectory
      const files = fs.readdirSync(this.ollamaDir, { recursive: true }) as string[]
      const found = files.find(f => f.endsWith('ollama.exe'))
      if (found) {
        const foundPath = path.join(this.ollamaDir, found)
        if (foundPath !== this.ollamaExe) {
          fs.renameSync(foundPath, this.ollamaExe)
        }
      }
    }

    if (!fs.existsSync(this.ollamaExe)) {
      throw new Error('安装失败：未找到 ollama.exe')
    }

    this.sendProgress({ id: '__ollama_install__', status: 'ready', progress: 100 })
    this.sendStatus({ installed: true, running: false })
  }

  async start(): Promise<void> {
    if (!fs.existsSync(this.ollamaExe)) {
      throw new Error('Ollama 未安装')
    }

    // Check if already running
    const status = await this.getStatus()
    if (status.running) return

    // Set OLLAMA_MODELS to our custom directory
    const env = { ...process.env, OLLAMA_MODELS: this.modelsDir }

    this.process = spawn(this.ollamaExe, ['serve'], {
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    this.process.unref()

    // Wait for it to be ready (up to 15 seconds)
    for (let i = 0; i < 30; i++) {
      await this.sleep(500)
      try {
        await this.httpGet('http://127.0.0.1:11434/api/version')
        const newStatus = await this.getStatus()
        this.sendStatus(newStatus)
        return
      } catch { /* not ready yet */ }
    }

    throw new Error('Ollama 启动超时')
  }

  async stop(): Promise<void> {
    if (this.process) {
      try { this.process.kill() } catch { /* ignore */ }
      this.process = null
    }
    // Also try to stop any running ollama serve
    try {
      execFile('taskkill', ['/F', '/IM', 'ollama.exe'], () => {})
    } catch { /* ignore */ }
    this.sendStatus({ installed: fs.existsSync(this.ollamaExe), running: false })
  }

  async listLocalModels(): Promise<string[]> {
    try {
      const resp = await this.httpGet('http://127.0.0.1:11434/api/tags')
      const data = JSON.parse(resp)
      return (data.models || []).map((m: { name: string }) => m.name)
    } catch {
      return []
    }
  }

  async downloadModel(modelId: string): Promise<void> {
    // Ensure ollama is running
    const status = await this.getStatus()
    if (!status.running) {
      await this.start()
    }

    this.sendProgress({ id: modelId, status: 'downloading', progress: 0 })

    // 使用 Ollama 原生 Pull API 下载模型（从 Ollama CDN 直接拉取，无需 HuggingFace 镜像）
    return new Promise<void>((resolve, reject) => {
      let resolved = false
      const postData = JSON.stringify({ name: modelId })
      const req = http.request({
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/pull',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let body = ''
          res.on('data', (chunk) => { body += chunk })
          res.on('end', () => {
            const msg = body || `HTTP ${res.statusCode}`
            this.sendProgress({ id: modelId, status: 'error', error: msg })
            reject(new Error(msg))
          })
          return
        }

        let buffer = ''
        res.on('data', (chunk: Buffer) => {
          if (resolved) return
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.trim() || resolved) continue
            try {
              const data = JSON.parse(line)
              if (data.status === 'success') {
                resolved = true
                this.sendProgress({ id: modelId, status: 'ready', progress: 100 })
                resolve()
                return
              }
              if (data.error) {
                resolved = true
                this.sendProgress({ id: modelId, status: 'error', error: data.error })
                reject(new Error(data.error))
                return
              }
              if (data.total && data.completed !== undefined) {
                const progress = Math.round((data.completed / data.total) * 100)
                this.sendProgress({
                  id: modelId,
                  status: 'downloading',
                  progress,
                  downloadedBytes: data.completed,
                  totalBytes: data.total,
                })
              }
            } catch { /* ignore partial JSON */ }
          }
        })

        res.on('end', () => {
          if (resolved) return
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer)
              if (data.status === 'success') {
                resolved = true
                this.sendProgress({ id: modelId, status: 'ready', progress: 100 })
                resolve()
                return
              }
              if (data.error) {
                resolved = true
                reject(new Error(data.error))
                return
              }
            } catch { /* ignore */ }
          }
          if (!resolved) {
            resolved = true
            this.sendProgress({ id: modelId, status: 'ready', progress: 100 })
            resolve()
          }
        })

        res.on('error', (err) => {
          if (!resolved) {
            resolved = true
            reject(err)
          }
        })
      })

      this.pullRequest = req
      req.on('error', (err) => {
        if (!resolved) {
          resolved = true
          this.sendProgress({ id: modelId, status: 'error', error: err.message })
          reject(err)
        }
      })
      req.write(postData)
      req.end()
    }).finally(() => {
      this.pullRequest = null
    })
  }

  async deleteModel(modelId: string): Promise<void> {
    try {
      // Ollama API 同时接受 name 和 model 字段，发送两个确保兼容
      await this.httpRequest('http://127.0.0.1:11434/api/delete', 'DELETE', JSON.stringify({ name: modelId, model: modelId }))
    } catch (err) {
      throw new Error(`删除模型失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async applyModel(modelId: string): Promise<void> {
    // Write to openclaw.json to use this local model
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    const configDir = path.dirname(configPath)
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })

    const config = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      : {}

    const modelDef = LOCAL_MODELS.find(m => m.id === modelId)
    const displayName = modelDef?.name ?? modelId
    const now = new Date().toISOString()

    // Update agents.defaults.model.primary
    if (!config.agents) config.agents = {}
    if (!config.agents.defaults) config.agents.defaults = {}
    if (!config.agents.defaults.model) config.agents.defaults.model = {}
    config.agents.defaults.model.primary = `ollama/${modelId}`

    // Update agents.defaults.models
    if (!config.agents.defaults.models) config.agents.defaults.models = {}
    config.agents.defaults.models[`ollama/${modelId}`] = { alias: displayName }

    // Update models.providers.ollama
    if (!config.models) config.models = { mode: 'merge' }
    if (!config.models.providers) config.models.providers = {}
    config.models.providers.ollama = {
      baseUrl: 'http://127.0.0.1:11434/v1',
      api: 'openai-completions',
      models: [{
        id: modelId,
        name: displayName,
        reasoning: modelId.includes('r1'),
        input: ['text'],
        contextWindow: 32768,
        maxTokens: 8192,
      }],
    }

    // Auth profile for ollama (no API key needed, but entry required)
    if (!config.auth) config.auth = {}
    if (!config.auth.profiles) config.auth.profiles = {}
    config.auth.profiles['ollama:default'] = {
      provider: 'ollama',
      mode: 'api_key',
    }

    if (!config.meta) config.meta = {}
    config.meta.lastTouchedAt = now

    // 使用本地模型时，禁用需要云端 API Key 的内置功能（session-memory 需要 Voyage 嵌入 API）
    if (!config.hooks) config.hooks = {}
    if (!config.hooks.internal) config.hooks.internal = { enabled: true, entries: {} }
    if (!config.hooks.internal.entries) config.hooks.internal.entries = {}
    config.hooks.internal.entries['session-memory'] = { enabled: false }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // Write auth-profiles.json with dummy key for ollama
    const authFile = path.join(os.homedir(), '.openclaw', 'auth-profiles.json')
    let existingAuth: Record<string, unknown> = { profiles: {} }
    if (fs.existsSync(authFile)) {
      try { existingAuth = JSON.parse(fs.readFileSync(authFile, 'utf-8')) } catch { /* ignore */ }
    }
    if (!existingAuth.profiles || typeof existingAuth.profiles !== 'object') {
      existingAuth.profiles = {}
    }
    ;(existingAuth.profiles as Record<string, unknown>)['ollama:default'] = {
      provider: 'ollama',
      type: 'api_key',
      key: 'ollama',
    }
    const authJson = JSON.stringify(existingAuth, null, 2)
    fs.writeFileSync(authFile, authJson, 'utf-8')
    // Also write to agent directory
    const agentDir = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent')
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(agentDir, 'auth-profiles.json'), authJson, 'utf-8')
  }

  cancelDownload(): void {
    if (this.pullRequest) {
      this.pullRequest.destroy()
      this.pullRequest = null
    }
    if (this.downloadAbort) {
      this.downloadAbort.abort()
      this.downloadAbort = null
    }
  }

  async getHardwareInfo(): Promise<{ totalMemory: number; freeMemory: number; gpuName?: string; gpuMemory?: number }> {
    const totalMemory = os.totalmem()
    const freeMemory = os.freemem()

    // Try to detect GPU via WMIC on Windows
    let gpuName: string | undefined
    let gpuMemory: number | undefined

    try {
      const gpuInfo = await new Promise<string>((resolve, reject) => {
        execFile('wmic', ['path', 'win32_VideoController', 'get', 'Name,AdapterRAM', '/format:csv'], (err, stdout) => {
          if (err) reject(err)
          else resolve(stdout)
        })
      })

      const lines = gpuInfo.split('\n').filter(l => l.trim())
      for (const line of lines) {
        const parts = line.split(',')
        if (parts.length >= 3) {
          const ram = parseInt(parts[1])
          const name = parts[2]?.trim()
          if (name && name !== 'Name' && ram > 0) {
            gpuName = name
            gpuMemory = ram
            break
          }
        }
      }
    } catch { /* ignore GPU detection failure */ }

    return { totalMemory, freeMemory, gpuName, gpuMemory }
  }

  // --- Private helpers ---

  private async downloadFile(
    url: string,
    dest: string,
    onProgress: (percent: number, downloaded: number, total: number) => void
  ): Promise<void> {
    this.downloadAbort = new AbortController()
    const signal = this.downloadAbort.signal

    // Support resume
    let startByte = 0
    const partialPath = dest + '.downloading'
    if (fs.existsSync(partialPath)) {
      startByte = fs.statSync(partialPath).size
    }

    return new Promise((resolve, reject) => {
      const doRequest = (reqUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('Too many redirects'))
          return
        }

        const isHttps = reqUrl.startsWith('https')
        const mod = isHttps ? https : http
        const headers: Record<string, string> = {}
        if (startByte > 0) {
          headers['Range'] = `bytes=${startByte}-`
        }

        const req = mod.get(reqUrl, { headers, signal: signal as unknown as AbortSignal }, (res) => {
          // Handle redirects
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location
            if (redirectUrl.startsWith('/')) {
              const parsed = new URL(reqUrl)
              redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`
            }
            doRequest(redirectUrl, redirectCount + 1)
            return
          }

          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`下载失败: HTTP ${res.statusCode}`))
            return
          }

          const totalStr = res.headers['content-length']
          const isPartial = res.statusCode === 206
          const contentLength = totalStr ? parseInt(totalStr) : 0
          const totalSize = isPartial ? startByte + contentLength : contentLength

          const file = fs.createWriteStream(partialPath, { flags: isPartial ? 'a' : 'w' })
          let downloaded = isPartial ? startByte : 0

          res.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            file.write(chunk)
            const percent = totalSize > 0 ? Math.round((downloaded / totalSize) * 100) : 0
            onProgress(percent, downloaded, totalSize)
          })

          res.on('end', () => {
            file.end(() => {
              // Rename to final path (with retry for Windows EPERM from antivirus file locks)
              this.renameWithRetry(partialPath, dest)
                .then(() => resolve())
                .catch((err) => reject(err))
            })
          })

          res.on('error', (err) => {
            file.end()
            reject(err)
          })
        })

        req.on('error', (err) => {
          reject(err)
        })
      }

      doRequest(url)
    })
  }

  private httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http
      mod.get(url, { timeout: 3000 }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve(data))
        res.on('error', reject)
      }).on('error', reject)
    })
  }

  private httpRequest(url: string, method: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const mod = parsed.protocol === 'https:' ? https : http
      const bodyBuf = Buffer.from(body, 'utf-8')
      const req = mod.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
        },
        timeout: 5000,
      }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data)
          } else {
            reject(new Error(data || `HTTP ${res.statusCode}`))
          }
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.write(bodyBuf)
      req.end()
    })
  }

  /**
   * Rename file with retry mechanism for Windows EPERM errors (antivirus file locks).
   * Tries renameSync up to 3 times with 500ms delay, then falls back to copyFileSync + unlinkSync.
   */
  private async renameWithRetry(src: string, dest: string, retries = 3, delayMs = 500): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        fs.renameSync(src, dest)
        return
      } catch (err: unknown) {
        const isEPERM = err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EPERM'
        if (!isEPERM || attempt === retries) {
          // Not an EPERM error, or final retry exhausted — try copy fallback
          break
        }
        await this.sleep(delayMs)
      }
    }

    // Fallback: copy then delete source
    try {
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      fs.copyFileSync(src, dest)
      try { fs.unlinkSync(src) } catch { /* ignore cleanup failure */ }
    } catch (err) {
      throw new Error(`文件重命名失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
