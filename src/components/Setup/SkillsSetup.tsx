import { useState, useCallback } from 'react'
import type { SkillInfo, SkillsConfig, SkillEntryConfig } from '../../types'
import { SKILL_CN } from '../../constants/skillCn'

interface SkillsSetupProps {
  skills: SkillInfo[]
  skillsConfig: SkillsConfig
  loading?: boolean
  onConfigChange: (config: SkillsConfig) => void
  onBack: () => void
  onNext: () => void
  onSkip?: () => void
}

export function SkillsSetup({
  skills,
  skillsConfig,
  loading,
  onConfigChange,
  onBack,
  onNext,
  onSkip,
}: SkillsSetupProps) {
  // Track which skill card has its API Key input expanded
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)

  const getEntry = (name: string): SkillEntryConfig => skillsConfig[name] ?? {}

  const isEnabled = (skill: SkillInfo): boolean => {
    const entry = getEntry(skill.name)
    // Explicitly configured → use that; otherwise fall back to skill.enabled default
    return entry.enabled ?? skill.enabled
  }

  const isPlatformBlocked = (skill: SkillInfo): boolean =>
    skill.status === 'blocked' || skill.status === 'missing'

  const handleToggle = useCallback(
    (skill: SkillInfo) => {
      if (isPlatformBlocked(skill)) return
      const current = isEnabled(skill)
      const entry = getEntry(skill.name)
      onConfigChange({
        ...skillsConfig,
        [skill.name]: { ...entry, enabled: !current },
      })
    },
    [skillsConfig, onConfigChange, skills],
  )

  const handleApiKeyChange = useCallback(
    (skillName: string, value: string) => {
      const entry = getEntry(skillName)
      onConfigChange({
        ...skillsConfig,
        [skillName]: { ...entry, apiKey: value || undefined },
      })
    },
    [skillsConfig, onConfigChange],
  )

  const handleCardClick = useCallback(
    (skill: SkillInfo) => {
      if (isPlatformBlocked(skill)) return
      if (skill.requiresApiKey) {
        // Toggle expand; don't toggle enabled here — let the switch do that
        setExpandedSkill((prev) => (prev === skill.name ? null : skill.name))
      }
    },
    [],
  )

  return (
    <div className="setup-page skills-setup">
      <h2 className="setup-title">技能配置</h2>
      <p className="setup-subtitle">选择要启用的技能，部分技能需要额外的 API Key</p>

      {loading ? (
        <div className="skill-loading-container">
          <div className="skill-loading-bar" />
          <span className="skill-loading-text">正在扫描技能目录...</span>
        </div>
      ) : (
      <div className="skill-grid">
        {skills.map((skill, idx) => {
          const enabled = isEnabled(skill)
          const blocked = isPlatformBlocked(skill)
          const expanded = expandedSkill === skill.name && skill.requiresApiKey
          const entry = getEntry(skill.name)

          return (
            <div
              key={skill.name}
              className={`skill-card${enabled ? ' skill-card-active' : ''}${blocked ? ' disabled' : ''}`}
              onClick={() => handleCardClick(skill)}
              style={{ animationDelay: `${idx * 0.04}s` }}
            >
              <div className="skill-card-header">
                <span className="skill-icon">{skill.emoji ?? '🔧'}</span>
                <div className="skill-info">
                  <span className="skill-name">{skill.name}</span>
                  <span className="skill-desc">{SKILL_CN[skill.name] || skill.description}</span>
                </div>

                {blocked ? (
                  <span className="skill-status skill-status-missing">
                    {skill.missingReason ?? '不可用'}
                  </span>
                ) : skill.status === 'ready' ? (
                  <span className="skill-status skill-status-ready">就绪</span>
                ) : null}

                {!blocked && (
                  <div
                    className={`skill-toggle${enabled ? ' skill-toggle-on' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggle(skill)
                    }}
                  >
                    <div className="skill-toggle-thumb" />
                  </div>
                )}
              </div>

              {expanded && (
                <div className="skill-apikey-section" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="password"
                    className="input-field skill-apikey-input"
                    placeholder={`请输入 ${skill.primaryEnv ?? skill.name} API Key`}
                    value={entry.apiKey ?? ''}
                    onChange={(e) => handleApiKeyChange(skill.name, e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}

      <div className="setup-actions">
        <button className="btn-secondary" onClick={onBack}>上一步</button>
        {onSkip && <button className="btn-secondary" onClick={onSkip}>跳过</button>}
        <button className="btn-primary" onClick={onNext}>下一步</button>
      </div>
    </div>
  )
}
