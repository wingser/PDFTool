const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');

const DEFAULT_CONFIG = {
  splitSizeMb: 40,
  processMode: 'zip',
  autoSend: true,
  lastInputPath: '',
  lastOutputPath: '',
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPasswordOrAuthCode: '',
  defaultRecipientEmail: ''
};

class ConfigStore {
  constructor({ userDataPath, portableConfigPath }) {
    this.configPath = path.join(userDataPath, 'config.json');
    this.portableConfigPath = portableConfigPath;
  }

  get() {
    try {
      const portableRaw = this.readConfigFile(this.portableConfigPath);
      const userRaw = this.readConfigFile(this.configPath);
      const raw = {
        ...(portableRaw || {}),
        ...(userRaw || {})
      };
      if (!portableRaw && !userRaw) return { ...DEFAULT_CONFIG };
      return {
        ...DEFAULT_CONFIG,
        ...raw,
        smtpPasswordOrAuthCode: this.resolvePassword({ portableRaw, userRaw })
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  readConfigFile(configPath) {
    if (!configPath || !fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  resolvePassword({ portableRaw, userRaw }) {
    if (userRaw && Object.hasOwn(userRaw, 'encryptedSmtpPasswordOrAuthCode')) {
      return this.decrypt(userRaw.encryptedSmtpPasswordOrAuthCode);
    }
    if (userRaw && Object.hasOwn(userRaw, 'smtpPasswordOrAuthCode')) {
      return String(userRaw.smtpPasswordOrAuthCode || '');
    }
    if (portableRaw) {
      const portablePassword = this.decodePortablePassword(portableRaw.portableSmtpPasswordOrAuthCode);
      if (portablePassword) return portablePassword;
      if (portableRaw.smtpPasswordOrAuthCode) return String(portableRaw.smtpPasswordOrAuthCode);
    }
    return '';
  }

  save(config) {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const existing = this.get();
    const next = {
      ...DEFAULT_CONFIG,
      ...existing,
      ...config
    };
    const payload = {
      splitSizeMb: Number(next.splitSizeMb) || DEFAULT_CONFIG.splitSizeMb,
      processMode: next.processMode === 'zip' ? 'zip' : 'pdf',
      autoSend: next.autoSend !== false,
      lastInputPath: next.lastInputPath || '',
      lastOutputPath: next.lastOutputPath || '',
      smtpHost: next.smtpHost || '',
      smtpPort: Number(next.smtpPort) || DEFAULT_CONFIG.smtpPort,
      smtpSecure: Boolean(next.smtpSecure),
      smtpUser: next.smtpUser || '',
      encryptedSmtpPasswordOrAuthCode: this.encrypt(next.smtpPasswordOrAuthCode || ''),
      defaultRecipientEmail: next.defaultRecipientEmail || ''
    };
    fs.writeFileSync(this.configPath, JSON.stringify(payload, null, 2), 'utf8');
    return this.get();
  }

  encrypt(value) {
    if (!value) return '';
    if (safeStorage.isEncryptionAvailable()) {
      return `safe:${safeStorage.encryptString(value).toString('base64')}`;
    }
    return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
  }

  decrypt(value) {
    if (!value) return '';
    try {
      if (value.startsWith('safe:') && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'));
      }
      if (value.startsWith('plain:')) {
        return Buffer.from(value.slice(6), 'base64').toString('utf8');
      }
    } catch {
      return '';
    }
    return '';
  }

  decodePortablePassword(value) {
    if (!value) return '';
    try {
      if (value.startsWith('base64:')) {
        return Buffer.from(value.slice(7), 'base64').toString('utf8');
      }
      return Buffer.from(value, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
}

module.exports = {
  ConfigStore,
  DEFAULT_CONFIG
};
