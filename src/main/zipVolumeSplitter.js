const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { sanitizeFileName } = require('./pdfSplitter');

async function splitPdfToZipVolumes({ inputPath, outputDir, maxBytes, baseName, onPart }) {
  const inputBytes = await fs.readFile(inputPath);
  const pdfName = path.basename(inputPath);
  const zipBytes = createSingleFileZip({
    fileName: pdfName,
    fileBytes: inputBytes
  });
  const safeBaseName = sanitizeFileName(baseName || path.basename(inputPath, path.extname(inputPath)));
  const outputs = [];

  await fs.mkdir(outputDir, { recursive: true });

  if (zipBytes.length <= maxBytes) {
    const outputPath = path.join(outputDir, `${safeBaseName}.zip`);
    await fs.writeFile(outputPath, zipBytes);
    const output = buildVolumeResult({ inputPath, outputPath, partNumber: 1, totalParts: 1, bytes: zipBytes });
    outputs.push(output);
    if (onPart) onPart(output);
    return { inputPath, totalPages: null, outputs };
  }

  const totalParts = Math.ceil(zipBytes.length / maxBytes);
  for (let index = 0; index < totalParts; index += 1) {
    const start = index * maxBytes;
    const end = Math.min(start + maxBytes, zipBytes.length);
    const partBytes = zipBytes.subarray(start, end);
    const outputPath = path.join(outputDir, getZipVolumeFileName(safeBaseName, index + 1, totalParts));
    await fs.writeFile(outputPath, partBytes);
    const output = buildVolumeResult({
      inputPath,
      outputPath,
      partNumber: index + 1,
      totalParts,
      bytes: partBytes
    });
    outputs.push(output);
    if (onPart) onPart(output);
  }

  return { inputPath, totalPages: null, outputs };
}

function buildVolumeResult({ inputPath, outputPath, partNumber, totalParts, bytes }) {
  return {
    sourcePath: inputPath,
    outputPath,
    partNumber,
    totalParts,
    sizeBytes: bytes.length,
    mode: 'zip',
    warning: totalParts > 1 && partNumber === totalParts ? '请收齐全部分卷后，打开 .zip 文件解压' : ''
  };
}

function getZipVolumeFileName(baseName, partNumber, totalParts) {
  if (totalParts <= 1 || partNumber === totalParts) {
    return `${baseName}.zip`;
  }
  return `${baseName}.z${String(partNumber).padStart(2, '0')}`;
}

function createSingleFileZip({ fileName, fileBytes }) {
  const nameBytes = Buffer.from(fileName, 'utf8');
  const compressedBytes = zlib.deflateRawSync(fileBytes, { level: 9 });
  const crc = crc32(fileBytes);
  const localHeaderOffset = 0;

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressedBytes.length, 18);
  localHeader.writeUInt32LE(fileBytes.length, 22);
  localHeader.writeUInt16LE(nameBytes.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressedBytes.length, 20);
  centralHeader.writeUInt32LE(fileBytes.length, 24);
  centralHeader.writeUInt16LE(nameBytes.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(localHeaderOffset, 42);

  const centralDirectory = Buffer.concat([centralHeader, nameBytes]);
  const localRecord = Buffer.concat([localHeader, nameBytes, compressedBytes]);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(1, 8);
  endRecord.writeUInt16LE(1, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localRecord.length, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([localRecord, centralDirectory, endRecord]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

module.exports = {
  splitPdfToZipVolumes,
  createSingleFileZip,
  getZipVolumeFileName,
  crc32
};
