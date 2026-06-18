const api = window.gbScanner;

const state = {
  page: 'home',
  settings: null,
  session: null,
  scanResult: null,
  recentRecords: [],
  recordSummary: null,
  preview: null,
  lastPdf: null,
  barcodeMode: 'all',
  barcodeCodes: '',
  busy: false,
  status: null,
  modal: null
};

const pages = [
  ['home', '시작하기'],
  ['barcodes', '바코드 생성'],
  ['progress', '진행 창'],
  ['records', '기록 조회'],
  ['settings', '설정']
];

function money(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('ko-KR');
}

function attr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function text(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function todayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setStatus(message, type = 'info') {
  state.status = { message, type };
  render();
}

async function run(action, successMessage, options = {}) {
  state.busy = true;
  state.status = null;
  render();

  try {
    const result = await action();
    if (successMessage) {
      state.status = { message: successMessage, type: 'success' };
    }
    return result;
  } catch (error) {
    const message = error.message || String(error);
    state.status = { message, type: 'error' };
    if (options.alertOnError) {
      window.alert(message);
    }
    return null;
  } finally {
    state.busy = false;
    render();
  }
}

async function bootstrap() {
  state.settings = await api.settings.get();
  state.session = await api.workSession.getCurrent();
  render();
}

function render() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">gbScanner</div>
        <nav class="nav">
          ${pages.map(([id, label]) => `<button class="${state.page === id ? 'active' : ''}" data-page="${id}">${label}</button>`).join('')}
        </nav>
      </aside>
      <main class="content">
        ${renderPage()}
      </main>
      ${state.modal ? renderModal(state.modal) : ''}
    </div>
  `;

  root.querySelectorAll('[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.page = button.dataset.page;
      state.status = null;
      render();
      afterRender();
    });
  });

  bindPageEvents();
  afterRender();
}

function renderPage() {
  const page = {
    home: renderHome,
    barcodes: renderBarcodes,
    progress: renderProgress,
    records: renderRecords,
    settings: renderSettings
  }[state.page];

  return `
    ${page()}
    ${state.status ? `<div class="status ${state.status.type}">${state.status.message}</div>` : ''}
  `;
}

function renderHome() {
  const session = state.session;
  return `
    <section class="page-head">
      <div>
        <h1 class="page-title">시작하기</h1>
        <p class="page-subtitle">오늘 작업을 준비하고 진행 창으로 이동합니다.</p>
      </div>
      <span class="head-badge">${todayInputValue()}</span>
    </section>

    <div class="home-layout">
      <section class="panel start-panel">
        <h2>작업 시작</h2>
        <div class="form-row">
          <label for="work-date">작업 날짜</label>
          <input id="work-date" type="date" value="${todayInputValue()}">
        </div>
        <div class="actions">
          <button id="start-session" ${state.busy ? 'disabled' : ''}>시작</button>
          <button id="go-progress" class="secondary" ${session ? '' : 'disabled'}>진행 창 열기</button>
        </div>
      </section>

      <section class="panel session-panel">
        <h2>현재 작업</h2>
        ${session ? `
          <div class="form-row">
            <label>날짜</label>
            <div>${session.date}</div>
          </div>
          <div class="form-row">
            <label>작업 폴더</label>
            <div class="file-path">${session.basePath}</div>
          </div>
          <div class="actions">
            <button id="open-session-folder" class="secondary">폴더 열기</button>
          </div>
        ` : '<div class="empty">아직 시작된 작업이 없습니다.</div>'}
      </section>
    </div>
  `;
}

function renderBarcodes() {
  const preview = state.preview;
  return `
    <h1 class="page-title">바코드 생성</h1>
    <p class="page-subtitle">사람 데이터에서 항목 값이 1인 대상만 Code128 바코드로 생성합니다.</p>

    <div class="grid two">
      <section class="panel">
        <h2>생성 옵션</h2>
        <div class="form-row">
          <label for="barcode-mode">대상</label>
          <select id="barcode-mode">
            <option value="all" ${state.barcodeMode === 'all' ? 'selected' : ''}>전체 생성</option>
            <option value="selected" ${state.barcodeMode === 'selected' ? 'selected' : ''}>일부 생성</option>
          </select>
        </div>
        <div class="form-row">
          <label for="barcode-codes">사람 코드</label>
          <input id="barcode-codes" placeholder="예: 1, 3, 7" value="${attr(state.barcodeCodes)}">
        </div>
        <div class="actions">
          <button id="preview-barcodes" ${state.busy ? 'disabled' : ''}>미리보기</button>
          <button id="create-pdf" class="secondary" ${state.busy || !preview || preview.count === 0 ? 'disabled' : ''}>PDF 생성</button>
          ${state.lastPdf ? `<button id="open-last-pdf" class="secondary">PDF 열기</button>` : ''}
        </div>
      </section>

      <section class="panel">
        <h2>생성 대상</h2>
        ${preview ? renderPreview(preview) : '<div class="empty">미리보기를 실행하세요.</div>'}
      </section>
    </div>
  `;
}

function renderPreview(preview) {
  return `
    <div class="metric-row">
      <div class="metric">
        <div class="label">바코드 수</div>
        <div class="value">${preview.count}</div>
      </div>
      <div class="metric">
        <div class="label">없는 코드</div>
        <div class="value">${preview.missingKeys.length}</div>
      </div>
      <div class="metric">
        <div class="label">방식</div>
        <div class="value">Code128</div>
      </div>
    </div>
    <div class="preview-list">
      <table class="table">
        <thead>
          <tr><th>코드</th><th>이름</th><th>항목</th><th>약정금액</th></tr>
        </thead>
        <tbody>
          ${preview.items.slice(0, 80).map((item) => `
            <tr>
              <td>${item.key}</td>
              <td>${item.name}</td>
              <td><span class="pill">${item.category}</span></td>
              <td>${money(item.pledgeAmount)}원</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderProgress() {
  const session = state.session;
  const result = state.scanResult;
  return `
    <h1 class="page-title">진행 창</h1>
    <p class="page-subtitle">바코드 스캐너 입력을 받으면 사람 데이터에서 정보를 찾아 해당 항목 파일에 기록합니다.</p>

    ${session ? `
      <div class="grid two">
        <section class="panel">
          <h2>스캔</h2>
          <div class="form-row">
            <label for="scanner-input">바코드 입력</label>
            <input id="scanner-input" class="scan-input" placeholder="스캐너로 바코드를 읽어주세요">
          </div>

          ${result ? renderScanResult(result) : '<div class="empty">스캔 대기 중입니다.</div>'}
        </section>

        <section class="panel">
          <h2>작업 정보</h2>
          <div class="form-row">
            <label>작업 날짜</label>
            <div>${session.date}</div>
          </div>
          <div class="form-row">
            <label>저장 폴더</label>
            <div class="file-path">${session.basePath}</div>
          </div>
          <div class="actions">
            <button id="open-session-folder-2" class="secondary">폴더 열기</button>
            <button id="refresh-records" class="secondary">기록 새로고침</button>
          </div>
          <h2 style="margin-top: 22px;">최근 기록</h2>
          ${renderRecentRecords()}
        </section>
      </div>
    ` : `
      <section class="panel">
        <div class="empty">먼저 시작하기에서 시작 버튼을 눌러 작업 폴더를 만들어주세요.</div>
      </section>
    `}
  `;
}

function renderScanResult(result) {
  return `
    <div class="result-grid">
      <div class="result-cell"><div class="label">이름</div><div class="value">${result.name}</div></div>
      <div class="result-cell"><div class="label">배우자이름</div><div class="value">${result.spouseName || '-'}</div></div>
      <div class="result-cell"><div class="label">코드</div><div class="value">${result.displayCode}</div></div>
      <div class="result-cell"><div class="label">항목</div><div class="value">${result.category}</div></div>
      <div class="result-cell"><div class="label">내기로 한 금액</div><div class="value">${money(result.pledgeAmount)}원</div></div>
    </div>
    <div class="form-row" style="margin-top: 16px;">
      <label for="paid-amount">낸 금액</label>
      <input id="paid-amount" inputmode="numeric" value="${result.pledgeAmount || 0}">
    </div>
    <div class="actions">
      <button id="save-record" ${state.busy ? 'disabled' : ''}>확인</button>
      <button id="clear-scan" class="secondary">취소</button>
    </div>
  `;
}

function renderRecentRecords() {
  const records = state.recentRecords || [];
  if (records.length === 0) {
    return '<div class="empty">최근 기록이 없습니다.</div>';
  }

  return `
    <table class="table">
      <thead><tr><th>코드</th><th>이름</th><th>와이프이름</th><th>항목</th><th>낸금액</th></tr></thead>
      <tbody>
        ${records.slice(0, 8).map((record) => `
          <tr>
            <td>${record.displayCode}</td>
            <td>${record.name}</td>
            <td>${record.spouseName || '-'}</td>
            <td>${record.category}</td>
            <td>${money(record.paidAmount)}원</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderRecords() {
  const summary = state.recordSummary;
  return `
    <section class="page-head">
      <div>
        <h1 class="page-title">기록 조회</h1>
        <p class="page-subtitle">현재 작업의 항목별 기록 건수와 합계를 확인합니다.</p>
      </div>
      <div class="actions">
        <button id="load-records" ${state.busy ? 'disabled' : ''}>새로고침</button>
        ${state.session ? `<button id="open-record-folder" class="secondary">작업 폴더 열기</button>` : ''}
      </div>
    </section>

    <div class="records-layout">
      <section class="panel">
        <h2>작업 정보</h2>
        ${state.session ? `
          <div class="form-row compact">
            <label>날짜</label>
            <div>${state.session.date}</div>
          </div>
          <div class="form-row compact">
            <label>폴더</label>
            <div class="file-path">${state.session.basePath}</div>
          </div>
        ` : '<div class="empty">진행 중인 작업이 없습니다.</div>'}
      </section>

      <section class="panel">
        <h2>항목별 합계</h2>
        ${summary && summary.session ? renderRecordSummary(summary) : '<div class="empty">새로고침을 눌러 기록을 불러오세요.</div>'}
      </section>
    </div>
  `;
}

function renderRecordSummary(summary) {
  return `
    <div class="metric-row summary-row">
      ${Object.values(summary.categories).map((category) => `
        <div class="metric">
          <div class="label">${category.label}</div>
          <div class="value">${category.count}건</div>
          <div class="muted">${money(category.total)}원</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderModal(modal) {
  const scan = modal.scan || {};
  return `
    <div class="modal-backdrop">
      <section class="modal-panel" role="alertdialog" aria-modal="true">
        <h2>${text(modal.title)}</h2>
        <p class="modal-message">${text(modal.message)}</p>
        ${modal.type === 'duplicate' ? `
          <div class="modal-info-grid">
            <div><span>이름</span><strong>${text(scan.name)}</strong></div>
            <div><span>와이프이름</span><strong>${text(scan.spouseName || '-')}</strong></div>
            <div><span>코드</span><strong>${text(scan.displayCode)}</strong></div>
            <div><span>항목</span><strong>${text(scan.category)}</strong></div>
            <div><span>금액</span><strong>${money(scan.duplicateRecord?.paidAmount || scan.pledgeAmount)}원</strong></div>
          </div>
        ` : ''}
        <div class="modal-actions">
          <button id="modal-close">확인</button>
        </div>
      </section>
    </div>
  `;
}

function renderSettings() {
  const settings = state.settings;
  return `
    <h1 class="page-title">설정</h1>
    <p class="page-subtitle">로컬 xlsx 파일 위치와 저장 폴더를 확인합니다.</p>
    <section class="panel">
      ${settings ? `
        <div class="form-row">
          <label>사람 데이터.xlsx</label>
          <div class="file-path">${settings.peoplePath}</div>
          <div class="muted">${settings.peopleExists ? '파일 확인됨' : '파일 없음'}</div>
        </div>
        <div class="actions">
          <button id="choose-people-file" class="secondary">사람 데이터 파일 선택</button>
          <button id="open-people-file" class="secondary" ${settings.peopleExists ? '' : 'disabled'}>파일 열기</button>
        </div>
        <div class="form-row" style="margin-top: 18px;">
          <label>기록 저장 폴더</label>
          <div class="file-path">${settings.recordsDir}</div>
        </div>
        <div class="form-row">
          <label>백업 폴더</label>
          <div class="file-path">${settings.backupsDir}</div>
        </div>
        <div class="form-row">
          <label>바코드 스캐너</label>
          <div>스캔 후 suffix는 Enter로 설정하세요. 바코드는 Code128만 사용합니다.</div>
        </div>
      ` : '<div class="empty">설정을 불러오는 중입니다.</div>'}
    </section>
  `;
}

function bindPageEvents() {
  document.getElementById('start-session')?.addEventListener('click', async () => {
    const date = document.getElementById('work-date').value;
    const session = await run(() => api.workSession.start(date), '작업 폴더와 항목별 xlsx 파일을 준비했습니다.');
    if (session) {
      state.session = session;
      state.page = 'progress';
      render();
    }
  });

  document.getElementById('go-progress')?.addEventListener('click', () => {
    state.page = 'progress';
    render();
  });

  document.getElementById('open-session-folder')?.addEventListener('click', () => api.files.open(state.session.basePath));
  document.getElementById('open-session-folder-2')?.addEventListener('click', () => api.files.open(state.session.basePath));
  document.getElementById('open-record-folder')?.addEventListener('click', () => api.files.open(state.session.basePath));
  document.getElementById('modal-close')?.addEventListener('click', () => {
    state.modal = null;
    render();
  });

  document.getElementById('preview-barcodes')?.addEventListener('click', async () => {
    const mode = document.getElementById('barcode-mode').value;
    const codes = document.getElementById('barcode-codes').value;
    state.barcodeMode = mode;
    state.barcodeCodes = codes;
    const preview = await run(() => api.barcodes.preview({ mode, codes }), '바코드 생성 대상을 계산했습니다.');
    if (preview) {
      state.preview = preview;
      render();
    }
  });

  document.getElementById('create-pdf')?.addEventListener('click', async () => {
    const mode = document.getElementById('barcode-mode').value;
    const codes = document.getElementById('barcode-codes').value;
    state.barcodeMode = mode;
    state.barcodeCodes = codes;
    const pdf = await run(() => api.barcodes.createPdf({ mode, codes }), '바코드 PDF를 생성했습니다.');
    if (pdf) {
      state.lastPdf = pdf;
      render();
    }
  });

  document.getElementById('open-last-pdf')?.addEventListener('click', () => api.files.open(state.lastPdf.path));

  document.getElementById('scanner-input')?.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    const input = event.currentTarget;
    const barcode = input.value.trim();
    input.value = '';

    if (!barcode) {
      return;
    }

    const lookup = await run(() => api.scan.lookup(barcode));
    if (lookup) {
      if (lookup.duplicate) {
        state.scanResult = null;
        state.modal = {
          type: 'duplicate',
          title: '중복 스캔',
          message: '이미 스캔한 기록이 있습니다.',
          scan: lookup
        };
        render();
        return;
      }
      state.scanResult = lookup;
      render();
    }
  });

  document.getElementById('save-record')?.addEventListener('click', async () => {
    const paidAmount = document.getElementById('paid-amount').value;
    const saved = await run(() => api.records.append({
      barcode: state.scanResult.barcode,
      paidAmount
    }), '기록을 저장했습니다.');

    if (saved) {
      state.recentRecords.unshift(saved);
      state.recentRecords = state.recentRecords.slice(0, 20);
      state.scanResult = null;
      render();
    }
  });

  document.getElementById('clear-scan')?.addEventListener('click', () => {
    state.scanResult = null;
    render();
  });

  document.getElementById('refresh-records')?.addEventListener('click', loadSessionRecords);
  document.getElementById('load-records')?.addEventListener('click', loadSessionRecords);

  document.getElementById('choose-people-file')?.addEventListener('click', async () => {
    const settings = await run(() => api.settings.choosePeopleFile(), '사람 데이터 파일을 설정했습니다.');
    if (settings) {
      state.settings = settings;
      render();
    }
  });

  document.getElementById('open-people-file')?.addEventListener('click', () => api.files.open(state.settings.peoplePath));
}

async function loadSessionRecords() {
  const summary = await run(() => api.records.listBySession(), '기록을 불러왔습니다.');
  if (!summary) {
    return;
  }

  state.recentRecords = summary.recentRecords || [];
  state.recordSummary = summary;
  render();
}

function afterRender() {
  if (state.page === 'progress') {
    const input = document.getElementById('scanner-input');
    if (input && !state.scanResult) {
      setTimeout(() => input.focus(), 20);
    }
  }
}

bootstrap().catch((error) => {
  document.getElementById('app').innerHTML = `<div class="status error">${error.message}</div>`;
});
