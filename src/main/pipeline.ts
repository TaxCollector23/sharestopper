import { EventEmitter } from 'events'
import { CaptureEngine } from './capture-engine'
import { OcrEngine } from './ocr-engine'
import { DetectionEngine, DetectionResult, DetectionContext } from './detection-engine'
import { ScreenSharingDetector, ScreenSharingState } from './screen-sharing-detector'
import { PipelineMetrics } from '../shared/types'

export interface PipelineConfig {
  captureIntervalMs: number
  sharingPollIntervalMs: number
  minConfidence: number
  enableFrameSkipping: boolean
  maxConsecutiveSkips: number
  adaptiveInterval: boolean
  minIntervalMs: number
  maxIntervalMs: number
  ocrWorkerPool: number
  overlayDebounceMs: number
  multiDisplay: boolean
}

const DEFAULT_CONFIG: PipelineConfig = {
  captureIntervalMs: 500,
  sharingPollIntervalMs: 1000,
  minConfidence: 0.60,
  enableFrameSkipping: true,
  maxConsecutiveSkips: 10,
  adaptiveInterval: true,
  minIntervalMs: 200,
  maxIntervalMs: 2000,
  ocrWorkerPool: 2,
  overlayDebounceMs: 100,
  multiDisplay: false,
}

export class Pipeline extends EventEmitter {
  private capture: CaptureEngine
  private ocr: OcrEngine
  private detection: DetectionEngine
  private sharingDetector: ScreenSharingDetector
  private config: PipelineConfig
  private running = false
  private loopTimer: NodeJS.Timeout | null = null
  private metrics: PipelineMetrics[] = []
  private metricsMaxSize = 100
  private lastDetections: DetectionResult[] = []
  private currentInterval: number
  private consecutiveClean = 0
  private consecutiveDetections = 0
  private lastOverlayEmit = 0
  private lastOcrText = ''
  private contextCache: DetectionContext = {}
  private framesProcessed = 0
  private totalPipelineMs = 0

  constructor(config: Partial<PipelineConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.currentInterval = this.config.captureIntervalMs
    this.capture = new CaptureEngine()
    this.ocr = new OcrEngine(this.config.ocrWorkerPool)
    this.detection = new DetectionEngine()
    this.sharingDetector = new ScreenSharingDetector(this.config.sharingPollIntervalMs)
  }

  async start() {
    if (this.running) return

    await this.ocr.initialize()
    if (this.config.multiDisplay) {
      await this.capture.detectDisplays()
    }
    this.running = true

    this.sharingDetector.on('sharing-started', (state: ScreenSharingState) => {
      this.emit('sharing-started', state)
      this.currentInterval = this.config.captureIntervalMs
      this.consecutiveClean = 0
      this.consecutiveDetections = 0
      this.startCaptureLoop()
    })

    this.sharingDetector.on('sharing-stopped', () => {
      this.emit('sharing-stopped')
      this.stopCaptureLoop()
      this.capture.resetDiff()
      this.lastOcrText = ''
      this.contextCache = {}
    })

    await this.sharingDetector.start()
    this.emit('started')
  }

  async stop() {
    this.running = false
    this.stopCaptureLoop()
    this.sharingDetector.stop()
    await this.ocr.terminate()
    this.capture.cleanupAll()
    this.emit('stopped')
  }

  private startCaptureLoop() {
    if (this.loopTimer) return
    this.tick()
  }

  private stopCaptureLoop() {
    if (this.loopTimer) {
      clearTimeout(this.loopTimer)
      this.loopTimer = null
    }
  }

  private inferContext(text: string, sharingApp: string | null): DetectionContext {
    const lower = text.toLowerCase()
    const ctx: DetectionContext = {}

    if (lower.includes('.env') || lower.includes('dotenv') || /^[A-Z_]+=.+/m.test(text)) {
      ctx.isEnvFile = true
    }
    if (lower.includes('$ ') || lower.includes('~/') || lower.includes('bash') || lower.includes('zsh')) {
      ctx.isTerminal = true
    }

    const appIndicators: [string, string][] = [
      ['vs code', 'VS Code'], ['visual studio code', 'VS Code'], ['cursor', 'Cursor'],
      ['intellij', 'IntelliJ'], ['webstorm', 'IntelliJ'], ['pycharm', 'IntelliJ'],
      ['sublime', 'Sublime'], ['atom', 'Atom'], ['vim', 'Vim'], ['neovim', 'Vim'],
    ]
    for (const [indicator, name] of appIndicators) {
      if (lower.includes(indicator)) { ctx.appName = name; break }
    }

    if (!ctx.appName && sharingApp) {
      const appMap: Record<string, string> = {
        'zoom': 'Zoom', 'google-meet': 'Chrome', 'teams': 'Teams',
        'discord': 'Discord', 'slack': 'Slack',
      }
      ctx.appName = appMap[sharingApp]
    }

    return ctx
  }

  private adaptInterval(detectionsFound: number) {
    if (!this.config.adaptiveInterval) return

    if (detectionsFound > 0) {
      this.consecutiveDetections++
      this.consecutiveClean = 0
      // Speed up when actively detecting secrets
      this.currentInterval = Math.max(
        this.config.minIntervalMs,
        this.currentInterval * 0.7
      )
    } else {
      this.consecutiveClean++
      this.consecutiveDetections = 0
      // Slow down gradually when screen is clean
      if (this.consecutiveClean > 5) {
        this.currentInterval = Math.min(
          this.config.maxIntervalMs,
          this.currentInterval * 1.3
        )
      }
    }
  }

