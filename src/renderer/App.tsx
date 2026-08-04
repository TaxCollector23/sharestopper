import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, ShieldCheck, ShieldOff, Pause, Play, Eye, EyeOff, X, Settings, ChevronRight, Zap, Lock, Mail, Phone, Key, Clock, Layers, Activity } from 'lucide-react'
import { useProtection } from './hooks/useProtection'
import { Detection } from '@shared/types'
import { SettingsPanel } from './components/SettingsPanel'

const TYPE_ICON_COLORS: Record<string, string> = {
  'openai-key': '#10b981',
  'anthropic-key': '#f97316',
  'google-ai-key': '#3b82f6',
  'aws-key': '#f59e0b',
  'github-token': '#a855f7',
  'stripe-key': '#8b5cf6',
  'jwt': '#06b6d4',
  'bearer-token': '#06b6d4',
  'password': '#ef4444',
  'email': '#0ea5e9',
  'credit-card': '#f43f5e',
  'ssh-key': '#dc2626',
  'rsa-key': '#dc2626',
  'mongodb-uri': '#22c55e',
  'postgres-url': '#60a5fa',
  'slack-webhook': '#a78bfa',
  'discord-webhook': '#818cf8',
  'phone': '#14b8a6',
  'private-ip': '#eab308',
  'env-file': '#d97706',
  'firebase-config': '#fb923c',
  'generic-secret': '#71717a',
  'supabase-url': '#22c55e',
  'twilio-credential': '#ef4444',
  'oauth-secret': '#f59e0b',
  'cookie': '#d97706',
  'session-id': '#d97706',
  'db-connection': '#60a5fa',
  'ipv4': '#eab308',
  'ipv6': '#eab308',
  'api-key': '#8b5cf6',
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 3) return 'now'
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m`
}

function DetectionRow({ d, onReveal, onIgnore }: { d: Detection; onReveal: () => void; onIgnore: () => void }) {
  const color = TYPE_ICON_COLORS[d.type] || '#71717a'
  const sepIdx = d.label.indexOf(' — ')
  const typeName = sepIdx >= 0 ? d.label.slice(0, sepIdx) : d.label
  const context = sepIdx >= 0 ? d.label.slice(sepIdx + 3) : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: d.revealed ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="group flex items-center gap-3 h-9 px-3 hover:bg-white/[0.02] transition-colors cursor-default"
    >
      <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: d.revealed ? '#3f3f46' : color }} />
      <span className="text-[13px] font-medium w-[180px] truncate" style={{ color: d.revealed ? '#52525b' : color }}>
        {typeName}
      </span>
      <span className="text-[12px] text-zinc-600 flex-1 truncate">{context}</span>
      <span className="text-[11px] text-zinc-700 tabular-nums w-8 text-right">{Math.round(d.confidence * 100)}%</span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {!d.revealed && (
          <button onClick={onReveal} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400">
            <Eye className="w-3 h-3" />
          </button>
        )}
        <button onClick={onIgnore} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400">
          <X className="w-3 h-3" />
        </button>
      </div>
      <span className="text-[11px] text-zinc-700 tabular-nums w-8 text-right">{timeAgo(d.timestamp)}</span>
    </motion.div>
  )
}

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showStartup, setShowStartup] = useState(true)
  const [, setTick] = useState(0)
  const p = useProtection()

  useEffect(() => {
    const timer = setTimeout(() => setShowStartup(false), 1800)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!p.isActive) return
    const iv = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(iv)
  }, [p.isActive])

  const activeDetections = p.detections.filter((d) => !d.ignored)

  return (
    <>
      {/* Startup */}
      <AnimatePresence>
        {showStartup && (
          <motion.div
            className="fixed inset-0 z-[100] bg-[#09090b] flex items-center justify-center"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3"
            >
              <Shield className="w-7 h-7 text-emerald-400" strokeWidth={1.5} />
              <span className="text-lg font-semibold text-zinc-200 tracking-tight">ShareStopper</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-screen flex flex-col select-none bg-[#09090b] overflow-hidden">
        {/* Titlebar */}
        <div
          className="h-11 flex items-center justify-between px-4 border-b border-white/[0.04] flex-shrink-0"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          <div className="flex items-center gap-2.5 pl-16">
            <Shield className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
            <span className="text-[13px] font-semibold text-zinc-400 tracking-tight">ShareStopper</span>
          </div>
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {p.isActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5"
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                  animate={!p.isPaused ? { opacity: [1, 0.3, 1] } : {}}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-[11px] text-emerald-400/80 font-medium tabular-nums">
                  {p.stats.totalBlocked} blocked
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="h-10 flex items-center gap-2 px-3 border-b border-white/[0.04] flex-shrink-0">
          {!p.isActive ? (
            <button
              onClick={p.startProtection}
              className="flex items-center gap-1.5 h-7 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-md text-[12px] font-medium transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Enable
            </button>
          ) : (
            <>
              <button
                onClick={p.togglePause}
                className="flex items-center gap-1.5 h-7 px-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-400 rounded-md text-[12px] font-medium transition-colors"
              >
                {p.isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {p.isPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                onClick={p.stopProtection}
                className="flex items-center gap-1.5 h-7 px-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-500 hover:text-red-400 rounded-md text-[12px] font-medium transition-colors"
              >
                <ShieldOff className="w-3 h-3" />
                Stop
              </button>
            </>
          )}

          <div className="w-px h-4 bg-white/[0.06] mx-1" />

          <div className="flex items-center bg-white/[0.03] rounded-md p-0.5">
            {(['block', 'blur', 'pixelate'] as const).map((s) => (
              <button
                key={s}
                onClick={() => p.setOverlayStyle(s)}
                className={`h-6 px-2 text-[11px] rounded transition-colors ${
                  p.overlayStyle === s ? 'bg-zinc-700/70 text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {s === 'block' ? 'Block' : s === 'blur' ? 'Blur' : 'Pixel'}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white/[0.03] rounded-md p-0.5">
            {(['developer', 'business', 'student', 'streamer'] as const).map((pr) => (
              <button
                key={pr}
                onClick={() => p.setProfile(pr)}
                className={`h-6 px-2 text-[11px] rounded transition-colors ${
                  p.profile === pr ? 'bg-zinc-700/70 text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                {pr === 'developer' ? 'Dev' : pr === 'business' ? 'Biz' : pr === 'student' ? 'Edu' : 'Stream'}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setShowSettings(true)}
            className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="h-8 flex items-center border-b border-white/[0.04] px-3 gap-4 flex-shrink-0 bg-white/[0.01]">
          {[
            { icon: Shield, label: 'Blocked', value: p.stats.totalBlocked, color: p.isActive ? 'text-emerald-400' : 'text-zinc-600' },
            { icon: Key, label: 'Keys', value: p.stats.apiKeysHidden, color: 'text-zinc-500' },
            { icon: Lock, label: 'Secrets', value: p.stats.passwordsHidden, color: 'text-zinc-500' },
            { icon: Mail, label: 'Emails', value: p.stats.emailsHidden, color: 'text-zinc-500' },
            { icon: Phone, label: 'Phones', value: p.stats.phonesHidden, color: 'text-zinc-500' },
            { icon: Activity, label: 'Latency', value: `${p.stats.avgLatencyMs}ms`, color: 'text-zinc-500' },
            { icon: Layers, label: 'Frames', value: p.stats.framesProcessed, color: 'text-zinc-500' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <s.icon className={`w-3 h-3 ${s.color}`} />
              <span className="text-[11px] text-zinc-600">{s.label}</span>
              <motion.span
                key={String(s.value)}
                initial={p.isActive ? { color: '#a5b4fc' } : false}
                animate={{ color: '#d4d4d8' }}
                transition={{ duration: 0.5 }}
                className="text-[11px] font-medium tabular-nums"
              >
                {s.value}
              </motion.span>
            </div>
          ))}
        </div>

        {/* Column headers */}
        <div className="flex items-center h-7 px-3 border-b border-white/[0.04] bg-white/[0.01] flex-shrink-0">
          <div className="w-1 mr-3" />
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium w-[180px]">Type</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium flex-1">Source</span>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium w-8 text-right">Conf</span>
          <span className="w-[52px]" />
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium w-8 text-right">Time</span>
        </div>

        {/* Detection list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {activeDetections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-700">
              <Shield className="w-6 h-6 mb-2 opacity-20" />
              <span className="text-[13px]">
                {p.isActive ? 'Scanning...' : 'Protection inactive'}
              </span>
              {!p.isActive && (
                <span className="text-[11px] text-zinc-800 mt-1">
                  Press{' '}
                  <kbd className="px-1 py-0.5 text-[10px] bg-zinc-800/60 text-zinc-600 rounded border border-zinc-800 font-mono">⌘⇧P</kbd>
                  {' '}or click Enable
                </span>
              )}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {activeDetections.map((d) => (
                <DetectionRow
                  key={d.id}
                  d={d}
                  onReveal={() => p.revealDetection(d.id)}
                  onIgnore={() => p.ignoreDetection(d.id)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Scan line */}
        {p.isActive && !p.isPaused && (
          <motion.div
            className="absolute left-0 right-0 h-px pointer-events-none z-10"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(52, 211, 153, 0.15), transparent)' }}
            animate={{ top: ['15%', '95%', '15%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Status bar */}
        <div className="h-6 flex items-center justify-between px-3 border-t border-white/[0.04] flex-shrink-0 bg-white/[0.01]">
          <div className="flex items-center gap-3">
            {p.isActive ? (
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${p.isPaused ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <span className="text-[10px] text-zinc-600">
                  {p.isPaused ? 'Paused' : `${p.stats.protectedWindows} windows monitored`}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-zinc-700">Ready</span>
            )}
          </div>
          <span className="text-[10px] text-zinc-700 font-mono">v1.0.0</span>
        </div>
      </div>

      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        overlayStyle={p.overlayStyle}
        profile={p.profile}
        onStyleChange={p.setOverlayStyle}
        onProfileChange={p.setProfile}
      />
    </>
  )
}
