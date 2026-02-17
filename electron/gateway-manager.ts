import { ChildProcess, spawn } from 'node:child_process'
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
  private readonly MAX_FAILURES = 5
  private readonly HEALTH_CHECK_INTERVAL = 5000
  private readonly SHUTDOWN_TIMEOUT = 5000
  private stopping = false
  private externalGateway = false // 是否使用外部已运行的 Gateway

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

  async start(): Promise<void> {
    if (this.state === 'ready' || this.state === 'starting') {
      return
    }

    this.stopping = false
    this.setState('starting')

    // 先检测端口是否已被占用（已有 Gateway 在运行）
    const portInUse = await this.isPortInUse(this.opts.port)
    if (portInUse) {
      this.log('info', `检测到 Gateway 已在端口 ${this.opts.port} 运行，直接连接`)
      this.externalGateway = true
      this.setState('ready')
      this.startHealthCheck()
      return
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

  async stop(): Promise<void> {
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

  async restart(): Promise<void> {
    this.setState('restarting')
    this.log('info', '正在重启 Gateway...')
    await this.stop()
    await this.start()
  }

  private setState(state: GatewayState) {
    this.state = state
    this.opts.onStateChange(state)
  }

  private log(level: 'info' | 'warn' | 'error', message: string) {
    this.opts.onLog(level, message)
  }

  /**
   * 检测端口是否已被真正的 Gateway 占用
   * 不仅检查 TCP 连接，还尝试 HTTP 请求验证是 Gateway
   */
  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      // 先做 TCP 连接检测
      const socket = new net.Socket()
      socket.setTimeout(2000)
      socket.once('connect', () => {
        socket.destroy()
        // TCP 连通了，但可能是其他程序（如 svchost.exe）
        // 尝试 HTTP 请求验证是否是 Gateway
        this.isRealGateway(port).then(resolve)
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
        // 任何 HTTP 响应都说明是一个 HTTP 服务器（可能是 Gateway）
        // Gateway 通常返回 200
        res.resume() // consume response body
        resolve(res.statusCode === 200)
      })
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
      req.on('error', () => {
        // 不是 HTTP 服务器，不是 Gateway
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

    // 如果是外部 Gateway，立即检查；否则等待启动
    const initialDelay = this.externalGateway ? 500 : 5000
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

    // 外部 Gateway 不需要频繁报日志
    if (this.consecutiveFailures <= 2 || this.consecutiveFailures % 5 === 0) {
      this.log('warn', `健康检查失败 (${this.consecutiveFailures}/${this.MAX_FAILURES}): ${reason}`)
    }

    if (this.consecutiveFailures >= this.MAX_FAILURES && !this.stopping) {
      if (this.externalGateway) {
        this.log('error', '外部 Gateway 不可达')
        this.setState('error')
      } else {
        this.log('error', '连续健康检查失败，自动重启 Gateway...')
        this.restart()
      }
    }
  }
}
