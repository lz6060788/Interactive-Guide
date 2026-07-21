# 双产品重构后续修复与体验恢复计划

> 日期：2026-07-03  
> 面向读者：首次接触本项目的开发人员  
> 上游文档：`2026-06-29-双产品架构重构方案.md`、`dual-product-baseline-2026-06-30.md`  
> 当前结论：数据与目录架构方向成立，但 Atlas 体验迁移、双 HTML 发布、编辑器保存和 Catalog 运行时尚未达到验收标准。

## 实施状态

| 阶段 | 状态 | 最后更新 | 结果 |
|---|---|---|---|
| Phase A 回归基线与质量门禁 | ✅ 完成 | 2026-07-03 | 根测试 138/138、Admin 测试 25/25、typecheck、lint、Admin build 通过 |
| Phase B Atlas 镜头和坐标系统 | ✅ 完成 | 2026-07-03 | 编辑画布与真实预览可平移；同镜头标注位置实测偏差 < 0.001px |
| Phase C Atlas 视觉恢复 | 🟡 进行中 | 2026-07-06 | 已切换到 classic callout 数据语义、共享视觉 token、runtime/editor overlay 标注；补回 preview 固定视口缩放、callout 整组拖拽与 marker 显示，待浏览器基线对照与 hover/focus 细节验收 |
| Phase D 底部横向卡片 | 🟡 进行中 | 2026-07-06 | 运行时已恢复底部横向卡片抽屉、分类/项目激活联动、toolbar/hint 与基础返回语义；待浏览器滚动同步、镜头跟随与视觉基线验收 |
| Phase E–I | ⏳ 未开始 | — | — |

## 1. 目标

完成本计划后，系统必须同时满足以下结果：

1. 一个 `project.json` 可以稳定编辑并原子发布 Atlas、Catalog 两份独立 HTML。
2. Atlas 恢复重构前 Surface Runtime 的核心体验：
   - 全景图可鼠标拖动、滚轮缩放和双指缩放。
   - 编辑画布、实时预览、最终 HTML 使用同一套坐标投影。
   - hotspot、callout 的外观和交互不低于重构前版本。
   - 点击 hotspot/callout 后出现底部横向滚动卡片列表。
   - 卡片、镜头、hotspot/callout 选中状态互相同步。
3. Catalog 恢复列表选择、全景移动、focusRect 高亮和场景进入能力。
4. 编辑器不存在 revision 冲突、非法 order 或“编辑器看起来正确但无法发布”的情况。
5. 转场视频、HTML SceneBridge、埋点、分享在两套运行时中真正完成装配。
6. `guide-project-bootstrap` 能创建完整项目，而不只是创建空项目和上传资产。
7. 主程序中不再保留 AIGC 配置、密钥和废弃模块。

## 2. 新人先理解这四条数据流

### 2.1 编辑数据流

```text
Admin Editor
  -> 修改内存中的 GuideProject draft
  -> 单次原子保存
  -> Server 校验 expectedRevision
  -> 写入 data/projects/{id}/project.json
  -> revision + 1
```

不要在一个“保存”动作中用同一个 revision 连续请求 knowledge、panorama、product config。第一次请求成功后 revision 已变化，后续请求会产生 409。

### 2.2 Atlas 渲染数据流

```text
GuideProject
  -> normalizeProject + validateReleaseProject
  -> compileAtlas
  -> AtlasManifest
  -> AtlasRuntime
  -> panorama + hotspot/callout + card drawer + scene
```

编辑器预览必须直接使用同一个 `AtlasRuntime`。编辑画布虽然需要额外拖拽手柄，但必须复用运行时的镜头投影和视觉 token。

### 2.3 Catalog 渲染数据流

```text
GuideProject
  -> compileCatalog
  -> CatalogManifest
  -> CatalogRuntime
  -> stage/category/item list
  -> panorama viewport animation + focusRect
  -> optional scene route
```

### 2.4 发布数据流

```text
GuideProject revision N
  -> release-tier validation
  -> build Atlas in temporary directory
  -> build Catalog in temporary directory
  -> copy each product's asset closure
  -> start a static server and smoke-test both entries
  -> write release.json
  -> atomically rename temporary directory to final directory
```

任何一步失败，旧 release 必须保留，临时目录必须清理。

## 3. 当前问题与根因

| 编号 | 现象 | 根因 | 优先级 |
|---|---|---|---|
| ATL-001 | Atlas 全景不能平移 | `Camera.onPointerDown` 只接受 `event.target === container`；真实 target 通常是图片或 viewport layer | P0 |
| ATL-002 | 编辑预览同样不能平移 | 编辑器和预览都使用同一个有缺陷的 Camera 事件入口 | P0 |
| ATL-003 | hotspot/callout 有轻微偏移 | 镜头使用简化百分比 transform；没有统一计算 `object-fit: cover`、源图比例、缩放后尺寸和裁切偏移 | P0 |
| ATL-004 | 编辑器和预览位置不完全一致 | 编辑器用百分比与 dnd delta，运行时用另一套点击换算；两边没有共享 screen↔normalized 投影 | P0 |
| ATL-005 | hotspot/callout 样式退化 | 新 renderer 用 24px 橙色圆点、蓝色 item dot 和引线文字；原版实际是 SVG marker、呼吸动画和胶囊按钮，当前实现误解了 callout 语义 | P0 |
| ATL-006 | callout 不能可靠点击 | callout 根节点为 `pointer-events: none`，运行时主要依赖图片坐标 hit-test | P0 |
| ATL-007 | 底部滚动卡片消失 | 新 runtime 只实现单个 item 详情面板，没有迁移旧 Surface 的 category cards、横向滚动与滚动同步状态机 | P0 |
| EDT-001 | 一次保存多类修改时 409 | 多个 PUT 使用同一个旧 revision | P0 |
| EDT-002 | 新增分类/项目后无法发布 | 新增 order 使用 `length + 1`，而 schema 要求从 0 连续排序 | P0 |
| REL-001 | 发布目录没有两份可运行 HTML | ReleaseService 只写 manifest，没有写 index/app.js，也没有复制资产 | P0 |
| REL-002 | 静态校验会误判通过 | validator 不要求入口文件、manifest、release.json 必须存在 | P0 |
| CAT-001 | Catalog 镜头没有实际移动 | `animateViewport()` 只发事件，最后 `void target` | P1 |
| PLT-001 | 转场/SceneBridge 未接入产品 | platform 类已存在，但产品 runtime 没有使用它们 | P1 |
| SKL-001 | Skill 创建的是空项目 | CLI 没有把 assemble 后的知识、全景、scene、route 写回服务端 | P1 |
| CLN-001 | AIGC 配置仍在 | `server/config.ts` 和 `.env.example` 仍保留 Vision/图片/视频生成配置 | P1 |

