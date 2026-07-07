# Phase 17 修复：Atlas HTML Scene 路由与过渡视频链路（2026-07-06）

> 背景：用户在 Atlas 编辑器里为某个分类绑定了 `HTML Scene`，并设置了 hotspot，但点击 hotspot 时仍然只发生镜头位移，无法像参考产物那样“播放过渡视频 → 进入 HTML 场景”。
>
> 对齐文档：
>
> - `docs/plans/2026-06-30-dual-product-refactor.md`
> - `docs/plans/2026-07-03-post-refactor-remediation-plan.md`
> - `docs/development/dual-product-baseline-2026-06-30.md`

## 1. 先核对架构方案，再定义修复目标

按双产品重构方案，Atlas 中和 HTML Scene 相关的职责边界应当固定如下：

- `category.experience = html-scene` 只声明“这个分类最终进入哪个 `sceneId/viewId`”。
- `navigation.routes` 声明“从哪个 Atlas 位置进入 scene”，以及是否携带 `transition.video`。
- `compileAtlas()` 负责把 route、scene 入口 URL、transition 资源 URL 投影到 `AtlasManifest`。
- `AtlasRuntime` 负责在用户点击 hotspot 时判断：
  - 这是普通全景分类，还是
  - 这是一个应该进入 HTML Scene 的 category route。
- `AtlasPreview` 必须具备真实的 scene 打开能力，不能再是空 `openScene()`。

因此本问题不是单个 runtime bug，而是“领域数据 → 编译 → 运行时 → 编辑器预览 → 保存”的整条链路缺失。

## 2. 本次修复前的真实差距

| 层级 | 修复前状态 | 与方案差异 |
| --- | --- | --- |
| Domain / 数据 | `ExperienceNavigation`、`transition` 模型已经存在 | 数据模型对了，但编辑器没暴露配置入口 |
| Compiler | Atlas scene `entryUrl` 未正确表达 bundle 入口；transition 只有 `assetId`，没有运行时可播放 URL | manifest 不完整 |
| Runtime | `handleCategoryClick()` 无论 category experience 是什么，都直接 `focusCategory()` | HTML Scene 分类点击链路错误 |
| Preview | `AtlasPreview` 的 `openScene()` 是空函数 | 预览不能进入 scene |
| Editor Save | AtlasEditor 未保存 `navigation`，且多段保存共用旧 revision | 新增 transition 配置后也无法真正持久化 |
| Assets | admin 无法按 bundle 内部文件路径提供 scene html/js/css | iframe 入口不成立 |

## 3. 本次执行方案

### 3.1 Manifest 补齐 route transition 可消费数据

新增：

- `AtlasManifest.routeTransitions?: Record<routeId, { url; posterUrl?; timeoutMs?; onFailure }>`

目的：

- runtime 不再只能拿到 `transition.assetId`，而是能直接拿到可播放的视频 URL。

### 3.2 Atlas compiler 补齐两类 URL

`compileAtlas()` 现在会：

1. 为 HTML scene 生成真正的 entry URL：
   - `scene bundle base path + entryPath`
2. 为每条可达 route 编译 `routeTransitions`
3. 对旧数据里 `assets/scenes/...` 这一 legacy 前缀做容错归一

结果：

- Atlas manifest 能同时描述 scene 入口和 route 过渡视频。

### 3.3 Runtime 恢复“HTML Scene 分类点击 = route 打开”

`AtlasRuntime` 本次调整：

- `handleCategoryClick()` 先检查 category 是否为 `experience.kind === 'html-scene'`
- 若是：
  - 优先匹配 `from: { kind:'panorama', categoryId } -> to: { kind:'scene', sceneId, viewId }`
  - 找到 route 时走 `openRoute(routeId)`
  - 找不到 route 时直接兜底 `sceneLauncher.launch(scene, viewId)`
- 若不是，保持原先 `focusCategory()` 行为

### 3.4 Runtime 接入可见的 TransitionVideoController

