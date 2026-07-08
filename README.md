# PDFTool

Windows 桌面端 PDF 分割工具。v1 支持选择单个 PDF 或文件夹，按完整页将 PDF 拆分到设定大小以内，并可选通过 SMTP 将拆分后的 PDF 逐封发送。

处理方式支持两种：

- PDF 按页分割：输出多个可独立阅读的 PDF。
- ZIP 分卷压缩：输出 `.z01/.z02/...` 和 `.zip`，收齐所有分卷后打开 `.zip` 解压，可还原为原始完整 PDF。

## 开发运行

```powershell
npm.cmd install
npm.cmd start
```

## 配置文件

程序读取配置时会先读取软件目录下的 `config.json` 作为预置默认值，再读取用户目录 `%APPDATA%\PDFTool\config.json` 作为用户修改覆盖值。保存配置时仍默认写入用户目录，不会覆盖软件目录里的预置配置。

用户目录配置里的邮箱密码使用系统加密，换电脑通常无法解密。软件目录下的便携配置可以使用跨机器可读字段：

```json
{
  "smtpHost": "smtp.qq.com",
  "smtpPort": 465,
  "smtpSecure": true,
  "smtpUser": "name@example.com",
  "portableSmtpPasswordOrAuthCode": "base64:邮箱授权码的base64内容",
  "defaultRecipientEmail": "receiver@example.com"
}
```

如果不想手动转 base64，也可以在软件目录配置里直接写 `"smtpPasswordOrAuthCode": "邮箱授权码"`，但这是明文保存。

## 测试

```powershell
npm.cmd test
```

## 打包绿色目录版 exe

```powershell
npm.cmd run package:win
```

产物输出到 `release/win-unpacked/PDFTool.exe`，整个 `win-unpacked` 文件夹可拷贝到其他 Windows 电脑运行。

## 打包单文件 portable exe

```powershell
npm.cmd run package:portable
```

该命令需要 electron-builder 下载 NSIS 辅助包，网络不可用时可能失败。
"# PDFTool" 