### 3.1 原版视觉的事实来源

本计划中的“原版”以 `main` 分支 `src/runtime/player-core/player-host.ts` 为准，不凭截图猜测：

- `SURFACE_MARKER_SVG` / `SURFACE_MARKER_SELECTED_SVG`：marker 的精确 SVG。
- `createHotspotButton()`：分类 hotspot 的 DOM 和文字样式。
- `createSurfaceCard()`：三级内容 callout 的 DOM 和点击行为。
- `applyAnnotationChipStyles()`：胶囊按钮的精确尺寸、颜色、边框和阴影。
- `renderBottomSheet()`：底部抽屉、横向卡片和选中态。

`C:\Users\91252\Downloads\rocket\rocket\rocket.html` 是进入上游后的火箭 3D 场景。它的深色玻璃信息面板、红色 connector dot 和部件切换按钮属于 HTML scene 内部视觉，不是 Atlas 总图 hotspot/callout 的样式来源。两者不得混用。

## 4. 目标架构调整

### 4.1 Atlas 内部分层

```text
AtlasRuntime
├── PanoramaProjection       纯数学：源图、视口、镜头之间的换算
├── CameraController         手势、clamp、动画，不直接理解 DOM 样式
├── PanoramaLayer            图片和统一 transform
├── MarkerRenderer           category hotspot + item marker
├── CalloutRenderer          三级内容 marker + 可点击 callout chip
├── CardDrawerController     底部卡片、滚动同步、active item
├── ExperienceController     transition video -> scene -> bridge
└── RuntimeChrome            hint、reset、share 等产品 UI
```

编辑器侧只增加编辑能力：

```text
AtlasCanvas
├── 使用 PanoramaProjection
├── 使用 atlas visual tokens
├── 编辑专用选择框/拖拽手柄
└── 将 screen position 反投影为 normalized coordinate

AtlasPreview
└── 直接 mount AtlasRuntime，不复制渲染逻辑
```

### 4.2 不要恢复旧的数据模型

底部卡片不需要恢复 `SurfaceCard`、`SurfaceFocusLayer` 或 node/edge 模型，但必须精确迁移它们的用户体验。

使用现有数据即可：

- 分类：`AtlasCategoryEntry.itemIds`
- 卡片标题/说明/标签：`AtlasItemEntry`
- 三级 callout 锚点：`AtlasItemEntry.marker`
- 可选镜头：`ItemSpatialLayout.viewportOverride`
- callout：`ItemSpatialLayout.callout`

原版总图中的术语映射固定如下：

| 原版类型 | 新模型 | 视觉 |
|---|---|---|
| `SurfaceHotspot` | category + `CategorySpatialLayout.hotspot` | marker + 分类胶囊按钮 |
| `SurfaceCard` | item + `ItemSpatialLayout.marker/callout` | marker + 三级内容胶囊按钮 |
| bottom sheet card | `IndustryItem` | 底部 260px 内容卡片 |

这里的 callout 不是“marker 到文字标签的一根引线”。原版 `SurfaceCard` 只有一个 normalized anchor，marker 和胶囊按钮在同一个纵向 flex root 中排列，没有 connector line。

建议在本轮无兼容迁移中把 `ItemCallout` 改成表达原版呈现，而不是继续保留误导性的 target/dock：

```ts
interface ItemCallout {
  markerPosition: 'top' | 'bottom'
  markerGapPx: number
  minZoom?: number
}
```

位置统一读取 `ItemSpatialLayout.marker`。只有未来明确增加“引线标注”产品能力时，才新增另一种有限 variant；不能把引线当作原版默认 callout。

只在确有项目级差异时增加有限配置，例如：

```ts
interface AtlasCardDrawerConfig {
  enabled: boolean
  openOnHotspotClick: boolean
  openOnCalloutClick: boolean
  scrollBehavior: 'snap'
}
```

默认值进入 `PROJECT_DEFAULTS`，不得把商业航天、火箭等实例内容写入 runtime。

## 5. 实施阶段

## Phase A：建立回归基线与强制质量门禁

> 完成记录（2026-07-03）：新增 `atlas-legacy-visual-baseline.json`，冻结 `main@c2bcb34` 的 marker、胶囊、抽屉和滚动参数；修复根测试的旧编辑器路径、Vitest worktree/symlink 解析、无效 ESLint rule 注释和 compiler 确定性测试。Admin 测试仍会输出 jsdom 不支持 Chakra `@layer` 的 CSS 解析噪声，但 5 个 suite、25 个断言全部通过，不影响测试结果。

### A1. 固化旧 Atlas 视觉和交互基线

新增：

- `tests/fixtures/atlas-legacy-visual-baseline.json`
- `tests/browser/atlas-runtime.spec.ts`
- `tests/browser/atlas-editor-preview.spec.ts`
- `docs/development/atlas-visual-baseline-2026-07-03.md`

基线至少记录：

- 375×808 和 1440×900 两种尺寸截图。
- 初始镜头、放大后镜头、拖动后镜头。
- hotspot 默认、hover、active 三种状态。
- callout 默认、hover、active 三种状态。
- 底部抽屉关闭、打开、第二张卡片激活三种状态。
- 点击上游分类后的视频与 HTML scene 行为。

不要用“看起来差不多”作为验收。视觉回归允许的定位误差为 1 CSS px，颜色和尺寸使用 token 精确比较。

### A2. 修复现有测试入口

1. 把根测试中旧的 `src/admin/src/editors/...` import 更新到 `src/admin/src/features/...`。
2. 修复 Admin Vitest 的 `setupFiles` 路径，使五个 suite 真正执行。
3. 安装或移除错误的 `react-hooks/exhaustive-deps` 配置，确保 ESLint 不是靠无效 disable 通过。
4. 在 CI 中串行运行：

```text
npm run typecheck
npm run lint
npm test
npm --prefix src/admin test -- --run
npm run build
npm run test:e2e
```

**完成条件**：所有门禁为绿色；不允许先跳过失败测试再进行运行时重写。

## Phase B：修复 Atlas 镜头和坐标系统

这是最先实施的功能阶段。后续 hotspot、callout、卡片都依赖它。

> 完成记录（2026-07-03）：新增纯函数 `panorama-projection.ts`，统一 cover、camera clamp、normalized↔screen 和指针锚点缩放；Camera 改为像素 matrix，允许从图片/普通图层发起拖动，实现 pointer capture、双指缩放、unsubscribe/destroy；AtlasRuntime 与 AtlasCanvas 读取图片真实尺寸并共用投影；编辑画布和预览固定使用项目 viewport，避免 flex 把 375×808 压成不同宽高比。浏览器实测编辑画布与预览分别水平拖动 80px 后 transform 均为 `matrix(1,0,0,1,80,0)`，回到同一镜头后 hotspot 相对位置差为 `0px / 0.00001px`。根测试 141/141、Admin 25/25、typecheck、lint、Admin build 通过。

