# HTML SceneBridge 协议与接入指南

## 1. 背景与目标

> 2026-07-07 更新：当前项目已经不再使用旧 `interactive-guide:html-node-bridge`。实际生效协议为 `SceneBridge v1.0.0`，代码落点是 `src/platform/scene-bridge/scene-bridge.ts`。下文已经按当前 Atlas/Catalog 双产品架构修正为新协议语义。

当前运行时已经支持两类场景内容：

- 全景场景：由产品 runtime 直接渲染与导航。
- HTML Scene：通过 `iframe` 承载独立 HTML 页面，再由宿主层统一管理显示、激活与切换时序。

随着 HTML Scene 承担更多交互逻辑，需要建立一套稳定、可扩展、与产品 runtime 解耦的通信协议。当前阶段优先落地三个核心能力：

1. HTML Scene 可以通知宿主返回上一个全景状态。
2. 宿主切换到 HTML Scene 后，可以通知该 Scene 执行初始化或退出逻辑。
3. HTML Scene 可以把 routeId 交给宿主，由宿主统一执行路线跳转。

本设计遵循以下原则：

- 产品 runtime 只负责导航状态、转场和顶层 UI，不感知 `postMessage` 细节。
- Scene 宿主层只作为 iframe 协调层，通过独立 bridge 模块承接 HTML Scene 通信。
- 通信协议采用统一消息信封，后续新增命令时不需要重做整套链路。
- HTML Scene 只依赖浏览器标准 `window.postMessage`，不强依赖运行时内部对象。

## 2. 模块分层

### 2.1 运行时职责

- 产品 Runtime
  - 维护当前 viewport、active scene、route transition 等运行时状态。
  - 提供 `openRoute()`、`dismissTransientExperience()` 等导航能力。
  - 不直接监听 `window.message`。

- Scene Host
  - 负责 `iframe` 生命周期、显示隐藏、加载就绪判断。
  - 在 HTML Scene 真正成为当前可交互场景后，触发 bridge 发送初始化事件。
  - 接收 bridge 回调，再委托给产品 runtime 执行返回或 route 打开。

- `SceneBridge`
  - 独立封装协议常量、消息解析、来源校验、request/response 分发。
  - 暴露统一的 envelope / targetOrigin / 类型定义。
  - 保证协议扩展时，宿主层不需要继续堆积零散的 `window.message` 分支。

### 2.2 当前落点

- 通信模块：`src/platform/scene-bridge/scene-bridge.ts`
- Atlas 预览宿主接入：`src/admin/src/features/atlas-editor/components/AtlasPreview.tsx`

## 3. 协议设计

### 3.1 统一消息信封

所有正式消息都使用统一 envelope：

```ts
interface SceneBridgeEnvelope<TType extends string = string, TPayload = unknown> {
  channel: 'interactive-guide:scene-bridge'
  version: '1.0.0'
  source: 'interactive-guide-host' | 'interactive-guide-scene'
  kind: 'event' | 'request' | 'response'
  type: TType
  requestId?: string
  payload?: TPayload
}
```

字段说明：

- `channel`
  - 协议通道名，用于和其他 `postMessage` 流量隔离。
- `version`
  - 协议版本，当前为 `1.0.0`。
- `source`
  - 消息发送方标识。
- `kind`
  - `event` 表示单向事件。
  - `request` 表示带期望回包的请求。
  - `response` 表示对某个请求的响应。
- `type`
  - 具体消息类型，采用命名空间风格，便于扩展。
- `requestId`
  - 请求-响应关联 ID，仅 `request/response` 需要。
- `payload`
  - 类型化消息体。

### 3.2 当前已实现的消息类型

#### A. 宿主 -> HTML Scene

`host:init`

用途：

- 当 HTML Scene 成为当前可交互场景时，通知页面执行初始化逻辑。
- 该事件会在每次“进入该 HTML Scene”时重新发送一次，而不是只在 iframe 首次 load 时发送。
- 这样可以兼容 iframe 缓存复用场景，避免页面只初始化一次导致二次进入状态错误。

消息体：

```ts
interface SceneBridgeInitPayload {
  activationId: string
  sessionId: string
  product: 'atlas' | 'catalog'
  scene: {
    id: string
    title: string
    entryUrl: string
  }
  runtime: {
    product: 'atlas' | 'catalog'
    projectId: string
    sceneId: string
    viewId: string
  }
}
```

