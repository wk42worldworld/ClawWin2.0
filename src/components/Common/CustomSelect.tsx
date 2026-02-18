import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

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
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      updatePos()
      window.addEventListener('scroll', updatePos, true)
      window.addEventListener('resize', updatePos)
      return () => {
        window.removeEventListener('scroll', updatePos, true)
        window.removeEventListener('resize', updatePos)
      }
    }
  }, [open, updatePos])

  const handleToggle = () => {
    if (!open) updatePos()
    setOpen(!open)
  }

  return (
    <div className={`custom-select-wrapper ${className ?? ''}`}>
      <div className="custom-select-trigger" ref={triggerRef} onClick={handleToggle}>
        <span>{selected?.label ?? ''}</span>
        <span className={`custom-select-arrow${open ? ' open' : ''}`}>▸</span>
      </div>
      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="custom-select-dropdown"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
          }}
        >
          {options.map(opt => (
            <div
              key={opt.value}
              className={`custom-select-option${opt.value === value ? ' selected' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              {opt.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
