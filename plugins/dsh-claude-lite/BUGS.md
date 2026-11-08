# BUGS · dsh-claude-lite（轻妆）

继承自更名前的 dsh-moshang-lite 时代（B1–B14 属早期开发记录，未随本仓库发布），本文件记录 v1.0.0 合并/更名/新功能轮的新增条目。
来源：codex exec 异源审查第一轮（0 P0 / 2 P1 / 9 P2，全部已修）+ 自测。

## B15 · 桥接赋值在真实 Cordis 上抛 "cannot set property in multiple fibers"（P1）
- **现象**：`Object.create(ctx)` 后 `bridge.sessionTitle = scope.sessionTitle` 在真实 Cordis（@deepseek-ai/cordis 4.0.2）里被服务赋值拦截器抛错——title 模块在真机上**永远起不来**；假 ctx 冒烟测试测不出来。
- **证据**：cordis `lib/index.js:785` + 本地 `new Context()` 内核复现（THROW: cannot set property "svc" in multiple fibers）；同时证明 `scope.on/.effect` 均为 function。
- **修法**：`titleApply(scope, section)` 直接传 inject scope；事件/清理挂在 scope 上，生命周期还更正确（服务重载时旧实例随 scope 释放）。
- **教训**：涉及宿主框架上下文语义的代码，冒烟测试的假 ctx 必须换成真实内核复现。

## B16 · title-config POST 可被跨站请求打（P1）
- **现象**：POST 不校验 Origin/Content-Type，浏览器里恶意网页可向 `http://127.0.0.1:18900/dsh-claude-lite/title-config` 发跨站 POST（text/plain 免预检）重置/改写类别配置。
- **修法**：`titleConfigGuard()`——有 Origin 时必须与 `Host` 同源（403）；Content-Type 存在且非 application/json → 415。

## B17 · 皮肤自安装的半程状态无法自愈（P2）
- **现象**：先拷 manifest 后拷 CSS，若 CSS 拷贝失败，下次启动只比对版本 → 永远缺 CSS。
- **修法**：CSS 先拷、manifest 最后拷（manifest = 完成标记）；同版本仍校验两文件齐全，缺则补装。

## B18 · 保存成功提示 ≠ 持久化成功（P2）
- **现象**：先改内存再落盘，落盘失败仍返回 ok；reset 对所有 unlink 错误吞掉。
- **修法**：先落盘成功再 setCategories（内存跟随磁盘）；reset 只容忍 ENOENT，其余 500。客户端据此显示失败。

## B19 · dispose 不拆委托监听/菜单项，重载后旧闭包复活（P2）
- **现象**：body 上匿名 click/contextmenu 监听永不拆除；卸载后右键品牌行仍会经旧闭包重建浮层；模块重载后新逻辑永远绑不上（旧监听还占着 flag）。
- **修法**：「薄监听 + globalThis 活实例指针」——body 监听只做一行转发到 `__claudeLiteDelegate`（与 bucketClick hook 同款所有权模式）；dispose 仅当自己是发布者时拆监听 + 清注入的菜单项。**顺带解决模块重载后新代码不生效的问题。**

## B20 · 配置 GET/POST 迟到响应覆盖新状态（P2）
- **修法**：`titleReqSeq` 单调序号——只有最新请求的响应允许回填；浮层打开/保存期间禁用标题区按钮（busy 态）。

## B21 · 浮层异步增高后不重新定位（P2）
- **修法**：`clampOverlay()`——宽度夹紧到 min(340, vw-16)、按 anchor 实测 bottom/left 定位；槽位渲染完（含失败分支）再夹一次；`box-sizing:border-box`。

## B22 · 类别集在模型请求中途被改 → 提示词与校验用不同版本（P2）
- **修法**：core 加 `categoryVersion` 单调计数；evaluate 入口拍快照、写标题前复核，不一致 → audit `stale-categories` 并放弃本轮（下个事件自然重评）。