### B1. 新建统一投影模块

新增 `src/products/atlas/runtime/panorama-projection.ts`，只写纯函数，不访问 DOM：

```ts
type ProjectionInput = {
  viewportWidth: number
  viewportHeight: number
  sourceWidth: number
  sourceHeight: number
  camera: Viewport
  bounds: CameraBounds
}

type PanoramaProjection = {
  baseWidth: number
  baseHeight: number
  originX: number
  originY: number
  scaledWidth: number
  scaledHeight: number
  translateX: number
  translateY: number
  camera: Viewport
}

resolvePanoramaProjection(input): PanoramaProjection
projectNormalizedPoint(point, projection): ScreenPoint
unprojectScreenPoint(point, projection): NormalizedPoint
clampCamera(camera, input): Viewport
```

计算规则参考旧 `surface-camera.ts`：

1. 先按 `cover` 计算 `baseWidth/baseHeight`。
2. 用真实源图比例，不假定图片比例等于 375×808。
3. `scaledWidth = baseWidth * zoom`。
4. `translateX = viewportWidth / 2 - originX - centerX * scaledWidth`。
5. normalized 点统一通过 `origin + translate + normalized * scaledSize` 投影。

禁止继续使用当前 `(0.5 - centerX) * 100%` 的简化公式。

### B2. 重写 CameraController 手势入口

修改 `camera.ts`：

1. pointerdown 绑定在容器，但允许事件来自图片和普通图层。
2. 仅当 target 位于以下元素时拒绝平移：
   - button、a、input 等交互控件；
   - `[data-atlas-interactive="true"]`；
   - 编辑器拖拽手柄。
3. pointer capture 始终设置在 viewport container 上。
4. 拖动 delta 根据 `scaledWidth/scaledHeight` 转为中心点变化。
5. clamp 必须考虑当前可见区域，不能只把 center 粗略限制到 `[0,1]`。
6. 给容器设置 `touch-action: none`。
7. 实现双指缩放；`pinchZoom: true` 不能只是 schema 字段。
8. 滚轮缩放以鼠标所在图片点为锚点，缩放前后该点不能跳动。
9. `destroy()` 必须移除 wheel/pointer/touch 监听和 animation frame。
10. `onChange()` 返回 unsubscribe，避免编辑器反复 mount 后叠加监听。

### B3. Runtime 使用 pixel transform

`AtlasRuntime.applyTransform()` 根据 projection 设置：

```text
transform: translate3d(originX + translateX, originY + translateY, 0)
           scale(zoom)
```

或使用等价 matrix。不要混用百分比 translate 与 scale。

图片元素使用 projection 的 `baseWidth/baseHeight`，marker/callout 不再依赖一个被 `object-fit: cover` 隐式裁切的 100% 容器。

### B4. 编辑器使用相同投影

修改 `AtlasCanvas.tsx`：

- 删除本地的百分比坐标推导。
- 图片加载后读取 `naturalWidth/naturalHeight`。
- 创建与 runtime 相同的 projection。
- 放置点：使用 `unprojectScreenPoint()`。
- 拖动点：使用拖动结束时的最终屏幕坐标反投影，不再只用 `dnd delta / rect / zoom`。
- AxisIndicator 显示 Camera 当前 center，不再显示 `project.panorama.initialViewport`。
- React state 保存当前 camera，不能只存 ref，否则 zoom readout 不会稳定刷新。

### B5. Preview 容器适配

运行时仍按项目 viewport（默认 375×808）渲染。预览区域空间不足时，只对整个 runtime root 做等比缩放；不改变内部逻辑 viewport，也不让 host 使用 `overflow:auto` 形成第二套滚动坐标。

### B6. 单元与浏览器测试

至少覆盖：

- 16:9 源图放入 375×808 的 cover 投影。
- 9:16 源图放入 375×808。
- zoom 1、2、4 的 normalized→screen→normalized 往返误差 `< 1e-6`。
- 从图片元素开始拖动可以平移。
- 从 hotspot/callout/button 开始拖动不会平移。
- 鼠标锚点缩放前后偏差 `< 1 px`。
- 编辑画布与预览中同一 hotspot 屏幕位置偏差 `<= 1 px`。

**Phase B 完成条件**：用户反馈的 1、2 两项全部关闭。

## Phase C：恢复 Atlas hotspot/callout 视觉与交互

> 开发记录（2026-07-06）：`ItemCallout` 从错误的 `dock + target` 迁移为原版语义 `markerPosition + markerGapPx`，`calloutVariant` 改为 `classic | connector | none`，默认值统一为 `classic`。新增 `atlas-visual-tokens.ts` 冻结 marker / chip 的尺寸、颜色、字体和呼吸动画，runtime 与 AtlasCanvas 共用；AtlasRuntime 改为“变换后的 panorama layer + 固定尺寸 overlay layer”，不再依赖图片距离 hit-test，category hotspot / item callout 直接由 DOM button 回调驱动。AtlasCanvas 同步改为 overlay 投影，移除 callout target 拖点，item callout 直接锚定 `marker`。补充修复：AtlasPreview 现在按项目 viewport 挂载真实 runtime，并在预览空间不足时只对整个 runtime root 做等比缩放，不再让 host `overflow:auto` 形成第二套滚动坐标；AtlasCanvas 的 callout 现改为“marker + chip 同一 anchored root”整体拖拽，新建 callout 时 marker 不再丢失。当前 `npx tsc -b`、root test 142/142、Atlas runtime 专项 7/7、admin build 通过；根 `lint` 仍只有既有 warning，仓库根目录仍无 `build` script。下一步还需要用浏览器对照冻结基线，补 hover / focus-visible 与旧版截图验收，再进入 Phase D 收尾。 

> 追加对照记录（2026-07-06 晚）：再次以 `main:src/runtime/player-core/player-host.ts` 作为唯一事实来源核对顶部栏、底部抽屉和 hotspot/callout 逻辑。确认当前 Atlas 与原版的关键差异曾经包括：① 顶部栏被误做成 pill toolbar，而原版是“左返回 / 中标题+小图标 / 右分享”的透明图标式 header；② 底部抽屉缺少“stage > category”面包屑头部、右上角 `×` 关闭和右侧悬浮“返回总图”按钮；③ 有 callout 的 item 不应再额外渲染独立 marker；④ 当 callout 在当前 zoom 下可见时，同分类 hotspot 需要隐藏，不能和 callout 并存。现已按上述规则回退实现，并在 Atlas compiler 中补充 `categories[].stageLabel` 供抽屉面包屑使用。当前 `npx tsc -b`、Atlas compiler/runtime 专项 13/13、root test 142/142、admin build 通过。下一步仍需真实浏览器截图验收顶部 icon 间距、hint 动画节奏和 drawer/floating-back 的像素级位置。 