  private shouldEmitOverlay(): boolean {
    const now = performance.now()
    if (now - this.lastOverlayEmit < this.config.overlayDebounceMs) return false
    this.lastOverlayEmit = now
    return true
  }

  private async tick() {
    if (!this.running) return

    const pipelineStart = performance.now()
    let metric: PipelineMetrics = {
      captureMs: 0, ocrMs: 0, detectionMs: 0, overlayMs: 0,
      totalMs: 0, frameSkipped: false, detectionsFound: 0,
    }

    try {
      const captureResult = await this.capture.captureScreen()
      metric.captureMs = captureResult.captureTimeMs

      if (this.config.enableFrameSkipping && !captureResult.changed && this.capture.getSkipCount() <= this.config.maxConsecutiveSkips) {
        metric.frameSkipped = true
        metric.totalMs = performance.now() - pipelineStart
        metric.detectionsFound = this.lastDetections.length
        this.recordMetric(metric)
        this.emit('frame-skipped', metric)
      } else {
        const ocrResult = await this.ocr.recognizeBuffer(captureResult.buffer, captureResult.hash)
        metric.ocrMs = ocrResult.ocrTimeMs

        // Detect context from OCR text
        const sharingState = this.sharingDetector.getState()
        this.contextCache = this.inferContext(ocrResult.text, sharingState.app)

        const detStart = performance.now()
        let detections = this.detection.detect(ocrResult.text)
          .filter(d => d.confidence >= this.config.minConfidence)

        // Apply context boosting
        if (Object.keys(this.contextCache).length > 0) {
          this.contextCache.hasMultipleSecrets = detections.length >= 3
          detections = this.detection.boostConfidence(detections, this.contextCache)
        }

        metric.detectionMs = performance.now() - detStart
        metric.detectionsFound = detections.length

        this.lastDetections = detections
        this.lastOcrText = ocrResult.text
        this.adaptInterval(detections.length)

        if (detections.length > 0 && this.shouldEmitOverlay()) {
          const overlayStart = performance.now()
          this.emit('detections', detections, ocrResult.words)
          metric.overlayMs = performance.now() - overlayStart
        }

        metric.totalMs = performance.now() - pipelineStart
        this.recordMetric(metric)
        this.framesProcessed++
        this.totalPipelineMs += metric.totalMs
        this.emit('frame-processed', metric)
      }

      this.capture.cleanup(captureResult.path)
    } catch (err) {
      this.emit('error', err)
    }

    if (this.running) {
      this.loopTimer = setTimeout(() => this.tick(), this.currentInterval)
    }
  }

  private recordMetric(metric: PipelineMetrics) {
    this.metrics.push(metric)
    if (this.metrics.length > this.metricsMaxSize) {
      this.metrics.shift()
    }
  }

  getMetrics(): { avg: PipelineMetrics; recent: PipelineMetrics[]; skipRate: number; currentIntervalMs: number; fps: number } {
    if (this.metrics.length === 0) {
      return {
        avg: { captureMs: 0, ocrMs: 0, detectionMs: 0, overlayMs: 0, totalMs: 0, frameSkipped: false, detectionsFound: 0 },
        recent: [], skipRate: 0, currentIntervalMs: this.currentInterval, fps: 0,
      }
    }

    const sum = this.metrics.reduce((acc, m) => ({
      captureMs: acc.captureMs + m.captureMs,
      ocrMs: acc.ocrMs + m.ocrMs,
      detectionMs: acc.detectionMs + m.detectionMs,
      overlayMs: acc.overlayMs + m.overlayMs,
      totalMs: acc.totalMs + m.totalMs,
      frameSkipped: false,
      detectionsFound: acc.detectionsFound + m.detectionsFound,
    }), { captureMs: 0, ocrMs: 0, detectionMs: 0, overlayMs: 0, totalMs: 0, frameSkipped: false, detectionsFound: 0 })

    const n = this.metrics.length
    const skipped = this.metrics.filter(m => m.frameSkipped).length
    const avgTotal = sum.totalMs / n

    return {
      avg: {
        captureMs: sum.captureMs / n,
        ocrMs: sum.ocrMs / n,
        detectionMs: sum.detectionMs / n,
        overlayMs: sum.overlayMs / n,
        totalMs: avgTotal,
        frameSkipped: false,
        detectionsFound: sum.detectionsFound / n,
      },
      recent: this.metrics.slice(-10),
      skipRate: skipped / n,
      currentIntervalMs: this.currentInterval,
      fps: avgTotal > 0 ? 1000 / (avgTotal + this.currentInterval) : 0,
    }
  }

  getLastDetections(): DetectionResult[] {
    return [...this.lastDetections]
  }

  getContext(): DetectionContext {
    return { ...this.contextCache }
  }

  getPerformanceStats(): { framesProcessed: number; avgPipelineMs: number; ocrStats: any; detectionStats: any } {
    return {
      framesProcessed: this.framesProcessed,
      avgPipelineMs: this.framesProcessed > 0 ? this.totalPipelineMs / this.framesProcessed : 0,
      ocrStats: this.ocr.getStats(),
      detectionStats: this.detection.getStats(),
    }
  }

  isRunning(): boolean {
    return this.running
  }

  getSharingState(): ScreenSharingState {
    return this.sharingDetector.getState()
  }

  getCurrentInterval(): number {
    return this.currentInterval
  }
}
