const dayjs = require('dayjs');

function getWorkDateParts(inputDate) {
  const date = inputDate ? dayjs(inputDate) : dayjs();
  if (!date.isValid()) {
    throw new Error('작업 날짜가 올바르지 않습니다.');
  }

  return {
    date: date.format('YYYY-MM-DD'),
    dirName: date.format('YYMMDD'),
    filePrefix: date.format('YYYYMMDD'),
    time: date.format('HH:mm:ss')
  };
}

module.exports = {
  getWorkDateParts
};
