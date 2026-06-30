# 双产品重构验收基线（2026-06-30）

> 上游方案：`docs/plans/2026-06-29-双产品架构重构方案.md`、`docs/plans/2026-06-30-dual-product-refactor.md`
> 状态：Phase 0 已冻结
> 范围：`data/workspace/guide_surface_validation_001/` 资源、知识、空间标注、HTML 场景、体验路由

## 1. 资源清单（sha256 锁定）

完整 JSON：`tests/fixtures/guide_surface_validation_001.resources.json`

| 资源 | 路径 | 类型 | size | sha256 | 角色 |
| --- | --- | --- | --- | --- | --- |
| 全景图 | `nodes/root.jfif` | image | 1,682,177 | `6685…18efa` | 共享 panorama |
| HTML 场景 | `nodes/rocket.html` | html-bundle | 158,375 | `63aa…563d` | `scene:rocket-shared`，entry `index.html` |
| 视频转场 A | `edges/edge-root-to-rocket.mp4` | video | 2,377,583 | `398c…c75c` | overview → rocket |
| 视频转场 B | `edges/rocket.mp4` | video | 2,377,583 | `398c…c75c` | 与 A 字节相同；保留作为目录引用 |
| 场景图片 | `nodes/images/BumpMap.jpg` | image | 168,290 | `8020…33df0` | scene:rocket:asset |
| 场景图片 | `nodes/images/Clouds.png` | image | 1,794,520 | `c20a…2e444` | scene:rocket:asset |
| 场景图片 | `nodes/images/ColorMap.jpg` | image | 483,779 | `bedf…0c22` | scene:rocket:asset |
| 场景图片 | `nodes/images/lroc_color_2k.jpg` | image | 457,942 | `f713…2170` | scene:rocket:asset |

锁定目的：

- 防止资源文件在重构期间被无意替换或损坏。
- Phase 7 清理 `data/workspace/` 之前，必须先通过 `guide-project-bootstrap` 验证新 `project.json` 与这些 sha256 对应。
- 任一 sha256 不一致 → 立即停止清理，调查根因。

## 2. 知识结构（34 项）

完整 JSON：`tests/fixtures/guide_surface_validation_001.knowledge.json`

| Stage | Category | Items | Total |
| --- | --- | --- | --- |
| upstream | rocket | 10 | 10 |
| upstream | satellite | 8 | 18 |
| midstream | launch-services | 4 | 22 |
| midstream | ttc-ops | 3 | 25 |
| midstream | constellation-ops | 1 | 26 |
| downstream | satcom | 3 | 29 |
| downstream | remote-sensing | 2 | 31 |
| downstream | navigation | 2 | 33 |
| downstream | space-computing | 1 | 34 |

关键约束：

- Stage 顺序固定 `upstream → midstream → downstream`，label 固定 `上游 / 中游 / 下游`。
- Category 与 item ID 在项目内必须唯一。
- 旧 `surfaceHierarchyCatalog` 与新 `IndustryChain` 字段映射在 Phase 1 `normalizer` 中给出（不是本基线范围）。

## 3. 空间标注（16 项 + 上游 HTML scene）

完整 JSON：`tests/fixtures/guide_surface_validation_001.spatial.json`

| Stage | 呈现方式 | Hotspots | Item markers |
| --- | --- | --- | --- |
| upstream | html-scene | 0（由 HTML scene 内部承担） | 0（由 HTML scene 内部承担） |
| midstream | panorama | 3（发射服务 / 测控通信与运控 / 星座运营） | 8 |
| downstream | panorama | 4（卫星通信 / 卫星遥感 / 卫星导航 / 太空算力） | 8 |
| **合计** | | 7 hotspot + 16 item marker = 23 | |

注意：

