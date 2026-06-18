const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const { ensureDir } = require('../utils/backup');

const PEOPLE_FILE_NAME = '사람 데이터.xlsx';

function getDefaultWorkspaceDir() {
  if (app.isPackaged) {
    return path.join(app.getPath('documents'), 'gbScanner');
  }

  return process.cwd();
}

class SettingsService {
  constructor() {
    this.workspaceDir = getDefaultWorkspaceDir();
    this.configDir = path.join(this.workspaceDir, 'config');
    this.settingsPath = path.join(this.configDir, 'settings.json');
    this.settings = null;
  }

  async load() {
    await ensureDir(this.configDir);

    if (!this.settings) {
      try {
        const raw = await fs.promises.readFile(this.settingsPath, 'utf8');
        this.settings = JSON.parse(raw);
      } catch {
        this.settings = {};
      }
    }

    const defaults = this.getDefaults();
    this.settings = { ...defaults, ...this.settings };
    await this.save();
    return this.settings;
  }

  getDefaults() {
    return {
      workspaceDir: this.workspaceDir,
      peoplePath: path.join(this.workspaceDir, PEOPLE_FILE_NAME),
      recordsDir: path.join(this.workspaceDir, 'records'),
      outputDir: path.join(this.workspaceDir, 'output'),
      backupsDir: path.join(this.workspaceDir, 'backups'),
      configDir: this.configDir
    };
  }

  async save() {
    await ensureDir(this.configDir);
    await fs.promises.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
  }

  async get() {
    const settings = await this.load();
    const peopleExists = await exists(settings.peoplePath);
    const recordsExists = await exists(settings.recordsDir);
    return {
      ...settings,
      peopleExists,
      recordsExists
    };
  }

  async choosePeopleFile(browserWindow) {
    const result = await dialog.showOpenDialog(browserWindow, {
      title: '사람 데이터.xlsx 선택',
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return this.get();
    }

    await this.load();
    this.settings.peoplePath = result.filePaths[0];
    await this.save();
    return this.get();
  }
}

async function exists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  SettingsService
};
