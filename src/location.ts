import {
  cleanupStaleNativeLocationHelpers,
  ensureNativeLocationService,
  ensureNativeLocationServiceDetailed,
  getNativeLocationServiceStatus,
  getNativeLocationServiceDiagnostics,
  getNativeCoordinates,
  NativeCoordinates,
  NativeLocationHelperCleanupResult,
  NativeLocationHelperDiagnostics,
  NativeLocationHelperStartResult,
  shutdownNativeLocationService
} from './nativeLocation';

export interface LocationData {
  city: string;
  country: string;
  lat: number;
  lon: number;
  accuracy?: number;
  locationTimestamp?: number;
  formatted_address?: string;
  source?: 'gps' | 'browser-geolocation' | 'macos-corelocation' | 'windows-geolocation' | 'native';

  // 详细地址层级（高德地图逆地理编码返回）
  province?: string;
  district?: string;
  township?: string;
  street?: string;
  streetNumber?: string;
  preciseAddress?: string;
  neighborhoodName?: string;
  buildingName?: string;
  nearestPlace?: string;
  nearestPlaceType?: string;
  nearestPlaceDistance?: string;
  nearestPoiName?: string;
  nearestPoiType?: string;
  nearestPoiDistance?: string;
  nearestAoiName?: string;
  nearestAoiType?: string;
  nearestAoiDistance?: string;
  nearestRoadName?: string;
  nearestRoadDistance?: string;

  // 向后兼容
  region?: string;
}

interface PluginConfig {
  amapKey: string;
}

interface Coordinates {
  lat: number;
  lon: number;
  accuracy?: number;
  timestamp?: number;
  source: LocationData['source'];
}

function firstText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.find(item => typeof item === 'string' && item.trim()) || '';
  }

  return typeof value === 'string' ? value : '';
}

function parseDistance(value: unknown): number | undefined {
  const distance = Number(value);
  return Number.isFinite(distance) ? distance : undefined;
}

function formatDistance(value: unknown): string {
  const distance = parseDistance(value);
  if (distance === undefined) {
    return '';
  }
  return `${Math.round(distance)}米`;
}

function parseStreetNumber(streetNumber: unknown, fallback: unknown): string {
  if (typeof streetNumber === 'string') {
    return streetNumber;
  }

  if (streetNumber && typeof streetNumber === 'object') {
    const detail = streetNumber as { street?: string; number?: string };
    return [detail.street, detail.number].filter(Boolean).join('');
  }

  return typeof fallback === 'string' ? fallback : '';
}

function withDistance(name: string, distance: string): string {
  if (!name) {
    return '';
  }
  return distance ? `${name}（约${distance}）` : name;
}

export class LocationService {
  private config: PluginConfig;
  private pluginBasePath?: string;
  private cachedLocation: LocationData | null = null;
  private cacheTime: number = 0;
  private pendingLocation: Promise<LocationData | null> | null = null;
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30分钟缓存

  constructor(config: PluginConfig, pluginBasePath?: string) {
    this.config = config;
    this.pluginBasePath = pluginBasePath;
  }

  updateConfig(config: PluginConfig) {
    this.config = config;
    this.pendingLocation = null;
  }

  updatePluginBasePath(pluginBasePath?: string) {
    this.pluginBasePath = pluginBasePath;
    this.pendingLocation = null;
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

    if (this.pendingLocation) {
      return this.pendingLocation;
    }

    this.pendingLocation = this.getLocationByAmap();

    let location: LocationData | null;
    try {
      location = await this.pendingLocation;
    } finally {
      this.pendingLocation = null;
    }

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

    const coordinates = await this.getPreciseCoordinates();

    if (!coordinates) {
      throw new Error('无法获取真实地理位置。请检查原生定位助手是否可用、系统定位权限是否开启，或浏览器定位权限是否已开启');
    }

    console.log('[LocationService] 获取真实坐标成功:', coordinates);

    return this.reverseGeocode(coordinates.lat, coordinates.lon, {
      accuracy: coordinates.accuracy,
      timestamp: coordinates.timestamp,
      source: coordinates.source || 'gps'
    });
  }

