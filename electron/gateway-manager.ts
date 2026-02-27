import { ChildProcess, spawn, execSync } from 'node:child_process'
import net from 'node:net'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

export type GatewayState = 'starting' | 'ready' | 'error' | 'stopped' | 'restarting'

export interface GatewayManagerOptions {
  nodePath: string
  openclawPath: string
  port: number
  onStateChange: (state: GatewayState) => void
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void
}

export class GatewayManager {
  private process: ChildProcess | null = null
  private state: GatewayState = 'stopped'
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private consecutiveFailures = 0
  private readonly MAX_FAILURES = 12
  private readonly HEALTH_CHECK_INTERVAL = 5000
  private readonly SHUTDOWN_TIMEOUT = 5000
  private stopping = false
  private externalGateway = false
  private isRestarting = false

  // 操作锁：所有生命周期操作串行执行，杜绝并发启动
  private opLock: Promise<void> = Promise.resolve()

  constructor(private opts: GatewayManagerOptions) {}

  getStatus() {
    return {
      state: this.state,
      port: this.opts.port,
    }
  }

  getPort() {
    return this.opts.port
  }

  // ========== 公开方法（通过锁串行化） ==========

  async start(): Promise<void> {
    return this.serialize(() => this.doStart())
  }

  async stop(): Promise<void> {
    return this.serialize(() => this.doStop())
  }

  async restart(): Promise<void> {
    return this.serialize(async () => {
      this.setState('restarting')
      this.log('info', '正在重启 Gateway...')
      this.isRestarting = true
      await this.doStop()
      await this.doStart()
      this.isRestarting = false
    })
  }

  // ========== 内部实现 ==========

  /**
   * 串行化：所有操作排队执行，前一个完成后才执行下一个
   */
  private serialize(fn: () => Promise<void>): Promise<void> {
    const op = this.opLock.then(fn, fn)
    this.opLock = op.catch(() => {})
    return op
  }

  private async doStart(): Promise<void> {
    if (this.state === 'ready' || this.state === 'starting' || this.state === 'restarting') {
      return
    }

    this.stopping = false
    this.setState('starting')

    // 先检测端口是否已被占用（已有 Gateway 在运行）
    const portInUse = await this.isPortInUse(this.opts.port)
    if (portInUse) {
      // 尝试终止残留的旧网关进程，确保使用最新配置
      this.log('info', `检测到端口 ${this.opts.port} 被占用，正在终止旧进程...`)
      await this.killProcessOnPort(this.opts.port)
      // 等待端口释放
      await new Promise(resolve => setTimeout(resolve, 1500))
      const stillInUse = await this.isPortInUse(this.opts.port)
      if (stillInUse) {
        // 先验证是否是真正的 Gateway，再决定复用还是报错
        const isGateway = await this.isRealGateway(this.opts.port)
        if (isGateway) {
          this.log('info', `端口 ${this.opts.port} 上运行着可用的 Gateway，直接复用`)
          this.externalGateway = true
          this.setState('ready')
          this.startHealthCheck()
        } else {
          this.log('error', `端口 ${this.opts.port} 被其他程序占用，无法启动 Gateway`)
          this.setState('error')
        }
        return
      }
    }

    this.externalGateway = false
    this.log('info', `启动 Gateway 进程 (端口: ${this.opts.port})...`)

    try {
      await this.spawnGateway()
      this.startHealthCheck()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log('error', `Gateway 启动失败: ${message}`)
      this.setState('error')
    }
  }

  private async doStop(): Promise<void> {
    this.stopping = true
    this.stopHealthCheck()

    // 如果是外部 Gateway，不需要停止
    if (this.externalGateway) {
      this.externalGateway = false
      this.setState('stopped')
      return
    }

    if (!this.process) {
      this.setState('stopped')
      return
    }

    this.log('info', '正在关闭 Gateway...')

    return new Promise<void>((resolve) => {
      const proc = this.process
      if (!proc) {
        this.setState('stopped')
        resolve()
        return
      }

      const forceKillTimer = setTimeout(() => {
        this.log('warn', 'Gateway 未在超时内退出，强制终止')
        try {
          proc.kill('SIGKILL')
        } catch {
          // ignore
        }
      }, this.SHUTDOWN_TIMEOUT)

      proc.once('exit', () => {
        clearTimeout(forceKillTimer)
        this.process = null
        this.setState('stopped')
        this.log('info', 'Gateway 已关闭')
        resolve()
      })

      try {
        proc.kill()
      } catch {
        clearTimeout(forceKillTimer)
        this.process = null
        this.setState('stopped')
        resolve()
      }
    })
  }

  private setState(state: GatewayState) {
    this.state = state
    this.opts.onStateChange(state)
  }

  private log(level: 'info' | 'warn' | 'error', message: string) {
    this.opts.onLog(level, message)
  }