本次没有只停留在“调用 play()”，而是补齐了可视层：

- AtlasRuntime 新增 transition overlay 容器
- `TransitionVideoController` 新增 `mountRoot`
- route 带 transition 时：
  - `onFailure = 'cut'`：等待视频结束/超时成功后才进入 scene；视频失败则取消进入
  - `onFailure = 'abort-navigation'`：视频并行播放，scene 立即进入；视频失败不阻断进入

### 3.5 AtlasPreview 真正支持 iframe scene

`AtlasPreview` 现在：

- 为 html-bundle 提供 `/api/projects/:id/assets/html-bundle/:assetId/<file>` 形式的入口 URL
- `openScene(scene, viewId)` 不再是空函数，而是会打开 iframe overlay
- iframe load 后发送 `SceneBridge host:init`
- 监听 scene 发回的：
  - `scene:request-back`
  - `scene:request-route`

这样编辑器预览终于具备了与运行时一致的 scene 进入链路。

### 3.6 Atlas editor 暴露 transition 配置，并保存 navigation

Atlas 分类右侧属性面板新增：

- `HTML Scene` 绑定后，自动维护该分类的 panorama → scene route
- 可配置：
  - 是否启用过渡视频
  - 过渡视频 assetId
  - timeoutMs
  - onFailure（`cut` / `abort-navigation`）

同时 `AtlasEditor.handleSave()` 现在把 `navigation` 纳入保存，并按“最新 revision 串行推进”保存，避免 knowledge / panorama / navigation / atlas config 共用旧 revision 导致 409。

## 4. 服务端补充

新增 html-bundle 文件级访问路由：

- `GET /api/projects/:id/assets/html-bundle/:assetId/<filePath>`

用途：

- 让 admin preview 的 iframe 可以正确加载 `index.html` 以及其内部依赖的 js/css/image。

同时新上传的 html-bundle 资产，`sourcePath` 改为 `scenes/<assetId>`，避免继续把 `assets/` 前缀写进 registry。

## 5. 本次验证结果

已验证：

- `npx tsc -b` 通过
- `npm test` 149/149 通过
- `npm run build:admin` 通过
- Atlas 新增专项测试通过：
  - HTML Scene category hotspot 点击会走 panorama route
  - compiler 会产出 scene entryUrl 与 route transition URL

## 6. 当前仍未完成的内容

本次先把“Atlas 中 HTML Scene 能正确进入，并能配置 transition video”这条主链路补齐；以下仍属于后续阶段：

1. 发布态真正把 html-bundle 全量复制进 Atlas/Catalog 自包含产物目录
2. Catalog 侧 scene/transition 的同类装配
3. SceneBridge 更完整的 item focus / host exit / route back 语义
4. 真实浏览器下基于 demo 项目的手工回归（尤其是 iframe scene 与 transition 的联动体验）

## 6.1 2026-07-07 跟进：demo HTML scene 直接迁移到新协议

根据后续联调结果，demo 项目里实际挂载的 HTML scene bundle 仍然是旧 `interactive-guide:html-node-bridge` 协议，这会导致宿主虽然已经切到 `SceneBridge v1.0.0`，但 scene 内部仍按旧 `host:node-init` / `host:node-exit` 处理，进而出现 iframe 打开后通信错位、调试脚本与真实宿主行为不一致的问题。

这次跟进处理直接采用“只保留新协议，不做兼容层”：

- scene bundle channel 改为 `interactive-guide:scene-bridge`
- scene source 改为 `interactive-guide-scene`
- init / exit 事件改为 `host:init`、`host:exit`
- debug auto-init 脚本改为发送完整的新协议 payload
- 删除旧版股票跳转相关的 `html:request-route` 逻辑

这样 demo scene、AtlasPreview、Atlas runtime 三者终于使用同一套 scene bridge 语义，后续再排查 scene 联动问题时，不需要再额外区分“宿主是新协议、bundle 是旧协议”。

## 6.2 2026-07-07 跟进：scene 复用宿主顶部 chrome

