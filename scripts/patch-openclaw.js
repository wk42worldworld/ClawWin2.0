/**
 * patch-openclaw.js — 修补 bundled openclaw 的 gateway 逻辑
 *
 * 修复内容：
 *   1. injectControlUiConfig 注入 gateway token 到 control-ui localStorage
 *   2. localStorage key 使用正确的 "openclaw.control.settings.v1"
 *   3. dangerouslyDisableDeviceAuth 模式下保留 operator scopes
 *
 * 在 prepare-openclaw 之后自动执行，也可单独运行：
 *   node scripts/patch-openclaw.js
 */
const fs = require('fs')
const path = require('path')

const OPENCLAW_DIRS = [
  path.join(__dirname, '..', 'bundled', 'openclaw'),
  path.join(__dirname, '..', 'bundled', 'openclaw-cn'),
]

const SETTINGS_KEY = 'openclaw.control.settings.v1'

let totalPatches = 0

/**
 * Patch 1: injectControlUiConfig — 注入 gateway token
 *
 * 将 injectControlUiConfig 改为接收 gatewayToken 参数，
 * 在 HTML 中注入自动填充 token 的脚本。
 */
function patchInjectControlUiConfig(content, filePath) {
  // 匹配未修改的 injectControlUiConfig（不含 gatewayToken）
  // 支持两种格式：单行压缩 和 多行美化

  // 格式1：单行压缩格式 (gateway-cli-*.js)
  const singleLineOld =
    'function injectControlUiConfig(html, opts) {\n' +
    '\tconst { basePath, assistantName, assistantAvatar } = opts;\n'

  const singleLineNew =
    'function injectControlUiConfig(html, opts) {\n' +
    '\tconst { basePath, assistantName, assistantAvatar, gatewayToken } = opts;\n'

  // 格式2：多行美化格式 (control-ui.js)
  const multiLineOld =
    'function injectControlUiConfig(html, opts) {\n' +
    '    const { basePath, assistantName, assistantAvatar } = opts;\n'

  const multiLineNew =
    'function injectControlUiConfig(html, opts) {\n' +
    '    const { basePath, assistantName, assistantAvatar, gatewayToken } = opts;\n'

  let patched = false

  if (content.includes(singleLineOld) && !content.includes('gatewayToken')) {
    content = content.replace(singleLineOld, singleLineNew)
    patched = true
  } else if (content.includes(multiLineOld) && !content.includes('gatewayToken')) {
    content = content.replace(multiLineOld, multiLineNew)
    patched = true
  }

  if (!patched && content.includes('gatewayToken')) {
    // Already patched
    return content
  }

  if (!patched) {
    // Try a more general regex approach
    const regex = /function injectControlUiConfig\(html, opts\) \{[\s\n\t]+const \{ basePath, assistantName, assistantAvatar \} = opts;/
    if (regex.test(content)) {
      content = content.replace(regex, (match) =>
        match.replace('assistantAvatar }', 'assistantAvatar, gatewayToken }')
      )
      patched = true
    }
  }

  if (!patched) return content

  // 添加 tokenScript 生成（在 script 变量之后）
  // 查找 script 变量赋值结束位置，在其后插入 tokenScript
  const tokenScriptCode = `\tconst tokenScript = gatewayToken ? \`<script>(function(){try{var k="${SETTINGS_KEY}";var raw=localStorage.getItem(k);var s=raw?JSON.parse(raw):{};if(!s.token){s.token=\${JSON.stringify(gatewayToken)};localStorage.setItem(k,JSON.stringify(s))}}catch(e){}})()<\\/script>\` : '';`

  // 在 "if (html.includes" 之前插入 tokenScript
  if (!content.includes('tokenScript')) {
    const marker = content.includes('\tif (html.includes("__OPENCLAW_ASSISTANT_NAME__"))')
      ? '\tif (html.includes("__OPENCLAW_ASSISTANT_NAME__"))'
      : '    if (html.includes("__OPENCLAW_ASSISTANT_NAME__"))'

    if (content.includes(marker)) {
      content = content.replace(marker, tokenScriptCode + '\n' + marker)
    }

    // 替换返回值中加入 tokenScript
    // 格式: ${script}${html.slice(headClose)} → ${script}${tokenScript}${html.slice(headClose)}
    content = content.replace(
      /\$\{script\}\$\{html\.slice\(headClose\)\}/g,
      '${script}${tokenScript}${html.slice(headClose)}'
    )
    content = content.replace(
      /return `\$\{script\}\$\{html\}`;/g,
      'return `${script}${tokenScript}${html}`;'
    )
  }

  // Patch serveIndexHtml 传入 gatewayToken
  if (!content.includes('gatewayToken,') && !content.includes('gatewayToken:')) {
    // 在 res.end(injectControlUiConfig(raw, { 之前插入 gatewayToken 变量
    const serveMarker = /res\.end\(injectControlUiConfig\(raw, \{[\s\n\t]+basePath,[\s\n\t]+assistantName: identity\.name,[\s\n\t]+assistantAvatar: avatarValue[\s\n\t]+\}\)\)/

    if (serveMarker.test(content)) {
      content = content.replace(serveMarker, (match) => {
        return match
          .replace('res.end(injectControlUiConfig(raw, {',
            'const gatewayToken = config?.gateway?.auth?.token ?? null;\n\tres.end(injectControlUiConfig(raw, {')
          .replace('assistantAvatar: avatarValue\n\t}))',
            'assistantAvatar: avatarValue,\n\t\tgatewayToken\n\t}))')
          .replace('assistantAvatar: avatarValue\n    }))',
            'assistantAvatar: avatarValue,\n        gatewayToken\n    }))')
      })
    }
  }

  totalPatches++
  console.log(`  [patch 1] injectControlUiConfig: 注入 gateway token → ${path.basename(filePath)}`)
  return content
}

/**
 * Patch 2: 修复 localStorage key
 *
 * 确保注入脚本使用正确的 key: "openclaw.control.settings.v1"
 */
function patchLocalStorageKey(content, filePath) {
  const wrongKey = 'clawdbot.control.settings.v1'
  if (content.includes(wrongKey)) {
    content = content.replace(new RegExp(wrongKey.replace(/\./g, '\\.'), 'g'), SETTINGS_KEY)
    totalPatches++
    console.log(`  [patch 2] localStorage key: clawdbot → openclaw → ${path.basename(filePath)}`)
  }
  return content
}

/**
 * Patch 3: dangerouslyDisableDeviceAuth 模式下保留 scopes
 *
 * 原始代码在 !device 时强制 scopes = []，
 * 修改为：当 allowControlUiBypass && sharedAuthOk 时保留 scopes。
 */
function patchScopeClearing(content, filePath) {
  // 匹配: if (!device) { if (scopes.length > 0) { scopes = []; ...
  // 替换为: if (!device) { if (scopes.length > 0 && !(allowControlUiBypass && sharedAuthOk)) { ...

  const patterns = [
    // 单行压缩格式 (gateway-cli-*.js) — tab indented
    {
      old: 'if (!device) {\n\t\t\t\t\tif (scopes.length > 0) {\n\t\t\t\t\t\tscopes = [];\n\t\t\t\t\t\tconnectParams.scopes = scopes;\n\t\t\t\t\t}',
      new: 'if (!device) {\n\t\t\t\t\tif (scopes.length > 0 && !(allowControlUiBypass && sharedAuthOk)) {\n\t\t\t\t\t\tscopes = [];\n\t\t\t\t\t\tconnectParams.scopes = scopes;\n\t\t\t\t\t}',
    },
    // 多行美化格式 (message-handler.js) — space indented
    {
      old: 'if (!device) {\n                    if (scopes.length > 0) {\n                        scopes = [];\n                        connectParams.scopes = scopes;\n                    }',
      new: 'if (!device) {\n                    if (scopes.length > 0 && !(allowControlUiBypass && sharedAuthOk)) {\n                        scopes = [];\n                        connectParams.scopes = scopes;\n                    }',
    },
  ]

  for (const { old, new: replacement } of patterns) {
    if (content.includes(old)) {
      content = content.replace(old, replacement)
      totalPatches++
      console.log(`  [patch 3] scope 保留: dangerouslyDisableDeviceAuth 模式 → ${path.basename(filePath)}`)
      return content
    }
  }

  // 如果已经 patch 过
  if (content.includes('allowControlUiBypass && sharedAuthOk')) {
    return content
  }

  // 更通用的 regex 匹配
  const regex = /if \(!device\) \{([\s\n\t]+)if \(scopes\.length > 0\) \{([\s\n\t]+)scopes = \[\];/
  if (regex.test(content)) {
    content = content.replace(regex, (match, ws1, ws2) =>
      `if (!device) {${ws1}if (scopes.length > 0 && !(allowControlUiBypass && sharedAuthOk)) {${ws2}scopes = [];`
    )
    totalPatches++
    console.log(`  [patch 3] scope 保留: dangerouslyDisableDeviceAuth 模式 → ${path.basename(filePath)}`)
  }

  return content
}

/**
 * 在目录中查找需要 patch 的文件
 */
function findFilesToPatch(baseDir) {
  const files = []

  // gateway-cli-*.js (bundled/openclaw/dist/)
  const distDir = path.join(baseDir, 'dist')
  if (fs.existsSync(distDir)) {
    for (const f of fs.readdirSync(distDir)) {
      if (f.startsWith('gateway-cli-') && f.endsWith('.js')) {
        files.push(path.join(distDir, f))
      }
    }
  }

  // gateway/control-ui.js (bundled/openclaw-cn/dist/gateway/)
  const controlUiJs = path.join(baseDir, 'dist', 'gateway', 'control-ui.js')
  if (fs.existsSync(controlUiJs)) {
    files.push(controlUiJs)
  }

  // gateway/server/ws-connection/message-handler.js
  const msgHandler = path.join(baseDir, 'dist', 'gateway', 'server', 'ws-connection', 'message-handler.js')
  if (fs.existsSync(msgHandler)) {
    files.push(msgHandler)
  }

  return files
}

function main() {
  console.log('=== 修补 openclaw gateway (control-ui 自动认证) ===\n')

  for (const dir of OPENCLAW_DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`跳过: ${path.basename(dir)}/ (目录不存在)`)
      continue
    }

    console.log(`扫描: ${path.relative(path.join(__dirname, '..'), dir)}/`)
    const files = findFilesToPatch(dir)

    if (files.length === 0) {
      console.log('  未找到需要修补的文件')
      continue
    }

    for (const filePath of files) {
      const relPath = path.relative(path.join(__dirname, '..'), filePath)
      let content = fs.readFileSync(filePath, 'utf-8')
      const original = content

      content = patchInjectControlUiConfig(content, filePath)
      content = patchLocalStorageKey(content, filePath)
      content = patchScopeClearing(content, filePath)

      if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf-8')
      }
    }
  }

  console.log(`\n完成: 共应用 ${totalPatches} 个修补`)
}

main()