## B23 · emoji 校验收紧（P2）
- **现象**：U+2800（盲文空白）能混过正向白名单；重复 U+FE0F 原样入库。
- **修法**：正向白名单 + 隐形字符黑名单（零宽/方向/盲文空白/半角片假名重复等）；规范化为「基础字符 + 至多一个 FE0F」，去重按基础字符。

## B24 · 品牌「恢复默认」不回填输入框（P2）
- **修法**：重置后立即按 `brandConfig()` 回填两个输入（旧行为靠关浮层掩盖）。

## B25 · LICENSE 第三方版权行不精确 / 字体许可未随包（P2）
- **修法**：版权行改为上游原文（`Copyright (c) 2026 Nwflower` / `Copyright (c) 2026 dsh-title-curator contributors` / `Copyright (c) 2026 oil`）；`lib/fonts/OFL.txt`（JetBrains 官方全文）随包，LICENSE 注明三款字体版权人与文件位置；词标补 lobe-icons MIT + 商标归属声明。

## B26 · 第二轮复审补刀（4 项 P2，全部已修）
- **守卫精度**：Origin 只比 host 会被 https 同 host 绕过；Content-Type 用 includes 可被 `text/plain; x=application/json` 骗过。修：origin 全比对（scheme 按 req.socket.encrypted 推定）+ media type 按 `;` 前缀精确匹配、POST 缺 Content-Type 直接 415。实弹五连测全中（403/415/415/200/200）。
- **委托所有权放错层**：owner 判定写在模块级变量上，A 挂载→B 挂载→A 卸载时 A 会误拆 B 的监听（codex 内存复现：监听数归零）。修：每次挂载 effect 里创建独立 `delegateOwner` 凭证传入 install/remove，globalThis 指针携带 owner 身份。
- **重开浮层丢保存**：POST 在途时重开 → 新 GET 排在 POST 前面读到旧值，POST 回包又被新 seq 丢弃 → 界面停在旧值但服务端是新值。修：`titleRequestChain` 把全部 GET/POST 串行化（读永远排在在途写之后）+ 独立于 seq 的无条件 setTitleBusy(false)。
- **Enter 绕过 busy**：按钮 disabled 拦不住输入框 Enter 提交。修：`titleInFlight` 布尔闸，saveTitleCategories 入口统一拦截。

## 测试基建备注
- 假 ctx 冒烟（17 项）+ core 单测（15 项断言）随包外维护于 workbench（本文件只记结论）。
- 真实内核复现脚本模式：`new Context()` + 双插件（probe + svc）——排查 Cordis 语义问题优先用这个，别信假 ctx。

## B27 · 网络层最终形态（第四~六轮复审驱动）
- seq/chain/inflight 挂 `globalThis.__claudeLiteTitleNet` 跨模块实例共享（⌘R 重载后新旧实例同一队列，全序保证）；
- fetch 全程罩 AbortController（fetch+r.json()，正文卡住也解禁；abort 取消底层连接）；
- 浮层每次打开重建（跨实例闭包不复用）+ `__claudeLiteOwner` 所有权（dispose 只拆自己的）；品牌重置回填输入框。

## B28 · CAS 修订号（服务端防晚到覆盖）
- 客户端 abort 挡不住服务端已收到的旧 POST → 服务端 `categoryWriteRevision`：GET 下发、POST 带回比对、旧视图 409+当前 revision、成功写 revision+1 并随 categories.json 持久化（重启恢复）。
- **B28 附带发现**：reset 原设计 unlink 文件 → 修订号重启回 0（stale 检测失效）。修：reset 落盘默认集（文件在即修订号在），不再删文件。
- 实测：revision 0→1、旧写 409、reset→2、无 revision 的 CLI 写放行、重启恢复 7。

## B29 · POST null 未捕获异常（第七轮 P1，已修）
- CAS 判断 `payload.revision` 在 payload=null（合法 JSON 非对象）时抛 TypeError，可从 end 回调逸出。修：解析后先校验「非空 JSON 对象」，否则 400。回归：null/数组/数字/字符串全 400，正常路径不变。
- **终审结论（第八轮）：PASS 可上架。** 七轮异源审查累计 16 项全修。
