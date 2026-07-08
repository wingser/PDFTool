const path = require('node:path');
const nodemailer = require('nodemailer');

class MailService {
  constructor(config) {
    this.config = config;
    this.transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: Number(config.smtpPort),
      secure: Boolean(config.smtpSecure),
      auth: {
        user: config.smtpUser,
        pass: config.smtpPasswordOrAuthCode
      }
    });
  }

  async verify() {
    this.validateConfig();
    await this.transporter.verify();
  }

  async sendPdf({ to, filePath }) {
    this.validateConfig();
    if (!to) throw new Error('请填写目标邮箱');
    const fileName = path.basename(filePath);
    await this.transporter.sendMail({
      from: this.config.smtpUser,
      to,
      subject: fileName,
      text: `附件为 ${fileName}`,
      attachments: [
        {
          filename: fileName,
          path: filePath
        }
      ]
    });
  }

  validateConfig() {
    if (!this.config.smtpHost) throw new Error('请填写 SMTP 服务器');
    if (!this.config.smtpPort) throw new Error('请填写 SMTP 端口');
    if (!this.config.smtpUser) throw new Error('请填写发件邮箱');
    if (!this.config.smtpPasswordOrAuthCode) throw new Error('请填写邮箱授权码或密码');
  }
}

module.exports = {
  MailService
};
