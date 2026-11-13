# BUGS · dsh-claude-lite（轻妆）

继承 dsh-moshang-lite 时代的 B1–B14（见 git 历史与需求文档），本文件记录 v1.0.0 合并/更名/新功能轮的新增条目。
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

## B30 · Remote 0.6.4 后入口「藏不住」——误诊链与真根因（2026-11-09，已修）
- **现象**：remote 升 0.6.4 后侧栏底部 Remote 行可见。**真根因不在 remote**：0.6.3→0.6.4 的 dist 逐文件 diff（client.js/workspaces.js/shell.js/settings.js）显示入口组件与 `slots.inject("sidebar.footer.action")` 接线逐字节一致；npm 上 0.6.4 就是 latest（无更新角标）；locale 里 remoteEntry 两版都是 "Remote"。行可见是当日 16:48 一个临时补丁**故意取消隐藏**所致。
- **误诊**：该补丁声称「隐藏后代理点击失效」并据此放弃隐藏。实测证伪（jsdom+React18 最小复现 + 沙箱活体 DOM 双验）：display:none 子树内 `.click()` 照样触发 React 委托 onClick——委托挂在根节点，不看可见性。真因是**旧代码用「整行 textContent === "Remote"」精确匹配**：入口带更新角标（hasUpdate 时按钮内有 updateSuffix 文本）或切到「紧凑」模式（行被 portal 进账户行，不在 footerActions）时找不到行→隐藏漏、点击静默失效，被误读成「藏了点不动」。
- **修法（v1.0.1，用户拍板「移到功能里面去」）**：①applyFooterState/undoFooterState 改按类名 `.dshRemoteSidebarEntry` 查找（querySelectorAll 任意深度，免疫文案/角标漂移）；②新增 ensureRemotePanelRow：宿主 `nav[class*="panelList"]`（功能区）末尾插 claude-lite 自有镜像行（随功能区折叠自动显隐），点击经 findRemoteTrigger 代理触发真实入口；③findRemoteTrigger 类名优先 + aria-label/title 精确兜底（排除 menu 内与会话行误伤）；④头像菜单 DeepSeek Remote 项共用同一查找器；⑤dispose 拆镜像行。
- **验证**：node --check 过；沙箱 E2E（真实宿主+1.0.1）：带「 · 更新」附加文本的仿真入口被隐藏（旧匹配会漏）、镜像行入 nav、点击代理 `__fakeRemoteClicks=1`、折叠联动显隐正确；遗留：compact 模式兜底分支未实弹（本地无该配置）。
- **运维**：只动 client.js → ⌘R 生效。发布时需同步 workbench/dsh-plugins monorepo 副本（仍在 1.0.0）再 commit+push。

## B31 · 用户桌面验收两连（2026-11-09 晚，v1.0.2，已修）
- **①二维码图标没藏**：实锤为 `@linxin666/dsh-remote-bridge`（web-all 全家桶，桌面有装、沙箱 rea-test 没装所以首轮没复现）的「配对 iPhone」入口——注册在与 ds-harness-remote 同一个官方 `sidebar.footer.action` slot，特征 `button[data-dsh-plugin="remote-bridge"][data-dsh-part="entry"]`，纯 QrIcon 无文字，任何文本匹配都够不着。修：FOOTER_QR_SEL 纳入 applyFooterState/undoFooterState。
- **②功能区镜像行加粗不协调**：v1.0.1 固定 12px/600（功能/会话一级规格），但宿主 panelRow 邻居是另一套（实测 14px/400/label-primary/36px）。修：syncRemoteRowStyle 动态抄第一个 `[class*="panelRow"]` 邻居的 fontSize/fontWeight/lineHeight/color/padding/height/gap/borderRadius（按节点引用缓存，宿主重渲染自动重抄），并补 remote 自家显示器 SVG（rect+支架，16px）与兄弟行图标对齐。
- **验证（沙箱含真 remote 0.6.4）**：真入口 hidden、仿真 QR 钮 hidden、镜像行计算样式与邻居逐项相等（14px=14px/400=400/同色/36px=36px）、点镜像行**实弹打开真面板**（.dshRemoteBackdrop + "DS Harness Remote - 远程工作台"）、backdrop 点击关闭正常。
- 已知残留：compact 模式下真实入口在账户行不在 footerActions（藏不到，与 v1.0.0 行为一致）；remote-bridge 的「配对 iPhone」功能隐藏后无替代入口（用户未要求镜像；需要时加进功能区即可）。

