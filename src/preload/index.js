const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('gbScanner', {
  settings: {
    get: () => invoke('settings:get'),
    choosePeopleFile: () => invoke('settings:choosePeopleFile')
  },
  people: {
    list: () => invoke('people:list')
  },
  barcodes: {
    preview: (options) => invoke('barcodes:preview', options),
    createPdf: (options) => invoke('barcodes:createPdf', options)
  },
  workSession: {
    start: (date) => invoke('workSession:start', date),
    getCurrent: () => invoke('workSession:getCurrent')
  },
  scan: {
    lookup: (barcode) => invoke('scan:lookup', barcode)
  },
  records: {
    append: (payload) => invoke('records:append', payload),
    listBySession: () => invoke('records:listBySession')
  },
  files: {
    open: (path) => invoke('files:open', path),
    showInFolder: (path) => invoke('files:showInFolder', path)
  }
});
