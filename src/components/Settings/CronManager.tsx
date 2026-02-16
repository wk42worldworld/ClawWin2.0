import { useState, useEffect, useCallback } from 'react'
import { useCron, type CronJob } from '../../hooks/useCron'
import type { GatewayClient } from '../../lib/gateway-protocol'

/* ─── Types ─── */

interface CronManagerProps {
  client: GatewayClient | null
  connected: boolean
  onClose: () => void
}

type ScheduleKind = 'cron' | 'at' | 'every'

interface CronFormData {
  name: string
  scheduleKind: ScheduleKind
  scheduleExpr: string
  tz: string
  wakeMode: string
  message: string
  enabled: boolean
}

const SCHEDULE_PLACEHOLDERS: Record<ScheduleKind, string> = {
  cron: '0 9 * * * (每天9点)',
  at: '2026-03-01T09:00:00Z',
  every: '3600000 (毫秒)',
}

function emptyForm(): CronFormData {
  return {
    name: '',
    scheduleKind: 'cron',
    scheduleExpr: '',
    tz: 'Asia/Shanghai',
    wakeMode: 'main',
    message: '',
    enabled: true,
  }
}

function jobToForm(job: CronJob): CronFormData {
  return {
    name: job.name,
    scheduleKind: job.schedule.kind,
    scheduleExpr: job.schedule.expr,
    tz: job.schedule.tz ?? 'Asia/Shanghai',
    wakeMode: job.wakeMode ?? 'main',
    message: job.payload.text ?? job.payload.message ?? '',
    enabled: job.enabled,
  }
}

function formToJobData(form: CronFormData): Omit<CronJob, 'jobId'> {
  return {
    name: form.name,
    schedule: {
      kind: form.scheduleKind,
      expr: form.scheduleExpr,
      ...(form.scheduleKind === 'cron' ? { tz: form.tz } : {}),
    },
    wakeMode: form.wakeMode,
    payload: {
      kind: 'text',
      text: form.message,
    },
    enabled: form.enabled,
  }
}

/* ─── CronJobForm ─── */

interface CronJobFormProps {
  initialData?: CronJob | null
  onSave: (data: Omit<CronJob, 'jobId'>) => void
  onCancel: () => void
}

