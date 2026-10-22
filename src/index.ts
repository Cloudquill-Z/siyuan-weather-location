import { Plugin, showMessage, Dialog } from 'siyuan';
import { WeatherService, WeatherData } from './weather';
import { LocationService, LocationData } from './location';
import {
  NEWLINE_CHIP,
  OUTPUT_FIELDS,
  OutputConfig,
  createDefaultOutputConfig,
  getFieldMeta,
  normalizeOutputConfig,
  renderOutputConfig
} from './outputConfig';
import { removeSlashTrigger, splitBlockIAL, withBlockIAL } from './slashTrigger';

const STORAGE_NAME = 'weather-location-config';
const MAX_FAVORITE_CITIES = 5;
const AMAP_KEY_MASK = '********';

interface FavoriteCity {
  name: string;
  lat: number;
  lon: number;
  address?: string;
}

// 地点搜索结果接口
interface CitySearchResult {
  name: string;
  lat: number;
  lon: number;
  displayName: string;
  address: string;
  badge?: string; // POI 类型徽标，如「小区」「写字楼」
}

interface PluginConfig {
  amapKey: string;
  favoriteCities: FavoriteCity[];
  outputConfig: OutputConfig;
}

const DEFAULT_CONFIG: PluginConfig = {
  amapKey: '',
  favoriteCities: [],
  outputConfig: createDefaultOutputConfig()
};

class WeatherLocationPlugin extends Plugin {
  private config!: PluginConfig;
  private weatherService!: WeatherService;
  private locationService!: LocationService;
  private slashCommandsRegistered: boolean = false; // 标记斜杠命令是否已注册
  private lastNativeHelperDiagnosticsText = '';

  async onload() {
    console.log('[WeatherLocation] Plugin loading...');

    try {
      // 加载配置
      await this.loadConfig();
      console.log('[WeatherLocation] Config loaded:', this.config);

      // 初始化服务
      this.weatherService = new WeatherService(this.config);
      this.locationService = new LocationService(this.config, this.getPluginBasePath());

      // 注册命令
      this.registerCommand();

      // 注册菜单
      this.registerMenu();

      // 注册斜杠命令
      this.registerSlashCommand();

      // 预加载位置和天气数据（后台异步执行）
      this.prefetchData();

      console.log('[WeatherLocation] Plugin loaded successfully');
    } catch (error) {
      console.error('[WeatherLocation] Error loading plugin:', error);
      showMessage('天气位置插件加载失败: ' + (error as Error).message);
    }
  }

  async onunload() {
    console.log('[WeatherLocation] Plugin unloading...');
    if (this.locationService) {
      await this.locationService.shutdownNativeHelper();
    }
  }

  private async loadConfig() {
    try {
      const stored = await this.loadData(STORAGE_NAME);
      this.config = this.normalizeConfig(stored);
    } catch (error) {
      console.error('[WeatherLocation] Error loading config:', error);
      this.config = this.normalizeConfig({});
    }
  }

  private normalizeConfig(stored: Partial<PluginConfig> | null | undefined): PluginConfig {
    const raw = { ...(stored || {}) } as Record<string, unknown>;
    // 清理旧版本的多模板/高级模板字段
    delete raw.template;
    delete raw.templates;
    delete raw.activeTemplateId;

    const config = { ...DEFAULT_CONFIG, ...(raw as Partial<PluginConfig>) };
    if (!Array.isArray(config.favoriteCities)) {
      config.favoriteCities = [];
    }
    config.outputConfig = normalizeOutputConfig(config.outputConfig);

    return config;
  }

