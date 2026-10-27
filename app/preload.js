const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  saveFile: (data, defaultName, filters) => ipcRenderer.invoke('save-file', { data, defaultName, filters }),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath)
});
