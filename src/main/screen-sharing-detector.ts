import { execFile } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'

const execFileAsync = promisify(execFile)

export interface ScreenSharingState {
  isSharing: boolean
  app: 'zoom' | 'google-meet' | 'teams' | 'discord' | 'slack' | null
  windowName: string | null
  pid: number | null
  detectionTimeMs: number
}

const BATCH_SCRIPT = `
on run
  set output to ""
  tell application "System Events"
    set procNames to name of every process

    -- Zoom
    if procNames contains "zoom.us" then
      try
        tell process "zoom.us"
          set zoomWins to name of every window as text
        end tell
        set output to output & "ZOOM:" & zoomWins & "\\n"
      end try
    end if

    -- Teams
    if procNames contains "Microsoft Teams" then
      try
        tell process "Microsoft Teams"
          set teamsWins to name of every window as text
        end tell
        set output to output & "TEAMS:" & teamsWins & "\\n"
      end try
    end if

    -- Discord
    if procNames contains "Discord" then
      try
        tell process "Discord"
          set discordWins to name of every window as text
        end tell
        set output to output & "DISCORD:" & discordWins & "\\n"
      end try
    end if

    -- Slack
    if procNames contains "Slack" then
      try
        tell process "Slack"
          set slackWins to name of every window as text
        end tell
        set output to output & "SLACK:" & slackWins & "\\n"
      end try
    end if

    -- Chrome (for Google Meet)
    if procNames contains "Google Chrome" then
      try
        tell process "Google Chrome"
          set chromeWins to name of every window as text
        end tell
        set output to output & "CHROME:" & chromeWins & "\\n"
      end try
    end if

  end tell
  return output
end run
`

const SHARING_KEYWORDS = ['share', 'screen share', 'sharing', 'presenting']
const MEET_KEYWORDS = ['meet.google.com', 'google meet']

export class ScreenSharingDetector extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null
  private lastState: ScreenSharingState = { isSharing: false, app: null, windowName: null, pid: null, detectionTimeMs: 0 }
  private intervalMs: number
  private consecutiveErrors = 0

  constructor(intervalMs = 1000) {
    super()
    this.intervalMs = intervalMs
  }

  async start() {
    this.emit('started')
    await this.poll()
    this.pollInterval = setInterval(() => this.poll(), this.intervalMs)
  }

  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.emit('stopped')
  }

  private async poll() {
    try {
      const state = await this.detect()
      this.consecutiveErrors = 0

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
      if (this.consecutiveErrors > 10) {
        this.emit('error', new Error('Too many consecutive errors, backing off'))
        this.intervalMs = Math.min(this.intervalMs * 2, 10000)
      }
    }
  }

  async detect(): Promise<ScreenSharingState> {
    const start = performance.now()

    try {
      const { stdout } = await execFileAsync('osascript', ['-e', BATCH_SCRIPT], { timeout: 5000 })
      const lines = stdout.split('\n').filter(Boolean)
      const detectionTimeMs = performance.now() - start

      for (const line of lines) {
        const lower = line.toLowerCase()

        if (line.startsWith('ZOOM:') && SHARING_KEYWORDS.some(k => lower.includes(k))) {
          const pid = await this.getPid('zoom.us')
          return { isSharing: true, app: 'zoom', windowName: 'Zoom Screen Share', pid, detectionTimeMs }
        }

        if (line.startsWith('TEAMS:') && SHARING_KEYWORDS.some(k => lower.includes(k))) {
          const pid = await this.getPid('Microsoft Teams')
          return { isSharing: true, app: 'teams', windowName: 'Teams Screen Share', pid, detectionTimeMs }
        }

        if (line.startsWith('DISCORD:') && (lower.includes('screen share') || lower.includes('go live'))) {
          const pid = await this.getPid('Discord')
          return { isSharing: true, app: 'discord', windowName: 'Discord Screen Share', pid, detectionTimeMs }
        }

        if (line.startsWith('SLACK:') && (lower.includes('screen share') || lower.includes('sharing screen'))) {
          const pid = await this.getPid('Slack')
          return { isSharing: true, app: 'slack', windowName: 'Slack Screen Share', pid, detectionTimeMs }
        }

        if (line.startsWith('CHROME:') && MEET_KEYWORDS.some(k => lower.includes(k))) {
          const hasSharingIndicator = await this.checkScreenRecordingIndicator()
          if (hasSharingIndicator) {
            const pid = await this.getPid('Google Chrome')
            return { isSharing: true, app: 'google-meet', windowName: 'Google Meet Screen Share', pid, detectionTimeMs }
          }
        }
      }

      // Fallback: check for Zoom share toolbar process
      try {
        const { stdout: toolbarPid } = await execFileAsync('pgrep', ['-f', 'CptHost|zoomshare|ZoomShareToolbar'], { timeout: 2000 })
        if (toolbarPid.trim()) {
          return {
            isSharing: true,
            app: 'zoom',
            windowName: 'Zoom Screen Share',
            pid: parseInt(toolbarPid.trim().split('\n')[0]) || null,
            detectionTimeMs: performance.now() - start,
          }
        }
      } catch {}

      return { isSharing: false, app: null, windowName: null, pid: null, detectionTimeMs: performance.now() - start }
    } catch {
      return { isSharing: false, app: null, windowName: null, pid: null, detectionTimeMs: performance.now() - start }
    }
  }

  private async getPid(processName: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync('pgrep', ['-x', processName], { timeout: 2000 })
      return parseInt(stdout.trim().split('\n')[0]) || null
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
      return stdout.toLowerCase().includes('screen') || false
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
}