- 旧 manifest 中 `root.surfaceLayers` 包含 8 个 layer（overview + 7 category）。Atlas 不再保留 `overview` 这一层；该层在 Atlas 由 `cameraBounds.initialViewport` 表达。
- 旧 manifest 仅含 2 个 node（root、rocket），但 34 个知识项全部以 `surfaceHierarchyCatalog` 的方式存在；新 domain `IndustryChain` 是它们的唯一来源。
- 18 个上游知识项（火箭/卫星）当前由 HTML scene 内部承担，标记为 `outOfScopeItems`；Atlas 与 Catalog 默认不再为这些项分配独立空间坐标。`calibrationStatus: 'confirmed'` 表示人工确认过这是预期行为，不是数据缺失。

## 4. 体验路由

| id | from | to | 视频 | 失败策略 |
| --- | --- | --- | --- | --- |
| `route-overview-to-rocket` | `{ kind: 'panorama' }` | `{ kind: 'scene', sceneId: 'scene:rocket-shared' }` | `edges/edge-root-to-rocket.mp4` | `cut` |

补充：

- `timeoutMs: 8000`。
- HTML 场景激活消息：`{ type: 'activate-rocket-scene', payload: { stage: 'upstream' } }`，与 SceneBridge v1.0.0 信封兼容。

## 5. 浏览器与目标尺寸

| 项 | 取值 |
| --- | --- |
| 浏览器 | Chrome 120+ / Safari 17+ / Firefox 120+ |
| 主目标尺寸 | 375×808（移动） |
| 校验尺寸 | 1440×900（桌面） |
| 比例 | `aspectRatio = height / width = 808/375 ≈ 2.1547` |

## 6. 验收基线（机器可读 + 人工）

机器可读（自动化）：

- `tests/fixtures/guide_surface_validation_001.resources.json` 的 sha256 与磁盘文件一致
- 知识 34 项与 `guide.json` 中 `surfaceHierarchyCatalog` 完全对齐
- 空间坐标全部位于 `[0,1]` 区间

人工（Phase 8 回归用）：

- Atlas 草稿预览：分类 hotspot 落在全景图正确位置；点击上游后视频播放再激活 HTML 场景；分类视口切换平滑。
- Catalog 草稿预览：三段标签可切换；二级分类 + 三级列表同步；focusRect 正确高亮；上游点击后激活 HTML 场景。
- 两份产物 `atlas/index.html` 与 `catalog/index.html` 都能在 `python -m http.server` 下独立运行，不请求 `/api`。

## 7. 重构期间使用约定

- 本文档是 Phase 3/4 编辑器重构与 Phase 6 静态产物校验的唯一对照。
- 任一基线项改动必须先更新 fixture，再修改代码，再提交。
- 旧 `data/workspace/`、`data/generates/`、`data/publish/`、`data/runtime-bundles/`、`data/panorama-bundles/` 在 Phase 7 之前不得删除。

## 8. 已知硬编码

| 当前硬编码 | 重构后处理 |
| --- | --- |
| `商业航天`（作为 page title） | Phase 5 AnalyticsAdapter 通过 `project.title` 注入；不再硬编码 |
| `上游` 自动创建 HTML group | 删除；`category.experience` 显式绑定 |
| 火箭/卫星部件名称集合 | 删除；由 scene view 与 itemFocusMap 提供 |
| `rocket.html` 路径识别 | 删除；由 `assetId/sceneId/viewId` 引用 |
| `targetOrigin: '*'` | 删除默认值；同源推导或 allowlist |
| 任意 hotspot CSS 字符串 | 改为有限 `variant + theme token` |

## 9. 不在基线内的项

- 旧的 `packageList / generateHistory / workbench / panoramaEditorPage` UI：Phase 7 整体删除。
- 旧 `data/publish/<id>/` 下的已发布产物：Phase 7 整体删除。
- 旧 `data/guides/` 下其他样例（commercial-space-satellite、guide_1779344993154 等）：Phase 7 整体删除。
- `data/panorama-bundles/`、`data/runtime-bundles/`：Phase 7 整体删除。