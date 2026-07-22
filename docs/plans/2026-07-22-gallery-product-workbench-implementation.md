# Gallery 图片目录型产品与工作台实施方案

> 日期：2026-07-22  
> 状态：已实现，待用户验收  
> 目标版本：GuideProject 4.0.0、Gallery Manifest 1.0.0、Release Manifest 1.1.0  
> 适用范围：领域模型、编译器、独立运行时、管理工作台、预览导出、原子发布与真实数据验收

## 1. 背景与目标

现有系统从同一份 `project.json` 生产 Atlas 与 Catalog 两类独立 HTML 产物。新需求增加第三类产物 Gallery：它沿用 Catalog 的三级产业链浏览方式，但不再在全景图上调度镜头，而是让每个三级节点绑定一张透明背景图片，并使左侧图片与右侧节点列表保持严格同步。

Gallery 的目标不是复制一套 Catalog，而是在共享结构化浏览能力的基础上提供更轻、更稳定的图片型展示能力，并提供可真实使用的工作台编辑、预览、导出和发布闭环。

### 1.1 已确认的设计输入

实现参考 Figma 文件“航空航天”中页面“入口及产业链兜底方案设计”的两个局部：

- “兜底布局示意”：顶部一级/二级按钮、右侧三级节点列表和底部提示沿用 Catalog 的信息层级。
- “图片位置示意”：左侧中部只展示当前三级节点对应的一张透明图片，右侧滚动时同步切换。

需求补充形成以下确定约束：

- 一级阶段、二级分类、底部提示、右侧滚动列表与 Catalog 保持一致。
- 左侧图片顺序必须与右侧三级节点顺序一一对应。
- 任意时刻不能同时看到两张节点图片。
- 非当前图片可通过更大的纵向间距和上下黑色渐变遮罩隐藏，但遮罩不能污染当前图片。
- 切换一级或二级按钮时，内容组采用渐隐渐显与水平位移组合过渡。
- 支持 URL 聚焦三级节点和中英文切换。
- Catalog 与 Gallery 的右下角 Atlas 入口仅在配置了有效链接时存在。
- Gallery 需要独立编辑器、实时预览、首页入口；不需要定位画布。

### 1.2 产品边界

| 能力 | Atlas | Catalog | Gallery |
|------|-------|---------|---------|
| 主展示介质 | 全景场景 | 全景图 | 单节点透明图片 |
| 三级节点聚焦 | 场景/热点调度 | `focusRect` 镜头调度 | 切换绑定图片 |
| 三级结构列表 | 否 | 是 | 是 |
| 位置编辑 | 热点/标注 | 聚焦框 | 不需要 |
| 节点图片绑定 | 否 | 否 | 必须一对一 |
| 独立 HTML 产物 | 是 | 是 | 是 |

### 1.3 非目标

- 不改变严格的 `upstream → midstream → downstream` 三级阶段模型。
- 不引入 AI、合成数据、自动猜测图片映射或运行时占位资源。
- 不为 Gallery 引入全景图、热点、`focusRect`、SceneBridge 路由或场景定位配置。
- 不让 Gallery 的启用影响历史项目继续编辑和发布 Atlas/Catalog。

## 2. 总体架构

Gallery 作为第三个正式产品接入同一领域核心、资源库和发布事务：

```text
GuideProject 4.0
├── knowledge / assets
└── products
    ├── atlas
    ├── catalog
    └── gallery
          │
          ├── Gallery compiler → Gallery Manifest 1.0
          ├── Gallery runtime  → standalone HTML bundle
          └── Gallery editor   → config + image binding + live preview
```

### 2.1 共享结构化浏览层

Catalog 与 Gallery 应共享以下纯逻辑/表现能力，避免两套交互随时间漂移：

- 阶段、分类、条目的有序派生。
- 当前阶段/分类/条目的选择状态与合法化。
- 顶部一级阶段标签、二级分类标签。
- 右侧居中吸附列表、键盘/滚轮/触摸激活规则。
- 底部提示、中英文文本选择。
- URL 查询参数的解析与同步。
- 条件式 Atlas 打开按钮。

共享层不包含 Catalog 的全景图聚焦，也不包含 Gallery 的图片切换；两者作为产品适配器接入。

### 2.2 产品注册表

现有代码中多个 `'atlas' | 'catalog'` 联合类型和二元分支需要改为集中注册表。注册表至少描述：

