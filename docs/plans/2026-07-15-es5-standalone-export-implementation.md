# ES5 独立产物导出实施计划

日期：2026-07-15
上游规格：`docs/superpowers/specs/2026-07-15-es5-standalone-export-design.md`

## 执行状态

- Phase 1：✅ 完成，共享 ES5 静态产品构建已接入 Draft 与 Release。
- Phase 2：✅ 完成，静态预览与同源 ZIP 下载 API 已可用。
- Phase 3：✅ 完成，Atlas/Catalog 编辑器已支持自动保存、生成预览和下载 ZIP。
- Phase 4：✅ 完成，服务端、管理端、正式构建与 demo 实际产物均已验证。

## 目标

让 Atlas、Catalog 各自从编辑器自动保存后生成可直接打开的静态预览，并下载与该预览逐文件同源的独立 ZIP。系统生成的 `app.js` 必须是单文件 IIFE，并通过 ECMAScript 5 语法解析校验。

## Phase 1：共享 ES5 静态产品构建

- 将浏览器 Runtime 入口通过 esbuild 打成单文件 IIFE。
- 使用 Babel preset-env 将 bundle 全量降级为 ES5 语法，不注入 core-js。
- 使用 Acorn `ecmaVersion: 5` 校验最终 `app.js`。
- `product-shell` 改为普通 `<script src="./app.js">`。
- 新增共享静态产品构建器，统一 compiler、manifest、Runtime、资产闭包与产物校验。
- `DraftBuildService`、`ReleaseService` 只负责编排目录与原子提交，不再各自拼装 Runtime。

验收：Atlas、Catalog 草稿与正式产物均无 `type="module"`、静态 import/export 和 `runtime/` 模块请求，且 `app.js` 可按 ES5 解析。

## Phase 2：预览与 ZIP API

- 草稿构建结果记录 `buildId`、`sourceRevision`、`projectVersion`。
- POST 预览接口返回 `entryUrl` 与 `downloadUrl`。
- 新增按 project/product/buildId 下载 ZIP 的路由。
- ZIP 根目录直接包含 `index.html`、`app.js`、`manifest.json` 与 `assets/`。
- 对 product、buildId 与文件路径做目录边界校验；无效输入返回明确 4xx。

验收：预览静态目录与 ZIP 内容同源，Atlas/Catalog 路由互不串用，路径穿越被拒绝。

## Phase 3：编辑器自动保存与导出

- AtlasToolbar、CatalogToolbar 增加“生成预览”“下载 ZIP”。
- 将两套编辑器保存函数改为返回最新 `GuideProject`，保存失败继续抛出，禁止构建旧 revision。
- 生成预览时同步打开空白窗口，自动保存和构建成功后导航到静态地址。
- 下载时仅在编辑器干净且当前 revision 与最近构建一致时复用，否则自动保存并重建。
- 两种操作共用 loading 与结构化错误反馈；Atlas/Catalog 构建状态互相独立。

验收：未保存修改会先持久化；失败不打开旧预览、不下载旧 ZIP；两个编辑器均进入正确产品。

## Phase 4：验证与文档同步

- 服务端路由测试覆盖 ES5、普通 script、单 bundle、ZIP 清单和安全校验。
- 管理端测试覆盖工具栏入口、保存失败中止和产品路由。
- 运行 typecheck、服务端测试、管理端测试与生产构建。
- 更新开发文档，记录最终 API、目录结构、兼容边界与操作流程。

完成记录：`docs/development/phase18-es5-standalone-export-2026-07-15.md`。
