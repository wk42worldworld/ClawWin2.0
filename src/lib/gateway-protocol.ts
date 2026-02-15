/**
 * Gateway Protocol v3 — 浏览器端 WebSocket 客户端
 * 对齐 OpenClaw Gateway 的 connect.challenge → connect 握手流程
 */

export type GatewayEventFrame = {
  type: 'event'
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: { presence: number; health: number }
}

export type GatewayResponseFrame = {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { code: string; message: string; details?: unknown }
}

export type GatewayHelloOk = {
  type: 'hello-ok'
  protocol: number
  features?: { methods?: string[]; events?: string[] }
  snapshot?: unknown
  auth?: {
    deviceToken?: string
    role?: string
    scopes?: string[]
  }
  policy?: { tickIntervalMs?: number; maxPayload?: number }
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
}

export interface GatewayClientOptions {
  url: string
  token?: string
  clientId?: string
  clientVersion?: string
  onHello?: (hello: GatewayHelloOk) => void
  onEvent?: (evt: GatewayEventFrame) => void
  onClose?: (info: { code: number; reason: string }) => void
  onError?: (err: Error) => void
  signDeviceAuth?: (params: {
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
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export class GatewayClient {
  private ws: WebSocket | null = null
  private pending = new Map<string, Pending>()
  private closed = false
  private lastSeq: number | null = null
  private backoffMs = 800
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  // challenge/connect 握手状态
  private connectNonce: string | null = null
  private connectSent = false
  private connectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private opts: GatewayClientOptions) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  start() {
    this.closed = false
    this.doConnect()
  }

  stop() {
    this.closed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.flushPending(new Error('client stopped'))
  }

  private doConnect() {
    if (this.closed) return

    try {
      this.ws = new WebSocket(this.opts.url)
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      this.scheduleReconnect()
      return
    }

    this.ws.addEventListener('open', () => {
      // 不立即发送 connect，等 challenge 事件
      // 但设置超时：如果 750ms 内没收到 challenge，主动发 connect
      this.queueConnect()
    })

    this.ws.addEventListener('message', (ev) => {
      this.handleMessage(String(ev.data ?? ''))
    })

    this.ws.addEventListener('close', (ev) => {
      this.ws = null
      this.flushPending(new Error(`closed (${ev.code}): ${ev.reason}`))
      this.opts.onClose?.({ code: ev.code, reason: ev.reason })
      this.scheduleReconnect()
    })

    this.ws.addEventListener('error', () => {
      // close handler will fire
    })
  }

  /**
   * 排队发送 connect。
   * 给 Gateway 750ms 的时间来发送 connect.challenge 事件。
   * 如果超时没收到 challenge，也照常发送 connect。
   */
  private queueConnect() {
    this.connectNonce = null
    this.connectSent = false
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
    }
    this.connectTimer = setTimeout(() => {
      this.sendConnect()
    }, 750)
  }

  private scheduleReconnect() {
    if (this.closed) return
    const delay = this.backoffMs
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000)
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay)
  }

  private flushPending(err: Error) {
    for (const [, p] of this.pending) {
      p.reject(err)
    }
    this.pending.clear()
  }

  private async sendConnect() {
    if (this.connectSent) return
    this.connectSent = true
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }

    const clientId = this.opts.clientId ?? 'webchat-ui'
    const clientMode = 'webchat'
    const role = 'operator'
    const scopes = ['operator.admin', 'operator.write']

    // Build device auth if signDeviceAuth is available
    let device: Record<string, unknown> | undefined
    if (this.opts.signDeviceAuth && this.opts.token) {
      try {
        device = await this.opts.signDeviceAuth({
          clientId,
          clientMode,
          role,
          scopes,
          token: this.opts.token,
          nonce: this.connectNonce ?? undefined,
        })
      } catch (err) {
        console.error('[gateway] device auth signing failed:', err)
      }
    }

    const params: Record<string, unknown> = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: clientId,
        version: this.opts.clientVersion ?? '1.0.0',
        platform: navigator?.platform ?? 'win32',
        mode: clientMode,
      },
      role,
      scopes,
      caps: [],
      auth: this.opts.token ? { token: this.opts.token } : undefined,
      locale: navigator?.language ?? 'zh-CN',
      device,
    }

    this.request<GatewayHelloOk>('connect', params)
      .then((hello) => {
        this.backoffMs = 800
        this.opts.onHello?.(hello)
      })
      .catch(() => {
        this.ws?.close(4008, 'connect failed')
      })
  }

  private handleMessage(raw: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }

    const frame = parsed as { type?: unknown }

    if (frame.type === 'event') {
      const evt = parsed as GatewayEventFrame

      // Gateway 连接后首先发送 connect.challenge，携带 nonce
      if (evt.event === 'connect.challenge') {
        const payload = evt.payload as { nonce?: unknown } | undefined
        const nonce = payload && typeof payload.nonce === 'string' ? payload.nonce : null
        if (nonce) {
          this.connectNonce = nonce
        }
        // 收到 challenge 后立即发送 connect
        this.sendConnect()
        return
      }

      const seq = typeof evt.seq === 'number' ? evt.seq : null
      if (seq !== null) {
        this.lastSeq = seq
      }

      try {
        this.opts.onEvent?.(evt)
      } catch (err) {
        console.error('[gateway] event handler error:', err)
      }
      return
    }

    if (frame.type === 'res') {
      const res = parsed as GatewayResponseFrame
      const pending = this.pending.get(res.id)
      if (!pending) return
      this.pending.delete(res.id)
      if (res.ok) {
        pending.resolve(res.payload)
      } else {
        pending.reject(new Error(res.error?.message ?? 'request failed'))
      }
    }
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected'))
    }
    const id = generateId()
    const frame = { type: 'req', id, method, params }
    const p = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject })
    })
    this.ws.send(JSON.stringify(frame))
    return p
  }
}
