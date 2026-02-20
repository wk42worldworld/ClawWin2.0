import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('screenshotAPI', {
  getScreenImage: (): Promise<string> => ipcRenderer.invoke('screenshot:getImage'),
  confirm: (rect: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('screenshot:confirm', rect),
  cancel: () => ipcRenderer.invoke('screenshot:cancel'),
})
