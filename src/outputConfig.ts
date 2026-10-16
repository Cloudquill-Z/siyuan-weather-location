export type OutputStyle = 'compact' | 'grouped' | 'table' | 'advanced';

export interface OutputFieldConfig {
  key: string;
  label: string;
  icon: string;
  enabled: boolean;
}

export interface OutputConfig {
  style: OutputStyle;
  title: string;
  fields: OutputFieldConfig[];
}

export const DEFAULT_OUTPUT_FIELDS: OutputFieldConfig[] = [
  { key: 'weather.description', label: '天气状况', icon: '🌤', enabled: true },
  { key: 'weather.dayWeather', label: '白天天气', icon: '☀️', enabled: true },
  { key: 'weather.nightWeather', label: '夜间天气', icon: '🌙', enabled: true },
  { key: 'weather.temperature', label: '当前温度', icon: '🌡', enabled: true },
  { key: 'weather.humidity', label: '相对湿度', icon: '💧', enabled: true },
  { key: 'weather.windDirection', label: '风向', icon: '🌬', enabled: true },
  { key: 'weather.windPower', label: '风力', icon: '💨', enabled: true },
  { key: 'weather.windSpeed', label: '风速', icon: '📊', enabled: true },
  { key: 'weather.tempMin', label: '最低温度', icon: '🔽', enabled: true },
  { key: 'weather.tempMax', label: '最高温度', icon: '🔼', enabled: true },
  { key: 'location.city', label: '当前位置', icon: '📍', enabled: true },
  { key: 'location.province', label: '省份', icon: '🏛', enabled: true },
  { key: 'location.district', label: '区县', icon: '🏙', enabled: true },
  { key: 'location.township', label: '乡镇/街道', icon: '🏘', enabled: true },
  { key: 'location.street', label: '街道', icon: '🛣', enabled: true },
  { key: 'location.streetNumber', label: '门牌号', icon: '🔢', enabled: true },
  { key: 'location.preciseAddress', label: '精确地址', icon: '📌', enabled: true },
  { key: 'location.nearestPlace', label: '附近地点', icon: '🏢', enabled: true },
  { key: 'location.formatted_address', label: '详细地址', icon: '📝', enabled: true },
  { key: 'location.country', label: '国家', icon: '🌍', enabled: true },
  { key: 'location.coordinates', label: '坐标', icon: '🌐', enabled: true },
  { key: 'time', label: '记录时间', icon: '⏰', enabled: true }
];

export const DEFAULT_OUTPUT_CONFIG: OutputConfig = createDefaultOutputConfig();

export function createDefaultOutputConfig(): OutputConfig {
  return {
    style: 'grouped',
    title: '今日天气与位置',
    fields: DEFAULT_OUTPUT_FIELDS.map(field => ({ ...field }))
  };
}

export function normalizeOutputConfig(value: Partial<OutputConfig> | null | undefined): OutputConfig {
  const fallback = createDefaultOutputConfig();
  const inputFields = Array.isArray(value?.fields) ? value.fields : [];
  const defaultsByKey = new Map(fallback.fields.map(field => [field.key, field]));
  const normalizedFields = inputFields
    .map(field => normalizeField(field, defaultsByKey.get(field.key)))
    .filter((field): field is OutputFieldConfig => Boolean(field));
  const normalizedKeys = new Set(normalizedFields.map(field => field.key));

  fallback.fields.forEach(field => {
    if (!normalizedKeys.has(field.key)) {
      normalizedFields.push({ ...field });
    }
  });

  return {
    style: isOutputStyle(value?.style) ? value.style : fallback.style,
    title: typeof value?.title === 'string' ? value.title : fallback.title,
    fields: normalizedFields
  };
}

function normalizeField(
  field: Partial<OutputFieldConfig>,
  fallback: OutputFieldConfig | undefined
): OutputFieldConfig | null {
  if (!field.key || !fallback) {
    return null;
  }

  return {
    ...fallback,
    label: field.label || fallback.label,
    icon: field.icon ?? fallback.icon,
    enabled: typeof field.enabled === 'boolean' ? field.enabled : fallback.enabled
  };
}

export function renderOutputConfig(config: OutputConfig, data: any): string {
  const normalized = normalizeOutputConfig(config);
  if (normalized.style === 'table') {
    return renderTable(normalized, data);
  }
  if (normalized.style === 'compact') {
    return renderCompact(normalized, data);
  }
  return renderGrouped(normalized, data);
}

function isOutputStyle(value: unknown): value is OutputStyle {
  return value === 'compact' || value === 'grouped' || value === 'table' || value === 'advanced';
}

function renderGrouped(config: OutputConfig, data: any): string {
  const lines = config.fields
    .filter(field => field.enabled)
    .map(field => renderFieldLine(field, data))
    .filter(Boolean);

  return [
    config.title ? `## ${config.title}` : '',
    '',
    ...lines
  ].filter((line, index) => line || index < 2).join('\n').trimEnd() + '\n';
}

function renderCompact(config: OutputConfig, data: any): string {
  const parts = config.fields
    .filter(field => field.enabled)
    .map(field => {
      const value = formatFieldValue(field.key, data);
      return value ? `**${field.label}**: ${value}` : '';
    })
    .filter(Boolean);

  return parts.join(' | ') + '\n';
}

function renderTable(config: OutputConfig, data: any): string {
  const rows = config.fields
    .filter(field => field.enabled)
    .map(field => {
      const value = formatFieldValue(field.key, data);
      return value ? `| ${escapeTableCell(field.label)} | ${escapeTableCell(value)} |` : '';
    })
    .filter(Boolean);

  return ['| 项目 | 数值 |', '|------|------|', ...rows].join('\n') + '\n';
}

function renderFieldLine(field: OutputFieldConfig, data: any): string {
  const value = formatFieldValue(field.key, data);
  if (!value) {
    return '';
  }

  const icon = field.icon ? `${field.icon} ` : '';
  return `${icon}**${field.label}**: ${value}`;
}

function formatFieldValue(key: string, data: any): string {
  if (key === 'location.coordinates') {
    const lat = getNestedValue(data, 'location.lat');
    const lon = getNestedValue(data, 'location.lon');
    return lat !== undefined && lon !== undefined ? `${lat}, ${lon}` : '';
  }

  const value = getNestedValue(data, key);
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (key === 'weather.temperature' || key === 'weather.tempMin' || key === 'weather.tempMax') {
    return `${value}°C`;
  }

  if (key === 'weather.humidity') {
    return `${value}%`;
  }

  if (key === 'weather.windSpeed') {
    return `${value} m/s`;
  }

  return String(value);
}

function getNestedValue(obj: any, path: string): unknown {
  return path.split('.').reduce((value, key) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    return value[key];
  }, obj);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
