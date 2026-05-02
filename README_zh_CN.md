# 思源笔记天气与位置插件

一个思源笔记插件，通过高德地图查询天气和位置信息，并通过模板插入到每日笔记中。

## 功能特点

- 🌤 **天气查询**: 通过高德地图 API 获取实时天气预报数据
- 📍 **位置查询**: 通过浏览器定位 + 高德逆地理编码获取精确地址
- 📝 **模板支持**: 可自定义模板，支持变量替换和条件语法
- 🤖 **自动插入**: 创建每日笔记时自动插入天气和位置信息
- 🎨 **多种格式**: 支持文本、表格等多种输出格式
- ⚡ **斜杠命令**: 输入 `/tq` 或 `/天气位置` 快速插入；常用城市有独立快捷指令
- ⭐ **常用城市**: 最多保存 5 个城市，支持拼音首字母快捷查询

## 安装方法

1. 从思源笔记集市下载插件
2. 在 设置 → 集市 → 插件 中启用插件

## 配置说明

### 高德地图 Key

插件使用高德地图提供天气和位置服务，只需一个 Key。

1. 访问 [lbs.amap.com](https://lbs.amap.com/) 注册账号并创建应用
2. 获取 Web 服务 API Key
3. 在插件设置中输入该 Key

### 位置获取

插件通过浏览器定位获取当前坐标，再调用高德逆地理编码 API 解析详细地址（省份、城市、区县、街道等）。浏览器会提示授予位置权限。

### 常用城市设置

插件支持保存最多 5 个常用城市，每个城市会自动生成拼音首字母快捷指令。

- 支持搜索添加（通过高德地图）或手动录入坐标
- 自动生成快捷指令前缀（如：北京 → `bj`，长沙 → `cs`）
- 快捷指令格式：`<前缀>tq`，如 `/bjtq` 查询北京天气
- 支持编辑城市信息和自定义指令前缀
- 支持删除已保存的城市

### 模板设置

插件支持自定义模板，可使用以下变量和条件语法：

#### 天气变量
- `{{weather.description}}` - 全天天气描述（如：晴转多云、全天晴朗）
- `{{weather.dayWeather}}` - 白天天气
- `{{weather.nightWeather}}` - 夜间天气
- `{{weather.temperature}}` - 当前温度（°C）
- `{{weather.humidity}}` - 湿度（%）
- `{{weather.windSpeed}}` - 风速（m/s）
- `{{weather.windDirection}}` - 当前风向（如：北风、东南风）
- `{{weather.windPower}}` - 当前风力等级（如：3级）
- `{{weather.dayWindDirection}}` - 白天风向
- `{{weather.nightWindDirection}}` - 夜间风向
- `{{weather.dayWindPower}}` - 白天风力等级
- `{{weather.nightWindPower}}` - 夜间风力等级
- `{{weather.tempMin}}` - 最低温度（°C）
- `{{weather.tempMax}}` - 最高温度（°C）

#### 位置变量（按高德地图地址层级）
- `{{location.province}}` - 省份（如：湖南省）
- `{{location.city}}` - 城市（如：岳阳市）
- `{{location.district}}` - 区县（如：华容县）
- `{{location.township}}` - 乡镇/街道（如：章华镇）
- `{{location.street}}` - 街道（如：人民路）
- `{{location.streetNumber}}` - 门牌号（如：123号）
- `{{location.formatted_address}}` - 标准化详细地址
- `{{location.country}}` - 国家
- `{{location.region}}` - 区域/省份（兼容旧版，建议使用 province）
- `{{location.lat}}` - 纬度
- `{{location.lon}}` - 经度

#### 条件语法
模板引擎支持条件判断：
```
{{#if 变量名}}变量存在时显示的内容{{/if}}
{{#if 变量名}}条件满足时{{else}}条件不满足时{{/if}}
```

#### 其他变量
- `{{time}}` - 当前时间

### 默认模板

```markdown
## 今日天气与位置

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
```

## 使用方法

### 方式一：自动插入（推荐）
在设置中开启"创建每日笔记时自动插入"，插件会在创建每日笔记时自动插入天气和位置信息。

### 方式二：斜杠命令
在编辑器中输入 `/tq` 或 `/天气位置` 快速插入天气位置模板。
如果配置了常用城市，可使用快捷指令如 `/bjtq`（北京）、`/cstq`（长沙）等。

### 方式三：命令面板
- `插入天气信息`
- `插入位置信息`
- `插入天气位置模板`

## 模板示例

### 简洁模板
```markdown
**天气**: {{weather.description}} | **温度**: {{weather.temperature}}°C | **位置**: {{location.city}}
```

### 表格模板
```markdown
| 项目 | 数值 |
|------|------|
| 天气 | {{weather.description}} |
| 温度 | {{weather.temperature}}°C |
| 湿度 | {{weather.humidity}}% |
| 风速 | {{weather.windSpeed}} m/s |
| 位置 | {{location.city}} |
| 时间 | {{time}} |
```

### 带条件的模板
```markdown
## 今日天气

🌤 **天气**: {{weather.description}}
🌡 **温度**: {{weather.temperature}}°C
{{#if weather.dayWeather}}☀️ **白天**: {{weather.dayWeather}}
{{/if}}{{#if weather.nightWeather}}🌙 **夜间**: {{weather.nightWeather}}
{{/if}}💧 **湿度**: {{weather.humidity}}%

📍 **位置**: {{location.city}}
⏰ **时间**: {{time}}
```

## 注意事项

1. **API Key 安全**: 请妥善保管你的 API Key，不要分享给他人
2. **免费额度**: 高德天气 API 有免费调用额度，超出后可能需要付费
3. **浏览器权限**: 定位功能需要浏览器授予地理位置权限
4. **网络要求**: 插件需要网络连接才能获取天气和位置信息

## 常见问题

**Q: 为什么获取不到天气信息？**
A: 请检查：
- 高德地图 API Key 是否正确设置
- 网络连接是否正常

**Q: 为什么位置不准确？**
A: 插件使用浏览器定位。请确认已授予位置权限，或尝试在信号更好的位置使用。

**Q: 如何关闭自动插入？**
A: 在插件设置中关闭"创建每日笔记时自动插入"选项。

**Q: 如何添加常用城市？**
A: 打开插件设置 → 常用城市区域 → 搜索城市或手动录入坐标。

**Q: 快捷指令的含义是什么？**
A: 每个常用城市会根据城市名自动生成拼音首字母前缀。例如北京 → `bj`，快捷指令为 `/bjtq`（bjtq = bj + 天气）。你可以在设置中自定义前缀。

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm run dev

# 构建
pnpm run build
```

## 许可证

MIT License
