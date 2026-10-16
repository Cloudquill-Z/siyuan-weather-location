import {
  ensureNativeLocationServiceDetailed,
  getNativeLocationServiceDiagnostics,
  resolveNativeLocationPluginBasePath,
  shutdownNativeLocationService
} from '../src/nativeLocation';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const pluginBasePath = process.cwd();
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siyuan-workspace-'));
  const expectedPluginPath = path.join(workspaceDir, 'data', 'plugins', 'siyuan-weather-location');
  fs.mkdirSync(expectedPluginPath, { recursive: true });
  fs.writeFileSync(path.join(expectedPluginPath, 'plugin.json'), '{"name":"siyuan-weather-location"}');

  assert(resolveNativeLocationPluginBasePath(
    require,
    '/Applications/SiYuan.app/Contents/Resources/electron.asar/renderer',
    workspaceDir
  ) === expectedPluginPath,
    'expected workspaceDir to win over Electron renderer dirname');

  await shutdownNativeLocationService();
  await waitForStopped();

  const before = await getNativeLocationServiceDiagnostics(pluginBasePath);
  assert(before.status !== 'running', 'expected helper to start from a non-running state');
  assert(before.pluginBasePath === pluginBasePath, 'expected diagnostics to include plugin base path');
  assert(before.runtime.hasNodeRequire === true, 'expected diagnostics to detect Node require in tests');
  assert(before.paths?.helperBinary?.endsWith('siyuan-location-helper'), 'expected diagnostics to include helper binary path');

  const result = await ensureNativeLocationServiceDetailed(pluginBasePath);
  assert(result.ok === true, 'expected detailed helper start to succeed');
  assert(result.status === 'running', 'expected detailed helper start to report running');
  assert(result.method === 'direct-binary', 'expected direct binary start method');
  assert(result.stage === 'healthy', 'expected healthy final stage');
  assert(result.paths?.logFile?.includes('siyuan-weather-location-helper'), 'expected helper log path in diagnostics');
  assert(result.logTail?.includes('listener'), 'expected helper listener state in log tail');

  const after = await getNativeLocationServiceDiagnostics(pluginBasePath);
  assert(after.status === 'running', 'expected diagnostics to report running helper');
  assert(after.lastResult?.ok === true, 'expected diagnostics to remember last successful start');

  await shutdownNativeLocationService();
}

async function waitForStopped() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3000) {
    const diagnostics = await getNativeLocationServiceDiagnostics(process.cwd());
    if (diagnostics.status === 'stopped') {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
