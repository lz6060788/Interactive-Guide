# HTML节点通信协议与接入指南

## 1. 背景与目标

当前运行时已经支持两类节点内容：

- 图片节点：由 `PlayerHost + PlayerCore` 直接渲染与导航。
- HTML 节点：通过 `iframe` 承载独立 HTML 页面，再由宿主层统一管理显示、热点与切换时序。

随着 HTML 节点承担更多交互逻辑，需要建立一套稳定、可扩展、与渲染核心解耦的通信协议。当前阶段优先落地两个核心能力：

1. HTML 节点可以通知运行时返回到当前节点的上一个节点。
2. 运行时切换到 HTML 节点后，可以通知该 HTML 节点执行初始化逻辑。
3. HTML 节点可以把业务路由地址交给宿主，由宿主统一执行页面跳转。

本设计遵循以下原则：

- `PlayerCore` 只负责导航状态机与转场内核，不感知 `postMessage` 细节。
- `PlayerHost` 只作为宿主协调层，通过独立 bridge 模块承接 HTML 通信。
- 通信协议采用统一消息信封，后续新增命令时不需要重做整套链路。
- HTML 节点只依赖浏览器标准 `window.postMessage`，不强依赖运行时内部对象。

## 2. 模块分层

### 2.1 运行时职责

- `PlayerCore`
  - 维护 `currentNodeId / history / transition` 等运行时状态。
  - 提供 `handleBack()`、`handleHotspotClick()` 等导航能力。
  - 不直接监听 `window.message`。

- `PlayerHost`
  - 负责 `iframe` 生命周期、显示隐藏、加载就绪判断。
  - 在 HTML 节点真正成为当前可交互节点后，触发 bridge 发送初始化事件。
  - 接收 bridge 回调，再委托给 `PlayerCore.handleBack()` 等核心能力。

- `HtmlNodeBridge`
  - 独立封装协议常量、消息解析、来源校验、request/response 分发。
  - 只暴露 `syncActiveNode()` / `clearActiveNode()` 等宿主级 API。
  - 保证协议扩展时，`PlayerHost` 不需要继续堆积零散的 `window.message` 分支。

### 2.2 当前落点

- 通信模块：`src/runtime/player-core/html-node-bridge.ts`
- 宿主接入：`src/runtime/player-core/player-host.ts`

## 3. 协议设计

### 3.1 统一消息信封

所有正式消息都使用统一 envelope：

