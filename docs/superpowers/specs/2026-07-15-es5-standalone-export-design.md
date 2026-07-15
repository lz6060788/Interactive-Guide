# Atlas / Catalog ES5 独立产物导出设计

日期：2026-07-15

## 1. 目标

为 Atlas、Catalog 两套编辑器补齐可交付的独立产物导出链路。运营可以在各自编辑器中自动保存当前修改、生成静态预览、直接打开预览地址，并下载与预览内容完全相同的 ZIP。

每个产品独立导出，不生成混合双产品 ZIP。最终 ZIP 解压后可由任意静态服务器托管，不依赖 Interactive Guide 后端或 `/api`。

系统生成的宿主 JavaScript 和产品 Runtime 必须能按 ECMAScript 5 语法解析，目标运行环境为 iOS 13。此要求只约束语法，不注入 Promise、fetch、URL、Map、Set 等 API polyfill。

## 2. 产物契约

Atlas、Catalog 分别生成一份 ZIP。ZIP 根目录结构固定为：

```text
index.html
app.js
manifest.json
assets/
  images/...
  videos/...
  scenes/...
```

约束如下：

- `index.html` 使用普通 `<script src="./app.js"></script>`，不得出现 `type="module"`、modulepreload 或动态模块入口。
- `app.js` 是单个 IIFE bundle，不含静态 `import`、`export` 或运行时模块请求。
- `manifest.json`、全景图、视频、HTML Scene 及其相对依赖全部进入资产闭包。
- 所有系统生成 URL 使用产品目录内相对路径，不得出现 `/api`、工作区绝对路径或逃逸目录的 `..`。
- ZIP 中的文件与静态预览目录逐文件一致；ZIP 不能重新执行另一套编译逻辑。
- 运营上传的 HTML Scene bundle 原样复制。系统不转译其中的 JavaScript，不改写 three.js 或其它场景依赖；场景包自身需要满足目标宿主兼容性。

## 3. ES5 打包方案

采用两段式构建：

1. esbuild 解析 TypeScript 入口及其依赖图，将 Atlas 或 Catalog Runtime 打成单个浏览器 IIFE。
2. Babel `preset-env` 对 IIFE 做全量语法降级，输出 ES5 语法，不启用 `useBuiltIns`，不注入 core-js。

最终代码使用 ES5 parser 做构建期校验。校验失败必须使预览、下载和正式发布全部失败，不允许回退到当前 ES module 产物。

不采用以下方案：

- TypeScript ES5 + 自研 CommonJS 拼装：循环依赖、re-export、helper 和后续模块变化会使维护风险过高。
- modern / legacy 双包：当前只有一个 iOS 13 目标，没有维护两套脚本的收益。
- 仅将 TypeScript `target` 改为 ES5：无法消除浏览器端模块图，也不能生成单文件 IIFE。

## 4. 共享构建链路

新增单一的产品静态构建组件，输入为产品类型、编译后 manifest、产品资产闭包和目标目录，输出为完整产品目录。

该组件同时被以下链路使用：

- 编辑器静态预览；
- ZIP 下载；
- `ReleaseService` 正式发布。

`DraftBuildService` 和 `ReleaseService` 不再各自拼装 Runtime。现有 `browser-runtime-packager` 的 ES2022 多模块输出被 ES5 IIFE packager 替代；`product-shell` 只负责生成非模块 HTML 宿主和启动失败界面。

Atlas、Catalog 继续使用各自 compiler 和 Runtime，但构建步骤、ES5 校验、资产复制和静态验证共享。

## 5. 预览与下载 API

继续复用现有 `data/draft-builds/` 和预览静态代理，不新增第三个临时产物根目录。

### 5.1 创建构建

```http
POST /api/projects/:id/previews/:product
```

成功响应增加：

```json
{
  "data": {
    "product": "atlas",
    "buildId": "atlas-...",
    "sourceRevision": 102,
    "entryUrl": "/api/projects/.../index.html",
    "downloadUrl": "/api/projects/.../download.zip"
  }
}
```

### 5.2 静态预览

现有按 buildId 读取文件的静态路由保持不变。它必须只允许访问对应项目、产品、构建目录内文件。

### 5.3 下载

新增同一 buildId 的 ZIP 下载路由。ZIP 从已完成并通过静态验证的产品目录生成，根目录直接是 `index.html`，不额外包一层 `atlas/` 或 `catalog/`。

下载文件名：

```text
{projectId}-{product}-{projectVersion}.zip
```

无效 product、buildId、路径穿越或不存在的构建返回明确 4xx，不触发重新构建。

## 6. 编辑器交互

AtlasToolbar、CatalogToolbar 各自增加两个入口：

- `生成预览`
- `下载 ZIP`

两者遵循相同流程：

1. 检查编辑器是否存在未保存内容。
2. 如有修改，依次保存 knowledge、panorama、navigation 和产品 config；任一步失败则停止。
3. 调用当前产品的预览构建 API。
4. 保存服务端返回的 buildId、sourceRevision、entryUrl、downloadUrl。

“生成预览”在用户点击时立即创建空白窗口，避免异步保存和构建完成后被浏览器拦截；成功后将窗口导航到静态 entryUrl，失败时关闭空白窗口并在工具栏显示错误。

“下载 ZIP”在当前项目 revision 与最近构建的 sourceRevision 一致且编辑器无待保存内容时复用最近的 downloadUrl；如果自上次构建后又有修改，则自动保存并重新构建，再开始下载。

构建期间两个按钮进入 loading 状态，禁止重复提交。Atlas 和 Catalog 的最近构建状态互相独立。

## 7. 一致性与失败处理

- 保存失败：不构建，不打开旧预览，不下载旧 ZIP。
- compiler 或 release validator 失败：返回结构化错误，保留已有正式 release。
- ES5 解析失败：构建失败并报告残留语法位置。
- 资产缺失：构建失败，不生成可下载 ZIP。
- 预览窗口被浏览器禁止：保留可复制的 entryUrl，并提示用户允许弹窗。
- ZIP 生成失败：不影响已生成的静态预览目录，可重试下载。
- HTML Scene 内部代码报错：作为场景包自身错误呈现，不由 ES5 packager 静默改写。

## 8. 验收标准

### 8.1 构建产物

- Atlas、Catalog 的 `app.js` 都可使用 ECMAScript 5 parser 完整解析。
- 两份 `index.html` 都不含 module script。
- `app.js` 为单文件 IIFE，不请求 `runtime/*.js`。
- ZIP 解压后使用静态服务器可独立运行，不请求 Interactive Guide API。
- ZIP 文件清单、哈希与对应静态预览目录一致。

### 8.2 编辑器

- Atlas、Catalog 工具栏都能自动保存后生成预览并打开正确产品地址。
- Catalog 预览不会进入 Atlas，Atlas 预览不会进入 Catalog。
- 下载按钮获得对应产品 ZIP；有新修改时自动重建，无修改时复用最近构建。
- 保存或构建失败时显示可理解的错误，按钮恢复可操作状态。

### 8.3 回归

- 预览、ZIP 和正式 release 使用相同 packager，运行时 UI 与编辑器内预览一致。
- 全景图片、转场视频、HTML Scene、SceneBridge、F10 Atlas 跳转和埋点行为不因打包方式改变。
- 原子双产品发布仍满足任一产品失败则整次发布失败。

## 9. 非目标

- 不支持 IE11。
- 不注入浏览器 API polyfill。
- 不转译运营上传的 HTML Scene bundle。
- 不生成单 HTML 文件内嵌全部图片和视频。
- 不生成同时包含 Atlas、Catalog 的单个下载 ZIP。
