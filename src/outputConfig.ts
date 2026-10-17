// 输出格式配置：字段标签 + 自定义符号的简洁模式
//
// 格式由一串「标签」和标签之间的「符号文本」组成：
//   gaps[0] + chips[0] + gaps[1] + chips[1] + ... + gaps[n]
// chips 中的字段标签渲染为对应的数据值，NEWLINE_CHIP 渲染为换行，
// gaps 中的符号文本原样输出（如 " | "、"**天气**: "、"°C"）。

export const NEWLINE_CHIP = '__newline__';

export type OutputChip = string; // 字段 key 或 NEWLINE_CHIP

export interface OutputFieldConfig {
  key: string;
  label: string;
  icon: string;
}

export interface OutputConfig {
  chips: OutputChip[];
  gaps: string[]; // 长度 = chips.length + 1，gaps[i] 位于 chips[i] 之前
}

// 可选字段标签（在设置页以按钮标签形式呈现）
export const OUTPUT_FIELDS: OutputFieldConfig[] = [
  { key: 'weather.description', label: '天气状况', icon: '🌤' },
  { key: 'weather.dayWeather', label: '白天天气', icon: '☀️' },
  { key: 'weather.nightWeather', label: '夜间天气', icon: '🌙' },
  { key: 'weather.temperature', label: '当前温度', icon: '🌡' },
  { key: 'weather.humidity', label: '相对湿度', icon: '💧' },
  { key: 'weather.windDirection', label: '风向', icon: '🌬' },
  { key: 'weather.windPower', label: '风力', icon: '💨' },
  { key: 'weather.windSpeed', label: '风速', icon: '📊' },
  { key: 'weather.tempMin', label: '最低温度', icon: '🔽' },
  { key: 'weather.tempMax', label: '最高温度', icon: '🔼' },
  { key: 'location.city', label: '当前位置', icon: '📍' },
  { key: 'location.province', label: '省份', icon: '🏛' },
  { key: 'location.district', label: '区县', icon: '🏙' },
  { key: 'location.township', label: '乡镇/街道', icon: '🏘' },
  { key: 'location.street', label: '街道', icon: '🛣' },
  { key: 'location.streetNumber', label: '门牌号', icon: '🔢' },
  { key: 'location.preciseAddress', label: '精确地址', icon: '📌' },
  { key: 'location.nearestPlace', label: '附近地点', icon: '🏢' },
  { key: 'location.formatted_address', label: '详细地址', icon: '📝' },
  { key: 'location.country', label: '国家', icon: '🌍' },
  { key: 'location.coordinates', label: '坐标', icon: '🌐' },
  { key: 'time', label: '记录时间', icon: '⏰' }
];

// 兼容旧代码引用
export const DEFAULT_OUTPUT_FIELDS = OUTPUT_FIELDS;

const FIELD_KEYS = new Set(OUTPUT_FIELDS.map(field => field.key));

export function isValidChip(chip: unknown): chip is OutputChip {
  return chip === NEWLINE_CHIP || (typeof chip === 'string' && FIELD_KEYS.has(chip));
}

export function getFieldMeta(key: string): OutputFieldConfig | undefined {
  return OUTPUT_FIELDS.find(field => field.key === key);
}

// 字段常用的单位后缀（用于默认格式和旧配置迁移）
function defaultUnitSuffix(key: string): string {
  if (key === 'weather.temperature' || key === 'weather.tempMin' || key === 'weather.tempMax') {
    return '°C';
  }
  if (key === 'weather.humidity') {
    return '%';
  }
  if (key === 'weather.windSpeed') {
    return ' m/s';
  }
  return '';
}

export const DEFAULT_OUTPUT_CONFIG: OutputConfig = createDefaultOutputConfig();

export function createDefaultOutputConfig(): OutputConfig {
  return buildConfig('## 今日天气与位置', [
    'weather.description',
    'weather.temperature',
    'weather.humidity',
    'weather.windDirection',
    'weather.windPower',
    'location.city',
    'time'
  ]);
}

