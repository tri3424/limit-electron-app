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

contextBridge.exposeInMainWorld('songs', {
  saveAudioFile: async (payload) => {
    return ipcRenderer.invoke('songs:saveAudioFile', payload);
  },
  readAudioFile: async (payload) => {
    return ipcRenderer.invoke('songs:readAudioFile', payload);
  },
  deleteAudioFile: async (payload) => {
    return ipcRenderer.invoke('songs:deleteAudioFile', payload);
  },
});

contextBridge.exposeInMainWorld('ocr', {
  pickPdf: async () => {
    return ipcRenderer.invoke('ocr:pickPdf');
  },
  importExamPdf: async (payload) => {
    return ipcRenderer.invoke('ocr:importExamPdf', payload);
  },
});

contextBridge.exposeInMainWorld('data', {
  exportJsonToFile: async (payload) => {
    return ipcRenderer.invoke('data:exportJsonToFile', payload);
  },
});
