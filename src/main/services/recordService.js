const { CATEGORIES, CATEGORY_ORDER } = require('../constants');
const { backupFile } = require('../utils/backup');
const { parseAmount } = require('../utils/money');
const { toCamelCategory } = require('./workSessionService');

class RecordService {
  constructor(settingsService, workSessionService, barcodeService, categoryRecordRepository) {
    this.settingsService = settingsService;
    this.workSessionService = workSessionService;
    this.barcodeService = barcodeService;
    this.categoryRecordRepository = categoryRecordRepository;
    this.writeQueue = Promise.resolve();
    this.recentRecords = [];
  }

  async lookupForScan(barcode) {
    const lookup = await this.barcodeService.lookup(barcode);
    const session = this.workSessionService.getCurrent();

    if (!session) {
      return {
        ...lookup,
        duplicate: false
      };
    }

    const filePath = this.workSessionService.getFileForCategory(lookup.categoryCode);
    const records = await this.categoryRecordRepository.list(filePath);
    const duplicateRecord = records.find((record) => record.barcode === lookup.barcode);

    return {
      ...lookup,
      duplicate: Boolean(duplicateRecord),
      duplicateRecord: duplicateRecord || null
    };
  }

  async append(payload) {
    const run = async () => {
      const lookup = await this.barcodeService.lookup(payload.barcode);
      const paidAmount = parseAmount(payload.paidAmount);
      if (paidAmount === null) {
        throw new Error('낸 금액을 입력해주세요.');
      }

      const filePath = this.workSessionService.getFileForCategory(lookup.categoryCode);
      const settings = await this.settingsService.get();
      await backupFile(filePath, settings.backupsDir);

      const record = {
        barcode: lookup.barcode,
        code: lookup.displayCode,
        name: lookup.name,
        spouseName: lookup.spouseName,
        paidAmount
      };

      await this.categoryRecordRepository.append(filePath, record);

      const saved = {
        ...lookup,
        paidAmount,
        filePath,
        savedAt: new Date().toISOString()
      };
      this.recentRecords.unshift(saved);
      this.recentRecords = this.recentRecords.slice(0, 20);

      return saved;
    };

    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }

  async listBySession() {
    const session = this.workSessionService.getCurrent();
    if (!session) {
      return {
        session: null,
        categories: {},
        recentRecords: this.recentRecords
      };
    }

    const categories = {};
    for (const categoryCode of CATEGORY_ORDER) {
      const category = CATEGORIES[categoryCode];
      const filePath = session.files[toCamelCategory(categoryCode)];
      const records = await this.categoryRecordRepository.list(filePath);
      const total = records.reduce((sum, record) => sum + Number(String(record.paidAmount).replace(/,/g, '') || 0), 0);
      categories[categoryCode] = {
        label: category.label,
        filePath,
        count: records.length,
        total,
        records
      };
    }

    return {
      session,
      categories,
      recentRecords: this.recentRecords
    };
  }
}

module.exports = {
  RecordService
};
