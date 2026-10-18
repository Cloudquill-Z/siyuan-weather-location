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
    dayWeather: '晴',
    nightWeather: '多云',
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
    formatted_address: '湖南省岳阳市华容县章华镇人民路88号',
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

// 5. 默认配置：第一行地址，第二行天气/温度/湿度/风向/风力用 · 连接（软换行，单块）
const defaultRendered = renderOutputConfig(createDefaultOutputConfig(), data);
assert(
  defaultRendered ===
    '湖南省岳阳市华容县章华镇人民路88号\n' +
    '晴转多云 · 22～31°C · 湿度: 62% · 东南风 · 3级\n',
  `unexpected default render result: ${JSON.stringify(defaultRendered)}`
);
assert(!defaultRendered.includes('\n\n'), 'expected default output to stay in a single block (no blank lines)');

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
assert(migratedGrouped.includes('**我的天气**'), 'expected migrated title');
assert(migratedGrouped.includes('🌤 **天气**: 晴转多云'), 'expected migrated weather line');
assert(migratedGrouped.includes('📍 **位置**: 岳阳市'), 'expected migrated city line');
assert(!migratedGrouped.includes('湿度'), 'expected disabled legacy field to be dropped');
assert(!migratedGrouped.includes('\n\n'), 'expected migrated output to stay in a single block');

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
  renderOutputConfig(legacyAdvanced, data) === defaultRendered,
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

// 10. 连续换行标签折叠为单个软换行（updateBlock 只能写入一个块，空行会切分块）
const consecutiveNewlines: OutputConfig = {
  chips: ['weather.description', NEWLINE_CHIP, NEWLINE_CHIP, 'location.city'],
  gaps: ['天气: ', '', '', '位置: ', '']
};
const consecutiveRendered = renderOutputConfig(consecutiveNewlines, data);
assert(
  consecutiveRendered === '天气: 晴转多云\n位置: 岳阳市\n',
  `unexpected consecutive-newline result: ${JSON.stringify(consecutiveRendered)}`
);
assert(!consecutiveRendered.includes('\n\n'), 'expected consecutive newlines to collapse');

// 11. 空配置渲染为空内容（清空格式后不会报错）
const emptyConfig = renderOutputConfig({ chips: [], gaps: [''] }, data);
assert(emptyConfig === '\n', `unexpected empty-config result: ${JSON.stringify(emptyConfig)}`);

console.log('output-config tests passed');
