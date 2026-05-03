# Weather & Location Plugin for SiYuan

A SiYuan Note plugin that fetches weather and location info via Amap (高德地图) and inserts it into daily notes via customizable templates.

## Features

- 🌤 **Weather Query**: Real-time and forecast weather data via Amap
- 📍 **Location Query**: Browser geolocation + Amap reverse geocoding for precise address
- 📝 **Template Support**: Customizable templates with variables and conditional syntax
- ⚡ **Slash Commands**: Quick insert via `/tq` or `/天气位置`; per-city shortcuts for favorite cities
- ⭐ **Favorite Cities**: Save up to 5 cities for quick weather lookup

## Installation

1. Download from the SiYuan marketplace (Settings → Marketplace → Plugins)
2. Enable the plugin in Settings → Marketplace → Plugins

## Configuration

### Amap API Key

The plugin uses Amap (高德地图) for both weather and location services. You need one API Key.

1. Visit [lbs.amap.com](https://lbs.amap.com/) to register and create an application
2. Get the Web Service API Key
3. Enter the Key in plugin settings

### Location

The plugin uses browser geolocation to get your current coordinates, then calls Amap reverse geocoding API to resolve the full address (province, city, district, street, etc.). Your browser will prompt for location permission.

### Favorite Cities

The plugin supports saving up to 5 frequently used cities. Once added, each city gets a slash command shortcut using its pinyin prefix (e.g., `/bjtq` for Beijing, `/cstq` for Changsha).

- **Add by search**: Search city names via Amap geocoding API and select from results
- **Add manually**: Enter city name, latitude, and longitude directly
- **Custom prefix**: Customize the pinyin shortcut prefix for each city
- **Edit / Delete**: Update city info or remove cities from the settings panel
- **Slash command format**: `<pinyin-prefix>tq` (e.g., `/bjtq` for Beijing)

### Template Settings

The plugin supports custom templates using the following variables and syntax:

#### Weather Variables
- `{{weather.description}}` - Weather description (e.g., "晴转多云")
- `{{weather.dayWeather}}` - Daytime weather
- `{{weather.nightWeather}}` - Nighttime weather
- `{{weather.temperature}}` - Current temperature (°C)
- `{{weather.humidity}}` - Humidity (%)
- `{{weather.windSpeed}}` - Wind speed (m/s)
- `{{weather.windDirection}}` - Wind direction (e.g., "北风", "东南风")
- `{{weather.windPower}}` - Wind power level (e.g., "3级")
- `{{weather.dayWindDirection}}` - Daytime wind direction
- `{{weather.nightWindDirection}}` - Nighttime wind direction
- `{{weather.dayWindPower}}` - Daytime wind power level
- `{{weather.nightWindPower}}` - Nighttime wind power level
- `{{weather.tempMin}}` - Min temperature (°C)
- `{{weather.tempMax}}` - Max temperature (°C)

#### Location Variables
- `{{location.province}}` - Province (e.g., "湖南省")
- `{{location.city}}` - City name
- `{{location.district}}` - District/County
- `{{location.township}}` - Township/Street
- `{{location.street}}` - Street name
- `{{location.streetNumber}}` - Street number
- `{{location.formatted_address}}` - Formatted full address
- `{{location.country}}` - Country name
- `{{location.region}}` - Region/Province (legacy alias for province)
- `{{location.lat}}` - Latitude
- `{{location.lon}}` - Longitude

#### Conditional Syntax
The template engine supports conditional blocks:
```
{{#if variable}}content to show if variable exists{{/if}}
{{#if variable}}content{{else}}fallback content{{/if}}
```

#### Other Variables
- `{{time}}` - Current time

### Default Template

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

## Usage

### Method 1: Slash Commands
Type `/tq` or `/天气位置` in the editor to insert the weather and location template.
If you have favorite cities configured, use shortcuts like `/bjtq` (Beijing), `/cstq` (Changsha), etc.

### Method 2: Command Palette
- `Insert Weather Info`
- `Insert Location Info`
- `Insert Weather & Location Template`
- `Open Weather & Location Settings`

### Settings Panel Features
- **Test button**: Test data fetching to verify API key and connectivity
- **Clear cache**: Clear cached weather and location data to force fresh requests
- **Template presets**: Quickly switch between default, simple, and table templates

## Template Examples

### Simple Template
```markdown
**Weather**: {{weather.description}} | **Temperature**: {{weather.temperature}}°C | **Location**: {{location.city}}
```

### Table Template
```markdown
| Item | Value |
|------|-------|
| Weather | {{weather.description}} |
| Temperature | {{weather.temperature}}°C |
| Humidity | {{weather.humidity}}% |
| Wind | {{weather.windSpeed}} m/s |
| Location | {{location.city}} |
| Time | {{time}} |
```

### Conditional Template
```markdown
## Today's Weather

🌤 **Weather**: {{weather.description}}
🌡 **Temperature**: {{weather.temperature}}°C
{{#if weather.dayWeather}}☀️ **Day**: {{weather.dayWeather}}
{{/if}}{{#if weather.nightWeather}}🌙 **Night**: {{weather.nightWeather}}
{{/if}}💧 **Humidity**: {{weather.humidity}}%

📍 **Location**: {{location.city}}
⏰ **Time**: {{time}}
```

## Notes

1. **API Key Security**: Keep your API keys secure and do not share them
2. **Free Tier Limits**: Amap weather API has free daily quotas; exceeding them may incur charges
3. **Browser Permission**: Location feature requires browser geolocation permission
4. **Network Required**: The plugin needs network access to fetch weather and location data

## FAQ

**Q: Why can't I get weather data?**
A: Check the following:
- Amap API Key is correctly configured in settings
- Network connection is working
- Use the "Test" button in settings to verify

**Q: Why is the location inaccurate?**
A: The plugin uses browser geolocation. Make sure you've granted location permission. Try moving to an area with better GPS signal.

**Q: How to add a favorite city?**
A: Open plugin settings → find "Favorite Cities" section. You can search for a city by name or manually enter coordinates.

**Q: How many favorite cities can I save?**
A: Up to 5 cities.

**Q: What do the slash command shortcuts mean?**
A: Each favorite city gets a pinyin-based shortcut. For example, `/bjtq` = Beijing (bj) + weather (tq). The prefix is auto-generated from the city name and can be customized in settings.

**Q: How do I clear cached data?**
A: Click "Clear cache" in the settings panel. This forces the plugin to fetch fresh weather and location data on the next request.

## Development

```bash
# Install dependencies
pnpm install

# Development mode
pnpm run dev

# Build
pnpm run build
```

## License

MIT