在新协议对齐后，AtlasPreview 里仍然存在一个明显的结构性问题：进入 HTML scene 时，预览层会在 iframe 上方单独加一个“返回全景”按钮，而不是继续复用宿主已经存在的顶部 chrome（返回 / 标题 / 说明 / 分享）。

这会带来 3 个问题：

1. 预览体验与最终宿主设计不一致；
2. scene 无法复用宿主级分享与说明逻辑；
3. 不同 scene 背景下，顶部标题与图标缺少独立的颜色配置。

因此本次继续补齐：

- `HtmlSceneView` 新增可选 `chrome.textColor`
- scene compiler 会把 view 级 chrome 配置投影到 atlas / catalog manifest
- `HtmlScenePanel` 可直接编辑 view 的“顶部文字色”
- `AtlasPreview` 进入 scene 后，不再使用临时右上角按钮，而是显示宿主级顶部 chrome：
  - 左：返回
  - 中：view 标题 + 说明按钮
  - 右：分享
- 关闭 scene 时，宿主会发送 `host:exit`
- 同一 iframe 在 scene 间切换时，宿主也会先给旧 scene 发送 `host:exit`

这样 scene 顶部体验开始回到“宿主容器统一负责 chrome，iframe 只负责内容”的正确职责划分。

## 6.3 2026-07-07 跟进：抽出共享 Scene Host，并让 Catalog 预览接入真实 runtime

继续往前看，会发现前一个阶段仍然有两个遗留问题：

1. AtlasPreview 里的 scene host 是内嵌实现，CatalogPreview 没法复用；
2. CatalogPreview 仍然只是一个“静态列表草图”，并没有真正挂载 `CatalogRuntime`，因此 scene 进入链路和 Atlas 不一致。

这次继续调整为：

- 新增共享组件 `src/admin/src/components/SceneHostOverlay.tsx`
  - 负责 scene overlay、顶部 chrome、说明抽屉、分享按钮
  - Atlas / Catalog 预览共同复用
- AtlasPreview 改为复用 `SceneHostOverlay`
- CatalogPreview 从“轻量静态预览”升级为：
  - 真实挂载 `CatalogRuntime`
  - 真实解析 html-bundle / image 资源 URL
  - 支持 scene iframe 打开
  - 支持 `host:init` / `host:exit`
  - 支持 route request / back request

这样管理端两套预览终于开始共享同一套 scene host 结构，也更贴近最终“双产品都能进入 HTML scene”的发布态目标。

## 6.4 2026-07-07 跟进：继续按旧版宿主职责拆分，抽出平台层 SceneHostController

虽然 6.3 已经把 Atlas / Catalog 预览统一到了同一个 `SceneHostOverlay` UI 外壳，但当时还有一层重复代码没有收掉：两套 preview 仍然各自维护一份 scene iframe 生命周期、`postMessage` bridge、`host:init` / `host:exit`、`scene:request-back` / `scene:request-route` 监听。

这和旧版 `PlayerHost / PlayerCore` 的职责边界仍不一致。旧版的关键点不是“长什么样”，而是：

- 产品核心只负责语义事件；
- 宿主层统一负责 iframe、bridge、返回、切换和 scene chrome。

因此本轮继续做了两件事：

- 新增 `src/platform/scene-host/scene-host-controller.ts`
  - 统一生成 scene 激活态（`activationId / viewTitle / chromeTextColor`）
  - 统一发送 `host:init`、`host:focus-item`、`host:exit`
  - 统一接收 `scene:request-back`、`scene:request-route`
- 新增 `src/admin/src/features/projects/asset-url-resolver.ts`
  - 统一解析 project asset registry 到 preview 可访问 URL
  - 避免 AtlasPreview / CatalogPreview 再各自复制一份 `sourcePath -> blob/html-bundle url` 的逻辑

对应效果是：