function CronJobForm({ initialData, onSave, onCancel }: CronJobFormProps) {
  const [form, setForm] = useState<CronFormData>(() =>
    initialData ? jobToForm(initialData) : emptyForm()
  )

  const updateField = useCallback(<K extends keyof CronFormData>(key: K, value: CronFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = useCallback(() => {
    if (!form.name.trim() || !form.scheduleExpr.trim()) return
    onSave(formToJobData(form))
  }, [form, onSave])

  return (
    <div className="channel-dialog-overlay" onClick={onCancel}>
      <div className="channel-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="channel-dialog-header">
          <h3>{initialData ? '编辑任务' : '新建任务'}</h3>
        </div>
        <div className="channel-dialog-body">
          {/* 任务名称 */}
          <div className="cron-form-field">
            <label className="cron-form-label">任务名称</label>
            <input
              type="text"
              className="input-field"
              placeholder="例如: 每日早报"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
            />
          </div>

          {/* 调度类型 */}
          <div className="cron-form-field">
            <label className="cron-form-label">调度类型</label>
            <select
              className="cron-form-select"
              value={form.scheduleKind}
              onChange={(e) => updateField('scheduleKind', e.target.value as ScheduleKind)}
            >
              <option value="cron">cron (定时重复)</option>
              <option value="at">at (单次定时)</option>
              <option value="every">every (固定间隔)</option>
            </select>
          </div>

          {/* 调度表达式 */}
          <div className="cron-form-field">
            <label className="cron-form-label">调度表达式</label>
            <input
              type="text"
              className="input-field"
              placeholder={SCHEDULE_PLACEHOLDERS[form.scheduleKind]}
              value={form.scheduleExpr}
              onChange={(e) => updateField('scheduleExpr', e.target.value)}
            />
          </div>

          {/* 时区 (仅 cron) */}
          {form.scheduleKind === 'cron' && (
            <div className="cron-form-field">
              <label className="cron-form-label">时区</label>
              <input
                type="text"
                className="input-field"
                placeholder="Asia/Shanghai"
                value={form.tz}
                onChange={(e) => updateField('tz', e.target.value)}
              />
            </div>
          )}

          {/* 执行模式 */}
          <div className="cron-form-field">
            <label className="cron-form-label">执行模式</label>
            <select
              className="cron-form-select"
              value={form.wakeMode}
              onChange={(e) => updateField('wakeMode', e.target.value)}
            >
              <option value="main">main (主会话)</option>
              <option value="isolated">isolated (独立会话)</option>
            </select>
          </div>

          {/* 消息内容 */}
          <div className="cron-form-field">
            <label className="cron-form-label">消息内容</label>
            <textarea
              className="cron-form-textarea"
              placeholder="触发时发送给 AI 的消息..."
              rows={4}
              value={form.message}
              onChange={(e) => updateField('message', e.target.value)}
            />
          </div>

          {/* 启用 */}
          <div className="cron-form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <label className="cron-form-label" style={{ marginBottom: 0 }}>启用</label>
            <div
              className={`channel-toggle${form.enabled ? ' channel-toggle-on' : ''}`}
              onClick={() => updateField('enabled', !form.enabled)}
            >
              <div className="channel-toggle-thumb" />
            </div>
          </div>
        </div>

        <div className="channel-dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>取消</button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!form.name.trim() || !form.scheduleExpr.trim()}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── CronJobCard ─── */

interface CronJobCardProps {
  job: CronJob
  onToggle: (jobId: string, enabled: boolean) => void
  onEdit: (job: CronJob) => void
  onDelete: (jobId: string) => void
  onRun: (jobId: string) => void
}

function CronJobCard({ job, onToggle, onEdit, onDelete, onRun }: CronJobCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleDelete = useCallback(() => {
    if (confirmDelete) {
      onDelete(job.jobId)
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
    }
  }, [confirmDelete, job.jobId, onDelete])

  const handleCancelDelete = useCallback(() => {
    setConfirmDelete(false)
  }, [])

  const kindLabel: Record<string, string> = {
    cron: 'CRON',
    at: 'AT',
    every: 'EVERY',
  }

  return (
    <div className="cron-job-card">
      <div className="cron-job-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="cron-job-name">{job.name}</span>
          <span className={`cron-job-schedule-badge cron-badge-${job.schedule.kind}`}>
            {kindLabel[job.schedule.kind] ?? job.schedule.kind}
          </span>
        </div>
        <div
          className={`channel-toggle${job.enabled ? ' channel-toggle-on' : ''}`}
          onClick={() => onToggle(job.jobId, !job.enabled)}
        >
          <div className="channel-toggle-thumb" />
        </div>
      </div>

      <div className="cron-job-schedule">
        <code>{job.schedule.expr}</code>
        {job.schedule.tz && (
          <span style={{ marginLeft: 8, opacity: 0.6, fontSize: '0.85em' }}>({job.schedule.tz})</span>
        )}
      </div>

      <div className="cron-job-actions">
        <button className="btn-secondary" onClick={() => onEdit(job)}>编辑</button>
        <button className="btn-secondary" onClick={handleDelete}>
          {confirmDelete ? '确认删除' : '删除'}
        </button>
        {confirmDelete && (
          <button className="btn-secondary" onClick={handleCancelDelete}>取消</button>
        )}
        <button className="btn-secondary" onClick={() => onRun(job.jobId)}>立即执行</button>
      </div>

      {/* Confirm delete overlay */}
      {confirmDelete && (
        <div className="cron-confirm-overlay">
          <span>确定要删除任务 "{job.name}" 吗？</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-primary" onClick={() => { onDelete(job.jobId); setConfirmDelete(false) }}>
              确认删除
            </button>
            <button className="btn-secondary" onClick={handleCancelDelete}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── CronManager (main export) ─── */

export function CronManager({ client, connected, onClose }: CronManagerProps) {
  const cron = useCron({ client, connected })
  const [showForm, setShowForm] = useState(false)
  const [editingJob, setEditingJob] = useState<CronJob | null>(null)

  // Fetch jobs on mount and when connection changes
  useEffect(() => {
    if (connected && client) {
      cron.fetchJobs()
    }
  }, [connected, client])

  const handleAdd = useCallback(() => {
    setEditingJob(null)
    setShowForm(true)
  }, [])

  const handleEdit = useCallback((job: CronJob) => {
    setEditingJob(job)
    setShowForm(true)
  }, [])

  const handleFormSave = useCallback(async (data: Omit<CronJob, 'jobId'>) => {
    let ok: boolean
    if (editingJob) {
      ok = await cron.updateJob(editingJob.jobId, data)
    } else {
      ok = await cron.addJob(data)
    }
    if (ok) {
      setShowForm(false)
      setEditingJob(null)
    }
  }, [editingJob, cron])

  const handleFormCancel = useCallback(() => {
    setShowForm(false)
    setEditingJob(null)
  }, [])

  const handleToggle = useCallback((jobId: string, enabled: boolean) => {
    cron.toggleJob(jobId, enabled)
  }, [cron])

  const handleDelete = useCallback((jobId: string) => {
    cron.removeJob(jobId)
  }, [cron])

  const handleRun = useCallback((jobId: string) => {
    cron.runJob(jobId)
  }, [cron])

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>定时任务</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          {/* Not connected state */}
          {!connected && (
            <div className="cron-disconnected">
              <div className="cron-disconnected-icon">&#x1F50C;</div>
              <div className="cron-empty-text">网关未连接</div>
              <div className="cron-empty-hint">请先启动网关服务后再管理定时任务</div>
            </div>
          )}

          {/* Connected: show toolbar + content */}
          {connected && (
            <>
              {/* Toolbar */}
              <div className="cron-toolbar">
                <button className="btn-primary" onClick={handleAdd}>
                  新建任务
                </button>
                <button className="btn-secondary" onClick={() => cron.fetchJobs()}>
                  刷新
                </button>
              </div>

              {/* Error display */}
              {cron.error && (
                <div className="cron-error">
                  {cron.error}
                </div>
              )}

              {/* Loading spinner */}
              {cron.loading && (
                <div className="cron-empty">
                  <div className="loading-spinner" style={{ width: 32, height: 32 }} />
                  <div style={{ marginTop: 12 }}>加载中...</div>
                </div>
              )}

              {/* Job list */}
              {!cron.loading && cron.jobs.length > 0 && (
                <div className="cron-job-list">
                  {cron.jobs.map((job) => (
                    <CronJobCard
                      key={job.jobId}
                      job={job}
                      onToggle={handleToggle}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onRun={handleRun}
                    />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!cron.loading && cron.jobs.length === 0 && !cron.error && (
                <div className="cron-empty">
                  <div className="cron-empty-icon">&#x23F0;</div>
                  <div className="cron-empty-text">暂无定时任务</div>
                  <div className="cron-empty-hint">点击"新建任务"创建你的第一个定时任务</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal form for add/edit */}
      {showForm && (
        <CronJobForm
          initialData={editingJob}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}
    </div>
  )
}
