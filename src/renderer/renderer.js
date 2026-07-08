const state = {
  inputPath: '',
  inputPaths: [],
  inputType: '',
  outputPath: '',
  outputFiles: [],
  lastMailResults: []
};

let autoSaveTimer = null;

const $ = (id) => document.getElementById(id);

const elements = {
  statusPill: $('statusPill'),
  selectPdfBtn: $('selectPdfBtn'),
  selectFolderBtn: $('selectFolderBtn'),
  selectOutputBtn: $('selectOutputBtn'),
  inputPath: $('inputPath'),
  outputPath: $('outputPath'),
  splitSizeMb: $('splitSizeMb'),
  taskProgress: $('taskProgress'),
  progressCount: $('progressCount'),
  autoSend: $('autoSend'),
  smtpHost: $('smtpHost'),
  smtpPort: $('smtpPort'),
  smtpUser: $('smtpUser'),
  smtpPassword: $('smtpPassword'),
  recipientEmail: $('recipientEmail'),
  smtpSecure: $('smtpSecure'),
  mailNotice: $('mailNotice'),
  saveConfigBtn: $('saveConfigBtn'),
  testMailBtn: $('testMailBtn'),
  startBtn: $('startBtn'),
  clearResultsBtn: $('clearResultsBtn'),
  progressText: $('progressText'),
  results: $('results')
};

window.pdfTool.onProgress((payload) => {
  if (payload.message) setProgress(payload.message);
  updateProgressFromPayload(payload);
  if (payload.part) appendPartResult(payload.part);
});

bootstrap();

async function bootstrap() {
  const config = await window.pdfTool.getConfig();
  applyConfig(config);
  bindEvents();
  setTaskProgress(0, 0);
}

function bindEvents() {
  elements.selectPdfBtn.addEventListener('click', async () => {
    const result = await window.pdfTool.selectPdf();
    if (result) {
      applySelection(result);
      scheduleConfigSave();
    }
  });

  elements.selectFolderBtn.addEventListener('click', async () => {
    const result = await window.pdfTool.selectFolder();
    if (result) {
      applySelection(result);
      scheduleConfigSave();
    }
  });

  elements.selectOutputBtn.addEventListener('click', async () => {
    const outputPath = await window.pdfTool.selectOutput();
    if (outputPath) {
      state.outputPath = outputPath;
      elements.outputPath.value = outputPath;
      scheduleConfigSave();
    }
  });

  [
    elements.splitSizeMb,
    elements.smtpHost,
    elements.smtpPort,
    elements.smtpUser,
    elements.smtpPassword,
    elements.recipientEmail
  ].forEach((input) => {
    input.addEventListener('input', scheduleConfigSave);
    input.addEventListener('change', scheduleConfigSave);
  });

  [elements.autoSend, elements.smtpSecure].forEach((input) => {
    input.addEventListener('change', scheduleConfigSave);
  });

  document.querySelectorAll('input[name="processMode"]').forEach((input) => {
    input.addEventListener('change', scheduleConfigSave);
  });

  elements.saveConfigBtn.addEventListener('click', saveConfig);
  elements.testMailBtn.addEventListener('click', testMail);
  elements.startBtn.addEventListener('click', runTask);
  elements.clearResultsBtn.addEventListener('click', clearResults);
}

function applyConfig(config) {
  elements.splitSizeMb.value = config.splitSizeMb || 40;
  setProcessMode(config.processMode || 'zip');
  elements.autoSend.checked = config.autoSend !== false;
  elements.smtpHost.value = config.smtpHost || '';
  elements.smtpPort.value = config.smtpPort || 465;
  elements.smtpUser.value = config.smtpUser || '';
  elements.smtpPassword.value = config.smtpPasswordOrAuthCode || '';
  elements.recipientEmail.value = config.defaultRecipientEmail || '';
  elements.smtpSecure.checked = config.smtpSecure !== false;
  if (config.lastInputPath) {
    state.inputPath = config.lastInputPath;
    state.inputPaths = [config.lastInputPath];
    elements.inputPath.value = config.lastInputPath;
  }
  if (config.lastOutputPath) {
    state.outputPath = config.lastOutputPath;
    elements.outputPath.value = config.lastOutputPath;
  }
}

function applySelection(selection) {
  state.inputPath = selection.inputPath;
  state.inputPaths = selection.inputPaths || [selection.inputPath];
  state.inputType = selection.inputType;
  state.outputPath = selection.outputPath;
  elements.inputPath.value = formatSelectedInput(selection);
  elements.outputPath.value = selection.outputPath;

  if (selection.inputType === 'files') {
    setStatus(`已选择 ${state.inputPaths.length} 个 PDF`);
  } else {
    setStatus(selection.inputType === 'file' ? '已选择 PDF' : '已选择文件夹');
  }
}

async function saveConfig({ quiet = false } = {}) {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  const config = collectConfig();
  config.lastInputPath = state.inputPath;
  config.lastOutputPath = state.outputPath;
  await window.pdfTool.saveConfig(config);
  if (!quiet) setMailNotice('配置已保存', 'success');
}

function scheduleConfigSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveConfig({ quiet: true }).catch((error) => {
      setMailNotice(error.message, 'error');
    });
  }, 600);
}

async function testMail() {
  setBusy(true);
  setMailNotice('正在测试邮箱连接...', 'neutral');
  try {
    await window.pdfTool.testMail(collectMailConfig());
    setMailNotice('邮箱连接测试成功', 'success');
  } catch (error) {
    setMailNotice(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function runTask() {
  clearResults();
  if (state.inputPaths.length === 0 || !state.outputPath) {
    setProgress('请先选择 PDF 文件或文件夹。');
    return;
  }

  setBusy(true);
  state.outputFiles = [];
  state.lastMailResults = [];
  setStatus('处理中');
  setTaskProgress(0, 0);

  try {
    await saveConfig({ quiet: true });
    const result = await window.pdfTool.runTask({
      inputPath: state.inputPath,
      inputPaths: state.inputPaths,
      inputType: state.inputType || inferInputType(),
      outputPath: state.outputPath,
      splitSizeMb: Number(elements.splitSizeMb.value),
      processMode: getProcessMode()
    });
    state.outputFiles = result.outputFiles || [];
    appendSummary(result);

    if (elements.autoSend.checked) {
      await sendGeneratedFiles();
    } else {
      setStatus('处理完成');
      setProgress(`处理完成，生成 ${state.outputFiles.length} 个文件。`);
      setTaskProgress(result.totalFiles, result.totalFiles);
    }
  } catch (error) {
    setStatus('处理失败');
    setProgress(error.message);
    appendError('任务失败', error.message);
  } finally {
    setBusy(false);
  }
}

async function sendGeneratedFiles(files = state.outputFiles) {
  if (files.length === 0) {
    setProgress('没有可发送的输出文件。');
    return [];
  }
  const recipientEmail = elements.recipientEmail.value.trim();
  if (!recipientEmail) {
    appendError('邮件未发送', '请填写目标邮箱。');
    setStatus('等待邮箱配置');
    return [];
  }
  const mailResults = await window.pdfTool.sendFiles({
    mailConfig: collectMailConfig(),
    recipientEmail,
    files
  });
  state.lastMailResults = mergeMailResults(state.lastMailResults, mailResults);
  appendMailResults(mailResults);
  const failed = mailResults.filter((item) => !item.ok).length;
  setStatus(failed ? '部分邮件失败' : '处理完成');
  setProgress(failed ? `邮件发送完成，失败 ${failed} 封。` : `邮件发送完成，共 ${mailResults.length} 封。`);
  setTaskProgress(mailResults.filter((item) => item.ok).length, mailResults.length);
  return mailResults;
}

async function retryMail(filePath, button) {
  const recipientEmail = elements.recipientEmail.value.trim();
  if (!recipientEmail) {
    setMailNotice('请填写目标邮箱后重试发送', 'error');
    return;
  }
  button.disabled = true;
  button.textContent = '发送中...';
  setMailNotice(`正在重发 ${fileName(filePath)}`, 'neutral');
  try {
    const results = await window.pdfTool.sendFiles({
      mailConfig: collectMailConfig(),
      recipientEmail,
      files: [filePath]
    });
    state.lastMailResults = mergeMailResults(state.lastMailResults, results);
    appendMailResults(results);
    const result = results[0];
    if (result.ok) {
      setMailNotice('重发成功', 'success');
    } else {
      setMailNotice(result.error || '重发失败', 'error');
      button.disabled = false;
      button.textContent = '重新发送';
    }
  } catch (error) {
    setMailNotice(error.message, 'error');
    button.disabled = false;
    button.textContent = '重新发送';
  }
}

function collectConfig() {
  return {
    splitSizeMb: Number(elements.splitSizeMb.value),
    processMode: getProcessMode(),
    autoSend: elements.autoSend.checked,
    smtpHost: elements.smtpHost.value.trim(),
    smtpPort: Number(elements.smtpPort.value),
    smtpSecure: elements.smtpSecure.checked,
    smtpUser: elements.smtpUser.value.trim(),
    smtpPasswordOrAuthCode: elements.smtpPassword.value,
    defaultRecipientEmail: elements.recipientEmail.value.trim()
  };
}

function collectMailConfig() {
  const config = collectConfig();
  return {
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpSecure: config.smtpSecure,
    smtpUser: config.smtpUser,
    smtpPasswordOrAuthCode: config.smtpPasswordOrAuthCode
  };
}

function getProcessMode() {
  return document.querySelector('input[name="processMode"]:checked')?.value || 'zip';
}

function setProcessMode(mode) {
  const input = document.querySelector(`input[name="processMode"][value="${mode === 'zip' ? 'zip' : 'pdf'}"]`);
  if (input) input.checked = true;
}

function inferInputType() {
  if (state.inputPaths.length > 1) return 'files';
  return state.inputPath.toLowerCase().endsWith('.pdf') ? 'file' : 'folder';
}

function appendPartResult(part) {
  ensureResultsContainer();
  const item = document.createElement('div');
  item.className = 'result-item';
  const isZip = part.mode === 'zip';
  const meta = isZip
    ? `分卷：${part.partNumber}/${part.totalParts}，大小：${formatBytes(part.sizeBytes)}`
    : `页码：${part.startPage}-${part.endPage}，大小：${formatBytes(part.sizeBytes)}`;
  item.innerHTML = `
    <div class="result-title">
      <span>${escapeHtml(fileName(part.outputPath))}</span>
      <span class="${part.warning ? 'warning' : 'ok'}">${part.warning ? '提示' : '完成'}</span>
    </div>
    <div class="result-meta">${meta}</div>
    <div class="result-meta">${escapeHtml(part.outputPath)}</div>
    ${part.warning ? `<div class="result-meta warning">${escapeHtml(part.warning)}</div>` : ''}
  `;
  item.addEventListener('dblclick', () => window.pdfTool.showInFolder(part.outputPath));
  elements.results.prepend(item);
}

function appendSummary(result) {
  ensureResultsContainer();
  const failed = result.results.filter((item) => !item.ok);
  if (failed.length) {
    failed.forEach((item) => appendError(fileName(item.inputPath), item.error));
  }
}

function appendMailResults(mailResults) {
  ensureResultsContainer();
  mailResults.forEach((mail) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    const retryId = `retry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    item.innerHTML = `
      <div class="result-title">
        <span>邮件：${escapeHtml(fileName(mail.filePath))}</span>
        <span class="${mail.ok ? 'ok' : 'error'}">${mail.ok ? '已发送' : '失败'}</span>
      </div>
      <div class="result-meta">${escapeHtml(mail.filePath)}</div>
      ${mail.error ? `<div class="result-meta error">${escapeHtml(mail.error)}</div>` : ''}
      ${mail.ok ? '' : `<div><button id="${retryId}" class="retry-button" type="button">重新发送</button></div>`}
    `;
    elements.results.prepend(item);
    if (!mail.ok) {
      item.querySelector(`#${retryId}`).addEventListener('click', (event) => retryMail(mail.filePath, event.currentTarget));
    }
  });
}

function appendError(title, message) {
  ensureResultsContainer();
  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
    <div class="result-title">
      <span>${escapeHtml(title)}</span>
      <span class="error">失败</span>
    </div>
    <div class="result-meta error">${escapeHtml(message)}</div>
  `;
  elements.results.prepend(item);
}

function ensureResultsContainer() {
  if (elements.results.classList.contains('empty')) {
    elements.results.classList.remove('empty');
    elements.results.textContent = '';
  }
}

function clearResults() {
  elements.results.className = 'results empty';
  elements.results.textContent = '暂无结果';
}

function setBusy(isBusy) {
  [
    elements.selectPdfBtn,
    elements.selectFolderBtn,
    elements.selectOutputBtn,
    elements.saveConfigBtn,
    elements.testMailBtn,
    elements.startBtn
  ].forEach((button) => {
    button.disabled = isBusy;
  });
}

function setStatus(text) {
  elements.statusPill.textContent = text;
}

function setProgress(text) {
  elements.progressText.textContent = text;
}

function setMailNotice(text, type) {
  elements.mailNotice.textContent = text;
  elements.mailNotice.className = `inline-notice ${type || 'neutral'}`;
}

function setTaskProgress(done, total) {
  const normalizedTotal = Math.max(Number(total) || 0, 0);
  const normalizedDone = Math.min(Math.max(Number(done) || 0, 0), normalizedTotal);
  elements.taskProgress.max = normalizedTotal || 1;
  elements.taskProgress.value = normalizedDone;
  elements.progressCount.textContent = `${normalizedDone}/${normalizedTotal}`;
}

function updateProgressFromPayload(payload) {
  if (payload.stage === 'scan') {
    setTaskProgress(0, payload.totalFiles || 0);
  }
  if (payload.stage === 'split' && payload.totalFiles) {
    setTaskProgress((payload.fileIndex || 1) - 1, payload.totalFiles);
  }
  if (payload.stage === 'email' && payload.emailTotal) {
    setTaskProgress((payload.emailIndex || 1) - 1, payload.emailTotal);
  }
}

function formatSelectedInput(selection) {
  const inputPaths = selection.inputPaths || [selection.inputPath];
  if (selection.inputType === 'files') {
    return `已选择 ${inputPaths.length} 个 PDF：${inputPaths.map(fileName).join('、')}`;
  }
  return selection.inputPath;
}

function mergeMailResults(existing, incoming) {
  const next = new Map(existing.map((item) => [item.filePath, item]));
  incoming.forEach((item) => next.set(item.filePath, item));
  return Array.from(next.values());
}

function fileName(filePath) {
  return String(filePath).split(/[\\/]/).pop();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
