import React from 'react'

interface LoadingProps {
  text?: string
  size?: 'small' | 'medium' | 'large'
}

export const Loading: React.FC<LoadingProps> = ({ text = '加载中...', size = 'medium' }) => {
  const sizeClass = {
    small: 'loading-small',
    medium: 'loading-medium',
    large: 'loading-large',
  }[size]

  return (
    <div className={`loading-container ${sizeClass}`}>
      <div className="loading-spinner" />
      {text && <p className="loading-text">{text}</p>}
    </div>
  )
}