```ts
interface HtmlNodeBridgeEnvelope<TType extends string = string, TPayload = unknown> {
  channel: 'interactive-guide:html-node-bridge'
  version: '1.0.0'
  source: 'interactive-guide-host' | 'interactive-guide-html-node'
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

#### A. 宿主 -> HTML 节点

`host:node-init`

用途：

- 当 HTML 节点成为当前可交互节点时，通知页面执行初始化逻辑。
- 该事件会在每次“进入该 HTML 节点”时重新发送一次，而不是只在 iframe 首次 load 时发送。
- 这样可以兼容 iframe 缓存复用场景，避免页面只初始化一次导致二次进入状态错误。

消息体：

```ts
interface HtmlNodeInitPayload {
  activationId: string
  sessionId: string
  node: {
    id: string
    title: string
    htmlUrl?: string
    imageUrl?: string
    contentType?: 'image' | 'html'
  }
  runtime: {
    currentNodeId: string
    historyDepth: number
    canGoBack: boolean
  }
}
```

字段说明：

- `activationId`
  - 当前这次进入 HTML 节点的激活 ID。
  - 同一个 iframe 被反复进入时会变化，HTML 页面可据此判断是否需要重置内部状态。
- `sessionId`
  - 宿主实例 ID，用于后续扩展多实例调试或埋点。
- `node`
  - 当前节点的基础信息。
- `runtime`
  - 当前运行时状态摘要，方便 HTML 节点按需显示“是否可返回”等 UI。

#### B. HTML 节点 -> 宿主

`html:request-back`

用途：

- HTML 节点请求运行时返回历史栈中的上一节点。
- 最终仍然走 `PlayerCore.handleBack()`，不会绕过运行时既有导航链路。

请求体：

```ts
interface HtmlNodeBackRequestPayload {
  reason?: string
}
```

响应体：

```ts
{
  ok: boolean
  payload: {
    handled: boolean
    runtime: {
      currentNodeId: string
      historyDepth: number
      canGoBack: boolean
    }
  } | {
    message: string
  }
}
```

语义说明：

- `ok = true`
  - 表示宿主已经成功处理该请求。
- `payload.handled = false`
  - 表示请求本身合法，但当前没有上一节点可退回。
- `ok = false`
  - 表示宿主处理过程出现异常。

`html:request-route`

用途：

- HTML 节点把业务路由地址交给宿主执行跳转。
- 页面本身不直接修改顶层 `window.location`，从而保持与运行时宿主解耦。
- 适用于点击股票标的、业务卡片等需要跳出当前节点上下文的场景。

请求体：

```ts
interface HtmlNodeRouteRequestPayload {
  route: string
  reason?: string
  openMode?: 'current-tab' | 'new-tab'
}
```

响应体：

```ts
{
  ok: boolean
  payload: {
    handled: boolean
    route: string
    openMode: 'current-tab' | 'new-tab'
  } | {
    message: string
  }
}
```

语义说明：

- `route`
  - HTML 页面希望宿主打开的业务路由，既可以是绝对 URL，也可以是如 `client.html?...` 这样的宿主内路由地址。
- `openMode`
  - `current-tab` 表示优先在当前页跳转。
  - `new-tab` 表示优先由宿主新开页。
- `payload.handled = false`
  - 表示宿主收到请求，但由于策略限制或浏览器拦截等原因，没有真正执行跳转。

### 3.3 兼容策略

为避免已有 HTML 节点立即失效，运行时仍兼容旧消息：

```ts
{ type: 'hotspot-click', edgeId: string }
```

该旧消息依然只对“当前激活中的 HTML iframe”生效。后续新接入建议统一迁移到正式协议 envelope。

## 4. 生命周期与时序

### 4.1 HTML 节点初始化时机

`host:node-init` 不是在 iframe `load` 事件一触发就发送，而是在以下条件同时满足后发送：

1. 当前节点的 `contentType === 'html'`
2. 对应 iframe 已加载完成
3. 当前不处于切换动画遮挡阶段
4. 该 iframe 已被宿主判定为当前激活节点

这样做的原因：

- 可以避免转场尚未结束时，HTML 页面提前执行动效或读尺寸，拿到错误的可视区域。
- 可以兼容缓存 iframe 的复用场景，确保“每次进入节点”都能收到一次明确的初始化信号。

### 4.2 返回请求时机

HTML 页面在任意用户操作后都可以发 `html:request-back`。宿主会先校验消息来源是否为当前激活 iframe，再决定是否调用 `PlayerCore.handleBack()`。

如果当前没有历史栈可回退：

- 不报错
- 返回 `ok: true`
- 但 `handled: false`

## 5. 实现要点

### 5.1 解耦方式

本次实现没有让 `PlayerCore` 直接依赖 `window` 或 `postMessage`，而是采用：

```text
HTML iframe
  -> HtmlNodeBridge
  -> PlayerHost
  -> PlayerCore
