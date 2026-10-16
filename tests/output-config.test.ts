import {
  DEFAULT_OUTPUT_CONFIG,
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

const grouped = renderOutputConfig(DEFAULT_OUTPUT_CONFIG, data);

assert(grouped.includes('## 今日天气与位置'), 'expected grouped output title');
assert(grouped.includes('🌤 **天气状况**: 晴转多云'), 'expected weather description field');
assert(grouped.includes('📍 **当前位置**: 岳阳市'), 'expected location city field');
assert(grouped.includes('⏰ **记录时间**: 2026/6/12 15:30:00'), 'expected time field');

const withoutHumidity = createDefaultOutputConfig();
withoutHumidity.fields = withoutHumidity.fields.map(field => (
  field.key === 'weather.humidity' ? { ...field, enabled: false } : field
));

const hiddenFieldOutput = renderOutputConfig(withoutHumidity, data);
assert(!hiddenFieldOutput.includes('相对湿度'), 'expected disabled field to be omitted');

const tableConfig = createDefaultOutputConfig();
tableConfig.style = 'table';
tableConfig.fields = tableConfig.fields.map(field => ({
  ...field,
  enabled: ['weather.description', 'weather.temperature', 'location.city', 'time'].includes(field.key)
}));

const table = renderOutputConfig(tableConfig, data);
assert(table.includes('| 项目 | 数值 |'), 'expected table header');
assert(table.includes('| 天气状况 | 晴转多云 |'), 'expected weather row');
assert(table.includes('| 当前位置 | 岳阳市 |'), 'expected location row');

const reordered = createDefaultOutputConfig();
const cityField = reordered.fields.find(field => field.key === 'location.city');
const weatherField = reordered.fields.find(field => field.key === 'weather.description');
if (!cityField || !weatherField) {
  throw new Error('expected default fields to include city and weather');
}

const normalized = normalizeOutputConfig({
  style: 'grouped',
  title: '顺序测试',
  fields: [cityField, weatherField]
});

assert(normalized.fields[0].key === 'location.city', 'expected saved field order to be preserved');
assert(normalized.fields[1].key === 'weather.description', 'expected second saved field order to be preserved');