- `AtlasRuntime` / `CatalogRuntime` 继续只关心 `openScene()` / `openRoute()` 这类产品语义；
- preview 里的 scene host 行为改由平台层 controller 承担；
- 这一步为后续补 `draft/release` 独立宿主页打了基础，下一步不需要再从 AtlasPreview / CatalogPreview 里“抄一份 scene 通信逻辑”。

## 6.5 2026-07-07 跟进：统一 HTML Scene 顶部 chrome，并开始补发布链宿主页骨架

本轮又补了两件直接影响后续量产的内容：

### A. HTML Scene 顶部标题 / 说明弹层与全景态统一

用户指出当前 HTML scene 顶部标题和 info 图标弹出的内容与全景图不一致，这里确认属于宿主层语义漂移，而不是 scene 自身设计差异。

这次处理为：

- 新增 `src/platform/chrome/host-info-sheet.ts`
  - 抽出宿主统一的 `HOST_INFO_SHEET_TITLE`
  - 抽出宿主统一的 `HOST_INFO_SHEET_DEFAULT_SECTIONS`
- `AtlasRuntime` 的 info sheet 改为直接复用这一份共享内容
- `SceneHostOverlay` 不再显示 scene/view 自己的标题与“当前场景”块，而是：
  - 顶部标题统一显示 `project.title`
  - info 弹层统一显示与全景态一致的说明 sections
- 预览态 scene 分享标题也统一回到 `project.title`

这样 HTML scene 顶部 chrome 才真正符合“复用宿主 chrome，而不是进入 scene 后换一套标题语义”的设计目标。

### B. draft / release 开始真正写出产品宿主页骨架

之前 `DraftBuildService` / `ReleaseService` 只有 manifest，没有真实 `index.html`、`app.js` 和产物目录壳，离“双产品独立 HTML”还差关键一步。

本轮先补了骨架层：

- 新增 `src/server/services/product-shell.ts`
  - 为 Atlas / Catalog 生成最小宿主页壳：`index.html + app.js`
- `DraftBuildService` / `ReleaseService` 现在会：
  - 写出 `index.html`
  - 写出 `app.js`
  - 写出 `manifest.json`
  - 把引用到的 assets 一并复制进产品目录
- `StaticValidator` 新增检查：
  - `atlas/index.html`
  - `atlas/app.js`
  - `catalog/index.html`
  - `catalog/app.js`

注意：这一层目前仍然只是“宿主页骨架 + 资产闭包落盘”，还没有把真实 `AtlasRuntime / CatalogRuntime` 静态装进壳里。它的意义是先把发布链目录结构与校验面补完整，为下一步把真实 runtime 挂进去做准备。

## 6.6 2026-07-07 跟进：补齐 preview / release 静态文件路由与测试装配

在 6.5 把产品宿主页骨架真正写盘后，下一步必须确认两条链路都能被浏览器直接访问：

1. 管理端 preview 生成后的临时产物；
2. release 产物目录中的正式文件。

这轮补齐的点有三类：

### A. preview 静态文件访问

- `createPreviewsRouter()` 现在在 `POST /projects/:id/previews/:product` 后返回：
  - `buildId`
  - `/api/projects/:id/previews/:product/builds/:buildId/index.html`
- 新增 preview 文件路由：
  - `GET /api/projects/:id/previews/:product/builds/:buildId/<file>`
- 服务端会校验：
  - product 只能是 `atlas | catalog`
  - 请求路径不能是绝对路径
  - 请求路径不能包含 `..`

### B. release 静态文件访问

- 新增 release 文件路由：
  - `GET /api/projects/:id/releases/:version/files/<file>`
- 路由直接指向 release 目录中已经落盘的：
  - `atlas/index.html`
  - `atlas/app.js`
  - `atlas/manifest.json`
  - `catalog/index.html`
  - `catalog/app.js`
  - `catalog/manifest.json`

### C. 修正测试环境与真实服务的挂载差异

这里还排到一个很容易误判的问题：preview 文件 404 最初并不是产物没生成，而是测试里的 express app 没有像真实服务那样挂在 `/api` 前缀下。

