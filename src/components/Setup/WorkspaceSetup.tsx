import React, { useState, useCallback } from 'react'

interface WorkspaceSetupProps {
  workspace: string
  onBack: () => void
  onNext: (workspace: string) => void
}

export const WorkspaceSetup: React.FC<WorkspaceSetupProps> = ({
  workspace: initialWorkspace,
  onBack,
  onNext,
}) => {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [error, setError] = useState<string | null>(null)

  const handleNext = useCallback(() => {
    const trimmed = workspace.trim()
    if (!trimmed) {
      setError('请输入工作空间路径')
      return
    }
    // Basic path validation: must look like an absolute path
    const isAbsolute =
      trimmed.startsWith('/') ||
      /^[A-Za-z]:[\\/]/.test(trimmed) ||
      trimmed.startsWith('~/')
    if (!isAbsolute) {
      setError('请输入绝对路径，例如 C:\\Users\\用户名\\openclaw 或 ~/openclaw')
      return
    }
    setError(null)
    onNext(trimmed)
  }, [workspace, onNext])

  return (
    <div className="setup-page workspace-setup">
      <h2 className="setup-title">工作空间</h2>
      <p className="setup-subtitle">选择 OpenClaw 的工作目录</p>

      <div className="workspace-form">
        <div className="workspace-description">
          <div className="info-card">
            <span className="info-icon">&#128193;</span>
            <div>
              <strong>什么是工作空间？</strong>
              <p>工作空间是 OpenClaw 存储对话上下文和配置的目录。所有会话数据、记忆和项目文件都将保存在此处。</p>
            </div>
          </div>
        </div>

        <label className="input-label" htmlFor="workspace-path">
          工作空间路径
        </label>
        <div className="workspace-input-group">
          <input
            id="workspace-path"
            type="text"
            className="input-field input-workspace"
            placeholder="例如: C:\Users\用户名\openclaw"
            value={workspace}
            onChange={(e) => {
              setWorkspace(e.target.value)
              setError(null)
            }}
            autoFocus
          />
        </div>

        {error && (
          <div className="workspace-error">{error}</div>
        )}

        <div className="workspace-hint">
          <p>如果目录不存在，将自动创建。默认路径通常无需修改。</p>
        </div>
      </div>

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        <button className="btn-primary" onClick={handleNext}>
          下一步
        </button>
      </div>
    </div>
  )
}
