const CATEGORIES = {
  TITHE: {
    code: 'TITHE',
    label: '십일조',
    enabledHeader: '십일조',
    amountAliases: ['십일조_금액', '십일조금액', '십일조 금액']
  },
  MISSION: {
    code: 'MISSION',
    label: '해외선교',
    enabledHeader: '해외선교',
    amountAliases: ['해외선교_금액', '해외선교금액', '해외선교 금액']
  },
  ETC: {
    code: 'ETC',
    label: '기타',
    enabledHeader: '기타',
    amountAliases: ['기타_금액', '기타금액', '기타 금액']
  }
};

const CATEGORY_ORDER = ['TITHE', 'MISSION', 'ETC'];

module.exports = {
  CATEGORIES,
  CATEGORY_ORDER
};
