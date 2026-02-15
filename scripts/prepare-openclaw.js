/**
 * prepare-openclaw.js — 安装 openclaw 到 bundled/openclaw/
 *
 * 策略：
 *   1. 尝试从 npm 全局安装目录复制（最快，保留完整依赖）
 *   2. 如果全局没有，则用 npm pack + extract + npm install 的方式安装
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const TARGET_DIR = path.join(__dirname, '..', 'bundled', 'openclaw')
const PACKAGE_NAME = 'openclaw'

function getDirSize(dirPath) {
  let totalSize = 0
  if (!fs.existsSync(dirPath)) return 0
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      totalSize += getDirSize(fullPath)
    } else if (entry.isFile()) {
      totalSize += fs.statSync(fullPath).size
    }
  }
  return totalSize
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * 清理不必要的文件以减小体积
 */
function cleanupDir(dir) {
  let totalRemoved = 0
  if (!fs.existsSync(dir)) return 0

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (['test', 'tests', '__tests__', '.github', 'example', 'examples'].includes(entry.name)) {
        fs.rmSync(fullPath, { recursive: true, force: true })
        totalRemoved++
        continue
      }
      totalRemoved += cleanupDir(fullPath)
    } else if (entry.isFile()) {
      const name = entry.name.toLowerCase()
      if (
        name === 'changelog.md' ||
        name === 'history.md' ||
        name.endsWith('.map')
      ) {
        fs.unlinkSync(fullPath)
        totalRemoved++
      }
    }
  }
  return totalRemoved
}

/**
 * 策略 1：从全局 npm 安装复制
 */
function tryGlobalCopy() {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
    const globalPath = path.join(globalRoot, PACKAGE_NAME)
    const globalPkg = path.join(globalPath, 'package.json')

    if (!fs.existsSync(globalPkg)) {
      console.log('全局未安装 openclaw')
      return false
    }

    const pkg = JSON.parse(fs.readFileSync(globalPkg, 'utf-8'))
    console.log(`发现全局安装: openclaw@${pkg.version}`)
    console.log(`路径: ${globalPath}`)
    console.log('正在复制到 bundled/ 目录...')

    // 清空目标目录
    if (fs.existsSync(TARGET_DIR)) {
      fs.rmSync(TARGET_DIR, { recursive: true, force: true })
    }

    copyDirSync(globalPath, TARGET_DIR)
    console.log('复制完成!')
    return true
  } catch (err) {
    console.log(`全局复制失败: ${err.message}`)
    return false
  }
}

/**
 * 策略 2：npm pack + extract + npm install
 */
function npmPackInstall() {
  const tmpDir = path.join(__dirname, '..', '.tmp-openclaw-install')

  // 清理
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
  fs.mkdirSync(tmpDir, { recursive: true })

  try {
    // npm pack 下载 tarball
    console.log('正在从 npm 下载 openclaw...')
    const output = execSync(`npm pack ${PACKAGE_NAME} --pack-destination .`, {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim()

    const tarball = output.split('\n').pop().trim()
    console.log(`下载完成: ${tarball}`)

    // 解压 tarball
    console.log('正在解压...')
    execSync(`tar -xzf "${tarball}"`, { cwd: tmpDir })

    // npm pack 解压到 package/ 目录
    const extractedDir = path.join(tmpDir, 'package')
    if (!fs.existsSync(extractedDir)) {
      throw new Error('解压后未找到 package/ 目录')
    }

    // 移动到目标位置
    if (fs.existsSync(TARGET_DIR)) {
      fs.rmSync(TARGET_DIR, { recursive: true, force: true })
    }
    fs.renameSync(extractedDir, TARGET_DIR)

    // 安装依赖
    console.log('正在安装依赖 (这可能需要几分钟)...')
    execSync('npm install --production --ignore-scripts', {
      cwd: TARGET_DIR,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    })

    console.log('安装完成!')
    return true
  } catch (err) {
    console.error(`npm pack 安装失败: ${err.message}`)
    return false
  } finally {
    // 清理临时目录
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }
}

async function main() {
  console.log('=== 准备 openclaw ===\n')

  // 检查是否已安装且版本正确
  const existingPkg = path.join(TARGET_DIR, 'package.json')
  if (fs.existsSync(existingPkg) && fs.existsSync(path.join(TARGET_DIR, 'dist', 'entry.js'))) {
    const pkg = JSON.parse(fs.readFileSync(existingPkg, 'utf-8'))
    console.log(`openclaw@${pkg.version} 已安装在 bundled/ 中`)
    console.log('跳过安装（如需更新请先删除 bundled/openclaw/ 目录）')
    return
  }

  // 创建目标目录
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true })
  }

  // 尝试策略 1：从全局复制
  let ok = tryGlobalCopy()

  // 策略 2：npm pack + install
  if (!ok) {
    ok = npmPackInstall()
  }

  if (!ok) {
    console.error('\n无法安装 openclaw，请手动安装：')
    console.error('  npm install -g openclaw')
    console.error('然后重新运行此脚本')
    process.exit(1)
  }

  // 验证安装
  const entryJs = path.join(TARGET_DIR, 'dist', 'entry.js')
  if (!fs.existsSync(entryJs)) {
    console.error(`错误: 未找到入口文件 ${entryJs}`)
    process.exit(1)
  }

  // 清理不必要的文件
  console.log('\n清理不必要的文件...')
  const nodeModulesDir = path.join(TARGET_DIR, 'node_modules')
  if (fs.existsSync(nodeModulesDir)) {
    const removed = cleanupDir(nodeModulesDir)
    console.log(`已清理 ${removed} 个文件/目录`)
  }

  // 报告大小
  const totalSize = getDirSize(TARGET_DIR)
  console.log(`\nopenclaw 安装目录大小: ${(totalSize / 1024 / 1024).toFixed(1)} MB`)
  console.log('openclaw 准备完成!')
}

main().catch((err) => {
  console.error('错误:', err.message)
  process.exit(1)
})