  /**
   * 检测端口是否已被占用（TCP 层面）
   */
  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(2000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
      socket.connect(port, '127.0.0.1')
    })
  }

  /**
   * 尝试 HTTP 请求验证端口上运行的是否是真正的 Gateway
   */
  private isRealGateway(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 3000 }, (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      })
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
      req.on('error', () => {
        resolve(false)
      })
    })
  }

  /**
   * 从配置文件读取 gateway token
   */
  private readGatewayToken(): string | null {
    try {
      const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return config?.gateway?.auth?.token ?? null
      }
    } catch {
      // ignore
    }
    return null
  }

  private async spawnGateway(): Promise<void> {
    // 防止进程泄露：如果有残留进程先终止
    if (this.process) {
      this.log('warn', '检测到残留进程，先终止')
      try { this.process.kill() } catch { /* ignore */ }
      this.process = null
    }

    const entryScript = this.findEntryScript()
    const token = this.readGatewayToken()

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      NODE_ENV: 'production',
      OPENCLAW_NO_RESPAWN: '1',
      OPENCLAW_NODE_OPTIONS_READY: '1',
      OPENCLAW_GATEWAY_PORT: String(this.opts.port),
    }

    if (token) {
      env.OPENCLAW_GATEWAY_TOKEN = token
    }

    // Set OPENCLAW_HOME to user's home directory (not .openclaw subdir)
    // Original openclaw treats OPENCLAW_HOME as the base home directory,
    // and derives state dir as $OPENCLAW_HOME/.openclaw/
    env.OPENCLAW_HOME = os.homedir()

    this.log('info', `node: ${this.opts.nodePath}`)
    this.log('info', `entry: ${entryScript}`)
    this.log('info', `cwd: ${this.opts.openclawPath}`)

    this.process = spawn(
      this.opts.nodePath,
      [
        '--disable-warning=ExperimentalWarning',
        entryScript,
        'gateway',
        '--port', String(this.opts.port),
      ],
      {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.opts.openclawPath,
        windowsHide: true,
      }
    )

    this.process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.log('info', line)
      }
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        this.log('warn', line)
      }
    })

    this.process.on('exit', (code, signal) => {
      if (!this.stopping) {
        this.log('warn', `Gateway 进程已退出 (code: ${code}, signal: ${signal})`)
        this.setState('error')
      }
      this.process = null
    })

    this.process.on('error', (err) => {
      this.log('error', `Gateway 进程错误: ${err.message}`)
      this.setState('error')
      this.process = null
    })
  }

  private findEntryScript(): string {
    const candidates = [
      path.join(this.opts.openclawPath, 'dist', 'entry.js'),
      path.join(this.opts.openclawPath, 'dist', 'index.js'),
      path.join(this.opts.openclawPath, 'openclaw.mjs'),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }

    this.log('error', `未找到 openclaw 入口文件，搜索路径: ${candidates.join(', ')}`)
    throw new Error(`openclaw 未安装或入口文件缺失: ${this.opts.openclawPath}`)
  }

  private startHealthCheck() {
    this.consecutiveFailures = 0
    this.stopHealthCheck()

    // 如果是外部 Gateway，立即检查；重启时旧进程已干净关闭，只需短延迟；冷启动需要较长等待
    const initialDelay = this.externalGateway ? 500 : this.isRestarting ? 3000 : 10000
    setTimeout(() => {
      this.performHealthCheck()
      this.healthCheckTimer = setInterval(() => {
        this.performHealthCheck()
      }, this.HEALTH_CHECK_INTERVAL)
    }, initialDelay)
  }

  private stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * 健康检查：用 HTTP 请求验证 Gateway 是否可用
   */
  private performHealthCheck() {
    if (this.stopping) {
      return
    }

    const req = http.get(`http://127.0.0.1:${this.opts.port}/health`, { timeout: 3000 }, (res) => {
      res.resume()
      if (res.statusCode === 200) {
        this.consecutiveFailures = 0
        if (this.state !== 'ready') {
          this.setState('ready')
          this.log('info', 'Gateway 已就绪')
        }
      } else {
        this.onHealthCheckFailed(`HTTP ${res.statusCode}`)
      }
    })

    req.on('timeout', () => {
      req.destroy()
      this.onHealthCheckFailed('超时')
    })

    req.on('error', (err) => {
      this.onHealthCheckFailed(err.message)
    })
  }

  private onHealthCheckFailed(reason: string) {
    this.consecutiveFailures++

    if (this.consecutiveFailures <= 2 || this.consecutiveFailures % 5 === 0) {
      this.log('warn', `健康检查失败 (${this.consecutiveFailures}/${this.MAX_FAILURES}): ${reason}`)
    }

    if (this.consecutiveFailures >= this.MAX_FAILURES && !this.stopping) {
      if (this.externalGateway) {
        this.log('error', '外部 Gateway 不可达')
        this.setState('error')
      } else {
        this.log('error', '连续健康检查失败，自动重启 Gateway...')
        // 通过 serialize 排队，不会与其他操作并发
        this.restart()
      }
    }
  }

  /**
   * 终止占用指定端口的进程
   */
  private async killProcessOnPort(port: number): Promise<void> {
    try {
      if (process.platform === 'win32') {
        // Windows: 通过 netstat 找到占用端口的 PID 并终止
        // 注意：不使用管道命令（findstr 无匹配时 EPIPE 会导致未捕获异常）
        let output = ''
        try {
          output = execSync('netstat -ano', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
        } catch {
          // netstat 失败，跳过
          return
        }
        const pids = new Set<string>()
        const portStr = `:${port}`
        for (const line of output.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed.includes('LISTENING') || !trimmed.includes(portStr)) continue
          const parts = trimmed.split(/\s+/)
          const pid = parts[parts.length - 1]
          if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
        }
        for (const pid of pids) {
          try {
            execSync(`taskkill /PID ${pid} /F`, { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
            this.log('info', `已终止旧 Gateway 进程 (PID: ${pid})`)
          } catch {
            // 进程可能已退出
          }
        }
      } else {
        // macOS / Linux: 通过 lsof 找到占用端口的 PID 并终止
        try {
          const output = execSync(
            `lsof -ti :${port}`,
            { encoding: 'utf-8', timeout: 5000 }
          )
          for (const pid of output.trim().split('\n').filter(Boolean)) {
            try {
              process.kill(Number(pid), 'SIGTERM')
              this.log('info', `已终止旧 Gateway 进程 (PID: ${pid})`)
            } catch {
              // 进程可能已退出
            }
          }
        } catch {
          // lsof 没找到进程
        }
      }
    } catch {
      // 找不到进程或命令执行失败，忽略
    }
  }
}
