const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function loadWithElectronMock(request, parent, isMain) {
  if (request === 'electron') {
    return {
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (value) => Buffer.from(value, 'utf8'),
        decryptString: (buffer) => buffer.toString('utf8')
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { ConfigStore } = require('../src/main/configStore');

test('portable config seeds defaults and user config overrides later changes', async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdftool-config-'));
  const userDataPath = path.join(tempDir, 'user');
  const portableConfigPath = path.join(tempDir, 'portable', 'config.json');
  await fsp.mkdir(path.dirname(portableConfigPath), { recursive: true });
  await fsp.mkdir(userDataPath, { recursive: true });

  fs.writeFileSync(
    path.join(userDataPath, 'config.json'),
    JSON.stringify({ splitSizeMb: 88, smtpUser: 'user-config@example.com', smtpPasswordOrAuthCode: '' }),
    'utf8'
  );
  fs.writeFileSync(
    portableConfigPath,
    JSON.stringify({
      smtpUser: 'portable@example.com',
      splitSizeMb: 40,
      processMode: 'zip',
      portableSmtpPasswordOrAuthCode: `base64:${Buffer.from('portable-pass', 'utf8').toString('base64')}`
    }),
    'utf8'
  );

  const store = new ConfigStore({ userDataPath, portableConfigPath });
  const config = store.get();

  assert.equal(config.smtpUser, 'user-config@example.com');
  assert.equal(config.splitSizeMb, 88);
  assert.equal(config.processMode, 'zip');
  assert.equal(config.smtpPasswordOrAuthCode, '');
});

test('portable config supports portable password when user config has no password', async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdftool-config-'));
  const userDataPath = path.join(tempDir, 'user');
  const portableConfigPath = path.join(tempDir, 'portable', 'config.json');
  await fsp.mkdir(path.dirname(portableConfigPath), { recursive: true });
  await fsp.mkdir(userDataPath, { recursive: true });

  fs.writeFileSync(path.join(userDataPath, 'config.json'), JSON.stringify({ splitSizeMb: 88 }), 'utf8');
  fs.writeFileSync(
    portableConfigPath,
    JSON.stringify({
      smtpUser: 'portable@example.com',
      portableSmtpPasswordOrAuthCode: `base64:${Buffer.from('portable-pass', 'utf8').toString('base64')}`
    }),
    'utf8'
  );

  const store = new ConfigStore({ userDataPath, portableConfigPath });
  const config = store.get();

  assert.equal(config.smtpUser, 'portable@example.com');
  assert.equal(config.splitSizeMb, 88);
  assert.equal(config.smtpPasswordOrAuthCode, 'portable-pass');
});

test('save still writes to user config path when portable config exists', async () => {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdftool-config-'));
  const userDataPath = path.join(tempDir, 'user');
  const portableConfigPath = path.join(tempDir, 'portable', 'config.json');
  await fsp.mkdir(path.dirname(portableConfigPath), { recursive: true });
  fs.writeFileSync(portableConfigPath, JSON.stringify({ smtpUser: 'portable@example.com' }), 'utf8');

  const store = new ConfigStore({ userDataPath, portableConfigPath });
  store.save({ smtpUser: 'saved@example.com', smtpPasswordOrAuthCode: 'saved-pass' });

  assert.ok(fs.existsSync(path.join(userDataPath, 'config.json')));
  const portableRaw = JSON.parse(fs.readFileSync(portableConfigPath, 'utf8'));
  assert.equal(portableRaw.smtpUser, 'portable@example.com');
});
