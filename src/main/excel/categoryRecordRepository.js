const path = require('path');
const ExcelJS = require('exceljs');
const { ensureDir } = require('../utils/backup');

const LEGACY_HEADERS = ['코드', '이름', '와이프이름', '낸금액'];
const META_SHEET_NAME = '_records';
const META_HEADERS = ['barcode', 'code', 'name', 'spouseName', 'paidAmount'];
const ROWS_PER_SIDE = 25;
const RECORDS_PER_SECTION = ROWS_PER_SIDE * 2;
const SECTION_HEIGHT = 31;

class CategoryRecordRepository {
  async ensureFile(filePath) {
    await writeFormattedWorkbook(filePath, []);
  }

  async ensureFileIfMissing(filePath) {
    const fs = require('fs');
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return false;
    } catch {
      await this.ensureFile(filePath);
      return true;
    }
  }

  async append(filePath, record) {
    const records = await this.list(filePath);
    const nextRecord = normalizeRecord(record);
    if (nextRecord.barcode && records.some((item) => item.barcode === nextRecord.barcode)) {
      throw new Error('이미 스캔한 기록이 있습니다.');
    }

    records.push(nextRecord);
    await writeFormattedWorkbook(filePath, records);
  }

  async list(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return [];
    }

    const metaWorksheet = workbook.getWorksheet(META_SHEET_NAME);
    if (metaWorksheet) {
      return readMetaRecords(metaWorksheet);
    }

    if (isLegacySheet(worksheet)) {
      return readLegacyRecords(worksheet);
    }

    return readFormattedRecords(worksheet);
  }
}

async function writeFormattedWorkbook(filePath, records) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(inferCategoryLabel(filePath));
  const categoryLabel = inferCategoryLabel(filePath);
  const displayDate = inferDisplayDate(filePath);
  const sectionCount = Math.max(1, Math.ceil(records.length / RECORDS_PER_SECTION));

  configureWorksheet(worksheet);

  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const startRow = sectionIndex * SECTION_HEIGHT + 1;
    const sectionRecords = records.slice(
      sectionIndex * RECORDS_PER_SECTION,
      (sectionIndex + 1) * RECORDS_PER_SECTION
    );
    drawSection(worksheet, startRow, sectionIndex + 1, categoryLabel, displayDate, sectionRecords);
  }

  drawMetaSheet(workbook, records);

  await ensureDir(path.dirname(filePath));
  await workbook.xlsx.writeFile(filePath);
}

function configureWorksheet(worksheet) {
  worksheet.properties.defaultRowHeight = 18;
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2
    }
  };

  const widths = [11, 11, 8, 8, 11, 11, 8, 8];
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
}

function drawSection(worksheet, startRow, sectionNumber, categoryLabel, displayDate, records) {
  const titleRow = startRow;
  const dateRow = startRow + 1;
  const headerRow = startRow + 2;
  const dataStartRow = startRow + 3;
  const dataEndRow = dataStartRow + ROWS_PER_SIDE - 1;
  const subtotalRow = dataEndRow + 1;
  const totalRow = subtotalRow + 1;
  const blankRow = totalRow + 1;

  merge(worksheet, titleRow, 1, titleRow, 8);
  merge(worksheet, dateRow, 1, dateRow, 2);
  merge(worksheet, dateRow, 7, dateRow, 8);
  merge(worksheet, headerRow, 1, headerRow, 2);
  merge(worksheet, headerRow, 3, headerRow, 4);
  merge(worksheet, headerRow, 5, headerRow, 6);
  merge(worksheet, headerRow, 7, headerRow, 8);

  const titleCell = worksheet.getCell(titleRow, 1);
  titleCell.value = `${categoryLabel} 헌금 명단`;
  titleCell.font = { name: '맑은 고딕', size: 20, bold: true };
  titleCell.alignment = center();
  worksheet.getRow(titleRow).height = 30;

  worksheet.getCell(dateRow, 1).value = `No. ${sectionNumber}`;
  worksheet.getCell(dateRow, 1).font = normalFont(9);
  worksheet.getCell(dateRow, 1).alignment = { vertical: 'middle', horizontal: 'left' };

  worksheet.getCell(dateRow, 7).value = displayDate;
  worksheet.getCell(dateRow, 7).font = normalFont(9);
  worksheet.getCell(dateRow, 7).alignment = { vertical: 'middle', horizontal: 'right' };

  setHeaderCell(worksheet.getCell(headerRow, 1), '성    명');
  setHeaderCell(worksheet.getCell(headerRow, 3), '금   액');
  setHeaderCell(worksheet.getCell(headerRow, 5), '성    명');
  setHeaderCell(worksheet.getCell(headerRow, 7), '금   액');

  for (let rowNumber = headerRow; rowNumber <= totalRow; rowNumber += 1) {
    for (let colNumber = 1; colNumber <= 8; colNumber += 1) {
      applyBorder(worksheet.getCell(rowNumber, colNumber));
    }
  }

  for (let rowNumber = dataStartRow; rowNumber <= dataEndRow; rowNumber += 1) {
    worksheet.getRow(rowNumber).height = 18;
    merge(worksheet, rowNumber, 3, rowNumber, 4);
    merge(worksheet, rowNumber, 7, rowNumber, 8);

    for (const colNumber of [1, 3, 5, 7]) {
      worksheet.getCell(rowNumber, colNumber).fill = yellowFill();
    }
    for (const colNumber of [2, 4, 6, 8]) {
      worksheet.getCell(rowNumber, colNumber).fill = whiteFill();
    }
  }

  const leftRecords = records.slice(0, ROWS_PER_SIDE);
  const rightRecords = records.slice(ROWS_PER_SIDE, RECORDS_PER_SECTION);
  fillSideRecords(worksheet, dataStartRow, leftRecords, 1, 2, 3);
  fillSideRecords(worksheet, dataStartRow, rightRecords, 5, 6, 7);

  const leftSubtotal = sumAmounts(leftRecords);
  const rightSubtotal = sumAmounts(rightRecords);

  drawMergedLabel(worksheet, subtotalRow, 1, 2, '소       계');
  drawMergedAmount(worksheet, subtotalRow, 3, 4, `SUM(C${dataStartRow}:C${dataEndRow})`, leftSubtotal);
  drawMergedLabel(worksheet, subtotalRow, 5, 6, '소       계');
  drawMergedAmount(worksheet, subtotalRow, 7, 8, `SUM(G${dataStartRow}:G${dataEndRow})`, rightSubtotal);

  drawMergedLabel(worksheet, totalRow, 1, 2, '계  수  인');
  drawMergedLabel(worksheet, totalRow, 3, 4, '');
  drawMergedLabel(worksheet, totalRow, 5, 6, '합       계');
  drawMergedAmount(worksheet, totalRow, 7, 8, `C${subtotalRow}+G${subtotalRow}`, leftSubtotal + rightSubtotal);

  worksheet.getRow(subtotalRow).height = 18;
  worksheet.getRow(totalRow).height = 18;
  worksheet.getRow(blankRow).height = 18;
}

