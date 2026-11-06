const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lousaDisk', {
  load: () => ipcRenderer.sendSync('lousa:load'),
  save: text => ipcRenderer.sendSync('lousa:save', text),
  pdf: name => ipcRenderer.invoke('lousa:pdf', name),
  onUpdate: fn => ipcRenderer.on('lousa:update', (_, info) => fn(info)),
  open: url => ipcRenderer.send('lousa:open', url)
});