  // 通过高德逆地理编码获取任意坐标的位置信息（供手动输入经纬度/搜索地点使用）
  async getLocationByCoordinates(lat: number, lon: number): Promise<LocationData> {
    if (!this.config.amapKey) {
      throw new Error('未配置高德地图 API Key，请在插件设置中配置');
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('经纬度无效');
    }

    return this.reverseGeocode(lat, lon, { source: 'gps' });
  }

  // 高德逆地理编码获取详细地址
  private async reverseGeocode(
    lat: number,
    lon: number,
    extra: { accuracy?: number; timestamp?: number; source: LocationData['source'] }
  ): Promise<LocationData> {
    const coordinates = { lat, lon, accuracy: extra.accuracy, timestamp: extra.timestamp, source: extra.source };
    const regeoUrl = `https://restapi.amap.com/v3/geocode/regeo?key=${this.config.amapKey}&location=${lon},${lat}&extensions=all&radius=1000&roadlevel=0&homeorcorp=1`;
    console.log('[LocationService] 调用高德逆地理编码API...');
    const regeoResponse = await this.fetchWithTimeout(regeoUrl, 5000);
    const regeoData = await regeoResponse.json();

    if (regeoData.status !== '1' || !regeoData.regeocode) {
      throw new Error('高德逆地理编码失败: ' + (regeoData.info || '未知错误'));
    }

    const address = regeoData.regeocode.addressComponent;
    const formattedAddress = regeoData.regeocode.formatted_address || '';
    const pois = Array.isArray(regeoData.regeocode.pois) ? regeoData.regeocode.pois : [];
    const aois = Array.isArray(regeoData.regeocode.aois) ? regeoData.regeocode.aois : [];
    const roads = Array.isArray(regeoData.regeocode.roads) ? regeoData.regeocode.roads : [];
    const nearestPoi = pois[0] || null;
    const nearestAoi = aois[0] || null;
    const nearestRoad = roads[0] || null;
    const neighborhoodName = firstText(address.neighborhood?.name);
    const buildingName = firstText(address.building?.name);
    const nearestPoiName = firstText(nearestPoi?.name);
    const nearestAoiName = firstText(nearestAoi?.name);
    const nearestRoadName = firstText(nearestRoad?.name);
    const nearestPoiDistance = formatDistance(nearestPoi?.distance);
    const nearestAoiDistance = formatDistance(nearestAoi?.distance);
    const nearestRoadDistance = formatDistance(nearestRoad?.distance);
    const nearestPoiDistanceValue = parseDistance(nearestPoi?.distance);
    const nearestAoiDistanceValue = parseDistance(nearestAoi?.distance);
    const nearestPlaceFromAoi = nearestAoiName && (
      nearestAoiDistanceValue !== undefined &&
      (nearestPoiDistanceValue === undefined || nearestAoiDistanceValue <= nearestPoiDistanceValue)
    );
    const nearestPlaceName = nearestPlaceFromAoi ? nearestAoiName : nearestPoiName;
    const nearestPlaceDistance = nearestPlaceFromAoi ? nearestAoiDistance : nearestPoiDistance;
    const nearestPlaceType = nearestPlaceFromAoi ? firstText(nearestAoi?.type) : firstText(nearestPoi?.type);
    const reliablePlace = buildingName || neighborhoodName || (nearestAoiDistanceValue !== undefined && nearestAoiDistanceValue <= 150 ? nearestAoiName : '');
    const preciseAddress = [formattedAddress, reliablePlace].filter(Boolean).join(' · ');

    const result: LocationData = {
      city: address.city || address.province || '未知',
      country: address.country || '',
      lat: coordinates.lat,
      lon: coordinates.lon,
      accuracy: coordinates.accuracy,
      locationTimestamp: coordinates.timestamp,
      formatted_address: formattedAddress,
      source: coordinates.source || 'gps',

      province: address.province || '',
      district: address.district || '',
      township: address.township || '',
      street: address.street || address.streetNumber?.street || '',
      streetNumber: parseStreetNumber(address.streetNumber, address.number),
      preciseAddress: preciseAddress || formattedAddress,
      neighborhoodName,
      buildingName,
      nearestPlace: withDistance(nearestPlaceName, nearestPlaceDistance),
      nearestPlaceType,
      nearestPlaceDistance,
      nearestPoiName,
      nearestPoiType: firstText(nearestPoi?.type),
      nearestPoiDistance,
      nearestAoiName,
      nearestAoiType: firstText(nearestAoi?.type),
      nearestAoiDistance,
      nearestRoadName,
      nearestRoadDistance,

      region: address.province || ''
    };

    console.log('[LocationService] 高德定位成功:', result);
    return result;
  }

