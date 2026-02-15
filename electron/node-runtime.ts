import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

/**
 * 获取内嵌的 Node.js 运行时路径
 *
 * 开发环境：使用系统全局 Node.js
 * 生产环境：使用 bundled/node/node.exe
 */
export function getNodePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bundled', 'node', 'node.exe')
  }

  // 开发环境：先检查 bundled 目录，再回退到系统 node
  const devBundled = path.join(__dirname, '..', 'bundled', 'node', 'node.exe')
  if (fs.existsSync(devBundled)) {
    return devBundled
  }

  return process.execPath.includes('electron')
    ? 'node' // Electron 开发模式下用系统 node
    : process.execPath
}

/**
 * 获取 openclaw 安装目录路径
 */
export function getOpenclawPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'bundled', 'openclaw')
  }

  // 开发环境：按优先级查找 openclaw
  // 1. 本地 bundled 目录
  const devBundled = path.join(__dirname, '..', 'bundled', 'openclaw')
  if (fs.existsSync(path.join(devBundled, 'package.json'))) {
    return devBundled
  }

  // 2. npm 全局安装目录
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim()
    const globalPath = path.join(globalRoot, 'openclaw')
    if (fs.existsSync(path.join(globalPath, 'package.json'))) {
      return globalPath
    }
  } catch {
    // ignore
  }

  // 3. 回退到 bundled（即使不存在）
  return devBundled
}

/**
 * 检查 Node.js 运行时是否存在
 */
export function isNodeRuntimeAvailable(): boolean {
  const nodePath = getNodePath()
  if (nodePath === 'node') {
    // 系统 node，假设可用
    return true
  }
  return fs.existsSync(nodePath)
}

/**
 * 检查 openclaw 是否已安装
 */
export function isOpenclawInstalled(): boolean {
  const openclawPath = getOpenclawPath()
  const packageJson = path.join(openclawPath, 'package.json')
  return fs.existsSync(packageJson)
}
