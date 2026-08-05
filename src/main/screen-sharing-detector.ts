import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'

const execFileAsync = promisify(execFile)

export interface ScreenSharingState {
  isSharing: boolean
  app: 'zoom' | 'google-meet' | 'teams' | 'discord' | 'slack' | 'webex' | 'facetime' | null
  windowName: string | null
  pid: number | null
  detectionTimeMs: number
  confidence: number
}

interface AppFingerprint {
  processName: string
  tag: string
  app: ScreenSharingState['app']
  sharingKeywords: string[]
  fallbackProcesses?: string[]
}

const APP_FINGERPRINTS: AppFingerprint[] = [
  {
    processName: 'zoom.us', tag: 'ZOOM', app: 'zoom',
    sharingKeywords: ['share', 'screen share', 'sharing', 'presenting'],
    fallbackProcesses: ['CptHost', 'zoomshare', 'ZoomShareToolbar'],
  },
  {
    processName: 'Microsoft Teams', tag: 'TEAMS', app: 'teams',
    sharingKeywords: ['share', 'screen share', 'sharing', 'presenting'],
  },
  {
    processName: 'Discord', tag: 'DISCORD', app: 'discord',
    sharingKeywords: ['screen share', 'go live', 'streaming'],
  },
  {
    processName: 'Slack', tag: 'SLACK', app: 'slack',
    sharingKeywords: ['screen share', 'sharing screen', 'huddle'],
  },
  {
    processName: 'Cisco Webex Meetings', tag: 'WEBEX', app: 'webex',
    sharingKeywords: ['share', 'screen share', 'sharing', 'presenting'],
  },
  {
    processName: 'FaceTime', tag: 'FACETIME', app: 'facetime',
    sharingKeywords: ['shareplay', 'screen share'],
  },
]

const MEET_KEYWORDS = ['meet.google.com', 'google meet']

function buildBatchScript(): string {
  let blocks = ''
  for (const fp of APP_FINGERPRINTS) {
    blocks += `
    if procNames contains "${fp.processName}" then
      try
        tell process "${fp.processName}"
          set w to name of every window as text
        end tell
        set output to output & "${fp.tag}:" & w & "\\n"
      end try
    end if
`
  }

  return `on run
  set output to ""
  tell application "System Events"
    set procNames to name of every process
${blocks}
    if procNames contains "Google Chrome" then
      try
        tell process "Google Chrome"
          set w to name of every window as text
        end tell
        set output to output & "CHROME:" & w & "\\n"
      end try
    end if
  end tell
  return output
end run`
}

const BATCH_SCRIPT = buildBatchScript()