  private maskAmapKey(key: string): string {
    if (!key) return '';
    if (key.length <= 8) {
      return `${key.slice(0, 2)}${AMAP_KEY_MASK}${key.slice(-2)}`;
    }
    return `${key.slice(0, 4)}${AMAP_KEY_MASK}${key.slice(-4)}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value);
  }

  private getPluginBasePath(): string | undefined {
    const nodeRequire = this.getNodeRequire();
    if (!nodeRequire) {
      console.warn('[WeatherLocation] 当前环境没有 Node require，无法解析插件目录');
      return undefined;
    }

    try {
      const path = nodeRequire('path');
      const fs = nodeRequire('fs');
      const candidates: string[] = [];
      const workspaceDir = (window as any)?.siyuan?.config?.system?.workspaceDir;

      if (workspaceDir) {
        candidates.push(path.join(workspaceDir, 'data', 'plugins', this.name));
      }

      try {
        const electron = nodeRequire('electron');
        const app = electron?.remote?.app || electron?.app;
        const documentsPath = app?.getPath?.('documents');
        if (documentsPath) {
          candidates.push(path.join(documentsPath, 'SiYuan', 'data', 'plugins', this.name));
          candidates.push(path.join(documentsPath, 'Siyuan', 'data', 'plugins', this.name));
        }
      } catch (error) {
        console.warn('[WeatherLocation] 无法通过 Electron 解析文档目录:', error);
      }

      if (typeof __dirname !== 'undefined' && !__dirname.includes('electron.asar')) {
        candidates.push(__dirname);
      }

      const pluginBasePath = candidates.find(candidate => {
        if (!fs.existsSync(path.join(candidate, 'plugin.json'))) {
          return false;
        }
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'plugin.json'), 'utf8'));
          return manifest.name === this.name;
        } catch {
          return true;
        }
      });

      console.log('[WeatherLocation] 插件目录解析结果:', pluginBasePath || candidates);
      return pluginBasePath;
    } catch (error) {
      console.warn('[WeatherLocation] 解析插件目录失败:', error);
      return undefined;
    }
  }

  private getNodeRequire(): ((id: string) => any) | null {
    const globalWindow = typeof window !== 'undefined' ? (window as any) : undefined;
    if (globalWindow?.require) {
      return globalWindow.require.bind(globalWindow);
    }

    try {
      if (typeof require === 'function') {
        return require;
      }
    } catch {
      // Fall back to eval below for runtimes that expose require differently.
    }

    try {
      return (0, eval)('require') as (id: string) => any;
    } catch {
      return null;
    }
  }

  async saveConfig() {
    try {
      await this.saveData(STORAGE_NAME, this.config);
      // 更新服务配置
      this.weatherService.updateConfig(this.config);
      this.locationService.updateConfig(this.config);
      this.locationService.updatePluginBasePath(this.getPluginBasePath());
      // 清除位置和天气缓存，确保使用新配置
      this.locationService.clearCache();
      this.weatherService.clearCache();
      // 更新斜杠命令（常用城市列表可能已更新）
      this.updateSlashCommands();
      // 重新预加载数据
      this.prefetchData();
      console.log('[WeatherLocation] Config saved and cache cleared');
    } catch (error) {
      console.error('[WeatherLocation] Error saving config:', error);
    }
  }

  private renderConfiguredOutput(data: any): string {
    return renderOutputConfig(this.config.outputConfig, data);
  }

  // 基础斜杠命令（插入天气位置模板 + 插入天气弹窗），注册与更新时保持一致
  private createBaseSlashCommands(): any[] {
    return [
      {
        filter: ['天气位置', 'weather location', 'tianqi weizhi', '/tq', '/天气'],
        html: '<span class="b3-list-item__text">🌤📍 插入天气位置模板</span>',
        id: 'insert-weather-location-template',
        callback: async (protyle: any, nodeElement: HTMLElement) => {
          const data = await this.getTemplateData();
          if (!data) return;
          const content = this.renderConfiguredOutput(data);
          this.replaceBlockContent(nodeElement.dataset.nodeId || '', content, ['天气位置', 'weather location', 'tianqi weizhi', '/tq', '/天气']);
        }
      },
      {
        filter: ['插入天气', 'insert weather', 'crtq', 'charu tianqi'],
        html: '<span class="b3-list-item__text">🌤 插入天气（选择地点）</span>',
        id: 'insert-weather-dialog',
        callback: async (protyle: any, nodeElement: HTMLElement) => {
          const blockId = nodeElement.dataset.nodeId || '';
          if (!blockId) {
            showMessage('无法定位当前块，插入失败');
            return;
          }
          this.openWeatherInsertDialog(blockId, ['插入天气', 'insert weather', 'crtq', 'charu tianqi']);
        }
      }
    ];
  }

  // 更新斜杠命令（用于配置更新时，避免完全重新注册导致重复）
  // 常用地址不再注册为斜杠命令，统一从「插入天气」弹窗中选择
  private updateSlashCommands() {
    this.protyleSlash = this.createBaseSlashCommands();
  }

  // 预加载位置和天气数据（后台异步执行）
  private prefetchData() {
    console.log('[WeatherLocation] 开始后台预加载数据...');

    // 使用 setTimeout 确保不影响插件加载速度
    setTimeout(async () => {
      try {
        // 预加载位置（会使用缓存或发起请求）
        const location = await this.locationService.getCurrentLocation();
        if (location) {
          console.log('[WeatherLocation] 位置预加载成功:', location.city);

          // 预加载天气
          const weather = await this.weatherService.getWeather(location.lat, location.lon);
          if (weather) {
            console.log('[WeatherLocation] 天气预加载成功:', weather.description);
          }
        }
        console.log('[WeatherLocation] 后台预加载完成');
      } catch (error) {
        console.error('[WeatherLocation] 预加载失败:', error);
      }
    }, 100); // 延迟100ms开始预加载
  }

  // 重写 openSetting 方法来显示设置面板
  openSetting(): void {
    console.log('[WeatherLocation] Opening setting panel...');
    this.openSettings();
  }

  private registerCommand() {
    console.log('[WeatherLocation] Registering commands...');

    // 注册插入天气命令
    this.addCommand({
      langKey: 'insert-weather',
      hotkey: '',
      callback: async () => {
        await this.insertWeatherToCurrentDoc();
      }
    });

    // 注册插入位置命令
    this.addCommand({
      langKey: 'insert-location',
      hotkey: '',
      callback: async () => {
        await this.insertLocationToCurrentDoc();
      }
    });

    // 注册插入完整模板命令
    this.addCommand({
      langKey: 'insert-weather-location-template',
      hotkey: '',
      callback: async () => {
        await this.insertTemplateToCurrentDoc();
      }
    });

    // 注册打开设置命令
    this.addCommand({
      langKey: 'open-weather-settings',
      hotkey: '',
      callback: async () => {
        this.openSettings();
      }
    });

    console.log('[WeatherLocation] Commands registered');
  }

  // 注册斜杠命令（仅在插件加载时调用一次）
  // 只注册基础命令；常用地址不再注册为斜杠命令，统一从「插入天气」弹窗中选择
  private registerSlashCommand() {
    console.log('[WeatherLocation] Registering slash commands...');

    // 如果已经注册过，跳过（避免重复）
    if (this.slashCommandsRegistered) {
      console.log('[WeatherLocation] 斜杠命令已注册，跳过重复注册');
      return;
    }

    // 使用数组赋值方式，确保思源笔记能正确识别
    this.protyleSlash = this.createBaseSlashCommands();
    this.slashCommandsRegistered = true;
    console.log('[WeatherLocation] Slash commands registered, count:', this.protyleSlash.length);
  }

  private registerMenu() {
    console.log('[WeatherLocation] Registering menu...');

    // 编辑器左键菜单功能已移除
    // 如需插入天气信息，请使用快捷面板或斜杠命令

    console.log('[WeatherLocation] Menu registered (no items)');
  }

  // 打开“插入天气”弹窗（从斜杠命令触发，blockId 为触发块）
  private openWeatherInsertDialog(blockId: string, triggers: string[]) {
    console.log('[WeatherLocation] Opening weather insert dialog...');

    try {
      const dialog = new Dialog({
        title: '插入天气',
        content: this.createWeatherInsertContent(),
        width: this.isMobile() ? '95vw' : '560px'
      });

      // 延迟绑定事件，确保 DOM 已渲染
      setTimeout(() => {
        this.bindWeatherInsertEvents(dialog, blockId, triggers);
      }, 100);
    } catch (error) {
      console.error('[WeatherLocation] Error opening weather insert dialog:', error);
      showMessage('打开插入天气面板失败: ' + (error as Error).message);
    }
  }

  // 创建“插入天气”弹窗内容（当前位置卡片 + 搜索地址 + 常用地址 + 手动经纬度）
  private createWeatherInsertContent(): string {
    return `
      <div id="weather-insert-dialog" class="wl-insert">
        <div class="wl-local" id="wl-local-card">
          <div class="wl-local__placeholder">正在获取当前位置天气…</div>
        </div>

        <div class="wl-block">
          <div class="wl-block__head">
            <span class="wl-block__title">搜索地址</span>
            <span class="wl-block__meta">支持小区、写字楼、园区</span>
          </div>
          <div class="wl-search">
            <svg class="wl-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4 4"></path></svg>
            <input type="text" id="wl-insert-city-search" placeholder="搜索城市、小区或写字楼，如 望京" autocomplete="off">
          </div>
          <div class="wl-rows" id="wl-insert-city-results" style="display:none;"></div>
        </div>

        <div class="wl-block">
          <div class="wl-block__head">
            <span class="wl-block__title">常用地址</span>
            <span class="wl-block__meta" id="wl-insert-fav-count"></span>
          </div>
          <div class="wl-rows" id="wl-insert-favorite-list">
            ${this.renderInsertFavoriteList()}
          </div>
        </div>

        <button class="wl-insert__manual-toggle" id="wl-manual-toggle" type="button">手动输入经纬度</button>
        <div class="wl-insert__manual" id="wl-manual-panel" style="display:none;">
          <div class="wl-insert__row">
            <input type="text" id="wl-insert-lat" placeholder="纬度，如 29.52">
            <input type="text" id="wl-insert-lon" placeholder="经度，如 112.55">
            <input type="text" id="wl-insert-name" placeholder="名称（可选）">
            <button id="wl-insert-custom-btn" class="b3-button b3-button--primary" type="button">插入</button>
          </div>
          <div class="wl-insert__hint">手动填写经纬度时优先使用经纬度；名称留空则以坐标显示。</div>
        </div>
      </div>
    `;
  }

  // 渲染弹窗顶部的当地天气卡片
  private renderInsertLocalCard(status: 'loading' | 'ready' | 'error', data?: any): string {
    if (status === 'loading') {
      return '<div class="wl-local__placeholder">正在获取当前位置天气…</div>';
    }

    const relocateBtn = `
      <button class="wl-icon-btn" id="wl-relocate-btn" type="button" title="重新定位" aria-label="重新定位">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4.2"/></svg>
      </button>
    `;

    if (status === 'error' || !data) {
      return `
        <div class="wl-local__head">
          <div class="wl-local__info">
            <div class="wl-local__kicker">当前位置</div>
            <div class="wl-local__name">定位失败</div>
            <div class="wl-local__sub">请检查网络连接与高德地图 Key 配置</div>
          </div>
          <div class="wl-local__temp"><span class="wl-local__temp-num">—</span></div>
        </div>
        <div class="wl-local__actions">
          <button class="b3-button b3-button--primary" id="wl-insert-local-btn" type="button" disabled>插入当地天气</button>
          ${relocateBtn}
        </div>
      `;
    }

    const { weather, location } = data;
    const city = location.city || '当前位置';
    const sub = location.district || location.formatted_address || '';
    const range = (weather.tempMin != null && weather.tempMax != null)
      ? ` · 今日 ${weather.tempMin}° ~ ${weather.tempMax}°`
      : '';
    const wind = weather.windDirection
      ? ` · ${`${weather.windDirection} ${weather.windPower || ''}`.trim()}`
      : '';
    const cond = `${weather.description} · 湿度 ${weather.humidity}%${wind}${range}`;

    return `
      <div class="wl-local__head">
        <div class="wl-local__info">
          <div class="wl-local__kicker">当前位置</div>
          <div class="wl-local__name">${this.escapeHtml(city)}</div>
          ${sub ? `<div class="wl-local__sub">${this.escapeHtml(sub)}</div>` : ''}
        </div>
        <div class="wl-local__temp">
          <span class="wl-local__temp-num">${this.escapeHtml(String(weather.temperature))}</span><span class="wl-local__temp-deg">°C</span>
        </div>
      </div>
      <div class="wl-local__cond">${this.escapeHtml(cond)}</div>
      <div class="wl-local__actions">
        <button class="b3-button b3-button--primary" id="wl-insert-local-btn" type="button">插入当地天气</button>
        ${relocateBtn}
      </div>
    `;
  }

  // 静默加载当地天气卡片（失败只更新卡片，不弹消息）
  private async loadInsertDialogLocal() {
    const card = document.getElementById('wl-local-card');
    if (!card) return;
    card.innerHTML = this.renderInsertLocalCard('loading');
    try {
      const location = await this.locationService.getCurrentLocation();
      if (!location) throw new Error('定位失败');
      const weather = await this.weatherService.getWeather(location.lat, location.lon);
      if (!weather) throw new Error('天气获取失败');
      if (!card.isConnected) return;
      card.innerHTML = this.renderInsertLocalCard('ready', { weather, location });
    } catch (error) {
      console.warn('[WeatherLocation] 弹窗获取当地天气失败:', error);
      if (card.isConnected) {
        card.innerHTML = this.renderInsertLocalCard('error');
      }
    }
  }

  // 渲染“插入天气”弹窗中的常用地址列表（点击行插入，右侧删除）
  private renderInsertFavoriteList(): string {
    if (this.config.favoriteCities.length === 0) {
      return '<div class="wl-rows__empty">暂无常用地址。<br>在搜索结果里点「存为常用」，或到插件设置中添加。</div>';
    }

    return this.config.favoriteCities.map((city, index) => {
      const sub = city.address || `${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}`;
      return `
        <div class="wl-row">
          <button class="wl-row__main" data-fav-index="${index}" type="button" title="插入 ${this.escapeAttribute(city.name)} 的天气">
            <span class="wl-row__name">${this.escapeHtml(city.name)}</span>
            <span class="wl-row__sub">${this.escapeHtml(sub)}</span>
          </button>
          <button class="wl-row__del" data-fav-del="${index}" type="button" title="删除常用地址" aria-label="删除常用地址 ${this.escapeAttribute(city.name)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7"/></svg>
          </button>
        </div>
      `;
    }).join('');
  }

  // 渲染“插入天气”弹窗中的搜索结果（点击行直接插入，右侧可存为常用）
  private renderInsertSearchResults(results: CitySearchResult[]): string {
    return results.map((city, index) => {
      const saved = this.config.favoriteCities.some(c => c.name === city.name);
      return `
        <div class="wl-row">
          <button class="wl-row__main" data-result-index="${index}" type="button" title="插入 ${this.escapeAttribute(city.name)} 的天气">
            <span class="wl-row__name">${this.escapeHtml(city.name)}${city.badge ? `<span class="wl-result-badge">${this.escapeHtml(city.badge)}</span>` : ''}</span>
            <span class="wl-row__sub">${this.escapeHtml(city.displayName)}</span>
          </button>
          <button class="wl-row__add" data-result-add="${index}" type="button" ${saved ? 'disabled' : ''}>${saved ? '已存' : '存为常用'}</button>
        </div>
      `;
    }).join('');
  }

  // 刷新弹窗中的常用地址列表与计数
  private refreshInsertFavoriteList(container: HTMLElement) {
    const list = container.querySelector('#wl-insert-favorite-list');
    if (list) {
      list.innerHTML = this.renderInsertFavoriteList();
    }
    const count = container.querySelector('#wl-insert-fav-count');
    if (count) {
      count.textContent = this.config.favoriteCities.length > 0 ? `${this.config.favoriteCities.length} 个` : '';
    }
  }

  // 绑定“插入天气”弹窗事件（事件委托，卡片重绘后无需重新绑定）
  private bindWeatherInsertEvents(dialog: any, blockId: string, triggers: string[]) {
    const container = document.getElementById('weather-insert-dialog');
    if (!container) {
      console.error('[WeatherLocation] Weather insert dialog container not found');
      return;
    }

    let currentResults: CitySearchResult[] = [];
    let searchTimeout: NodeJS.Timeout | null = null;
    const searchInput = container.querySelector('#wl-insert-city-search') as HTMLInputElement;
    const searchResults = container.querySelector('#wl-insert-city-results') as HTMLDivElement;

    // 加载当地天气卡片（静默失败，只更新卡片）
    this.loadInsertDialogLocal();
    this.refreshInsertFavoriteList(container);

    // 点击委托：当地天气 / 重新定位 / 常用地址插入与删除 / 搜索结果插入与收藏
    container.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      if (target.closest('#wl-insert-local-btn')) {
        await this.insertWeatherFromDialog(dialog, blockId, triggers, () => this.getTemplateData());
        return;
      }

      if (target.closest('#wl-relocate-btn')) {
        this.locationService.clearCache();
        this.weatherService.clearCache();
        this.loadInsertDialogLocal();
        return;
      }

      const favMain = target.closest('[data-fav-index]') as HTMLElement;
      if (favMain) {
        const city = this.config.favoriteCities[parseInt(favMain.dataset.favIndex || '0')];
        if (!city) return;
        await this.insertWeatherFromDialog(dialog, blockId, triggers, () => this.getTemplateDataForCity(city));
        return;
      }

      const favDel = target.closest('[data-fav-del]') as HTMLElement;
      if (favDel) {
        const index = parseInt(favDel.dataset.favDel || '0');
        const city = this.config.favoriteCities[index];
        if (!city) return;
        this.removeFavoriteCity(index);
        await this.saveConfig();
        this.refreshInsertFavoriteList(container);
        if (searchResults.style.display !== 'none' && currentResults.length > 0) {
          searchResults.innerHTML = this.renderInsertSearchResults(currentResults);
        }
        showMessage(`已删除常用地址「${city.name}」`);
        return;
      }

      const resultMain = target.closest('[data-result-index]') as HTMLElement;
      if (resultMain) {
        const city = currentResults[parseInt(resultMain.dataset.resultIndex || '0')];
        if (!city) return;
        await this.insertWeatherFromDialog(dialog, blockId, triggers, () =>
          this.getTemplateDataForCoordinates(city.lat, city.lon, city.name)
        );
        return;
      }

      const resultAdd = target.closest('[data-result-add]') as HTMLElement;
      if (resultAdd) {
        if (resultAdd.hasAttribute('disabled')) return;
        const city = currentResults[parseInt(resultAdd.dataset.resultAdd || '0')];
        if (!city) return;
        if (this.addFavoriteCity(city)) {
          await this.saveConfig();
          this.refreshInsertFavoriteList(container);
          searchResults.innerHTML = this.renderInsertSearchResults(currentResults);
          showMessage(`已把「${city.name}」存为常用地址`);
        }
        return;
      }
    });

    // 搜索输入（防抖）
    searchInput?.addEventListener('input', () => {
      const query = searchInput.value.trim();

      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      if (query.length < 2) {
        searchResults.style.display = 'none';
        currentResults = [];
        return;
      }

      searchTimeout = setTimeout(async () => {
        try {
          currentResults = await this.searchCities(query);
          searchResults.innerHTML = currentResults.length > 0
            ? this.renderInsertSearchResults(currentResults)
            : '<div class="wl-rows__empty">未找到匹配的地点，换个关键词试试</div>';
          searchResults.style.display = 'block';
        } catch (error) {
          showMessage('地点搜索失败: ' + (error as Error).message);
        }
      }, 500);
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchResults.style.display = 'none';
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const first = searchResults.querySelector('[data-result-index]') as HTMLElement;
        first?.click();
      }
    });

    // 手动经纬度面板折叠/展开
    const manualToggle = container.querySelector('#wl-manual-toggle') as HTMLButtonElement;
    const manualPanel = container.querySelector('#wl-manual-panel') as HTMLDivElement;
    manualToggle?.addEventListener('click', () => {
      const show = manualPanel.style.display === 'none';
      manualPanel.style.display = show ? 'block' : 'none';
      manualToggle.textContent = show ? '收起手动输入' : '手动输入经纬度';
    });

    // 手动经纬度插入
    container.querySelector('#wl-insert-custom-btn')?.addEventListener('click', async () => {
      const latInput = container.querySelector('#wl-insert-lat') as HTMLInputElement;
      const lonInput = container.querySelector('#wl-insert-lon') as HTMLInputElement;
      const nameInput = container.querySelector('#wl-insert-name') as HTMLInputElement;
      const customName = nameInput?.value.trim() || '';

      const lat = parseFloat(latInput?.value || '');
      const lon = parseFloat(lonInput?.value || '');

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        showMessage('请输入有效的经纬度');
        return;
      }

      await this.insertWeatherFromDialog(dialog, blockId, triggers, () =>
        this.getTemplateDataForCoordinates(lat, lon, customName)
      );
    });
  }

  // 统一的弹窗插入流程：获取数据 -> 渲染 -> 替换触发块内容 -> 关闭弹窗
  private async insertWeatherFromDialog(dialog: any, blockId: string, triggers: string[], resolveData: () => Promise<any | null>) {
    showMessage('正在获取天气数据...');
    const data = await resolveData();
    if (!data) return;
    const content = this.renderConfiguredOutput(data);
    dialog.destroy();
    await this.replaceBlockContent(blockId, content, triggers);
  }

  // 获取任意坐标的模板数据（天气 + 逆地理位置，逆地理失败时回退到仅坐标信息）
  private async getTemplateDataForCoordinates(lat: number, lon: number, name?: string): Promise<any | null> {
    const weather = await this.weatherService.getWeather(lat, lon);
    if (!weather) {
      showMessage('获取天气信息失败');
      return null;
    }

    let location: LocationData;
    try {
      location = await this.locationService.getLocationByCoordinates(lat, lon);
    } catch (error) {
      console.warn('[WeatherLocation] 逆地理编码失败，回退到坐标信息:', error);
      location = {
        city: name || '自定义地点',
        country: '',
        lat,
        lon,
        formatted_address: name || `${lat}, ${lon}`,
        region: ''
      };
    }

    if (name && (!location.city || location.city === '未知')) {
      location.city = name;
    }

    return {
      weather,
      location,
      time: new Date().toLocaleString('zh-CN')
    };
  }

  // 打开设置对话框
  private openSettings() {
    console.log('[WeatherLocation] Opening settings...');

    try {
      const dialog = new Dialog({
        title: '天气与位置插件设置',
        content: this.createSettingsContent(),
        width: this.isMobile() ? '95vw' : '600px'
      });

      // 延迟绑定事件，确保 DOM 已渲染
      setTimeout(() => {
        this.bindSettingsEvents(dialog);
      }, 100);

      console.log('[WeatherLocation] Settings dialog opened');
    } catch (error) {
      console.error('[WeatherLocation] Error opening settings:', error);
      showMessage('打开设置失败: ' + (error as Error).message);
    }
  }

  // 创建设置内容
  private createSettingsContent(): string {
    const maskedAmapKey = this.maskAmapKey(this.config.amapKey);
    return `
      <div id="weather-location-settings" class="wl-settings">
        <div class="wl-settings__tabs" role="tablist">
          <button class="wl-settings__tab is-active" data-settings-page="main" type="button">常规与输出</button>
          <button class="wl-settings__tab" data-settings-page="helper" type="button">定位辅助器</button>
        </div>

        <div class="wl-settings__page is-active" data-page="main">
          <div class="setting-section">
            <h3>高德地图设置</h3>
            <div class="setting-item">
              <label>高德地图 Key</label>
              <input type="text" id="amap-key" value="${this.escapeAttribute(maskedAmapKey)}" data-original-key="${this.escapeAttribute(this.config.amapKey)}" placeholder="天气和位置均需此 Key">
              <div class="setting-help">已保存的 Key 会脱敏显示。需要修改时，直接输入新的完整 Key。前往 <a href="https://lbs.amap.com/" target="_blank">高德开放平台</a> 申请 Key</div>
            </div>
          </div>

          <div class="setting-section">
            <h3>常用地点 <span>(最多5个)</span></h3>

            <div class="setting-item" id="favorite-city-search-container" style="display: ${this.config.favoriteCities.length >= MAX_FAVORITE_CITIES ? 'none' : 'block'};">
              <div class="wl-segmented">
                <button id="toggle-search-mode" class="city-add-mode-btn active" type="button">搜索添加</button>
                <button id="toggle-manual-mode" class="city-add-mode-btn" type="button">手动录入</button>
              </div>

              <div id="search-city-panel">
                <label>搜索地点</label>
                <div class="wl-search-wrap">
                  <input type="text" id="favorite-city-search" placeholder="输入城市、区县、小区、写字楼…">
                  <div id="city-search-results"></div>
                </div>
                <div class="setting-help">支持搜索城市、区县以及小区、商场、写字楼等详细地点，点击结果即可添加</div>
              </div>

              <div id="manual-city-panel" style="display: none;">
                <label>地点名称</label>
                <input type="text" id="manual-city-name" placeholder="如：北京、华容县、人民路、某小区">

                <label>纬度</label>
                <input type="text" id="manual-city-lat" placeholder="如：39.9042">

                <label>经度</label>
                <input type="text" id="manual-city-lon" placeholder="如：116.4074">

                <button id="add-manual-city-btn" class="b3-button b3-button--primary" type="button">添加地点</button>
                <div class="setting-help">格式：地点名、纬度、经度。可在地图软件中查询坐标</div>
              </div>
            </div>

            ${this.config.favoriteCities.length >= MAX_FAVORITE_CITIES ? '<div class="wl-limit-warning">已达到最大数量限制（5个），如需添加请先删除现有地点</div>' : ''}
            <div id="favorite-cities-list">
              ${this.renderFavoriteCitiesList()}
            </div>
          </div>

          <div class="setting-section">
            <h3>输出格式</h3>
            <div class="setting-help wl-format-help">点击下方字段标签即可加入格式，也可以拖动标签调整顺序；标签之间的输入框可填写任意符号或文字（如 <code>:</code>、<code>|</code>、<code>°C</code>），输入框会随内容自动变宽。「换行」标签以软换行（Shift+Enter 效果）另起一行，全部内容始终保持在同一个块中。</div>
            <div id="wl-format-composer" class="wl-composer" aria-label="输出格式编辑区"></div>
            <div class="wl-palette">
              <div class="wl-palette__group">
                <div class="wl-palette__label">天气字段</div>
                <div class="wl-palette__chips">${this.renderPaletteChips('weather.')}</div>
              </div>
              <div class="wl-palette__group">
                <div class="wl-palette__label">位置字段</div>
                <div class="wl-palette__chips">${this.renderPaletteChips('location.')}</div>
              </div>
              <div class="wl-palette__group">
                <div class="wl-palette__label">其他</div>
                <div class="wl-palette__chips">
                  ${this.renderPaletteChips('time')}
                  <button class="wl-chip wl-chip--newline wl-chip--palette" data-palette-chip="${NEWLINE_CHIP}" draggable="true" type="button" title="插入软换行（Shift+Enter 效果，内容保持在同一个块中）">⏎ 换行</button>
                </div>
              </div>
            </div>
            <div class="wl-preview">
              <div class="wl-preview__label">实时预览</div>
              <pre id="output-preview">${this.escapeHtml(this.renderOutputPreview())}</pre>
            </div>
            <div class="wl-action-row">
              <button id="format-reset-btn" class="b3-button b3-button--outline" type="button">恢复默认格式</button>
              <button id="format-clear-btn" class="b3-button b3-button--outline wl-danger" type="button">清空格式</button>
            </div>
          </div>

          <div class="setting-actions">
            <button id="save-btn" class="b3-button b3-button--primary" type="button">保存设置</button>
            <button id="test-btn" class="b3-button b3-button--outline" type="button">测试获取数据</button>
            <button id="clear-cache-btn" class="b3-button b3-button--outline wl-danger" type="button">清除缓存</button>
          </div>
        </div>

        <div class="wl-settings__page" data-page="helper">
          <div class="setting-section">
            <h3>定位辅助器</h3>
            <div class="wl-helper-status">
              <span id="native-helper-status-dot" class="wl-status-dot"></span>
              <div>
                <div id="native-helper-status-label" class="wl-helper-status__label">正在读取状态...</div>
                <div class="setting-help">原生定位辅助器用于获取更稳定的系统级坐标；不可用时会回退到浏览器定位。</div>
              </div>
            </div>
            <div class="setting-actions">
              <button id="helper-start-btn" class="b3-button b3-button--primary" type="button">启动</button>
              <button id="helper-stop-btn" class="b3-button b3-button--outline" type="button">关闭</button>
              <button id="helper-restart-btn" class="b3-button b3-button--outline" type="button">重启</button>
              <button id="helper-clean-restart-btn" class="b3-button b3-button--outline wl-danger" type="button">清理并重启</button>
              <button id="helper-refresh-btn" class="b3-button b3-button--text" type="button">刷新状态</button>
            </div>
            <div class="wl-helper-diagnostics">
              <div class="wl-helper-diagnostics__title">诊断信息</div>
              <div id="native-helper-diagnostics" class="wl-helper-diagnostics__body">正在读取诊断信息...</div>
              <div class="setting-actions">
                <button id="helper-copy-diagnostics-btn" class="b3-button b3-button--text" type="button">复制诊断信息</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 渲染字段标签面板中的一组标签（prefix 为字段 key 前缀或完整 key）
  private renderPaletteChips(prefix: string): string {
    return OUTPUT_FIELDS
      .filter(field => field.key === prefix || field.key.startsWith(prefix))
      .map(field => `
        <button class="wl-chip wl-chip--palette" data-palette-chip="${this.escapeAttribute(field.key)}" draggable="true" type="button" title="点击或拖入上方格式区">
          <span class="wl-chip__icon">${this.escapeHtml(field.icon)}</span>
          <span class="wl-chip__label">${this.escapeHtml(field.label)}</span>
        </button>
      `).join('');
  }

  // 渲染格式编辑区：gaps[0] + chips[0] + gaps[1] + ... + gaps[n]
  private renderComposer(): string {
    const { chips, gaps } = this.config.outputConfig;
    const parts: string[] = [];

    const gapInput = (index: number) => `
      <input class="wl-gap-input" data-gap-index="${index}" type="text"
        value="${this.escapeAttribute(gaps[index] || '')}"
        placeholder="符号" aria-label="符号文本 ${index + 1}">
    `;

    chips.forEach((chip, index) => {
      parts.push(gapInput(index));
      parts.push(this.renderComposerChip(chip, index));
    });
    parts.push(gapInput(chips.length));

    return parts.join('');
  }

  private renderComposerChip(chip: string, index: number): string {
    const isNewline = chip === NEWLINE_CHIP;
    const meta = isNewline ? undefined : getFieldMeta(chip);
    const icon = isNewline ? '⏎' : meta?.icon || '❓';
    const label = isNewline ? '换行' : meta?.label || chip;

    return `
      <span class="wl-chip${isNewline ? ' wl-chip--newline' : ''}" data-chip-index="${index}" draggable="true">
        <span class="wl-chip__icon">${this.escapeHtml(icon)}</span>
        <span class="wl-chip__label">${this.escapeHtml(label)}</span>
        <button class="wl-chip__remove" data-remove-chip="${index}" type="button" title="移除该标签">×</button>
      </span>
    `;
  }

  // 重绘格式编辑区（结构性变更后调用）
  private refreshComposer() {
    const composer = document.getElementById('wl-format-composer');
    if (composer) {
      composer.innerHTML = this.renderComposer();
      this.resizeGapInputs(composer);
    }
    this.updateOutputPreview();
  }

  // 让符号输入框宽度跟随内容
  private resizeGapInputs(root: ParentNode) {
    root.querySelectorAll<HTMLInputElement>('.wl-gap-input').forEach(input => {
      this.autoSizeGapInput(input);
    });
  }

  // 按实际渲染宽度调整输入框（中文等宽字符也能正确撑开，不再是固定小框）
  private autoSizeGapInput(input: HTMLInputElement) {
    const MIN_WIDTH = 56; // px，保证空输入框也有可点击的录入区域
    input.style.width = '0px';
    input.style.width = `${Math.max(input.scrollWidth, MIN_WIDTH)}px`;
  }

  private renderOutputPreview(): string {
    return renderOutputConfig(this.config.outputConfig, this.createPreviewData());
  }

  private createPreviewData() {
    return {
      weather: {
        description: '晴转多云',
        dayWeather: '晴',
        nightWeather: '多云',
        temperature: 28,
        humidity: 62,
        windDirection: '东南风',
        windPower: '3级',
        windSpeed: 3.6,
        tempMin: 22,
        tempMax: 31
      },
      location: {
        city: '岳阳市',
        country: '中国',
        province: '湖南省',
        district: '华容县',
        township: '章华镇',
        street: '人民路',
        streetNumber: '88号',
        preciseAddress: '湖南省岳阳市华容县章华镇人民路',
        nearestPlace: '示例小区（约80米）',
        formatted_address: '湖南省岳阳市华容县章华镇人民路88号',
        lat: 29.52,
        lon: 112.55
      },
      time: new Date().toLocaleString('zh-CN')
    };
  }

  // 绑定设置事件
  private bindSettingsEvents(dialog: any) {
    const container = document.getElementById('weather-location-settings');
    if (!container) {
      console.error('[WeatherLocation] Settings container not found');
      return;
    }

    // 检查是否已经绑定过事件
    if ((container as any)._settingsEventsBound) {
      console.log('[WeatherLocation] 设置事件已绑定，跳过');
      return;
    }
    (container as any)._settingsEventsBound = true;

    this.bindSettingsTabEvents();
    this.bindOutputConfigEvents();
    this.bindNativeHelperEvents();

    // 高德 Key
    const amapKey = container.querySelector('#amap-key') as HTMLInputElement;
    const originalAmapKey = amapKey?.dataset.originalKey || '';
    amapKey?.addEventListener('focus', () => {
      if (amapKey.value === this.maskAmapKey(originalAmapKey)) {
        amapKey.value = '';
      }
    });
    amapKey?.addEventListener('blur', () => {
      if (!amapKey.value && originalAmapKey) {
        amapKey.value = this.maskAmapKey(originalAmapKey);
      }
    });
    amapKey?.addEventListener('input', () => {
      if (amapKey.value.includes(AMAP_KEY_MASK)) {
        return;
      }
      this.config.amapKey = amapKey.value.trim();
    });

    // 保存按钮
    const saveBtn = container.querySelector('#save-btn') as HTMLButtonElement;
    saveBtn?.addEventListener('click', async () => {
      if (amapKey && !amapKey.value.includes(AMAP_KEY_MASK)) {
        this.config.amapKey = amapKey.value.trim();
      }
      await this.saveConfig();
      showMessage('设置已保存');
      dialog.destroy();
    });

    // 测试按钮
    const testBtn = container.querySelector('#test-btn') as HTMLButtonElement;
    testBtn?.addEventListener('click', async () => {
      await this.testDataFetch();
    });

    // 清除缓存按钮
    const clearCacheBtn = container.querySelector('#clear-cache-btn') as HTMLButtonElement;
    clearCacheBtn?.addEventListener('click', async () => {
      this.locationService.clearCache();
      this.weatherService.clearCache();
      showMessage('缓存已清除，下次获取数据时将重新请求');
    });

    // 常用城市相关事件
    this.bindFavoriteCitiesEvents();

    // 城市搜索功能
    this.bindCitySearchEvents();

    // 手动录入城市功能
    this.bindManualCityEvents();

    // 添加方式切换
    this.bindAddModeToggleEvents();
  }

  private bindSettingsTabEvents() {
    const container = document.getElementById('weather-location-settings');
    if (!container) return;

    container.querySelectorAll<HTMLElement>('[data-settings-page]').forEach(tab => {
      tab.addEventListener('click', () => {
        const page = tab.dataset.settingsPage;
        container.querySelectorAll('.wl-settings__tab').forEach(item => item.classList.remove('is-active'));
        container.querySelectorAll('.wl-settings__page').forEach(item => item.classList.remove('is-active'));
        tab.classList.add('is-active');
        container.querySelector(`[data-page="${page}"]`)?.classList.add('is-active');
      });
    });
  }

  // 格式编辑区的拖拽状态
  private composerDragState: { source: 'palette'; chip: string } | { source: 'composer'; index: number } | null = null;

  private bindOutputConfigEvents() {
    const container = document.getElementById('weather-location-settings');
    if (!container) return;

    const composer = container.querySelector('#wl-format-composer') as HTMLElement;
    const palette = container.querySelector('.wl-palette') as HTMLElement;

    // 初次渲染格式编辑区
    this.refreshComposer();

    // 符号输入：直接更新 gaps，不重绘编辑区，避免打断输入
    composer?.addEventListener('input', (event) => {
      const input = (event.target as HTMLElement).closest('.wl-gap-input') as HTMLInputElement;
      if (!input) return;

      const index = Number(input.dataset.gapIndex);
      if (!Number.isInteger(index) || index < 0 || index > this.config.outputConfig.chips.length) {
        return;
      }

      this.config.outputConfig.gaps[index] = input.value;
      this.autoSizeGapInput(input);
      this.updateOutputPreview();
    });

    // 移除标签（事件委托，重绘后无需重新绑定）
    composer?.addEventListener('click', (event) => {
      const removeBtn = (event.target as HTMLElement).closest('[data-remove-chip]') as HTMLElement;
      if (!removeBtn) return;
      this.removeComposerChip(Number(removeBtn.dataset.removeChip));
      this.refreshComposer();
    });

    // 面板标签：点击追加到格式末尾（移动端无拖拽也可用）
    palette?.addEventListener('click', (event) => {
      const chipEl = (event.target as HTMLElement).closest('[data-palette-chip]') as HTMLElement;
      if (!chipEl) return;
      this.insertComposerChip(chipEl.dataset.paletteChip || '', this.config.outputConfig.chips.length);
      this.refreshComposer();
    });

    // 拖拽源：面板标签（静态渲染，直接绑定）
    palette?.querySelectorAll<HTMLElement>('[data-palette-chip]').forEach(chipEl => {
      chipEl.addEventListener('dragstart', (event) => {
        this.composerDragState = { source: 'palette', chip: chipEl.dataset.paletteChip || '' };
        event.dataTransfer?.setData('text/plain', chipEl.dataset.paletteChip || '');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'copy';
        }
      });
      chipEl.addEventListener('dragend', () => {
        this.composerDragState = null;
      });
    });

    // 拖拽源：格式区标签（重绘频繁，使用事件委托）
    composer?.addEventListener('dragstart', (event) => {
      const chipEl = (event.target as HTMLElement).closest('.wl-chip[data-chip-index]') as HTMLElement;
      if (!chipEl) return;
      this.composerDragState = { source: 'composer', index: Number(chipEl.dataset.chipIndex) };
      event.dataTransfer?.setData('text/plain', 'composer-chip');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
      }
    });

