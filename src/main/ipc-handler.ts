import { ipcMain, BrowserWindow } from 'electron'
import { Pipeline } from './pipeline'
import { OverlayEngine } from './overlay-engine'
import { Whitelist } from './whitelist'
import { Detection, OverlayStyle, ProtectionProfile } from '../shared/types'
import { DetectionResult } from './detection-engine'

export class IpcHandler {
  private pipeline: Pipeline
  private overlays: OverlayEngine
  private whitelist: Whitelist
  private mainWindow: BrowserWindow | null = null

  constructor(pipeline: Pipeline, overlays: OverlayEngine, whitelist: Whitelist) {
    this.pipeline = pipeline
    this.overlays = overlays
    this.whitelist = whitelist
  }

  register(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow

    ipcMain.handle('protection:start', async () => {
      await this.pipeline.start()
      this.overlays.start()
      return { ok: true }
    })

    ipcMain.handle('protection:stop', async () => {
      await this.pipeline.stop()
      this.overlays.stop()
      return { ok: true }
    })

    ipcMain.handle('protection:status', () => ({
      running: this.pipeline.isRunning(),
      sharing: this.pipeline.getSharingState(),
      metrics: this.pipeline.getMetrics(),
      overlayCount: this.overlays.getOverlayCount(),
      overlayStyle: this.overlays.getStyle(),
    }))

    ipcMain.handle('overlay:set-style', (_event, style: OverlayStyle) => {
      this.overlays.setStyle(style)
      return { ok: true }
    })

    ipcMain.handle('overlay:reveal', (_event, id: string) => {
      this.overlays.revealOverlay(id)
      return { ok: true }
    })

    ipcMain.handle('overlay:clear', () => {
      this.overlays.clearAll()
      return { ok: true }
    })

    ipcMain.handle('whitelist:add', (_event, pattern: string, type: string, reason: string) => {
      this.whitelist.add(pattern, type as any, reason)
      return { ok: true }
    })

    ipcMain.handle('whitelist:remove', (_event, pattern: string) => {
      this.whitelist.remove(pattern)
      return { ok: true }
    })

    ipcMain.handle('whitelist:list', () => ({
      entries: this.whitelist.getEntries(),
      builtinCount: this.whitelist.getBuiltinCount(),
    }))

    ipcMain.handle('metrics:get', () => this.pipeline.getMetrics())

    ipcMain.handle('detections:latest', () => this.pipeline.getLastDetections())

    this.pipeline.on('detections', (detections: DetectionResult[]) => {
      const filtered = this.whitelist.filter(detections)
      if (filtered.length === 0) return

      const mapped: Detection[] = filtered.map((d, i) => ({
        id: `det-${Date.now()}-${i}`,
        type: d.type,
        label: d.label,
        value: d.value,
        confidence: d.confidence,
        timestamp: Date.now(),
      }))

      this.overlays.showOverlays(mapped)
      this.sendToRenderer('detections:new', mapped)
    })

    this.pipeline.on('sharing-started', (state) => {
      this.sendToRenderer('sharing:started', state)
    })

    this.pipeline.on('sharing-stopped', () => {
      this.sendToRenderer('sharing:stopped')
    })

    this.pipeline.on('frame-processed', (metrics) => {
      this.sendToRenderer('frame:processed', metrics)
    })

    this.pipeline.on('frame-skipped', (metrics) => {
      this.sendToRenderer('frame:skipped', metrics)
    })

    this.pipeline.on('error', (err) => {
      this.sendToRenderer('error', { message: String(err) })
    })
  }

  private sendToRenderer(channel: string, data?: any) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  unregister() {
    const channels = [
      'protection:start', 'protection:stop', 'protection:status',
      'overlay:set-style', 'overlay:reveal', 'overlay:clear',
      'whitelist:add', 'whitelist:remove', 'whitelist:list',
      'metrics:get', 'detections:latest',
    ]
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
  }
}