export class ScreenSharingDetector extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null
  private lastState: ScreenSharingState = { isSharing: false, app: null, windowName: null, pid: null, detectionTimeMs: 0, confidence: 0 }
  private intervalMs: number
  private baseIntervalMs: number
  private consecutiveErrors = 0
  private pidCache: Map<string, { pid: number; cachedAt: number }> = new Map()
  private pidCacheTtlMs = 10000
  private detectionCount = 0
  private totalDetectionMs = 0

  constructor(intervalMs = 1000) {
    super()
    this.intervalMs = intervalMs
    this.baseIntervalMs = intervalMs
  }

  async start() {
    this.emit('started')
    await this.poll()
    this.schedulePoll()
  }

  stop() {
    if (this.pollInterval) {
      clearTimeout(this.pollInterval)
      this.pollInterval = null
    }
    this.emit('stopped')
  }

  private schedulePoll() {
    this.pollInterval = setTimeout(async () => {
      await this.poll()
      if (this.pollInterval) this.schedulePoll()
    }, this.intervalMs)
  }

  private async poll() {
    try {
      const state = await this.detect()
      this.consecutiveErrors = 0
      this.intervalMs = this.baseIntervalMs

      if (state.isSharing !== this.lastState.isSharing || state.app !== this.lastState.app) {
        this.emit('change', state, this.lastState)
        if (state.isSharing && !this.lastState.isSharing) {
          this.emit('sharing-started', state)
        } else if (!state.isSharing && this.lastState.isSharing) {
          this.emit('sharing-stopped', this.lastState)
        }
      }
      this.lastState = state
    } catch (err) {
      this.consecutiveErrors++
      this.emit('error', err)
      if (this.consecutiveErrors > 5) {
        this.intervalMs = Math.min(this.intervalMs * 2, 10000)
      }
    }
  }

  async detect(): Promise<ScreenSharingState> {
    const start = performance.now()
    this.detectionCount++

    try {
      const { stdout } = await execFileAsync('osascript', ['-e', BATCH_SCRIPT], { timeout: 5000 })
      const lines = stdout.split('\n').filter(Boolean)
      const detectionTimeMs = performance.now() - start
      this.totalDetectionMs += detectionTimeMs

      for (const fp of APP_FINGERPRINTS) {
        const line = lines.find(l => l.startsWith(fp.tag + ':'))
        if (!line) continue

        const lower = line.toLowerCase()
        const matched = fp.sharingKeywords.some(k => lower.includes(k))
        if (matched) {
          const pid = await this.getCachedPid(fp.processName)
          return {
            isSharing: true, app: fp.app,
            windowName: `${fp.processName} Screen Share`,
            pid, detectionTimeMs, confidence: 0.95,
          }
        }
      }

      // Chrome → Google Meet check
      const chromeLine = lines.find(l => l.startsWith('CHROME:'))
      if (chromeLine && MEET_KEYWORDS.some(k => chromeLine.toLowerCase().includes(k))) {
        const hasIndicator = await this.checkScreenRecordingIndicator()
        if (hasIndicator) {
          const pid = await this.getCachedPid('Google Chrome')
          return {
            isSharing: true, app: 'google-meet',
            windowName: 'Google Meet Screen Share',
            pid, detectionTimeMs: performance.now() - start, confidence: 0.85,
          }
        }
      }

      // Fallback: check for sharing-related helper processes
      for (const fp of APP_FINGERPRINTS) {
        if (!fp.fallbackProcesses?.length) continue
        try {
          const { stdout: pgrepOut } = await execFileAsync(
            'pgrep', ['-f', fp.fallbackProcesses.join('|')], { timeout: 2000 }
          )
          if (pgrepOut.trim()) {
            return {
              isSharing: true, app: fp.app,
              windowName: `${fp.processName} Screen Share`,
              pid: parseInt(pgrepOut.trim().split('\n')[0]) || null,
              detectionTimeMs: performance.now() - start, confidence: 0.80,
            }
          }
        } catch {}
      }

      return { isSharing: false, app: null, windowName: null, pid: null, detectionTimeMs: performance.now() - start, confidence: 1.0 }
    } catch {
      return { isSharing: false, app: null, windowName: null, pid: null, detectionTimeMs: performance.now() - start, confidence: 0.5 }
    }
  }

  private async getCachedPid(processName: string): Promise<number | null> {
    const cached = this.pidCache.get(processName)
    if (cached && Date.now() - cached.cachedAt < this.pidCacheTtlMs) {
      return cached.pid
    }
    try {
      const { stdout } = await execFileAsync('pgrep', ['-x', processName], { timeout: 2000 })
      const pid = parseInt(stdout.trim().split('\n')[0]) || null
      if (pid) this.pidCache.set(processName, { pid, cachedAt: Date.now() })
      return pid
    } catch {
      return null
    }
  }

  private async checkScreenRecordingIndicator(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', `
        tell application "System Events"
          try
            set menuExtras to name of every menu bar item of menu bar 1 of process "SystemUIServer"
            return menuExtras as text
          end try
        end tell
      `], { timeout: 3000 })
      return stdout.toLowerCase().includes('screen')
    } catch {
      return false
    }
  }

  getState(): ScreenSharingState {
    return { ...this.lastState }
  }

  getIntervalMs(): number {
    return this.intervalMs
  }

  getStats(): { detectionCount: number; avgDetectionMs: number; consecutiveErrors: number; currentIntervalMs: number } {
    return {
      detectionCount: this.detectionCount,
      avgDetectionMs: this.detectionCount > 0 ? this.totalDetectionMs / this.detectionCount : 0,
      consecutiveErrors: this.consecutiveErrors,
      currentIntervalMs: this.intervalMs,
    }
  }
}