- 产品 ID、显示名称、是否默认发布。
- contract 编译器、runtime 打包器、静态校验器。
- 管理端编辑器路由与预览入口。
- 发布产物目录和 release manifest 键名。

这能使 Gallery 成为完整产品，而不是散落在构建链路中的第三个条件分支。

## 3. GuideProject 4.0 领域契约

### 3.1 `products.gallery`

建议新增以下配置：

```ts
interface GalleryProductConfig {
  enabled: boolean;
  viewport: ProductViewportConfig;
  chrome: StructuredChromeConfig;
  stageOrder: IndustryStage[];
  hintText: LocalizedText;
  atlasLaunchUrl?: string;
  itemImageAssetIds: Record<string, string>;
  interaction: {
    listActivation: 'center-nearest';
    itemTransitionMs: number;
    categoryTransitionMs: number;
  };
  theme: {
    background: string;
    text: string;
    accent: string;
    listDensity: 'compact' | 'comfortable';
  };
}
```

`itemImageAssetIds` 的键是三级知识节点 ID，值是项目资源 ID。运行时只消费编译后的资源路径，不直接依赖管理端上传目录。

### 3.2 图片绑定与校验规则

当 `products.gallery.enabled === true` 时：

- 每个进入 Gallery 的三级节点必须恰好绑定一个存在的图片资源。
- 资源必须属于受支持的图片 MIME 类型。
- 不允许绑定不存在、被删除或属于视频/场景的资源。
- 不允许使用文件名猜测结果作为静默兜底。
- 多余的未引用图片可以保留在资源库，但应在工作台显示为未使用。

草稿编辑允许暂时缺图；Gallery 预览、Gallery 导出和启用 Gallery 的正式发布必须给出包含节点路径的明确错误。Atlas/Catalog 单独预览与导出不应被未启用的 Gallery 阻断。

### 3.3 版本迁移

- Schema 从 3.0.0 升级到 4.0.0。
- 迁移器按 `2 → 3 → 4` 顺序执行，不跳跃覆盖。
- 历史项目迁移后获得 `gallery.enabled = false` 和空的 `itemImageAssetIds`。
- 新建项目同样默认关闭 Gallery，避免凭空制造数据或改变现有双产物发布语义。

## 4. Gallery Manifest 1.0

编译器输出只包含运行时所需字段：

- 产品元信息、viewport、主题和交互参数。
- 已按固定阶段、分类顺序展开的结构化条目。
- 条目的双语标题/描述和唯一 ID。
- 每个条目唯一的图片资源引用。
- 可选的 Atlas 跳转链接。
- 资源完整性信息。

Manifest 不包含全景图、marker、hotspot、`focusRect`、scene、route 等 Catalog/Atlas 专属字段。

编译阶段应完成：

1. 规范化阶段、分类、条目顺序。
2. 解析并验证每个节点的图片资源。
3. 将资源 ID 转换为 bundle 内稳定相对路径。
4. 生成静态校验器可复核的引用清单。
5. 在缺图、重复映射或非法资源时失败并返回可定位错误。

## 5. Gallery 运行时交互

### 5.1 统一选择状态

运行时使用一个选择状态作为唯一真相：

```text
stageId → categoryId → itemId
                    ├── right list active item
                    ├── left image
                    ├── URL focus
                    └── localized details
```

任何入口——初始 URL、阶段按钮、分类按钮、右侧滚动、键盘导航——都先更新这一状态，再由各视图订阅渲染，避免左右不同步。

### 5.2 右侧滚动与左图同步

- 右侧列表仍是用户的主要滚动面。
- 以容器中心线最近的条目作为激活候选，使用短防抖稳定高速滚动。
- 激活条目变化后，左侧切换为相同索引的图片。
- 触摸、滚轮、拖动滚动条和键盘操作使用同一判定逻辑。
- 不依赖兼容性不足的 `scrollend` 事件。

### 5.3 单图片切换保证

左侧使用一个实际图片元素或同一绘制层，执行顺序为：

1. 当前图片淡出。
2. 淡出完成后替换 `src` 和辅助文本。
3. 新图片加载完成后淡入。

不使用两个绝对定位图片交叉透明，因此任意时刻不会出现两张节点图叠加。相邻图片可预加载，但不能进入可见 DOM 层。