  private async getPreciseCoordinates(): Promise<Coordinates | null> {
    try {
      const nativeLocation = await getNativeCoordinates(this.pluginBasePath);
      if (nativeLocation && this.isValidLocation(nativeLocation)) {
        console.log('[LocationService] 原生定位助手成功:', nativeLocation);
        return this.toCoordinates(nativeLocation);
      }
    } catch (error) {
      console.warn('[LocationService] 原生定位助手不可用:', error);
    }

    const browserLocation = await this.getBrowserLocationWithRetry();
    if (browserLocation) {
      return browserLocation;
    }

    return null;
  }

  private toCoordinates(location: NativeCoordinates): Coordinates {
    return {
      lat: location.lat,
      lon: location.lon,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
      source: location.source as LocationData['source']
    };
  }

  // 获取浏览器地理位置（带重试机制）
  private async getBrowserLocationWithRetry(maxRetries: number = 2): Promise<Coordinates | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[LocationService] 浏览器定位尝试 ${attempt}/${maxRetries}...`);

      try {
        const location = await this.getBrowserLocation({
          enableHighAccuracy: attempt === 1,
          timeout: attempt === 1 ? 10000 : 5000,
          maximumAge: attempt === 1 ? 30000 : 10 * 60 * 1000
        });

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
  private getBrowserLocation(options: PositionOptions): Promise<Coordinates | null> {
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
            lon: position.coords.longitude,
            accuracy,
            timestamp: position.timestamp,
            source: 'browser-geolocation'
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
        options
      );
    });
  }

  // 清除缓存
  clearCache() {
    this.cachedLocation = null;
    this.cacheTime = 0;
    this.pendingLocation = null;
  }

  async shutdownNativeHelper(): Promise<boolean> {
    this.clearCache();
    return shutdownNativeLocationService();
  }

  async getNativeHelperStatus(): Promise<'running' | 'stopped'> {
    return getNativeLocationServiceStatus();
  }

  async restartNativeHelper(): Promise<boolean> {
    this.clearCache();
    await shutdownNativeLocationService();
    return ensureNativeLocationService(this.pluginBasePath);
  }

  async restartNativeHelperDetailed(): Promise<NativeLocationHelperStartResult> {
    this.clearCache();
    await shutdownNativeLocationService();
    return ensureNativeLocationServiceDetailed(this.pluginBasePath);
  }

  async ensureNativeHelper(): Promise<boolean> {
    return ensureNativeLocationService(this.pluginBasePath);
  }

  async ensureNativeHelperDetailed(): Promise<NativeLocationHelperStartResult> {
    return ensureNativeLocationServiceDetailed(this.pluginBasePath);
  }

  async getNativeHelperDiagnostics(): Promise<NativeLocationHelperDiagnostics> {
    return getNativeLocationServiceDiagnostics(this.pluginBasePath);
  }

  async cleanupStaleNativeHelpers(): Promise<NativeLocationHelperCleanupResult> {
    return cleanupStaleNativeLocationHelpers(this.pluginBasePath);
  }
}
