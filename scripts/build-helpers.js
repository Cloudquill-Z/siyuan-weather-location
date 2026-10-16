const { copyFileSync, existsSync, chmodSync, mkdirSync, rmSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');

const root = join(__dirname, '..');

function buildMacHelper() {
  if (process.platform !== 'darwin') {
    return;
  }

  const swiftc = spawnSync('which', ['swiftc'], { encoding: 'utf8' });
  if (swiftc.status !== 0) {
    console.warn('[build-helpers] swiftc not found; macOS helper will not be rebuilt');
    return;
  }

  const source = join(root, 'helpers', 'macos', 'Sources', 'main.swift');
  const plist = join(root, 'helpers', 'macos', 'Info.plist');
  const appBundle = join(root, 'helpers', 'macos', 'SiYuanLocationHelper.app');
  const contentsDir = join(appBundle, 'Contents');
  const macosDir = join(contentsDir, 'MacOS');
  const output = join(macosDir, 'siyuan-location-helper');
  rmSync(appBundle, { recursive: true, force: true });
  mkdirSync(macosDir, { recursive: true });
  copyFileSync(plist, join(contentsDir, 'Info.plist'));

  const result = spawnSync('swiftc', [
    source,
    '-framework',
    'CoreLocation',
    '-o',
    output
  ], { stdio: 'inherit' });

  if (result.status !== 0) {
    throw new Error('Failed to build macOS location helper');
  }

  chmodSync(output, 0o755);
  const sign = spawnSync('codesign', ['--force', '--deep', '--sign', '-', appBundle], { stdio: 'inherit' });
  if (sign.status !== 0) {
    throw new Error('Failed to sign macOS location helper app bundle');
  }
}

buildMacHelper();

const windowsHelper = join(root, 'helpers', 'windows', 'SiyuanLocationHelper.ps1');
if (!existsSync(windowsHelper)) {
  throw new Error('Missing Windows location helper script');
}
