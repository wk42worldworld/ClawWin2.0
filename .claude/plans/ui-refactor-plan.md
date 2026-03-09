# ClawWin 桌面版 UI 调整计划

> 所有改动均在 `E:\claudeProject\openClaw_cn\` 项目内，不涉及 ClawWinWeb 后端。

## 目标

1. ModelSettings 从 2 个标签页变为 3 个：**云端模型 | ClawWin模型 | 本地模型**
2. 充值金额扩展：10/30/50/100 → **10/30/50/100/500/1000/2000/自定义**
3. 聊天侧边栏左下角新增**「个人中心」**入口 + 弹窗

## 涉及文件（共 4 个）

| # | 文件路径 | 改动 |
|---|---------|------|
| 1 | `src/components/Settings/ModelSettings.tsx` | 三标签页重构 + 充值扩展 |
| 2 | `src/components/Sidebar/SessionList.tsx` | 底部个人中心 + popover |
| 3 | `src/App.tsx` | CWW 状态提升 + 传参 |
| 4 | `src/index.css` | 新增样式 |

---

## 文件 1：`src/components/Settings/ModelSettings.tsx`

### 1.1 Props 接口扩展

在 `ModelSettingsProps` 接口中新增两个可选属性：

```ts
interface ModelSettingsProps {
  currentProvider?: string
  currentModel?: string
  initialTab?: 'cloud' | 'clawwin' | 'local'   // ← 新增
  onClose: () => void
  onSaved: () => void
  onCwwStateChange?: (state: {                  // ← 新增
    loggedIn: boolean
    email: string
    nickname: string
    credits: number
  }) => void
}
```

在函数参数解构中加入 `initialTab` 和 `onCwwStateChange`。

### 1.2 Tab 状态类型扩展

**行 63**，修改：

```ts
// 旧
const [activeTab, setActiveTab] = useState<'cloud' | 'local'>('cloud')
// 新
const [activeTab, setActiveTab] = useState<'cloud' | 'clawwin' | 'local'>(initialTab ?? 'cloud')
```

### 1.3 新增自定义充值状态

在 `rechargeStatus` 状态声明之后，新增：

```ts
const [showCustomRecharge, setShowCustomRecharge] = useState(false)
const [customRechargeInput, setCustomRechargeInput] = useState('')
```

### 1.4 CWW 恢复登录的 useEffect 改为按 activeTab 触发

**替换行 146-171** 的 useEffect（原依赖 `selectedProvider === 'clawwinweb'`）为：

```ts
useEffect(() => {
  if (activeTab !== 'clawwin') return
  setSelectedProvider('clawwinweb')
  let cancelled = false
  const restore = async () => {
    try {
      const state = await window.electronAPI.cww.getState()
      const savedKey = await window.electronAPI.config.getApiKey('clawwinweb:default')
      if (cancelled) return
      if (state && savedKey) {
        setCwwEmail(state.email || '')
        setCwwNickname(state.nickname || '')
        setCwwCredits(state.credits || 0)
        setCwwToken(savedKey)
        setApiKey(savedKey)
        setCwwView('logged-in')
        fetchCwwModelsAndProfile(savedKey)
      }
    } catch { /* no saved state */ }
  }
  restore()
  return () => { cancelled = true }
}, [activeTab])
```

### 1.5 登录/注册/退出/充值后通知父组件

在以下 4 个位置，在状态更新完成后调用 `onCwwStateChange`：

**位置 A — `handleCwwLogin`**，在 `setCwwView('logged-in')` 之后加：

```ts
onCwwStateChange?.({ loggedIn: true, email: cwwEmail, nickname: res.user?.nickname ?? '', credits: res.user?.credits ?? 0 })
```

**位置 B — `handleCwwRegister`**，在 `setCwwView('logged-in')` 之后加：

```ts
onCwwStateChange?.({ loggedIn: true, email: cwwEmail, nickname: res.user?.nickname ?? '', credits: res.user?.credits ?? 0 })
```

**位置 C — `handleCwwLogout`**，在末尾（`saveState` 之后）加：

```ts
onCwwStateChange?.({ loggedIn: false, email: '', nickname: '', credits: 0 })
```

**位置 D — `handleRecharge`**，在 `setRechargeStatus('success')` 之后刷新积分完成处加：

```ts
onCwwStateChange?.({ loggedIn: true, email: cwwEmail, nickname: cwwNickname, credits: profileRes.user?.credits ?? 0 })
```

### 1.6 Tab 按钮区域改为 3 个

**替换行 467-480** 的 tabs 区域：

```tsx
<div className="model-settings-tabs">
  <button
    className={`model-settings-tab${activeTab === 'cloud' ? ' active' : ''}`}
    onClick={() => setActiveTab('cloud')}
  >
    云端模型
  </button>
  <button
    className={`model-settings-tab${activeTab === 'clawwin' ? ' active' : ''}`}
    onClick={() => setActiveTab('clawwin')}
  >
    ClawWin模型
  </button>
  <button
    className={`model-settings-tab${activeTab === 'local' ? ' active' : ''}`}
    onClick={() => setActiveTab('local')}
  >
    本地模型
  </button>