真实服务入口 `src/server/index.ts` 的装配是：

- `app.use('/api', createProjectsRouter(...))`
- `app.use('/api', createAssetsRouter(...))`
- `app.use('/api', createReleasesRouter(...))`
- `app.use('/api', createPreviewsRouter(...))`

而测试最初直接把路由挂在根路径，导致 preview 返回的是正确的 `/api/...`，但测试自己去请求时命中了不存在的地址。

这次已将 `tests/server/routes/previews-releases.test.ts` 调整为与真实服务完全一致的 `/api` 挂载方式，避免后续继续出现“业务正确、测试装配错误”的假失败。

### 本轮验证

- `npx tsc -b` 通过
- `npm test -- tests/server/routes/previews-releases.test.ts tests/server/services/static-validator.test.ts` 通过
- 全量测试回归：156/156 通过

## 6.7 2026-07-07 跟进：draft / release 宿主页接入真实 runtime，并修复旧资产路径发布问题

这一步开始，产物链路不再只是“写出一个可访问壳子”，而是已经真正把浏览器侧产品 runtime 带进了 Atlas / Catalog 两份独立 HTML 中。

### A. 产物宿主开始加载真实 Atlas / Catalog runtime

新增浏览器侧宿主源码：

- `src/product-shell/browser/atlas-entry.ts`
- `src/product-shell/browser/catalog-entry.ts`
- `src/product-shell/browser/shared/*`

职责拆分为：

- `shell-frame`
  - 负责固定 viewport 尺寸的产品承载容器
- `scene-overlay-host`
  - 负责 iframe scene overlay、返回、说明、分享、SceneBridge
- `product-toolbar`
  - 负责 Catalog 宿主级顶部 chrome / 说明弹层
- `browser-runtime-entry`
  - 负责 manifest 加载失败兜底

现在 `app.js` 不再渲染“Runtime Shell 占位文案”，而是会直接：

1. 拉取 `manifest.json`
2. 导入浏览器侧 runtime 入口模块
3. 挂载 AtlasRuntime / CatalogRuntime
4. 为 HTML scene 提供正式的 overlay host

### B. 发布链新增“浏览器模块转译落盘”

为了避免再引入一套额外 bundler，本轮新增：

- `src/server/services/browser-runtime-packager.ts`

它会：

- 从 `src/product-shell/browser/*.ts` 入口出发
- 递归解析相对 import / export
- 用 TypeScript transpile 成浏览器可执行的 ES module
- 按 `runtime/...` 目录树写入产品目录

因此现在每个产品目录内都会同时包含：

- `index.html`
- `app.js`
- `manifest.json`
- `assets/...`
- `runtime/...`

也就是已经具备“独立 HTML 宿主 + 产品 runtime 模块 + 资产闭包”的完整运行结构。

### C. scene route 补齐“回到 panorama”处理

之前的 runtime 只真正处理了 `to.kind === 'scene'` 的 route，导致 HTML scene 通过 `scene:request-route` 请求返回全景时，宿主虽然能收到请求，但 runtime 对 panorama 终点不完整。

这次补齐为：

- `AtlasRuntime.openRoute()`
  - `to.itemId` → 聚焦并激活该 item
  - `to.categoryId` → 聚焦该 category
  - 空 panorama → 返回初始视角
- `CatalogRuntime.openRoute()`
  - scene route 会保留 `viewId`
  - panorama item route → 直接选中对应 item
  - panorama category route → 发出 `categoryfocus` 并执行视口动画

这样 scene → panorama 的回跳链路在产品态终于闭合。

### D. 修复旧项目 legacy `assets/` 前缀导致的 release 失败

联调真实 `demo` 项目时发现一个阻塞发布的问题：

- 历史 html-bundle 资产有的 `sourcePath` 是 `assets/scenes/...`
- 当前项目资产根本身已经位于 `.../projects/{id}/assets/`
- 发布复制时直接 `join(projectAssetsRoot, sourcePath)`，会错误变成：
  - `.../assets/assets/scenes/...`

