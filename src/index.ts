import { Plugin, showMessage, Dialog } from 'siyuan';
import { WeatherService, WeatherData } from './weather';
import { LocationService, LocationData } from './location';
import { TemplateEngine } from './template';
import { SettingTab } from './setting';

const STORAGE_NAME = 'weather-location-config';
const MAX_FAVORITE_CITIES = 5;
const AMAP_KEY_MASK = '********';
const DEFAULT_TEMPLATE_ID = 'default-template';

interface FavoriteCity {
  name: string;
  lat: number;
  lon: number;
  pinyinPrefix: string; // 地点名首字母缩写，如"北京"->"bj"
  address?: string;
}

// 地点搜索结果接口
interface CitySearchResult {
  name: string;
  lat: number;
  lon: number;
  displayName: string;
  address: string;
}

interface SavedTemplate {
  id: string;
  name: string;
  content: string;
}

// 常用汉字拼音首字母映射表（基于实际拼音，处理多音字）
const PINYIN_FIRST_LETTERS: Record<string, string> = {
  // A
  '阿': 'a', '安': 'a', '澳': 'a', '敖': 'a',
  // B
  '北': 'b', '宝': 'b', '本': 'b', '巴': 'b', '包': 'b', '滨': 'b', '蚌': 'b', '亳': 'b',
  // C
  '长': 'c', '成': 'c', '重': 'c', '沧': 'c', '昌': 'c', '潮': 'c', '郴': 'c', '常': 'c',
  // D
  '大': 'd', '东': 'd', '丹': 'd', '德': 'd', '定': 'd', '迪': 'd', '达': 'd',
  // E
  '鄂': 'e', '恩': 'e', '尔': 'e',
  // F
  '福': 'f', '佛': 'f', '抚': 'f', '阜': 'f', '防': 'f', '丰': 'f',
  // G
  '广': 'g', '贵': 'g', '桂': 'g', '甘': 'g', '赣': 'g', '固': 'g', '港': 'g',
  // H
  '哈': 'h', '海': 'h', '杭': 'h', '合': 'h', '河': 'h', '呼': 'h', '惠': 'h', '湖': 'h', '衡': 'h', '淮': 'h', '黄': 'h', '华': 'h', '菏': 'h', '怀': 'h', '鹤': 'h', '汉': 'h', '洪': 'h',
  // J
  '济': 'j', '江': 'j', '吉': 'j', '金': 'j', '嘉': 'j', '佳': 'j', '建': 'j', '揭': 'j', '晋': 'j', '荆': 'j', '景': 'j', '九': 'j', '酒': 'j',
  // K
  '昆': 'k', '喀': 'k', '开': 'k', '克': 'k',
  // L
  '兰': 'l', '拉': 'l', '柳': 'l', '洛': 'l', '聊': 'l', '临': 'l', '六': 'l', '丽': 'l', '连': 'l', '廊': 'l', '辽': 'l', '莱': 'l', '泸': 'l', '潞': 'l',
  // M
  '茂': 'm', '梅': 'm', '牡': 'm', '绵': 'm', '明': 'm', '马': 'm', '眉': 'm',
  // N
  '南': 'n', '宁': 'n', '内': 'n',
  // P
  '平': 'p', '莆': 'p', '濮': 'p', '盘': 'p', '攀': 'p',
  // Q
  '青': 'q', '泉': 'q', '衢': 'q', '曲': 'q', '秦': 'q', '庆': 'q', '清': 'q', '钦': 'q', '七': 'q',
  // R
  '日': 'r', '荣': 'r', '榕': 'r', '仁': 'r', '任': 'r', '如': 'r', '瑞': 'r',
  // S
  '上': 's', '深': 's', '石': 's', '沈': 's', '苏': 's', '山': 's', '汕': 's', '绍': 's', '宿': 's', '朔': 's', '松': 's', '双': 's', '三': 's', '沙': 's', '十': 's', '邵': 's', '随': 's', '遂': 's',
  // T
  '太': 't', '台': 't', '泰': 't', '唐': 't', '天': 't', '铜': 't', '通': 't', '吐': 't', '桐': 't', '潭': 't',
  // W
  '武': 'w', '乌': 'w', '温': 'w', '渭': 'w', '潍': 'w', '威': 'w', '芜': 'w', '梧': 'w', '吴': 'w', '无': 'w', '卫': 'w', '文': 'w',
  // X
  '西': 'x', '厦': 'x', '新': 'x', '徐': 'x', '宣': 'x', '咸': 'x', '孝': 'x', '湘': 'x', '襄': 'x', '邢': 'x', '信': 'x', '许': 'x', '忻': 'x', '锡': 'x', '奚': 'x',
  // Y
  '银': 'y', '延': 'y', '烟': 'y', '盐': 'y', '扬': 'y', '阳': 'y', '宜': 'y', '益': 'y', '永': 'y', '岳': 'y', '玉': 'y', '云': 'y', '运': 'y', '榆': 'y', '鹰': 'y', '义': 'y', '姚': 'y', '禹': 'y', '虞': 'y',
  // Z
  '郑': 'z', '珠': 'z', '湛': 'z', '肇': 'z', '中': 'z', '淄': 'z', '枣': 'z', '张': 'z', '镇': 'z', '舟': 'z', '漳': 'z', '遵': 'z', '株': 'z', '驻': 'z', '资': 'z', '邹': 'z',
};

