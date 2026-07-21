# 存储芯片产业链项目引导设计

## 目标

基于 `C:\Users\91252\Downloads\asset` 中的真实资料，确定性创建一份新的双产品项目：

- 项目 ID：`memory-chip-industry-chain`
- 项目标题：`存储芯片产业链`
- Atlas：全景自由探索，包含 9 个二级分类 hotspot 与 27 个三级节点 callout
- Catalog：严格的上游、中游、下游结构，并为 27 个三级节点提供可继续人工校准的聚焦区域

本次不导入公司标的，不创建 HTML Scene，不配置转场视频，也不生成任何占位知识内容。

## 输入资料与用途

| 文件 | 用途 | 是否进入运行时产物 |
| --- | --- | --- |
| `data.xlsx` | 三级知识结构、三级节点名称、描述与简要介绍 | 内容进入 `project.json`，原文件不进入产物 |
| `image_root.jpg` | Atlas 与 Catalog 共用的全景底图 | 是 |
| `image_second.png` | 9 个二级分类的 Atlas hotspot 坐标校准图 | 否 |
| `iamge_third.png` | 27 个三级节点的 marker 与 Catalog 聚焦区域中心校准图 | 否 |

所有空间数据最终转换为 `[0,1]` 归一化坐标，禁止把标注图像的像素坐标写入项目数据。

## 知识映射

以工作表中的 `分类路径` 作为层级权威来源，用它补全合并单元格造成的一级或二级空值。字段映射如下：

- `一级`：映射到固定的 `upstream`、`midstream`、`downstream`
- `二级`：映射到 category
- `三级节点`：映射到 item 标题
- `第三级节点描述`：映射到 item description
- `三级节点简要介绍`：当前领域模型没有独立摘要字段，因此只保留在确定性输入与映射报告中，不覆盖完整 description
- `画面中物品名称`：只用于标注图校准与审计报告
- `公司标的`：明确忽略
- `是否属于场景图`、`是否属于核心产品`：不参与本次项目配置

预计得到 3 个一级阶段、9 个二级分类和 27 个三级节点。节点 ID 由稳定的英文语义 ID 表显式提供，不依赖中文字符的自动 slug 结果。

## 空间映射

### Atlas 二级 hotspot

从 `image_second.png` 读取 9 个标注圆点，并按二级分类名称建立一对一映射。圆点像素坐标除以标注图宽高，得到归一化 hotspot。

每个分类的默认镜头中心采用 hotspot 坐标。默认 zoom 使用项目公共配置中的分类聚焦值，不在引导脚本内另写一套编辑器常量。

### Atlas 三级 callout

从 `iamge_third.png` 读取 27 个标注圆点，并按三级节点名称建立一对一映射。该归一化圆点写入 `panorama.items[itemId].marker`。

三级节点的默认镜头中心采用 marker 坐标，zoom 使用项目公共配置中的 item 聚焦值。后续可在 Atlas 编辑器中继续调整。

### Catalog 聚焦区域

标注资料只提供圆点，没有提供矩形边界。本次采用已确认的临时策略：

- 以三级 marker 为矩形中心
- 使用 `PROJECT_DEFAULTS.panorama.focusRect` 的统一初始值：宽 `0.22`、高 `0.18`、圆角 `12`、遮罩透明度 `0.48`
- 矩形经过边界钳制，保证完整落在 `[0,1]` 画布内
- 同一 marker 同时作为 `focusRect` 的视觉中心，避免聚焦框内容与背景位置错位

这些矩形是待校准数据，而非最终视觉标定。映射报告会逐项标记为“需要人工校准”，但项目本身必须满足 schema 并可直接预览。

### Catalog 背景镜头

三级节点的 `viewportOverride` 以 marker 为中心，初始 zoom 使用 `PROJECT_DEFAULTS.panorama.categoryZoom`（当前为 `3.6`）。第一版不自动推断物体边界，也不自动共享同一二级分类的背景镜头；这些精细设置交由 Catalog 编辑器完成。

## 实现结构

采用“确定性输入 + 创建脚本 + 审计报告”的结构：

1. 项目输入文件描述知识节点、显式 ID、空间坐标和源资产路径。
2. 引导脚本调用现有 domain normalizer、schema validator、资产服务和项目服务，不直接拼接不受校验的 JSON。
3. 脚本先在内存中完成项目装配和完整校验，再创建项目目录并复制底图。
4. 创建过程输出映射报告，记录来源、数量、未映射内容和待人工校准的 27 个 focusRect。
5. 重复执行时若目标项目已存在则失败退出，不静默覆盖人工编辑结果。

标注图仅是引导输入，不登记到 `assets.byId`。运行时资产闭包只包含 `image_root.jpg`。

## 数据流

```text
data.xlsx ──────────────> knowledge mapper ─┐
image_second.png ───────> category mapping ─┤
iamge_third.png ────────> item mapping ─────┼─> GuideProject 2.0
image_root.jpg ─────────> asset definition ─┘        │
                                                     ├─> draft/release validation
                                                     ├─> project + asset persistence
                                                     └─> Atlas/Catalog compile validation
```

## 错误处理

以下任一情况必须失败退出，不创建半成品项目：

- 表格不是严格的上游、中游、下游结构
- 二级分类数量或名称无法与 9 个 hotspot 完整对应
- 三级节点数量或名称无法与 27 个标注点完整对应
- 归一化坐标、focusRect 或 viewport 超出允许范围
- 底图不存在或不是可读取的图片
- 目标项目 ID 已存在
- domain schema、release validator、Atlas compiler 或 Catalog compiler 失败

项目文件与资产写入采用临时目录后重命名的方式，避免错误中断后留下可见的半成品目录。

## 验收标准

- 新项目可在首页分别进入 Atlas 与 Catalog 编辑器
- 知识结构严格为 3 / 9 / 27，且不包含公司标的
- Atlas 显示 9 个二级 hotspot 和 27 个三级 callout
- Atlas hotspot/callout 与标注图的归一化位置一致
- Catalog 的每个三级节点都具备 marker、临时 focusRect 和可编辑背景镜头
- Catalog 临时 focusRect 不越界，且框内图像与对应全景区域一致
- 两个产品均可完成编译与独立 HTML 预览
- 运行时资产仅包含全景底图，不包含两张标注图和 Excel 文件
- 映射报告明确列出 27 个待人工校准的 Catalog focusRect

## 不在本次范围内

- 物体边界的精确视觉标注
- Catalog 背景镜头的分类内共享关系
- HTML Scene、视频转场、分析埋点和 F10 Atlas 跳转地址
- 公司标的内容
- 对已有 `demo` 项目的修改
