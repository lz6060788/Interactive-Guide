# Phase 18：Atlas / Catalog ES5 独立产物导出

日期：2026-07-15
状态：完成

## 交付结果

Atlas、Catalog 编辑器工具栏均新增“生成预览”和“下载 ZIP”。操作会先保存当前编辑内容，再按当前产品生成独立静态目录；预览直接打开后端静态代理地址，下载得到与该目录同源的 ZIP。

ZIP 根目录固定为：

```text
index.html
app.js
manifest.json
assets/
  images/
  videos/
  scenes/
```

`index.html` 使用普通 `<script src="./app.js"></script>`。`app.js` 是单文件 IIFE，不再包含浏览器 ES module 入口，也不再生成 `runtime/` 模块目录。

## 构建架构

`static-product-builder.ts` 是唯一静态产品构建入口，统一负责：

1. 调用 Atlas 或 Catalog compiler；
2. 计算资产闭包并复制全景图、转场视频和 HTML Scene；
3. 使用 esbuild 将 Runtime 依赖图打成 IIFE；
4. 使用 Babel preset-env 将语法降级到 ES5；
5. 使用 Acorn `ecmaVersion: 5` 做强制解析校验；
6. 校验普通 script、manifest 和引用资产完整性。

`DraftBuildService` 与 `ReleaseService` 都调用这一构建器，避免预览、下载和正式发布产生三套不同产物。草稿先写入 `__tmp` 目录，完整成功后再重命名，失败不会暴露半成品。

## API

创建产品预览：

```http
POST /api/projects/:id/previews/:product
```

返回 `product`、`buildId`、`sourceRevision`、`entryUrl` 和 `downloadUrl`。其中 `product` 只允许 `atlas` 或 `catalog`。

下载同一构建的 ZIP：

```http
GET /api/projects/:id/previews/:product/builds/:buildId/download.zip
```

ZIP 第一次请求时从已验证的静态产品目录生成并缓存，文件名为：

```text
{projectId}-{product}-{projectVersion}.zip
```

项目、buildId、product 与文件相对路径均受目录边界校验，不能跨项目或进行路径穿越。

## 编辑器行为

- 生成预览：点击时同步创建空白窗口；保存和构建成功后跳转到 `entryUrl`，避免异步流程触发浏览器弹窗拦截。
- 下载 ZIP：编辑器无修改且最近构建 revision 与当前 revision 相同时复用 `downloadUrl`；否则先保存并重建。
- 保存失败：终止构建并保留错误提示，不打开旧预览、不下载旧 ZIP。
- 多段保存：每成功保存 knowledge、panorama、navigation 或产品 config 后合并最新 revision，同时保留尚未保存的本地分段，避免前一段响应覆盖后一段编辑内容。
- Atlas 与 Catalog 的构建状态相互独立，调用各自产品路由。

## 兼容边界

- 系统生成的宿主脚本和产品 Runtime 必须通过 ES5 语法解析，实际目标环境为 iOS 13。
- 不注入 Promise、fetch、URL、Map、Set 等 API polyfill；iOS 13 原生能力继续使用。
- 运营上传的 HTML Scene bundle 原样复制，其内部 JavaScript 不由系统转译；场景包需要自行满足目标环境兼容性。

## 验证记录

- 根项目 TypeScript：通过。
- 服务端生产构建：通过。
- 服务端测试：170/170 通过。
- 管理端 TypeScript：通过。
- 管理端测试：29/29 通过；jsdom 对 Chakra `@layer` 的 CSS 解析警告不影响结果。
- 管理端生产构建：通过；仅保留既有的大 chunk 提示。
- demo 实际静态代理构建：Atlas、Catalog 均返回 HTTP 200。
- demo Atlas：`app.js` 147592 bytes，ZIP 7905392 bytes。
- demo Catalog：`app.js` 114568 bytes，ZIP 7901190 bytes。
- 两个 ZIP 均为 35 个文件，根目录只有 `index.html`、`app.js`、`manifest.json`，manifest 引用资产无缺失，`app.js` 均通过 ES5 parser。
