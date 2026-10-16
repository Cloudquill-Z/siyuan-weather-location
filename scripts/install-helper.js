const { W_OK, accessSync, chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync } = require('fs');
const { dirname, join } = require('path');
const { homedir } = require('os');

const root = join(__dirname, '..');
const macHelperSource = join(root, 'helpers', 'macos', 'SiYuanLocationHelper.app');
const windowsHelperSource = join(root, 'helpers', 'windows', 'SiyuanLocationHelper.ps1');

function installMacHelper() {
  if (!existsSync(macHelperSource)) {
    throw new Error(`Missing macOS helper app: ${macHelperSource}`);
  }

  const preferredTarget = join('/Applications', 'SiYuan Location Helper.app');
  const fallbackTarget = join(homedir(), 'Applications', 'SiYuan Location Helper.app');
  const target = canWriteApplicationsDir() ? preferredTarget : fallbackTarget;

  mkdirSync(dirname(target), { recursive: true });
  rmSync(target, { recursive: true, force: true });
  cpSync(macHelperSource, target, { recursive: true });
  chmodSync(join(target, 'Contents', 'MacOS', 'siyuan-location-helper'), 0o755);
  console.log(`[install-helper] Installed macOS helper to ${target}`);
}

function canWriteApplicationsDir() {
  try {
    mkdirSync('/Applications', { recursive: true });
    accessSync('/Applications', W_OK);
    return true;
  } catch {
    return false;
  }
}

function installWindowsHelper() {
  if (!existsSync(windowsHelperSource)) {
    throw new Error(`Missing Windows helper script: ${windowsHelperSource}`);
  }

  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const target = join(localAppData, 'Programs', 'SiYuanLocationHelper', 'SiyuanLocationHelper.ps1');
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(windowsHelperSource, target);
  console.log(`[install-helper] Installed Windows helper to ${target}`);
}

if (process.platform === 'darwin') {
  installMacHelper();
} else if (process.platform === 'win32') {
  installWindowsHelper();
} else {
  console.log(`[install-helper] No native location helper is available for ${process.platform}`);
}
