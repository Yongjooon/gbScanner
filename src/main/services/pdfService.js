const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const dayjs = require('dayjs');
const { ensureDir } = require('../utils/backup');

class PdfService {
  constructor(settingsService, barcodeService) {
    this.settingsService = settingsService;
    this.barcodeService = barcodeService;
  }

  async createBarcodePdf(options = {}) {
    const preview = await this.barcodeService.preview(options);
    if (preview.items.length === 0) {
      throw new Error('생성할 바코드가 없습니다.');
    }

    const settings = await this.settingsService.get();
    const outputDir = path.join(settings.outputDir, 'barcodes');
    await ensureDir(outputDir);

    const fileName = `barcodes_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
    const filePath = path.join(outputDir, fileName);
    await writePdf(filePath, preview.items);

    return {
      fileName,
      path: filePath,
      count: preview.items.length,
      missingKeys: preview.missingKeys
    };
  }
}

async function writePdf(filePath, items) {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const fontPath = findKoreanFont();
  if (fontPath) {
    doc.registerFont('appFont', fontPath);
    doc.font('appFont');
  }

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const labelWidth = pageWidth / 2 - 8;
  const labelHeight = 132;
  let x = doc.page.margins.left;
  let y = doc.page.margins.top;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (y + labelHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      if (fontPath) {
        doc.font('appFont');
      }
      x = doc.page.margins.left;
      y = doc.page.margins.top;
    }

    await drawLabel(doc, item, x, y, labelWidth, labelHeight);

    if (x + labelWidth * 2 + 8 <= doc.page.width - doc.page.margins.right) {
      x += labelWidth + 16;
    } else {
      x = doc.page.margins.left;
      y += labelHeight + 12;
    }
  }

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

async function drawLabel(doc, item, x, y, width, height) {
  const barcodeBuffer = await bwipjs.toBuffer({
    bcid: 'code128',
    text: item.barcode,
    scale: 2,
    height: 16,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0
  });

  doc.roundedRect(x, y, width, height, 6).stroke('#d0d7de');
  doc.fontSize(12).fillColor('#111827').text(`${item.name} / ${item.spouseName || '-'}`, x + 10, y + 10, {
    width: width - 20
  });
  doc.fontSize(10).fillColor('#374151').text(`항목: ${item.category}`, x + 10, y + 32);
  doc.image(barcodeBuffer, x + 10, y + 54, { width: width - 20, height: 44 });
}

function findKoreanFont() {
  const candidates = [
    '/System/Library/Fonts/Supplemental/AppleGothic.ttf',
    '/System/Library/Fonts/AppleSDGothicNeo.ttc',
    'C:\\Windows\\Fonts\\malgun.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

module.exports = {
  PdfService
};
