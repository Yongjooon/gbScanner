function parseAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized = String(value).replace(/,/g, '').trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('금액은 0 이상의 숫자만 입력할 수 있습니다.');
  }

  return Number(normalized);
}

function formatAmount(value) {
  const amount = parseAmount(value);
  return amount === null ? '' : amount.toLocaleString('ko-KR');
}

module.exports = {
  parseAmount,
  formatAmount
};
