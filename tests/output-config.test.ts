import {
  NEWLINE_CHIP,
  OutputConfig,
  createDefaultOutputConfig,
  normalizeOutputConfig,
  renderOutputConfig
} from '../src/outputConfig';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const data = {
  weather: {
    description: '晴转多云',
    temperature: 28,
    humidity: 62,
    windDirection: '东南风',
    windPower: '3级',
    tempMin: 22,
    tempMax: 31
  },
  location: {
    city: '岳阳市',
    province: '湖南省',
    district: '华容县',
    preciseAddress: '湖南省岳阳市华容县章华镇',
    lat: 29.52,
    lon: 112.55
  },
  time: '2026/6/12 15:30:00'
};

// 1. 标签 + 符号的基本渲染
const config: OutputConfig = {
  chips: ['weather.description', 'weather.temperature', 'location.city'],
  gaps: ['**天气**: ', ' | **温度**: ', '°C | **位置**: ', '']
};
const rendered = renderOutputConfig(config, data);
assert(
  rendered === '**天气**: 晴转多云 | **温度**: 28°C | **位置**: 岳阳市\n',
  `unexpected render result: ${JSON.stringify(rendered)}`
);

// 2. 换行标签
const multiline: OutputConfig = {
  chips: ['weather.description', NEWLINE_CHIP, 'location.city'],
  gaps: ['天气: ', '', '位置: ', '']
};
const multilineRendered = renderOutputConfig(multiline, data);
assert(
  multilineRendered === '天气: 晴转多云\n位置: 岳阳市\n',
  `unexpected multiline result: ${JSON.stringify(multilineRendered)}`
);

// 3. 坐标字段由 lat/lon 组合
const coordinates: OutputConfig = {
  chips: ['location.coordinates'],
  gaps: ['坐标: ', '']
};
assert(
  renderOutputConfig(coordinates, data).includes('29.52, 112.55'),
  'expected coordinates field to combine lat/lon'
);

// 4. 空数据字段渲染为空字符串，不影响两侧符号
const emptyData = { weather: {}, location: {}, time: '' };
const emptyRendered = renderOutputConfig(config, emptyData);
assert(
  emptyRendered === '**天气**:  | **温度**: °C | **位置**:\n',
  `unexpected empty-data result: ${JSON.stringify(emptyRendered)}`
);

// 5. 默认配置包含标题与换行
const defaultRendered = renderOutputConfig(createDefaultOutputConfig(), data);
assert(defaultRendered.includes('## 今日天气与位置'), 'expected default output title');
assert(defaultRendered.includes('🌤 **天气状况**: 晴转多云'), 'expected default weather line');
assert(defaultRendered.includes('⏰ **记录时间**: 2026/6/12 15:30:00'), 'expected default time line');

// 6. 旧版 grouped 配置迁移
const legacyGrouped = normalizeOutputConfig({
  style: 'grouped',
  title: '我的天气',
  fields: [
    { key: 'weather.description', label: '天气', icon: '🌤', enabled: true },
    { key: 'weather.humidity', label: '湿度', icon: '💧', enabled: false },
    { key: 'location.city', label: '位置', icon: '📍', enabled: true }
  ]
});
const migratedGrouped = renderOutputConfig(legacyGrouped, data);
assert(migratedGrouped.includes('## 我的天气'), 'expected migrated title');
assert(migratedGrouped.includes('🌤 **天气**: 晴转多云'), 'expected migrated weather line');
assert(migratedGrouped.includes('📍 **位置**: 岳阳市'), 'expected migrated city line');
assert(!migratedGrouped.includes('湿度'), 'expected disabled legacy field to be dropped');

// 7. 旧版 compact 配置迁移
const legacyCompact = normalizeOutputConfig({
  style: 'compact',
  title: '',
  fields: [
    { key: 'weather.description', label: '天气', icon: '', enabled: true },
    { key: 'location.city', label: '位置', icon: '', enabled: true }
  ]
});
const migratedCompact = renderOutputConfig(legacyCompact, data);
assert(
  migratedCompact === '**天气**: 晴转多云 | **位置**: 岳阳市\n',
  `unexpected migrated compact result: ${JSON.stringify(migratedCompact)}`
);

// 8. 旧版高级模板无法迁移时回退到默认格式
const legacyAdvanced = normalizeOutputConfig({ style: 'advanced' });
assert(
  renderOutputConfig(legacyAdvanced, data).includes('## 今日天气与位置'),
  'expected advanced legacy config to fall back to default'
);

// 9. 新格式归一化：过滤未知标签并补齐 gaps 长度
const normalized = normalizeOutputConfig({
  chips: ['weather.description', 'not.a.field', NEWLINE_CHIP],
  gaps: ['A: ']
});
assert(normalized.chips.length === 2, 'expected unknown chip to be filtered out');
assert(normalized.gaps.length === normalized.chips.length + 1, 'expected gaps to be padded');
assert(normalized.gaps[0] === 'A: ', 'expected existing gap to be preserved');

console.log('output-config tests passed');
