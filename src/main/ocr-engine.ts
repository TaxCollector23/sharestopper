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
}

export class OcrEngine {
  private worker: Tesseract.Worker | null = null
  private initializing: Promise<void> | null = null

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

  async recognize(imagePath: string): Promise<OcrResult> {
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

    return {
      text: data.text,
      ocrTimeMs,
      confidence: data.confidence,
      words,
    }
  }

  async recognizeBuffer(buffer: Buffer): Promise<OcrResult> {
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

    return {
      text: data.text,
      ocrTimeMs,
      confidence: data.confidence,
      words,
    }
  }

  async terminate() {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.initializing = null
    }
  }
}
