/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    captureScreen: () => Promise<string | null>
    startProtection: () => Promise<boolean>
    stopProtection: () => Promise<boolean>
    createOverlay: (data: { id: string; bounds: any; style: string }) => Promise<boolean>
    removeOverlay: (data: { id: string }) => Promise<boolean>
    clearOverlays: () => Promise<boolean>
    getScreenSize: () => Promise<{ width: number; height: number }>
    isProtecting: () => Promise<boolean>
    onToggleProtection: (callback: () => void) => () => void
  }
}
