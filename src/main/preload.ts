import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('sharestopper', {
  protection: {
    start: () => ipcRenderer.invoke('protection:start'),
    stop: () => ipcRenderer.invoke('protection:stop'),
    status: () => ipcRenderer.invoke('protection:status'),
  },
  overlay: {
    setStyle: (style: string) => ipcRenderer.invoke('overlay:set-style', style),
    reveal: (id: string) => ipcRenderer.invoke('overlay:reveal', id),
    clear: () => ipcRenderer.invoke('overlay:clear'),
  },
  whitelist: {
    add: (pattern: string, type: string, reason: string) => ipcRenderer.invoke('whitelist:add', pattern, type, reason),
    remove: (pattern: string) => ipcRenderer.invoke('whitelist:remove', pattern),
    list: () => ipcRenderer.invoke('whitelist:list'),
  },
  metrics: {
    get: () => ipcRenderer.invoke('metrics:get'),
  },
  detections: {
    latest: () => ipcRenderer.invoke('detections:latest'),
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'detections:new', 'sharing:started', 'sharing:stopped',
      'frame:processed', 'frame:skipped', 'error',
    ]
    if (validChannels.includes(channel)) {
      const listener = (_event: any, ...args: any[]) => callback(...args)
      ipcRenderer.on(channel, listener)
      return () => ipcRenderer.removeListener(channel, listener)
    }
    return () => {}
  },
})