## B33 · 换模后模型名定格 + 功能区「功能」塌成单字（2026-11-13，v1.0.3，已修）

来源：用户桌面两 bug handoff + 第一性原理校验（活体 AX + 像素 + 宿主源码复验）。

### ① 选了新模型，胶囊仍显示旧模型名
- **机制**：词标装饰用 `tn.parentNode.replaceChild(frag, tn)` 替换了宿主 React 创建并持有的文本节点。之后 React 换模把新名字写进**已脱离文档**的旧节点，屏幕无变化；菜单是 `{open && createPortal}` 每次新挂载，所以菜单显示真实值 ⇒ 典型的「一处冻结一处正确」。
- **帮凶**：`restoreOwnNodes` 撤妆时无条件回插品牌词（`insertBefore(createTextNode(seg + sep))`），把旧名主动写回屏幕。
- **修法（A2：只插不换）**：词标 `insertBefore` 前插，原文本节点**原地截短** `tn.nodeValue = head + tail` 并记 `dataset.tail`。React 始终能写值，换模即时反映。撤妆先查 `mark.nextSibling` 是否仍是截短的 tail → 原地补回 `nodeValue = seg + sep + tail`；兜底分支回插前校验 `host.getAttribute("data-model-id") === mark.dataset.mid`（模型已换就不许回插，防「旧品牌词 + 新名尾巴」缝合怪）。
- **影响面**：任何品牌裸 id 互切（`glm-*`→`gpt-*` 等）原本会走 prepend 分支产生错拼，现一并消除。

### ② 侧栏「功能」按钮塌成 16px、只露一个字
- **误诊记录**：第一轮按 handoff 判断为「宿主 flex 挤压」→ 补 `flex:0 0 auto; min-height:24px; overflow:hidden`。活体 AX 实测按钮 8→24 高、padding 生效、**宽度仍锁死 16px**。这是关键信号：规则匹配正常，宽度来源不在按钮自己身上。
- **真根因**：宿主 `.scrollArea` 是 **`display:grid`**（`grid-template-columns: 4px minmax(0,1fr) calc(inline-padding - 2px)`，SidebarRoot.module.css:550），`nav.panelList` 显式 `grid-column: 2`。皮肤用 `nav.parentElement.insertBefore()` 把按钮插进 grid → 自动放置进 **4px 装饰列**；`flex` 属性对 grid 子项**完全无效**，宽度由轨道决定 ⇒ 锁死。
- **修法**：插入位置改为 `nav.closest('[class*="scrollRegion"]')`（`display:flex; flex-direction:column`）的 firstChild（回落 `parentElement`）；CSS 保留 flex 防御并补 `grid-column:1/-1; justify-self:stretch` 作 grid 兜底。附带收益：按钮在滚动区外，会话列表滚动时常驻。
- **活体验证**：AX 实测按钮 260×26、文字「功能」24×14 完整、`▸` 贴右（x=482）、与「会话」无重叠；像素图确认。

### 通用教训（已同步需求文档 §四 11–14）
- 注入自绘控件前先确认父容器布局模型（block/flex/grid），grid 内 flex 属性无效。
- 「CSS 部分生效」= 宽度/尺寸来源在父容器，不要继续加 `!important`。
- 禁止 replaceChild React 管理的文本节点；装饰只准「改属性 / 前插 / 原地 nodeValue」。
- AX `children=0` 不可信、`aria` 永远真实（aria vs 像素对照）；AX 框相切 ≠ 像素重叠。

### 运维
只动 client.js → ⌘R 生效。备份 `client.js.bak-20261113`。皮肤升级会覆盖补丁，是否转 `cordis.patch.yml` 正式覆盖或反馈上游待定。

