const { ipcMain, shell } = require('electron');

function registerIpcHandlers(services, getMainWindow) {
  ipcMain.handle('settings:get', () => services.settingsService.get());
  ipcMain.handle('settings:choosePeopleFile', () => services.settingsService.choosePeopleFile(getMainWindow()));

  ipcMain.handle('people:list', () => services.peopleService.list());

  ipcMain.handle('barcodes:preview', (_event, options) => services.barcodeService.preview(options));
  ipcMain.handle('barcodes:createPdf', (_event, options) => services.pdfService.createBarcodePdf(options));

  ipcMain.handle('workSession:start', (_event, date) => services.workSessionService.start(date));
  ipcMain.handle('workSession:getCurrent', () => services.workSessionService.getCurrent());

  ipcMain.handle('scan:lookup', (_event, barcode) => services.recordService.lookupForScan(barcode));
  ipcMain.handle('records:append', (_event, payload) => services.recordService.append(payload));
  ipcMain.handle('records:listBySession', () => services.recordService.listBySession());

  ipcMain.handle('files:open', async (_event, filePath) => {
    const result = await shell.openPath(filePath);
    if (result) {
      throw new Error(result);
    }
    return true;
  });

  ipcMain.handle('files:showInFolder', (_event, filePath) => {
    shell.showItemInFolder(filePath);
    return true;
  });
}

module.exports = {
  registerIpcHandlers
};
