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
- 标题容器的水平居中方式、最大宽度、标题字体和说明图标间距。
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
