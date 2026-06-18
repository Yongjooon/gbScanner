const ExcelJS = require('exceljs');
const { CATEGORIES, CATEGORY_ORDER } = require('../constants');
const { parseAmount } = require('../utils/money');

const HEADER_ALIASES = {
  key: ['키', '코드'],
  name: ['사람이름', '사람 이름', '이름'],
  spouseName: ['배우자이름', '배우자 이름', '와이프이름', '와이프 이름']
};

class PeopleRepository {
  async list(peoplePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(peoplePath);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error('사람 데이터.xlsx에 시트가 없습니다.');
    }

    const headerMap = getHeaderMap(worksheet);
    const requiredHeaders = [
      ['키 또는 코드', HEADER_ALIASES.key],
      ['사람이름 또는 이름', HEADER_ALIASES.name]
    ];

    for (const [label, aliases] of requiredHeaders) {
      if (!findHeader(headerMap, aliases)) {
        throw new Error(`사람 데이터.xlsx에 필수 컬럼이 없습니다: ${label}`);
      }
    }

    const categoryHeaderInfo = {};
    for (const categoryCode of CATEGORY_ORDER) {
      const category = CATEGORIES[categoryCode];
      categoryHeaderInfo[categoryCode] = {
        enabledCol: findHeader(headerMap, [category.enabledHeader]),
        amountCol: findHeader(headerMap, category.amountAliases)
      };
    }

    const keyCol = findHeader(headerMap, HEADER_ALIASES.key);
    const nameCol = findHeader(headerMap, HEADER_ALIASES.name);
    const spouseCol = findHeader(headerMap, HEADER_ALIASES.spouseName);
    const people = [];
    const seenKeys = new Set();

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }

      const key = stringCell(row, keyCol);
      const name = stringCell(row, nameCol);

      if (!key && !name) {
        return;
      }

      if (!key) {
        throw new Error(`${rowNumber}행에 키가 없습니다.`);
      }

      if (seenKeys.has(key)) {
        throw new Error(`사람 데이터.xlsx에 중복 키가 있습니다: ${key}`);
      }
      seenKeys.add(key);

      const categories = {};
      for (const categoryCode of CATEGORY_ORDER) {
        const headerInfo = categoryHeaderInfo[categoryCode];
        const enabled = isEnabled(valueCell(row, headerInfo.enabledCol));
        const pledgeAmount = headerInfo.amountCol ? parseOptionalAmount(valueCell(row, headerInfo.amountCol)) : null;
        categories[categoryCode] = {
          ...CATEGORIES[categoryCode],
          enabled,
          pledgeAmount
        };
      }

      people.push({
        key,
        displayCode: key,
        name,
        spouseName: spouseCol ? stringCell(row, spouseCol) : '',
        categories
      });
    });

    return people;
  }
}

function getHeaderMap(worksheet) {
  const map = new Map();
  const row = worksheet.getRow(1);

  row.eachCell((cell, colNumber) => {
    const header = normalizeHeader(cell.value);
    if (header) {
      map.set(header, colNumber);
    }
  });

  return map;
}

function findHeader(headerMap, aliases) {
  for (const alias of aliases) {
    const col = headerMap.get(normalizeHeader(alias));
    if (col) {
      return col;
    }
  }
  return null;
}

function normalizeHeader(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function stringCell(row, colNumber) {
  return stringifyCell(valueCell(row, colNumber));
}

function valueCell(row, colNumber) {
  if (!colNumber) {
    return null;
  }

  return row.getCell(colNumber).value;
}

function stringifyCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    if (value.text) {
      return String(value.text).trim();
    }
    if (value.result !== undefined) {
      return String(value.result).trim();
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text || '').join('').trim();
    }
  }

  return String(value).trim();
}

function isEnabled(value) {
  const normalized = stringifyCell(value).toLowerCase();
  return ['1', 'y', 'yes', 'true', 'o', 'on'].includes(normalized);
}

function parseOptionalAmount(value) {
  const text = stringifyCell(value);
  if (!text) {
    return null;
  }

  return parseAmount(text);
}

module.exports = {
  PeopleRepository
};