// 由标题 + 字段 key 列表构造「每行一个字段」的默认格式
function buildConfig(title: string, keys: string[]): OutputConfig {
  const chips: OutputChip[] = [];
  const gaps: string[] = [];

  if (title) {
    gaps.push(title);
    chips.push(NEWLINE_CHIP);
    gaps.push('');
    chips.push(NEWLINE_CHIP);
  }

  keys.forEach(key => {
    const meta = getFieldMeta(key);
    gaps.push(meta ? `${meta.icon} **${meta.label}**: ` : '');
    chips.push(key);
    gaps.push(defaultUnitSuffix(key));
    chips.push(NEWLINE_CHIP);
  });

  // 末尾换行标签后面的符号为空
  gaps.push('');

  return { chips, gaps };
}

export function normalizeOutputConfig(value: unknown): OutputConfig {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  // 新格式：chips + gaps
  if (Array.isArray(input.chips)) {
    const chips = (input.chips as unknown[]).filter(isValidChip);
    const rawGaps = Array.isArray(input.gaps) ? input.gaps : [];
    const gaps: string[] = [];
    for (let i = 0; i <= chips.length; i++) {
      const gap = rawGaps[i];
      gaps.push(typeof gap === 'string' ? gap : '');
    }
    return { chips, gaps };
  }

  // 旧格式迁移：style/title/fields
  const migrated = migrateLegacyConfig(input);
  if (migrated) {
    return migrated;
  }

  return createDefaultOutputConfig();
}

interface LegacyField {
  key?: unknown;
  label?: unknown;
  icon?: unknown;
  enabled?: unknown;
}

// 将旧版 style/title/fields 配置转换为标签+符号格式，无法转换时返回 null
function migrateLegacyConfig(input: Record<string, unknown>): OutputConfig | null {
  const style = input.style;
  if (style !== 'grouped' && style !== 'compact' && style !== 'table') {
    return null;
  }

  const legacyFields = (Array.isArray(input.fields) ? input.fields : []) as LegacyField[];
  const fields = legacyFields
    .filter(field => field && typeof field.key === 'string' && FIELD_KEYS.has(field.key))
    .filter(field => field.enabled !== false)
    .map(field => {
      const meta = getFieldMeta(field.key as string)!;
      return {
        key: field.key as string,
        label: typeof field.label === 'string' && field.label ? field.label : meta.label,
        icon: typeof field.icon === 'string' ? field.icon : meta.icon
      };
    });

  if (style === 'compact') {
    const chips: OutputChip[] = [];
    const gaps: string[] = [];
    let pendingSuffix = '';
    fields.forEach((field, index) => {
      const separator = index === 0 ? '' : ' | ';
      gaps.push(`${pendingSuffix}${separator}**${field.label}**: `);
      chips.push(field.key);
      pendingSuffix = defaultUnitSuffix(field.key);
    });
    gaps.push(pendingSuffix);
    return { chips, gaps };
  }

  // grouped / table：每行一个字段
  const title = typeof input.title === 'string' ? input.title : '';
  const chips: OutputChip[] = [];
  const gaps: string[] = [];

  if (style === 'grouped' && title) {
    gaps.push(`## ${title}`);
    chips.push(NEWLINE_CHIP);
    gaps.push('');
    chips.push(NEWLINE_CHIP);
  }

  fields.forEach(field => {
    gaps.push(`${field.icon} **${field.label}**: `);
    chips.push(field.key);
    gaps.push(defaultUnitSuffix(field.key));
    chips.push(NEWLINE_CHIP);
  });
  gaps.push('');

  return { chips, gaps };
}

export function renderOutputConfig(config: OutputConfig, data: any): string {
  const normalized = normalizeOutputConfig(config);
  let output = normalized.gaps[0] || '';

  normalized.chips.forEach((chip, index) => {
    output += chip === NEWLINE_CHIP ? '\n' : formatFieldValue(chip, data);
    output += normalized.gaps[index + 1] || '';
  });

  return output.trimEnd() + '\n';
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
