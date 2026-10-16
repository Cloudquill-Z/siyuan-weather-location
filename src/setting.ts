import { App, showMessage, Dialog } from 'siyuan';

interface PluginConfig {
  amapKey: string;
  template: string;
}

export class SettingTab {
  private plugin: any;
  private config: PluginConfig;
  private i18n: any;

  constructor(app: App, plugin: any, config: PluginConfig) {
    this.plugin = plugin;
    this.config = config;
    this.i18n = (plugin as any).i18n || {};
  }

  getName(): string {
    return this.i18n.sectionWeather || '天气与位置';
  }

  getIcon(): string {
    return 'iconWeather';
  }

  render(containerEl: HTMLElement): void {
    containerEl.innerHTML = '';

    // 添加自定义样式
    this.addCustomStyles();

    // 天气设置
    this.createWeatherSection(containerEl);

    // 位置设置
    this.createLocationSection(containerEl);

    // 模板设置
    this.createTemplateSection(containerEl);

    // 操作按钮
    this.createActionButtons(containerEl);
  }

  private createWeatherSection(element: HTMLElement): void {
    const section = document.createElement('div');
    section.className = 'config__tab-container-item';

    const title = document.createElement('h3');
    title.textContent = '高德地图设置';
    section.appendChild(title);

    // 高德 Key 输入
    const keyItem = document.createElement('div');
    keyItem.className = 'config__item';

    const keyLabel = document.createElement('label');
    keyLabel.className = 'config__item-label';
    keyLabel.textContent = '高德地图 Key';
    keyItem.appendChild(keyLabel);

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'config__item-input';
    keyInput.placeholder = '天气和位置均需此 Key';
    keyInput.value = this.config.amapKey;
    keyInput.addEventListener('change', (e) => {
      this.config.amapKey = (e.target as HTMLInputElement).value;
    });

    keyItem.appendChild(keyInput);
    section.appendChild(keyItem);

    const help = document.createElement('div');
    help.className = 'config__item-help';
    help.innerHTML = '<p>前往 <a href="https://lbs.amap.com/" target="_blank">高德开放平台</a> 申请 Key，天气和位置功能共用同一个 Key</p>';
    section.appendChild(help);

    element.appendChild(section);
  }

  private createLocationSection(element: HTMLElement): void {
    // 位置设置已合并到高德地图设置中，此方法保留空实现以兼容旧代码
  }

  private createTemplateSection(element: HTMLElement): void {
    const section = document.createElement('div');
    section.className = 'config__tab-container-item';

    const title = document.createElement('h3');
    title.textContent = '模板设置';
    section.appendChild(title);

    // 模板选择按钮
    const templateButtons = document.createElement('div');
    templateButtons.className = 'config__item';
    templateButtons.style.display = 'flex';
    templateButtons.style.gap = '8px';

    const templates = [
      { name: '默认模板', key: 'default' },
      { name: '简洁模板', key: 'simple' },
      { name: '表格模板', key: 'table' }
    ];

    const templateTextarea = document.createElement('textarea');

    templates.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'b3-button b3-button--outline weather-location-plugin-btn';
      btn.textContent = t.name;
      btn.addEventListener('click', () => {
        if (t.key === 'default') {
          templateTextarea.value = this.getDefaultTemplateString();
        } else if (t.key === 'simple') {
          templateTextarea.value = `**天气**: {{weather.description}} | **温度**: {{weather.temperature}}°C | **位置**: {{location.city}}`;
        } else if (t.key === 'table') {
          templateTextarea.value = this.getTableTemplateString();
        }
        this.config.template = templateTextarea.value;
      });
      templateButtons.appendChild(btn);
    });

    section.appendChild(templateButtons);

    // 模板编辑器
    const templateItem = document.createElement('div');
    templateItem.className = 'config__item';

    const templateLabel = document.createElement('label');
    templateLabel.className = 'config__item-label';
    templateLabel.textContent = '自定义模板';
    templateItem.appendChild(templateLabel);

    templateTextarea.className = 'config__item-textarea';
    templateTextarea.style.height = '300px';
    templateTextarea.style.fontFamily = 'monospace';
    templateTextarea.value = this.config.template;
    templateTextarea.addEventListener('change', (e) => {
      this.config.template = (e.target as HTMLTextAreaElement).value;
    });

    templateItem.appendChild(templateTextarea);
    section.appendChild(templateItem);

    // 变量说明
    const varHelpBtn = document.createElement('button');
    varHelpBtn.className = 'b3-button b3-button--text weather-location-plugin-btn';
    varHelpBtn.textContent = '查看可用变量说明';
    varHelpBtn.addEventListener('click', () => {
      this.showVariableHelp();
    });
    section.appendChild(varHelpBtn);

    element.appendChild(section);
  }

  private createActionButtons(element: HTMLElement): void {
    const section = document.createElement('div');
    section.className = 'config__tab-container-item';
    section.style.display = 'flex';
    section.style.gap = '12px';

    // 保存按钮
    const saveBtn = document.createElement('button');
    saveBtn.className = 'b3-button b3-button--primary weather-location-plugin-btn';
    saveBtn.textContent = '保存设置';
    saveBtn.addEventListener('click', async () => {
      await this.plugin.saveConfig();
      showMessage('设置已保存');
    });
    section.appendChild(saveBtn);

    // 测试按钮
    const testBtn = document.createElement('button');
    testBtn.className = 'b3-button b3-button--outline weather-location-plugin-btn';
    testBtn.textContent = '测试获取数据';
    testBtn.addEventListener('click', async () => {
      await this.testDataFetch();
    });
    section.appendChild(testBtn);

    element.appendChild(section);
  }

  private async testDataFetch() {
    try {
      showMessage(this.i18n.msgFetchingData || '正在获取数据...');
      
      const data = await this.plugin.getTemplateData();
      
      const result = `天气: ${data.weather.description}
温度: ${data.weather.temperature}°C
位置: ${data.location.city}`;

      showMessage(this.i18n.msgFetchSuccess || '获取成功!');
    } catch (error) {
      showMessage((this.i18n.msgFetchFailed || '获取失败:') + ' ' + (error as Error).message);
    }
  }

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
- {{location.preciseAddress}} - 精确地址（高德地址 + 可靠小区/建筑信息）
- {{location.nearestPlace}} - 附近地点（POI/AOI，带距离）
- {{location.nearestPoiName}} - 最近 POI 名称
- {{location.nearestPoiDistance}} - 最近 POI 距离
- {{location.nearestAoiName}} - 最近 AOI/小区区域名称
- {{location.nearestAoiDistance}} - 最近 AOI/小区区域距离
- {{location.nearestRoadName}} - 最近道路名称
- {{location.nearestRoadDistance}} - 最近道路距离
- {{location.formatted_address}} - 标准化详细地址
- {{location.country}} - 国家
- {{location.lat}} - 纬度
- {{location.lon}} - 经度