字段说明：

- `activationId`
- 当前这次进入 HTML Scene 的激活 ID。
- 同一个 iframe 被反复进入时会变化，HTML 页面可据此判断是否需要重置内部状态。
- `sessionId`
  - 宿主实例 ID，用于后续扩展多实例调试或埋点。
- `scene`
  - 当前 HTML Scene 的基础信息。
- `runtime`
  - 当前运行时状态摘要，方便 HTML Scene 按需显示当前产品、项目和视图上下文。

#### B. HTML Scene -> 宿主

`scene:request-back`

用途：

- HTML Scene 请求宿主返回全景场景。
- 最终仍然走产品 runtime 的关闭 / 返回链路，不绕过既有导航逻辑。

请求体：

```ts
interface SceneBridgeBackRequestPayload {}
```

语义说明：

- 当前 AtlasPreview 实现里，`scene:request-back` 是单向请求：宿主收到后直接关闭 iframe scene，并向场景回发 `host:exit`。

`scene:request-route`

用途：

- HTML Scene 把 routeId 交给宿主执行跳转。
- 页面本身不直接修改顶层 `window.location`，从而保持与运行时宿主解耦。
- 适用于从 scene 请求进入另一个场景或路线的场景。

请求体：

```ts
interface SceneBridgeRouteRequestPayload {
  routeId: string
  openMode?: 'current-tab' | 'new-tab'
}
```

语义说明：

- `routeId`
  - HTML Scene 希望宿主打开的路线 ID，由 Atlas/Catalog runtime 在 manifest 里解析。
- `openMode`
  - `current-tab` 表示优先在当前页跳转。
  - `new-tab` 表示优先由宿主新开页。

### 3.3 兼容策略

当前 demo scene 已经直接迁移到新协议，不再保留旧 `interactive-guide:html-node-bridge` 兼容层。新接入请直接使用 `SceneBridge v1.0.0`。

## 4. 生命周期与时序

### 4.1 HTML 节点初始化时机

`host:init` 不是在 iframe `load` 事件一触发就发送，而是在以下条件同时满足后发送：

1. 当前产品当前激活内容为 HTML Scene
2. 对应 iframe 已加载完成
3. 当前不处于切换动画遮挡阶段
4. 该 iframe 已被宿主判定为当前激活节点

这样做的原因：

- 可以避免转场尚未结束时，HTML 页面提前执行动效或读尺寸，拿到错误的可视区域。
- 可以兼容缓存 iframe 的复用场景，确保“每次进入节点”都能收到一次明确的初始化信号。

### 4.2 返回请求时机

HTML 页面在任意用户操作后都可以发 `scene:request-back`。宿主会先校验消息来源是否为当前激活 iframe，再决定是否关闭 scene overlay 并回发 `host:exit`。

## 5. 实现要点

### 5.1 解耦方式

本次实现没有让产品 runtime 直接依赖具体 scene 代码，而是采用：

```text
HTML iframe
  -> SceneBridge
  -> Scene Host
  -> Product Runtime
```

这样带来的好处：

- 协议层变化不会污染核心导航内核。
- 未来新增 `scene:request-focus-item`、`scene:event-ready`、`host:update-context` 等能力时，只需要扩展 bridge。
- 未来继续新增业务动作时，HTML 页面只需要继续发正式协议请求，不需要直接依赖宿主实现细节。
- 预览模式与独立运行时模式天然复用同一套桥接逻辑，因为它们都共用 `SceneBridge`。

### 5.2 消息来源校验

`SceneBridge` 会校验：

- `channel` 是否为 `interactive-guide:scene-bridge`
- `version` 是否为 `1.0.0`
- `source` 是否为约定值
- `event.source` 是否等于当前激活 iframe 的 `contentWindow`

因此：

- 非当前节点的 iframe 不能误触发宿主导航
- 页面上其他脚本发出的无关 `postMessage` 不会污染运行时

### 5.3 初始化去重

宿主会给每次进入 HTML Scene 生成新的 `activationId`。bridge 只在新的激活周期内发一次 `host:init`，避免同一轮渲染重复下发初始化事件。

## 6. HTML 节点接入指南

### 6.1 最小接入方式

HTML 页面只需要监听父窗口消息，并在需要时调用 `window.parent.postMessage()`。

推荐先封装一个轻量 helper：

