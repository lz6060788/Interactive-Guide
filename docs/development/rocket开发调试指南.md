# rocket.html 开发调试指南

## 问题背景

`rocket.html` 设计为在 iframe 中由宿主应用加载，存在两个导致无法直接调试的问题：

1. **相对路径依赖**：通过 `./lib/three.module.js` 等相对路径加载 Three.js 模块，直接双击打开文件会因 CORS / 协议限制导致 ES module import 失败。
2. **初始化依赖 postMessage**：入场动画由宿主通过 `SceneBridge v1.0.0` 发送 `host:init` 消息触发。没有宿主，火箭始终停留在屏幕底部的 `idle` 状态，无法交互。

## 方案概览

- 本地静态服务器解决路径问题
- 临时注入一段代码，通过 URL 参数 `?debug` 自动触发入场动画
- 调试完成后移除注入代码即可还原

---

## 1. 启动静态服务器

rocket.html 所在目录下需包含 `lib/` 文件夹（Three.js 依赖）。在该目录下启动 HTTP 服务器，任选一种：

```bash
# Python（推荐，系统自带）
cd <rocket.html 所在目录>
python -m http.server 8789

# Node.js
cd <rocket.html 所在目录>
npx serve -l 8789
```

启动后访问：`http://localhost:8789/rocket.html`

> 端口不要与后端（8788）冲突。

---

## 2. 临时自动触发入场动画

在 `rocket.html` 的 `<script type="module">` 块**末尾**（`</script>` 闭合标签之前），临时追加以下代码：

```js
// ===== DEBUG: URL 参数 ?debug 自动触发入场 =====
// 调试完毕后删除此段代码
(function autoInitForDebug() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('debug')) return;
  function sendInit() {
    window.postMessage({
      channel: 'interactive-guide:scene-bridge',
      version: '1.0.0',
      source: 'interactive-guide-host',
      kind: 'event',
      type: 'host:init',
      requestId: null,
      payload: {
        activationId: 'debug-' + Date.now(),
        sessionId: 'debug-session',
        product: 'atlas',
        scene: {
          id: 'debug-scene',
          title: document.title || 'Debug Scene',
          entryUrl: window.location.href
        },
        runtime: {
          product: 'atlas',
          projectId: 'debug-project',
          sceneId: 'debug-scene',
          viewId: 'debug-view'
        }
      }
    }, '*');
  }
  // 等待场景就绪后自动触发，最多轮询 10 秒
  const timer = setInterval(function () {
    if (document.getElementById('loader')?.classList.contains('hidden')) {
      clearInterval(timer);
      sendInit();
    }
  }, 200);
  setTimeout(function () { clearInterval(timer); }, 10000);
})();
// ===== END DEBUG =====
```

**使用方式**：访问 `http://localhost:8789/rocket.html?debug`，页面加载完成后火箭自动播放入场动画，直接进入可交互状态。

不带 `?debug` 参数访问时该段代码不会执行，不影响正常宿主加载行为。

**调试完成后**：删除上述注入的代码块即可。

---

## 3. 开发迭代流程

典型的 vibe-coding 迭代：

1. 在 rocket.html 中修改 3D 建模、材质、交互逻辑等
2. 浏览器刷新页面（`http://localhost:8789/rocket.html?debug`）
3. 火箭自动入场，直接测试修改效果
4. 重复以上步骤

修改 3D 材质时关注 `<script type="module">` 内的 `PARTS` 数组，每个部件包含 `color`（漫反射色）和 `emissive`（自发光色），以及几何体构建代码。

---

## 4. 样式调试

样式全部内联在 `<style>` 标签中（文件顶部）。直接在 DevTools Elements 面板编辑可实时预览，或修改源文件后刷新。

关键区域：

| 区域 | 选择器 | 说明 |
|------|--------|------|
| 加载器 | `#loader` / `.loader-ring` | 页面加载旋转动画 |
| 信息面板 | `#infoPanel` / `.panel-inner` | 部件详情卡片 |
| 公司标签 | `.tag-pill` | 公司名称标签 |
| 连接线 | `#connector` | 面板与部件之间的指示线 |
| 点击提示 | `#tapHint` | "点击探索" 提示 |

---

## 5. 交互状态机

```
idle ──[host:init]──→ entering ──[动画完成]──→ complete
                                                      │
                                              [点击部件]──→ exploded ──[点击部件]──→ focused
                                                                              │
                                                                      [点击返回]
                                                                              │
                                                                    回到 complete / exploded
```

- **complete**：火箭自动旋转，可拖拽 / 缩放 / 平移
- **exploded**：部件分离展开
- **focused**：聚焦单个部件，显示信息面板
- **satellite**：卫星子部件独立状态（stowed → solarOpen → exploded）

---

## 6. 协议说明

当前 demo scene 已经直接切换到新的 `SceneBridge v1.0.0` 协议，不再保留旧 `interactive-guide:html-node-bridge` 兼容层。

调试时请按下面的约束理解：

1. 宿主进入 scene：发送 `host:init`
2. 宿主离开 scene：发送 `host:exit`
3. scene 主动请求返回：发送 `scene:request-back`
4. scene 主动请求路由：发送 `scene:request-route`

另外，旧版 scene 内部的“股票跳转”测试逻辑已经移除，不再需要模拟 `html:request-route` 的旧响应格式。

---

## 7. 注意事项

1. **lib/ 目录需要完整**——确保 Three.js 依赖文件存在。从 rocket.zip 重新解压时注意备份。
2. **浏览器兼容**——import map 需要 Chrome 89+ / Firefox 108+ / Safari 16.4+。
3. **提交前检查**——确保已移除注入的 debug 代码，只提交有意义的改动。
