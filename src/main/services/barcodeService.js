const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CATEGORIES, CATEGORY_ORDER } = require('../constants');
const { ensureDir } = require('../utils/backup');

class BarcodeService {
  constructor(settingsService, peopleService) {
    this.settingsService = settingsService;
    this.peopleService = peopleService;
  }

  async getSecret() {
    const settings = await this.settingsService.get();
    const secretPath = path.join(settings.configDir, 'app-secret.json');
    await ensureDir(settings.configDir);

    try {
      const raw = await fs.promises.readFile(secretPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.secret) {
        return parsed.secret;
      }
    } catch {
      // Create below.
    }

    const secret = crypto.randomBytes(32).toString('hex');
    await fs.promises.writeFile(secretPath, JSON.stringify({ secret }, null, 2), 'utf8');
    return secret;
  }

  async createValue(key, categoryCode) {
    const category = CATEGORIES[categoryCode];
    if (!category) {
      throw new Error(`알 수 없는 항목입니다: ${categoryCode}`);
    }

    const normalizedKey = normalizeKey(key);
    const check = await this.createCheck(normalizedKey, categoryCode);
    return `GBS:v1:${normalizedKey}:${categoryCode}:${check}`;
  }

  async parse(value) {
    const text = String(value || '').trim();
    const parts = text.split(':');
    if (parts.length !== 5 || parts[0] !== 'GBS' || parts[1] !== 'v1') {
      throw new Error('지원하지 않는 바코드 형식입니다.');
    }

    const [, , key, categoryCode, check] = parts;
    if (!CATEGORIES[categoryCode]) {
      throw new Error(`알 수 없는 바코드 항목입니다: ${categoryCode}`);
    }

    const expected = await this.createCheck(key, categoryCode);
    if (expected !== check) {
      throw new Error('바코드 검증값이 일치하지 않습니다.');
    }

    return {
      key,
      categoryCode,
      category: CATEGORIES[categoryCode],
      barcode: text
    };
  }

  async lookup(value) {
    const parsed = await this.parse(value);
    const person = await this.peopleService.findByKey(parsed.key);

    if (!person) {
      throw new Error(`사람 데이터에서 키를 찾을 수 없습니다: ${parsed.key}`);
    }

    const categoryInfo = person.categories[parsed.categoryCode];
    if (!categoryInfo || !categoryInfo.enabled) {
      throw new Error(`${person.name}님은 ${parsed.category.label} 항목 대상이 아닙니다.`);
    }

    return {
      key: person.key,
      displayCode: person.displayCode,
      name: person.name,
      spouseName: person.spouseName,
      category: parsed.category.label,
      categoryCode: parsed.categoryCode,
      pledgeAmount: categoryInfo.pledgeAmount || 0,
      barcode: parsed.barcode
    };
  }

  async preview(options = {}) {
    const people = await this.peopleService.list();
    const selectedKeys = parseSelectedKeys(options.codes);
    const targets = people.filter((person) => {
      if (options.mode !== 'selected') {
        return true;
      }
      return selectedKeys.has(person.key);
    });

    const items = [];
    for (const person of targets) {
      for (const categoryCode of CATEGORY_ORDER) {
        const category = person.categories[categoryCode];
        if (!category.enabled) {
          continue;
        }

        items.push({
          key: person.key,
          name: person.name,
          spouseName: person.spouseName,
          category: category.label,
          categoryCode,
          pledgeAmount: category.pledgeAmount || 0,
          barcode: await this.createValue(person.key, categoryCode)
        });
      }
    }

    return {
      count: items.length,
      items,
      missingKeys: options.mode === 'selected'
        ? [...selectedKeys].filter((key) => !people.some((person) => person.key === key))
        : []
    };
  }

  async createCheck(key, categoryCode) {
    const secret = await this.getSecret();
    return crypto
      .createHmac('sha256', secret)
      .update(`${key}:${categoryCode}`)
      .digest('hex')
      .slice(0, 10)
      .toUpperCase();
  }
}

function normalizeKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized) {
    throw new Error('키가 비어 있습니다.');
  }
  if (normalized.includes(':')) {
    throw new Error('키에는 콜론(:)을 사용할 수 없습니다.');
  }
  return normalized;
}

function parseSelectedKeys(codes) {
  if (Array.isArray(codes)) {
    return new Set(codes.map((code) => String(code).trim()).filter(Boolean));
  }

  return new Set(String(codes || '').split(',').map((code) => code.trim()).filter(Boolean));
}

module.exports = {
  BarcodeService
};
