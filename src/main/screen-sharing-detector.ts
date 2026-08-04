import { exec } from 'child_process'
import { promisify } from 'util'
import { EventEmitter } from 'events'

const execAsync = promisify(exec)

export interface ScreenSharingState {
  isSharing: boolean
  app: 'zoom' | 'google-meet' | 'teams' | 'discord' | 'slack' | null
  windowName: string | null
  pid: number | null
}

export class ScreenSharingDetector extends EventEmitter {
  private pollInterval: NodeJS.Timeout | null = null
  private lastState: ScreenSharingState = { isSharing: false, app: null, windowName: null, pid: null }
  private intervalMs: number

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
      this.emit('error', err)
    }
  }

  async detect(): Promise<ScreenSharingState> {
    const [zoom, meet, teams, discord, slack] = await Promise.all([
      this.detectZoomSharing(),
      this.detectGoogleMeetSharing(),
      this.detectTeamsSharing(),
      this.detectDiscordSharing(),
      this.detectSlackSharing(),
    ])

    return zoom || meet || teams || discord || slack || {
      isSharing: false,
      app: null,
      windowName: null,
      pid: null,
    }
  }

  private async detectZoomSharing(): Promise<ScreenSharingState | null> {
    try {
      // Check if Zoom is running and has a screen sharing session
      // Zoom creates a "zoom share toolbar" or "zoom share statusbar" window when sharing
      const { stdout } = await execAsync(
        `osascript -e 'tell application "System Events" to get name of every process whose name contains "zoom"' 2>/dev/null`
      )
      if (!stdout.trim()) return null

      // Check for Zoom sharing indicator windows
      const { stdout: windows } = await execAsync(
        `osascript -e '
          tell application "System Events"
            tell process "zoom.us"
              set windowNames to name of every window
              return windowNames as text
            end tell
          end tell
        ' 2>/dev/null`
      )

      const windowText = windows.toLowerCase()
      const isSharing = windowText.includes('share') ||
                        windowText.includes('screen share') ||
                        windowText.includes('sharing')

      if (isSharing) {
        const { stdout: pidOut } = await execAsync('pgrep -x "zoom.us" 2>/dev/null')
        return {
          isSharing: true,
          app: 'zoom',
          windowName: 'Zoom Screen Share',
          pid: parseInt(pidOut.trim()) || null,
        }
      }

      // Fallback: check if the Zoom sharing toolbar process exists
      const { stdout: toolbarCheck } = await execAsync(
        'pgrep -f "CptHost\\|zoomshare\\|ZoomShareToolbar" 2>/dev/null'
      )
      if (toolbarCheck.trim()) {
        return {
          isSharing: true,
          app: 'zoom',
          windowName: 'Zoom Screen Share',
          pid: parseInt(toolbarCheck.trim().split('\n')[0]) || null,
        }
      }
    } catch {
      // Zoom not running
    }
    return null
  }

  private async detectGoogleMeetSharing(): Promise<ScreenSharingState | null> {
    try {
      // Google Meet runs in Chrome/Edge/etc. We detect it by checking
      // if a browser is capturing the screen via macOS screen recording indicators
      const { stdout } = await execAsync(
        `osascript -e '
          tell application "System Events"
            set chromeRunning to (name of processes) contains "Google Chrome"
            if chromeRunning then
              tell process "Google Chrome"
                set windowNames to name of every window
                return windowNames as text
              end tell
            end if
          end tell
        ' 2>/dev/null`
      )

      const windowText = stdout.toLowerCase()
      const isMeet = windowText.includes('meet.google.com') || windowText.includes('google meet')

      if (isMeet) {
        // Check if Chrome is using screen capture via the macOS indicator
        const { stdout: mediaCheck } = await execAsync(
          `osascript -e '
            tell application "System Events"
              get value of attribute "AXIsScreenSharingEnabled" of process "Google Chrome"
            end tell
          ' 2>/dev/null`
        ).catch(() => ({ stdout: '' }))

        // Also check the macOS screen recording indicator in the menu bar
        const { stdout: screenCapture } = await execAsync(
          'log show --predicate \'subsystem == "com.apple.screencapture"\' --last 5s --style compact 2>/dev/null | head -5'
        ).catch(() => ({ stdout: '' }))

        // Check if Chrome has the screen sharing dot visible in Control Center
        const hasSharingIndicator = await this.checkScreenRecordingIndicator('Google Chrome')

        if (hasSharingIndicator || mediaCheck.includes('true')) {
          const { stdout: pidOut } = await execAsync('pgrep -x "Google Chrome" 2>/dev/null')
          return {
            isSharing: true,
            app: 'google-meet',
            windowName: 'Google Meet Screen Share',
            pid: parseInt(pidOut.trim()) || null,
          }
        }
      }
    } catch {
      // Chrome not running
    }
    return null
  }

  private async detectTeamsSharing(): Promise<ScreenSharingState | null> {
    try {
      const { stdout } = await execAsync(
        `osascript -e '
          tell application "System Events"
            if (name of processes) contains "Microsoft Teams" then
              tell process "Microsoft Teams"
                return name of every window as text
              end tell
            end if
          end tell
        ' 2>/dev/null`
      )
      const windowText = stdout.toLowerCase()
      if (windowText.includes('sharing') || windowText.includes('screen share') || windowText.includes('presenting')) {
        const { stdout: pidOut } = await execAsync('pgrep -f "Microsoft Teams" 2>/dev/null')
        return {
          isSharing: true,
          app: 'teams',
          windowName: 'Teams Screen Share',
          pid: parseInt(pidOut.trim().split('\n')[0]) || null,
        }
      }
    } catch {}
    return null
  }

  private async detectDiscordSharing(): Promise<ScreenSharingState | null> {
    try {
      const { stdout } = await execAsync(
        `osascript -e '
          tell application "System Events"
            if (name of processes) contains "Discord" then
              tell process "Discord"
                return name of every window as text
              end tell
            end if
          end tell
        ' 2>/dev/null`
      )
      if (stdout.toLowerCase().includes('screen share') || stdout.toLowerCase().includes('go live')) {
        const { stdout: pidOut } = await execAsync('pgrep -x Discord 2>/dev/null')
        return {
          isSharing: true,
          app: 'discord',
          windowName: 'Discord Screen Share',
          pid: parseInt(pidOut.trim()) || null,
        }
      }
    } catch {}
    return null
  }

  private async detectSlackSharing(): Promise<ScreenSharingState | null> {
    try {
      const { stdout } = await execAsync(
        `osascript -e '
          tell application "System Events"
            if (name of processes) contains "Slack" then
              tell process "Slack"
                return name of every window as text
              end tell
            end if
          end tell
        ' 2>/dev/null`
      )
      if (stdout.toLowerCase().includes('screen share') || stdout.toLowerCase().includes('sharing screen')) {
        const { stdout: pidOut } = await execAsync('pgrep -x Slack 2>/dev/null')
        return {
          isSharing: true,
          app: 'slack',
          windowName: 'Slack Screen Share',
          pid: parseInt(pidOut.trim()) || null,
        }
      }
    } catch {}
    return null
  }

  private async checkScreenRecordingIndicator(processName: string): Promise<boolean> {
    try {
      // Check macOS screen recording privacy indicator
      // When an app captures the screen, macOS shows an orange dot in the menu bar
      // and lists the app in System Preferences > Privacy > Screen Recording
      const { stdout } = await execAsync(
        `osascript -e '
          tell application "System Events"
            try
              set menuExtras to name of every menu bar item of menu bar 1 of process "SystemUIServer"
              return menuExtras as text
            end try
          end tell
        ' 2>/dev/null`
      )
      // The screen recording indicator appears when apps are actively capturing
      return stdout.toLowerCase().includes('screen') || false
    } catch {
      return false
    }
  }

  getState(): ScreenSharingState {
    return { ...this.lastState }
  }
}
