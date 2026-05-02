export class TemplateEngine {
  // 渲染模板
  render(template: string, data: any): string {
    if (!template || !data) {
      return '';
    }

    let result = template;

    // 处理 {{variable}} 格式的变量
    result = this.replaceSimpleVariables(result, data);
    
    // 处理 {{object.property}} 格式的嵌套变量
    result = this.replaceNestedVariables(result, data);
    
    // 处理条件语句 {{#if condition}}...{{/if}}
    result = this.replaceConditionals(result, data);
    
    // 处理循环 {{#each array}}...{{/each}}
    result = this.replaceLoops(result, data);

    return result;
  }

  // 替换简单变量
  private replaceSimpleVariables(template: string, data: any): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = data[key];
      return value !== undefined ? String(value) : match;
    });
  }

  // 替换嵌套变量 (如 {{weather.temperature}})
  private replaceNestedVariables(template: string, data: any): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
      // 如果已经处理过简单变量，跳过
      if (!path.includes('.')) {
        return match;
      }

      const value = this.getNestedValue(data, path);
      return value !== undefined ? String(value) : match;
    });
  }

  // 获取嵌套对象的值
  private getNestedValue(obj: any, path: string): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  // 处理条件语句
  private replaceConditionals(template: string, data: any): string {
    // 处理 {{#if condition}}...{{/if}}
    const ifRegex = /\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    
    return template.replace(ifRegex, (match, condition, content) => {
      const value = this.getNestedValue(data, condition);
      
      if (this.isTruthy(value)) {
        // 处理 {{else}}
        const elseParts = content.split('{{else}}');
        return elseParts[0];
      } else {
        const elseParts = content.split('{{else}}');
        return elseParts[1] || '';
      }
    });
  }

  // 处理循环
  private replaceLoops(template: string, data: any): string {
    const eachRegex = /\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    
    return template.replace(eachRegex, (match, arrayName, content) => {
      const array = this.getNestedValue(data, arrayName);
      
      if (!Array.isArray(array) || array.length === 0) {
        return '';
      }

      return array.map((item, index) => {
        let itemContent = content;
        // 替换 @index
        itemContent = itemContent.replace(/@index/g, String(index));
        // 替换 @item
        itemContent = itemContent.replace(/@item/g, String(item));
        // 替换 item.property
        if (typeof item === 'object') {
          for (const key of Object.keys(item)) {
            itemContent = itemContent.replace(
              new RegExp(`@item\\.${key}`, 'g'),
              String(item[key])
            );
          }
        }
        return itemContent;
      }).join('');
    });
  }

  // 判断值是否为真
  private isTruthy(value: any): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  // 获取默认模板
  static getDefaultTemplate(): string {
    return `## 今日天气与位置

🌤 **天气状况**: {{weather.description}}
{{#if weather.dayWeather}}☀️ **白天天气**: {{weather.dayWeather}}
{{/if}}{{#if weather.nightWeather}}🌙 **夜间天气**: {{weather.nightWeather}}
{{/if}}
🌡 **当前温度**: {{weather.temperature}}°C
{{#if weather.feelsLike}}🤔 **体感温度**: {{weather.feelsLike}}°C
{{/if}}💧 **相对湿度**: {{weather.humidity}}%
🌬 **风向**: {{weather.windDirection}}
💨 **风力**: {{weather.windPower}}
📊 **风速**: {{weather.windSpeed}} m/s
🔽 **最低温度**: {{weather.tempMin}}°C
🔼 **最高温度**: {{weather.tempMax}}°C

📍 **当前位置**: {{location.city}}
{{#if location.region}}🏘 **区域**: {{location.region}}
{{/if}}{{#if location.district}}🏙 **区县**: {{location.district}}
{{/if}}{{#if location.formatted_address}}📝 **详细地址**: {{location.formatted_address}}
{{/if}}{{#if location.country}}🌍 **国家**: {{location.country}}
{{/if}}🌐 **坐标**: {{location.lat}}, {{location.lon}}

⏰ **记录时间**: {{time}}
`;
  }

  // 获取简洁模板
  static getSimpleTemplate(): string {
    return `**天气**: {{weather.description}} | **温度**: {{weather.temperature}}°C | **位置**: {{location.city}}
`;
  }

  // 获取表格模板
  static getTableTemplate(): string {
    return `| 项目 | 数值 |
|------|------|
| 天气 | {{weather.description}} |
| 温度 | {{weather.temperature}}°C |
| 湿度 | {{weather.humidity}}% |
| 风速 | {{weather.windSpeed}} m/s |
| 位置 | {{location.city}} |
| 时间 | {{time}} |
`;
  }

  // 获取所有可用变量说明
  static getVariableHelp(): string {
    return `# 模板变量说明

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
- {{weather.pressure}} - 气压 (hPa)
- {{weather.visibility}} - 能见度 (km)
- {{weather.feelsLike}} - 体感温度 (°C)
- {{weather.tempMin}} - 最低温度 (°C)
- {{weather.tempMax}} - 最高温度 (°C)
- {{weather.sunrise}} - 日出时间
- {{weather.sunset}} - 日落时间
- {{weather.icon}} - 天气图标代码

## 位置变量 (location)
- {{location.city}} - 城市名称
- {{location.country}} - 国家名称
- {{location.region}} - 区域/省份
- {{location.district}} - 区/县
- {{location.formatted_address}} - 标准化详细地址
- {{location.lat}} - 纬度
- {{location.lon}} - 经度
- {{location.ip}} - IP地址
- {{location.timezone}} - 时区

## 其他变量
- {{time}} - 当前时间

## 条件语句
{{#if weather.feelsLike}}内容{{/if}}

## 示例模板
${TemplateEngine.getDefaultTemplate()}
`;
  }
}