</div>
```

### 1.7 Cloud Tab 过滤掉 clawwinweb

**行 504**，将 `MODEL_PROVIDERS.map(` 改为：

```ts
MODEL_PROVIDERS.filter(p => p.id !== 'clawwinweb').map(
```

**删除行 548-710**：整个 `{isSelected && provider.id === 'clawwinweb' && (` 代码块。CWW 内容将移到 clawwin tab。

### 1.8 Cloud Tab Footer 简化

**行 800-821**，删除 `selectedProvider === 'clawwinweb'` 的 footer 分支。Cloud tab footer 只保留：

```tsx
<div className="model-settings-footer">
  {selectedProvider && selectedProvider !== 'clawwinweb' && selectedModel ? (
    <>
      {/* 标准 API Key 输入 + 验证 + 保存按钮 — 保持现有代码不变 */}
    </>
  ) : (
    <div className="model-settings-footer-hint">请选择一个厂商和模型</div>
  )}
</div>
```

### 1.9 新增 ClawWin Tab 渲染

在整体 JSX 三元判断中，`activeTab === 'cloud'` 的 `<>...</>` 之后、`<LocalModelSettings>` 之前，插入 `activeTab === 'clawwin'` 分支。

结构为 `<> body + footer </>`，body 渲染 4 个 CWW 视图（login / register / logged-in / recharge），内容从原 cloud tab 的 provider card 中**剪切**过来，逻辑完全不变，只是放到独立 tab body 中。

完整结构：

```tsx
) : activeTab === 'clawwin' ? (
  <>
    <div className="model-settings-body">
      {/* 当前模型 */}
      <div className="model-settings-current">
        <div className="model-settings-current-label">当前模型</div>
        <div className="model-settings-current-value">
          {currentProviderObj
            ? `${currentProviderObj.name} / ${currentModelObj?.name ?? currentModel ?? '未选择'}`
            : '未配置'}
        </div>
      </div>

      {/* ===== 登录视图 ===== */}
      {cwwView === 'login' && (
        <div className="cww-login-panel cww-panel-center">
          <input type="email" placeholder="邮箱" value={cwwEmail}
            onChange={(e) => setCwwEmail(e.target.value)} />
          <input type="password" placeholder="密码" value={cwwPassword}
            onChange={(e) => setCwwPassword(e.target.value)} />
          {cwwError && <div className="cww-error">{cwwError}</div>}
          <div className="cww-login-actions">
            <button className="btn-primary" onClick={handleCwwLogin}
              disabled={cwwLoading || !cwwEmail.trim() || !cwwPassword.trim()}>
              {cwwLoading ? '登录中...' : '登录'}
            </button>
          </div>
          <div className="cww-login-link"
            onClick={() => { setCwwView('register'); setCwwError('') }}>
            没有账号？注册
          </div>
        </div>
      )}

      {/* ===== 注册视图 ===== */}
      {cwwView === 'register' && (
        <div className="cww-login-panel cww-panel-center">
          <input type="email" placeholder="邮箱" value={cwwEmail}
            onChange={(e) => setCwwEmail(e.target.value)} />
          <input type="password" placeholder="密码" value={cwwPassword}
            onChange={(e) => setCwwPassword(e.target.value)} />
          <input type="text" placeholder="昵称" value={cwwNickname}
            onChange={(e) => setCwwNickname(e.target.value)} />
          <div className="cww-code-row">
            <input type="text" placeholder="验证码" value={cwwCode}
              onChange={(e) => setCwwCode(e.target.value)} />
            <button className="btn-secondary" onClick={handleCwwSendCode}
              disabled={cwwCodeCountdown > 0 || !cwwEmail.trim()}>
              {cwwCodeCountdown > 0 ? `${cwwCodeCountdown}s` : '发送验证码'}
            </button>
          </div>
          {cwwError && <div className="cww-error">{cwwError}</div>}
          <div className="cww-login-actions">
            <button className="btn-primary" onClick={handleCwwRegister}
              disabled={cwwLoading || !cwwEmail.trim() || !cwwPassword.trim() || !cwwCode.trim()}>
              {cwwLoading ? '注册中...' : '注册'}
            </button>
          </div>
          <div className="cww-login-link"
            onClick={() => { setCwwView('login'); setCwwError('') }}>
            已有账号？登录
          </div>
        </div>
      )}

      {/* ===== 已登录视图 ===== */}
      {cwwView === 'logged-in' && (
        <div>
          <div className="cww-user-info">
            <span className="cww-user-name">{cwwNickname || cwwEmail}</span>
            <span className="cww-credits">积分: {cwwCredits}</span>
            <button className="cww-btn-small"
              onClick={() => { setCwwView('recharge'); setRechargeStatus('idle') }}>
              充值
            </button>
            <button className="cww-btn-small" onClick={handleCwwLogout}>退出</button>
          </div>
          {cwwError && <div className="cww-error">{cwwError}</div>}
          {cwwModels.map((model) => (
            <div key={model.id}
              className={`model-settings-model-item${selectedModel === model.id ? ' selected' : ''}`}
              onClick={() => handleModelSelect(model.id)}>
              <div className="model-settings-model-name">{model.name}</div>
              <div className="model-settings-model-meta">
                <span>{model.provider}</span>
                <span>输入: {model.inputRate}/千token</span>
                <span>输出: {model.outputRate}/千token</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== 充值视图（扩展版） ===== */}
      {cwwView === 'recharge' && (
        <div className="cww-recharge-panel">
          {rechargeStatus === 'idle' && (
            <>
              <div className="cww-amount-grid">
                {[10, 30, 50, 100, 500, 1000, 2000].map((amt) => (
                  <div key={amt}
                    className={`cww-amount-btn${rechargeAmount === amt && !showCustomRecharge ? ' selected' : ''}`}
                    onClick={() => { setRechargeAmount(amt); setShowCustomRecharge(false) }}>
                    {amt} 元
                  </div>
                ))}
                <div
                  className={`cww-amount-btn${showCustomRecharge ? ' selected' : ''}`}
                  onClick={() => setShowCustomRecharge(true)}>
                  自定义
                </div>
              </div>
              {showCustomRecharge && (
                <input type="number" className="input-field"
                  placeholder="输入金额 (1-10000)"
                  value={customRechargeInput}
                  onChange={(e) => {
                    setCustomRechargeInput(e.target.value)
                    const val = parseInt(e.target.value, 10)
                    if (val >= 1 && val <= 10000) setRechargeAmount(val)
                  }}
                  min={1} max={10000}
                  style={{ marginBottom: '12px' }}
                />
              )}
              {cwwError && <div className="cww-error">{cwwError}</div>}
              <div className="cww-login-actions">
                <button className="btn-primary" onClick={handleRecharge}>
                  充值 {rechargeAmount} 元
                </button>
                <button className="btn-secondary" onClick={() => setCwwView('logged-in')}>
                  返回
                </button>
              </div>
            </>
          )}
          {rechargeStatus === 'paying' && (
            <>
              <div className="cww-recharge-info">请在浏览器中完成支付，支付完成后将自动更新积分...</div>
              <div className="cww-login-actions">
                <button className="btn-secondary"
                  onClick={() => { setRechargeStatus('idle'); setCwwView('logged-in') }}>
                  返回
                </button>
              </div>
            </>
          )}
          {rechargeStatus === 'success' && (
            <>
              <div className="cww-recharge-success">充值成功！当前积分: {cwwCredits}</div>
              <div className="cww-login-actions">
                <button className="btn-primary"
                  onClick={() => { setRechargeStatus('idle'); setCwwView('logged-in') }}>
                  返回
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>

    {/* ClawWin Tab Footer */}
    <div className="model-settings-footer">
      {cwwView === 'logged-in' && selectedModel ? (
        <>
          <div className="model-settings-apikey-row">
            <span className="cww-footer-info">
              已登录: {cwwNickname || cwwEmail} · 积分: {cwwCredits}
            </span>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存并应用'}
            </button>
          </div>
          {saveResult?.ok && (
            <div className="model-settings-status success">配置已保存，正在重启网关...</div>
          )}
          {saveResult && !saveResult.ok && (
            <div className="model-settings-status error">
              {saveResult.error || '保存失败，请重试'}
            </div>
          )}
        </>
      ) : (
        <div className="model-settings-footer-hint">
          {cwwView === 'logged-in' ? '请选择一个模型' : '请先登录 ClawWinWeb'}
        </div>
      )}
    </div>
  </>
```

最终三元结构为：
```
{activeTab === 'cloud' ? ( cloud... ) : activeTab === 'clawwin' ? ( clawwin... ) : ( <LocalModelSettings /> )}
```

---

## 文件 2：`src/components/Sidebar/SessionList.tsx`

### 2.1 新增 import

```ts
import React, { useState } from 'react'
```

### 2.2 Props 接口扩展

```ts
interface SessionListProps {
  sessions: ChatSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  cwwLoggedIn?: boolean       // ← 新增
  cwwNickname?: string        // ← 新增
  cwwCredits?: number         // ← 新增
  onOpenProfile?: () => void  // ← 新增
  onCwwLogout?: () => void    // ← 新增
}
```

解构时加入新 props。

### 2.3 新增 popover 状态

在函数体开头：

```ts
const [showPopover, setShowPopover] = useState(false)
```

### 2.4 在 `.session-list-items` 之后新增底部 footer

在 `</div>` (session-list-items 关闭标签) 之后、最外层 `</div>` (session-list 关闭标签) 之前插入：

```tsx
<div className="sidebar-user-footer">
  <div className="sidebar-user-btn" onClick={() => setShowPopover(!showPopover)}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
    <span>{cwwLoggedIn ? (cwwNickname || '个人中心') : '个人中心'}</span>
  </div>
  {showPopover && (
    <div className="user-popover">
      {cwwLoggedIn ? (
        <>
          <div className="user-popover-info">
            <span className="user-popover-name">{cwwNickname}</span>
            <span className="user-popover-credits">积分: {cwwCredits}</span>
          </div>
          <button className="user-popover-action"
            onClick={() => { setShowPopover(false); onOpenProfile?.() }}>
            充值积分
          </button>
          <button className="user-popover-action user-popover-logout"
            onClick={() => { setShowPopover(false); onCwwLogout?.() }}>
            退出登录
          </button>
        </>
      ) : (
        <button className="user-popover-action"
          onClick={() => { setShowPopover(false); onOpenProfile?.() }}>
          登录 ClawWinWeb
        </button>
      )}
    </div>
  )}
</div>
```

---

## 文件 3：`src/App.tsx`

### 3.1 新增状态变量

在现有状态声明区域（约行 33-58）末尾新增：

```ts
const [cwwState, setCwwState] = useState<{
  loggedIn: boolean; email: string; nickname: string; credits: number
}>({ loggedIn: false, email: '', nickname: '', credits: 0 })
const [modelSettingsTab, setModelSettingsTab] = useState<'cloud' | 'clawwin' | 'local' | undefined>(undefined)
```

### 3.2 挂载时读取 CWW 登录状态

在行 120-140 的 `useEffect([], ...)` 中，`window.electronAPI.app.getVersion()` 之后新增：

```ts
Promise.all([
  window.electronAPI.cww.getState(),
  window.electronAPI.config.getApiKey('clawwinweb:default'),
]).then(([state, key]) => {
  if (state && key) {
    setCwwState({
      loggedIn: true,
      email: state.email || '',
      nickname: state.nickname || '',
      credits: state.credits || 0,
    })
  }
}).catch(() => {})
```

### 3.3 新增 CWW 退出登录 handler

在 `handleSend` 之前新增：

```ts
const handleCwwLogout = useCallback(async () => {
  setCwwState({ loggedIn: false, email: '', nickname: '', credits: 0 })
  await window.electronAPI.cww.saveState({
    email: '', nickname: '', credits: 0, serverUrl: 'https://www.mybotworld.com',
  }).catch(() => {})
}, [])
```

### 3.4 修改 SessionList 传参

**替换行 597-603** 的 `<SessionList>` 调用：

```tsx
<SessionList
  sessions={sessions}
  activeSessionId={activeSessionId}
  onSelectSession={setActiveSessionId}
  onNewSession={createSession}
  onDeleteSession={deleteSession}
  cwwLoggedIn={cwwState.loggedIn}
  cwwNickname={cwwState.nickname}
  cwwCredits={cwwState.credits}
  onOpenProfile={() => {
    setModelSettingsTab('clawwin')
    setShowModelSettings(true)
  }}
  onCwwLogout={handleCwwLogout}
/>
```

### 3.5 修改 ModelSettings 传参

**替换行 786-813** 的 `<ModelSettings>` 调用：

```tsx
<ModelSettings
  currentProvider={setup.config.provider}
  currentModel={setup.config.modelId}
  initialTab={modelSettingsTab}
  onClose={() => { setShowModelSettings(false); setModelSettingsTab(undefined) }}
  onSaved={() => {
    setShowModelSettings(false)
    setModelSettingsTab(undefined)
    // 以下为现有的 onSaved 逻辑，保持不变
    window.electronAPI.config.readConfig().then((savedConfig) => {
      if (savedConfig) {
        const agents = (savedConfig as Record<string, unknown>).agents as Record<string, unknown> | undefined
        const defaults = agents?.defaults as Record<string, unknown> | undefined
        const modelCfg = defaults?.model as Record<string, unknown> | undefined
        const primary = modelCfg?.primary as string | undefined
        if (primary?.includes('/')) {
          const idx = primary.indexOf('/')
          const modelsMap = defaults?.models as Record<string, { alias?: string }> | undefined
          setup.updateConfig({
            provider: primary.slice(0, idx),
            modelId: primary.slice(idx + 1),
            modelName: modelsMap?.[primary]?.alias || primary.slice(idx + 1),
          })
        }
      }
    }).catch(() => {})
    gateway.restart().catch((err) => console.error('gateway restart failed:', err))
  }}
  onCwwStateChange={(state) => setCwwState(state)}
/>
```

---

## 文件 4：`src/index.css`

### 4.1 Tab padding 微调（适配 3 个标签）

找到 `.model-settings-tab`（约行 4661），将 `padding: 6px 20px;` 改为：

```css
padding: 6px 16px;
```

### 4.2 新增 CWW 面板居中样式

在现有 `.cww-login-panel` 样式之后新增：

```css
.cww-panel-center {
  max-width: 360px;
  margin: 40px auto 0;
}
```

### 4.3 新增侧边栏底部 Footer 样式

在文件末尾追加：

```css
/* ===== 侧边栏个人中心 ===== */
.sidebar-user-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  position: relative;
}

.sidebar-user-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  transition: all 0.15s;
}

.sidebar-user-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.user-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 16px;
  right: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-popover-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--border);
}

.user-popover-name {
  font-weight: 500;
  font-size: 14px;
}

.user-popover-credits {
  font-size: 12px;
  color: #22c55e;
  font-weight: 600;
  background: rgba(34, 197, 94, 0.1);
  padding: 2px 8px;
  border-radius: 6px;
}

.user-popover-action {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.user-popover-action:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.user-popover-logout:hover {
  border-color: #ef4444;
  color: #ef4444;
}
```

---

## 执行策略

可 **2 个 Agent 并行**：

| Agent | 文件 | 说明 |
|-------|------|------|
| A | `ModelSettings.tsx` | 步骤 1.1 → 1.9，改动量最大 |
| B | `SessionList.tsx` + `App.tsx` + `index.css` | 步骤 2.1-2.4 + 3.1-3.5 + 4.1-4.3 |

## 验证

完成后运行 `npm run build`，确认 TypeScript 编译零错误。

## 检查清单

- [ ] 设置 → 大模型 → 看到 3 个标签：云端模型 | ClawWin模型 | 本地模型
- [ ] 云端模型 tab 不再显示 ClawWinWeb 卡片
- [ ] ClawWin模型 tab 登录 / 注册 / 选模型 / 充值正常
- [ ] 充值面板显示 10 / 30 / 50 / 100 / 500 / 1000 / 2000 / 自定义
- [ ] 自定义金额输入框可输入 1-10000
- [ ] 聊天页左侧栏底部显示个人中心按钮
- [ ] 未登录点击 → 弹窗显示「登录 ClawWinWeb」→ 点击跳转到 ModelSettings ClawWin模型 tab
- [ ] 已登录点击 → 弹窗显示昵称、积分、充值、退出登录
- [ ] 退出登录后侧边栏恢复显示「个人中心」