> 再追加修复（2026-07-06 深夜）：继续根据用户回归反馈修正了 4 类问题。其一，标题旁 info icon 恢复为可点击状态，并重新挂回轻量说明弹层，避免“有图标无行为”；其二，camera 与编辑器反投影改为使用“逻辑 viewport 尺寸 + 缩放后的指针坐标换算”，修复 preview 在缩放承载下的 camera 误判，减少底部黑边和 editor/preview marker 漂移；其三，Atlas runtime 与编辑器在未显式配置时恢复旧版阈值语义：`hotspotMinZoom=1`、`calloutMinZoom=2`、`itemMarkerMinZoom=2`，避免 callout 永远可见并持续压掉 hotspot；其四，编辑器画布现在也按同一套阈值隐藏 hotspot / item / callout，避免“编辑器里可见但预览里不可见”或相反。当前 `npx tsc -b`、Atlas 专项 16/16、root test 142/142 通过；本次 `src/admin` build 失败原因是与 Atlas 无关的既有 import 路径问题：`HtmlScenePanel.tsx` 无法解析 `domain/scene-protocol`。下一步应在真实浏览器里重点验收：1）preview 黑边是否消失；2）callout 圆点在 editor/preview/runtime 的最终对齐；3）info icon 弹层是否满足旧版点击预期。 

### C1. 建立有限视觉 token

新增 `src/products/atlas/runtime/atlas-visual-tokens.ts`：

- 默认 marker：21×21；外圆白色 10% 填充、0.5px 白边，内圆 4.5px 纯白。
- selected marker：21×21；外圆 `#FF2436` 10% 填充和 0.5px 红边，内圆 5.5px 红色并带白边。
- marker 呼吸动画：2.8s ease-in-out；scale 1 → 1.06 → 1，opacity 0.96 → 1 → 0.96。
- marker 与胶囊默认垂直间距 6px，marker 默认位于胶囊上方。
- 胶囊最小宽 80px、高 36px、padding 8px 12px、圆角 30px。
- 默认胶囊背景 `rgba(255,255,255,0.8)`，边框 `1px solid rgba(255,255,255,0.36)`。
- 默认文字 `rgba(0,0,0,0.84)`；PingFang SC 优先、16px、600、20px 行高。
- selected 胶囊背景严格使用 `#3366FF`、白字、无边框。
- 阴影严格使用 `0 8px 24px rgba(0,0,0,0.08)`。
- 三级内容胶囊最小宽 88px、最大宽 240px，单行省略。

运行时和编辑器都读取这些 token。编辑器只可增加选择环和拖拽手柄，不得复制一套“近似样式”。

以上是 `classic` 默认 variant 的冻结值，不得为了适配当前编辑器主题改成橙色。项目配置只保存有限 variant，不保存任意 CSS 字符串。

### C2. 重写 MarkerRenderer

- category hotspot 渲染为一个 anchored root，内部是 21px marker + 可访问胶囊 button，而不是只有一个无文字圆点。
- 默认顺序是 marker 在上、category label 在下，间距 6px。
- DOM 设置 `data-atlas-interactive="true"`，阻止相机误拖动。
- 支持 default/hover/active/focus-visible。
- active category 切换时同步视觉状态。
- click 直接回调 categoryId，不再依赖图片上的距离 hit-test。

### C3. 重写 CalloutRenderer

- item callout 使用与原版 `createSurfaceCard()` 相同的 anchored root：21px marker + 三级内容胶囊 button。
- callout 不绘制 connector line，不使用独立 target 坐标。
- anchored root 使用 `ItemSpatialLayout.marker` 定位；marker 和胶囊必须始终一起移动。
- 胶囊允许点击与键盘激活，root 本身保持 `pointer-events:none`，button 为 `pointer-events:auto`。
- click 直接回调 itemId。
- camera 变化、容器 resize、图片加载完成时统一重新投影。

推荐 DOM：

```text
div.atlas-item-callout-root[data-item-id]
├── span.atlas-marker
└── button.atlas-callout-chip
```

如需保留当前引线样式供未来试验，必须命名为独立的 `connector` variant，且不能作为 `classic` 或默认值。

### C4. 编辑器复用样式

将 `HotspotDot`、`ItemMarkerDot`、`CalloutLayer` 改为使用共享 token 和 projection。拖拽临时 transform 结束后必须归零，由 normalized 数据重新渲染最终位置。

**Phase C 完成条件**：用户反馈的第 3 项关闭；截图与旧版基线的结构、尺寸和状态一致。

## Phase D：恢复底部横向卡片抽屉

> 开发记录（2026-07-06）：新增 `card-drawer-controller.ts`，把底部抽屉从旧的单条详情面板替换为独立控制层；runtime 现在会在点击 category hotspot 时打开该分类的横向卡片列表、默认激活第一条 item，并在点击 callout / 卡片时同步 active item。AtlasManifest 追加 `items[].viewportOverride`，AtlasCompiler 同步透传；点击底部卡片时优先使用 `viewportOverride`，否则以 marker 为中心移动镜头。视觉 token 已冻结抽屉背景、阴影、卡片宽度、圆角和滚动时序常量，并通过 `atlas-legacy-visual-baseline.test.ts` 对齐旧版基线。补充修复：抽屉根节点强制 `bottom:0 + width:100% + box-sizing:border-box`，关闭按钮文案恢复为“返回”；runtime 顶部 toolbar、标题、小图标、返回/分享按钮与底部 `<<<拖动或缩放探索全景图>>>` hint 已补回；点击 hotspot 时默认激活该分类第一条 callout/item，避免只高亮 hotspot。当前 `npx tsc -b`、root test 142/142、Atlas runtime 专项 7/7、admin build 通过；lint 仍只有既有 warning。下一步仍需在真实浏览器中对照旧版，补足滚动停止后“就近卡片激活”、程序滚动锁、pointer drag 防误触和 close / reset / route 的完整语义，再将 Phase D 标记完成。 

> 追加对照记录（2026-07-06 晚）：根据 `main` 分支原版实现，抽屉关闭控件并不是“返回”文字按钮，而是右上角透明 `×`；“返回总图”是抽屉外、右下角悬浮的独立小方按钮，会在抽屉打开时自动上移到抽屉上方。现已按原版结构调整：抽屉头部恢复面包屑，关闭按钮改为 `×`，悬浮返回按钮恢复，卡片点击/滚动联动与 active card 选中态保持不变。当前尚待真实浏览器确认的是：悬浮返回按钮随抽屉高度的最终偏移，以及不同 viewport 下是否与旧版完全同位。 

