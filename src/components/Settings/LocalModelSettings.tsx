import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { OllamaStatus, LocalModelState, HardwareInfo } from '../../types'

interface LocalModelSettingsProps {
  onSaved: () => void
}

// 预置推荐模型列表（按推荐度排序，最新最强在前）
const RECOMMENDED_MODELS = [
  // ===== 推荐首选（8GB 内存） =====
  {
    id: 'qwen3:8b',
    name: 'Qwen3 8B',
    description: '最新通义千问3，思考+对话双模式，中文最强',
    size: '5.0GB',
    sizeBytes: 5_368_000_000,
    minMemory: '8GB',
    minMemoryBytes: 8_589_934_592,
    tags: ['推荐', '中文强', '推理'],
  },
  {
    id: 'glm-z1:9b',
    name: 'GLM-Z1 9B',
    description: '智谱深度推理模型，数学能力极强，中文优秀',
    size: '6.2GB',
    sizeBytes: 6_656_000_000,
    minMemory: '8GB',
    minMemoryBytes: 8_589_934_592,
    tags: ['推理', '中文强'],
  },
  {
    id: 'deepseek-r1:7b',
    name: 'DeepSeek-R1 7B',
    description: '深度推理蒸馏版，数学/代码/逻辑推理强',
    size: '4.7GB',
    sizeBytes: 5_046_000_000,
    minMemory: '8GB',
    minMemoryBytes: 8_589_934_592,
    tags: ['推理'],
  },
  // ===== 进阶选择（16GB 内存） =====
  {
    id: 'qwen3:14b',
    name: 'Qwen3 14B',
    description: '更强的 Qwen3，效果显著提升，推荐 16GB 用户',
    size: '9.0GB',
    sizeBytes: 9_660_000_000,
    minMemory: '16GB',
    minMemoryBytes: 17_179_869_184,
    tags: ['推荐', '中文强', '推理'],
  },
  {
    id: 'deepseek-r1:14b',
    name: 'DeepSeek-R1 14B',
    description: '更强推理蒸馏版，复杂任务首选',
    size: '9.0GB',
    sizeBytes: 9_660_000_000,
    minMemory: '16GB',
    minMemoryBytes: 17_179_869_184,
    tags: ['推理'],
  },
  {
    id: 'gemma3:12b',
    name: 'Gemma 3 12B',
    description: 'Google 最新开源模型，128K 上下文，多语言',
    size: '7.3GB',
    sizeBytes: 7_840_000_000,
    minMemory: '10GB',
    minMemoryBytes: 10_737_418_240,
    tags: ['多语言'],
  },
  // ===== 高配选择（24GB+ 内存） =====
  {
    id: 'qwen3:32b',
    name: 'Qwen3 32B',
    description: '大参数 Qwen3，各项能力大幅提升',
    size: '19.8GB',
    sizeBytes: 21_260_000_000,
    minMemory: '24GB',
    minMemoryBytes: 25_769_803_776,
    tags: ['高配', '推理', '中文强'],
  },
  {
    id: 'qwen3:30b-a3b',
    name: 'Qwen3 30B-A3B',
    description: 'MoE 架构，30B 参数仅需 3B 运算，性价比极高',
    size: '18.6GB',
    sizeBytes: 19_972_000_000,
    minMemory: '24GB',
    minMemoryBytes: 25_769_803_776,
    tags: ['高配', 'MoE', '推理'],
  },
  {
    id: 'glm4.7-flash:30b',
    name: 'GLM-4.7 Flash',
    description: '智谱最强开源模型，MoE 架构，AIME 91.6分',
    size: '18.3GB',
    sizeBytes: 19_650_000_000,
    minMemory: '24GB',
    minMemoryBytes: 25_769_803_776,
    tags: ['高配', 'MoE', '推理', '中文强'],
  },
  {
    id: 'deepseek-r1:32b',
    name: 'DeepSeek-R1 32B',
    description: '最强推理蒸馏版，接近 GPT-4o 推理水平',
    size: '19.9GB',
    sizeBytes: 21_370_000_000,
    minMemory: '24GB',
    minMemoryBytes: 25_769_803_776,
    tags: ['高配', '推理'],
  },
  // ===== 专业级（48-64GB 内存） =====
  {
    id: 'llama3.3:70b',
    name: 'Llama 3.3 70B',
    description: 'Meta 最强开源模型，综合能力强',
    size: '42.5GB',
    sizeBytes: 45_618_000_000,
    minMemory: '48GB',
    minMemoryBytes: 51_539_607_552,
    tags: ['专业级', '英文强'],
  },
  {
    id: 'llama4-scout:109b',
    name: 'Llama 4 Scout 109B',
    description: 'Meta 最新 MoE 模型，10M 上下文，多模态',
    size: '65.4GB',
    sizeBytes: 70_214_000_000,
    minMemory: '80GB',
    minMemoryBytes: 85_899_345_920,
    tags: ['专业级', 'MoE'],
  },
  // ===== 旗舰级（128GB+ 内存） =====
  {
    id: 'qwen3:235b-a22b',
    name: 'Qwen3 235B-A22B',
    description: '通义千问旗舰 MoE，235B 参数 22B 激活，最强中文',
    size: '142GB',
    sizeBytes: 152_500_000_000,
    minMemory: '192GB',
    minMemoryBytes: 206_158_430_208,
    tags: ['旗舰', 'MoE', '推理', '中文强'],
  },
  {
    id: 'glm-4.7:358b',
    name: 'GLM-4.7 358B',
    description: '智谱旗舰 MoE 模型，全面超越 GPT-4o',
    size: '216GB',
    sizeBytes: 231_900_000_000,
    minMemory: '256GB',
    minMemoryBytes: 274_877_906_944,
    tags: ['旗舰', 'MoE', '推理', '中文强'],
  },
  {
    id: 'deepseek-r1:671b',
    name: 'DeepSeek-R1 671B',
    description: 'DeepSeek 满血版，最强开源推理模型',
    size: '404GB',
    sizeBytes: 433_800_000_000,
    minMemory: '512GB',
    minMemoryBytes: 549_755_813_888,
    tags: ['旗舰', 'MoE', '推理'],
  },
  {
    id: 'glm-5:744b',
    name: 'GLM-5 744B',
    description: '智谱最新旗舰，744B MoE，开源最强之一',
    size: '456GB',
    sizeBytes: 489_600_000_000,
    minMemory: '512GB',
    minMemoryBytes: 549_755_813_888,
    tags: ['旗舰', 'MoE', '推理', '中文强'],
  },
  {
    id: 'kimi-k2:1t',
    name: 'Kimi K2 1T',
    description: 'Moonshot 旗舰，1万亿参数 MoE，32B 激活',
    size: '621GB',
    sizeBytes: 666_900_000_000,
    minMemory: '768GB',
    minMemoryBytes: 824_633_720_832,
    tags: ['旗舰', 'MoE', '中文强'],
  },
  // ===== 轻量选择（4GB 内存） =====
  {
    id: 'qwen2.5:3b',
    name: 'Qwen2.5 3B',
    description: '超轻量通义千问，4GB 内存即可运行',
    size: '2.0GB',
    sizeBytes: 2_150_000_000,
    minMemory: '4GB',
    minMemoryBytes: 4_294_967_296,
    tags: ['轻量'],
  },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

export const LocalModelSettings: React.FC<LocalModelSettingsProps> = ({ onSaved }) => {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>({ installed: false, running: false })
  const [installedModels, setInstalledModels] = useState<string[]>([])
  const [downloadState, setDownloadState] = useState<LocalModelState | null>(null)
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const [starting, setStarting] = useState(false)
  const [applyingModel, setApplyingModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unsubProgressRef = useRef<(() => void) | null>(null)
  const unsubStatusRef = useRef<(() => void) | null>(null)

  // Subscribe to progress events
  useEffect(() => {
    unsubProgressRef.current = window.electronAPI.ollama.onProgress((state) => {
      if (state.id === '__ollama_install__') {
        // Ollama install progress
        if (state.status === 'ready') {
          setInstalling(false)
          refreshStatus()
        }
      } else {
        setDownloadState(state as LocalModelState)
        if (state.status === 'ready') {
          // Model downloaded, refresh list
          refreshModels()
        }
      }
    })

    unsubStatusRef.current = window.electronAPI.ollama.onStatusChange((status) => {
      setOllamaStatus(status)
    })

    return () => {
      unsubProgressRef.current?.()
      unsubStatusRef.current?.()
    }
  }, [])

  // Initial load
  useEffect(() => {
    refreshStatus()
    refreshHardware()
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.ollama.getStatus()
      setOllamaStatus(status)
      if (status.running) {
        refreshModels()
      }
    } catch { /* ignore */ }
  }, [])

  const refreshModels = useCallback(async () => {
    try {
      const models = await window.electronAPI.ollama.listLocalModels()
      setInstalledModels(models)
    } catch { /* ignore */ }
  }, [])

  const refreshHardware = useCallback(async () => {
    try {
      const info = await window.electronAPI.ollama.getHardwareInfo()
      setHardware(info)
    } catch { /* ignore */ }
  }, [])

  const handleInstallOllama = useCallback(async () => {
    setInstalling(true)
    setError(null)
    try {
      await window.electronAPI.ollama.install()
    } catch (err) {
      setError(`安装失败: ${err instanceof Error ? err.message : String(err)}`)
      setInstalling(false)
    }
  }, [])

  const handleStartOllama = useCallback(async () => {
    setStarting(true)
    setError(null)
    try {
      await window.electronAPI.ollama.start()
      await refreshStatus()
      await refreshModels()
    } catch (err) {
      setError(`启动失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setStarting(false)
    }
  }, [refreshStatus, refreshModels])

  const handleDownload = useCallback(async (modelId: string) => {
    setError(null)
    setDownloadState({ id: modelId, status: 'downloading', progress: 0 })
    try {
      await window.electronAPI.ollama.downloadModel(modelId)
    } catch (err) {
      setError(`下载失败: ${err instanceof Error ? err.message : String(err)}`)
      setDownloadState(null)
    }
  }, [])

  const handleCancelDownload = useCallback(() => {
    window.electronAPI.ollama.cancelDownload()
    setDownloadState(null)
  }, [])

  const handleDelete = useCallback(async (modelId: string) => {
    setError(null)
    try {
      await window.electronAPI.ollama.deleteModel(modelId)
      await refreshModels()
    } catch (err) {
      setError(`删除失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [refreshModels])

  const handleApply = useCallback(async (modelId: string) => {
    setError(null)
    setApplyingModel(modelId)
    try {
      await window.electronAPI.ollama.applyModel(modelId)
      onSaved()
    } catch (err) {
      setError(`配置失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setApplyingModel(null)
    }
  }, [onSaved])

  const isModelInstalled = (modelId: string) => {
    return installedModels.some(m => m === modelId || m.startsWith(modelId.split(':')[0]))
  }

  const isDownloading = downloadState && (downloadState.status === 'downloading' || downloadState.status === 'importing')

  return (
    <div className="local-model-body">
      {/* Ollama Status */}
      <div className="local-model-status-bar">
        <div className="local-model-status-left">
          <span className={`local-model-status-dot ${ollamaStatus.running ? 'running' : ollamaStatus.installed ? 'stopped' : 'not-installed'}`} />
          <span className="local-model-status-text">
            Ollama: {ollamaStatus.running ? `运行中${ollamaStatus.version ? ` (v${ollamaStatus.version})` : ''}` : ollamaStatus.installed ? '已安装，未运行' : '未安装'}
          </span>
        </div>
        <div className="local-model-status-actions">
          {!ollamaStatus.installed && (
            <button className="btn-primary" onClick={handleInstallOllama} disabled={installing}>
              {installing ? '安装中...' : '一键安装'}
            </button>
          )}
          {ollamaStatus.installed && !ollamaStatus.running && (
            <button className="btn-primary" onClick={handleStartOllama} disabled={starting}>
              {starting ? '启动中...' : '启动 Ollama'}
            </button>
          )}
          {ollamaStatus.running && (
            <button className="btn-secondary" style={{ fontSize: '12px', padding: '4px 12px' }} onClick={refreshStatus}>
              刷新
            </button>
          )}
        </div>
      </div>

      {/* Hardware Info */}
      {hardware && (
        <div className="local-model-hardware">
          内存: {formatBytes(hardware.totalMemory)} (可用 {formatBytes(hardware.freeMemory)})
          {hardware.gpuName && ` | GPU: ${hardware.gpuName}`}
          {hardware.gpuMemory && ` (${formatBytes(hardware.gpuMemory)})`}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="local-model-error">{error}</div>
      )}

      {/* Download Progress */}
      {isDownloading && downloadState && (
        <div className="local-model-download-bar">
          <div className="local-model-download-info">
            <span>
              {downloadState.status === 'importing' ? '导入中...' : `下载中: ${RECOMMENDED_MODELS.find(m => m.id === downloadState.id)?.name ?? downloadState.id}`}
              {downloadState.currentFile && downloadState.totalFileCount ? ` (文件 ${downloadState.currentFile}/${downloadState.totalFileCount})` : ''}
            </span>
            <span>{downloadState.progress ?? 0}%{downloadState.downloadedBytes && downloadState.totalBytes ? ` (${formatBytes(downloadState.downloadedBytes)}/${formatBytes(downloadState.totalBytes)})` : ''}</span>
          </div>
          <div className="local-model-progress-track">
            <div className="local-model-progress-fill" style={{ width: `${downloadState.progress ?? 0}%` }} />
          </div>
          <button className="btn-secondary" style={{ fontSize: '12px', padding: '4px 12px', marginTop: '8px' }} onClick={handleCancelDownload}>
            取消
          </button>
        </div>
      )}

      {/* Installed Models */}
      {installedModels.length > 0 && (
        <div className="local-model-section">
          <div className="local-model-section-title">已下载模型</div>
          {installedModels.map((modelName) => {
            const def = RECOMMENDED_MODELS.find(m => modelName === m.id || modelName.startsWith(m.id.split(':')[0]))
            return (
              <div key={modelName} className="local-model-card installed">
                <div className="local-model-card-info">
                  <div className="local-model-card-name">{def?.name ?? modelName}</div>
                  <div className="local-model-card-desc">{def?.description ?? '自定义模型'}</div>
                </div>
                <div className="local-model-card-actions">
                  <button
                    className="btn-primary"
                    style={{ fontSize: '12px', padding: '6px 16px' }}
                    onClick={() => handleApply(modelName)}
                    disabled={applyingModel === modelName}
                  >
                    {applyingModel === modelName ? '配置中...' : '使用此模型'}
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDelete(modelName)}
                  >
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recommended Models */}
      <div className="local-model-section">
        <div className="local-model-section-title">推荐模型</div>
        {RECOMMENDED_MODELS.map((model) => {
          const installed = isModelInstalled(model.id)
          const isCurrentDownload = downloadState?.id === model.id && isDownloading
          const memoryOk = hardware ? hardware.totalMemory >= model.minMemoryBytes : true

          return (
            <div key={model.id} className={`local-model-card${installed ? ' installed' : ''}${!memoryOk ? ' warn' : ''}`}>
              <div className="local-model-card-info">
                <div className="local-model-card-header">
                  <span className="local-model-card-name">{model.name}</span>
                  <div className="local-model-card-tags">
                    {model.tags.map((tag) => (
                      <span key={tag} className="local-model-tag">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="local-model-card-desc">{model.description}</div>
                <div className="local-model-card-meta">
                  <span>{model.size}</span>
                  <span>需 {model.minMemory} 内存</span>
                  {!memoryOk && <span className="local-model-warn-text">内存不足</span>}
                </div>
              </div>
              <div className="local-model-card-actions">
                {installed ? (
                  <button
                    className="btn-primary"
                    style={{ fontSize: '12px', padding: '6px 16px' }}
                    onClick={() => handleApply(model.id)}
                    disabled={applyingModel === model.id}
                  >
                    {applyingModel === model.id ? '配置中...' : '使用此模型'}
                  </button>
                ) : isCurrentDownload ? (
                  <span style={{ fontSize: '12px', color: 'var(--accent)' }}>下载中...</span>
                ) : (
                  <button
                    className="btn-primary"
                    style={{ fontSize: '12px', padding: '6px 16px' }}
                    onClick={() => handleDownload(model.id)}
                    disabled={!!isDownloading || !ollamaStatus.running}
                  >
                    下载
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!ollamaStatus.running && !ollamaStatus.installed && (
        <div className="local-model-hint">
          需要先安装 Ollama 才能使用本地模型。点击上方"一键安装"按钮即可自动完成。
        </div>
      )}
    </div>
  )
}
