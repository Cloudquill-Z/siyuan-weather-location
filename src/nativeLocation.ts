export interface NativeCoordinates {
  lat: number;
  lon: number;
  accuracy?: number;
  timestamp?: number;
  source: string;
}

interface NativeLocationPayload {
  ok?: boolean;
  lat?: number;
  lon?: number;
  accuracy?: number;
  timestamp?: number;
  source?: string;
  error?: string;
  message?: string;
}

interface NodeRequire {
  (id: string): any;
}

export type NativeLocationHelperStatus = 'running' | 'stopped' | 'stale';

export type NativeLocationHelperStartStage =
  | 'already-running'
  | 'missing-runtime'
  | 'missing-base-path'
  | 'missing-helper'
  | 'unsupported-platform'
  | 'spawn-failed'
  | 'shell-failed'
  | 'health-timeout'
  | 'healthy'
  | 'cleanup-failed';

export type NativeLocationHelperStartMethod =
  | 'none'
  | 'already-running'
  | 'direct-binary'
  | 'electron-shell'
  | 'powershell';

export interface NativeLocationHelperRuntime {
  hasNodeRequire: boolean;
  requireSource: string;
  platform?: string;
}

export interface NativeLocationHelperPaths {
  helperApp?: string;
  helperBinary?: string;
  helperScript?: string;
  logFile?: string;
  installDir?: string;
}

export interface NativeLocationHelperProcess {
  pid: number;
  ppid?: number;
  stat?: string;
  command: string;
}

export interface NativeLocationHelperStartResult {
  ok: boolean;
  status: NativeLocationHelperStatus;
  stage: NativeLocationHelperStartStage;
  method: NativeLocationHelperStartMethod;
  message: string;
  pluginBasePath?: string | null;
  runtime: NativeLocationHelperRuntime;
  paths?: NativeLocationHelperPaths;
  staleProcesses?: NativeLocationHelperProcess[];
  error?: string;
  logTail?: string;
}

export interface NativeLocationHelperDiagnostics {
  status: NativeLocationHelperStatus;
  pluginBasePath?: string | null;
  runtime: NativeLocationHelperRuntime;
  paths?: NativeLocationHelperPaths;
  staleProcesses?: NativeLocationHelperProcess[];
  lastResult?: NativeLocationHelperStartResult;
}

export interface NativeLocationHelperCleanupResult {
  ok: boolean;
  killed: NativeLocationHelperProcess[];
  message: string;
  error?: string;
}

const HELPER_TIMEOUT_SECONDS = 18;
const HELPER_TIMEOUT_MS = HELPER_TIMEOUT_SECONDS * 1000;
const HELPER_SERVICE_PORT = 47821;
const HELPER_SERVICE_URL = `http://127.0.0.1:${HELPER_SERVICE_PORT}`;
const MACOS_OUTPUT_FILE = 'siyuan-weather-location-native-location.json';
const HELPER_LOG_FILE = `siyuan-weather-location-helper-${HELPER_SERVICE_PORT}.log`;
const PLUGIN_NAME = 'siyuan-weather-location';
const MACOS_HELPER_APP_NAME = 'SiYuan Location Helper.app';
const WINDOWS_HELPER_DIR_NAME = 'SiYuanLocationHelper';
const WINDOWS_HELPER_SCRIPT_NAME = 'SiyuanLocationHelper.ps1';

let serviceStartAttempted = false;
let lastStartResult: NativeLocationHelperStartResult | undefined;

