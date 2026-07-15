# 存储芯片产业链项目引导与空间校准报告

## 当前项目

- 项目 ID：`memory-chip-industry-chain`
- 项目标题：存储芯片产业链
- 当前 revision：13（本页空间表记录的是 revision 4 的自动导入基线，后续已在编辑器中人工校准）
- 知识结构：3 个一级阶段、9 个二级分类、27 个三级节点
- 场景与转场：0 个 HTML Scene、0 条转场路由
- 运行时资产：1 张全景底图
- 公司标的：未导入

当前运行时集成：

- Atlas WeBlog：`appKey=ce19ea099b`、`pageType=visindustry`、`name=存储芯片产业链`、`defaultSource=industry`
- 分享：已启用，分享标题和描述均为“存储芯片产业链”，图片使用全景底图
- Catalog 打开 Atlas：`http://o.thsi.cn/datav.narrative-vision/interactive-guide/memory-chip-industry-chain-atlas/0.1.0/index.html`

当前空间基准：

- `C:\Users\91252\Downloads\asset\image_root.jpg`（8192×4096）
- `C:\Users\91252\Downloads\asset\image_second.png`（1823×912）
- `C:\Users\91252\Downloads\asset\image_third.png`（3069×1535）

底图源文件与项目运行时图片 SHA-256 一致。两张标注图只用于坐标校准，不进入运行时资产。

## 二级分类坐标

二级 hotspot 与分类 viewport 使用同一个中心；原有 zoom、activationZoom 和阈值保持不变。

| 阶段 | 二级分类 | ID | hotspot.x | hotspot.y | zoom |
| --- | --- | --- | ---: | ---: | ---: |
| upstream | 晶圆制造材料 | `category-upstream-wafer-materials` | 0.080088 | 0.570175 | 3.6 |
| upstream | 前道制造设备 | `category-upstream-front-end-equipment` | 0.214482 | 0.346491 | 3.6 |
| upstream | 封测设备与材料 | `category-upstream-packaging-test` | 0.223807 | 0.764254 | 3.6 |
| midstream | 晶圆制造 | `category-midstream-wafer-manufacturing` | 0.555129 | 0.307018 | 3.6 |
| midstream | 存储芯片产品 | `category-midstream-memory-products` | 0.648382 | 0.481360 | 3.6 |
| midstream | 先进封装 | `category-midstream-advanced-packaging` | 0.526056 | 0.656798 | 3.6 |
| midstream | 模组与存储产品 | `category-midstream-memory-modules` | 0.525507 | 0.830044 | 3.6 |
| downstream | 算力与服务器 | `category-downstream-compute-servers` | 0.851892 | 0.268640 | 3.6 |
| downstream | 终端电子 | `category-downstream-terminal-electronics` | 0.783873 | 0.676535 | 3.6 |

## 三级节点坐标

Atlas callout、Catalog marker、Catalog focusRect 中心和三级 viewportOverride 均基于同一组新 marker。`focusRect` 列顺序为 `x, y, width, height`。