function fillSideRecords(worksheet, dataStartRow, records, nameCol, spouseCol, amountCol) {
  for (let index = 0; index < ROWS_PER_SIDE; index += 1) {
    const rowNumber = dataStartRow + index;
    const record = records[index];

    const nameCell = worksheet.getCell(rowNumber, nameCol);
    const spouseCell = worksheet.getCell(rowNumber, spouseCol);
    const amountCell = worksheet.getCell(rowNumber, amountCol);

    nameCell.font = normalFont(10);
    spouseCell.font = normalFont(10);
    amountCell.font = normalFont(10);

    nameCell.alignment = center();
    spouseCell.alignment = center();
    amountCell.alignment = { vertical: 'middle', horizontal: 'right' };

    if (record) {
      nameCell.value = record.name;
      spouseCell.value = record.spouseName || '';
      amountCell.value = record.paidAmount;
      amountCell.numFmt = '#,##0';
    }
  }
}

function drawMergedLabel(worksheet, rowNumber, startCol, endCol, label) {
  merge(worksheet, rowNumber, startCol, rowNumber, endCol);
  const cell = worksheet.getCell(rowNumber, startCol);
  cell.value = label;
  cell.font = { name: '맑은 고딕', size: 10, bold: true };
  cell.alignment = center();
}

function drawMergedAmount(worksheet, rowNumber, startCol, endCol, formula, result) {
  merge(worksheet, rowNumber, startCol, rowNumber, endCol);
  const cell = worksheet.getCell(rowNumber, startCol);
  cell.value = { formula, result };
  cell.numFmt = '#,##0';
  cell.font = { name: '맑은 고딕', size: 10, bold: true };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
}

function setHeaderCell(cell, value) {
  cell.value = value;
  cell.font = { name: '맑은 고딕', size: 10, bold: true };
  cell.alignment = center();
  cell.fill = whiteFill();
}

function drawMetaSheet(workbook, records) {
  const worksheet = workbook.addWorksheet(META_SHEET_NAME, { state: 'veryHidden' });
  worksheet.columns = META_HEADERS.map((header) => ({ header, key: header, width: 20 }));

  for (const record of records) {
    worksheet.addRow({
      barcode: record.barcode,
      code: record.code,
      name: record.name,
      spouseName: record.spouseName,
      paidAmount: record.paidAmount
    });
  }
}

function readMetaRecords(worksheet) {
  const records = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const barcode = value(row.getCell(1).value);
    const code = value(row.getCell(2).value);
    const name = value(row.getCell(3).value);
    const spouseName = value(row.getCell(4).value);
    const paidAmount = parseAmountCell(row.getCell(5).value);
    if (!barcode && !code && !name && !spouseName && !paidAmount) {
      return;
    }

    records.push({ barcode, code, name, spouseName, paidAmount });
  });
  return records;
}