### D1. 新增 CardDrawerController

新增：

- `src/products/atlas/runtime/card-drawer-controller.ts`
- `src/products/atlas/runtime/card-drawer-renderer.ts`

状态：

```ts
type CardDrawerState = {
  open: boolean
  activeCategoryId: string | null
  activeItemId: string | null
  scrollSyncLocked: boolean
}
```

### D2. 打开规则

- 点击 category hotspot：
  1. 激活 category；
  2. 镜头移动到 category viewport；
  3. 取得 category.itemIds；
  4. 默认激活第一个 item；
  5. 打开底部卡片抽屉。
- 点击 item callout：打开该 item 所属分类，并把对应卡片滚动到中间。
- 点击卡片：激活 item，镜头移动到 `viewportOverride`；不存在时以 marker 为中心并保持合理 zoom。
- 点击关闭：只关闭抽屉，不破坏当前 camera。
- 点击 reset：关闭抽屉、清除 active 状态、回到 initialViewport。

### D3. 卡片列表行为

- 抽屉背景为 `linear-gradient(360deg, #F5F5F5 0%, rgba(255,255,255,0.64) 100%)`。
- 抽屉使用 6px backdrop blur、顶部 8px 圆角、`0 -10px 36px rgba(15,23,42,0.12)` 阴影。
- 抽屉 padding 为 14px 16px 18px，区块 gap 为 14px。
- 开关动画为 280ms `cubic-bezier(0.22,1,0.36,1)` 位移 + 220ms opacity。
- 横向 flex 列表，`overflow-x:auto`。
- 卡片固定宽 260px、最小高 108px、padding 14px 16px、圆角 12px。
- 默认卡片白底、1px `rgba(15,23,42,0.08)` 边框。
- active 卡片使用 2px `#3366FF` 边框和 `rgba(51,102,255,0.10)` 背景。
- 卡片标题 16px/22px、700；说明 14px/22px。
- `scroll-snap-type:x proximity`。
- 卡片有明确 active 状态。
- 程序切换 item 时调用 `scrollIntoView({ inline:'center' })`。
- 用户滚动停止 140ms 后，选择距离容器中心最近的卡片。
- 程序滚动后锁定反向同步约 420ms，防止循环触发。
- pointer drag 后不应误触 card click。
- 卡片正文来自 `IndustryItem`，不得出现股票跳转。

### D4. 与镜头及埋点同步

每次用户激活卡片：

- 更新 active item。
- 更新 marker/callout 状态。
- 可选移动镜头。
- 只触发一次 `analytics:click(item)`。
- 不因 scrollIntoView 再重复上报。

### D5. 测试

- hotspot 打开正确分类的全部 item 卡片。
- callout 打开并居中正确 item。
- 横向滚动后 active item 改变。
- active item 变化会移动 camera。
- 关闭/重置语义不同。
- 空分类不打开空抽屉，并给出可诊断事件。

**Phase D 完成条件**：用户反馈的第 4 项关闭。

## Phase E：修复编辑器数据正确性

### E1. 改成单次原子保存

新增统一接口，例如：

```http
PUT /api/projects/{id}
x-expected-revision: 84
Content-Type: application/json

{ 完整 GuideProject draft }
```

服务端流程：schema parse → draft validation → revision compare → 写临时文件 → rename → 返回 revision 85。

AtlasEditor、CatalogEditor、Settings 保存时都只调用一次。保存成功后必须用服务端响应整体替换本地 draft。

如果保留分区接口，它们只能供单项即时操作使用，不能再被一个保存按钮串行调用。

### E2. 统一 order 工具

新增 `src/domain/knowledge-order.ts`：

- `appendCategory()` 新项 order 为当前 length。
- `appendItem()` 新项 order 为当前 length。
- 删除和拖动排序后统一 `reindexCategories/reindexItems`。
- compiler 按业务 order 编译，不得改成按 id 排序破坏运营顺序。

注意：当前 AtlasCompiler 对 category 和 item 使用 id 排序，需要改为 `order -> id` 的稳定排序。

### E3. 保存前校验

- 编辑阶段显示 draft validation。
- 发布按钮显示 release validation。
- calibration 必须实际要求需要展示的 hotspot、marker、focusRect，而不是只要求 layout 空对象存在。
- 错误点击后能定位到左侧结构树和对应 inspector。

## Phase F：完成真实双 HTML 发布

### F1. 产品构建器

为 Atlas/Catalog 分别实现：

```ts
buildAtlasBundle(project): {
  indexHtml: string
  appJs: Buffer
  manifestJson: string
  assets: Map<relativePath, Buffer>
}
```

Catalog 对应同样接口。构建器必须把 runtime 打进 `app.js`，HTML 不依赖 Admin 和 `/api`。

### F2. ReleaseService 顺序

1. `normalizeProject()`。
2. `validateReleaseProject()`；失败立即停止。
3. 创建 `{version}__tmp`。
4. 写 Atlas 全部文件。
5. 写 Catalog 全部文件。
6. 写 `release.json`。
7. 执行强静态校验。
8. 原子替换最终目录。

修复 route 过滤：scene route 比较的是 `scene.id`，不是 `scene.assetId`。

### F3. 强静态校验

必须要求以下文件存在：

- `release.json`
- `atlas/index.html`、`atlas/app.js`、`atlas/manifest.json`
- `catalog/index.html`、`catalog/app.js`、`catalog/manifest.json`
- 两份 manifest 引用的全部资产

并检查：

- 不存在 `/api` URL。
- 不存在绝对磁盘路径。
- 不存在逃逸发布目录的 `..`。
- scene entry、视频、全景图都能读取。
- 两份 HTML 在静态服务器下加载，无 console error、404 或未处理 promise rejection。

## Phase G：接入场景、转场、埋点与分享

建立 `ExperienceController`，Atlas/Catalog 共用调用顺序：

```text
route requested
-> optional TransitionVideoController.play()
-> onFailure = cut 或 abort-navigation
-> create scene iframe
-> derive targetOrigin
-> SceneBridge host:init
-> optional host:focus-item
-> receive scene:request-route / scene:request-back
-> destroy iframe and bridge on exit
```

产品 runtime 只发语义事件，`AnalyticsAdapter` 负责初始化、曝光、点击、停留、分享等上报。商业航天等内容只从 `projectTitle/contentName` 注入。

## Phase H：恢复 Catalog 运行时

1. Catalog 使用与 Atlas 相同的 PanoramaProjection。
2. `animateViewport(target)` 必须实际插值 camera，并更新图片 transform。
3. stage tab 严格上/中/下游切换。
4. 二级分类和三级列表保持同步。
5. item 激活时同时更新列表、marker、focusRect 和 camera。
6. focusRect 使用 normalized projection，支持 maskOpacity/radius。
7. HTML scene category 使用 ExperienceController 进入场景。
8. CatalogPreview 直接 mount 真实 CatalogRuntime。

