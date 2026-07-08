const { execFileSync } = require('node:child_process');

if (process.platform !== 'win32') {
  process.exit(0);
}

try {
  execFileSync('taskkill.exe', ['/IM', 'PDFTool.exe', '/F', '/T'], {
    stdio: 'ignore',
    windowsHide: true
  });
  console.log('Stopped running PDFTool.exe instances.');
} catch {
  console.log('No running PDFTool.exe instances found.');
}
