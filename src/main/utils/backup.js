const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function backupFile(filePath, backupsRoot) {
  await ensureDir(backupsRoot);

  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
  } catch {
    return null;
  }

  const parsed = path.parse(filePath);
  const stamp = dayjs().format('YYYYMMDD_HHmmss');
  const backupPath = path.join(backupsRoot, `${parsed.name}.${stamp}${parsed.ext}`);
  await fs.promises.copyFile(filePath, backupPath);
  return backupPath;
}

module.exports = {
  ensureDir,
  backupFile
};