## Phase I：完成 Bootstrap Skill 和遗留清理

### I1. Skill

- 输入支持 JSON；Markdown/文本先由 Agent 转成确定性 JSON。
- CLI 将完整 assembled project 通过原子项目保存接口写入服务端。
- 每次资产上传读取服务端返回的真实 revision，不做 `revision += 1` 假设。
- 生成 `bootstrap-report.json`。
- 报告 calibration queue，不能伪造坐标。
- 完成后自动运行 draft/release validation，并返回编辑器入口。

### I2. 清理

- 从 `server/config.ts`、`.env.example` 删除全部 Vision/LLM/图片生成/视频生成配置。
- 环境变量只保留当前实际需要的服务、数据目录、CORS 和对象存储配置。
- 删除已废弃的 Admin legacy 目录和失效文档引用。
- 默认 viewport、zoom、动画时长全部只从 `PROJECT_DEFAULTS` 读取。

## 6. 推荐提交顺序

每个提交都必须可构建、可测试，不要把所有阶段压成一个巨大提交。

1. `test(atlas): freeze interaction and visual regression baseline`
2. `fix(atlas): unify panorama projection and restore panning`
3. `fix(atlas-editor): align canvas and runtime coordinates`
4. `feat(atlas): restore hotspot and callout visual system`
5. `feat(atlas): restore scroll-synced card drawer`
6. `fix(admin): make project save atomic and normalize ordering`
7. `feat(release): emit validated standalone dual html bundles`
8. `feat(platform): wire transitions scenes analytics and share`
9. `feat(catalog): restore viewport focus and scene behavior`
10. `feat(skill): persist complete bootstrapped projects`
11. `chore: remove remaining aigc and legacy configuration`
12. `test(e2e): verify baseline project across editors and bundles`

## 7. 每阶段开发工作模板

新人处理每个 task 时按此顺序执行：

1. 读取本计划对应阶段和涉及文件。
2. 先写一个能复现问题的失败测试。
3. 只实现让该测试通过所需的最小代码。
4. 运行该模块测试。
5. 运行全量 typecheck、lint、test、build。
6. 在 375×808 和桌面尺寸手工验证。
7. 更新对应开发文档和验收截图。
8. 单独提交，不夹带无关格式化或重构。

## 8. 最终验收清单

### Atlas

- [ ] 从图片任意非交互区域拖动都能平移。
- [ ] 滚轮以指针为中心缩放。
- [ ] 移动端双指缩放可用。
- [ ] 编辑器、预览、发布 HTML 的 hotspot/callout 偏差不超过 1px。
- [ ] hotspot/callout 外观与冻结基线一致。
- [ ] hotspot/callout 支持鼠标、触摸和键盘操作。
- [ ] 点击后出现对应分类的横向卡片。
- [ ] 滚动卡片会同步 active item 和镜头。
- [ ] reset、close、返回场景行为清晰且互不混淆。

### Catalog

- [ ] 三段 tab 固定且可切换。
- [ ] category/item 列表同步。
- [ ] camera 实际移动。
- [ ] focusRect 与全景内容对齐。
- [ ] scene 与转场可用。

### 编辑器与数据

- [ ] 同时修改知识、全景和配置后一次保存成功。
- [ ] 新增/删除/排序后 order 从 0 连续。
- [ ] undo/redo 不破坏 project schema。
- [ ] 当前项目可通过 release validation。
- [ ] 错误信息能定位到具体配置项。

### 发布与平台

- [ ] 一次发布生成两份独立 HTML。
- [ ] 断开后端后两份 HTML 仍可运行。
- [ ] 所有资产引用都在各自产物目录内。
- [ ] 转场的 cut/abort/timeout 均有测试。
- [ ] SceneBridge 不使用 `targetOrigin:'*'`。
- [ ] 初始化、曝光、点击、停留、分享只上报一次。
- [ ] 主程序无 AIGC key/config/module。

### 示例项目

- [ ] `guide_surface_validation_001` 的 34 个知识项完整。
- [ ] 7 个 category hotspot、16 个 item marker 与基线一致。
- [ ] 上游 HTML scene 和转场视频可用。
- [ ] Atlas/Catalog 均在 Chrome/Safari/Firefox 目标版本通过。

## 9. 明确不接受的实现方式

- 不允许分别为编辑器和 runtime 再写两套坐标公式。
- 不允许用增加 hit-test tolerance 掩盖定位偏移。
- 不允许用 `event.target === container` 判断是否可以平移。
- 不允许把旧 `SurfaceCard/SurfaceFocusLayer` 数据模型搬回 Domain。
- 不允许用任意 CSS 字符串恢复样式；必须是有限 token/variant。
- 不允许发布只有 manifest、没有真实入口和资产的“逻辑产物”。
- 不允许通过跳过测试、降低 validator 强度或手改 demo JSON 宣布验收完成。
- 不允许把项目实例名称、资源路径、股票跳转写进通用 runtime。

## 10. 里程碑

| 里程碑 | 包含阶段 | 可交付结果 |
|---|---|---|
| M1 Atlas 可操作 | A–B | 平移/缩放恢复，坐标完全统一 |
| M2 Atlas 体验恢复 | C–D | 样式和底部卡片达到旧版基线 |
| M3 可安全编辑与发布 | E–F | 原子保存，两份真实 HTML |
| M4 双产品功能闭环 | G–H | 场景、转场、埋点、Catalog 恢复 |
| M5 可量产 | I + 全量验收 | Skill 完整导入，遗留清理，样例回归通过 |

只有 M5 完成后，才可以把本轮重构标记为“完成”。

---

## 2026-07-06 追加修复记录（Atlas 缩放预览 / callout 锚点）

本轮根据用户反馈继续核对 `main` 分支旧 Surface runtime，确认并修复了三处之前遗漏的 Atlas 根因：

1. 预览区“看起来不能拖动”
   - 根因：`Camera.onPointerMove()` 的平移位移仍直接使用屏幕像素差值，没有像 wheel / pinch 那样换算回逻辑 viewport 像素。
   - 影响：在 `AtlasPreview` 的 CSS scale 缩放预览里，拖拽会被按比例削弱，用户感知为几乎拖不动。
   - 修复：按 `clientWidth / getBoundingClientRect().width` 与 `clientHeight / rect.height` 把拖拽位移换算回逻辑尺寸。
   - 文件：`src/products/atlas/runtime/camera.ts`