### 5.4 纵向遮罩与安全区

- 左图区域上、下方各设置黑色渐变遮罩。
- 中央当前图片安全区保持无遮罩或完全透明。
- 遮罩使用独立覆盖层，不改变图片资源本身的透明度与颜色。
- 图片容器按 `contain` 适配并保留足够纵向间距，避免相邻内容露出。

### 5.5 阶段/分类切换

一级或二级切换采用组级动画：旧内容轻微水平移出并淡出，状态切换后新内容从相反方向移入并淡入。动画期间锁定重复导航，完成后恢复滚动。

遵循 `prefers-reduced-motion`：用户要求减少动态时缩短为无位移的快速透明度切换。

### 5.6 URL 与国际化

- 保持现有 `lang` 查询参数语义。
- 继续支持 `focus` 聚焦三级节点，并兼容既有的本地化标题链接。
- 新生成链接优先携带稳定节点 ID；若同时提供标题和 ID，以 ID 为准。
- 未找到目标时明确回到当前阶段首项，不生成不存在的节点。
- 语言切换不改变当前节点，只更新文本和 URL。

### 5.7 Atlas 入口

Catalog 与 Gallery 使用同一规则：

- `atlasLaunchUrl` 缺失、为空白或非法时，不创建按钮 DOM。
- 配置有效时才显示右下角入口。
- 打开行为、可访问名称和安全属性保持一致。

这会修正 Catalog 当前“没有链接也显示按钮”的历史行为，并同步更新对应测试。

## 6. Gallery 工作台

### 6.1 路由与首页入口

- 新增 `/projects/:projectId/gallery-editor`。
- 项目首页/产品卡片新增 Gallery 编辑入口，状态区分“未启用、待补图、可预览、可发布”。
- Gallery 未启用时仍可进入编辑器进行配置，只有显式保存启用后才进入发布事务。

### 6.2 三栏布局

1. 左栏：阶段、分类、三级节点结构树及缺图状态。
2. 中栏：与真实 Gallery runtime 相同的持续预览。
3. 右栏：当前节点内容、图片绑定和产品级配置。

不提供坐标、框选或拖拽定位画布。

工作台外壳必须复用管理端既有的 Chakra 基础组件、`Cartographer's Desk` 主题令牌和按钮 recipe。编辑区使用 `bg / bg.raised / bg.sunken`、`ink`、`border`、`brand / accent` 等语义令牌；只有中栏嵌入的真实 Gallery runtime 保留产物自身的黑色展示主题，不能把运行时主题扩散到编辑器工具栏、结构栏和属性栏。

### 6.3 编辑能力

- 复用领域知识的中英文标题、描述编辑能力。
- 固定保留上游、中游、下游三个一级阶段；可在各阶段新增、选择、修改和删除二级节点。
- 可在二级节点下新增、选择、修改和删除三级节点；删除二级节点时同步删除其三级节点。
- 删除结构节点时同步清理 `knowledge`、Gallery 图片映射、共享 `panorama` 布局、Atlas 分类清单、跨体验导航和 HTML Scene 反向引用，避免其他产品读到悬空引用。
- 为当前三级节点选择已有图片或上传新图片。
- 展示缩略图、文件名、尺寸、资源状态和替换/解绑操作。
- 支持按结构顺序快速跳到上一个/下一个缺图节点。
- 支持设置提示文字、主题、动画时长和可选 Atlas 链接。
- 图片变更后真实预览立即更新，不使用管理端专属假视图。

### 6.4 保存与并发

- 保存时按修订顺序提交知识、共享空间数据、受影响的 Atlas/导航/Scene 引用和 `products.gallery` 变更。
- 延续 `x-expected-revision` 乐观锁。
- 409 冲突时保留本地表单并提示重新加载/合并，不覆盖服务端版本。
- 上传资源与项目配置保存分离；配置只引用已成功入库的资源 ID。

## 7. 构建、预览与发布

### 7.1 草稿预览与独立导出

- Gallery 编辑器预览使用 Gallery compiler + Gallery runtime 的真实产物链路。
- 新增 Gallery ZIP 导出和静态目录预览。
- 预览错误返回到具体阶段/分类/节点，不用占位图掩盖。

### 7.2 原子发布

正式发布仍在同一临时目录完成所有启用产品：