function readLegacyRecords(worksheet) {
  const hasSpouseColumn = value(worksheet.getRow(1).getCell(3).value) === '와이프이름';
  const spouseCol = hasSpouseColumn ? 3 : null;
  const paidAmountCol = hasSpouseColumn ? 4 : 3;
  const records = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const code = value(row.getCell(1).value);
    const name = value(row.getCell(2).value);
    const spouseName = spouseCol ? value(row.getCell(spouseCol).value) : '';
    const paidAmount = parseAmountCell(row.getCell(paidAmountCol).value);
    if (!code && !name && !spouseName && !paidAmount) {
      return;
    }

    records.push({ code, name, spouseName, paidAmount });
  });
  return records;
}

function readFormattedRecords(worksheet) {
  const records = [];
  for (let startRow = 1; startRow <= worksheet.rowCount; startRow += SECTION_HEIGHT) {
    const title = value(worksheet.getCell(startRow, 1).value);
    if (!title.includes('헌금')) {
      continue;
    }

    const dataStartRow = startRow + 3;
    for (let index = 0; index < ROWS_PER_SIDE; index += 1) {
      const rowNumber = dataStartRow + index;
      addRecordIfPresent(records, worksheet, rowNumber, 1, 2, 3);
    }
    for (let index = 0; index < ROWS_PER_SIDE; index += 1) {
      const rowNumber = dataStartRow + index;
      addRecordIfPresent(records, worksheet, rowNumber, 5, 6, 7);
    }
  }

  return records;
}

function addRecordIfPresent(records, worksheet, rowNumber, nameCol, spouseCol, amountCol) {
  const name = value(worksheet.getCell(rowNumber, nameCol).value);
  const spouseName = value(worksheet.getCell(rowNumber, spouseCol).value);
  const paidAmount = parseAmountCell(worksheet.getCell(rowNumber, amountCol).value);

  if (!name && !spouseName && !paidAmount) {
    return;
  }

  records.push({
    barcode: '',
    code: '',
    name,
    spouseName,
    paidAmount
  });
}

function isLegacySheet(worksheet) {
  const firstRow = worksheet.getRow(1);
  return (
    value(firstRow.getCell(1).value) === '코드' &&
    value(firstRow.getCell(2).value) === '이름' &&
    ['와이프이름', '낸금액'].includes(value(firstRow.getCell(3).value))
  );
}

function normalizeRecord(record) {
  return {
    barcode: value(record.barcode),
    code: value(record.code),
    name: value(record.name),
    spouseName: value(record.spouseName),
    paidAmount: Number(record.paidAmount || 0)
  };
}

function inferCategoryLabel(filePath) {
  const fileName = path.basename(filePath);
  if (fileName.includes('십일조')) {
    return '십일조';
  }
  if (fileName.includes('해외선교')) {
    return '해외선교';
  }
  if (fileName.includes('기타')) {
    return '기타';
  }
  return '헌금';
}

function inferDisplayDate(filePath) {
  const fileName = path.basename(filePath);
  const match = fileName.match(/(\d{8})/);
  if (!match) {
    return '';
  }

  const raw = match[1];
  const year = raw.slice(0, 4);
  const month = String(Number(raw.slice(4, 6)));
  const day = String(Number(raw.slice(6, 8)));
  return `${year}년 ${month}월 ${day}일`;
}

function sumAmounts(records) {
  return records.reduce((sum, record) => sum + Number(record.paidAmount || 0), 0);
}

function parseAmountCell(input) {
  if (input === null || input === undefined || input === '') {
    return 0;
  }

  if (typeof input === 'object') {
    if (input.result !== undefined) {
      return parseAmountCell(input.result);
    }
    if (input.formula) {
      return 0;
    }
  }

  const amount = Number(String(input).replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount : 0;
}

function value(input) {
  if (input === null || input === undefined) {
    return '';
  }

  if (typeof input === 'object') {
    if (input.text) {
      return String(input.text).trim();
    }
    if (input.result !== undefined) {
      return value(input.result);
    }
    if (Array.isArray(input.richText)) {
      return input.richText.map((item) => item.text || '').join('').trim();
    }
  }

  return String(input).trim();
}

function merge(worksheet, startRow, startCol, endRow, endCol) {
  try {
    worksheet.mergeCells(startRow, startCol, endRow, endCol);
  } catch {
    // The workbook is rebuilt from scratch, so duplicate merges should not happen.
  }
}

function applyBorder(cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  };
}

function center() {
  return { vertical: 'middle', horizontal: 'center' };
}

function normalFont(size) {
  return { name: '맑은 고딕', size };
}

function yellowFill() {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' }
  };
}

function whiteFill() {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' }
  };
}

module.exports = {
  CategoryRecordRepository,
  LEGACY_HEADERS
};