2. callout 圆点在 `markerPosition: 'bottom'` 时位置错误
   - 根因：runtime 和 editor 都把底部 marker 写成了 `column-reverse`，再叠加 children 顺序，视觉结果与旧版相反。
   - 影响：callout 的圆点会出现在错误一侧，编辑区和预览区更容易产生“看起来对不上”的错觉。
   - 修复：统一改回旧版语义——容器始终 `flex-direction: column`，仅通过 children append 顺序决定“marker 在上 / 在下”。
   - 文件：
     - `src/products/atlas/runtime/callout-renderer.ts`
     - `src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

3. 编辑区 callout 默认 gap 错误
   - 根因：编辑器里 `markerGapPx` 缺省时用了 `0`，而旧版默认值是 `6px`。
   - 影响：编辑区 marker 与 chip 贴得过近，和 runtime / 旧产物的默认视觉不一致。
   - 修复：缺省 gap 改回 `ATLAS_CALLOUT_GAP_PX`（6px），并保持 `0` 作为显式可配置值时仍可生效。
   - 文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

### 新增回归测试

- `tests/products/atlas/camera.test.ts`
  - 锁定“缩放预览中的 50px 拖拽 = 未缩放视图中的 100px 逻辑拖拽”。
- `tests/products/atlas/atlas-runtime.test.ts`
  - 锁定 bottom-marker callout 的 DOM 顺序与旧版一致（chip 在上、marker 在下）。

### 当前验证结果

- `npx tsx --test tests/products/atlas/camera.test.ts tests/products/atlas/atlas-runtime.test.ts tests/products/atlas/atlas-compiler.test.ts tests/products/atlas/panorama-projection.test.ts` ✅
- `npm test`（全量 144 项）✅

### 2026-07-06 二次追加（hotspot 点击后的首项聚焦链路）

根据用户截图继续核对后，又确认了一条会直接影响“点击 hotspot 后镜头、callout 高亮、卡片高亮是否一致”的问题链：

1. `compileAtlas()` 错误地把 `category.itemIds` 按 id 排序了
   - 影响：runtime 中“第一个 item”不再等于编辑器里用户排在第一位的 item。
   - 连带影响：底部卡片顺序、默认高亮项、点击 hotspot 后的默认聚焦目标都可能错。
   - 修复：Atlas compiler 改为保留 authored `itemIds` 顺序；category 顺序按 `order`，id 仅作为并列 tie-breaker。
   - 文件：`src/products/atlas/compiler/atlas-compiler.ts`

2. `AtlasRuntime.focusCategory()` 的点击链路曾被错误改成“二次聚焦首个 callout”
   - 根因：早期根据截图误判，把“hotspot 点击后的首项高亮”实现成了“镜头也必须再跳到首个 item / callout”。
   - 对照旧版 `main` 分支后确认：正确基线是先动画到 category 自己的 `viewport`，再选中首个 callout / card，但不再追加第二次镜头调度。
   - 影响：错误实现会造成点击 hotspot 后画面额外上移、抖动，用户会误以为底部浮层影响了全景图布局。
   - 修复：恢复为 `camera.animateTo(cat.viewport)`，同时保留首个 item 的高亮、callout 激活与卡片展开。
   - 文件：`src/products/atlas/runtime/atlas-runtime.ts`

3. 回归测试
   - `tests/products/atlas/atlas-compiler.test.ts`
     - 锁定 `itemIds` authored 顺序不得被 compiler 改写。
   - `tests/products/atlas/atlas-runtime.test.ts`
     - 锁定 `focusCategory()` 触发后，首个 callout / card 会成为 active。

### 更新后的验证结果

- `npx tsx --test tests/products/atlas/atlas-runtime.test.ts tests/products/atlas/atlas-compiler.test.ts` ✅
- `npm test`（全量 145 项）✅

### 2026-07-06 三次追加（点击副作用 / hotspot 样式对齐）

根据本轮继续比对 `main` 分支旧 runtime，又补上了两类容易在预览里表现成“点击后整体上移”或“编辑区与预览区形态不同”的遗漏：

1. 交互按钮缺少旧版同等的 `preventDefault`
   - 根因：当前 Atlas runtime/editor 的 hotspot、callout、drawer card、toolbar icon 只做了 `stopPropagation()`，没有像旧版那样同时 `preventDefault()`。
   - 风险：在缩放预览、按钮聚焦、浏览器默认 click/focus 行为叠加时，容易引入非业务的滚动/焦点副作用，看起来像是点击 hotspot 后画面被“顶上去”。
   - 修复：为 Atlas runtime 与编辑器中的相关 click handler 统一补回 `preventDefault() + stopPropagation()`。
   - 文件：
     - `src/products/atlas/runtime/marker-renderer.ts`
     - `src/products/atlas/runtime/callout-renderer.ts`
     - `src/products/atlas/runtime/card-drawer-controller.ts`
     - `src/products/atlas/runtime/atlas-runtime.ts`
     - `src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

2. 编辑器 hotspot / callout chip 没有完整复用 runtime 的布局约束
   - 根因：编辑器中的 chip 虽然复用了颜色和尺寸 token，但缺了 runtime 同样的 `display / alignItems / justifyContent / whiteSpace` 等按钮布局约束。
   - 影响：同一组 marker + chip 在编辑器与预览里会产生轻微形态偏差，尤其是圆点与文本气泡的相对观感不一致。
   - 修复：把 editor 侧 hotspot / callout chip 的按钮布局补齐到与 runtime 相同。
   - 文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