1. 编译 Atlas、Catalog 和已启用的 Gallery。
2. 复制并校验各产品引用资源。
3. 生成 Release Manifest 1.1。
4. 完成静态产物验证。
5. 全部成功后一次性替换正式发布目录。

Gallery 未启用时继续产生 Atlas + Catalog；Gallery 已启用但校验失败时整个发布失败，旧正式版本保持不变。

### 7.3 Release Manifest 1.1

Release Manifest 增加可选 `gallery` 产物记录，包含入口文件、manifest、完整性摘要和资源计数。读取旧版 1.0 时保持兼容。

### 7.4 静态验证

Gallery 校验至少覆盖：

- HTML、脚本、样式、manifest 存在。
- 每个 manifest 图片引用均在 bundle 内存在。
- 不存在未解析的绝对本地路径。
- 入口能在无服务端条件下启动。
- URL 聚焦与语言参数不造成脚本错误。

## 8. 真实数据接入与验收

首次验证使用用户提供的真实数据：

- 节点图片目录：`C:\Users\91252\Downloads\transparent\transparent`
- 产业链结构表：`C:\Users\91252\Downloads\产业链分类表.xlsx`

这些路径只用于本地导入和验收，不写入运行时契约或发布产物。

### 8.1 Excel 解析原则

- 以工作簿中的真实阶段、分类、节点、双语字段为准。
- 保留表格顺序，禁止自动重排成看似合理但未经确认的结构。
- 空值、重复节点、非法阶段和跨分类冲突必须形成问题清单。
- 若表格表达与严格三阶段契约冲突，应显式失败并指出单元格位置。

### 8.2 图片映射原则

- 先生成文件清单与结构节点清单，再执行规范化名称的精确匹配。
- 只有唯一确定的映射可自动落库。
- 一对多、多对一、缺失和无主图片必须分别报告。
- 不根据相似语义或主观判断静默配对。

### 8.3 验收层级

领域/编译器：

- 3.0 → 4.0 迁移稳定且幂等。
- Gallery 开关、图片绑定和 Atlas 链接校验正确。
- 缺图错误精确指向节点。

运行时：

- 右侧滚动与左图始终同项。
- 快速滚动、阶段/分类切换时不出现双图。
- 遮罩不覆盖当前图片主体。
- URL 聚焦、中英文切换、刷新恢复正确。
- Catalog/Gallery 未配链接时均无 Atlas 按钮。

工作台：

- 首页可进入 Gallery 编辑器。
- 可上传/选择/替换所有节点图片。
- 缺图状态和发布错误一致。
- 保存、刷新、冲突处理、真实预览可用。

产物：

- 使用真实 Excel 和图片生成一个可独立打开的 Gallery bundle。
- Gallery 与 Atlas/Catalog 一同通过原子发布验证。
- 断网或静态服务环境下核心浏览能力可用。

## 9. 实施阶段

### 阶段 1：契约与迁移

- GuideProject 4.0 类型、Zod schema、默认值、normalizer、migrator。
- Gallery 配置校验和面向节点的错误模型。
- 单元测试覆盖历史项目迁移和启用边界。

### 阶段 2：产品内核

- Gallery Manifest 1.0 类型与编译器。
- 抽取 Catalog/Gallery 共享结构化浏览模型。
- 建立产品注册表并替换构建/预览/校验中的二元分支。

### 阶段 3：运行时

- Gallery scene、样式、入口与独立 bundle。
- 单图片切换、滚动同步、组级转场、遮罩、URL/i18n。
- Catalog 条件 Atlas 按钮修复。

### 阶段 4：工作台

- 首页入口、Gallery editor 路由和三栏界面。
- 图片资源上传/选择/绑定。
- 真实 runtime 预览、修订锁和错误反馈。

### 阶段 5：发布链路

- Gallery 预览、ZIP、静态验证。
- Release Manifest 1.1 和三产品原子发布。
- 旧项目与 Gallery 关闭场景回归。

### 阶段 6：真实数据与视觉验收

- 解析产业链分类表并生成映射报告。
- 导入透明图片并完成所有可确定绑定。
- 生成真实 Gallery 产物，执行自动化、浏览器和视觉验收。

## 10. 主要改动范围

