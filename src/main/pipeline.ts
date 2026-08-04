import { EventEmitter } from 'events'
import { CaptureEngine } from './capture-engine'
import { OcrEngine } from './ocr-engine'
import { DetectionEngine, DetectionResult } from './detection-engine'
import { ScreenSharingDetector, ScreenSharingState } from './screen-sharing-detector'
import { PipelineMetrics } from '../shared/types'

export interface PipelineConfig {
  captureIntervalMs: number
  sharingPollIntervalMs: number
  minConfidence: number
  enableFrameSkipping: boolean
  maxConsecutiveSkips: number
}

const DEFAULT_CONFIG: PipelineConfig = {
  captureIntervalMs: 500,
  sharingPollIntervalMs: 1000,
  minConfidence: 0.60,
  enableFrameSkipping: true,
  maxConsecutiveSkips: 10,
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

  constructor(config: Partial<PipelineConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.capture = new CaptureEngine()
    this.ocr = new OcrEngine()
    this.detection = new DetectionEngine()
    this.sharingDetector = new ScreenSharingDetector(this.config.sharingPollIntervalMs)
  }

  async start() {
    if (this.running) return

    await this.ocr.initialize()
    this.running = true

    this.sharingDetector.on('sharing-started', (state: ScreenSharingState) => {
      this.emit('sharing-started', state)
      this.startCaptureLoop()
    })

    this.sharingDetector.on('sharing-stopped', () => {
      this.emit('sharing-stopped')
      this.stopCaptureLoop()
      this.capture.resetDiff()
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

  private async tick() {
    if (!this.running) return

    const pipelineStart = performance.now()
    let metric: PipelineMetrics = {
      captureMs: 0,
      ocrMs: 0,
      detectionMs: 0,
      overlayMs: 0,
      totalMs: 0,
      frameSkipped: false,
      detectionsFound: 0,
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

        const detStart = performance.now()
        const detections = this.detection.detect(ocrResult.text)
          .filter(d => d.confidence >= this.config.minConfidence)
        metric.detectionMs = performance.now() - detStart
        metric.detectionsFound = detections.length

        this.lastDetections = detections

        if (detections.length > 0) {
          const overlayStart = performance.now()
          this.emit('detections', detections, ocrResult.words)
          metric.overlayMs = performance.now() - overlayStart
        }

        metric.totalMs = performance.now() - pipelineStart
        this.recordMetric(metric)
        this.emit('frame-processed', metric)
      }

      this.capture.cleanup(captureResult.path)
    } catch (err) {
      this.emit('error', err)
    }

    if (this.running) {
      this.loopTimer = setTimeout(() => this.tick(), this.config.captureIntervalMs)
    }
  }

  private recordMetric(metric: PipelineMetrics) {
    this.metrics.push(metric)
    if (this.metrics.length > this.metricsMaxSize) {
      this.metrics.shift()
    }
  }

  getMetrics(): { avg: PipelineMetrics; recent: PipelineMetrics[]; skipRate: number } {
    if (this.metrics.length === 0) {
      return { avg: { captureMs: 0, ocrMs: 0, detectionMs: 0, overlayMs: 0, totalMs: 0, frameSkipped: false, detectionsFound: 0 }, recent: [], skipRate: 0 }
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

    return {
      avg: {
        captureMs: sum.captureMs / n,
        ocrMs: sum.ocrMs / n,
        detectionMs: sum.detectionMs / n,
        overlayMs: sum.overlayMs / n,
        totalMs: sum.totalMs / n,
        frameSkipped: false,
        detectionsFound: sum.detectionsFound / n,
      },
      recent: this.metrics.slice(-10),
      skipRate: skipped / n,
    }
  }

  getLastDetections(): DetectionResult[] {
    return [...this.lastDetections]
  }

  isRunning(): boolean {
    return this.running
  }

  getSharingState(): ScreenSharingState {
    return this.sharingDetector.getState()
  }
}
