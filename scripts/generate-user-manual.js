const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');
const { registerIpcHandlers } = require('../src/main/ipc');
const { PeopleRepository } = require('../src/main/excel/peopleRepository');
const { CategoryRecordRepository } = require('../src/main/excel/categoryRecordRepository');
const { PeopleService } = require('../src/main/services/peopleService');
const { BarcodeService } = require('../src/main/services/barcodeService');
const { PdfService } = require('../src/main/services/pdfService');
const { WorkSessionService } = require('../src/main/services/workSessionService');
const { RecordService } = require('../src/main/services/recordService');
const { ensureDir } = require('../src/main/utils/backup');

const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const IMAGES_DIR = path.join(DOCS_DIR, 'manual-images');
const DATA_DIR = path.join(DOCS_DIR, 'manual-data');
const PEOPLE_PATH = path.join(DATA_DIR, '사람 데이터.xlsx');
const MANUAL_MD_PATH = path.join(DOCS_DIR, 'USER_MANUAL.md');
const MANUAL_HTML_PATH = path.join(DOCS_DIR, 'USER_MANUAL.html');
const MANUAL_IMAGE_PATH = path.join(DOCS_DIR, 'USER_MANUAL.png');
const CAPTURE_DATE = '2026-06-19';

class ManualSettingsService {
  constructor() {
    this.settings = {
      workspaceDir: ROOT_DIR,
      peoplePath: PEOPLE_PATH,
      recordsDir: path.join(DATA_DIR, 'records'),
      outputDir: path.join(DATA_DIR, 'output'),
      backupsDir: path.join(DATA_DIR, 'backups'),
      configDir: path.join(DATA_DIR, 'config')
    };
  }

  async get() {
    await Promise.all([
      ensureDir(this.settings.recordsDir),
      ensureDir(this.settings.outputDir),
      ensureDir(this.settings.backupsDir),
      ensureDir(this.settings.configDir)
    ]);

    return {
      ...this.settings,
      peopleExists: await exists(this.settings.peoplePath),
      recordsExists: await exists(this.settings.recordsDir)
    };
  }

  async choosePeopleFile() {
    return this.get();
  }
}

async function main() {
  await ensureDir(DOCS_DIR);
  await ensureDir(IMAGES_DIR);
  await fs.promises.rm(DATA_DIR, { recursive: true, force: true });
  await ensureDir(DATA_DIR);
  await createPeopleWorkbook(PEOPLE_PATH);

  const services = await createServices();
  const window = await createAppWindow(services);

  const preview = await services.barcodeService.preview({ mode: 'all' });
  const titheItems = preview.items.filter((item) => item.categoryCode === 'TITHE');
  const firstTitheBarcode = titheItems[0].barcode;

  await captureAppScreens(window, firstTitheBarcode, services, titheItems);
  const recordsPath = services.workSessionService.getFileForCategory('TITHE');
  await captureWorkbookScreen({
    workbookPath: PEOPLE_PATH,
    outputName: '08-people-data.png',
    title: '사람 데이터.xlsx'
  });
  await captureRecordWorkbookScreen(recordsPath, '09-records-excel.png');
  await writeManualFiles();
  await captureManualImage();

  window.close();
}

async function createServices() {
  const settingsService = new ManualSettingsService();
  const peopleRepository = new PeopleRepository();
  const categoryRecordRepository = new CategoryRecordRepository();
  const peopleService = new PeopleService(settingsService, peopleRepository);
  const barcodeService = new BarcodeService(settingsService, peopleService);
  const pdfService = new PdfService(settingsService, barcodeService);
  const workSessionService = new WorkSessionService(settingsService, categoryRecordRepository);
  const recordService = new RecordService(settingsService, workSessionService, barcodeService, categoryRecordRepository);

  return {
    settingsService,
    peopleService,
    barcodeService,
    pdfService,
    workSessionService,
    recordService,
    categoryRecordRepository
  };
}

