const path = require('path');
const { CATEGORY_ORDER, CATEGORIES } = require('../constants');
const { ensureDir } = require('../utils/backup');
const { getWorkDateParts } = require('../utils/dateNames');

class WorkSessionService {
  constructor(settingsService, categoryRecordRepository) {
    this.settingsService = settingsService;
    this.categoryRecordRepository = categoryRecordRepository;
    this.currentSession = null;
  }

  async start(inputDate) {
    const settings = await this.settingsService.get();
    const parts = getWorkDateParts(inputDate);
    const basePath = path.join(settings.recordsDir, parts.dirName);
    await ensureDir(basePath);

    const files = {};
    for (const categoryCode of CATEGORY_ORDER) {
      const category = CATEGORIES[categoryCode];
      const filePath = path.join(basePath, `${parts.filePrefix}_${category.label}.xlsx`);
      await this.categoryRecordRepository.ensureFileIfMissing(filePath);
      files[toCamelCategory(categoryCode)] = filePath;
    }

    this.currentSession = {
      date: parts.date,
      dirName: parts.dirName,
      filePrefix: parts.filePrefix,
      basePath,
      files
    };

    return this.currentSession;
  }

  getCurrent() {
    return this.currentSession;
  }

  getFileForCategory(categoryCode) {
    if (!this.currentSession) {
      throw new Error('진행 중인 작업이 없습니다. 시작하기에서 시작 버튼을 눌러주세요.');
    }

    const key = toCamelCategory(categoryCode);
    const filePath = this.currentSession.files[key];
    if (!filePath) {
      throw new Error(`현재 작업에 해당 항목 파일이 없습니다: ${categoryCode}`);
    }

    return filePath;
  }
}

function toCamelCategory(categoryCode) {
  if (categoryCode === 'TITHE') {
    return 'tithe';
  }
  if (categoryCode === 'MISSION') {
    return 'mission';
  }
  return 'etc';
}

module.exports = {
  WorkSessionService,
  toCamelCategory
};
