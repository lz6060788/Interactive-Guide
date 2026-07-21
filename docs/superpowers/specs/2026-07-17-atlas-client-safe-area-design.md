# Atlas 客户端顶部安全区修复设计

## 背景与旧版依据

Atlas 全景页面在客户端 WebView 内打开时，页面顶部工具栏与系统状态栏发生重叠。

旧版 Atlas 产物通过两部分共同启用 iOS WebView 安全区：

- HTML viewport 声明包含 `viewport-fit=cover`。
- 顶层 Chrome 使用 `env(safe-area-inset-top, 0px)` 作为安全区高度，并在标题、返回和分享控件的原有顶部偏移之外统一叠加该高度。

当前产物的 viewport 缺少 `viewport-fit=cover`，共享顶部工具栏也仅使用固定的 `16px` 顶部偏移，没有消费 `safe-area-inset-top`，因此客户端覆盖式系统状态栏会与页面工具栏重叠。

## 目标

- 恢复旧版基于 CSS safe area 的客户端避让行为。
- Atlas 全景和 Atlas HTML Scene 使用同一套安全区逻辑。
- 不改变当前顶部导航栏各按钮之间的相对布局和视觉规格。
- 普通浏览器或安全区为零的设备上，顶部导航栏布局与修改前保持一致。

## 实现方案

### 产物 viewport

在统一 HTML 产物外壳的 viewport 声明中加入 `viewport-fit=cover`：

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, viewport-fit=cover"
/>
```

该声明只允许页面使用设备安全区信息，不直接修改页面尺寸、相机边界或全景图编排。

### 共享工具栏安全区

共享 `HostToolbarDomController` 定义顶部安全区 CSS 变量：

```css
--host-toolbar-safe-area-top: env(safe-area-inset-top, 0px);
```

返回按钮、标题与说明图标容器、分享按钮继续保留当前 `16px` 内部顶部偏移，只在其外统一叠加安全区：

```css
top: calc(var(--host-toolbar-safe-area-top) + 16px);
```

三个顶部定位点必须使用同一个表达式，禁止为不同按钮设置不同的安全区补偿值。

### 顶部导航栏位置不变约束

本次不修改以下内容：

- 返回按钮的 `left`、宽高和 SVG 尺寸。
- 标题容器继续以 `left: 50%` 为中心锚点；最大宽度、标题字体和说明图标间距保持不变。根据运行时视觉复核，仅允许整体增加 `4px` 向右光学补偿。
- 分享按钮的 `right`、宽高和 SVG 尺寸。
- 各按钮的点击区域、层级、颜色和交互逻辑。
- Atlas 相机、全景图容器、hotspot、callout 和底部卡片布局。

当 `safe-area-inset-top = 0px` 时，所有顶部控件的最终坐标必须与修改前完全一致；当安全区非零时，三个顶部定位点只允许增加相同的纵向偏移。

### 顶部渐变

共享工具栏启用顶部渐变时，渐变覆盖范围应包含安全区，避免安全区内出现未覆盖的色带。渐变内容的原有高度和视觉参数保持不变，只扩展容器高度：

```css
height: calc(96px + var(--host-toolbar-safe-area-top));
```

Atlas 全景当前传入 `showGradient: false`，本次不改变该产品配置，因此不会重新显示已关闭的顶部渐变。

## 范围边界

- 不通过 F10Utils、Falcon Bridge 或其他客户端 API 读取状态栏高度。
- 不增加固定的 20px、44px 等设备补偿值。
- 不修改 Catalog 自有场景导航和 Catalog 画面布局。
- 不修改底部 `safe-area-inset-bottom`；该问题不在本轮范围内。

## 异常与降级

不支持 CSS safe area 的浏览器会使用 `env(..., 0px)` 的回退值，行为等同修改前。安全区不依赖异步客户端调用，因此不会产生导航栏加载后跳动，也不会因 Falcon 接口不可用而报错。

## 验收标准

- 导出 Atlas HTML 的 viewport 包含 `viewport-fit=cover`。
- 安全区非零时，顶部返回、标题/说明图标、分享按钮整体下移且不再与系统栏重叠。
- 三个顶部定位点增加完全相同的安全区偏移，相互位置不变。
- 安全区为零时，各按钮的 top、left/right、尺寸和间距与修改前一致。
- Atlas 全景与 Atlas HTML Scene 的共享顶部工具栏行为一致。
- 全景图相机范围、拖动缩放、hotspot/callout 定位和底部浮层不受影响。
- 相关运行时测试、导出产物测试和 ES5 构建校验通过。

## 实施结果（2026-07-17）

- 统一产物外壳的 viewport 已增加 `viewport-fit=cover`，iOS 客户端 WebView 可以提供顶部安全区值。
- 共享 `HostToolbarDomController` 已在自身 Chrome 层定义 `--host-toolbar-safe-area-top`；返回按钮、标题/说明图标容器与分享按钮复用同一个 `calc(... + 16px)` 顶部表达式。
- 顶部渐变容器只扩展安全区高度；Atlas 全景仍保持 `showGradient: false`，不会因本次修复重新显示顶部渐变。
- 回归测试锁定了返回按钮的 `left: 16px` 与 `32px` 尺寸、分享按钮的 `right: 16px` 与 `24px` 尺寸，并验证三个顶部定位点使用完全相同的安全区偏移。
- 标题与说明图标组合保持 `left: 50%` 中心锚点，并统一向右增加 `4px` 光学补偿；组合内部 DOM、间距、尺寸以及两侧按钮位置均未改变。
- 定向测试 14/14、完整测试 187/187 通过；TypeScript 类型检查、Server 构建和 Admin 构建均通过。预览/发布路由测试继续使用 Acorn ES5 parser 校验最终 `app.js`。
