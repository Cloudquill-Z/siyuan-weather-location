# Weather & Location Plugin for SiYuan

A SiYuan Note plugin that automatically fetches weather and location information, and inserts it into daily notes via templates.

## Features

- 🌤 **Weather Query**: Support multiple weather data sources (OpenWeatherMap, Amap)
- 📍 **Location Query**: Support IP geolocation, browser geolocation, and manual location setting
- 📝 **Template Support**: Customizable templates with rich variables and conditional syntax
- 🤖 **Auto Insert**: Automatically insert into daily notes when created
- 🎨 **Multiple Output Formats**: Support text, table, and custom formats
- ⚡ **Slash Commands**: Quick insert via `/tq` or `/天气位置`; per-city shortcuts for favorite cities
- ⭐ **Favorite Cities**: Save up to 5 cities for quick weather lookup
- 🔄 **Auto Fallback**: IP location service auto-falls back across multiple providers

## Installation

1. Download the latest release from the marketplace
2. Enable the plugin in Settings → Marketplace → Plugins

## Configuration

### Weather Settings

1. Select a weather data provider:
   - **OpenWeatherMap**: International, requires free API Key
   - **Amap**: For China users, requires Amap Key

2. Enter the corresponding API Key

### Location Settings

1. Select location provider:
   - **IP Geolocation**: Automatic, no configuration needed. Falls back across multiple services (ipinfo.io → ipapi.co → ip-api.com → Sina)
   - **Amap Geolocation**: Precise location, requires browser permission and Amap Key
   - **Manual**: Set fixed location manually (format: `CityName,lat,lon`)

### Favorite Cities

The plugin supports saving up to 5 frequently used cities. Once added, each city gets a slash command shortcut using its pinyin prefix (e.g., `/bjtq` for Beijing, `/cstq` for Changsha).

- Add cities by searching or manual coordinate entry in settings
- Each city generates a unique slash command: `<pinyin-prefix>tq`
- Edit or remove cities from the settings panel

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
- `{{weather.pressure}}` - Pressure (hPa)
- `{{weather.visibility}}` - Visibility (km)
- `{{weather.feelsLike}}` - Feels like temperature (°C)
- `{{weather.tempMin}}` - Min temperature (°C)
- `{{weather.tempMax}}` - Max temperature (°C)
- `{{weather.sunrise}}` - Sunrise time
- `{{weather.sunset}}` - Sunset time

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
- `{{location.ip}}` - IP address (when using IP location)
- `{{location.timezone}}` - Timezone

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
{{#if weather.feelsLike}}🤔 **体感温度**: {{weather.feelsLike}}°C
{{/if}}💧 **相对湿度**: {{weather.humidity}}%
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

### Method 1: Auto Insert (Recommended)
Enable "Auto insert when creating daily note" in settings. The plugin will automatically insert weather and location info when you create a new daily note.

### Method 2: Slash Commands
Type `/tq` or `/天气位置` in the editor to insert the weather and location template.
If you have favorite cities configured, use shortcuts like `/bjtq` (Beijing), `/cstq` (Changsha), etc.

### Method 3: Command Palette
- `Insert Weather Info`
- `Insert Location Info`
- `Insert Weather & Location Template`

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
{{#if weather.feelsLike}}🤔 **Feels Like**: {{weather.feelsLike}}°C
{{/if}}💧 **Humidity**: {{weather.humidity}}%

📍 **Location**: {{location.city}}
⏰ **Time**: {{time}}
```

## API Keys

### OpenWeatherMap
1. Visit [openweathermap.org](https://openweathermap.org/api)
2. Sign up for a free account
3. Get your API Key from the dashboard

### Amap
1. Visit [lbs.amap.com](https://lbs.amap.com/)
2. Register and create an application
3. Get the Web Service API Key

## Notes

1. **API Key Security**: Keep your API keys secure and do not share them
2. **Free Tier Limits**: Weather APIs have free daily quotas; exceeding them may incur charges
3. **Location Accuracy**: IP geolocation provides city-level accuracy; for precise location use browser geolocation or manual settings
4. **Network Required**: The plugin needs network access to fetch weather and location data

## FAQ

**Q: Why can't I get weather data?**
A: Check the following:
- API Key is correctly configured
- Network connection is working
- Weather service provider is available

**Q: Why is the location inaccurate?**
A: IP geolocation has limited accuracy. For more precise results, use browser geolocation (Amap) or manual location settings.

**Q: How to disable auto-insert?**
A: Disable the "Auto insert when creating daily note" option in plugin settings.

**Q: How to add a favorite city?**
A: Open plugin settings → find "Favorite Cities" section → search for a city or manually enter coordinates.

**Q: What do the slash command shortcuts mean?**
A: Each favorite city gets a pinyin-based shortcut. For example, `/bjtq` = Beijing (bj) + weather (tq). The prefix is auto-generated from the first two characters of the city name.

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
