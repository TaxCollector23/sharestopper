import Tesseract from 'tesseract.js'

export interface OcrResult {
  text: string
  ocrTimeMs: number
  confidence: number
  words: Array<{
    text: string
    confidence: number
    bbox: { x0: number; y0: number; x1: number; y1: number }
  }>
  cached: boolean
  workerId: number
}

interface CacheEntry {
  result: OcrResult
  accessedAt: number
  hits: number
}

export class OcrEngine {
  private workers: Tesseract.Worker[] = []
  private workerBusy: boolean[] = []
  private poolSize: number
  private initializing: Promise<void> | null = null
  private cache: Map<string, CacheEntry> = new Map()
  private cacheMaxSize = 64
  private totalOcrMs = 0
  private totalOcrCalls = 0
  private cacheHits = 0

  constructor(poolSize = 2) {
    this.poolSize = Math.max(1, Math.min(poolSize, 4))
  }

  async initialize() {
    if (this.workers.length > 0) return
    if (this.initializing) { await this.initializing; return }

    this.initializing = (async () => {
      for (let i = 0; i < this.poolSize; i++) {
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: () => {},
        })
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        })
        this.workers.push(worker)
        this.workerBusy.push(false)
      }
    })()

    await this.initializing
  }

  private async acquireWorker(): Promise<number> {
    for (let i = 0; i < this.workers.length; i++) {
      if (!this.workerBusy[i]) {
        this.workerBusy[i] = true
        return i
      }
    }
    return new Promise<number>((resolve) => {
      const check = setInterval(() => {
        for (let i = 0; i < this.workers.length; i++) {
          if (!this.workerBusy[i]) {
            clearInterval(check)
            this.workerBusy[i] = true
            resolve(i)
            return
          }
        }
      }, 10)
    })
  }

  private releaseWorker(id: number) {
    this.workerBusy[id] = false
  }

  async recognize(imagePath: string, cacheKey?: string): Promise<OcrResult> {
    if (cacheKey) {
      const cached = this.getFromCache(cacheKey)
      if (cached) return cached
    }

    await this.initialize()
    const workerId = await this.acquireWorker()

    try {
      const start = performance.now()
      const { data } = await this.workers[workerId].recognize(imagePath)
      const ocrTimeMs = performance.now() - start
      this.trackTiming(ocrTimeMs)

      const result = this.buildResult(data, ocrTimeMs, workerId)
      if (cacheKey) this.cacheResult(cacheKey, result)
      return result
    } finally {
      this.releaseWorker(workerId)
    }
  }

  async recognizeBuffer(buffer: Buffer, cacheKey?: string): Promise<OcrResult> {
    if (cacheKey) {
      const cached = this.getFromCache(cacheKey)
      if (cached) return cached
    }

    await this.initialize()
    const workerId = await this.acquireWorker()

    try {
      const start = performance.now()
      const { data } = await this.workers[workerId].recognize(buffer)
      const ocrTimeMs = performance.now() - start
      this.trackTiming(ocrTimeMs)

      const result = this.buildResult(data, ocrTimeMs, workerId)
      if (cacheKey) this.cacheResult(cacheKey, result)
      return result
    } finally {
      this.releaseWorker(workerId)
    }
  }

  async recognizeParallel(buffers: Buffer[]): Promise<OcrResult[]> {
    await this.initialize()
    return Promise.all(buffers.map(buf => this.recognizeBuffer(buf)))
  }

  async recognizeRegions(imagePath: string, regions: Array<{ x: number; y: number; w: number; h: number }>): Promise<OcrResult[]> {
    await this.initialize()

    const results: OcrResult[] = []
    for (const region of regions) {
      const workerId = await this.acquireWorker()
      try {
        const start = performance.now()
        const { data } = await this.workers[workerId].recognize(imagePath, {
          rectangle: { top: region.y, left: region.x, width: region.w, height: region.h },
        })
        const ocrTimeMs = performance.now() - start
        this.trackTiming(ocrTimeMs)
        results.push(this.buildResult(data, ocrTimeMs, workerId))
      } finally {
        this.releaseWorker(workerId)
      }
    }
    return results
  }

  private buildResult(data: any, ocrTimeMs: number, workerId: number): OcrResult {
    const words = (data.words || []).map((w: any) => ({
      text: w.text,
      confidence: w.confidence,
      bbox: w.bbox,
    }))
    return { text: data.text, ocrTimeMs, confidence: data.confidence, words, cached: false, workerId }
  }

  private getFromCache(key: string): OcrResult | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    entry.accessedAt = Date.now()
    entry.hits++
    this.cacheHits++
    return { ...entry.result, cached: true }
  }

  private cacheResult(key: string, result: OcrResult) {
    if (this.cache.size >= this.cacheMaxSize) {
      this.evictLRU()
    }
    this.cache.set(key, { result, accessedAt: Date.now(), hits: 0 })
  }

  private evictLRU() {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [key, entry] of this.cache) {
      if (entry.accessedAt < oldestTime) {
        oldestTime = entry.accessedAt
        oldestKey = key
      }
    }
    if (oldestKey) this.cache.delete(oldestKey)
  }

  private trackTiming(ms: number) {
    this.totalOcrMs += ms
    this.totalOcrCalls++
  }

  getStats(): { avgOcrMs: number; totalCalls: number; cacheHits: number; cacheSize: number; poolSize: number } {
    return {
      avgOcrMs: this.totalOcrCalls > 0 ? this.totalOcrMs / this.totalOcrCalls : 0,
      totalCalls: this.totalOcrCalls,
      cacheHits: this.cacheHits,
      cacheSize: this.cache.size,
      poolSize: this.poolSize,
    }
  }

  clearCache() {
    this.cache.clear()
  }

  getCacheSize(): number {
    return this.cache.size
  }

  async terminate() {
    for (const worker of this.workers) {
      await worker.terminate()
    }
    this.workers = []
    this.workerBusy = []
    this.initializing = null
    this.cache.clear()
  }
}