| 阶段 | 二级分类 | 三级节点 | marker.x | marker.y | focusRect | zoom |
| --- | --- | --- | ---: | ---: | --- | ---: |
| upstream | 晶圆制造材料 | 半导体硅片 | 0.058325 | 0.577199 | 0.000000, 0.487199, 0.22, 0.18 | 3.6 |
| upstream | 晶圆制造材料 | 光刻胶与配套试剂 | 0.039752 | 0.506189 | 0.000000, 0.416189, 0.22, 0.18 | 3.6 |
| upstream | 晶圆制造材料 | 电子特气 | 0.061909 | 0.388274 | 0.000000, 0.298274, 0.22, 0.18 | 3.6 |
| upstream | 晶圆制造材料 | 靶材与前驱体 | 0.047898 | 0.730293 | 0.000000, 0.640293, 0.22, 0.18 | 3.6 |
| upstream | 晶圆制造材料 | CMP抛光材料 | 0.135549 | 0.523779 | 0.025549, 0.433779, 0.22, 0.18 | 3.6 |
| upstream | 前道制造设备 | 光刻设备 | 0.178886 | 0.303583 | 0.068886, 0.213583, 0.22, 0.18 | 3.6 |
| upstream | 前道制造设备 | 刻蚀设备 | 0.234930 | 0.357655 | 0.124930, 0.267655, 0.22, 0.18 | 3.6 |
| upstream | 前道制造设备 | 薄膜沉积设备 | 0.256435 | 0.251466 | 0.146435, 0.161466, 0.22, 0.18 | 3.6 |
| upstream | 前道制造设备 | 清洗与CMP设备 | 0.294558 | 0.162215 | 0.184558, 0.072215, 0.22, 0.18 | 3.6 |
| upstream | 前道制造设备 | 量检测设备 | 0.320626 | 0.072964 | 0.210626, 0.000000, 0.22, 0.18 | 3.6 |
| upstream | 封测设备与材料 | 封装设备 | 0.170414 | 0.811726 | 0.060414, 0.721726, 0.22, 0.18 | 3.6 |
| upstream | 封测设备与材料 | 测试设备 | 0.279570 | 0.751140 | 0.169570, 0.661140, 0.22, 0.18 | 3.6 |
| upstream | 封测设备与材料 | 封装基板与引线材料 | 0.256109 | 0.858632 | 0.146109, 0.768632, 0.22, 0.18 | 3.6 |
| midstream | 晶圆制造 | 存储晶圆制造 | 0.556533 | 0.309446 | 0.446533, 0.219446, 0.22, 0.18 | 3.6 |
| midstream | 存储芯片产品 | DRAM | 0.475073 | 0.506189 | 0.365073, 0.416189, 0.22, 0.18 | 3.6 |
| midstream | 存储芯片产品 | 3D NAND Flash | 0.546432 | 0.506840 | 0.436432, 0.416840, 0.22, 0.18 | 3.6 |
| midstream | 存储芯片产品 | NOR Flash | 0.617139 | 0.506189 | 0.507139, 0.416189, 0.22, 0.18 | 3.6 |
| midstream | 存储芯片产品 | EEPROM | 0.676768 | 0.507492 | 0.566768, 0.417492, 0.22, 0.18 | 3.6 |
| midstream | 先进封装 | HBM堆叠封装 | 0.535679 | 0.677524 | 0.425679, 0.587524, 0.22, 0.18 | 3.6 |
| midstream | 先进封装 | TSV与微凸块互连 | 0.475399 | 0.605212 | 0.365399, 0.515212, 0.22, 0.18 | 3.6 |
| midstream | 先进封装 | 硅中介层 | 0.609645 | 0.631922 | 0.499645, 0.541922, 0.22, 0.18 | 3.6 |
| midstream | 模组与存储产品 | 内存模组 | 0.443793 | 0.842997 | 0.333793, 0.752997, 0.22, 0.18 | 3.6 |
| midstream | 模组与存储产品 | 固态硬盘SSD | 0.610297 | 0.842997 | 0.500297, 0.752997, 0.22, 0.18 | 3.6 |
| downstream | 算力与服务器 | AI服务器 | 0.749756 | 0.213681 | 0.639756, 0.123681, 0.22, 0.18 | 3.6 |
| downstream | 算力与服务器 | 数据中心存储 | 0.851092 | 0.251466 | 0.741092, 0.161466, 0.22, 0.18 | 3.6 |
| downstream | 终端电子 | 智能手机与AI PC | 0.785272 | 0.824756 | 0.675272, 0.734756, 0.22, 0.18 | 3.6 |
| downstream | 终端电子 | 汽车电子与工业控制 | 0.939068 | 0.731596 | 0.780000, 0.641596, 0.22, 0.18 | 3.6 |

## 校准状态

新版 `image_third.png` 已包含全部 27 个三级节点圆点：

- “薄膜沉积设备”和“封装设备”已改用明确标注坐标，旧估算坐标已删除。
- 27 个 marker 均来自新标注图。
- focusRect 保留原有 0.22×0.18 尺寸，以新 marker 为中心重新定位并完成边界钳制。
- 所有分类与三级背景镜头均保留原 zoom 3.6，仅更新中心位置。
- 27 个 focusRect 均位于 `[0,1]` 边界内。

focusRect 尺寸仍是此前确认的临时统一值，后续可在 Catalog 编辑器中按实际物体边界精细调整。

## 验证记录

- 空间自动导入 revision：3 → 4；当前项目 revision：13
- 名称匹配：9/9 个二级分类、27/27 个三级节点
- Atlas manifest：9 categories、27 items
- Catalog manifest：3 stages、9 categories、27 items
- Atlas hotspot/viewport 与项目数据逐项一致
- Atlas marker/viewportOverride 与项目数据逐项一致
- Catalog marker/focusRect/viewportOverride 与项目数据逐项一致
- 越界 focusRect：0
- 原有 category zoom、item zoom、focusRect 宽高和 callout 配置保持不变
- 两份预览均成功生成

最新预览：

- Atlas：`http://localhost:8788/api/projects/memory-chip-industry-chain/previews/atlas/builds/atlas-1784114357897-13/index.html`
- Catalog：`http://localhost:8788/api/projects/memory-chip-industry-chain/previews/catalog/builds/catalog-1784114328229-13/index.html`

revision 13 运行时验收：Atlas 产物只包含页面曝光、分享点击、分享回流、停留时长四个 WeBlog 事件；Catalog manifest 和脚本均不包含埋点代码；两份产物均通过 ES5 语法校验并返回 HTTP 200。
