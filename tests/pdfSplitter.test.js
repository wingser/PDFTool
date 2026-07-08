const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { splitPdfBySize, sanitizeFileName } = require('../src/main/pdfSplitter');
const { normalizeInputPaths, walkPdfFiles } = require('../src/main/splitTaskRunner');
const { getZipVolumeFileName, splitPdfToZipVolumes } = require('../src/main/zipVolumeSplitter');

test('splitPdfBySize keeps complete pages and readable output files', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdftool-'));
  const inputPath = path.join(tempDir, '中文 sample.pdf');
  const outputDir = path.join(tempDir, 'out');
  await createSamplePdf(inputPath, 8);

  const result = await splitPdfBySize({
    inputPath,
    outputDir,
    maxBytes: 3500,
    baseName: '中文 sample'
  });

  assert.equal(result.totalPages, 8);
  assert.ok(result.outputs.length > 1);
  const pageCounts = [];
  for (const part of result.outputs) {
    const bytes = await fs.readFile(part.outputPath);
    const pdf = await PDFDocument.load(bytes);
    pageCounts.push(pdf.getPageCount());
    assert.equal(pdf.getPageCount(), part.pageCount);
  }
  assert.equal(pageCounts.reduce((sum, count) => sum + count, 0), 8);
});

test('single page above max size is output with warning', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdftool-'));
  const inputPath = path.join(tempDir, 'large-page.pdf');
  const outputDir = path.join(tempDir, 'out');
  await createSamplePdf(inputPath, 1);

  const result = await splitPdfBySize({
    inputPath,
    outputDir,
    maxBytes: 100,
    baseName: 'large-page'
  });

  assert.equal(result.outputs.length, 1);
  assert.match(result.outputs[0].warning, /单页超过/);
  const bytes = await fs.readFile(result.outputs[0].outputPath);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
});

test('walkPdfFiles recursively finds pdf files and skips pdfoutput', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdftool-'));
  await fs.mkdir(path.join(tempDir, 'a', 'b'), { recursive: true });
  await fs.mkdir(path.join(tempDir, 'pdfoutput'), { recursive: true });
  await fs.writeFile(path.join(tempDir, 'one.pdf'), 'x');
  await fs.writeFile(path.join(tempDir, 'a', 'b', 'two.PDF'), 'x');
  await fs.writeFile(path.join(tempDir, 'pdfoutput', 'skip.pdf'), 'x');
  await fs.writeFile(path.join(tempDir, 'note.txt'), 'x');

  const files = await walkPdfFiles(tempDir);
  assert.equal(files.length, 2);
  assert.ok(files.some((file) => file.endsWith('one.pdf')));
  assert.ok(files.some((file) => file.endsWith(path.join('a', 'b', 'two.PDF'))));
});

test('normalizeInputPaths supports multi-selected pdf files', () => {
  assert.deepEqual(
    normalizeInputPaths({
      inputPath: 'C:\\docs\\one.pdf',
      inputPaths: ['C:\\docs\\one.pdf', 'C:\\docs\\two.pdf']
    }),
    ['C:\\docs\\one.pdf', 'C:\\docs\\two.pdf']
  );
});

test('splitPdfToZipVolumes creates bounded volumes that reconstruct the original pdf', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdftool-'));
  const inputPath = path.join(tempDir, 'source.pdf');
  const outputDir = path.join(tempDir, 'out');
  await createSamplePdf(inputPath, 5);
  const originalBytes = await fs.readFile(inputPath);

  const result = await splitPdfToZipVolumes({
    inputPath,
    outputDir,
    maxBytes: 1200,
    baseName: 'source'
  });

  assert.ok(result.outputs.length > 1);
  for (const output of result.outputs) {
    assert.ok(output.sizeBytes <= 1200);
  }
  assert.ok(result.outputs[0].outputPath.endsWith('.z01'));
  assert.ok(result.outputs.at(-1).outputPath.endsWith('.zip'));

  const rebuiltZip = Buffer.concat(await Promise.all(result.outputs.map((output) => fs.readFile(output.outputPath))));
  const extracted = extractSingleFileZip(rebuiltZip);
  assert.equal(extracted.fileName, 'source.pdf');
  assert.deepEqual(extracted.fileBytes, originalBytes);
});

test('getZipVolumeFileName uses WinRAR-compatible zip split names', () => {
  assert.equal(getZipVolumeFileName('book', 1, 3), 'book.z01');
  assert.equal(getZipVolumeFileName('book', 2, 3), 'book.z02');
  assert.equal(getZipVolumeFileName('book', 3, 3), 'book.zip');
  assert.equal(getZipVolumeFileName('book', 1, 1), 'book.zip');
});

test('sanitizeFileName replaces illegal Windows filename characters', () => {
  assert.equal(sanitizeFileName('a<>:"/\\|?*b'), 'a_________b');
});

async function createSamplePdf(filePath, pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index += 1) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`Page ${index + 1}`, {
      x: 60,
      y: 760,
      size: 28,
      font,
      color: rgb(0.05, 0.12, 0.25)
    });
    page.drawText('PDFTool split test content '.repeat(20), {
      x: 60,
      y: 700,
      size: 12,
      font,
      color: rgb(0.2, 0.25, 0.35)
    });
  }
  await fs.writeFile(filePath, await pdf.save({ useObjectStreams: false }));
}

function extractSingleFileZip(zipBytes) {
  assert.equal(zipBytes.readUInt32LE(0), 0x04034b50);
  const method = zipBytes.readUInt16LE(8);
  const compressedSize = zipBytes.readUInt32LE(18);
  const nameLength = zipBytes.readUInt16LE(26);
  const extraLength = zipBytes.readUInt16LE(28);
  const nameStart = 30;
  const dataStart = nameStart + nameLength + extraLength;
  const compressedBytes = zipBytes.subarray(dataStart, dataStart + compressedSize);
  const fileBytes = method === 8 ? zlib.inflateRawSync(compressedBytes) : compressedBytes;
  return {
    fileName: zipBytes.subarray(nameStart, nameStart + nameLength).toString('utf8'),
    fileBytes
  };
}