## B34 · B33 修复被 pnpm install 冲掉（复发根因：改错了副本）（2026-11-13，已修）

- **现象**：B33 修复上线后，用户在插件市场装插件，侧栏「功能」又塌回单字、模型名定格问题回归。
- **真根因**：本机存在**三份** dsh-claude-lite 副本，我上轮只改了其中两份：
  1. **源（profile 真正依赖的那份）** = `workbench/dsh-claude-lite` —— profile `package.json` 写的是 `"dsh-claude-lite": "file:/.../workbench/dsh-claude-lite"`，`pnpm-lock.yaml` 里也是 `directory` 类型。**任何一次 `pnpm install`（在插件市场装任何插件都会触发）都会从这里重新拷贝到 node_modules**。这份从未被改 → 一 install 就回退到 1.0.2 原件。
  2. monorepo 副本 = `workbench/dsh-plugins/plugins/dsh-claude-lite`（发布用，推 GitHub；上轮改的是这份）
  3. 部署位 = `~/.dsh/profiles/desktop/node_modules/dsh-claude-lite`（跑起来的那份；上轮也改的是这份，但会被 (1) 覆盖）
- **证据链**：15:43 包目录重装、`client.js` mtime 回到 Nov 9 17:24（npm 原件时间）、MD5 回到 `b9c68d…`；15:48 又在装 hono/@modelcontextprotocol —— 市场装插件触发依赖树重排。
- **修法**：以 monorepo 为权威 `rsync -a` 同步到源目录，三份 MD5 统一为 `110ec7ef…`（67521 bytes）、`diff -rq` 无差异。
- **硬规则（防复发）**：改 dsh-claude-lite 代码**必须先改源目录 `workbench/dsh-claude-lite`**，再同步 monorepo（发布）+ 部署位（即时生效）。只改后两处 = 一次 install 就白做。验收前先 `md5` 三处比对。
- **残留风险**：若插件市场将来把依赖声明改回 registry 版本（而非 `file:` 本地目录），install 仍会拉线上包覆盖；那时需把修复发布到 npm 才能根治。

## B35 · Tooltip 文字不可读（令牌名写错，宿主 0 消费）（2026-11-13，已修）

- **现象**：用户截图：模型设置说明与「将这条回复存入记忆」两处提示（tooltip）文字奶白压淡黄底，几乎看不清。
- **第一性原理归因链**：拆宿主 app.asar，tooltip 组件 CSS 为 `background:var(--dsw-alias-tooltip-bg);color:var(--dsw-alias-tooltip-label)`；皮肤只改对了 bg 令牌，字色却写成 `--dsw-alias-tooltip-fg` —— **该名在宿主全文 0 次出现**（文字令牌统一 `-label` 后缀，同族 toast-label / hovercard-label-*），字色回落宿主默认 `static-neutral-bluish-00`（纯白，为暗底设计）→ 白字压淡黄底 #fdf9e3 不可读。
- **排雷法（可复用）**：把皮肤定义的每个令牌名到宿主 asar 全文反查，0 命中即孤儿令牌。本次另揪出死定义 `--dsw-specific-sidebar-nav-item-hover`（宿主只有 `-active` 系）一并删除。`tooltip-key-bg` 无需皮肤定义——宿主 `color-mix(tooltip-bg, white 18%)` 自动派生。
- **修法**：skin.css v1.2.1：亮/暗两块 `tooltip-fg` → `tooltip-label: #29261b`（对比度 14.3:1，AAA）；删 nav-item-hover 死定义。
- **B34 硬规则首次正面执行**：本次先在部署位+运行位修好后，补同步源目录 + monorepo，四处 skin.css MD5 统一 `0674ec…`。教训补充：B34 说「先改源」，但排查类修复天然先在生效位验证——**验证通过后必须回补源目录，才算闭环**。
- **运维**：皮肤 CSS 改动需完全重启应用生效（⌘R 不可靠，B10 多次应验）。备份：四处同目录 `skin.css.bak-20261113`。
