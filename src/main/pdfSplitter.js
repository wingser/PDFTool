const fs = require('node:fs/promises');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');

async function splitPdfBySize({ inputPath, outputDir, maxBytes, baseName, onPart }) {
  const inputBytes = await fs.readFile(inputPath);
  const sourcePdf = await PDFDocument.load(inputBytes, { ignoreEncryption: false });
  const totalPages = sourcePdf.getPageCount();
  const safeBaseName = sanitizeFileName(baseName || path.basename(inputPath, path.extname(inputPath)));
  const outputs = [];
  let startPage = 0;
  let partNumber = 1;

  await fs.mkdir(outputDir, { recursive: true });

  while (startPage < totalPages) {
    const remaining = totalPages - startPage;
    const probeOne = await buildPdfBytes(sourcePdf, startPage, 1);
    let pageCount;
    let warning = '';

    if (probeOne.length > maxBytes) {
      pageCount = 1;
      warning = '单页超过设定大小，已保留完整页面';
    } else {
      pageCount = await findLargestFittingPageCount(sourcePdf, startPage, remaining, maxBytes);
    }

    const partBytes = pageCount === 1 && warning ? probeOne : await buildPdfBytes(sourcePdf, startPage, pageCount);
    const outputPath = path.join(outputDir, `${safeBaseName}_part${String(partNumber).padStart(3, '0')}.pdf`);
    await fs.writeFile(outputPath, partBytes);

    const output = {
      sourcePath: inputPath,
      outputPath,
      partNumber,
      startPage: startPage + 1,
      endPage: startPage + pageCount,
      pageCount,
      sizeBytes: partBytes.length,
      warning
    };
    outputs.push(output);
    if (onPart) onPart(output);

    startPage += pageCount;
    partNumber += 1;
  }

  return {
    inputPath,
    totalPages,
    outputs
  };
}

async function findLargestFittingPageCount(sourcePdf, startPage, maxPageCount, maxBytes) {
  let low = 1;
  let high = maxPageCount;
  let best = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const bytes = await buildPdfBytes(sourcePdf, startPage, mid);
    if (bytes.length <= maxBytes) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

async function buildPdfBytes(sourcePdf, startPage, pageCount) {
  const targetPdf = await PDFDocument.create();
  const indexes = Array.from({ length: pageCount }, (_unused, index) => startPage + index);
  const copiedPages = await targetPdf.copyPages(sourcePdf, indexes);
  copiedPages.forEach((page) => targetPdf.addPage(page));
  return targetPdf.save({ useObjectStreams: false });
}

function sanitizeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'pdf';
}

module.exports = {
  splitPdfBySize,
  buildPdfBytes,
  sanitizeFileName
};