| 模块 | 预计改动 |
|------|----------|
| `src/domain` | GuideProject 4.0、Gallery schema/defaults/normalizer/validators/migration |
| `src/products/gallery` | contract、compiler、runtime、styles、tests |
| `src/products/catalog` | 共享结构化浏览接入、条件 Atlas 入口 |
| `src/product-shell` | Gallery browser entry、产品注册表、打包与静态校验 |
| `src/server` | Gallery 预览/导出、三产品原子发布、Release Manifest 1.1 |
| `src/admin` | 首页入口、Gallery editor、图片绑定与实时预览 |
| `data/projects` | 真实验收项目及受管理资源，不保留外部绝对路径 |
| `docs` | 架构、产品能力、验收结果与索引同步 |

## 11. 风险与控制

- 大量透明 PNG 造成首屏压力：只加载当前图，预取相邻图，编译时保留原始资源但记录尺寸与体积。
- 图片尺寸差异导致跳动：固定图片安全区，统一 `object-fit: contain`，不按单图改变布局。
- 滚动高速抖动：中心最近项 + 短防抖 + 单一状态提交。
- 双图闪现：单 DOM 图片元素串行切换，资源加载失败保持错误态而非显示旧图与新图叠层。
- Catalog 回归：共享层只抽纯选择/列表逻辑，全景聚焦适配器保留产品测试。
- 历史项目发布中断：Gallery 默认关闭；只在明确启用时纳入发布门禁。
- 真实数据命名不一致：输出人工可审阅冲突清单，不进行语义猜测。

## 12. 完成定义

以下条件全部满足才视为 Gallery 能力完成：

- GuideProject 4.0 和三产品架构通过类型、schema、迁移、编译和发布测试。
- Gallery 工作台能用真实数据完成编辑、图片绑定、保存、预览和导出。
- Gallery 独立产物可通过 URL 聚焦任意三级节点并切换中英文。
- 右侧滚动、左侧图片和 URL 状态始终一致，过渡中不出现双图。
- Catalog 与 Gallery 的 Atlas 入口严格由链接配置控制。
- 使用指定 Excel 与透明图片生成可验收的真实 Gallery bundle。
- 现有 Atlas/Catalog 行为与旧项目迁移、预览、发布均完成回归。
- 相关架构、功能、验收文档和文档图谱同步更新。

## 13. 实施结果（2026-07-22）

- GuideProject 已升级到 4.0.0，3.0.0 项目加载时确定性补入默认关闭的 Gallery 配置。
- Gallery Manifest 1.0、compiler、单图 runtime、浏览器入口、ES5 独立打包、静态校验、预览与 ZIP 导出已接通。
- Gallery 启用时进入 Release Manifest 1.1 三产品原子发布；关闭时保留原 Atlas + Catalog 行为。
- 首页 Gallery 入口、三栏工作台、节点内容编辑、图片上传/复用绑定、缺图状态、真实 runtime 预览与修订保存已实现。
- Gallery 工作台已统一使用管理端 Chakra 组件、暖白主题令牌和既有按钮 recipe；黑色视觉只保留在中栏真实产物预览内。
- 工作台已支持三个固定阶段内的二级节点与三级节点增删改查；删除操作会同步清理知识树、Gallery 图片映射、共享空间布局、Atlas 分类清单、导航和 Scene 引用。
- 实时预览的场景挂载与选中项同步已拆分。点击“射频电源”等非首项时只更新现有 `GalleryScene`，不会因重建场景被滚动回调写回“真空系统”。
- Catalog 和 Gallery 的 Atlas 入口均改为只在有效链接存在时创建。
- 真实验收项目 `semiconductor-equipment-gallery` 已由指定 Excel 和 29 张透明 PNG 生成，29 个节点与 29 张图片一一绑定。
- 数据导入产生 28 个精确同名映射和 1 个显式别名映射：表格“掩模版”对应“掩模板.png”；不存在缺图、重复占用或无主图片。
- 根测试 201/201、管理端测试 30/30 通过；根与管理端类型检查、管理端生产构建通过。
- 浏览器验收确认 URL 聚焦、节点点击、阶段切换、图片/列表/URL 同步、单图可见和无链接时隐藏 Atlas 入口均符合预期；工作台另完成“射频电源”稳定选择以及二/三级节点创建、改名、保存、删除、再次保存的真实链路验收。

真实数据仅提供中文字段，因此验收项目的 `supportedLocales` 为 `zh-CN`，未伪造英文翻译；Gallery 的中英文切换能力由双语编译/本地化自动化用例验证。
