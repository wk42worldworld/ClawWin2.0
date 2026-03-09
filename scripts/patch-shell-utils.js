/**
 * patch-shell-utils.js — 修补 shell-utils.js，让 Windows 优先使用 bash
 *
 * 修补 bundled openclaw 的 shell-utils.js，在 win32 分支中优先检测
 * PATH 中的 bash.exe，找到则使用 bash，找不到再 fallback 到 PowerShell。
 *
 * 在 build-installer.js 构建流程中自动执行，也可单独运行：
 *   node scripts/patch-shell-utils.js
 */
const fs = require('fs')
const path = require('path')

const OPENCLAW_DIRS = [
  path.join(__dirname, '..', 'bundled', 'openclaw'),
  path.join(__dirname, '..', 'bundled', 'openclaw-cn'),
]

let totalPatches = 0

/**
 * 查找 shell-utils.js 文件
 */
function findShellUtilsFiles(baseDir) {
  const candidate = path.join(baseDir, 'dist', 'agents', 'shell-utils.js')
  if (fs.existsSync(candidate)) {
    return [candidate]
  }
  return []
}

/**
 * 修补 getShellConfig() 的 win32 分支，优先使用 bash
 */
function patchGetShellConfig(content, filePath) {
  // 已经 patch 过的标志
  if (content.includes('resolveShellFromPath("bash.exe")') || content.includes("resolveShellFromPath('bash.exe')")) {
    console.log(`  [跳过] 已修补: ${path.basename(filePath)}`)
    return content
  }

  // 匹配原始的 getShellConfig win32 分支
  // 支持两种格式：export function 和 function

  // 模式1：标准格式（带 export）
  const pattern1Old = `export function getShellConfig() {
    if (process.platform === "win32") {
        return {
            shell: resolvePowerShellPath(),
            args: ["-NoProfile", "-NonInteractive", "-Command"],
        };
    }`

  const pattern1New = `export function getShellConfig() {
    if (process.platform === "win32") {
        const bashPath = resolveShellFromPath("bash.exe") || resolveShellFromPath("bash");
        if (bashPath) {
            return { shell: bashPath, args: ["-c"] };
        }
        return {
            shell: resolvePowerShellPath(),
            args: ["-NoProfile", "-NonInteractive", "-Command"],
        };
    }`

  // 模式2：无 export
  const pattern2Old = `function getShellConfig() {
    if (process.platform === "win32") {
        return {
            shell: resolvePowerShellPath(),
            args: ["-NoProfile", "-NonInteractive", "-Command"],
        };
    }`

  const pattern2New = `function getShellConfig() {
    if (process.platform === "win32") {
        const bashPath = resolveShellFromPath("bash.exe") || resolveShellFromPath("bash");
        if (bashPath) {
            return { shell: bashPath, args: ["-c"] };
        }
        return {
            shell: resolvePowerShellPath(),
            args: ["-NoProfile", "-NonInteractive", "-Command"],
        };
    }`

  if (content.includes(pattern1Old)) {
    content = content.replace(pattern1Old, pattern1New)
    totalPatches++
    console.log(`  [patch] getShellConfig: 优先使用 bash → ${path.basename(filePath)}`)
    return content
  }

  if (content.includes(pattern2Old)) {
    content = content.replace(pattern2Old, pattern2New)
    totalPatches++
    console.log(`  [patch] getShellConfig: 优先使用 bash → ${path.basename(filePath)}`)
    return content
  }

  // 模式3：通用 regex 匹配（应对注释、不同缩进等）
  // 匹配 win32 分支中从 if 到 return PowerShell 的整段，中间可能有注释
  const regex = /((?:export )?function getShellConfig\(\) \{[\s\n]+if \(process\.platform === "win32"\) \{)([\s\S]*?)(return \{[\s\n]+shell: resolvePowerShellPath\(\),[\s\n]+args: \["-NoProfile", "-NonInteractive", "-Command"\],?[\s\n]+\};)/

  if (regex.test(content)) {
    content = content.replace(regex, (match, prefix, middle, returnBlock) => {
      // 检测缩进风格
      const indentMatch = returnBlock.match(/(\s+)return \{/)
      const indent = indentMatch ? indentMatch[1] : '        '
      const innerIndent = indent + '    '

      return `${prefix}
${indent}const bashPath = resolveShellFromPath("bash.exe") || resolveShellFromPath("bash");
${indent}if (bashPath) {
${innerIndent}return { shell: bashPath, args: ["-c"] };
${indent}}${middle}${returnBlock}`
    })
    totalPatches++
    console.log(`  [patch] getShellConfig (regex): 优先使用 bash → ${path.basename(filePath)}`)
    return content
  }

  console.log(`  [警告] 未找到 getShellConfig win32 分支: ${path.basename(filePath)}`)
  return content
}

function main() {
  console.log('=== 修补 shell-utils.js (Windows 优先使用 bash) ===\n')

  for (const dir of OPENCLAW_DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`跳过: ${path.basename(dir)}/ (目录不存在)`)
      continue
    }

    console.log(`扫描: ${path.relative(path.join(__dirname, '..'), dir)}/`)
    const files = findShellUtilsFiles(dir)

    if (files.length === 0) {
      console.log('  未找到 shell-utils.js')
      continue
    }

    for (const filePath of files) {
      let content = fs.readFileSync(filePath, 'utf-8')
      const original = content

      content = patchGetShellConfig(content, filePath)

      if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf-8')
      }
    }
  }

  console.log(`\n完成: 共应用 ${totalPatches} 个修补`)
}

main()
