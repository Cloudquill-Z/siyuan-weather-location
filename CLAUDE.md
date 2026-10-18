# 项目规则

## 完成工作流程（每次修改代码后必须执行）

每次完成代码修改后，按顺序自动执行以下步骤，无需等待用户确认：

1. **构建**：`vite build`（或 `npm run build`），确保 `dist/` 产物为最新。
2. **测试**：运行 `tests/` 下全部测试（可用 esbuild 打包后 node 运行），全部通过才继续。
3. **安装到思源笔记**：将 `dist/` 内容复制到思源插件目录：
   ```bash
   cp -R dist/* ~/Documents/SiYuan/data/plugins/siyuan-weather-location/
   ```
   提醒用户在 `设置 → 插件` 中关闭再打开「天气与位置」（或重启思源）以加载新版本。
4. **推送到 GitHub**：`git add` 相关改动，`git commit`（用中文简要说明改动内容），然后 `git push` 到远端仓库。

## 其他约定

- 输出格式（outputConfig）渲染结果必须保持**单个块**：换行用软换行（`\n`，等同 Shift+Enter），禁止出现空行（`\n\n`）和块级语法（如 `##` 标题），因为斜杠命令通过 `updateBlock` 写入，思源一次只能更新一个块。
- 地点搜索使用高德双接口并行：输入提示（POI 级，支持小区/写字楼）+ 地理编码（城市/区县），合并去重。
- UI 样式优先使用思源主题变量（`--b3-*`），样式作用域限定在 `#weather-location-settings` / `#weather-insert-dialog` 容器内。
