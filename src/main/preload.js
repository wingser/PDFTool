const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pdfTool', {
  selectPdf: () => ipcRenderer.invoke('dialog:selectPdf'),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectOutput: () => ipcRenderer.invoke('dialog:selectOutput'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  testMail: (mailConfig) => ipcRenderer.invoke('mail:test', mailConfig),
  runTask: (options) => ipcRenderer.invoke('task:run', options),
  sendFiles: (payload) => ipcRenderer.invoke('mail:sendFiles', payload),
  showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('task:progress', listener);
    return () => ipcRenderer.removeListener('task:progress', listener);
  }
});
