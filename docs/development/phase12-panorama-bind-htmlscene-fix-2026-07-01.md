# Phase 12 — 三处体验修复（2026-07-01）

> 状态：实施完成
> 日期：2026-07-01
> 范围：admin 端资源面板 / HTML 场景面板 / Schema 校验

## 1. 问题与根因

用户反馈三个具体问题：

1. 在 `Settings → 资源` 上传一张图片后，切到 Atlas 编辑器仍显示"还没有上传全景图"
2. 在 `Settings → HTML 场景` 点击"新增场景"报 `400 invalid body`
3. 完全不理解"HTML 场景"是什么概念 — 不知道它和 Panorama 全景图的关系

逐一排查后定位根因：

| 问题 | 根因 |
| --- | --- |
| 上传后画布无底图 | `AssetsPanel` 只调 `useUploadAsset` 把图片写到 `assets.byId`，**没有任何地方把 `panorama.assetId` 指向新上传的 asset**。`AtlasCanvas` 始终读 `project.panorama.assetId`，永远是空 |
| "新增场景" invalid body | `HtmlScenePackageSchema.assetId` 是 `z.string().min(1)`，但 `HtmlScenePanel.onAddScene` 初始化为 `assetId: ''`。Zod 直接拒 |
| HTML 场景概念不清 | `HtmlScenePanel` 顶部仅一句"通过 iframe + SceneBridge 协议"，没有说明它和全景图 hotspot 的二选一关系 |

## 2. 修复

### 2.1 AssetsPanel "设为底图" 按钮（修复问题 1）

文件：`src/admin/src/features/projects/settings/AssetsPanel.tsx`、`src/admin/src/pages/ProjectSettingsPage.tsx`

- 新增 prop `panoramaAssetId: string`，由 `ProjectSettingsPage` 把 `project.panorama.assetId` 透传过来
- 对每张 image asset 行：
  - 当 `it.id === panoramaAssetId` → 显示 `<Badge variant="subtle" colorPalette="brand">当前底图</Badge>` + 行高亮（brand 色边框）
  - 否则 → 显示 `<Button variant="ghost" size="sm"><ImagePlus/>设为底图</Button>`
- 点击"设为底图"：
  - 从 React Query 缓存读 `project.panorama`，把 `assetId` 改成该 asset 的 id
  - 调 `useUpdatePanorama` 的 `PUT /projects/:id/panorama`，乐观锁走 `expectedRevision`
  - 成功后 cache 自动刷新，Atlas 编辑器即可看到底图
- 资源面板顶部新增 banner（仅当 `panoramaAssetId === ''` 时显示）：
  > 全景画布尚未绑定底图。上传一张图片后，点行尾的"设为底图"即可在 Atlas 编辑器中显示。

### 2.2 Schema 放宽 + pending 状态（修复问题 2）

文件：`src/domain/project-schema.ts`、`src/admin/src/features/projects/settings/HtmlScenePanel.tsx`

- `HtmlScenePackageSchema.assetId` 从 `z.string().min(1)` 改为 `z.string()`（允许空串）
- 注释说明：新建未上传 zip 的 scene 处于草稿态；release 时由 `checkAssetReferences` 报 `ASSET_MISSING` 阻止发布
- `SceneCard` 新增 `isPending = !scene.assetId || !linkedAsset` 派生
- pending 时：
  - 卡片边框由 `border` 改 `state.warn`
  - 顶部插入 `<Box data-testid="scene-pending-${id}">` 警告条
- `onAddScene` 行为不变（仍是 `assetId: ''`），现在能成功提交

### 2.3 HTML 场景概念说明（修复问题 3）

文件：`src/admin/src/features/projects/settings/HtmlScenePanel.tsx`

- 面板顶部新增 `<Box data-testid="html-scene-explainer">` 概念说明卡片：
  - 一段文字解释 category 的两种体验形式（panorama hotspot / html-scene iframe）
  - 一段 ASCII 示意图：
    ```
    [ 分类 A ] ─kind: panorama──> 全景图上的 hotspot
                          ↓ 点 hotspot
                          全景图平移到该分类的视口

    [ 分类 B ] ─kind: html-scene─> 跳转到独立 HTML 页面
                          ↓ (在右侧 Inspector 选 场景 + 视图)
                          runtime 用 iframe 加载 <bundle>/index.html
                          通过 postMessage(SCENE_PROTOCOL_CHANNEL) 通信
    ```
  - 一段"何时用 HTML 场景"的使用场景引导（3D 模型 / 动画 / 可交互 UI）
- 原顶部一行精简为"添加新的 HTML 场景后，请在下方场景卡里上传 zip 包"

## 3. 修改的文件

```
M  src/admin/src/features/projects/settings/AssetsPanel.tsx      # "设为底图" + banner
M  src/admin/src/features/projects/settings/HtmlScenePanel.tsx   # 概念说明 + pending 状态
M  src/admin/src/pages/ProjectSettingsPage.tsx                   # 透传 panoramaAssetId
M  src/domain/project-schema.ts                                  # assetId: z.string()
```

## 4. 验证

```bash
cd src/admin && npx tsc --noEmit       # exit 0
cd src/admin && npm run build          # ✓ built in 11.16s
cd src/admin && npx vitest run         # 4 files, 21 tests, all pass
```

### 肉眼验收

1. 进入新项目 → Settings → 资源 → 上传一张图片 → 行尾出现"设为底图"按钮和顶部 banner → 点"设为底图" → 按钮消失、出现"当前底图"徽标、banner 也消失 → 切到 Atlas 编辑器 → 画布上能看到刚上传的图片
2. 同一项目 → Settings → HTML 场景 → 看到顶部概念说明卡片 → 点"新增场景" → 卡片带警告边框和"未完成：尚未上传 zip 包"提示 → 在场景卡里上传 zip → 警告消失
3. Atlas 编辑器右侧选一个 category → 体验形式下拉切到 "HTML Scene" → 场景下拉列出刚创建的 scene → 视图下拉列出 view-overview

### 保留契约

| 契约 | 数量 | 状态 |
| --- | --- | --- |
| `data-testid` 增量 | `btn-set-panorama-*` / `badge-current-panorama-*` / `banner-no-panorama` / `html-scene-explainer` / `scene-pending-*` / `scene-${id}` 新增 `data-pending` | 全部新增（不破坏旧的） |
| API 兼容性 | `PUT /panorama` 入参不变 | ✅（仅 client 调用方式不变） |
| Schema 兼容性 | `assetId` 允许空串；旧项目若有非空 assetId 不受影响 | ✅ |
| `x-expected-revision` 乐观锁 | 全部 PATCH/PUT 仍走 revision | ✅ |

## 5. 后续可选优化

- "设为底图"可以做成"双击缩略图 = 设为底图"的快捷手势（在 preview 阶段，Phase 12 不做）
- HTML 场景面板的 ASCII 图可以替换成 SVG 插画，但当前 mono 风格与 cartographer's desk 一致，先这样
- `HtmlScenePackage.assetId === ''` 时编译期 lint 警告（提示 operator 还没上传 zip）