// 获取城市名称的拼音首字母
function getPinyinPrefix(cityName: string): string {
  if (!cityName) return '';

  // 取前两个字（通常是城市名的核心部分）
  const chars = cityName.slice(0, 2).split('');
  const prefix = chars.map(char => {
    // 如果是英文字母，直接返回小写
    if (/[a-zA-Z]/.test(char)) {
      return char.toLowerCase();
    }
    // 如果是数字，跳过
    if (/\d/.test(char)) {
      return '';
    }
    // 从映射表中查找
    if (PINYIN_FIRST_LETTERS[char]) {
      return PINYIN_FIRST_LETTERS[char];
    }
    // 如果映射表中没有，返回空字符串（避免错误映射）
    console.warn(`[WeatherLocation] 未找到汉字 "${char}" 的拼音映射`);
    return '';
  }).join('');

  return prefix;
}

interface PluginConfig {
  amapKey: string;
  template: string;
  favoriteCities: FavoriteCity[];
  templates: SavedTemplate[];
  activeTemplateId: string;
}

const DEFAULT_CONFIG: PluginConfig = {
  amapKey: '',
  template: `## 今日天气与位置

🌤 **天气状况**: {{weather.description}}
{{#if weather.dayWeather}}☀️ **白天天气**: {{weather.dayWeather}}
{{/if}}{{#if weather.nightWeather}}🌙 **夜间天气**: {{weather.nightWeather}}
{{/if}}🌡 **当前温度**: {{weather.temperature}}°C
💧 **相对湿度**: {{weather.humidity}}%
🌬 **风向**: {{weather.windDirection}}
💨 **风力**: {{weather.windPower}}
📊 **风速**: {{weather.windSpeed}} m/s
🔽 **最低温度**: {{weather.tempMin}}°C
🔼 **最高温度**: {{weather.tempMax}}°C

📍 **当前位置**: {{location.city}}
{{#if location.province}}🏛 **省份**: {{location.province}}
{{/if}}{{#if location.district}}🏙 **区县**: {{location.district}}
{{/if}}{{#if location.township}}🏘 **乡镇/街道**: {{location.township}}
{{/if}}{{#if location.street}}🛣 **街道**: {{location.street}}
{{/if}}{{#if location.streetNumber}}🔢 **门牌号**: {{location.streetNumber}}
{{/if}}{{#if location.formatted_address}}📝 **详细地址**: {{location.formatted_address}}
{{/if}}{{#if location.country}}🌍 **国家**: {{location.country}}
{{/if}}🌐 **坐标**: {{location.lat}}, {{location.lon}}

⏰ **记录时间**: {{time}}
`,
  favoriteCities: [],
  templates: [],
  activeTemplateId: DEFAULT_TEMPLATE_ID
};

