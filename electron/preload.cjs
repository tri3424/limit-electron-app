'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('examProctor', {
  captureAppScreenshot: async (payload) => {
    return ipcRenderer.invoke('exam:captureAppScreenshot', payload);
  },
	  captureFullPageScreenshot: async () => {
	    return ipcRenderer.invoke('exam:captureFullPageScreenshot');
	  },
	  captureViewportScreenshot: async () => {
	    return ipcRenderer.invoke('exam:captureViewportScreenshot');
	  },
});

contextBridge.exposeInMainWorld('offlineAi', {
  status: async () => {
    return ipcRenderer.invoke('offlineAi:status');
  },
  embedText: async (payload) => {
    return ipcRenderer.invoke('offlineAi:embed', payload);
  },
	reasoningStatus: async () => {
		return ipcRenderer.invoke('offlineAi:reasoningStatus');
	},
	explain: async (payload) => {
		return ipcRenderer.invoke('offlineAi:explain', payload);
	},
	chat: async (payload) => {
		return ipcRenderer.invoke('offlineAi:chat', payload);
	},
});
