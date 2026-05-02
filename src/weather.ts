export interface WeatherData {
  description: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  pressure?: number;
  visibility?: number;
  icon: string;
  feelsLike?: number;
  tempMin?: number;
  tempMax?: number;
  sunrise?: string;
  sunset?: string;
  windDirection?: string;
  windPower?: string;
  dayWeather?: string;
  nightWeather?: string;
  dayWindDirection?: string;
  nightWindDirection?: string;
  dayWindPower?: string;
  nightWindPower?: string;
}

interface PluginConfig {
  weatherApiKey: string;
  weatherProvider: 'openweather' | 'amap';
  amapKey: string;
}

export class WeatherService {
  private config: PluginConfig;
  private cachedWeather: Map<string, { data: WeatherData; timestamp: number }> = new Map();
  private cachedAdcode: Map<string, { adcode: string; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15分钟天气缓存
  private readonly ADCODE_CACHE_DURATION = 60 * 60 * 1000; // 1小时adcode缓存

  constructor(config: PluginConfig) {
    this.config = config;
  }

  updateConfig(config: PluginConfig) {
    this.config = config;
  }

  // 带超时的fetch请求
  private async fetchWithTimeout(url: string, timeout: number = 5000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`请求超时（${timeout}ms）`);
      }
      throw error;
    }
  }

  // 清除缓存
  clearCache() {
    this.cachedWeather.clear();
    this.cachedAdcode.clear();
    console.log('[WeatherService] 缓存已清除');
  }

  // 获取缓存的adcode
  private getCachedAdcode(lat: number, lon: number): string | null {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = this.cachedAdcode.get(key);
    if (cached && Date.now() - cached.timestamp < this.ADCODE_CACHE_DURATION) {
      return cached.adcode;
    }
    return null;
  }

  // 缓存adcode
  private cacheAdcode(lat: number, lon: number, adcode: string) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    this.cachedAdcode.set(key, { adcode, timestamp: Date.now() });
  }

  // 获取天气信息
  async getWeather(lat: number, lon: number): Promise<WeatherData | null> {
    const cacheKey = `${this.config.weatherProvider}-${lat.toFixed(2)}-${lon.toFixed(2)}`;
    
    // 检查缓存
    const cached = this.cachedWeather.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log('[WeatherService] 使用缓存的天气数据');
      return cached.data;
    }
    
    // 获取新数据
    let weather: WeatherData | null;
    switch (this.config.weatherProvider) {
      case 'openweather':
        weather = await this.getOpenWeatherData(lat, lon);
        break;
      case 'amap':
        weather = await this.getAmapWeatherData(lat, lon);
        break;
      default:
        weather = await this.getOpenWeatherData(lat, lon);
    }
    
    // 更新缓存
    if (weather) {
      this.cachedWeather.set(cacheKey, { data: weather, timestamp: Date.now() });
    }
    
    return weather;
  }

  // OpenWeatherMap API
  private async getOpenWeatherData(lat: number, lon: number): Promise<WeatherData | null> {
    if (!this.config.weatherApiKey) {
      console.error('[WeatherService] 未配置天气 API Key，无法获取真实天气数据');
      throw new Error('未配置天气 API Key，请在插件设置中配置 OpenWeatherMap API Key');
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.config.weatherApiKey}&units=metric&lang=zh_cn`;
      console.log('[WeatherService] 调用OpenWeatherMap API...');
      const response = await this.fetchWithTimeout(url, 5000);
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('天气 API Key 无效，请检查配置');
        } else if (response.status === 404) {
          throw new Error('未找到该位置的天气信息');
        } else {
          throw new Error(`OpenWeather API 错误: ${response.status}`);
        }
      }

      const data = await response.json();
      
      if (!data.weather || !data.weather[0]) {
        throw new Error('天气数据格式错误');
      }
      
      // 验证关键数据是否存在且有效
      if (data.main.humidity === undefined || data.main.humidity === null) {
        console.warn('[WeatherService] API 返回的湿度数据为空');
      }
      if (data.main.pressure === undefined || data.main.pressure === null) {
        console.warn('[WeatherService] API 返回的气压数据为空');
      }
      if (data.main.temp === undefined || data.main.temp === null) {
        throw new Error('API 返回的温度数据为空');
      }
      
      const description = data.weather[0]?.description;
      if (!description) {
        throw new Error('天气描述为空');
      }

      const windDeg = data.wind?.deg || 0;
      const windSpeed = data.wind?.speed || 0;
      
      // 能见度：从米转换为公里，如果没有则返回undefined（不使用默认值）
      const visibilityKm = data.visibility ? data.visibility / 1000 : undefined;
      
      return {
        description: this.translateWeatherDescription(description),
        temperature: Math.round(data.main.temp),
        humidity: data.main.humidity,
        windSpeed: windSpeed,
        pressure: data.main.pressure,
        visibility: visibilityKm,
        icon: data.weather[0]?.icon || '',
        feelsLike: data.main.feels_like !== undefined ? Math.round(data.main.feels_like) : undefined,
        tempMin: data.main.temp_min !== undefined ? Math.round(data.main.temp_min) : undefined,
        tempMax: data.main.temp_max !== undefined ? Math.round(data.main.temp_max) : undefined,
        sunrise: data.sys.sunrise ? new Date(data.sys.sunrise * 1000).toLocaleTimeString('zh-CN') : undefined,
        sunset: data.sys.sunset ? new Date(data.sys.sunset * 1000).toLocaleTimeString('zh-CN') : undefined,
        windDirection: this.getWindDirection(windDeg),
        windPower: this.getWindPower(windSpeed)
      };
    } catch (error) {
      console.error('[WeatherService] 获取天气数据失败:', error);
      throw error;
    }
  }

  // 根据角度获取风向
  private getWindDirection(deg: number): string {
    const directions = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];
    const index = Math.round(deg / 45) % 8;
    return directions[index];
  }

  // 根据风速获取风力等级
  private getWindPower(speed: number): string {
    if (speed < 0.3) return '无风';
    if (speed < 1.6) return '1级';
    if (speed < 3.4) return '2级';
    if (speed < 5.5) return '3级';
    if (speed < 8.0) return '4级';
    if (speed < 10.8) return '5级';
    if (speed < 13.9) return '6级';
    if (speed < 17.2) return '7级';
    if (speed < 20.8) return '8级';
    if (speed < 24.5) return '9级';
    if (speed < 28.5) return '10级';
    if (speed < 32.7) return '11级';
    return '12级';
  }

  // 高德地图天气API
  private async getAmapWeatherData(lat: number, lon: number): Promise<WeatherData | null> {
    if (!this.config.amapKey) {
      console.error('[WeatherService] 未配置高德地图 API Key，无法获取真实天气数据');
      throw new Error('未配置高德地图 API Key，请在插件设置中配置');
    }

    try {
      // 尝试从缓存获取adcode
      let adcode = this.getCachedAdcode(lat, lon);
      
      if (!adcode) {
        // 没有缓存，需要先获取adcode
        const regeoUrl = `https://restapi.amap.com/v3/geocode/regeo?key=${this.config.amapKey}&location=${lon},${lat}&extensions=base`;
        console.log('[WeatherService] 调用高德逆地理编码API...');
        const regeoResponse = await this.fetchWithTimeout(regeoUrl, 5000);
        const regeoData = await regeoResponse.json();

        if (regeoData.status !== '1' || !regeoData.regeocode) {
          throw new Error('高德逆地理编码失败');
        }

        adcode = regeoData.regeocode.addressComponent.adcode || '';
        if (adcode) {
          this.cacheAdcode(lat, lon, adcode);
          console.log('[WeatherService] 高德adcode已缓存:', adcode);
        }
      } else {
        console.log('[WeatherService] 使用缓存的高德adcode:', adcode);
      }
      
      // 同时获取实时天气和预报数据，合并结果
      const [liveData, forecastData] = await Promise.all([
        // 实时数据：包含湿度、精确风力、当前温度
        this.fetchWithTimeout(`https://restapi.amap.com/v3/weather/weatherInfo?key=${this.config.amapKey}&city=${adcode}&extensions=base`, 5000),
        // 预报数据：包含最低温度、最高温度
        this.fetchWithTimeout(`https://restapi.amap.com/v3/weather/weatherInfo?key=${this.config.amapKey}&city=${adcode}&extensions=all`, 5000)
      ]);

      const liveResponse = await liveData.json();
      const forecastResponse = await forecastData.json();

      if (liveResponse.status !== '1' || !liveResponse.lives || liveResponse.lives.length === 0) {
        throw new Error('高德实时天气API失败');
      }

      if (forecastResponse.status !== '1' || !forecastResponse.forecasts || forecastResponse.forecasts.length === 0) {
        throw new Error('高德预报天气API失败');
      }

      const live = liveResponse.lives[0];
      const forecast = forecastResponse.forecasts[0];
      const todayCast = forecast.casts?.[0];
      
      const windPower = live.windpower;
      if (!windPower) {
        throw new Error('风力数据为空');
      }
      
      // 解析湿度，确保从API返回的数据正确转换
      const rawHumidity = live.humidity;
      const parsedHumidity = parseInt(rawHumidity);
      
      // 验证湿度数据是否来自真实API
      if (rawHumidity === undefined || rawHumidity === null || rawHumidity === '') {
        console.error('[WeatherService] 高德API返回的湿度数据为空，请检查API配置和调用限制');
        throw new Error('无法获取真实湿度数据，API返回为空');
      }
      
      if (isNaN(parsedHumidity)) {
        throw new Error('湿度数据格式无效');
      }
      const humidity = parsedHumidity;
      
      // 验证温度数据
      const rawTemperature = live.temperature;
      if (rawTemperature === undefined || rawTemperature === null || rawTemperature === '') {
        console.error('[WeatherService] 高德API返回的温度数据为空');
        throw new Error('无法获取真实温度数据，API返回为空');
      }
      const temperature = parseInt(rawTemperature);
      if (isNaN(temperature)) {
        throw new Error('温度数据格式无效');
      }
      
      // 解析预报数据：温度、白天/夜间天气、风力
      let tempMin: number | undefined;
      let tempMax: number | undefined;
      let dayWeather: string | undefined;
      let nightWeather: string | undefined;
      let dayWindDirection: string | undefined;
      let nightWindDirection: string | undefined;
      let dayWindPower: string | undefined;
      let nightWindPower: string | undefined;

      if (todayCast) {
        const rawNightTemp = todayCast.nighttemp;
        const rawDayTemp = todayCast.daytemp;

        if (rawNightTemp !== undefined && rawNightTemp !== null && rawNightTemp !== '') {
          const parsedNightTemp = parseInt(rawNightTemp);
          if (!isNaN(parsedNightTemp)) {
            tempMin = parsedNightTemp;
          }
        }

        if (rawDayTemp !== undefined && rawDayTemp !== null && rawDayTemp !== '') {
          const parsedDayTemp = parseInt(rawDayTemp);
          if (!isNaN(parsedDayTemp)) {
            tempMax = parsedDayTemp;
          }
        }

        dayWeather = todayCast.dayweather || undefined;
        nightWeather = todayCast.nightweather || undefined;
        dayWindDirection = todayCast.daywind || undefined;
        nightWindDirection = todayCast.nightwind || undefined;
        if (todayCast.daypower) {
          dayWindPower = todayCast.daypower.replace('≤', '') + '级';
        }
        if (todayCast.nightpower) {
          nightWindPower = todayCast.nightpower.replace('≤', '') + '级';
        }
      }

      // 用预报数据构建全天天气描述
      let description: string;
      if (dayWeather && nightWeather) {
        if (dayWeather === nightWeather) {
          description = `全天${dayWeather}`;
        } else {
          description = `${dayWeather}转${nightWeather}`;
        }
      } else {
        description = live.weather;
      }

      console.log('[WeatherService] 高德天气数据:', {
        rawHumidity,
        parsedHumidity,
        humidity,
        rawTemperature,
        temperature,
        tempMin,
        tempMax,
        description,
        dayWeather,
        nightWeather
      });

      if (!description) {
        throw new Error('天气描述为空');
      }

      return {
        description,
        temperature: temperature,
        humidity: humidity,
        windSpeed: this.parseWindSpeed(windPower),
        pressure: undefined,
        visibility: undefined,
        icon: '',
        tempMin,
        tempMax,
        windDirection: live.winddirection || undefined,
        windPower: windPower.replace('≤', '') + '级',
        dayWeather,
        nightWeather,
        dayWindDirection,
        nightWindDirection,
        dayWindPower,
        nightWindPower
      } as WeatherData;
    } catch (error) {
      console.error('[WeatherService] 高德天气API错误:', error);
      throw error;
    }
  }

  // 解析风力等级
  private parseWindSpeed(windPower: string): number {
    // 高德返回的风力格式如 "≤3", "4", "5-6" 等
    if (windPower.includes('≤')) {
      return 2;
    }
    if (windPower.includes('-')) {
      const [min, max] = windPower.split('-').map(Number);
      return (min + max) / 2;
    }
    const level = parseInt(windPower);
    if (!isNaN(level)) {
      // 将风力等级转换为近似风速 (m/s)
      const windSpeedMap: { [key: number]: number } = {
        0: 0, 1: 1.5, 2: 3, 3: 5, 4: 7, 5: 9, 6: 12, 7: 15, 8: 19, 9: 23
      };
      return windSpeedMap[level] || level * 2;
    }
    throw new Error(`风力数据格式无效: ${windPower}`);
  }

  // 翻译天气描述（OpenWeatherMap返回的是英文）
  private translateWeatherDescription(description: string): string {
    const translations: { [key: string]: string } = {
      'clear sky': '晴朗',
      'few clouds': '少云',
      'scattered clouds': '多云',
      'broken clouds': '阴天',
      'shower rain': '阵雨',
      'rain': '雨',
      'light rain': '小雨',
      'moderate rain': '中雨',
      'heavy rain': '大雨',
      'thunderstorm': '雷雨',
      'snow': '雪',
      'mist': '雾',
      'overcast clouds': '阴',
      'light snow': '小雪',
      'heavy snow': '大雪'
    };
    
    return translations[description.toLowerCase()] || description;
  }

}