class WeatherLocationPlugin extends Plugin {
  private config!: PluginConfig;
  private weatherService!: WeatherService;
  private locationService!: LocationService;
  private templateEngine!: TemplateEngine;
  private slashCommandsRegistered: boolean = false; // 标记斜杠命令是否已注册

  async onload() {
    console.log('[WeatherLocation] Plugin loading...');
    
    try {
      // 加载配置
      await this.loadConfig();
      console.log('[WeatherLocation] Config loaded:', this.config);
      
      // 初始化服务
      this.weatherService = new WeatherService(this.config);
      this.locationService = new LocationService(this.config);
      this.templateEngine = new TemplateEngine();
      
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
    const config = { ...DEFAULT_CONFIG, ...(stored || {}) };
    const savedTemplates = Array.isArray(config.templates) ? config.templates : [];
    const defaultTemplate: SavedTemplate = {
      id: DEFAULT_TEMPLATE_ID,
      name: '默认模板',
      content: DEFAULT_CONFIG.template
    };
    const customTemplates = savedTemplates
      .filter(template => template && template.id !== DEFAULT_TEMPLATE_ID)
      .map((template, index) => ({
        id: template.id || `custom-template-${Date.now()}-${index}`,
        name: template.name || `模板${this.getTemplateNumberName(index + 1)}`,
        content: template.content || ''
      }));

    config.templates = [defaultTemplate, ...customTemplates];

    const activeTemplate = config.templates.find(template => template.id === config.activeTemplateId);
    if (!activeTemplate) {
      const matchingTemplate = config.templates.find(template => template.content === config.template);
      config.activeTemplateId = matchingTemplate?.id || DEFAULT_TEMPLATE_ID;
    }

    if (!config.template) {
      config.template = config.templates.find(template => template.id === config.activeTemplateId)?.content || DEFAULT_CONFIG.template;
    }

    return config;
  }

  private getTemplateNumberName(index: number): string {
    const chineseNumbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    return chineseNumbers[index - 1] || String(index);
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

  async saveConfig() {
    try {
      await this.saveData(STORAGE_NAME, this.config);
      // 更新服务配置
      this.weatherService.updateConfig(this.config);
      this.locationService.updateConfig(this.config);
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

  // 更新斜杠命令（用于配置更新时，避免完全重新注册导致重复）
  private updateSlashCommands() {
    console.log('[WeatherLocation] Updating slash commands...');
    
    // 保留第一个命令（插入天气位置模板），只更新城市相关命令
    const baseCommands = this.protyleSlash && this.protyleSlash.length > 0 
      ? [this.protyleSlash[0]] 
      : [{
          filter: ['天气位置', 'weather location', 'tianqi weizhi', '/tq', '/天气'],
          html: '<span class="b3-list-item__text">🌤📍 插入天气位置模板</span>',
          id: 'insert-weather-location-template',
          callback: async (protyle: any, nodeElement: HTMLElement) => {
            const data = await this.getTemplateData();
            if (!data) return;
            const content = this.templateEngine.render(this.config.template, data);
            this.replaceBlockContent(nodeElement.dataset.nodeId || '', content, ['天气位置', 'weather location', 'tianqi weizhi', '/tq', '/天气']);
          }
        }];
    
    // 添加常用城市天气插入命令
    this.config.favoriteCities.forEach((city, index) => {
      const pinyinPrefix = city.pinyinPrefix || getPinyinPrefix(city.name);
      const pinyinFilter = pinyinPrefix ? `${pinyinPrefix}tq` : '';
      
      const filters = [`${city.name}天气`, `${city.name} weather`, `${city.name} tianqi`];
      if (pinyinPrefix) {
        filters.push(pinyinFilter, `${pinyinPrefix}tianqi`);
      }
      
      baseCommands.push({
        filter: filters,
        html: `<span class="b3-list-item__text">🌤 ${this.escapeHtml(city.name)}天气${pinyinPrefix ? ` (${this.escapeHtml(pinyinPrefix)}tq)` : ''}</span>`,
        id: `insert-favorite-city-weather-${index}`,
        callback: async (protyle: any, nodeElement: HTMLElement) => {
          const data = await this.getTemplateDataForCity(city);
          if (!data) return;
          const content = this.templateEngine.render(this.config.template, data);
          this.replaceBlockContent(nodeElement.dataset.nodeId || '', content, filters);
        }
      });
    });
    
    this.protyleSlash = baseCommands;
    console.log('[WeatherLocation] Slash commands updated, count:', baseCommands.length);
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
  private registerSlashCommand() {
    console.log('[WeatherLocation] Registering slash commands...');
    
    // 如果已经注册过，跳过（避免重复）
    if (this.slashCommandsRegistered) {
      console.log('[WeatherLocation] 斜杠命令已注册，跳过重复注册');
      return;
    }
    
    // 清空现有的斜杠命令
    this.protyleSlash = [];
    
    const slashCommands: any[] = [
      {
        filter: ['天气位置', 'weather location', 'tianqi weizhi', '/tq', '/天气'],
        html: '<span class="b3-list-item__text">🌤📍 插入天气位置模板</span>',
        id: 'insert-weather-location-template',
        callback: async (protyle: any, nodeElement: HTMLElement) => {
          const data = await this.getTemplateData();
          if (!data) return;
          const content = this.templateEngine.render(this.config.template, data);
          this.replaceBlockContent(nodeElement.dataset.nodeId || '', content, ['天气位置', 'weather location', 'tianqi weizhi', '/tq', '/天气']);
        }
      }
    ];

    // 添加常用城市天气插入命令
    this.config.favoriteCities.forEach((city, index) => {
      // 优先使用用户自定义的快捷指令前缀，如果没有则自动生成
      const pinyinPrefix = city.pinyinPrefix || getPinyinPrefix(city.name);
      const pinyinFilter = pinyinPrefix ? `${pinyinPrefix}tq` : '';
      
      // 合并所有过滤条件到一个指令中（避免快捷面板显示多个指令）
      const filters = [`${city.name}天气`, `${city.name} weather`, `${city.name} tianqi`];
      if (pinyinPrefix) {
        filters.push(pinyinFilter, `${pinyinPrefix}tianqi`);
      }
      
      slashCommands.push({
        filter: filters,
        html: `<span class="b3-list-item__text">🌤 ${this.escapeHtml(city.name)}天气${pinyinPrefix ? ` (${this.escapeHtml(pinyinPrefix)}tq)` : ''}</span>`,
        id: `insert-favorite-city-weather-${index}`,
        callback: async (protyle: any, nodeElement: HTMLElement) => {
          const data = await this.getTemplateDataForCity(city);
          if (!data) return;
          const content = this.templateEngine.render(this.config.template, data);
          this.replaceBlockContent(nodeElement.dataset.nodeId || '', content, filters);
        }
      });
      
      if (pinyinPrefix) {
        console.log(`[WeatherLocation] 注册快捷指令: ${city.name}天气 / ${pinyinFilter}`);
      }
    });
    
    // 使用数组赋值方式，确保思源笔记能正确识别
    this.protyleSlash = slashCommands;
    this.slashCommandsRegistered = true;
    console.log('[WeatherLocation] Slash commands registered, count:', slashCommands.length);
  }

  private registerMenu() {
    console.log('[WeatherLocation] Registering menu...');
    
    // 编辑器左键菜单功能已移除
    // 如需插入天气信息，请使用快捷面板或斜杠命令
    
    console.log('[WeatherLocation] Menu registered (no items)');
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
    const escapedTemplate = this.escapeHtml(this.config.template);
    return `
      <div id="weather-location-settings" style="padding: 20px; max-height: 400px; overflow-y: auto;">
        <div class="setting-section" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
          <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #333;">高德地图设置</h3>
          <div class="setting-item" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">高德地图 Key</label>
            <input type="text" id="amap-key" value="${this.escapeAttribute(maskedAmapKey)}" data-original-key="${this.escapeAttribute(this.config.amapKey)}" placeholder="天气和位置均需此 Key" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
            <div style="font-size: 12px; color: #999; margin-top: 4px;">已保存的 Key 会脱敏显示。需要修改时，直接输入新的完整 Key。前往 <a href="https://lbs.amap.com/" target="_blank">高德开放平台</a> 申请 Key</div>
          </div>
        </div>

        <div class="setting-section" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
          <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #333;">常用地点 <span style="font-size: 12px; font-weight: normal; color: #999;">(最多5个)</span></h3>
          
          <!-- 添加方式切换 -->
          <div class="setting-item" id="favorite-city-search-container" style="margin-bottom: 12px; display: ${this.config.favoriteCities.length >= MAX_FAVORITE_CITIES ? 'none' : 'block'};">
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
              <button id="toggle-search-mode" class="city-add-mode-btn active" style="padding: 6px 12px; border: 1px solid #1890ff; border-radius: 4px; background: #1890ff; color: white; cursor: pointer; font-size: 13px;">搜索添加</button>
              <button id="toggle-manual-mode" class="city-add-mode-btn" style="padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 13px;">手动录入</button>
            </div>
            
            <!-- 搜索模式 -->
            <div id="search-city-panel">
              <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">搜索地点</label>
              <div style="position: relative;">
                <input type="text" id="favorite-city-search" placeholder="输入城市、区县、街道或小区（如：北京、华容县、人民路、某小区）" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
                <div id="city-search-results" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-top: none; border-radius: 0 0 4px 4px; max-height: 200px; overflow-y: auto; z-index: 1000; display: none;"></div>
              </div>
              <div style="font-size: 12px; color: #999; margin-top: 5px;">支持高德地点搜索，城市、区县、街道和具体小区都可以添加</div>
            </div>
            
            <!-- 手动录入模式 -->
            <div id="manual-city-panel" style="display: none;">
              <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">地点名称</label>
              <input type="text" id="manual-city-name" placeholder="如：北京、华容县、人民路、某小区" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box; margin-bottom: 8px;">
              
              <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">纬度</label>
              <input type="text" id="manual-city-lat" placeholder="如：39.9042" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box; margin-bottom: 8px;">
              
              <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">经度</label>
              <input type="text" id="manual-city-lon" placeholder="如：116.4074" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box; margin-bottom: 8px;">
              
              <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">快捷指令（可选，如：bj）</label>
              <input type="text" id="manual-city-prefix" placeholder="留空则自动生成" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box; margin-bottom: 10px;">
              
              <button id="add-manual-city-btn" style="padding: 8px 16px; border: 1px solid #1890ff; border-radius: 4px; background: #1890ff; color: white; cursor: pointer; font-size: 14px; width: 100%;">添加地点</button>
              <div style="font-size: 12px; color: #999; margin-top: 5px;">格式：地点名,纬度,经度。可在地图软件中查询坐标</div>
            </div>
          </div>
          
          ${this.config.favoriteCities.length >= MAX_FAVORITE_CITIES ? '<div style="color: #ff4d4f; font-size: 13px; margin-bottom: 10px;">已达到最大数量限制（5个），如需添加请先删除现有地点</div>' : ''}
          <div id="favorite-cities-list" style="max-height: 200px; overflow-y: auto;">
            ${this.renderFavoriteCitiesList()}
          </div>
        </div>

        <div class="setting-section" style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e0e0e0;">
          <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #333;">模板设置</h3>
          <div class="setting-item" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">已保存模板</label>
            <select id="template-select" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
              ${this.renderTemplateOptions()}
            </select>
          </div>
          <div class="setting-item" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">当前模板内容</label>
            <textarea id="template" rows="8" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box; font-family: monospace;">${escapedTemplate}</textarea>
          </div>
          <div class="setting-item" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
            <button id="save-template-btn" style="padding: 6px 12px; border: 1px solid #1890ff; border-radius: 4px; background: #1890ff; color: white; cursor: pointer;">保存模板</button>
            <button id="help-btn" style="padding: 6px 12px; border: none; background: transparent; color: #1890ff; cursor: pointer;">查看变量说明</button>
          </div>
        </div>

        <div class="setting-actions" style="display: flex; gap: 10px; margin-top: 20px;">
          <button id="save-btn" style="padding: 8px 16px; border: 1px solid #1890ff; border-radius: 4px; background: #1890ff; color: white; cursor: pointer; font-size: 14px;">保存设置</button>
          <button id="test-btn" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 14px;">测试获取数据</button>
          <button id="clear-cache-btn" style="padding: 8px 16px; border: 1px solid #ff4d4f; border-radius: 4px; background: white; color: #ff4d4f; cursor: pointer; font-size: 14px;">清除缓存</button>
        </div>
      </div>
    `;
  }

  private renderTemplateOptions(): string {
    return this.config.templates.map(template => {
      const selected = template.id === this.config.activeTemplateId ? ' selected' : '';
      return `<option value="${this.escapeAttribute(template.id)}"${selected}>${this.escapeHtml(template.name)}</option>`;
    }).join('');
  }

  private saveCurrentTemplate(): SavedTemplate {
    const content = this.config.template;
    const activeTemplate = this.config.templates.find(template => template.id === this.config.activeTemplateId);

    if (activeTemplate && activeTemplate.id !== DEFAULT_TEMPLATE_ID) {
      activeTemplate.content = content;
      return activeTemplate;
    }

    const customCount = this.config.templates.filter(template => template.id !== DEFAULT_TEMPLATE_ID).length + 1;
    const savedTemplate: SavedTemplate = {
      id: `custom-template-${Date.now()}`,
      name: `模板${this.getTemplateNumberName(customCount)}`,
      content
    };

    this.config.templates.push(savedTemplate);
    this.config.activeTemplateId = savedTemplate.id;
    return savedTemplate;
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

    // 模板
    const template = container.querySelector('#template') as HTMLTextAreaElement;
    const templateSelect = container.querySelector('#template-select') as HTMLSelectElement;
    template?.addEventListener('input', () => {
      this.config.template = template.value;
    });

    templateSelect?.addEventListener('change', () => {
      const selectedTemplate = this.config.templates.find(item => item.id === templateSelect.value);
      if (!selectedTemplate) {
        return;
      }
      this.config.activeTemplateId = selectedTemplate.id;
      this.config.template = selectedTemplate.content;
      template.value = selectedTemplate.content;
    });

    const saveTemplateBtn = container.querySelector('#save-template-btn') as HTMLButtonElement;
    saveTemplateBtn?.addEventListener('click', async () => {
      this.config.template = template.value;
      const savedTemplate = this.saveCurrentTemplate();
      templateSelect.innerHTML = this.renderTemplateOptions();
      templateSelect.value = savedTemplate.id;
      await this.saveConfig();
      showMessage(`${savedTemplate.name} 已保存`);
    });

    // 帮助按钮
    const helpBtn = container.querySelector('#help-btn') as HTMLButtonElement;
    helpBtn?.addEventListener('click', () => {
      this.showVariableHelp();
    });

    // 保存按钮
    const saveBtn = container.querySelector('#save-btn') as HTMLButtonElement;
    saveBtn?.addEventListener('click', async () => {
      if (amapKey && !amapKey.value.includes(AMAP_KEY_MASK)) {
        this.config.amapKey = amapKey.value.trim();
      }
      this.config.template = template.value;
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

  // 搜索地点（高德地图）
  private async searchCities(query: string): Promise<CitySearchResult[]> {
    if (!query || query.length < 2) {
      return [];
    }

    console.log('[WeatherLocation] 开始搜索地点:', query);

    const amapKey = this.config.amapKey;
    if (!amapKey) {
      throw new Error('未配置高德地图 Key，无法搜索地点');
    }

    const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(query)}&key=${amapKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`高德地图 API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    console.log('[WeatherLocation] 高德地图返回数据:', data);

    if (data.status !== '1') {
      throw new Error(data.info || '搜索失败');
    }

    if (!data.geocodes || data.geocodes.length === 0) {
      showMessage('未找到匹配的地点');
      return [];
    }

    const seen = new Set<string>();
    const results = data.geocodes.map((item: any) => {
      const displayName = item.formatted_address || item.district || item.city || item.province || query;
      const locationName = displayName || query;
      const [lonText, latText] = String(item.location || '').split(',');
      return {
        name: locationName,
        lat: parseFloat(latText),
        lon: parseFloat(lonText),
        displayName,
        address: displayName
      };
    }).filter((item: CitySearchResult) => {
      if (!item.name || Number.isNaN(item.lat) || Number.isNaN(item.lon)) {
        return false;
      }
      const key = `${item.name}-${item.lat.toFixed(6)}-${item.lon.toFixed(6)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    console.log('[WeatherLocation] 搜索结果:', results);
    return results;
  }

  // 渲染搜索结果
  private renderSearchResults(results: CitySearchResult[]): string {
    if (results.length === 0) {
      return '<div style="padding: 10px; color: #999; font-size: 14px;">未找到匹配的地点</div>';
    }

    return results.map((city, index) => `
      <div class="city-search-result" data-index="${index}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 14px;">
        <div style="font-weight: 500;">${this.escapeHtml(city.name)}</div>
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
      // 重新计算首字母，确保使用最新的映射表
      const pinyinPrefix = city.pinyinPrefix || getPinyinPrefix(city.name);
      return `
      <div class="favorite-city-item" data-index="${index}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 6px; background: #f5f5f5; border-radius: 4px;">
        <div style="flex: 1;">
          <div style="font-size: 14px; font-weight: 500;">${this.escapeHtml(city.name)}</div>
          <div style="font-size: 12px; color: #666; margin-top: 2px;">
            坐标: ${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}
            ${pinyinPrefix ? `| 快捷指令: /${pinyinPrefix}tq` : ''}
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

    // 生成拼音首字母
    const pinyinPrefix = getPinyinPrefix(city.name);
    console.log(`[WeatherLocation] 地点 ${city.name} 的首字母: ${pinyinPrefix}`);

    this.config.favoriteCities.push({
      name: city.name,
      lat: city.lat,
      lon: city.lon,
      pinyinPrefix: pinyinPrefix,
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
  private addManualCity(name: string, lat: number, lon: number, customPrefix?: string): boolean {
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

    // 使用自定义前缀或自动生成
    const pinyinPrefix = customPrefix?.trim() || getPinyinPrefix(name);
    console.log(`[WeatherLocation] 手动添加地点 ${name} 的首字母: ${pinyinPrefix}`);

    this.config.favoriteCities.push({
      name: name.trim(),
      lat: lat,
      lon: lon,
      pinyinPrefix: pinyinPrefix,
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
    
    // 特殊处理 pinyinPrefix：如果提供了值（包括空字符串），则更新；否则保留原值
    if (updates.pinyinPrefix !== undefined) {
      updatedCity.pinyinPrefix = updates.pinyinPrefix.trim();
    }
    
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
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">经度</label>
            <input type="text" id="edit-city-lon" value="${city.lon}" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px; color: #666;">快捷指令前缀（如：bj）</label>
            <input type="text" id="edit-city-prefix" value="${this.escapeAttribute(city.pinyinPrefix || '')}" placeholder="留空则自动生成" style="width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;">
            <div style="font-size: 12px; color: #999; margin-top: 4px;">完整指令格式：前缀+tq（如：bjtq）</div>
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
        const prefixInput = container.querySelector('#edit-city-prefix') as HTMLInputElement;

        const name = nameInput.value.trim();
        const lat = parseFloat(latInput.value);
        const lon = parseFloat(lonInput.value);
        const prefix = prefixInput.value.trim();

        if (!name || isNaN(lat) || isNaN(lon)) {
          showMessage('请填写完整的地点信息');
          return;
        }

        if (this.editFavoriteCity(index, {
          name,
          lat,
          lon,
          pinyinPrefix: prefix || getPinyinPrefix(name)
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
      const prefixInput = container.querySelector('#manual-city-prefix') as HTMLInputElement;

      const name = nameInput.value.trim();
      const lat = parseFloat(latInput.value);
      const lon = parseFloat(lonInput.value);
      const prefix = prefixInput.value.trim();

      if (!name) {
        showMessage('请输入地点名称');
        return;
      }

      if (isNaN(lat) || isNaN(lon)) {
        showMessage('请输入有效的经纬度');
        return;
      }

      if (this.addManualCity(name, lat, lon, prefix)) {
        await this.saveConfig();
        this.updateFavoriteCitiesUI();
        showMessage(`已添加地点：${name}`);
        
        // 清空输入框
        nameInput.value = '';
        latInput.value = '';
        lonInput.value = '';
        prefixInput.value = '';
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

  // 显示变量帮助
  private showVariableHelp() {
    const helpContent = `# 模板变量说明

## 天气变量 (weather)
- {{weather.description}} - 全天天气描述 (如: 晴转多云, 全天晴朗)
- {{weather.dayWeather}} - 白天天气
- {{weather.nightWeather}} - 夜间天气
- {{weather.temperature}} - 当前温度 (°C)
- {{weather.humidity}} - 湿度 (%)
- {{weather.windSpeed}} - 风速 (m/s)
- {{weather.windDirection}} - 当前风向 (如: 北风, 东南风)
- {{weather.windPower}} - 当前风力等级 (如: 3级)
- {{weather.dayWindDirection}} - 白天风向
- {{weather.nightWindDirection}} - 夜间风向
- {{weather.dayWindPower}} - 白天风力等级
- {{weather.nightWindPower}} - 夜间风力等级
- {{weather.tempMin}} - 最低温度 (°C)
- {{weather.tempMax}} - 最高温度 (°C)
## 位置变量 (location) - 按高德地图地址层级
- {{location.province}} - 省份 (如: 湖南省)
- {{location.city}} - 城市 (如: 岳阳市)
- {{location.district}} - 区县 (如: 华容县)
- {{location.township}} - 乡镇/街道 (如: 章华镇)
- {{location.street}} - 街道 (如: 人民路)
- {{location.streetNumber}} - 门牌号 (如: 123号)
- {{location.formatted_address}} - 标准化详细地址
- {{location.country}} - 国家
- {{location.lat}} - 纬度
- {{location.lon}} - 经度

## 其他变量
- {{time}} - 当前时间

## 示例
🌤 **天气**: {{weather.description}}
🌡 **温度**: {{weather.temperature}}°C
🌬 **风向**: {{weather.windDirection}}
💨 **风力**: {{weather.windPower}}
📍 **位置**: {{location.city}}
🏛 **省份**: {{location.province}}
🏙 **区县**: {{location.district}}
🏘 **乡镇/街道**: {{location.township}}`;

    const dialog = new Dialog({
      title: '模板变量说明',
      content: `<div style="padding: 16px; font-family: monospace; white-space: pre-wrap;">${helpContent}</div>`,
      width: '600px'
    });
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
    const content = this.templateEngine.render(this.config.template, data);
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
    const content = this.templateEngine.render(this.config.template, data);
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
      const keptMarkdown = this.removeSlashTrigger(currentMarkdown, triggers);
      const nextContent = keptMarkdown ? `${keptMarkdown} ${content}` : content;
      await this.updateBlock(blockId, nextContent);
      showMessage('天气位置已插入');
    } catch (error) {
      showMessage('插入内容失败');
    }
  }

  private removeSlashTrigger(markdown: string, triggers: string[]): string {
    let result = this.removeBlockIAL(markdown)
      .trim()
      .replace(/\\\//g, '/')
      .replace(/／/g, '/');
    const candidates = Array.from(new Set(
      triggers.flatMap(trigger => {
        const normalized = trigger.trim();
        if (!normalized) return [];
        const withoutSlash = normalized.replace(/^\//, '');
        return [
          normalized,
          withoutSlash,
          `/${withoutSlash}`,
          `、${withoutSlash}`
        ];
      })
    )).sort((a, b) => b.length - a.length);

    for (const candidate of candidates) {
      if (result.endsWith(candidate)) {
        result = result.slice(0, -candidate.length);
        break;
      }
    }

    result = result
      .replace(/[\u200b-\u200d\ufeff]+$/g, '')
      .replace(/[ \t\u00a0]+$/g, '')
      .replace(/[、,，/]\s*(tq|天气位置|天气)\s*$/i, '')
      .replace(/\b(tq|tianqi\s+weizhi|weather\s+location)\s*$/i, '');

    return result.replace(/[ \t\u00a0]+$/g, '').trim();
  }

  private removeBlockIAL(markdown: string): string {
    return markdown
      .split('\n')
      .filter(line => !/^\s*\{:\s+.*\}\s*$/.test(line))
      .join('\n');
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
