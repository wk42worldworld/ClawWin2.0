import { useState, useRef, useEffect } from 'react'
import type { GatewayState } from '../../types'
import splashVideo from '../../assets/splash-video.mp4'

interface VideoSplashProps {
  gatewayState: GatewayState
  exiting?: boolean
  onRetry?: () => void
}

export function VideoSplash({ gatewayState, exiting = false, onRetry }: VideoSplashProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [waitingLong, setWaitingLong] = useState(false)

  useEffect(() => {
    videoRef.current?.play().catch(() => {})
  }, [])

  // 等待超过 8 秒后显示提示
  useEffect(() => {
    if (gatewayState === 'starting' || gatewayState === 'restarting') {
      const timer = setTimeout(() => setWaitingLong(true), 8000)
      return () => clearTimeout(timer)
    }
    setWaitingLong(false)
  }, [gatewayState])

  const isError = gatewayState === 'error'

  return (
    <div className={`video-splash${exiting ? ' video-splash-exit' : ''}`}>
      <video
        ref={videoRef}
        className="video-splash-video"
        src={splashVideo}
        muted
        autoPlay
        loop
        playsInline
      />

      <div className="video-splash-overlay" />

      {isError && (
        <div className="video-splash-error">
          <div className="video-splash-error-card">
            <div className="video-splash-error-icon">!</div>
            <h3>网关启动失败</h3>
            <p>Gateway 进程未能响应，请检查配置后重试</p>
            {onRetry && (
              <button className="btn-primary" onClick={onRetry}>重试</button>
            )}
          </div>
        </div>
      )}

      {!isError && (
        <div className="video-splash-status">
          <div className="video-splash-progress">
            <div className="video-splash-progress-bar" />
          </div>
          {waitingLong && (
            <p className="video-splash-hint">首次启动需要较长时间，请耐心等待...</p>
          )}
        </div>
      )}
    </div>
  )
}
