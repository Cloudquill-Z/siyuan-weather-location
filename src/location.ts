export interface LocationData {
  city: string;
  country: string;
  lat: number;
  lon: number;
  formatted_address?: string;
  source?: 'gps';

  // 详细地址层级（高德地图逆地理编码返回）
  province?: string;
  district?: string;
  township?: string;
  street?: string;
  streetNumber?: string;

  // 向后兼容
  region?: string;
}

interface PluginConfig {
  amapKey: string;
}

export class LocationService {
  private config: PluginConfig;
  private cachedLocation: LocationData | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

  constructor(config: PluginConfig) {
    this.config = config;
  }

  updateConfig(config: PluginConfig) {
    this.config = config;
  }

  private async fetchWithTimeout(url: string, timeout: number = 5000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
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

  // 获取当前位置（仅使用高德地图）
  async getCurrentLocation(): Promise<LocationData | null> {
    if (this.cachedLocation && Date.now() - this.cacheTime < this.CACHE_DURATION) {
      return this.cachedLocation;
    }

    const location = await this.getLocationByAmap();

    if (location) {
      this.cachedLocation = location;
      this.cacheTime = Date.now();
    }

    return location;
  }

  // 通过高德地图获取位置（需要浏览器定位权限 + 高德逆地理编码）
  private async getLocationByAmap(): Promise<LocationData | null> {
    if (!this.config.amapKey) {
      throw new Error('未配置高德地图 API Key，请在插件设置中配置');
    }

    // 获取浏览器地理位置（带重试）
    const browserLocation = await this.getBrowserLocationWithRetry();

    if (!browserLocation) {
      throw new Error('无法获取浏览器地理位置。请检查浏览器定位权限是否已开启');
    }

    console.log('[LocationService] 浏览器定位成功:', browserLocation);

    // 高德逆地理编码获取详细地址
    const regeoUrl = `https://restapi.amap.com/v3/geocode/regeo?key=${this.config.amapKey}&location=${browserLocation.lon},${browserLocation.lat}&extensions=all`;
    console.log('[LocationService] 调用高德逆地理编码API...');
    const regeoResponse = await this.fetchWithTimeout(regeoUrl, 5000);
    const regeoData = await regeoResponse.json();

    if (regeoData.status !== '1' || !regeoData.regeocode) {
      throw new Error('高德逆地理编码失败: ' + (regeoData.info || '未知错误'));
    }

    const address = regeoData.regeocode.addressComponent;
    const formattedAddress = regeoData.regeocode.formatted_address || '';

    const result: LocationData = {
      city: address.city || address.province || '未知',
      country: address.country || '',
      lat: browserLocation.lat,
      lon: browserLocation.lon,
      formatted_address: formattedAddress,
      source: 'gps',

      province: address.province || '',
      district: address.district || '',
      township: address.township || '',
      street: address.street || '',
      streetNumber: address.streetNumber || address.number || '',

      region: address.province || ''
    };

    console.log('[LocationService] 高德定位成功:', result);
    return result;
  }

  // 获取浏览器地理位置（带重试机制）
  private async getBrowserLocationWithRetry(maxRetries: number = 2): Promise<{ lat: number; lon: number } | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[LocationService] 浏览器定位尝试 ${attempt}/${maxRetries}...`);

      try {
        const location = await this.getBrowserLocation();

        if (location) {
          if (this.isValidLocation(location)) {
            console.log(`[LocationService] 浏览器定位成功（第${attempt}次尝试）:`, location);
            return location;
          } else {
            console.warn(`[LocationService] 浏览器定位结果无效（第${attempt}次尝试）:`, location);
          }
        }
      } catch (error) {
        console.error(`[LocationService] 浏览器定位异常（第${attempt}次尝试）:`, error);
      }

      if (attempt < maxRetries) {
        const waitTime = attempt * 1000;
        console.log(`[LocationService] 等待 ${waitTime}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    console.warn('[LocationService] 所有浏览器定位尝试均失败');
    return null;
  }

  // 验证位置是否有效
  private isValidLocation(location: { lat: number; lon: number }): boolean {
    if (location.lat < -90 || location.lat > 90) {
      console.warn('[LocationService] 纬度超出有效范围:', location.lat);
      return false;
    }

    if (location.lon < -180 || location.lon > 180) {
      console.warn('[LocationService] 经度超出有效范围:', location.lon);
      return false;
    }

    if (location.lat === 0 && location.lon === 0) {
      console.warn('[LocationService] 位置为默认值 (0, 0)');
      return false;
    }

    return true;
  }

  // 获取浏览器地理位置
  private getBrowserLocation(): Promise<{ lat: number; lon: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.error('[LocationService] 浏览器不支持地理位置API');
        resolve(null);
        return;
      }

      console.log('[LocationService] 请求浏览器地理位置权限...');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const accuracy = position.coords.accuracy;
          console.log('[LocationService] 浏览器定位成功，精度:', accuracy, '米');

          if (accuracy > 5000) {
            console.warn('[LocationService] 定位精度过低（>5000米），可能不准确');
          }

          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => {
          const errorMessages: Record<number, string> = {
            1: '用户拒绝了地理位置请求',
            2: '无法获取位置信息',
            3: '获取位置信息超时'
          };
          console.error('[LocationService] 浏览器定位失败:', errorMessages[error.code] || error.message);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000
        }
      );
    });
  }

  // 清除缓存
  clearCache() {
    this.cachedLocation = null;
    this.cacheTime = 0;
  }
}