```

这样带来的好处：

- 协议层变化不会污染核心导航内核。
- 未来新增 `html:request-navigate-by-edge`、`html:report-ready`、`host:update-context` 等能力时，只需要扩展 bridge。
- 未来继续新增业务动作时，HTML 页面只需要继续发正式协议请求，不需要直接依赖宿主实现细节。
- 预览模式与独立运行时模式天然复用同一套桥接逻辑，因为它们都共用 `PlayerHost`。

### 5.2 消息来源校验

`HtmlNodeBridge` 会校验：

- `channel` 是否为 `interactive-guide:html-node-bridge`
- `version` 是否为 `1.0.0`
- `source` 是否为约定值
- `event.source` 是否等于当前激活 iframe 的 `contentWindow`

因此：

- 非当前节点的 iframe 不能误触发宿主导航
- 页面上其他脚本发出的无关 `postMessage` 不会污染运行时

### 5.3 初始化去重

宿主会给每次进入 HTML 节点生成新的 `activationId`。bridge 只在新的激活周期内发一次 `host:node-init`，避免同一轮渲染重复下发初始化事件。

## 6. HTML 节点接入指南

### 6.1 最小接入方式

HTML 页面只需要监听父窗口消息，并在需要时调用 `window.parent.postMessage()`。

推荐先封装一个轻量 helper：

```html
<script>
  const CHANNEL = 'interactive-guide:html-node-bridge'
  const VERSION = '1.0.0'
  const HTML_SOURCE = 'interactive-guide-html-node'

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
    if (!data || data.channel !== 'interactive-guide:html-node-bridge') return
    if (data.version !== '1.0.0') return
    if (data.source !== 'interactive-guide-host') return
    if (data.kind !== 'event') return

    if (data.type === 'host:node-init') {
      currentActivationId = data.payload?.activationId ?? null

      const runtime = data.payload?.runtime
      const node = data.payload?.node

      console.log('HTML 节点初始化', {
        activationId: currentActivationId,
        nodeId: node?.id,
        canGoBack: runtime?.canGoBack,
      })

      initHtmlNode(data.payload)
    }
  })

  function initHtmlNode(payload) {
    // 在这里做每次进入节点都需要执行的事情：
    // 1. 重置滚动位置
    // 2. 重启节点内动画
    // 3. 根据 runtime.canGoBack 刷新返回按钮状态
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
        if (!data || data.channel !== 'interactive-guide:html-node-bridge') return
        if (data.version !== '1.0.0') return
        if (data.source !== 'interactive-guide-host') return
        if (data.kind !== 'response') return
        if (data.type !== 'html:request-back') return
        if (data.requestId !== requestId) return

        window.removeEventListener('message', handleMessage)

        if (data.payload?.ok === false) {
          reject(new Error(data.payload?.payload?.message || '返回失败'))
          return
        }

        resolve(data.payload?.payload)
      }

      window.addEventListener('message', handleMessage)

      window.parent.postMessage(
        buildEnvelope('request', 'html:request-back', { reason }, requestId),
        '*',
      )
    })
  }

  async function onBackButtonClick() {
    const result = await requestBack()
    if (!result?.handled) {
      console.log('当前没有可返回的上一节点')
    }
  }
<\/script>
```

### 6.4 接入建议

- 把“节点进入初始化”逻辑统一放到 `host:node-init` 里，不要只依赖页面首次 `DOMContentLoaded`。
- 如果页面里有自定义返回按钮，统一调用 `html:request-back`，不要自己猜测上一节点 URL。
- 如果页面里有业务跳转入口，统一调用 `html:request-route`，由宿主决定当前页跳转还是新开页。
- 如果页面内部已经有热点跳转逻辑，短期仍可沿用旧 `hotspot-click`，但新页面建议逐步迁移到正式 envelope 协议。
- 页面内部如果有定时器、视频、动画状态，建议在每次 `host:node-init` 时做一次显式重置。

## 7. 后续可扩展方向

当前协议已经为以下能力预留了扩展空间：

- `html:request-navigate-by-edge`
  - HTML 页面按 edgeId 请求沿现有边导航。
- `html:request-get-runtime-state`
  - HTML 页面主动拉取当前运行时摘要。
- `html:event-ready`
  - HTML 页面声明“节点内部资源已就绪”，供宿主决定是否继续交互或清理 loading。
- `host:update-context`
  - 宿主在不重进节点的情况下，向 HTML 页面推送运行时上下文变更。

扩展时只需：

1. 在 `html-node-bridge.ts` 中新增消息类型与 payload 类型。
2. 在 bridge 的 request 分发中增加处理器。
3. 在文档中补充消息契约。

不需要直接修改 `PlayerCore` 的状态机设计。

## 8. 本次实现结论

本次方案已经实现：

- HTML 节点通过正式协议请求“返回上一节点”
- HTML 节点通过正式协议把业务路由交给宿主执行跳转
- 运行时在切换到 HTML 节点后发送初始化事件
- 协议封装为独立 bridge 模块，避免通信逻辑和渲染核心耦合
- 保留旧 `hotspot-click` 兼容入口，降低已有页面迁移成本

这为后续扩展 HTML 富交互节点打下了稳定基础，同时仍然保持 `PlayerHost` 与 `PlayerCore` 的分层边界不被破坏。
