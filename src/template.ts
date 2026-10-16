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
      return value !== undefined && value !== null ? String(value) : '';
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
      return value !== undefined && value !== null ? String(value) : '';
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
💧 **相对湿度**: {{weather.humidity}}%
🌬 **风向**: {{weather.windDirection}}
💨 **风力**: {{weather.windPower}}
📊 **风速**: {{weather.windSpeed}} m/s
🔽 **最低温度**: {{weather.tempMin}}°C
🔼 **最高温度**: {{weather.tempMax}}°C

📍 **当前位置**: {{location.city}}
{{#if location.region}}🏘 **区域**: {{location.region}}
{{/if}}{{#if location.district}}🏙 **区县**: {{location.district}}
{{/if}}{{#if location.preciseAddress}}📌 **精确地址**: {{location.preciseAddress}}
{{/if}}{{#if location.nearestPlace}}🏢 **附近地点**: {{location.nearestPlace}}
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

}
