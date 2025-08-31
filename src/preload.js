// src/preload.js
const { contextBridge, ipcRenderer } = require('electron');

try {
  contextBridge.exposeInMainWorld('api', {
    getPedidos: () => ipcRenderer.invoke('pedidos:listar'),
  });
  console.log('[preload] bridge injetada');
} catch (e) {
  console.error('[preload] falha ao expor API:', e);
}
