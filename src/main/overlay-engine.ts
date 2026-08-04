import { BrowserWindow, screen } from 'electron'
import { Detection, OverlayStyle } from '../shared/types'

interface OverlayWindow {
  window: BrowserWindow
  detectionId: string
  bounds: { x: number; y: number; width: number; height: number }
  createdAt: number
}

export class OverlayEngine {
  private overlays: Map<string, OverlayWindow> = new Map()
  private style: OverlayStyle = 'block'
  private enabled = true
  private maxOverlays = 50
  private gcIntervalMs = 5000
  private gcTimer: NodeJS.Timeout | null = null
  private overlayLifetimeMs = 30000

  start() {
    this.enabled = true
    this.gcTimer = setInterval(() => this.gc(), this.gcIntervalMs)
  }

  stop() {
    this.enabled = false
    this.clearAll()
    if (this.gcTimer) {
      clearInterval(this.gcTimer)
      this.gcTimer = null
    }
  }

  setStyle(style: OverlayStyle) {
    this.style = style
    for (const overlay of this.overlays.values()) {
      overlay.window.webContents.send('style-change', style)
    }
  }

  getStyle(): OverlayStyle {
    return this.style
  }

  showOverlays(detections: Detection[]) {
    if (!this.enabled) return

    const activeIds = new Set(detections.map(d => d.id))

    for (const [id, overlay] of this.overlays) {
      if (!activeIds.has(id)) {
        this.removeOverlay(id)
      }
    }

    for (const detection of detections) {
      if (detection.ignored || detection.revealed) continue
      if (!detection.bounds) continue

      if (this.overlays.has(detection.id)) {
        this.updateOverlay(detection)
      } else if (this.overlays.size < this.maxOverlays) {
        this.createOverlay(detection)
      }
    }
  }

  private createOverlay(detection: Detection) {
    if (!detection.bounds) return

    const display = screen.getPrimaryDisplay()
    const scaleFactor = display.scaleFactor

    const bounds = {
      x: Math.round(detection.bounds.x * scaleFactor),
      y: Math.round(detection.bounds.y * scaleFactor),
      width: Math.round(detection.bounds.width * scaleFactor),
      height: Math.round(detection.bounds.height * scaleFactor),
    }

    const window = new BrowserWindow({
      x: detection.bounds.x,
      y: detection.bounds.y,
      width: detection.bounds.width,
      height: detection.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    window.setIgnoreMouseEvents(true)
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const html = this.generateOverlayHtml(detection)
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    window.once('ready-to-show', () => {
      window.showInactive()
    })

    this.overlays.set(detection.id, {
      window,
      detectionId: detection.id,
      bounds: detection.bounds,
      createdAt: Date.now(),
    })
  }

  private updateOverlay(detection: Detection) {
    const overlay = this.overlays.get(detection.id)
    if (!overlay || !detection.bounds) return

    const boundsChanged =
      overlay.bounds.x !== detection.bounds.x ||
      overlay.bounds.y !== detection.bounds.y ||
      overlay.bounds.width !== detection.bounds.width ||
      overlay.bounds.height !== detection.bounds.height

    if (boundsChanged) {
      overlay.window.setBounds({
        x: detection.bounds.x,
        y: detection.bounds.y,
        width: detection.bounds.width,
        height: detection.bounds.height,
      })
      overlay.bounds = detection.bounds
    }
  }

  private removeOverlay(id: string) {
    const overlay = this.overlays.get(id)
    if (overlay) {
      overlay.window.destroy()
      this.overlays.delete(id)
    }
  }

  private generateOverlayHtml(detection: Detection): string {
    const bg = this.style === 'block'
      ? 'background:#000;'
      : this.style === 'blur'
        ? 'background:rgba(0,0,0,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
        : 'background:repeating-conic-gradient(#000 0% 25%, #111 0% 50%) 0 0/8px 8px;'

    return `<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{overflow:hidden;background:transparent;-webkit-app-region:no-drag}
.overlay{position:fixed;inset:0;${bg}border-radius:2px;pointer-events:none}
</style></head>
<body><div class="overlay"></div></body></html>`
  }

  revealOverlay(id: string) {
    this.removeOverlay(id)
  }

  clearAll() {
    for (const [id] of this.overlays) {
      this.removeOverlay(id)
    }
  }

  private gc() {
    const now = Date.now()
    for (const [id, overlay] of this.overlays) {
      if (now - overlay.createdAt > this.overlayLifetimeMs) {
        this.removeOverlay(id)
      }
    }
  }

  getOverlayCount(): number {
    return this.overlays.size
  }

  isEnabled(): boolean {
    return this.enabled
  }
}
