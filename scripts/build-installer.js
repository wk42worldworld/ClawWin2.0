/**
 * build-installer.js — 完整构建流程
 *
 * 步骤:
 * 1. prepare-node.js    — 下载 Node.js 运行时
 * 2. prepare-openclaw.js — 安装 openclaw
 * 3. vite build          — 编译 React 前端
 * 4. tsc                 — 编译 Electron 主进程
 * 5. electron-builder    — 打包成 NSIS 安装包
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')

function run(cmd, label) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${label}`)
  console.log(`${'='.repeat(60)}\n`)

  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    })
  } catch (err) {
    console.error(`\n构建步骤失败: ${label}`)
    console.error(err.message)
    process.exit(1)
  }
}

function checkPrerequisites() {
  console.log('检查构建环境...\n')

  // Check Node.js version
  const nodeVersion = process.version
  const major = parseInt(nodeVersion.slice(1).split('.')[0], 10)
  if (major < 18) {
    console.error(`需要 Node.js >= 18，当前版本: ${nodeVersion}`)
    process.exit(1)
  }
  console.log(`  Node.js: ${nodeVersion}`)

  // Check npm
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf-8' }).trim()
    console.log(`  npm: ${npmVersion}`)
  } catch {
    console.error('未找到 npm')
    process.exit(1)
  }

  // Check if node_modules exists
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    console.log('\n正在安装项目依赖...')
    run('npm install', '安装项目依赖')
  }

  console.log('\n环境检查通过!\n')
}

async function main() {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║    OpenClaw 中文版 — 安装包构建工具      ║
  ╚══════════════════════════════════════════╝
  `)

  checkPrerequisites()

  // Step 1: Download Node.js runtime
  run('node scripts/prepare-node.js', '步骤 1/4: 下载 Node.js 运行时')

  // Step 2: Prepare openclaw
  run('node scripts/prepare-openclaw.js', '步骤 2/4: 安装 openclaw')

  // Step 3: Build React frontend + Electron main process (vite-plugin-electron handles both)
  run('npx vite build', '步骤 3/4: 编译前端 + Electron 主进程')

  // Step 4: Build installer
  run('npx electron-builder --win --config electron-builder.yml', '步骤 4/4: 打包 NSIS 安装包')

  console.log(`
  ╔══════════════════════════════════════════╗
  ║           构建完成！                      ║
  ╠══════════════════════════════════════════╣
  ║  安装包位于: release/ 目录               ║
  ╚══════════════════════════════════════════╝
  `)

  // List output files
  const releaseDir = path.join(ROOT, 'release')
  if (fs.existsSync(releaseDir)) {
    const files = fs.readdirSync(releaseDir).filter((f) => f.endsWith('.exe'))
    if (files.length > 0) {
      console.log('生成的安装包:')
      for (const file of files) {
        const stats = fs.statSync(path.join(releaseDir, file))
        console.log(`  ${file} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`)
      }
    }
  }
}

main().catch((err) => {
  console.error('构建失败:', err.message)
  process.exit(1)
})
