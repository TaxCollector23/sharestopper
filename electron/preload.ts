import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  startProtection: () => ipcRenderer.invoke('start-protection'),
  stopProtection: () => ipcRenderer.invoke('stop-protection'),
  createOverlay: (data: { id: string; bounds: any; style: string }) =>
    ipcRenderer.invoke('create-overlay', data),
  removeOverlay: (data: { id: string }) =>
    ipcRenderer.invoke('remove-overlay', data),
  clearOverlays: () => ipcRenderer.invoke('clear-overlays'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  isProtecting: () => ipcRenderer.invoke('is-protecting'),
  onToggleProtection: (callback: () => void) => {
    ipcRenderer.on('toggle-protection', callback)
    return () => ipcRenderer.removeListener('toggle-protection', callback)
  },
})
