import React, { useState, useCallback, useEffect } from 'react'

interface ClawWinSetupProps {
  onBack: () => void
  onNext: (token: string) => void
  onSkip: () => void
}

const CWW_SERVER_URL = 'https://www.mybotworld.com'

export const ClawWinSetup: React.FC<ClawWinSetupProps> = ({ onBack, onNext, onSkip }) => {
  const [view, setView] = useState<'register' | 'login'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [codeCountdown, setCodeCountdown] = useState(0)

  useEffect(() => {
    if (codeCountdown <= 0) return
    const timer = setTimeout(() => setCodeCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [codeCountdown])

  const handleLogin = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const res = await window.electronAPI.cww.login({
        serverUrl: CWW_SERVER_URL,
        email,
        password,
      })
      const t = res.token
      setToken(t)
      await window.electronAPI.cww.saveState({
        email,
        nickname: res.user?.nickname ?? '',
        credits: res.user?.credits ?? 0,
        serverUrl: CWW_SERVER_URL,
        encPassword: btoa(password),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || '登录失败')
    } finally {
      setLoading(false)
    }
  }, [email, password])

  const handleRegister = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const res = await window.electronAPI.cww.register({
        serverUrl: CWW_SERVER_URL,
        email,
        password,
        nickname,
        code,
      })
      const t = res.token
      setToken(t)
      await window.electronAPI.cww.saveState({
        email,
        nickname: res.user?.nickname ?? '',
        credits: res.user?.credits ?? 0,
        serverUrl: CWW_SERVER_URL,
        encPassword: btoa(password),
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || '注册失败')
    } finally {
      setLoading(false)
    }
  }, [email, password, nickname, code])

  const handleSendCode = useCallback(async () => {
    setError('')
    try {
      await window.electronAPI.cww.sendCode({ serverUrl: CWW_SERVER_URL, email })
      setCodeCountdown(60)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || '发送验证码失败')
    }
  }, [email])

  const isLoggedIn = !!token

  return (
    <div className="setup-page clawwin-setup-page">
      <h2 className="setup-title">
        {isLoggedIn ? '登录成功' : view === 'register' ? '注册 ClawWin 云模型' : '登录 ClawWin 云模型'}
      </h2>
      <p className="setup-description">
        {isLoggedIn ? '已准备好使用 ClawWin 云端模型' : '注册即可使用多种顶级 AI 模型'}
      </p>

      {/* 登录成功 */}
      {isLoggedIn && (
        <div className="setup-features" style={{ marginBottom: 24 }}>
          <div className="info-card">
            <span className="info-icon">&#9989;</span>
            <div>
              <strong>账号: {email}</strong>
              <p>点击"下一步"继续配置</p>
            </div>
          </div>
        </div>
      )}

      {/* 注册表单 */}
      {!isLoggedIn && view === 'register' && (
        <div className="cww-login-panel cww-panel-center" style={{ marginTop: 0 }}>
          <input type="email" placeholder="邮箱" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="密码" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <div className="cww-code-row">
            <input type="text" placeholder="验证码" value={code}
              onChange={(e) => setCode(e.target.value)} />
            <button onClick={handleSendCode}
              disabled={codeCountdown > 0 || !email.trim()}>
              {codeCountdown > 0 ? `${codeCountdown}s` : '发送验证码'}
            </button>
          </div>
          {error && <div className="cww-error">{error}</div>}
          <div className="cww-login-actions">
            <button className="btn-primary" onClick={handleRegister}
              disabled={loading || !email.trim() || !password.trim() || !code.trim()}>
              {loading ? '注册中...' : '注册'}
            </button>
          </div>
          <p className="cww-setup-hint">
            注册即可使用 GPT、Claude、Gemini 等 20+ 顶级模型，免配置 API Key，比云厂商便宜 10~20%
          </p>
          <div className="cww-login-link" onClick={() => { setView('login'); setError('') }}>
            已有账号？登录
          </div>
        </div>
      )}

      {/* 登录表单 */}
      {!isLoggedIn && view === 'login' && (
        <div className="cww-login-panel cww-panel-center" style={{ marginTop: 0 }}>
          <input type="email" placeholder="邮箱" value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder="密码" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="cww-error">{error}</div>}
          <div className="cww-login-actions">
            <button className="btn-primary" onClick={handleLogin}
              disabled={loading || !email.trim() || !password.trim()}>
              {loading ? '登录中...' : '登录'}
            </button>
          </div>
          <div className="cww-login-link" onClick={() => { setView('register'); setError('') }}>
            没有账号？注册
          </div>
        </div>
      )}

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button className="btn-secondary" onClick={onSkip}>跳过</button>
        <button
          className="btn-primary"
          onClick={() => onNext(token)}
          disabled={!isLoggedIn}
        >
          下一步
        </button>
      </div>
    </div>
  )
}
