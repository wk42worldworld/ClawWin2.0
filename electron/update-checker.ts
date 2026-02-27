import https from 'node:https'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import { spawn } from 'node:child_process'

const REPO = 'wk42worldworld/ClawWin2.0'
const GITHUB_API = `https://api.github.com/repos/${REPO}/releases/latest`
const MAX_REDIRECTS = 5
const CONNECT_TIMEOUT = 10_000
const DATA_TIMEOUT = 30_000

// 内置 GitHub 镜像前缀
const BUILTIN_MIRRORS = [
  'https://mirror.ghproxy.com/',
  'https://ghgo.xyz/',
  'https://gh.llkk.cc/',
]

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

// ========== 状态 ==========

let cancelled = false
let activeReq: http.ClientRequest | null = null
// 竞速模式下所有进行中的请求，用于取消
let racingReqs: http.ClientRequest[] = []

// ========== 工具函数 ==========

/** 比较 semver：a > b 返回 true */
function isNewer(remote: string, local: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const r = parse(remote)
  const l = parse(local)
  for (let i = 0; i < 3; i++) {
    if ((r[i] ?? 0) > (l[i] ?? 0)) return true
    if ((r[i] ?? 0) < (l[i] ?? 0)) return false
  }
  return false
}

/** 读取用户配置的自定义镜像地址 */
function getCustomMirror(): string | null {
  try {
    const cfgPath = path.join(os.homedir(), '.openclaw', 'clawwin-ui.json')
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    const url = cfg.updateMirrorUrl
    return typeof url === 'string' && url.trim() ? url.trim() : null
  } catch { return null }
}

/** 构建镜像 URL 列表：自定义镜像 > 内置镜像 > 直连 */
function buildMirrorUrls(directUrl: string): string[] {
  const urls: string[] = []
  const custom = getCustomMirror()

  if (custom) {
    const prefix = custom.endsWith('/') ? custom : custom + '/'
    urls.push(prefix + directUrl)
  }

  if (directUrl.includes('github.com') || directUrl.includes('api.github.com')) {
    for (const mirror of BUILTIN_MIRRORS) {
      urls.push(mirror + directUrl)
    }
  }

  urls.push(directUrl)
  return urls
}

/**
 * HTTP GET，内部跟随重定向，返回最终 response
 * 返回 { res, req } 以便调用方管理请求生命周期
 */
function httpGet(
  url: string,
  headers: Record<string, string> = {},
  timeout = CONNECT_TIMEOUT,
): Promise<{ res: http.IncomingMessage; req: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    let redirects = MAX_REDIRECTS
    let timer: ReturnType<typeof setTimeout>
    let currentReq: http.ClientRequest

    function request(targetUrl: string) {
      if (cancelled) { reject(new Error('下载已取消')); return }
      const mod = targetUrl.startsWith('https') ? https : http
      const req = mod.get(targetUrl, {
        headers: { 'User-Agent': 'ClawWin-Updater', ...headers },
      }, (res) => {
        clearTimeout(timer)

        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          res.resume()
          if (--redirects <= 0) { reject(new Error('重定向次数过多')); return }
          request(res.headers.location)
          return
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        resolve({ res, req: currentReq })
      })

      currentReq = req
      req.on('error', (err) => { clearTimeout(timer); reject(err) })
      timer = setTimeout(() => { req.destroy(); reject(new Error('连接超时')) }, timeout)
    }

    request(url)
  })
}

/** 从 URL 获取文本内容 */
async function fetchText(url: string, timeout = 5000): Promise<string> {
  const { res } = await httpGet(url, {}, timeout)
  return new Promise((resolve, reject) => {
    let data = ''
    res.on('data', (chunk) => { data += chunk })
    res.on('end', () => resolve(data))
    res.on('error', reject)
  })
}

// ========== 公开 API ==========

/** 检查更新：所有镜像并行竞速，最快响应的胜出 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const currentVersion = app.getVersion()
  console.log('[update] current version:', currentVersion)

  const apiUrls = buildMirrorUrls(GITHUB_API)
  const body = await raceForText(apiUrls)

  const release = JSON.parse(body)
  const tag: string = release.tag_name ?? ''
  console.log('[update] latest release:', tag)
  if (!tag || !isNewer(tag, currentVersion)) return null

  const asset = (release.assets ?? []).find((a: { name: string }) =>
    a.name.endsWith('.exe')
  )
  if (!asset?.browser_download_url) return null

  const safeName = path.basename(asset.name)
  if (!safeName.endsWith('.exe')) return null

  return {
    version: tag.replace(/^v/, ''),
    releaseNotes: release.body ?? '',
    downloadUrl: asset.browser_download_url,
    fileName: safeName,
  }
}

/**
 * 下载更新：所有镜像并行竞速连接，最快响应的下载
 * 支持断点续传，支持取消
 */
