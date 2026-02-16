import React from 'react'
import logoSrc from '../../../assets/logo.png'

interface OpenClawLogoProps {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export const OpenClawLogo: React.FC<OpenClawLogoProps> = ({ size = 24, className, style }) => (
  <img
    src={logoSrc}
    alt="OpenClaw"
    width={size}
    height={size}
    className={className}
    style={{ objectFit: 'contain', ...style }}
  />
)
