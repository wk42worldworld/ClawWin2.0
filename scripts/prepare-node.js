/**
 * prepare-node.js — 下载 Node.js 22 LTS win-x64 到 bundled/node/
 */
const https = require('https')
const fs = require('fs')
const path = require('path')

const NODE_VERSION = '22.14.0'
const PLATFORM = 'win-x64'
const DOWNLOAD_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${PLATFORM}.zip`
const NODE_EXE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`
const TARGET_DIR = path.join(__dirname, '..', 'bundled', 'node')
const TARGET_FILE = path.join(TARGET_DIR, 'node.exe')

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`下载: ${url}`)
    console.log(`目标: ${dest}`)

    const file = fs.createWriteStream(dest)
    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close()
        fs.unlinkSync(dest)
        return download(response.headers.location, dest).then(resolve).catch(reject)
      }

      if (response.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloaded = 0

      response.on('data', (chunk) => {
        downloaded += chunk.length
        if (totalSize > 0) {
          const pct = ((downloaded / totalSize) * 100).toFixed(1)
          process.stdout.write(`\r下载进度: ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`)
        }
      })

      response.pipe(file)
      file.on('finish', () => {
        file.close()
        console.log('\n下载完成!')
        resolve()
      })
    })

    request.on('error', (err) => {
      file.close()
      fs.unlinkSync(dest)
      reject(err)
    })
  })
}

async function main() {
  console.log(`=== 准备 Node.js ${NODE_VERSION} 运行时 ===\n`)

  // Create target directory
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true })
  }

  // Check if node.exe already exists
  if (fs.existsSync(TARGET_FILE)) {
    const stats = fs.statSync(TARGET_FILE)
    if (stats.size > 50 * 1024 * 1024) {
      console.log(`node.exe 已存在 (${(stats.size / 1024 / 1024).toFixed(1)} MB)，跳过下载`)
      return
    }
    console.log('node.exe 文件可能不完整，重新下载...')
  }

  // Download standalone node.exe
  await download(NODE_EXE_URL, TARGET_FILE)

  // Verify
  const stats = fs.statSync(TARGET_FILE)
  console.log(`\nnode.exe 大小: ${(stats.size / 1024 / 1024).toFixed(1)} MB`)
  console.log('Node.js 运行时准备完成!')
}

main().catch((err) => {
  console.error('错误:', err.message)
  process.exit(1)
})