```html
<script>
  const CHANNEL = 'interactive-guide:scene-bridge'
  const VERSION = '1.0.0'
  const HTML_SOURCE = 'interactive-guide-scene'

  function buildEnvelope(kind, type, payload, requestId) {
    return {
      channel: CHANNEL,
      version: VERSION,
      source: HTML_SOURCE,
      kind,
      type,
      requestId,
      payload,
    }
  }

  function createRequestId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}-${window.crypto.randomUUID()}`
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
<\/script>
```

### 6.2 监听初始化事件

```html
<script>
  let currentActivationId = null

  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || data.channel !== 'interactive-guide:scene-bridge') return
    if (data.version !== '1.0.0') return
    if (data.source !== 'interactive-guide-host') return
    if (data.kind !== 'event') return

    if (data.type === 'host:init') {
      currentActivationId = data.payload?.activationId ?? null

      const runtime = data.payload?.runtime
      const scene = data.payload?.scene

      console.log('HTML Scene 初始化', {
        activationId: currentActivationId,
        sceneId: scene?.id,
        product: runtime?.product,
      })

      initHtmlNode(data.payload)
    }
  })

  function initHtmlNode(payload) {
    // 在这里做每次进入节点都需要执行的事情：
    // 1. 重置滚动位置
    // 2. 重启节点内动画
    // 3. 根据 runtime.product / viewId 刷新顶部状态
    // 4. 拉起节点内局部数据初始化
  }
<\/script>
```

### 6.3 请求返回上一节点

```html
<script>
  function requestBack(reason = 'html-ui-back-button') {
    const requestId = createRequestId('html-back')

    return new Promise((resolve, reject) => {
      const handleMessage = (event) => {
        const data = event.data
        if (!data || data.channel !== 'interactive-guide:scene-bridge') return
        if (data.version !== '1.0.0') return
        if (data.source !== 'interactive-guide-host') return
        if (data.kind !== 'event') return
        if (data.type !== 'host:exit') return

        window.removeEventListener('message', handleMessage)

        resolve(data.payload)
      }

      window.addEventListener('message', handleMessage)

      window.parent.postMessage(
        buildEnvelope('request', 'scene:request-back', { reason }, requestId),
        '*',
      )
    })
  }

  async function onBackButtonClick() {
    const result = await requestBack()
    console.log('scene 已收到宿主退出事件', result)
  }
<\/script>
```

### 6.4 接入建议

- 把“场景进入初始化”逻辑统一放到 `host:init` 里，不要只依赖页面首次 `DOMContentLoaded`。
- 如果页面里有自定义返回按钮，统一调用 `scene:request-back`，不要自己猜测宿主 URL。
- 如果页面里有业务跳转入口，统一调用 `scene:request-route`，由宿主决定如何解析 routeId。
- 页面内部如果有定时器、视频、动画状态，建议在每次 `host:init` 时做一次显式重置，并在 `host:exit` 时收尾。

## 7. 后续可扩展方向

当前协议已经为以下能力预留了扩展空间：

- `scene:request-focus-item`
  - HTML Scene 请求宿主高亮某个知识项。
- `scene:request-get-runtime-state`
  - HTML Scene 主动拉取当前运行时摘要。
- `scene:event-ready`
  - HTML Scene 声明“场景内部资源已就绪”，供宿主决定是否继续交互或清理 loading。
- `host:update-context`
  - 宿主在不重进节点的情况下，向 HTML 页面推送运行时上下文变更。

扩展时只需：

1. 在 `scene-bridge.ts` 中新增消息类型与 payload 类型。
2. 在 bridge 的 request 分发中增加处理器。
3. 在文档中补充消息契约。

不需要直接修改产品 runtime 的核心状态机设计。

## 8. 本次实现结论

本次方案已经实现：

- HTML Scene 通过正式协议请求“返回全景”
- HTML Scene 通过正式协议把 routeId 交给宿主执行跳转
- 宿主在切换到 HTML Scene 后发送初始化事件，并在退出时发送 `host:exit`
- 协议封装为独立 bridge 模块，避免通信逻辑和渲染核心耦合
- demo scene 已直接迁移到新协议，不再保留旧 bridge 兼容层

这为后续扩展 HTML 富交互场景打下了稳定基础，同时仍然保持 scene 宿主层与产品 runtime 的分层边界不被破坏。
