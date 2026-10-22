// 斜杠命令触发词清理：插入内容前，把块里残留的 /xx 触发片段去掉。
// 提取为纯函数，方便单元测试。

// 拆分块内容中的 IAL 行（{: ...} 属性行），更新块时需要保留
export function splitBlockIAL(markdown: string): { content: string; ial: string } {
  const lines = markdown.split('\n');
  const ialLines: string[] = [];
  const contentLines = lines.filter(line => {
    if (/^\s*\{:\s+.*\}\s*$/.test(line)) {
      ialLines.push(line.trim());
      return false;
    }
    return true;
  });

  return {
    content: contentLines.join('\n'),
    ial: ialLines.join('\n')
  };
}

export function withBlockIAL(content: string, ial: string): string {
  const trimmedContent = content.trim();
  if (!ial) {
    return trimmedContent;
  }
  return `${trimmedContent}\n${ial}`;
}

// 从块内容末尾移除斜杠触发词（含只输入了 "/" 或部分过滤词的情况）
export function removeSlashTrigger(markdown: string, triggers: string[]): string {
  let result = markdown
    .trim()
    .replace(/\\\//g, '/')
    .replace(/／/g, '/');

  // 整块内容就是一个斜杠触发片段（如 "/"、"/tq"、"/天气"），直接清空
  if (/^\/[^\n]*$/.test(result)) {
    return '';
  }

  const candidates = Array.from(new Set(
    triggers.flatMap(trigger => {
      const normalized = trigger.trim();
      if (!normalized) return [];
      const withoutSlash = normalized.replace(/^\//, '');
      return [
        normalized,
        withoutSlash,
        `/${withoutSlash}`,
        `、${withoutSlash}`
      ];
    })
  )).sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    if (result.endsWith(candidate)) {
      result = result.slice(0, -candidate.length);
      break;
    }
  }

  result = result
    .replace(/[​-‍\ufeff]+$/g, '')
    .replace(/[ \t ]+$/g, '')
    .replace(/[、,，/]\s*(tq|天气位置|天气)\s*$/i, '')
    .replace(/\b(tq|tianqi\s+weizhi|weather\s+location)\s*$/i, '');

  // 兜底：行尾残留的斜杠片段（未命中过滤词的部分输入，如 "正文 /tian" 或 "正文 /"）
  result = result.replace(/(?:^|[ \t ])\/[\w一-龥]*$/u, '');

  return result.replace(/[ \t ]+$/g, '').trim();
}
