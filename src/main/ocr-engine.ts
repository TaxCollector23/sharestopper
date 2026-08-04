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
}

export class OcrEngine {
  private worker: Tesseract.Worker | null = null
  private initializing: Promise<void> | null = null
  private cache: Map<string, OcrResult> = new Map()
  private cacheMaxSize = 32

  async initialize() {
    if (this.worker) return
    if (this.initializing) { await this.initializing; return }

    this.initializing = (async () => {
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: () => {},
      })
      await this.worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      })
    })()

    await this.initializing
  }

  async recognize(imagePath: string, cacheKey?: string): Promise<OcrResult> {
    if (cacheKey && this.cache.has(cacheKey)) {
      return { ...this.cache.get(cacheKey)!, cached: true }
    }

    await this.initialize()
    if (!this.worker) throw new Error('OCR worker not initialized')

    const start = performance.now()
    const { data } = await this.worker.recognize(imagePath)
    const ocrTimeMs = performance.now() - start

    const words = (data.words || []).map((w: any) => ({
      text: w.text,
      confidence: w.confidence,
      bbox: w.bbox,
    }))

    const result: OcrResult = { text: data.text, ocrTimeMs, confidence: data.confidence, words, cached: false }

    if (cacheKey) this.cacheResult(cacheKey, result)
    return result
  }

  async recognizeBuffer(buffer: Buffer, cacheKey?: string): Promise<OcrResult> {
    if (cacheKey && this.cache.has(cacheKey)) {
      return { ...this.cache.get(cacheKey)!, cached: true }
    }

    await this.initialize()
    if (!this.worker) throw new Error('OCR worker not initialized')

    const start = performance.now()
    const { data } = await this.worker.recognize(buffer)
    const ocrTimeMs = performance.now() - start

    const words = (data.words || []).map((w: any) => ({
      text: w.text,
      confidence: w.confidence,
      bbox: w.bbox,
    }))

    const result: OcrResult = { text: data.text, ocrTimeMs, confidence: data.confidence, words, cached: false }

    if (cacheKey) this.cacheResult(cacheKey, result)
    return result
  }

  async recognizeRegions(imagePath: string, regions: Array<{ x: number; y: number; w: number; h: number }>): Promise<OcrResult[]> {
    await this.initialize()
    if (!this.worker) throw new Error('OCR worker not initialized')

    const results: OcrResult[] = []
    for (const region of regions) {
      const start = performance.now()
      const { data } = await this.worker.recognize(imagePath, {
        rectangle: { top: region.y, left: region.x, width: region.w, height: region.h },
      })
      const ocrTimeMs = performance.now() - start
      const words = (data.words || []).map((w: any) => ({
        text: w.text,
        confidence: w.confidence,
        bbox: w.bbox,
      }))
      results.push({ text: data.text, ocrTimeMs, confidence: data.confidence, words, cached: false })
    }
    return results
  }

  private cacheResult(key: string, result: OcrResult) {
    if (this.cache.size >= this.cacheMaxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(key, result)
  }

  clearCache() {
    this.cache.clear()
  }

  getCacheSize(): number {
    return this.cache.size
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.initializing = null
    }
    this.cache.clear()
  }
}
