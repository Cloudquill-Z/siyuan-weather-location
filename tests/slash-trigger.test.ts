import { removeSlashTrigger, splitBlockIAL, withBlockIAL } from '../src/slashTrigger';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: string, expected: string, label: string) {
  assert(actual === expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const BASE_TRIGGERS = ['天气位置', 'weather location', 'tianqi weizhi', '/tq', '/天气'];
const DIALOG_TRIGGERS = ['插入天气', 'insert weather', 'crtq', 'charu tianqi'];

// 1. 整块只有触发词：全部清除（含只输入 "/"、部分输入的情况）
assertEqual(removeSlashTrigger('/', BASE_TRIGGERS), '', 'lone slash');
assertEqual(removeSlashTrigger('/tq', BASE_TRIGGERS), '', 'whole block /tq');
assertEqual(removeSlashTrigger('/天气', BASE_TRIGGERS), '', 'whole block /天气');
assertEqual(removeSlashTrigger('/tian', BASE_TRIGGERS), '', 'whole block partial /tian');
assertEqual(removeSlashTrigger('/插入天气', DIALOG_TRIGGERS), '', 'whole block /插入天气');
assertEqual(removeSlashTrigger('／天气', BASE_TRIGGERS), '', 'full-width slash');

// 2. 触发词在正文末尾：只移除触发词，不残留斜杠
assertEqual(removeSlashTrigger('周末出行/tq', BASE_TRIGGERS), '周末出行', 'trailing /tq');
assertEqual(removeSlashTrigger('周末出行/天气', DIALOG_TRIGGERS), '周末出行', 'trailing /天气 via fallback');
assertEqual(removeSlashTrigger('周末出行 /插入天气', DIALOG_TRIGGERS), '周末出行', 'trailing /插入天气');
assertEqual(removeSlashTrigger('周末出行 /tian', DIALOG_TRIGGERS), '周末出行', 'trailing partial fragment');
assertEqual(removeSlashTrigger('周末出行 /', DIALOG_TRIGGERS), '周末出行', 'trailing lone slash after text');

// 3. 转义斜杠（kramdown 会把 / 转义为 \/）
assertEqual(removeSlashTrigger('\\/tq', BASE_TRIGGERS), '', 'escaped slash');

// 4. 无触发词时正文保持不变
assertEqual(removeSlashTrigger('周末出行', BASE_TRIGGERS), '周末出行', 'no trigger');
assertEqual(removeSlashTrigger('明天去 和/或 公园', BASE_TRIGGERS), '明天去 和/或 公园', 'slash inside words kept');

// 5. IAL 拆分与还原
const { content, ial } = splitBlockIAL('正文内容\n{: id="20261022" }');
assertEqual(content, '正文内容', 'split content');
assertEqual(ial, '{: id="20261022" }', 'split ial');
assertEqual(withBlockIAL('正文内容', ial), '正文内容\n{: id="20261022" }', 'with ial');
assertEqual(withBlockIAL('正文内容', ''), '正文内容', 'without ial');

console.log('slash-trigger tests passed');