### 向后兼容（旧版变量）
- {{location.region}} - 区域/省份（等同于province）

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
      title: this.i18n.dialogVariableHelpTitle || '模板变量说明',
      content: `<div style="padding: 16px; font-family: monospace; white-space: pre-wrap;">${helpContent}</div>`,
      width: '600px'
    });
  }

  private getDefaultTemplateString(): string {
    return `## 今日天气与位置

🌤 **天气状况**: {{weather.description}}
🌡 **当前温度**: {{weather.temperature}}°C
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
{{/if}}{{#if location.preciseAddress}}📌 **精确地址**: {{location.preciseAddress}}
{{/if}}{{#if location.nearestPlace}}🏢 **附近地点**: {{location.nearestPlace}}
{{/if}}{{#if location.formatted_address}}📝 **详细地址**: {{location.formatted_address}}
{{/if}}{{#if location.country}}🌍 **国家**: {{location.country}}
{{/if}}🌐 **坐标**: {{location.lat}}, {{location.lon}}

⏰ **记录时间**: {{time}}
`;
  }

  private getTableTemplateString(): string {
    return `| 项目 | 数值 |
|------|------|
| 天气 | {{weather.description}} |
| 温度 | {{weather.temperature}}°C |
| 湿度 | {{weather.humidity}}% |
| 风向 | {{weather.windDirection}} |
| 风力 | {{weather.windPower}} |
| 风速 | {{weather.windSpeed}} m/s |
| 最低温度 | {{weather.tempMin}}°C |
| 最高温度 | {{weather.tempMax}}°C |
| 省份 | {{location.province}} |
| 城市 | {{location.city}} |
| 区县 | {{location.district}} |
| 乡镇/街道 | {{location.township}} |
| 街道 | {{location.street}} |
| 门牌号 | {{location.streetNumber}} |
| 精确地址 | {{location.preciseAddress}} |
| 附近地点 | {{location.nearestPlace}} |
| 最近 POI | {{location.nearestPoiName}} |
| 最近 AOI | {{location.nearestAoiName}} |
| 最近道路 | {{location.nearestRoadName}} |
| 详细地址 | {{location.formatted_address}} |
| 国家 | {{location.country}} |
| 纬度 | {{location.lat}} |
| 经度 | {{location.lon}} |
| 时间 | {{time}} |
`;
  }

  private addCustomStyles(): void {
    const styleId = 'weather-location-plugin-styles';
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 自定义按钮样式 */
      .weather-location-plugin-btn {
        background-color: #1890ff !important;
        color: white !important;
        border:1px solid #1890ff !important;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 14px;
      }

      .weather-location-plugin-btn:hover {
        background-color: #096dd9 !important;
        border-color: #096dd9 !important;
        transform: scale(1.02);
        box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
      }

      .weather-location-plugin-btn:active {
        transform: scale(0.98);
      }

      /* 文本按钮特殊样式 */
      .weather-location-plugin-btn.b3-button--text {
        background-color: transparent !important;
        color: #1890ff !important;
        border: none !important;
        padding: 4px 8px;
      }

      .weather-location-plugin-btn.b3-button--text:hover {
        background-color: rgba(24, 144, 255, 0.1) !important;
        color: #096dd9 !important;
        transform: none;
        box-shadow: none;
      }
    `;
    document.head.appendChild(style);
  }
}