async function createAppWindow(services) {
  let captureWindow;
  registerIpcHandlers(services, () => captureWindow);

  captureWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    backgroundColor: '#f6f7fb',
    webPreferences: {
      preload: path.join(ROOT_DIR, 'src/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await captureWindow.loadFile(path.join(ROOT_DIR, 'src/renderer/index.html'));
  await waitForSelector(captureWindow, '.app-shell');
  await sleep(350);
  return captureWindow;
}

async function captureAppScreens(window, barcode, services, titheItems) {
  await captureWindow(window, '01-start-home.png');

  await click(window, '#start-session');
  await waitForSelector(window, '#scanner-input');
  await sleep(300);
  await captureWindow(window, '02-progress-ready.png');

  await clickPage(window, 'barcodes');
  await click(window, '#preview-barcodes');
  await waitForSelector(window, '.preview-list .table tbody tr');
  await sleep(300);
  await captureWindow(window, '03-barcode-preview.png');

  await click(window, '#create-pdf');
  await waitForSelector(window, '#open-last-pdf');
  await sleep(300);
  await captureWindow(window, '04-barcode-pdf-created.png');

  await clickPage(window, 'progress');
  await scanBarcode(window, barcode);
  await waitForSelector(window, '#save-record');
  await sleep(300);
  await captureWindow(window, '05-scan-confirm.png');

  await setInputValue(window, '#paid-amount', '120000');
  await click(window, '#save-record');
  await waitForSelector(window, '.status.success');
  await sleep(300);

  await appendExtraTitheRecords(services, titheItems.slice(1, 38));

  await scanBarcode(window, barcode);
  await waitForSelector(window, '.modal-panel');
  await sleep(300);
  await captureWindow(window, '06-duplicate-warning.png');
  await click(window, '#modal-close');

  await clickPage(window, 'records');
  await click(window, '#load-records');
  await waitForSelector(window, '.summary-row .metric');
  await sleep(300);
  await captureWindow(window, '07-records-summary.png');

  await clickPage(window, 'settings');
  await waitForSelector(window, '.panel .file-path');
  await sleep(300);
  await captureWindow(window, '10-settings.png');
}

async function appendExtraTitheRecords(services, items) {
  const filePath = services.workSessionService.getFileForCategory('TITHE');
  for (const item of items) {
    await services.categoryRecordRepository.append(filePath, {
      barcode: item.barcode,
      code: item.key,
      name: item.name,
      spouseName: item.spouseName,
      paidAmount: item.pledgeAmount || 0
    });
  }
}

async function clickPage(window, page) {
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-page="${page}"]').click();
  `);
  await sleep(250);
}

async function click(window, selector) {
  await window.webContents.executeJavaScript(`
    document.querySelector(${JSON.stringify(selector)}).click();
  `);
  await sleep(250);
}

async function setInputValue(window, selector, value) {
  await window.webContents.executeJavaScript(`
    {
      const input = document.querySelector(${JSON.stringify(selector)});
      input.value = ${JSON.stringify(value)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  `);
  await sleep(100);
}

async function scanBarcode(window, barcode) {
  await window.webContents.executeJavaScript(`
    {
      const input = document.querySelector('#scanner-input');
      input.focus();
      input.value = ${JSON.stringify(barcode)};
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  `);
  await sleep(350);
}

async function waitForSelector(window, selector, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const existsSelector = await window.webContents.executeJavaScript(`
      Boolean(document.querySelector(${JSON.stringify(selector)}))
    `);
    if (existsSelector) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`캡처 대상을 찾지 못했습니다: ${selector}`);
}

async function captureWindow(window, fileName) {
  await sleep(200);
  const image = await window.webContents.capturePage();
  await fs.promises.writeFile(path.join(IMAGES_DIR, fileName), image.toPNG());
}

async function captureHtml(html, outputPath, options = {}) {
  const window = new BrowserWindow({
    width: options.width || 1120,
    height: options.height || 820,
    show: false,
    backgroundColor: options.backgroundColor || '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await sleep(400);

  if (options.fullPage) {
    const size = await window.webContents.executeJavaScript(`({
      width: Math.ceil(document.documentElement.scrollWidth),
      height: Math.ceil(document.documentElement.scrollHeight)
    })`);
    window.setSize(Math.min(size.width, 1600), Math.min(size.height, 14000));
    await sleep(500);
  }

  const image = await window.webContents.capturePage();
  await fs.promises.writeFile(outputPath, image.toPNG());
  window.close();
}

async function captureWorkbookScreen({ workbookPath, outputName, title }) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const worksheet = workbook.worksheets[0];
  const rows = [];
  const maxRow = Math.min(worksheet.rowCount, 18);
  const maxCol = Math.min(worksheet.columnCount, 9);

  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = [];
    for (let colNumber = 1; colNumber <= maxCol; colNumber += 1) {
      row.push(cellText(worksheet.getCell(rowNumber, colNumber)));
    }
    rows.push(row);
  }

  const html = buildWorkbookHtml(title, rows, { type: 'people' });
  await captureHtml(html, path.join(IMAGES_DIR, outputName), { width: 1180, height: 680 });
}

async function captureRecordWorkbookScreen(workbookPath, outputName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const worksheet = workbook.worksheets[0];
  const rows = [];

  for (let rowNumber = 1; rowNumber <= 31; rowNumber += 1) {
    rows.push({
      rowNumber,
      values: Array.from({ length: 8 }, (_, index) => cellText(worksheet.getCell(rowNumber, index + 1)))
    });
  }

  const html = buildRecordWorkbookHtml('20260619_십일조.xlsx', rows);
  await captureHtml(html, path.join(IMAGES_DIR, outputName), { width: 980, height: 820 });
}

function buildWorkbookHtml(title, rows, options = {}) {
  const letters = rows[0].map((_, index) => columnLetter(index + 1));
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <style>${excelCss()}</style>
</head>
<body>
  <div class="sheet-frame">
    <div class="sheet-title">${escapeHtml(title)}</div>
    <table class="excel-grid ${options.type === 'people' ? 'people-grid' : ''}">
      <thead>
        <tr><th class="corner"></th>${letters.map((letter) => `<th>${letter}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <th class="row-head">${index + 1}</th>
            ${row.map((cell, cellIndex) => `<td class="${index === 0 ? 'header-cell' : ''} ${cellIndex >= 3 ? 'numberish' : ''}">${escapeHtml(cell)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function buildRecordWorkbookHtml(title, rows) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <style>${excelCss()}</style>
</head>
<body>
  <div class="sheet-frame record-capture">
    <div class="sheet-title">${escapeHtml(title)}</div>
    <table class="excel-grid record-grid">
      <thead>
        <tr>
          <th class="corner"></th>
          ${Array.from({ length: 8 }, (_, index) => `<th>${columnLetter(index + 1)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => recordRowHtml(row)).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

function recordRowHtml(row) {
  const values = row.values;
  if (row.rowNumber === 1) {
    return `<tr><th class="row-head">1</th><td class="record-title" colspan="8">${escapeHtml(values[0])}</td></tr>`;
  }
  if (row.rowNumber === 2) {
    return `<tr><th class="row-head">2</th><td colspan="2">${escapeHtml(values[0])}</td><td colspan="4"></td><td colspan="2" class="date-cell">${escapeHtml(values[6])}</td></tr>`;
  }
  if (row.rowNumber === 3) {
    return `<tr><th class="row-head">3</th><td colspan="2" class="header-cell">${escapeHtml(values[0])}</td><td colspan="2" class="header-cell">${escapeHtml(values[2])}</td><td colspan="2" class="header-cell">${escapeHtml(values[4])}</td><td colspan="2" class="header-cell">${escapeHtml(values[6])}</td></tr>`;
  }
  if (row.rowNumber >= 4 && row.rowNumber <= 28) {
    return `<tr>
      <th class="row-head">${row.rowNumber}</th>
      <td class="yellow">${escapeHtml(values[0])}</td>
      <td>${escapeHtml(values[1])}</td>
      <td colspan="2" class="yellow amount">${escapeHtml(values[2])}</td>
      <td class="yellow">${escapeHtml(values[4])}</td>
      <td>${escapeHtml(values[5])}</td>
      <td colspan="2" class="yellow amount">${escapeHtml(values[6])}</td>
    </tr>`;
  }
  if (row.rowNumber === 29 || row.rowNumber === 30) {
    return `<tr>
      <th class="row-head">${row.rowNumber}</th>
      <td colspan="2" class="summary-cell">${escapeHtml(values[0])}</td>
      <td colspan="2" class="summary-cell amount">${escapeHtml(values[2])}</td>
      <td colspan="2" class="summary-cell">${escapeHtml(values[4])}</td>
      <td colspan="2" class="summary-cell amount">${escapeHtml(values[6])}</td>
    </tr>`;
  }
  return `<tr><th class="row-head">${row.rowNumber}</th><td colspan="8"></td></tr>`;
}

function excelCss() {
  return `
    :root {
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      color: #111827;
      background: #eef2f7;
    }
    body {
      margin: 0;
      padding: 24px;
      background: #eef2f7;
    }
    .sheet-frame {
      display: inline-block;
      border-radius: 10px;
      background: #fff;
      padding: 14px;
      box-shadow: 0 18px 55px rgba(17, 24, 39, 0.18);
    }
    .sheet-title {
      margin-bottom: 10px;
      font-size: 18px;
      font-weight: 800;
    }
    .excel-grid {
      border-collapse: collapse;
      table-layout: fixed;
      background: #fff;
      font-size: 13px;
    }
    .excel-grid th,
    .excel-grid td {
      min-width: 86px;
      height: 26px;
      border: 1px solid #c9ced6;
      padding: 3px 7px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: middle;
    }
    .excel-grid thead th,
    .row-head,
    .corner {
      min-width: 38px;
      width: 38px;
      background: #1f2937;
      color: #fff;
      text-align: center;
      font-weight: 700;
    }
    .people-grid .header-cell,
    .header-cell {
      background: #f3f6fb;
      font-weight: 800;
      text-align: center;
    }
    .numberish {
      text-align: right;
    }
    .record-grid th,
    .record-grid td {
      min-width: 74px;
      width: 74px;
      height: 21px;
      border-color: #000;
      padding: 1px 5px;
      font-size: 12px;
    }
    .record-grid .record-title {
      height: 36px;
      font-size: 23px;
      font-weight: 800;
      text-align: center;
      border-left-color: #fff;
      border-right-color: #fff;
      border-top-color: #fff;
    }
    .record-grid .date-cell {
      text-align: right;
      font-size: 11px;
    }
    .record-grid .yellow {
      background: #ffff00;
    }
    .record-grid .amount {
      text-align: right;
    }
    .record-grid .summary-cell {
      font-weight: 800;
      text-align: center;
      background: #fff;
    }
  `;
}

async function writeManualFiles() {
  const markdown = `# gbScanner 사용자 매뉴얼

이 문서는 로컬 xlsx 파일을 기준으로 바코드를 만들고, 실제 스캔 결과를 날짜별 기록 파일에 저장하는 전체 흐름을 설명합니다.

## 1. 시작하기

![시작하기](manual-images/01-start-home.png)

- 작업 날짜를 확인한 뒤 **시작**을 누르면 해당 날짜 폴더가 만들어집니다.
- 예: 2026년 6월 19일 작업은 \`260619\` 폴더와 \`20260619_십일조.xlsx\`, \`20260619_해외선교.xlsx\`, \`20260619_기타.xlsx\` 파일을 준비합니다.

## 2. 진행 창

![진행 창](manual-images/02-progress-ready.png)

- 스캐너가 없을 때는 바코드 값을 직접 입력한 뒤 Enter를 눌러도 동일하게 조회됩니다.
- 스캔 대기 상태에서는 입력 칸에 커서가 자동으로 들어갑니다.

## 3. 바코드 생성

![바코드 미리보기](manual-images/03-barcode-preview.png)

- **전체 생성**은 사람 데이터에서 십일조, 해외선교, 기타 값이 1인 항목을 모두 찾습니다.
- **일부 생성**은 사람 코드를 쉼표로 입력해 필요한 사람만 출력합니다.
- 바코드는 Code128 형식이며, 내부 값은 \`GBS:v1:코드:항목:검증값\` 형태입니다.

![바코드 PDF 생성](manual-images/04-barcode-pdf-created.png)

- PDF에는 이름, 배우자 이름, 항목, 바코드 이미지만 들어갑니다.
- 코드와 약정 금액은 출력물에 표시하지 않습니다.

## 4. 스캔 후 금액 확인

![금액 확인](manual-images/05-scan-confirm.png)

- 바코드를 스캔하면 사람 데이터에서 이름, 배우자 이름, 코드, 항목, 약정 금액을 보여줍니다.
- 약정 금액은 참고값입니다. 여기서 바꾸는 값은 사람 데이터가 아니라 해당일 납부 금액입니다.
- **확인**을 누르면 항목에 맞는 날짜별 xlsx 파일에 새 행으로 기록됩니다.

## 5. 중복 스캔

![중복 경고](manual-images/06-duplicate-warning.png)

- 같은 날짜와 같은 항목 파일에 이미 저장된 바코드를 다시 스캔하면 저장 전에 경고창이 뜹니다.
- 경고창에는 에러 코드 대신 스캔한 사람 정보와 이미 기록된 금액이 표시됩니다.

## 6. 기록 조회

![기록 조회](manual-images/07-records-summary.png)

- 현재 작업의 항목별 건수와 합계를 확인합니다.
- **작업 폴더 열기**로 날짜별 엑셀 파일 위치를 바로 열 수 있습니다.

## 7. 사람 데이터.xlsx 구조

![사람 데이터](manual-images/08-people-data.png)

- 필수 컬럼: 키, 사람이름
- 선택 컬럼: 배우자 이름
- 항목 컬럼: 십일조, 해외선교, 기타
- 금액 컬럼: 십일조_금액, 해외선교_금액, 기타_금액
- 항목 값이 1이면 해당 항목의 바코드가 생성됩니다.

## 8. 기록 xlsx 화면

![기록 엑셀](manual-images/09-records-excel.png)

- 1행에는 항목별 헌금 명단 제목이 들어갑니다.
- 2행 오른쪽에는 작업 날짜가 들어갑니다.
- 3행은 성명/금액 헤더입니다.
- 4행부터 왼쪽 영역을 위에서 아래로 채우고, 25명이 차면 오른쪽 영역으로 이어집니다.
- 오른쪽까지 차면 아래에 새 명단 영역이 이어집니다.
- 소계와 합계는 자동으로 계산됩니다.

## 9. 설정

![설정](manual-images/10-settings.png)

- 사람 데이터 파일 위치, 기록 저장 폴더, 백업 폴더를 확인합니다.
- 바코드 스캐너는 스캔 후 Enter가 입력되도록 설정하면 됩니다.
`;

  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>gbScanner 사용자 매뉴얼</title>
  <style>
    :root {
      color: #111827;
      background: #eef2f7;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f7;
    }
    .manual {
      width: 1180px;
      margin: 0 auto;
      padding: 34px 34px 46px;
    }
    .cover {
      display: grid;
      grid-template-columns: 1fr 360px;
      gap: 28px;
      align-items: stretch;
      margin-bottom: 24px;
      border-radius: 18px;
      background: #101828;
      color: #fff;
      padding: 34px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 40px;
      letter-spacing: 0;
    }
    .cover p {
      margin: 0;
      color: #d6dee9;
      font-size: 18px;
      line-height: 1.65;
    }
    .flow-card {
      display: grid;
      gap: 10px;
      align-content: center;
      border-radius: 12px;
      background: rgba(255,255,255,0.1);
      padding: 20px;
    }
    .flow-card div {
      border-radius: 8px;
      background: rgba(255,255,255,0.12);
      padding: 10px 12px;
      font-weight: 800;
    }
    .section {
      display: grid;
      grid-template-columns: 1fr 330px;
      gap: 22px;
      align-items: start;
      margin-bottom: 24px;
      border-radius: 16px;
      background: #fff;
      padding: 22px;
      box-shadow: 0 14px 42px rgba(17, 24, 39, 0.08);
    }
    .section.wide {
      grid-template-columns: 1fr;
    }
    .section h2 {
      margin: 0 0 10px;
      font-size: 24px;
      letter-spacing: 0;
    }
    .section ul {
      margin: 0;
      padding-left: 20px;
      color: #344054;
      line-height: 1.7;
      font-size: 15px;
    }
    .shot {
      width: 100%;
      border: 1px solid #d0d7e2;
      border-radius: 10px;
      display: block;
    }
    .shot-wrap {
      min-width: 0;
    }
    .tag {
      display: inline-flex;
      margin-bottom: 8px;
      border-radius: 999px;
      background: #eef4ff;
      color: #1849a9;
      padding: 5px 10px;
      font-size: 13px;
      font-weight: 800;
    }
    .note {
      margin-top: 12px;
      border-left: 4px solid #1f6feb;
      background: #f5f8ff;
      padding: 10px 12px;
      color: #344054;
      line-height: 1.55;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <main class="manual">
    <section class="cover">
      <div>
        <h1>gbScanner 사용자 매뉴얼</h1>
        <p>사람 데이터.xlsx로 Code128 바코드를 만들고, 매주 스캔한 봉투 정보를 날짜별 xlsx 기록 파일에 저장하는 로컬 데스크톱 앱 사용 안내입니다.</p>
      </div>
      <div class="flow-card">
        <div>1. 사람 데이터 준비</div>
        <div>2. 바코드 PDF 출력</div>
        <div>3. 날짜별 작업 시작</div>
        <div>4. 스캔 후 금액 저장</div>
        <div>5. 기록 엑셀 확인</div>
      </div>
    </section>
    ${manualSection('시작하기', 'manual-images/01-start-home.png', [
      '작업 날짜를 확인하고 시작 버튼을 누릅니다.',
      '날짜별 폴더와 십일조, 해외선교, 기타 xlsx 파일이 자동으로 준비됩니다.'
    ], '예: 2026년 6월 19일은 260619 폴더와 20260619_십일조.xlsx 파일들을 만듭니다.')}
    ${manualSection('진행 창', 'manual-images/02-progress-ready.png', [
      '스캐너 입력을 기다리는 화면입니다.',
      '테스트 중에는 바코드 값을 직접 입력하고 Enter를 눌러도 됩니다.'
    ])}
    ${manualSection('바코드 생성', 'manual-images/03-barcode-preview.png', [
      '전체 생성 또는 사람 코드 일부 생성을 선택합니다.',
      '사람 데이터에서 값이 1인 항목만 Code128 바코드로 생성합니다.',
      'PDF 생성 후 출력물을 사용할 수 있습니다.'
    ])}
    ${manualSection('바코드 PDF 생성 완료', 'manual-images/04-barcode-pdf-created.png', [
      'PDF에는 이름, 배우자 이름, 항목, 바코드 이미지가 들어갑니다.',
      '코드와 약정 금액은 출력물에서 제외됩니다.'
    ])}
    ${manualSection('스캔 후 금액 확인', 'manual-images/05-scan-confirm.png', [
      '스캔하면 이름, 배우자 이름, 코드, 항목, 약정 금액이 표시됩니다.',
      '낸 금액만 수정해서 해당일 기록에 저장합니다.',
      '사람 데이터.xlsx의 약정 금액은 바뀌지 않습니다.'
    ])}
    ${manualSection('중복 스캔 경고', 'manual-images/06-duplicate-warning.png', [
      '이미 저장된 바코드를 다시 스캔하면 저장 전에 경고창이 뜹니다.',
      '경고창에는 스캔한 사람 정보와 금액이 함께 표시됩니다.'
    ])}
    ${manualSection('기록 조회', 'manual-images/07-records-summary.png', [
      '현재 작업의 항목별 기록 건수와 합계를 봅니다.',
      '작업 폴더 열기로 생성된 xlsx 파일을 확인할 수 있습니다.'
    ])}
    ${manualWideSection('사람 데이터.xlsx 구조', 'manual-images/08-people-data.png', [
      '키와 사람이름은 필수입니다.',
      '배우자 이름, 항목 여부, 항목별 약정 금액을 함께 관리합니다.',
      '십일조, 해외선교, 기타 값이 1이면 해당 항목 바코드가 만들어집니다.'
    ])}
    ${manualWideSection('기록 xlsx 화면', 'manual-images/09-records-excel.png', [
      '4행부터 왼쪽 영역을 위에서 아래로 채우고, 25명이 차면 오른쪽 영역으로 이어집니다.',
      '오른쪽까지 차면 아래쪽에 다음 명단 영역이 자동으로 만들어집니다.',
      '소계와 합계가 자동으로 계산됩니다.'
    ])}
    ${manualSection('설정', 'manual-images/10-settings.png', [
      '사람 데이터 파일, 기록 저장 폴더, 백업 폴더 위치를 확인합니다.',
      '스캐너는 스캔 후 Enter가 입력되도록 설정하면 됩니다.'
    ])}
  </main>
</body>
</html>`;

  await fs.promises.writeFile(MANUAL_MD_PATH, markdown, 'utf8');
  await fs.promises.writeFile(MANUAL_HTML_PATH, html, 'utf8');
}

function manualSection(title, imagePath, bullets, note) {
  return `<section class="section">
    <div class="shot-wrap"><img class="shot" src="${imagePath}" alt="${escapeHtml(title)}"></div>
    <div>
      <span class="tag">화면</span>
      <h2>${escapeHtml(title)}</h2>
      <ul>${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      ${note ? `<div class="note">${escapeHtml(note)}</div>` : ''}
    </div>
  </section>`;
}

function manualWideSection(title, imagePath, bullets) {
  return `<section class="section wide">
    <div>
      <span class="tag">엑셀</span>
      <h2>${escapeHtml(title)}</h2>
      <ul>${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
    <div class="shot-wrap"><img class="shot" src="${imagePath}" alt="${escapeHtml(title)}"></div>
  </section>`;
}

async function captureManualImage() {
  await captureFileFullPage(MANUAL_HTML_PATH, MANUAL_IMAGE_PATH, {
    width: 1248,
    height: 900,
    backgroundColor: '#eef2f7'
  });
}

async function captureFileFullPage(filePath, outputPath, options = {}) {
  const window = new BrowserWindow({
    width: options.width || 1248,
    height: options.height || 900,
    show: false,
    backgroundColor: options.backgroundColor || '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await window.loadFile(filePath);
  await window.webContents.executeJavaScript(`
    Promise.all(Array.from(document.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }))
  `);
  await sleep(500);

  const size = await window.webContents.executeJavaScript(`({
    width: Math.ceil(document.documentElement.scrollWidth),
    height: Math.ceil(document.documentElement.scrollHeight)
  })`);
  window.setSize(Math.min(size.width, 1600), Math.min(size.height, 14000));
  await sleep(700);

  const image = await window.webContents.capturePage();
  await fs.promises.writeFile(outputPath, image.toPNG());
  window.close();
}

async function createPeopleWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('사람 데이터');
  worksheet.columns = [
    { header: '키', key: 'key', width: 10 },
    { header: '사람이름', key: 'name', width: 16 },
    { header: '배우자 이름', key: 'spouseName', width: 16 },
    { header: '십일조', key: 'tithe', width: 10 },
    { header: '십일조_금액', key: 'titheAmount', width: 14 },
    { header: '해외선교', key: 'mission', width: 10 },
    { header: '해외선교_금액', key: 'missionAmount', width: 14 },
    { header: '기타', key: 'etc', width: 10 },
    { header: '기타_금액', key: 'etcAmount', width: 14 }
  ];

  const people = createPeopleRows();
  for (const person of people) {
    worksheet.addRow(person);
  }

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF4FF' }
  };

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D5DD' } },
        left: { style: 'thin', color: { argb: 'FFD0D5DD' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } },
        right: { style: 'thin', color: { argb: 'FFD0D5DD' } }
      };
    });
  });

  await ensureDir(path.dirname(filePath));
  await workbook.xlsx.writeFile(filePath);
}

function createPeopleRows() {
  const names = [
    ['홍길동', '김영희'], ['김민준', '박서연'], ['이도윤', '최지우'], ['박서준', '정하윤'],
    ['최민재', '한지민'], ['정우진', '오서아'], ['강현우', '신예린'], ['조지훈', '유가은'],
    ['윤태민', '장다은'], ['장준호', '임수아'], ['임재현', '문채원'], ['한도현', '양서현'],
    ['오시우', '손유진'], ['서지호', '배나은'], ['신건우', '백하린'], ['권민성', '고예은'],
    ['황준서', '류지아'], ['안태준', '노수빈'], ['송유찬', '하은서'], ['전하준', '남소율'],
    ['배시윤', '심아린'], ['백도겸', '구다현'], ['문주원', '곽예진'], ['손현준', '성지안'],
    ['양서우', '차서윤'], ['유은호', '주하랑'], ['노민호', '마유나'], ['하진우', '진서우'],
    ['고윤재', '표아윤'], ['류시온', '명지유'], ['남태오', '반서희'], ['심재윤', '민나래'],
    ['구연우', '라예림'], ['곽지후', '변수아'], ['성민규', '도하늘'], ['차현서', '채유리'],
    ['주이안', '석다희'], ['마준영', '기서아'], ['진도하', '길보라'], ['표지환', '나유미'],
    ['명현우', '여하린'], ['반시후', '봉채린'], ['민규하', '소예나'], ['라준', '제아인'],
    ['변하람', '추지윤'], ['도윤호', '피소민'], ['채이준', '탁서진'], ['석건우', '은하율'],
    ['기로운', '왕유라'], ['길준혁', '모서희'], ['나지완', '단아영'], ['여승민', '설예림'],
    ['봉재민', '우하영'], ['소은찬', '감지민'], ['제민재', '동유빈'], ['추도영', '구하나'],
    ['피정우', '선서아'], ['탁하민', '편나윤'], ['은주호', '범예지'], ['왕서준', '하서진']
  ];

  return names.map(([name, spouseName], index) => {
    const number = index + 1;
    return {
      key: String(number),
      name,
      spouseName,
      tithe: 1,
      titheAmount: 80000 + (number * 5000),
      mission: number % 2 === 0 ? 1 : 0,
      missionAmount: number % 2 === 0 ? 30000 + (number * 1000) : 0,
      etc: number % 3 === 0 ? 1 : 0,
      etcAmount: number % 3 === 0 ? 20000 + (number * 1000) : 0
    };
  });
}

function cellText(cell) {
  const value = cell.value;
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return value.toLocaleString('ko-KR');
  }
  if (typeof value === 'object') {
    if (value.result !== undefined) {
      return cellText({ value: value.result });
    }
    if (value.text) {
      return String(value.text);
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text || '').join('');
    }
    if (value.formula) {
      return '';
    }
  }
  return String(value);
}

function columnLetter(number) {
  let value = number;
  let output = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function exists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.whenReady()
  .then(main)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error);
    app.quit();
    process.exitCode = 1;
  });
