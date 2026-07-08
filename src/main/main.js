const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { SplitTaskRunner } = require('./splitTaskRunner');
const { ConfigStore } = require('./configStore');
const { MailService } = require('./mailService');

let mainWindow;
let configStore;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#f6f7fb',
    title: 'PDFTool',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function registerIpc() {
  ipcMain.handle('dialog:selectPdf', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 PDF 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const inputPaths = result.filePaths;
    const firstPath = inputPaths[0];
    return {
      inputPath: firstPath,
      inputPaths,
      inputType: inputPaths.length === 1 ? 'file' : 'files',
      outputPath: path.dirname(firstPath)
    };
  });

  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择包含 PDF 的文件夹',
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const inputPath = result.filePaths[0];
    return {
      inputPath,
      inputPaths: [inputPath],
      inputType: 'folder',
      outputPath: path.join(inputPath, 'pdfoutput')
    };
  });

  ipcMain.handle('dialog:selectOutput', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择输出目录',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('config:get', () => configStore.get());
  ipcMain.handle('config:save', (_event, config) => configStore.save(config));

  ipcMain.handle('mail:test', async (_event, mailConfig) => {
    const mailService = new MailService(mailConfig);
    await mailService.verify();
    return { ok: true };
  });

  ipcMain.handle('task:run', async (event, options) => {
    const runner = new SplitTaskRunner({
      options,
      onProgress: (payload) => event.sender.send('task:progress', payload)
    });
    return runner.run();
  });

  ipcMain.handle('mail:sendFiles', async (event, payload) => {
    const mailService = new MailService(payload.mailConfig);
    const results = [];
    for (let index = 0; index < payload.files.length; index += 1) {
      const file = payload.files[index];
      event.sender.send('task:progress', {
        stage: 'email',
        message: `正在发送 ${path.basename(file)}`,
        emailIndex: index + 1,
        emailTotal: payload.files.length
      });
      try {
        await mailService.sendPdf({
          to: payload.recipientEmail,
          filePath: file
        });
        results.push({ filePath: file, ok: true });
      } catch (error) {
        results.push({ filePath: file, ok: false, error: error.message });
      }
    }
    return results;
  });

  ipcMain.handle('shell:showInFolder', (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });
}

app.whenReady().then(() => {
  configStore = new ConfigStore({
    userDataPath: app.getPath('userData'),
    portableConfigPath: path.join(path.dirname(app.getPath('exe')), 'config.json')
  });
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