function isValidCoordinate(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

export function parseNativeLocationPayload(output: string): NativeCoordinates {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error('原生定位助手没有返回数据');
  }

  let payload: NativeLocationPayload;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new Error('原生定位助手返回了无法解析的数据');
  }

  if (payload.ok === false) {
    throw new Error(payload.message || payload.error || '原生定位助手定位失败');
  }

  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isValidCoordinate(lat, lon)) {
    throw new Error('原生定位助手返回了无效坐标');
  }

  const accuracy = payload.accuracy === undefined ? undefined : Number(payload.accuracy);
  const timestamp = payload.timestamp === undefined ? Date.now() : Number(payload.timestamp);

  return {
    lat,
    lon,
    accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    source: payload.source || 'native'
  };
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store'
    });
    const text = await response.text();
    if (!response.ok) {
      return text;
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestHelperService(path: string, timeoutMs: number): Promise<string> {
  return fetchTextWithTimeout(`${HELPER_SERVICE_URL}${path}`, timeoutMs);
}

async function getCoordinatesFromService(): Promise<NativeCoordinates | null> {
  try {
    const output = await requestHelperService(
      `/location?timeout=${HELPER_TIMEOUT_SECONDS}`,
      HELPER_TIMEOUT_MS + 2500
    );
    return parseNativeLocationPayload(output);
  } catch (error) {
    console.warn('[NativeLocation] 本地定位助手服务不可用:', error);
    return null;
  }
}

async function isHelperServiceHealthy(): Promise<boolean> {
  try {
    const output = await requestHelperService('/health', 1200);
    const payload = JSON.parse(output) as NativeLocationPayload;
    return payload.ok === true;
  } catch {
    return false;
  }
}

export async function getNativeLocationServiceStatus(): Promise<'running' | 'stopped'> {
  return await isHelperServiceHealthy() ? 'running' : 'stopped';
}

export async function getNativeLocationServiceDiagnostics(pluginBasePath?: string): Promise<NativeLocationHelperDiagnostics> {
  const { nodeRequire, source } = resolveNodeRequire();
  const runtime = getRuntimeInfo(nodeRequire, source);
  const basePath = nodeRequire ? getPluginBasePath(nodeRequire, pluginBasePath) : pluginBasePath || null;
  const paths = nodeRequire ? getHelperPaths(nodeRequire, basePath) : undefined;
  const { status, staleProcesses } = await getDetailedStatus(nodeRequire);

  return {
    status,
    pluginBasePath: basePath,
    runtime,
    paths,
    staleProcesses,
    lastResult: lastStartResult
  };
}

function resolveNodeRequire(): { nodeRequire: NodeRequire | null; source: string } {
  const globalWindow = typeof window !== 'undefined' ? (window as any) : undefined;
  if (globalWindow?.require) {
    return {
      nodeRequire: globalWindow.require.bind(globalWindow),
      source: 'window.require'
    };
  }

  try {
    if (typeof require === 'function') {
      return {
        nodeRequire: require,
        source: 'require'
      };
    }
  } catch {
    // Fall back to eval below for runtimes that expose require differently.
  }

  try {
    return {
      nodeRequire: (0, eval)('require') as NodeRequire,
      source: 'eval.require'
    };
  } catch {
    return {
      nodeRequire: null,
      source: 'unavailable'
    };
  }
}

function getNodeRequire(): NodeRequire | null {
  return resolveNodeRequire().nodeRequire;
}

function getRuntimeInfo(nodeRequire: NodeRequire | null, requireSource: string): NativeLocationHelperRuntime {
  let platform: string | undefined;
  if (nodeRequire) {
    try {
      platform = nodeRequire('os').platform();
    } catch {
      platform = undefined;
    }
  }

  return {
    hasNodeRequire: Boolean(nodeRequire),
    requireSource,
    platform
  };
}

export function resolveNativeLocationPluginBasePath(
  nodeRequire: NodeRequire,
  dirname?: string,
  workspaceDir?: string,
  explicitBasePath?: string
): string | null {
  const path = nodeRequire('path');
  const fs = nodeRequire('fs');
  const candidates = [
    explicitBasePath,
    workspaceDir ? path.join(workspaceDir, 'data', 'plugins', PLUGIN_NAME) : undefined,
    dirname && !dirname.includes('electron.asar') ? dirname : undefined
  ].filter((candidate): candidate is string => Boolean(candidate));

  const existing = candidates.find(candidate => {
    try {
      return fs.existsSync(path.join(candidate, 'plugin.json')) ||
        fs.existsSync(path.join(candidate, 'helpers'));
    } catch {
      return false;
    }
  });

  return existing || candidates[0] || null;
}

function getSiyuanWorkspaceDir(): string | undefined {
  const globalWindow = typeof window !== 'undefined' ? (window as any) : undefined;
  return globalWindow?.siyuan?.config?.system?.workspaceDir;
}

function getPluginBasePath(nodeRequire: NodeRequire, explicitBasePath?: string): string | null {
  if (explicitBasePath) {
    return explicitBasePath;
  }

  const workspaceDir = getSiyuanWorkspaceDir();
  let currentDir: string | undefined;

  try {
    if (typeof __dirname !== 'undefined') {
      currentDir = __dirname;
    }
  } catch {
    // Ignore and try Electron app path below.
  }

  const resolved = resolveNativeLocationPluginBasePath(
    nodeRequire,
    currentDir,
    workspaceDir,
    explicitBasePath
  );
  if (resolved) {
    return resolved;
  }

  try {
    const electron = nodeRequire('electron');
    const path = nodeRequire('path');
    const app = electron?.remote?.app || electron?.app;
    const dataPath = app?.getPath?.('documents');
    if (dataPath) {
      return resolveNativeLocationPluginBasePath(
        nodeRequire,
        undefined,
        path.join(dataPath, 'SiYuan'),
        explicitBasePath
      );
    }
  } catch {
    // Not running in a desktop Electron environment.
  }

  return null;
}

function getHelperPaths(nodeRequire: NodeRequire, basePath: string | null): NativeLocationHelperPaths | undefined {
  const os = nodeRequire('os');
  const path = nodeRequire('path');
  const platform = os.platform();
  const logFile = path.join(os.tmpdir(), HELPER_LOG_FILE);

  if (platform === 'darwin') {
    const helperApp = resolveInstalledMacHelperApp(nodeRequire);
    return {
      helperApp,
      helperBinary: path.join(helperApp, 'Contents', 'MacOS', 'siyuan-location-helper'),
      installDir: path.dirname(helperApp),
      logFile
    };
  }

  if (platform === 'win32') {
    const helperScript = resolveInstalledWindowsHelperScript(nodeRequire);
    return {
      helperScript,
      installDir: path.dirname(helperScript),
      logFile
    };
  }

  return {
    logFile
  };
}

function resolveInstalledMacHelperApp(nodeRequire: NodeRequire): string {
  const os = nodeRequire('os');
  const path = nodeRequire('path');
  const fs = nodeRequire('fs');
  const process = nodeRequire('process');
  const overridePath = process?.env?.SIYUAN_LOCATION_HELPER_APP;
  const candidates = [
    overridePath,
    path.join('/Applications', MACOS_HELPER_APP_NAME),
    path.join(os.homedir(), 'Applications', MACOS_HELPER_APP_NAME)
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find(candidate => {
    try {
      return fs.existsSync(path.join(candidate, 'Contents', 'MacOS', 'siyuan-location-helper'));
    } catch {
      return false;
    }
  }) || candidates[1];
}

function resolveInstalledWindowsHelperScript(nodeRequire: NodeRequire): string {
  const os = nodeRequire('os');
  const path = nodeRequire('path');
  const process = nodeRequire('process');
  const overridePath = process?.env?.SIYUAN_LOCATION_HELPER_SCRIPT;
  if (overridePath) {
    return overridePath;
  }

  const localAppData = process?.env?.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Programs', WINDOWS_HELPER_DIR_NAME, WINDOWS_HELPER_SCRIPT_NAME);
}

function readLogTail(nodeRequire: NodeRequire, logFile?: string, maxChars = 3000): string | undefined {
  if (!logFile) {
    return undefined;
  }

  try {
    const fs = nodeRequire('fs');
    if (!fs.existsSync(logFile)) {
      return undefined;
    }
    const content = fs.readFileSync(logFile, 'utf8');
    return content.slice(-maxChars).trim() || undefined;
  } catch {
    return undefined;
  }
}

function appendHelperLog(nodeRequire: NodeRequire, logFile: string, message: string) {
  try {
    const fs = nodeRequire('fs');
    fs.appendFileSync(logFile, `[plugin ${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Logging must not block helper startup.
  }
}

function getHelperProcesses(nodeRequire: NodeRequire): NativeLocationHelperProcess[] {
  try {
    const childProcess = nodeRequire('child_process');
    const output = childProcess.execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,stat=,command='], {
      encoding: 'utf8',
      timeout: 1500
    }) as string;

    return output
      .split('\n')
      .map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map(match => ({
        pid: Number(match[1]),
        ppid: Number(match[2]),
        stat: match[3],
        command: match[4]
      }))
      .filter(processInfo =>
        Number.isFinite(processInfo.pid) &&
        processInfo.command.includes('siyuan-location-helper') &&
        processInfo.command.includes(`--port ${HELPER_SERVICE_PORT}`)
      );
  } catch {
    return [];
  }
}

async function getDetailedStatus(nodeRequire: NodeRequire | null): Promise<{
  status: NativeLocationHelperStatus;
  staleProcesses: NativeLocationHelperProcess[];
}> {
  if (await isHelperServiceHealthy()) {
    return {
      status: 'running',
      staleProcesses: []
    };
  }

  const staleProcesses = nodeRequire ? getHelperProcesses(nodeRequire) : [];
  return {
    status: staleProcesses.length > 0 ? 'stale' : 'stopped',
    staleProcesses
  };
}

async function waitForSpawnError(child: any, timeoutMs = 200): Promise<Error | null> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(error);
    };

    child.once?.('error', finish);
    setTimeout(() => finish(null), timeoutMs);
  });
}

async function startHelperServiceDetailed(
  nodeRequire: NodeRequire,
  runtime: NativeLocationHelperRuntime,
  explicitBasePath?: string
): Promise<NativeLocationHelperStartResult> {
  if (serviceStartAttempted) {
    const { status, staleProcesses } = await getDetailedStatus(nodeRequire);
    return {
      ok: false,
      status,
      stage: 'health-timeout',
      method: 'none',
      message: '定位辅助器已经尝试启动过，但服务还没有通过健康检查',
      runtime,
      staleProcesses
    };
  }
  serviceStartAttempted = true;

  const os = nodeRequire('os');
  const path = nodeRequire('path');
  const fs = nodeRequire('fs');
  const childProcess = nodeRequire('child_process');
  const platform = os.platform();
  const basePath = getPluginBasePath(nodeRequire, explicitBasePath);
  const paths = getHelperPaths(nodeRequire, basePath);

  if (platform === 'darwin') {
    const helperApp = paths?.helperApp || resolveInstalledMacHelperApp(nodeRequire);
    const helperBinary = paths?.helperBinary || path.join(helperApp, 'Contents', 'MacOS', 'siyuan-location-helper');
    const logFile = paths?.logFile;
    if (!fs.existsSync(helperApp) || !fs.existsSync(helperBinary)) {
      console.warn('[NativeLocation] macOS 原生定位助手不存在:', helperBinary);
      const { status, staleProcesses } = await getDetailedStatus(nodeRequire);
      return {
        ok: false,
        status,
        stage: 'missing-helper',
        method: 'none',
        message: 'macOS 定位辅助器文件不存在',
        pluginBasePath: basePath,
        runtime,
        paths,
        staleProcesses
      };
    }

    try {
      if (logFile) {
        appendHelperLog(nodeRequire, logFile, `starting ${helperBinary} --server --port ${HELPER_SERVICE_PORT}`);
      }
      const logFd = logFile ? fs.openSync(logFile, 'a') : 'ignore';
      const child = childProcess.spawn(helperBinary, [
        '--server',
        '--port',
        String(HELPER_SERVICE_PORT)
      ], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        windowsHide: true
      });
      const spawnError = await waitForSpawnError(child);
      child.unref();
      if (typeof logFd === 'number') {
        fs.closeSync(logFd);
      }
      if (spawnError) {
        throw spawnError;
      }
    } catch (error) {
      if (!openHelperAppWithElectronShell(nodeRequire, helperApp)) {
        console.warn('[NativeLocation] 无法启动 macOS 本地定位助手服务:', error);
        const { status, staleProcesses } = await getDetailedStatus(nodeRequire);
        return {
          ok: false,
          status,
          stage: 'spawn-failed',
          method: 'direct-binary',
          message: '无法启动 macOS 定位辅助器进程',
          pluginBasePath: basePath,
          runtime,
          paths,
          staleProcesses,
          error: error instanceof Error ? error.message : String(error),
          logTail: readLogTail(nodeRequire, logFile)
        };
      }

      const healthy = await waitForHelperService();
      const { status, staleProcesses } = await getDetailedStatus(nodeRequire);
      return {
        ok: healthy,
        status,
        stage: healthy ? 'healthy' : 'health-timeout',
        method: 'electron-shell',
        message: healthy ? '定位辅助器已通过应用方式启动' : '已通过应用方式启动定位辅助器，但健康检查未通过',
        pluginBasePath: basePath,
        runtime,
        paths,
        staleProcesses,
        error: healthy ? undefined : error instanceof Error ? error.message : String(error),
        logTail: readLogTail(nodeRequire, logFile)
      };
    }

    console.log('[NativeLocation] 已尝试启动 macOS 本地定位助手服务');
    const healthy = await waitForHelperService();
    const { status, staleProcesses } = await getDetailedStatus(nodeRequire);
    return {
      ok: healthy,
      status,
      stage: healthy ? 'healthy' : 'health-timeout',
      method: 'direct-binary',
      message: healthy ? '定位辅助器已启动' : '已启动定位辅助器进程，但健康检查未通过',
      pluginBasePath: basePath,
      runtime,
      paths,
      staleProcesses,
      logTail: readLogTail(nodeRequire, logFile)
    };
  }

  if (platform === 'win32') {
    const helperPath = paths?.helperScript || resolveInstalledWindowsHelperScript(nodeRequire);
    if (!fs.existsSync(helperPath)) {
      console.warn('[NativeLocation] Windows 原生定位助手不存在:', helperPath);
      const { status, staleProcesses } = await getDetailedStatus(nodeRequire);
      return {
        ok: false,
        status,
        stage: 'missing-helper',
        method: 'none',
        message: 'Windows 定位辅助器文件不存在',
        pluginBasePath: basePath,
        runtime,
        paths,
        staleProcesses
      };
    }

    childProcess.spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      helperPath,
      '-Server',
      '-Port',
      String(HELPER_SERVICE_PORT),
      '-TimeoutSeconds',
      String(HELPER_TIMEOUT_SECONDS)
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();

    console.log('[NativeLocation] 已尝试启动 Windows 本地定位助手服务');
    const healthy = await waitForHelperService();
    const { status, staleProcesses } = await getDetailedStatus(nodeRequire);
    return {
      ok: healthy,
      status,
      stage: healthy ? 'healthy' : 'health-timeout',
      method: 'powershell',
      message: healthy ? '定位辅助器已启动' : '已启动定位辅助器进程，但健康检查未通过',
      pluginBasePath: basePath,
      runtime,
      paths,
      staleProcesses,
      logTail: readLogTail(nodeRequire, paths?.logFile)
    };
  }

  return {
    ok: false,
    status: 'stopped',
    stage: 'unsupported-platform',
    method: 'none',
    message: `当前平台暂不支持定位辅助器: ${platform}`,
    pluginBasePath: basePath,
    runtime,
    paths
  };
}

function openHelperAppWithElectronShell(nodeRequire: NodeRequire, helperApp: string): boolean {
  try {
    const electron = nodeRequire('electron');
    const shell = electron?.shell || electron?.remote?.shell;
    if (!shell?.openPath) {
      return false;
    }

    void shell.openPath(helperApp);
    console.log('[NativeLocation] 已通过 Electron shell 尝试启动 macOS 本地定位助手');
    return true;
  } catch (error) {
    console.warn('[NativeLocation] Electron shell 启动定位助手失败:', error);
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHelperService(timeoutMs: number = 5000): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHelperServiceHealthy()) {
      return true;
    }
    await delay(250);
  }
  return false;
}

export async function ensureNativeLocationService(pluginBasePath?: string): Promise<boolean> {
  if (await isHelperServiceHealthy()) {
    console.log('[NativeLocation] 本地定位助手服务健康检查通过');
    return true;
  }

  const result = await ensureNativeLocationServiceDetailed(pluginBasePath);
  return result.ok;
}

export async function ensureNativeLocationServiceDetailed(pluginBasePath?: string): Promise<NativeLocationHelperStartResult> {
  if (await isHelperServiceHealthy()) {
    const { nodeRequire, source } = resolveNodeRequire();
    const runtime = getRuntimeInfo(nodeRequire, source);
    const basePath = nodeRequire ? getPluginBasePath(nodeRequire, pluginBasePath) : pluginBasePath || null;
    const result: NativeLocationHelperStartResult = {
      ok: true,
      status: 'running',
      stage: 'already-running',
      method: 'already-running',
      message: '定位辅助器已经在运行',
      pluginBasePath: basePath,
      runtime,
      paths: nodeRequire ? getHelperPaths(nodeRequire, basePath) : undefined
    };
    lastStartResult = result;
    console.log('[NativeLocation] 本地定位助手服务健康检查通过');
    return result;
  }

  const { nodeRequire, source } = resolveNodeRequire();
  const runtime = getRuntimeInfo(nodeRequire, source);
  if (!nodeRequire) {
    console.warn('[NativeLocation] 当前环境没有 Node require，不能自动启动原生定位助手');
    const result: NativeLocationHelperStartResult = {
      ok: false,
      status: 'stopped',
      stage: 'missing-runtime',
      method: 'none',
      message: '当前环境没有 Node require，不能自动启动定位辅助器',
      pluginBasePath: pluginBasePath || null,
      runtime
    };
    lastStartResult = result;
    return result;
  }

  serviceStartAttempted = false;
  const result = await startHelperServiceDetailed(nodeRequire, runtime, pluginBasePath);
  lastStartResult = result;
  if (result.ok) {
    console.log('[NativeLocation] 本地定位助手服务已启动');
  } else {
    serviceStartAttempted = false;
    console.warn('[NativeLocation] 定位辅助器启动失败:', result);
  }
  return result;
}

async function runOneShotHelper(nodeRequire: NodeRequire, explicitBasePath?: string): Promise<NativeCoordinates | null> {
  const os = nodeRequire('os');
  const path = nodeRequire('path');
  const fs = nodeRequire('fs');
  const childProcess = nodeRequire('child_process');
  const platform = os.platform();
  const basePath = getPluginBasePath(nodeRequire, explicitBasePath);
  const paths = getHelperPaths(nodeRequire, basePath);

  let file = '';
  let args: string[] = [];
  let outputPath: string | undefined;

  if (platform === 'darwin') {
    const helperApp = paths?.helperApp || resolveInstalledMacHelperApp(nodeRequire);
    const helperBinary = paths?.helperBinary || path.join(helperApp, 'Contents', 'MacOS', 'siyuan-location-helper');
    if (!fs.existsSync(helperApp) || !fs.existsSync(helperBinary)) {
      return null;
    }

    const outputFile = path.join(os.tmpdir(), MACOS_OUTPUT_FILE);
    outputPath = outputFile;
    try {
      fs.rmSync(outputFile, { force: true });
    } catch {
      // Ignore stale output cleanup failures.
    }

    file = helperBinary;
    args = [
      '--timeout',
      String(HELPER_TIMEOUT_SECONDS),
      '--output',
      outputFile
    ];
  } else if (platform === 'win32') {
    const helperPath = paths?.helperScript || resolveInstalledWindowsHelperScript(nodeRequire);
    if (!fs.existsSync(helperPath)) {
      return null;
    }

    file = 'powershell.exe';
    args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helperPath,
      '-TimeoutSeconds',
      String(HELPER_TIMEOUT_SECONDS)
    ];
  } else {
    return null;
  }

  return new Promise((resolve, reject) => {
    childProcess.execFile(
      file,
      args,
      {
        timeout: HELPER_TIMEOUT_MS + 2000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
      },
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          const detail = stderr?.trim() || error.message;
          reject(new Error(`原生定位助手执行失败: ${detail}`));
          return;
        }

        try {
          const output = outputPath ? fs.readFileSync(outputPath, 'utf8') : stdout;
          resolve(parseNativeLocationPayload(output));
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

export async function getNativeCoordinates(pluginBasePath?: string): Promise<NativeCoordinates | null> {
  const serviceLocation = await getCoordinatesFromService();
  if (serviceLocation) {
    return serviceLocation;
  }

  if (await ensureNativeLocationService(pluginBasePath)) {
    const startedServiceLocation = await getCoordinatesFromService();
    if (startedServiceLocation) {
      return startedServiceLocation;
    }
  }

  const nodeRequire = getNodeRequire();
  if (!nodeRequire) {
    console.warn('[NativeLocation] 当前环境没有 Node require，不能自动启动原生定位助手');
    return null;
  }

  try {
    return await runOneShotHelper(nodeRequire, pluginBasePath);
  } catch (error) {
    console.warn('[NativeLocation] 原生定位助手一次性定位失败:', error);
    return null;
  }
}

export async function shutdownNativeLocationService(): Promise<boolean> {
  serviceStartAttempted = false;

  try {
    const output = await requestHelperService('/shutdown', 1500);
    const payload = JSON.parse(output) as NativeLocationPayload;
    return payload.ok === true;
  } catch (error) {
    console.log('[NativeLocation] 本地定位助手服务未运行或已经关闭:', error);
    return false;
  }
}

export async function cleanupStaleNativeLocationHelpers(pluginBasePath?: string): Promise<NativeLocationHelperCleanupResult> {
  const { nodeRequire } = resolveNodeRequire();
  if (!nodeRequire) {
    return {
      ok: false,
      killed: [],
      message: '当前环境没有 Node require，不能清理定位辅助器进程'
    };
  }

  if (await isHelperServiceHealthy()) {
    await shutdownNativeLocationService();
    await waitForHelperServiceToStop();
  }

  const processes = getHelperProcesses(nodeRequire);
  const path = nodeRequire('path');
  const basePath = getPluginBasePath(nodeRequire, pluginBasePath);
  const normalizedBasePath = basePath ? path.resolve(basePath) : '';
  const helperPaths = getHelperPaths(nodeRequire, basePath);
  const helperInstallDir = helperPaths?.installDir ? path.resolve(helperPaths.installDir) : '';
  const targetProcesses = processes.filter(processInfo => {
    if (!normalizedBasePath && !helperInstallDir) {
      return true;
    }
    return (helperInstallDir ? processInfo.command.includes(helperInstallDir) : false) ||
      (normalizedBasePath ? processInfo.command.includes(normalizedBasePath) : false) ||
      processInfo.command.includes('/siyuan-location-helper --server') ||
      processInfo.command.includes('\\siyuan-location-helper --server');
  });

  const killed: NativeLocationHelperProcess[] = [];
  try {
    for (const processInfo of targetProcesses) {
      nodeRequire('process').kill(processInfo.pid, 'SIGTERM');
      killed.push(processInfo);
    }
    await waitForHelperProcessesToExit(nodeRequire);
    serviceStartAttempted = false;
    return {
      ok: true,
      killed,
      message: killed.length > 0 ? '已清理卡住的定位辅助器进程' : '没有发现需要清理的定位辅助器进程'
    };
  } catch (error) {
    return {
      ok: false,
      killed,
      message: '清理定位辅助器进程失败',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function waitForHelperServiceToStop(timeoutMs = 2500): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!await isHelperServiceHealthy()) {
      return true;
    }
    await delay(100);
  }
  return false;
}

async function waitForHelperProcessesToExit(nodeRequire: NodeRequire, timeoutMs = 2500): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (getHelperProcesses(nodeRequire).length === 0) {
      return true;
    }
    await delay(100);
  }
  return false;
}
