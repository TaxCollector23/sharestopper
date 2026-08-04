import { useState, useCallback, useRef, useEffect } from 'react'
import { Detection, OverlayStyle, ProtectionProfile, ProtectionStats } from '@shared/types'
import { getNextDemoDetection } from '../utils/demo'

const INITIAL_STATS: ProtectionStats = {
  totalBlocked: 0,
  apiKeysHidden: 0,
  passwordsHidden: 0,
  emailsHidden: 0,
  phonesHidden: 0,
  protectedWindows: 0,
  avgLatencyMs: 0,
  framesProcessed: 0,
}

const API_KEY_TYPES = new Set(['api-key', 'openai-key', 'anthropic-key', 'google-ai-key', 'aws-key', 'github-token', 'stripe-key', 'twilio-credential', 'firebase-config', 'supabase-url', 'slack-webhook', 'discord-webhook'])
const PASSWORD_TYPES = new Set(['password', 'env-file', 'generic-secret', 'oauth-secret', 'cookie', 'session-id'])
const EMAIL_TYPES = new Set(['email'])
const PHONE_TYPES = new Set(['phone'])

export function useProtection() {
  const [isActive, setIsActive] = useState(false)
  const [detections, setDetections] = useState<Detection[]>([])
  const [stats, setStats] = useState<ProtectionStats>(INITIAL_STATS)
  const [overlayStyle, setOverlayStyle] = useState<OverlayStyle>('block')
  const [profile, setProfile] = useState<ProtectionProfile>('developer')
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const latencies = useRef<number[]>([])

  const addDetection = useCallback((detection: Detection) => {
    setDetections((prev) => {
      const next = [detection, ...prev].slice(0, 200)
      return next
    })

    setStats((prev) => {
      const newStats = { ...prev, totalBlocked: prev.totalBlocked + 1 }
      if (API_KEY_TYPES.has(detection.type)) newStats.apiKeysHidden++
      if (PASSWORD_TYPES.has(detection.type)) newStats.passwordsHidden++
      if (EMAIL_TYPES.has(detection.type)) newStats.emailsHidden++
      if (PHONE_TYPES.has(detection.type)) newStats.phonesHidden++
      newStats.framesProcessed = prev.framesProcessed + 1

      const latency = 12 + Math.random() * 28
      latencies.current.push(latency)
      if (latencies.current.length > 50) latencies.current.shift()
      newStats.avgLatencyMs = Math.round(
        latencies.current.reduce((a, b) => a + b, 0) / latencies.current.length
      )

      return newStats
    })
  }, [])

  const startProtection = useCallback(() => {
    setIsActive(true)
    setIsPaused(false)

    setStats((prev) => ({ ...prev, protectedWindows: 3 + Math.floor(Math.random() * 4) }))

    // Initial burst of detections
    for (let i = 0; i < 3; i++) {
      setTimeout(() => addDetection(getNextDemoDetection()), 400 + i * 600)
    }

    intervalRef.current = setInterval(() => {
      addDetection(getNextDemoDetection())
    }, 1400 + Math.random() * 1800)
  }, [addDetection])

  const stopProtection = useCallback(() => {
    setIsActive(false)
    setIsPaused(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const togglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false)
      intervalRef.current = setInterval(() => {
        addDetection(getNextDemoDetection())
      }, 1800 + Math.random() * 2400)
    } else {
      setIsPaused(true)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isPaused, addDetection])

  const revealDetection = useCallback((id: string) => {
    setDetections((prev) =>
      prev.map((d) => (d.id === id ? { ...d, revealed: true } : d))
    )
  }, [])

  const ignoreDetection = useCallback((id: string) => {
    setDetections((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ignored: true } : d))
    )
  }, [])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return {
    isActive,
    isPaused,
    detections,
    stats,
    overlayStyle,
    profile,
    startProtection,
    stopProtection,
    togglePause,
    revealDetection,
    ignoreDetection,
    setOverlayStyle,
    setProfile,
    addDetection,
  }
}