    composer?.addEventListener('dragover', (event) => {
      if (!this.composerDragState) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = this.composerDragState.source === 'palette' ? 'copy' : 'move';
      }
      this.showComposerDropIndicator(composer, this.computeComposerInsertIndex(event));
    });

    composer?.addEventListener('drop', (event) => {
      if (!this.composerDragState) return;
      event.preventDefault();
      const insertIndex = this.computeComposerInsertIndex(event);
      const drag = this.composerDragState;
      this.composerDragState = null;
      this.clearComposerDropIndicator(composer);

      if (drag.source === 'palette') {
        this.insertComposerChip(drag.chip, insertIndex);
      } else {
        this.moveComposerChip(drag.index, insertIndex);
      }
      this.refreshComposer();
    });

    composer?.addEventListener('dragleave', (event) => {
      if (!composer.contains(event.relatedTarget as Node)) {
        this.clearComposerDropIndicator(composer);
      }
    });

    composer?.addEventListener('dragend', () => {
      this.composerDragState = null;
      this.clearComposerDropIndicator(composer);
    });

    // 恢复默认格式
    container.querySelector('#format-reset-btn')?.addEventListener('click', () => {
      this.config.outputConfig = createDefaultOutputConfig();
      this.refreshComposer();
      showMessage('已恢复默认输出格式');
    });

    // 清空格式：一键移除所有标签与符号文本
    container.querySelector('#format-clear-btn')?.addEventListener('click', () => {
      const { chips, gaps } = this.config.outputConfig;
      const hasContent = chips.length > 0 || gaps.some(gap => gap.trim().length > 0);
      if (!hasContent) {
        showMessage('输出格式已经是空的');
        return;
      }
      if (!window.confirm('确定要清空输出格式的所有内容吗？清空后可通过「恢复默认格式」还原。')) {
        return;
      }
      this.config.outputConfig = { chips: [], gaps: [''] };
      this.refreshComposer();
      showMessage('输出格式已清空');
    });
  }

  // 计算拖拽插入位置：落在标签上按左右半区判断，落在符号输入框上则插入到其前的位置
  private computeComposerInsertIndex(event: DragEvent): number {
    const target = event.target as HTMLElement;

    const chipEl = target.closest('.wl-chip[data-chip-index]') as HTMLElement | null;
    if (chipEl) {
      const rect = chipEl.getBoundingClientRect();
      const index = Number(chipEl.dataset.chipIndex);
      return event.clientX < rect.left + rect.width / 2 ? index : index + 1;
    }

    const gapInput = target.closest('.wl-gap-input') as HTMLInputElement | null;
    if (gapInput) {
      return Number(gapInput.dataset.gapIndex);
    }

    return this.config.outputConfig.chips.length;
  }

  private showComposerDropIndicator(composer: HTMLElement, insertIndex: number) {
    this.clearComposerDropIndicator(composer);
    composer
      .querySelector(`.wl-gap-input[data-gap-index="${insertIndex}"]`)
      ?.classList.add('wl-gap-input--drop');
  }

  private clearComposerDropIndicator(composer: HTMLElement) {
    composer.querySelectorAll('.wl-gap-input--drop').forEach(el => el.classList.remove('wl-gap-input--drop'));
  }

  // 在指定位置插入标签（同时插入一个空符号位）
  private insertComposerChip(chip: string, insertIndex: number) {
    if (!chip) return;
    const { chips, gaps } = this.config.outputConfig;
    const index = Math.max(0, Math.min(insertIndex, chips.length));
    chips.splice(index, 0, chip);
    gaps.splice(index, 0, '');
  }

  // 移动标签：标签携带其前面的符号文本一起移动
  private moveComposerChip(from: number, insertIndex: number) {
    const { chips, gaps } = this.config.outputConfig;
    if (from < 0 || from >= chips.length) return;

    const targetIndex = insertIndex > from ? insertIndex - 1 : insertIndex;
    if (targetIndex === from) return;

    const [chip] = chips.splice(from, 1);
    const [gap] = gaps.splice(from, 1);
    chips.splice(targetIndex, 0, chip);
    gaps.splice(targetIndex, 0, gap ?? '');
  }

  // 移除标签：合并标签两侧的符号文本，避免用户已输入的符号丢失
  private removeComposerChip(index: number) {
    const { chips, gaps } = this.config.outputConfig;
    if (index < 0 || index >= chips.length) return;

    chips.splice(index, 1);
    const merged = (gaps[index] || '') + (gaps[index + 1] || '');
    gaps.splice(index, 2, merged);
  }

  private updateOutputPreview() {
    const preview = document.getElementById('output-preview');
    if (preview) {
      preview.textContent = this.renderOutputPreview();
    }
  }

  private bindNativeHelperEvents() {
    const container = document.getElementById('weather-location-settings');
    if (!container) return;

    const runAction = async (message: string, successMessage: string, failureMessage: string, action: () => Promise<boolean>) => {
      showMessage(message);
      const ok = await action();
      await this.refreshNativeHelperStatus();
      showMessage(ok ? successMessage : failureMessage);
    };

    const runDetailedAction = async (
      message: string,
      successMessage: string,
      action: () => Promise<Awaited<ReturnType<LocationService['ensureNativeHelperDetailed']>>>
    ) => {
      showMessage(message);
      const result = await action();
      await this.refreshNativeHelperStatus();
      showMessage(result.ok ? successMessage : result.message);
    };

    container.querySelector('#helper-start-btn')?.addEventListener('click', async () => {
      await runDetailedAction(
        '正在启动定位辅助器...',
        '定位辅助器已启动',
        () => this.locationService.ensureNativeHelperDetailed()
      );
    });

    container.querySelector('#helper-stop-btn')?.addEventListener('click', async () => {
      await runAction(
        '正在关闭定位辅助器...',
        '定位辅助器已关闭',
        '定位辅助器未运行或关闭失败',
        () => this.locationService.shutdownNativeHelper()
      );
    });

    container.querySelector('#helper-restart-btn')?.addEventListener('click', async () => {
      await runDetailedAction(
        '正在重启定位辅助器...',
        '定位辅助器已重启',
        () => this.locationService.restartNativeHelperDetailed()
      );
    });

    container.querySelector('#helper-clean-restart-btn')?.addEventListener('click', async () => {
      showMessage('正在清理并重启定位辅助器...');
      const cleanup = await this.locationService.cleanupStaleNativeHelpers();
      const result = await this.locationService.restartNativeHelperDetailed();
      await this.refreshNativeHelperStatus();
      if (result.ok) {
        showMessage(cleanup.killed.length > 0 ? '已清理卡住进程并重启定位辅助器' : '定位辅助器已重启');
      } else {
        showMessage(cleanup.ok ? result.message : `${cleanup.message}: ${cleanup.error || result.message}`);
      }
    });

    container.querySelector('#helper-refresh-btn')?.addEventListener('click', async () => {
      await this.refreshNativeHelperStatus();
    });

    container.querySelector('#helper-copy-diagnostics-btn')?.addEventListener('click', async () => {
      await this.copyNativeHelperDiagnostics();
    });

    this.refreshNativeHelperStatus();
  }

  private async refreshNativeHelperStatus() {
    const label = document.getElementById('native-helper-status-label');
    const dot = document.getElementById('native-helper-status-dot');
    const diagnosticsContainer = document.getElementById('native-helper-diagnostics');
    if (!label || !dot) return;

    label.textContent = '正在读取状态...';
    dot.classList.remove('is-running', 'is-stopped', 'is-stale');
    if (diagnosticsContainer) {
      diagnosticsContainer.textContent = '正在读取诊断信息...';
    }

    try {
      const diagnostics = await this.locationService.getNativeHelperDiagnostics();
      const running = diagnostics.status === 'running';
      const stale = diagnostics.status === 'stale';
      label.textContent = running ? '运行中' : stale ? '进程卡住，服务未响应' : '未运行';
      dot.classList.toggle('is-running', running);
      dot.classList.toggle('is-stale', stale);
      dot.classList.toggle('is-stopped', !running && !stale);
      this.lastNativeHelperDiagnosticsText = this.formatNativeHelperDiagnosticsText(diagnostics);
      if (diagnosticsContainer) {
        diagnosticsContainer.innerHTML = this.renderNativeHelperDiagnostics(diagnostics);
      }
    } catch (error) {
      console.error('[WeatherLocation] 获取定位辅助器状态失败:', error);
      label.textContent = '状态读取失败';
      dot.classList.add('is-stopped');
      this.lastNativeHelperDiagnosticsText = `状态读取失败: ${(error as Error).message}`;
      if (diagnosticsContainer) {
        diagnosticsContainer.textContent = this.lastNativeHelperDiagnosticsText;
      }
    }
  }

  private renderNativeHelperDiagnostics(diagnostics: Awaited<ReturnType<LocationService['getNativeHelperDiagnostics']>>): string {
    const rows = this.getNativeHelperDiagnosticRows(diagnostics);
    return rows.map(row => `
      <div class="wl-helper-diagnostics__row">
        <span>${this.escapeHtml(row.label)}</span>
        <code>${this.escapeHtml(row.value)}</code>
      </div>
    `).join('');
  }

  private formatNativeHelperDiagnosticsText(diagnostics: Awaited<ReturnType<LocationService['getNativeHelperDiagnostics']>>): string {
    return this.getNativeHelperDiagnosticRows(diagnostics)
      .map(row => `${row.label}: ${row.value}`)
      .join('\n');
  }

  private getNativeHelperDiagnosticRows(diagnostics: Awaited<ReturnType<LocationService['getNativeHelperDiagnostics']>>): Array<{ label: string; value: string }> {
    const lastResult = diagnostics.lastResult;
    const staleProcesses = diagnostics.staleProcesses || [];
    const rows = [
      { label: '状态', value: this.getNativeHelperStatusText(diagnostics.status) },
      { label: '运行环境', value: `${diagnostics.runtime.requireSource}${diagnostics.runtime.platform ? ` / ${diagnostics.runtime.platform}` : ''}` },
      { label: '辅助器安装目录', value: diagnostics.paths?.installDir || '未解析' },
      { label: '辅助器文件', value: diagnostics.paths?.helperBinary || diagnostics.paths?.helperScript || '未解析' },
      { label: '插件目录', value: diagnostics.pluginBasePath || '未解析' },
      { label: '日志文件', value: diagnostics.paths?.logFile || '未解析' },
      { label: '卡住进程', value: staleProcesses.length > 0 ? staleProcesses.map(processInfo => `${processInfo.pid}`).join(', ') : '无' }
    ];

    if (lastResult) {
      rows.push(
        { label: '最近启动阶段', value: `${lastResult.stage} / ${lastResult.method}` },
        { label: '最近启动结果', value: lastResult.message }
      );
      if (lastResult.error) {
        rows.push({ label: '最近错误', value: lastResult.error });
      }
      if (lastResult.logTail) {
        rows.push({ label: '日志片段', value: lastResult.logTail });
      }
    }

    return rows;
  }

  private getNativeHelperStatusText(status: 'running' | 'stopped' | 'stale'): string {
    if (status === 'running') {
      return '运行中';
    }
    if (status === 'stale') {
      return '进程卡住，服务未响应';
    }
    return '未运行';
  }

  private async copyNativeHelperDiagnostics() {
    if (!this.lastNativeHelperDiagnosticsText) {
      await this.refreshNativeHelperStatus();
    }

    try {
      await navigator.clipboard.writeText(this.lastNativeHelperDiagnosticsText);
      showMessage('诊断信息已复制');
    } catch (error) {
      console.error('[WeatherLocation] 复制定位辅助器诊断信息失败:', error);
      showMessage('复制失败，请手动选择诊断信息');
    }
  }

  // 绑定城市搜索事件（使用事件委托，避免重复绑定）
  private bindCitySearchEvents() {
    const container = document.getElementById('weather-location-settings');
    if (!container) return;

    const searchInput = container.querySelector('#favorite-city-search') as HTMLInputElement;
    const searchResults = container.querySelector('#city-search-results') as HTMLDivElement;

    if (!searchInput || !searchResults) return;

    // 检查是否已经绑定过事件（通过自定义属性标记）
    if ((searchInput as any)._eventsBound) {
      console.log('[WeatherLocation] 城市搜索事件已绑定，跳过');
      return;
    }
    (searchInput as any)._eventsBound = true;

    let currentResults: CitySearchResult[] = [];
    let searchTimeout: NodeJS.Timeout | null = null;

    // 输入事件（防抖）
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();

      // 清除之前的定时器
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      if (query.length < 2) {
        searchResults.style.display = 'none';
        return;
      }

      // 延迟搜索，避免频繁请求
      searchTimeout = setTimeout(async () => {
        showMessage('正在搜索...');
        currentResults = await this.searchCities(query);

        if (currentResults.length > 0) {
          searchResults.innerHTML = this.renderSearchResults(currentResults);
          searchResults.style.display = 'block';
        } else {
          searchResults.innerHTML = '<div style="padding: 10px; color: #999; font-size: 14px;">未找到匹配的地点，请尝试其他关键词</div>';
          searchResults.style.display = 'block';
        }
      }, 500);
    });

    // 点击搜索结果
    searchResults.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const resultItem = target.closest('.city-search-result') as HTMLElement;

      if (resultItem) {
        const index = parseInt(resultItem.dataset.index || '0');
        const selectedCity = currentResults[index];

        if (selectedCity && this.addFavoriteCity(selectedCity)) {
          await this.saveConfig();
          this.updateFavoriteCitiesUI();
          showMessage(`已添加 ${selectedCity.name}`);
          searchInput.value = '';
          searchResults.style.display = 'none';
          currentResults = [];
        }
      }
    });

    // 搜索结果悬停高亮
    searchResults.addEventListener('mouseover', (e) => {
      const target = (e.target as HTMLElement).closest('.city-search-result') as HTMLElement;
      if (target) {
        target.style.backgroundColor = '#f5f5f5';
      }
    });

    searchResults.addEventListener('mouseout', (e) => {
      const target = (e.target as HTMLElement).closest('.city-search-result') as HTMLElement;
      if (target) {
        target.style.backgroundColor = '';
      }
    });

    // 点击外部关闭搜索结果
    document.addEventListener('click', (e) => {
      if (!searchInput.contains(e.target as Node) && !searchResults.contains(e.target as Node)) {
        searchResults.style.display = 'none';
      }
    });

    // 键盘导航
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchResults.style.display = 'none';
      }
    });
  }

  // 更新常用城市相关UI
  private updateFavoriteCitiesUI() {
    // 更新城市列表
    this.updateFavoriteCitiesList();

    // 更新搜索容器的显示状态
    const searchContainer = document.getElementById('favorite-city-search-container');

    if (this.config.favoriteCities.length >= MAX_FAVORITE_CITIES) {
      // 达到最大数量，隐藏搜索容器
      if (searchContainer) {
        searchContainer.style.display = 'none';
      }
    } else {
      // 未达到最大数量，显示搜索容器
      if (searchContainer) {
        searchContainer.style.display = 'block';
      }
    }
  }

  // 搜索地点（高德地图）：双接口并行——输入提示（POI 级，支持小区/写字楼等）
  // 与地理编码（城市/区县/标准地址），合并去重后返回
  private async searchCities(query: string): Promise<CitySearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    console.log('[WeatherLocation] 开始搜索地点:', query);

    const amapKey = this.config.amapKey;
    if (!amapKey) {
      throw new Error('未配置高德地图 Key，无法搜索地点');
    }

    let geocodeError: Error | null = null;
    let tipsError: Error | null = null;
    const [geocodes, tips] = await Promise.all([
      this.searchAmapGeocode(query, amapKey).catch((error: Error) => { geocodeError = error; return []; }),
      this.searchAmapInputTips(query, amapKey).catch((error: Error) => { tipsError = error; return []; })
    ]);

    if (geocodeError && tipsError) {
      throw geocodeError;
    }
    if (geocodeError) console.warn('[WeatherLocation] 地理编码搜索失败，仅使用 POI 结果:', geocodeError);
    if (tipsError) console.warn('[WeatherLocation] POI 搜索失败，仅使用地理编码结果:', tipsError);

    // 地理编码结果（城市/地址级）在前，POI 结果（小区/楼宇等）在后
    const seen = new Set<string>();
    const results: CitySearchResult[] = [];
    for (const item of [...geocodes, ...tips]) {
      if (!item.name || Number.isNaN(item.lat) || Number.isNaN(item.lon)) {
        continue;
      }
      const key = `${item.name}-${item.lat.toFixed(5)}-${item.lon.toFixed(5)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      results.push(item);
      if (results.length >= 10) {
        break;
      }
    }

    console.log('[WeatherLocation] 搜索结果:', results);
    if (results.length === 0) {
      showMessage('未找到匹配的地点');
    }
    return results;
  }

  // 高德地理编码：城市、区县、标准地址
  private async searchAmapGeocode(query: string, amapKey: string): Promise<CitySearchResult[]> {
    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(query)}&key=${amapKey}`;
    const data = await this.fetchAmapJson(url);
    console.log('[WeatherLocation] 高德地理编码返回数据:', data);

    if (!Array.isArray(data.geocodes)) {
      return [];
    }

    return data.geocodes.map((item: any) => {
      const displayName = item.formatted_address || item.district || item.city || item.province || query;
      const [lonText, latText] = String(item.location || '').split(',');
      return {
        name: displayName || query,
        lat: parseFloat(latText),
        lon: parseFloat(lonText),
        displayName,
        address: displayName
      };
    });
  }

  // 高德输入提示：POI 级联想，支持小区、商场、写字楼等详细地点
  private async searchAmapInputTips(query: string, amapKey: string): Promise<CitySearchResult[]> {
    const url = `https://restapi.amap.com/v3/assistant/inputtips?keywords=${encodeURIComponent(query)}&key=${amapKey}&datatype=poi`;
    const data = await this.fetchAmapJson(url);
    console.log('[WeatherLocation] 高德输入提示返回数据:', data);

    if (!Array.isArray(data.tips)) {
      return [];
    }

    return data.tips.map((item: any) => {
      const [lonText, latText] = String(item.location || '').split(',');
      // 无结果时高德的 district/address 可能是空数组而不是字符串
      const district = typeof item.district === 'string' ? item.district : '';
      const address = typeof item.address === 'string' ? item.address : '';
      const displayName = `${district}${address}` || district || String(item.name || '');
      return {
        name: String(item.name || ''),
        lat: parseFloat(latText),
        lon: parseFloat(lonText),
        displayName,
        address: displayName || String(item.name || ''),
        badge: this.getAmapTypeBadge(String(item.typecode || ''))
      };
    });
  }

  // 高德 POI 类型码 → 中文徽标（只标注能识别的常见类别，其余不显示）
  private getAmapTypeBadge(typecode: string): string | undefined {
    if (typecode.startsWith('1203')) return '小区';
    if (typecode.startsWith('1202')) return '写字楼';
    if (typecode.startsWith('1201')) return '园区';
    if (typecode.startsWith('06')) return '购物';
    if (typecode.startsWith('05')) return '餐饮';
    if (typecode.startsWith('14')) return '学校';
    if (typecode.startsWith('09')) return '医院';
    if (typecode.startsWith('11')) return '景点';
    if (typecode.startsWith('10')) return '酒店';
    if (typecode.startsWith('15')) return '交通';
    return undefined;
  }

  // 高德 API 请求（带超时与状态检查）
  private async fetchAmapJson(url: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`高德地图 API 请求失败: ${response.status}`);
      }
      const data = await response.json();
      if (data.status !== '1') {
        throw new Error(data.info || '搜索失败');
      }
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // 渲染搜索结果
  private renderSearchResults(results: CitySearchResult[]): string {
    if (results.length === 0) {
      return '<div style="padding: 10px; color: #999; font-size: 14px;">未找到匹配的地点</div>';
    }

    return results.map((city, index) => `
      <div class="city-search-result" data-index="${index}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 14px;">
        <div style="font-weight: 500;">${this.escapeHtml(city.name)}${city.badge ? `<span class="wl-result-badge">${this.escapeHtml(city.badge)}</span>` : ''}</div>
        <div style="font-size: 12px; color: #999; margin-top: 2px;">${this.escapeHtml(city.displayName)}</div>
      </div>
    `).join('');
  }

  // 渲染常用地点列表
  private renderFavoriteCitiesList(): string {
    if (this.config.favoriteCities.length === 0) {
      return '<div style="color: #999; font-size: 14px; padding: 10px; text-align: center;">暂无常用地点</div>';
    }

    return this.config.favoriteCities.map((city, index) => {
      return `
      <div class="favorite-city-item" data-index="${index}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 6px; background: #f5f5f5; border-radius: 4px;">
        <div style="flex: 1;">
          <div style="font-size: 14px; font-weight: 500;">${this.escapeHtml(city.name)}</div>
          <div style="font-size: 12px; color: #666; margin-top: 2px;">
            坐标: ${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="edit-favorite-city" data-index="${index}" style="padding: 4px 8px; border: none; background: #1890ff; color: white; border-radius: 3px; cursor: pointer; font-size: 12px;">编辑</button>
          <button class="remove-favorite-city" data-index="${index}" style="padding: 4px 8px; border: none; background: #ff4d4f; color: white; border-radius: 3px; cursor: pointer; font-size: 12px;">删除</button>
        </div>
      </div>
    `}).join('');
  }

  // 添加常用地点
  private addFavoriteCity(city: CitySearchResult): boolean {
    // 检查是否已达到最大数量
    if (this.config.favoriteCities.length >= MAX_FAVORITE_CITIES) {
      showMessage(`最多只能添加 ${MAX_FAVORITE_CITIES} 个常用地点`);
      return false;
    }

    if (!city || !city.name) {
      showMessage('请选择地点');
      return false;
    }

    // 检查是否已存在
    const exists = this.config.favoriteCities.some(c => c.name === city.name);
    if (exists) {
      showMessage('该地点已存在');
      return false;
    }

    this.config.favoriteCities.push({
      name: city.name,
      lat: city.lat,
      lon: city.lon,
      address: city.address || city.displayName || city.name
    });
    return true;
  }

  // 删除常用地点
  private removeFavoriteCity(index: number) {
    if (index >= 0 && index < this.config.favoriteCities.length) {
      this.config.favoriteCities.splice(index, 1);
    }
  }

  // 手动录入地点
  private addManualCity(name: string, lat: number, lon: number): boolean {
    // 检查是否已达到最大数量
    if (this.config.favoriteCities.length >= MAX_FAVORITE_CITIES) {
      showMessage(`最多只能添加 ${MAX_FAVORITE_CITIES} 个常用地点`);
      return false;
    }

    if (!name || Number.isNaN(lat) || Number.isNaN(lon)) {
      showMessage('请填写完整的地点信息');
      return false;
    }

    // 检查是否已存在
    const exists = this.config.favoriteCities.some(c => c.name === name);
    if (exists) {
      showMessage('该地点已存在');
      return false;
    }

    this.config.favoriteCities.push({
      name: name.trim(),
      lat: lat,
      lon: lon,
      address: name.trim()
    });

    return true;
  }

  // 编辑常用地点
  private editFavoriteCity(index: number, updates: Partial<FavoriteCity>): boolean {
    if (index < 0 || index >= this.config.favoriteCities.length) {
      showMessage('地点索引无效');
      return false;
    }

    const city = this.config.favoriteCities[index];

    // 检查名称是否与其他地点重复
    if (updates.name && updates.name !== city.name) {
      const exists = this.config.favoriteCities.some((c, i) => i !== index && c.name === updates.name);
      if (exists) {
        showMessage('该地点名称已存在');
        return false;
      }
    }

    // 更新地点信息
    const updatedCity: FavoriteCity = {
      ...city,
      ...updates,
      name: updates.name?.trim() || city.name
    };

    this.config.favoriteCities[index] = updatedCity;

    console.log(`[WeatherLocation] 更新地点 ${index}:`, this.config.favoriteCities[index]);
    return true;
  }

  // 显示编辑地点对话框
  private showEditCityDialog(index: number) {
    const city = this.config.favoriteCities[index];
    if (!city) return;

    const dialog = new Dialog({
      title: `编辑地点 - ${this.escapeHtml(city.name)}`,
      content: `
        <div id="edit-city-dialog" style="padding: 20px; min-width: 300px;">
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">地点名称</label>
            <input type="text" id="edit-city-name" value="${this.escapeAttribute(city.name)}" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">纬度</label>
            <input type="text" id="edit-city-lat" value="${city.lat}" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">经度</label>
            <input type="text" id="edit-city-lon" value="${city.lon}" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button id="edit-city-cancel" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 14px;">取消</button>
            <button id="edit-city-save" style="padding: 8px 16px; border: 1px solid #1890ff; border-radius: 4px; background: #1890ff; color: white; cursor: pointer; font-size: 14px;">保存</button>
          </div>
        </div>
      `,
      width: '400px'
    });

    // 绑定保存和取消事件
    setTimeout(() => {
      const container = document.getElementById('edit-city-dialog');
      if (!container) return;

      const cancelBtn = container.querySelector('#edit-city-cancel') as HTMLButtonElement;
      const saveBtn = container.querySelector('#edit-city-save') as HTMLButtonElement;

      cancelBtn?.addEventListener('click', () => {
        dialog.destroy();
      });

      saveBtn?.addEventListener('click', async () => {
        const nameInput = container.querySelector('#edit-city-name') as HTMLInputElement;
        const latInput = container.querySelector('#edit-city-lat') as HTMLInputElement;
        const lonInput = container.querySelector('#edit-city-lon') as HTMLInputElement;

        const name = nameInput.value.trim();
        const lat = parseFloat(latInput.value);
        const lon = parseFloat(lonInput.value);

        if (!name || isNaN(lat) || isNaN(lon)) {
          showMessage('请填写完整的地点信息');
          return;
        }

        if (this.editFavoriteCity(index, {
          name,
          lat,
          lon
        })) {
          await this.saveConfig();
          this.updateFavoriteCitiesUI();
          dialog.destroy();
          showMessage('地点信息已更新');
        }
      });
    }, 100);
  }

  // 更新常用地点列表显示
  private updateFavoriteCitiesList() {
    const listContainer = document.getElementById('favorite-cities-list');
    if (listContainer) {
      listContainer.innerHTML = this.renderFavoriteCitiesList();
      this.bindFavoriteCitiesEvents();
    }
  }

  // 绑定常用地点事件（使用事件委托，避免重复绑定）
  private bindFavoriteCitiesEvents() {
    const container = document.getElementById('weather-location-settings');
    if (!container) return;

    // 检查是否已经绑定过事件（通过自定义属性标记）
    if ((container as any)._favoriteEventsBound) {
      console.log('[WeatherLocation] 常用地点事件已绑定，跳过');
      return;
    }
    (container as any)._favoriteEventsBound = true;

    // 使用事件委托，在容器上监听点击事件
    container.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      // 处理删除按钮
      const removeBtn = target.closest('.remove-favorite-city') as HTMLElement;
      if (removeBtn) {
        const index = parseInt(removeBtn.dataset.index || '0');
        this.removeFavoriteCity(index);
        await this.saveConfig();
        this.updateFavoriteCitiesUI();
        showMessage('地点已删除');
        return;
      }

      // 处理编辑按钮
      const editBtn = target.closest('.edit-favorite-city') as HTMLElement;
      if (editBtn) {
        const index = parseInt(editBtn.dataset.index || '0');
        this.showEditCityDialog(index);
        return;
      }
    });
  }

  // 绑定添加方式切换事件
  private bindAddModeToggleEvents() {
    const container = document.getElementById('weather-location-settings');
    if (!container) return;

    const searchModeBtn = container.querySelector('#toggle-search-mode') as HTMLButtonElement;
    const manualModeBtn = container.querySelector('#toggle-manual-mode') as HTMLButtonElement;
    const searchPanel = container.querySelector('#search-city-panel') as HTMLDivElement;
    const manualPanel = container.querySelector('#manual-city-panel') as HTMLDivElement;

    if (!searchModeBtn || !manualModeBtn || !searchPanel || !manualPanel) return;

    searchModeBtn.addEventListener('click', () => {
      searchModeBtn.classList.add('active');
      searchModeBtn.style.background = '#1890ff';
      searchModeBtn.style.color = 'white';
      searchModeBtn.style.borderColor = '#1890ff';

      manualModeBtn.classList.remove('active');
      manualModeBtn.style.background = 'white';
      manualModeBtn.style.color = '';
      manualModeBtn.style.borderColor = '#ddd';

      searchPanel.style.display = 'block';
      manualPanel.style.display = 'none';
    });

    manualModeBtn.addEventListener('click', () => {
      manualModeBtn.classList.add('active');
      manualModeBtn.style.background = '#1890ff';
      manualModeBtn.style.color = 'white';
      manualModeBtn.style.borderColor = '#1890ff';

      searchModeBtn.classList.remove('active');
      searchModeBtn.style.background = 'white';
      searchModeBtn.style.color = '';
      searchModeBtn.style.borderColor = '#ddd';

      manualPanel.style.display = 'block';
      searchPanel.style.display = 'none';
    });
  }

  // 绑定手动录入地点事件
  private bindManualCityEvents() {
    const container = document.getElementById('weather-location-settings');
    if (!container) return;

    const addBtn = container.querySelector('#add-manual-city-btn') as HTMLButtonElement;
    if (!addBtn) return;

    // 检查是否已经绑定过
    if ((addBtn as any)._eventsBound) {
      return;
    }
    (addBtn as any)._eventsBound = true;

    addBtn.addEventListener('click', async () => {
      const nameInput = container.querySelector('#manual-city-name') as HTMLInputElement;
      const latInput = container.querySelector('#manual-city-lat') as HTMLInputElement;
      const lonInput = container.querySelector('#manual-city-lon') as HTMLInputElement;

      const name = nameInput.value.trim();
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);

      if (!name) {
        showMessage('请输入地点名称');
        return;
      }

      if (isNaN(lat) || isNaN(lon)) {
        showMessage('请输入有效的经纬度');
        return;
      }

      if (this.addManualCity(name, lat, lon)) {
        await this.saveConfig();
        this.updateFavoriteCitiesUI();
        showMessage(`已添加地点：${name}`);

        // 清空输入框
        nameInput.value = '';
        latInput.value = '';
        lonInput.value = '';
      }
    });
  }

  // 测试数据获取
  private async testDataFetch() {
    try {
      console.log('[WeatherLocation] 开始测试数据获取...');
      showMessage('正在获取数据...');

      const data = await this.getTemplateData();
      if (!data) {
        showMessage('获取失败：天气或位置信息不可用');
        return;
      }

      const result = `天气: ${data.weather.description}
温度: ${data.weather.temperature}°C
位置: ${data.location.city}`;

      console.log('[WeatherLocation] 测试数据获取成功:', result);
      showMessage('获取成功!');
    } catch (error) {
      console.error('[WeatherLocation] 测试数据获取失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      showMessage(`获取失败: ${errorMessage}`);
    }
  }

  // 获取天气数据
  async getWeatherData(): Promise<WeatherData | null> {
    try {
      const location = await this.locationService.getCurrentLocation();
      if (!location) {
        showMessage('无法获取位置信息。请检查：\n1. 网络连接是否正常\n2. 高德地图 Key 是否已配置\n3. 浏览器定位权限是否已开启');
        return null;
      }

      const weather = await this.weatherService.getWeather(location.lat, location.lon);
      return weather;
    } catch (error) {
      showMessage('获取天气信息失败: ' + (error as Error).message);
      return null;
    }
  }

  // 获取指定城市的天气数据
  async getWeatherDataForCity(city: FavoriteCity): Promise<WeatherData | null> {
    try {
      const weather = await this.weatherService.getWeather(city.lat, city.lon);
      return weather;
    } catch (error) {
      showMessage(`获取 ${city.name} 天气信息失败: ` + (error as Error).message);
      return null;
    }
  }

  // 获取指定城市的模板数据
  async getTemplateDataForCity(city: FavoriteCity): Promise<any | null> {
    const weather = await this.getWeatherDataForCity(city);
    if (!weather) {
      return null;
    }

    return {
      weather,
      location: this.getSavedLocationInfo(city),
      time: new Date().toLocaleString('zh-CN')
    };
  }

  // 常用地点直接使用设置中保存的信息，不再用高德反查覆盖具体地址。
  private getSavedLocationInfo(city: FavoriteCity): any {
    const savedAddress = city.address || city.name;
    return {
      city: city.name,
      country: '',
      province: '',
      district: '',
      township: '',
      street: '',
      streetNumber: '',
      formatted_address: savedAddress,
      lat: city.lat,
      lon: city.lon,
      region: ''
    };
  }

  // 获取位置数据
  async getLocationData(): Promise<LocationData | null> {
    try {
      const location = await this.locationService.getCurrentLocation();
      if (!location) {
        showMessage('无法获取位置信息。建议：\n1. 检查网络连接\n2. 尝试切换位置获取方式\n3. 配置手动位置（格式：城市名,纬度,经度）');
        return null;
      }
      return location;
    } catch (error) {
      showMessage('获取位置信息失败: ' + (error as Error).message);
      return null;
    }
  }

  // 获取完整数据对象（用于模板）
  async getTemplateData(): Promise<any | null> {
    const [weather, location] = await Promise.all([
      this.getWeatherData(),
      this.getLocationData()
    ]);
    if (!weather || !location) {
      return null;
    }

    return {
      weather,
      location,
      time: new Date().toLocaleString('zh-CN')
    };
  }

  // 插入天气到当前文档
  private async insertWeatherToCurrentDoc() {
    const weather = await this.getWeatherData();
    if (!weather) return;

    const content = this.formatWeatherContent(weather);
    await this.insertContentToCurrentDoc(content);
  }

  // 插入位置到当前文档
  private async insertLocationToCurrentDoc() {
    const location = await this.getLocationData();
    if (!location) return;

    const content = this.formatLocationContent(location);
    await this.insertContentToCurrentDoc(content);
  }

  // 插入模板到当前文档
  private async insertTemplateToCurrentDoc() {
    const data = await this.getTemplateData();
    if (!data) return;
    const content = this.renderConfiguredOutput(data);
    await this.insertContentToCurrentDoc(content);
  }

  // 在指定块插入天气
  private async insertWeatherAtBlock(blockId: string) {
    const weather = await this.getWeatherData();
    if (!weather) return;

    const content = this.formatWeatherContent(weather);
    await this.insertContentAtBlock(blockId, content);
  }

  // 在指定块插入位置
  private async insertLocationAtBlock(blockId: string) {
    const location = await this.getLocationData();
    if (!location) return;

    const content = this.formatLocationContent(location);
    await this.insertContentAtBlock(blockId, content);
  }

  // 在指定块插入模板
  private async insertTemplateAtBlock(blockId: string) {
    const data = await this.getTemplateData();
    if (!data) return;
    const content = this.renderConfiguredOutput(data);
    await this.insertContentAtBlock(blockId, content);
  }

  // 格式化天气内容
  private formatWeatherContent(weather: WeatherData): string {
    const parts = [
      `**天气**: ${weather.description}`,
      `**温度**: ${weather.temperature}°C`,
      `**湿度**: ${weather.humidity}%`
    ];

    if (weather.windDirection) {
      parts.push(`**风向**: ${weather.windDirection}`);
    }

    if (weather.windPower) {
      parts.push(`**风力**: ${weather.windPower}`);
    }

    parts.push(`**风速**: ${weather.windSpeed} m/s`);

    return parts.join(' | ');
  }

  // 格式化位置内容
  private formatLocationContent(location: LocationData): string {
    const parts = [`**位置**: ${location.city}`];

    if (location.region) {
      parts.push(`**区域**: ${location.region}`);
    }

    if (location.district) {
      parts.push(`**区县**: ${location.district}`);
    }

    if (location.preciseAddress) {
      parts.push(`**精确地址**: ${location.preciseAddress}`);
    }

    if (location.nearestPlace) {
      parts.push(`**附近地点**: ${location.nearestPlace}`);
    }

    if (location.formatted_address) {
      parts.push(`**详细地址**: ${location.formatted_address}`);
    }

    if (location.country) {
      parts.push(`**国家**: ${location.country}`);
    }

    return parts.join(' | ');
  }

  // 插入内容到当前文档
  private async insertContentToCurrentDoc(content: string) {
    const activeElement = document.activeElement;
    if (activeElement?.classList.contains('protyle-wysiwyg')) {
      // 在编辑器中，使用API插入
      const selection = window.getSelection();
      const blockElement = selection?.anchorNode?.parentElement?.closest('[data-node-id]');
      if (blockElement) {
        const blockId = blockElement.getAttribute('data-node-id');
        if (blockId) {
          await this.insertContentAtBlock(blockId, content);
        }
      }
    }
  }

  // 在指定块后插入内容
  private async insertContentAtBlock(blockId: string, content: string) {
    try {
      await this.appendBlock(blockId, content);
      showMessage('内容已插入');
    } catch (error) {
      showMessage('插入内容失败');
    }
  }

  // 插入斜杠命令内容：保留触发词前面的行内容，只移除 /tq 等触发词。
  private async replaceBlockContent(blockId: string, content: string, triggers: string[] = []) {
    try {
      const currentMarkdown = await this.getBlockMarkdown(blockId);
      const { content: blockContent, ial } = splitBlockIAL(currentMarkdown);
      const keptMarkdown = removeSlashTrigger(blockContent, triggers);
      const nextContent = withBlockIAL(keptMarkdown ? `${keptMarkdown} ${content}` : content, ial);
      await this.updateBlock(blockId, nextContent);
      showMessage('天气位置已插入');
    } catch (error) {
      showMessage('插入内容失败');
    }
  }


  private async getBlockMarkdown(blockId: string): Promise<string> {
    const response = await fetch('/api/block/getBlockKramdown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: blockId })
    });

    if (!response.ok) {
      throw new Error('API请求失败');
    }

    const result = await response.json();
    return result?.data?.kramdown || '';
  }

  // 使用思源API追加块
  private async appendBlock(blockId: string, content: string) {
    const response = await fetch('/api/block/appendBlock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: content,
        dataType: 'markdown',
        parentID: blockId
      })
    });

    if (!response.ok) {
      throw new Error('API请求失败');
    }

    return response.json();
  }

  // 更新指定块内容
  private async updateBlock(blockId: string, content: string) {
    const response = await fetch('/api/block/updateBlock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: blockId,
        dataType: 'markdown',
        data: content
      })
    });

    if (!response.ok) {
      throw new Error('API请求失败');
    }

    return response.json();
  }

  // 在指定块后插入多块 Markdown（安全处理标题、空行等多块内容）
  private async insertBlockAfter(blockId: string, content: string) {
    const response = await fetch('/api/block/insertBlock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dataType: 'markdown',
        data: content,
        previousID: blockId
      })
    });

    if (!response.ok) {
      throw new Error('API请求失败');
    }

    return response.json();
  }

  // 获取配置
  getConfig(): PluginConfig {
    return this.config;
  }

  // 更新配置
  updateConfig(newConfig: Partial<PluginConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  // 检测是否为移动端设备
  private isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
  }
}

module.exports = WeatherLocationPlugin;
