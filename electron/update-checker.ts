import https from 'node:https'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { spawn } from 'node:child_process'

const REPO = 'wk42worldworld/ClawWin2.0'
const MAX_REDIRECTS = 5

// 镜像优先，直连 fallback
const API_URLS = [
  `https://mirror.ghproxy.com/https://api.github.com/repos/${REPO}/releases/latest`,
  `https://ghgo.xyz/https://api.github.com/repos/${REPO}/releases/latest`,
  `https://gh.llkk.cc/https://api.github.com/repos/${REPO}/releases/latest`,
  `https://api.github.com/repos/${REPO}/releases/latest`,
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

/** HTTPS GET，返回 response body string，支持重定向（有深度限制） */
function fetchUrl(url: string, timeout = 10000, redirects = MAX_REDIRECTS): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirects <= 0) { reject(new Error('Too many redirects')); return }
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': 'ClawWin-Updater' }, timeout }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchUrl(res.headers.location, timeout, redirects - 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
  })
}

/** 检查更新：按镜像列表顺序尝试，返回 UpdateInfo 或 null */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const currentVersion = app.getVersion()
  console.log('[update-checker] current version:', currentVersion)

  for (const apiUrl of API_URLS) {
    try {
      console.log('[update-checker] trying:', apiUrl)
      const body = await fetchUrl(apiUrl, 5000)
      const release = JSON.parse(body)
      const tag: string = release.tag_name ?? ''
      console.log('[update-checker] latest release:', tag)
      if (!tag || !isNewer(tag, currentVersion)) return null

      // 找 .exe 安装包资源
      const asset = (release.assets ?? []).find((a: { name: string }) =>
        a.name.endsWith('.exe')
      )
      // 没有 .exe 资源则不提示更新
      if (!asset?.browser_download_url) return null

      // 安全处理 fileName，防止路径遍历
      const safeName = path.basename(asset.name)
      if (!safeName.endsWith('.exe')) return null

      return {
        version: tag.replace(/^v/, ''),
        releaseNotes: release.body ?? '',
        downloadUrl: asset.browser_download_url,
        fileName: safeName,
      }
    } catch (err) {
      console.log('[update-checker] failed for', apiUrl, err)
      continue
    }
  }
  return null
}

/** 为下载 URL 生成候选列表：直连优先，镜像兜底 */
function getMirrorUrls(originalUrl: string): string[] {
  const urls = [originalUrl]
  if (originalUrl.includes('github.com')) {
    // 国内 GitHub 加速镜像作为兜底（直连超时 5 秒后自动切换）
    urls.push(
      originalUrl.replace('https://github.com/', 'https://mirror.ghproxy.com/https://github.com/'),
      `https://ghgo.xyz/${originalUrl}`,
      originalUrl.replace('https://github.com/', 'https://gh.llkk.cc/https://github.com/'),
    )
  }
  return urls
}

// 当前下载的 abort controller
let currentDownloadReq: http.ClientRequest | null = null

/** 取消正在进行的下载 */
export function cancelDownload(): void {
  if (currentDownloadReq) {
    currentDownloadReq.destroy()
    currentDownloadReq = null
  }
}

/** 下载文件到 temp 目录，支持进度回调 */
export function downloadUpdate(
  downloadUrl: string,
  fileName: string,
  onProgress: (progress: DownloadProgress) => void,
): Promise<string> {
  const destPath = path.join(app.getPath('temp'), fileName)
  const urls = getMirrorUrls(downloadUrl)
  return tryDownload(urls, 0, destPath, onProgress, MAX_REDIRECTS)
}

function tryDownload(
  urls: string[],
  index: number,
  destPath: string,
  onProgress: (progress: DownloadProgress) => void,
  redirectsLeft: number,
): Promise<string> {
  if (index >= urls.length) {
    return Promise.reject(new Error('无法连接到更新服务器，请检查网络连接'))
  }

  const url = urls[index]
  return new Promise<string>((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    // 不使用 http timeout 选项（socket 级超时），改用手动连接计时器，
    // 避免 302 重定向后原始 socket 空闲触发 timeout 导致误报"连接超时"
    const req = mod.get(url, { headers: { 'User-Agent': 'ClawWin-Updater' } }, (res) => {
      // 收到响应（含 302），立即清除连接超时
      clearTimeout(connectTimer)

      // 跟随重定向（有深度限制）
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        if (redirectsLeft <= 0) { reject(new Error('Too many redirects')); return }
        tryDownload([res.headers.location, ...urls.slice(index + 1)], 0, destPath, onProgress, redirectsLeft - 1)
          .then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      const totalBytes = parseInt(res.headers['content-length'] ?? '0', 10)
      let transferredBytes = 0
      const file = fs.createWriteStream(destPath)

      // 数据传输超时：15 秒无数据则中断，快速回退到下一个源
      let dataTimer = setTimeout(() => { req.destroy(); reject(new Error('下载超时')) }, 15000)

      res.on('data', (chunk: Buffer) => {
        clearTimeout(dataTimer)
        dataTimer = setTimeout(() => { req.destroy(); reject(new Error('下载超时')) }, 15000)
        transferredBytes += chunk.length
        const percent = totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0
        onProgress({ percent, transferredBytes, totalBytes })
      })
      res.pipe(file)
      file.on('finish', () => {
        clearTimeout(dataTimer)
        file.close()
        currentDownloadReq = null
        resolve(destPath)
      })
      file.on('error', (err) => { clearTimeout(dataTimer); fs.unlink(destPath, () => {}); reject(err) })
      res.on('error', (err) => { clearTimeout(dataTimer); fs.unlink(destPath, () => {}); reject(err) })
    })
    // 连接超时：5 秒内未收到任何响应则中断
    const connectTimer = setTimeout(() => { req.destroy(); reject(new Error('连接超时')) }, 5000)
    req.on('error', (err) => { clearTimeout(connectTimer); reject(err) })
    currentDownloadReq = req
  }).catch((err) => {
    // 如果是用户主动取消，不再尝试下一个源
    if (currentDownloadReq === null) return Promise.reject(new Error('下载已取消'))
    currentDownloadReq = null
    // 尝试下一个源
    if (index + 1 < urls.length) {
      return tryDownload(urls, index + 1, destPath, onProgress, redirectsLeft)
    }
    return Promise.reject(err)
  })
}

/** 启动安装程序并退出应用 */
export function installUpdate(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`安装文件不存在: ${filePath}`)
  }
  spawn(filePath, [], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
}