4. 2026-07-06 四次追加（hotspot DOM 结构继续对齐）
   - 继续比对后确认，编辑器与 runtime 的差异不只在 token，还在热点注释的 DOM 细节：
     - editor 的 marker 使用了额外的包裹层；
     - editor 的 hotspot / callout chip 缺少与旧 runtime 一致的 label 子节点结构；
     - editor 的 chip 缺少 `z-index`、`appearance reset`、精确的 overflow / ellipsis 约束。
   - 这类差异会让“同样的 21px marker + 36px chip”在视觉上仍然不完全一致，尤其体现在圆点相对文本气泡的位置和按钮外形上。
   - 修复：
     - 为 editor hotspot / callout chip 补上与 runtime 对齐的 label span 和布局样式；
     - 为按钮补上 `appearance: none`、`box-sizing: border-box`、`line-height: 0` 等约束；
     - 为 marker glyph 补上 `pointer-events / will-change / flex-shrink / line-height` 等稳定布局属性。
   - 文件：`src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

3. 底部抽屉隐藏位移动画回归旧版
   - 修复：drawer hidden transform 从 `translateY(100%)` 调回旧版的 `translateY(calc(100% + 20px))`，避免与旧产物动效基线继续分叉。
   - 文件：`src/products/atlas/runtime/card-drawer-controller.ts`

### 仍待继续核对

- 旧产物 `C:\Users\91252\Downloads\rocket\rocket` 的直接文件对照本轮因沙箱外读取审批额度问题未完成；当前仍以 `main` 分支旧 runtime 作为行为基线。
- 下一轮继续优先核对：
  - 顶部栏按钮交互细节
  - 底部卡片浮层与返回按钮位置
  - hotspot / callout 的 zoom 显隐切换时机
  - 预览与编辑器最终像素级对齐

### 2026-07-06 五次追加（双 zoom 语义 / 首个 callout 聚焦 / info 弹层 / hint 动效）

根据用户最新回归，再次把当前 Atlas runtime 与旧版行为逐项核对后，确认还缺 5 个收口点：

1. category 其实存在两套 zoom 语义，但 Atlas 链路只用上了一套
   - 现状：domain 已有 `CategorySpatialLayout.activationZoom`，用于“点击 hotspot 后默认聚焦首个 callout / item 时的 zoom”；同时 theme / item 上还存在 `hotspotMinZoom`、`calloutMinZoom`、`itemMarkerMinZoom`，用于显隐阈值。
   - 根因：`activationZoom` 只停留在 `project-types` / schema / normalizer 中，没有继续投影到 Atlas manifest，也没有暴露给 Atlas inspector。
   - 影响：编辑器里只能改“显示/隐藏”阈值，不能改单击 hotspot 后应放大到多少；runtime 也只能退回 `category.viewport.zoom` 或 item 自身默认值。
   - 修复：
     - `AtlasManifest.categories[]` 新增 `activationZoom?`
     - `compileAtlas()` 透传 `layout.activationZoom`
     - Atlas inspector 新增 3 组可编辑字段：
       - 全局 `theme.hotspotMinZoom`
       - 全局 `theme.calloutMinZoom`
       - 分类级 `activationZoom`（UI 文案为 `callout zoom`）
       - item 级 `callout.minZoom`
   - 文件：
     - `src/products/atlas/contract/atlas-manifest.ts`
     - `src/products/atlas/compiler/atlas-compiler.ts`
     - `src/admin/src/features/atlas-editor/components/AtlasInspector.tsx`

2. 点击 hotspot 时镜头没有跟随默认高亮的首个 callout / item
   - 现状：`AtlasRuntime.focusCategory()` 会打开抽屉、默认选中首条 item、点亮首个 callout/card，但镜头仍只跳到 `category.viewport`，没有同步对准默认高亮项。
   - 影响：用户看到“高亮的是第一条 callout / 卡片，但镜头落点不是它”，三者不同步。
   - 修复：`focusCategory()` 改为：
     - 先取 category authored 顺序中的第一条 item；
     - 以该 item 的 `viewportOverride.centerX/centerY` 为优先中心，否则退回 item marker；
     - zoom 使用 `category.activationZoom`，没有显式配置时再退回 item viewport zoom / category viewport zoom。
   - 文件：`src/products/atlas/runtime/atlas-runtime.ts`

3. 顶部小图标弹层文案仍是重构后的简化 fallback，不是旧版内容
   - 现状：Atlas runtime 里的 `INFO_SHEET_DEFAULT_SECTIONS` 被简化成了两段通用说明。
   - 影响：即便图标能点开，弹层内容也与旧版产物不一致。
   - 修复：先把 fallback 文案恢复到旧版默认内容，确保在尚未做“项目级可配置化”之前，runtime 行为与旧版一致。
   - 文件：`src/products/atlas/runtime/atlas-runtime.ts`

4. 底部 hint 只有静态箭头，没有旧版流光动画
   - 现状：`<<< 拖动或缩放探索全景图 >>>` 结构已恢复，但箭头只是一排静态字符。
   - 修复：为 6 个箭头 span 注入独立 keyframes 与 staggered delay，恢复旧版的轻量流光/呼吸节奏。
   - 文件：`src/products/atlas/runtime/atlas-runtime.ts`

5. 右下“返回总图”按钮需要继续贴近旧版 chrome
   - 现状：按钮结构已在 runtime 中，但 inner SVG 尺寸与旧版不完全对齐。
   - 修复：把悬浮返回按钮内的 SVG 强制锁到旧版的 16×13，保持右下方按钮的最终视觉比例一致。
   - 文件：`src/products/atlas/runtime/atlas-runtime.ts`

### 本轮新增回归测试

- `tests/products/atlas/atlas-compiler.test.ts`
  - 锁定 `activationZoom` 会被 compiler 正确投影到 manifest。
- `tests/products/atlas/atlas-runtime.test.ts`
  - 锁定 `focusCategory()` 点击后，camera 会以“首个默认高亮 item 的中心 + category.activationZoom”作为目标视口。

### 本轮验证结果

- `npm test -- tests/products/atlas/atlas-runtime.test.ts tests/products/atlas/atlas-compiler.test.ts` ✅
- `npx tsc -b` ✅

### 2026-07-06 六次追加（右下返回按钮常驻 / item 双击改名）

根据最新回归，又补上两处之前“看起来像细节、但实际直接影响可用性”的问题：

1. 右下“返回初始状态 / 返回总图”按钮不应依赖底部卡片抽屉
   - 现状：重构后的 Atlas runtime 把该按钮做成了“仅抽屉打开时显示”，这和旧版 `main:src/runtime/player-core/player-host.ts` 的 chrome 语义不一致。
   - 旧版基线：该按钮是独立 chrome，一直存在；当底部浮层打开时，它只会上移到浮层上方，而不是整颗按钮消失/出现。
   - 修复：`updateFloatingBackButton()` 改为常驻显示，仅根据 drawer 高度动态调整 `bottom` 偏移。
   - 文件：`src/products/atlas/runtime/atlas-runtime.ts`

2. item / callout 缺少双击改名链路
   - 现状：StructurePanel 中 category 已支持双击改名，但 item 没有；AtlasCanvas 中 callout chip 也只有单击选中，没有任何 rename 入口。
   - 影响：用户在画布上双击 “新项目” callout 无法直接改名，导致与 category 的交互习惯不一致。
   - 修复：
     - `AtlasEditor` 新增 `handleRenameItem()`
     - `StructurePanel` 的 item 行补上双击 inline rename
     - `AtlasCanvas` 的 callout chip 补上双击 inline rename，支持 Enter 提交 / Escape 取消 / blur 提交
   - 文件：
     - `src/admin/src/features/atlas-editor/components/AtlasEditor.tsx`
     - `src/admin/src/features/atlas-editor/components/StructurePanel.tsx`
     - `src/admin/src/features/atlas-editor/components/AtlasCanvas.tsx`

### 本轮补充验证

- `tests/products/atlas/atlas-runtime.test.ts`
  - 新增回归：锁定 floating back button 在 drawer 未打开时也保持可见。
- `npm test -- tests/products/atlas/atlas-runtime.test.ts` ✅
- `npx tsc -b` ✅
