const fs = require('node:fs/promises');
const path = require('node:path');
const { splitPdfBySize } = require('./pdfSplitter');
const { splitPdfToZipVolumes } = require('./zipVolumeSplitter');

class SplitTaskRunner {
  constructor({ options, onProgress }) {
    this.options = options;
    this.onProgress = onProgress || (() => {});
  }

  async run() {
    this.validateOptions();
    const files = await this.collectPdfFiles();
    const results = [];
    const outputFiles = [];
    const maxBytes = Math.floor(Number(this.options.splitSizeMb) * 1024 * 1024);

    this.onProgress({
      stage: 'scan',
      message: `找到 ${files.length} 个 PDF 文件`,
      totalFiles: files.length
    });

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      this.onProgress({
        stage: 'split',
        message: `正在处理 ${path.basename(file.path)}`,
        currentFile: file.path,
        fileIndex: index + 1,
        totalFiles: files.length
      });

      try {
        const outputDir = this.resolveOutputDir(file.path);
        const processor = this.options.processMode === 'zip' ? splitPdfToZipVolumes : splitPdfBySize;
        const result = await processor({
          inputPath: file.path,
          outputDir,
          maxBytes,
          baseName: path.basename(file.path, path.extname(file.path)),
          onPart: (part) => {
            outputFiles.push(part.outputPath);
            this.onProgress({
              stage: 'part',
              message: `已生成 ${path.basename(part.outputPath)}`,
              part
            });
          }
        });
        results.push({ ok: true, ...result });
      } catch (error) {
        results.push({
          ok: false,
          inputPath: file.path,
          error: error.message
        });
      }
    }

    return {
      ok: true,
      inputType: this.options.inputType,
      processMode: this.options.processMode || 'pdf',
      outputPath: this.options.outputPath,
      totalFiles: files.length,
      results,
      outputFiles
    };
  }

  validateOptions() {
    const inputPaths = normalizeInputPaths(this.options);
    if (inputPaths.length === 0) throw new Error('请选择 PDF 文件或文件夹');
    if (!this.options.outputPath) throw new Error('请选择输出目录');
    const splitSizeMb = Number(this.options.splitSizeMb);
    if (!Number.isFinite(splitSizeMb) || splitSizeMb <= 0) {
      throw new Error('分割大小必须大于 0');
    }
  }

  async collectPdfFiles() {
    if (this.options.inputType === 'file' || this.options.inputType === 'files') {
      return normalizeInputPaths(this.options).map((filePath) => ({ path: filePath }));
    }
    const files = await walkPdfFiles(this.options.inputPath);
    return files.map((filePath) => ({ path: filePath }));
  }

  resolveOutputDir(filePath) {
    if (this.options.inputType === 'file' || this.options.inputType === 'files') {
      return this.options.outputPath;
    }
    const relativeDir = path.relative(this.options.inputPath, path.dirname(filePath));
    return path.join(this.options.outputPath, relativeDir);
  }
}

function normalizeInputPaths(options) {
  if (Array.isArray(options.inputPaths) && options.inputPaths.length > 0) {
    return options.inputPaths.filter(Boolean);
  }
  return options.inputPath ? [options.inputPath] : [];
}

async function walkPdfFiles(rootDir) {
  const found = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === 'pdfoutput') continue;
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        found.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return found;
}

module.exports = {
  SplitTaskRunner,
  normalizeInputPaths,
  walkPdfFiles
};
