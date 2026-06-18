const path = require('path');
const Module = require('module');
const { app, BrowserWindow } = require('electron');

const vendorNodeModules = app.isPackaged
  ? path.join(process.resourcesPath, 'vendor/node_modules')
  : path.join(__dirname, '../vendor/node_modules');
const appNodeModules = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar/node_modules')
  : path.join(__dirname, '../../node_modules');
process.env.NODE_PATH = [vendorNodeModules, appNodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();

const { registerIpcHandlers } = require('./ipc');
const { SettingsService } = require('./services/settingsService');
const { PeopleRepository } = require('./excel/peopleRepository');
const { CategoryRecordRepository } = require('./excel/categoryRecordRepository');
const { PeopleService } = require('./services/peopleService');
const { BarcodeService } = require('./services/barcodeService');
const { PdfService } = require('./services/pdfService');
const { WorkSessionService } = require('./services/workSessionService');
const { RecordService } = require('./services/recordService');

let mainWindow;

const settingsService = new SettingsService();
const peopleRepository = new PeopleRepository();
const categoryRecordRepository = new CategoryRecordRepository();
const peopleService = new PeopleService(settingsService, peopleRepository);
const barcodeService = new BarcodeService(settingsService, peopleService);
const pdfService = new PdfService(settingsService, barcodeService);
const workSessionService = new WorkSessionService(settingsService, categoryRecordRepository);
const recordService = new RecordService(settingsService, workSessionService, barcodeService, categoryRecordRepository);

registerIpcHandlers({
  settingsService,
  peopleService,
  barcodeService,
  pdfService,
  workSessionService,
  recordService
}, () => mainWindow);

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: 'gbScanner',
    backgroundColor: '#f6f7fb',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (!app.isPackaged && process.env.GBSCANNER_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(async () => {
  await settingsService.load();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