这会直接导致 release 报：

- `ENOENT ... assets\\assets\\scenes\\...`

本轮已在两层修正：

1. `DraftBuildService` / `ReleaseService`
   - 复制资产前统一归一 legacy `assets/` 前缀
2. `CatalogCompiler`
   - scene `entryUrl` 生成时与 Atlas 一样，对 legacy `assets/` 前缀做归一

这样旧项目不需要先手工迁移资产 registry，也可以正常 preview / release。

### E. 本轮真实验证结果

这次不是只跑单元测试，而是实际对 `demo` 项目执行了发布：

- `POST /api/projects/demo/releases` 成功
- release 真实落盘目录：
  - `data/releases/demo/0.1.0/atlas/...`
  - `data/releases/demo/0.1.0/catalog/...`
- 已确认目录中存在：
  - 两份 `index.html`
  - 两份 `app.js`
  - 两份 `manifest.json`
  - scene bundle 资产
  - 转场视频
  - `runtime/...` 浏览器模块树

同时验证：

- `npx tsc -b` 通过
- 针对本轮链路的测试通过
- 当前全量测试回归：159/159 通过

## 7. 对新人的一句话总结

以后看到“某个 Atlas 分类点击后应该进入 HTML Scene”，不要直接去改 camera 或 hotspot 点击回调；先检查这 5 件事是不是完整：

1. category.experience 是否绑定了 sceneId/viewId
2. navigation.routes 是否存在 panorama → scene route
3. route.transition 是否绑定了 video asset
4. compiler 是否把 scene entry 与 transition URL 编进 manifest
5. preview/runtime 的 `openScene()` 是否真的能打开 scene

## 6.6 2026-07-07 跟进：宿主顶部 chrome 不再分裂为三套实现

在继续联调时，发现“HTML scene 顶部标题 / 图标样式仍然和全景图不一致”的根因不是某个颜色参数没传，而是代码结构上确实已经分裂成三套：

- `AtlasRuntime.mountChrome()` 一套旧版 DOM
- `product-toolbar` 一套 HTML scene runtime DOM
- `SceneHostOverlay` 一套 admin preview React + lucide 图标

这会带来三个后果：

1. 图标 SVG、间距、渐变层高度很容易继续漂移
2. HTML scene 的白字需求无法和 Atlas 的浅色 header 共用同一视觉基线
3. 任何一个说明弹层或顶部交互修复，都必须改三处，回归成本很高

因此本次进一步调整为：

- 新增 `src/platform/chrome/host-toolbar-icons.ts`
  - 统一返回 / 说明 / 分享 / 右下返回 SVG
  - 全部改成 `currentColor`，让 HTML scene 可直接使用白字
- 新增 `src/platform/chrome/host-toolbar-tokens.ts`
  - 统一顶部 gradient、高度、左右留白、标题最大宽度
- 新增 `src/platform/chrome/host-toolbar-dom.ts`
  - 抽出共享 DOM 宿主顶部栏 + 说明弹层控制器
  - Atlas / runtime scene host 都复用这层 DOM 结构
- `AtlasRuntime`
  - 保留“返回到初始全景镜头”的旧语义
  - 只把顶部 chrome 的视觉和说明弹层改为共享实现
  - 右下“返回总图”悬浮按钮仍由 Atlas 自己维护
- `SceneHostOverlay`
  - 改为直接复用同一套 SVG / spacing token
  - 仍保留 HTML scene 自己的 `chromeTextColor`
  - 返回行为继续走 scene host 的关闭逻辑，而不是套用 Atlas 语义

这样处理后，宿主顶部栏终于回到“视觉结构共用一套、场景行为分别注入”的正确边界：

- Panorama：浅色标题，返回初始全景状态
- HTML scene：深色背景时可切白字，返回 scene overlay 关闭逻辑

也就是说，后续若再调顶部 icon、说明弹层或标题布局，只需要改平台层一份视觉实现，不会再出现 preview / runtime / atlas 三边继续漂移。
