# 摩尚的 DSH 插件集

高澄律师（摩尚）在用的 DeepSeek Harness 插件合集，全部零依赖、装完即用。

## 插件清单

### 轻妆 · Claude Lite

Claude Code Desktop 观感的轻量复刻：纯 CSS 皮肤 + 侧栏日期分组 + 模型行厂商词标 + 会话标题整理（类别 emoji 可自定义）。样式体积约为原版的 1/40，详见[插件目录](plugins/dsh-claude-lite/)。

安装：

```sh
dsh plugin --profile desktop add github:gcheng001/dsh-plugins#path:plugins/dsh-claude-lite
```

装完重启应用，再到皮肤中心应用「轻妆 · Claude Lite」。

## 备注

- `#path:` 指向仓库内的插件子目录，`dsh plugin add` 会把整条参数转交 pnpm 处理。
- 各插件的许可与第三方署名见各自目录内的 LICENSE 与 README。