export async function downloadUpdate(
  downloadUrl: string,
  fileName: string,
  onProgress: (progress: DownloadProgress) => void,
): Promise<string> {
  cancelled = false
  activeReq = null

  const destPath = path.join(app.getPath('temp'), fileName)
  const urls = buildMirrorUrls(downloadUrl)

  // 断点续传：读取已下载的字节数
  let existingBytes = 0
  try { existingBytes = fs.statSync(destPath).size } catch { /* 文件不存在 */ }

  let headers: Record<string, string> = {}
  if (existingBytes > 0) {
    headers['Range'] = `bytes=${existingBytes}-`
    console.log('[update] resuming from byte', existingBytes)
  }

  // 并行竞速：所有 URL 同时连接，第一个成功响应的胜出
  let res: http.IncomingMessage, req: http.ClientRequest, url: string
  try {
    ({ res, req, url } = await raceForResponse(urls, headers))
  } catch (err) {
    // Range 请求全部失败（416 或服务器不支持），删除临时文件从头下载
    if (existingBytes > 0) {
      console.log('[update] range request failed, retrying from scratch')
      try { fs.unlinkSync(destPath) } catch { /* ignore */ }
      existingBytes = 0
      headers = {}
      ;({ res, req, url } = await raceForResponse(urls, headers))
    } else {
      throw err
    }
  }
  activeReq = req
  console.log('[update] winner:', url)

  // 服务器返回 206 = 支持续传，200 = 不支持，从头开始
  const isResume = res.statusCode === 206
  if (!isResume) existingBytes = 0

  const contentLength = parseInt(res.headers['content-length'] ?? '0', 10)
  const totalBytes = existingBytes + contentLength
  let transferredBytes = existingBytes

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const done = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(dataTimer)
      if (err) {
        file.destroy()
        reject(err)
      } else {
        file.close(() => resolve())
      }
    }

    const file = fs.createWriteStream(destPath, isResume ? { flags: 'a' } : {})

    let dataTimer = setTimeout(() => {
      activeReq?.destroy()
      done(new Error('下载超时'))
    }, DATA_TIMEOUT)

    res.on('data', (chunk: Buffer) => {
      clearTimeout(dataTimer)
      dataTimer = setTimeout(() => {
        activeReq?.destroy()
        done(new Error('下载超时'))
      }, DATA_TIMEOUT)

      transferredBytes += chunk.length
      onProgress({
        percent: totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0,
        transferredBytes,
        totalBytes,
      })
    })

    res.pipe(file)
    file.on('finish', () => done())
    file.on('error', (err) => done(err))
    res.on('error', (err) => done(err))
  })

  return destPath
}

/** 取消正在进行的下载 */
export function cancelDownload(): void {
  cancelled = true
  activeReq?.destroy()
  activeReq = null
  // 取消所有竞速中的请求
  for (const req of racingReqs) {
    try { req.destroy() } catch { /* ignore */ }
  }
  racingReqs = []
}

/** 启动安装程序并退出应用 */
export function installUpdate(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`安装文件不存在: ${filePath}`)
  }
  spawn(filePath, [], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
}

// ========== 并行竞速 ==========

/**
 * 并行竞速获取文本：所有 URL 同时请求，第一个成功返回内容的胜出
 */
function raceForText(urls: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    let failures = 0
    const reqs: http.ClientRequest[] = []

    for (const url of urls) {
      console.log('[update] checking:', url)
      httpGet(url, {}, timeout).then(({ res, req }) => {
        reqs.push(req)
        if (settled) { res.resume(); return }

        // 读取 body
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          if (settled) return
          settled = true
          console.log('[update] check winner:', url)
          // 取消其余请求
          for (const r of reqs) { try { r.destroy() } catch {} }
          resolve(data)
        })
        res.on('error', () => {
          failures++
          if (!settled && failures >= urls.length) {
            reject(new Error('所有更新源均不可用'))
          }
        })
      }).catch(() => {
        failures++
        if (!settled && failures >= urls.length) {
          reject(new Error('所有更新源均不可用'))
        }
      })
    }
  })
}

/**
 * 并行竞速连接：所有 URL 同时发起请求，第一个返回有效响应头的胜出
 * 其余请求立即取消，仅用胜出的连接进行下载
 */
function raceForResponse(
  urls: string[],
  headers: Record<string, string> = {},
): Promise<{ res: http.IncomingMessage; req: http.ClientRequest; url: string }> {
  return new Promise((resolve, reject) => {
    if (cancelled) { reject(new Error('下载已取消')); return }

    let settled = false
    let failures = 0
    racingReqs = []

    for (const url of urls) {
      console.log('[update] racing:', url)
      httpGet(url, headers).then(({ res, req }) => {
        if (settled) {
          // 已有赢家，销毁这个迟到的连接
          res.resume()
          req.destroy()
          return
        }
        settled = true
        // 从竞速列表中移除赢家，销毁其余
        racingReqs = racingReqs.filter(r => r !== req)
        for (const r of racingReqs) { try { r.destroy() } catch {} }
        racingReqs = []
        resolve({ res, req, url })
      }).catch((err) => {
        failures++
        console.log('[update] race failed:', url, err instanceof Error ? err.message : err)
        if (!settled && failures >= urls.length) {
          racingReqs = []
          reject(new Error('所有下载源均失败，请检查网络连接'))
        }
      })
    }
  })
}
