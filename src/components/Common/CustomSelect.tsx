import React, { useState, useRef, useEffect } from 'react'

interface Option {
  value: string
  label: string
}

interface CustomSelectProps {
  value: string
  options: Option[]
  onChange: (value: string) => void
  className?: string
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ value, options, onChange, className }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className={`custom-select-wrapper ${className ?? ''}`} ref={ref}>
      <div className="custom-select-trigger" onClick={() => setOpen(!open)}>
        <span>{selected?.label ?? ''}</span>
        <span className={`custom-select-arrow${open ? ' open' : ''}`}>▸</span>
      </div>
      {open && (
        <div className="custom-select-dropdown">
          {options.map(opt => (
            <div
              key={opt.value}
              className={`custom-select-option${opt.value === value ? ' selected' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
