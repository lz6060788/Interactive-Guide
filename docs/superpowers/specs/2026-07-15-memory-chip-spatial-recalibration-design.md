# 存储芯片产业链空间重排设计

## 目标

使用更新后的 `image_second.png` 和 `image_third.png`，重新编排现有 `memory-chip-industry-chain` 项目在 Atlas 与 Catalog 中的二、三级节点定位。

底图 `image_root.jpg` 与当前项目运行时底图 SHA-256 一致，因此不替换资产，只更新 `project.json` 的归一化空间数据。

## 输入基准

- 二级标注图：`C:\Users\91252\Downloads\asset\image_second.png`，1823×912
- 三级标注图：`C:\Users\91252\Downloads\asset\image_third.png`，3069×1535
- 全景底图：`C:\Users\91252\Downloads\asset\image_root.jpg`，8192×4096

新三级标注图包含全部 27 个节点，不再保留“薄膜沉积设备”和“封装设备”的估算坐标。

## 更新规则

### 二级分类

对 9 个二级分类：

- 以新标注圆点写入 `panorama.categories[categoryId].hotspot`
- 将分类 `viewport.centerX/centerY` 同步移动到新 hotspot
- 保留现有 `viewport.zoom`、`activationZoom` 和显示阈值

### 三级节点

对 27 个三级节点：

- 以新标注圆点写入 `panorama.items[itemId].marker`
- 将 `viewportOverride.centerX/centerY` 同步移动到新 marker
- 保留现有 `viewportOverride.zoom`、callout 样式和显示阈值
- 保留现有 focusRect 的 width、height、radius 和 maskOpacity
- 以新 marker 为中心重新计算 focusRect 的 x/y，并进行 `[0,1]` 边界钳制

这使 Atlas callout、Catalog marker、Catalog 聚焦矩形和三级背景镜头共享同一个新的视觉中心。

## 数据安全

- 更新前保存当前 revision 和项目文件哈希
- PATCH 使用当前 revision 作为乐观锁
- 如果名称、ID 或坐标数量不是严格的 9/27，则停止更新
- 如果 schema 或双产品编译失败，则不生成新的验收预览
- 不修改知识结构、底图资产、产品主题、场景、路由和集成配置

## 验收标准

- 项目知识结构仍为 3/9/27
- 9 个分类 hotspot 与新二级标注图一致
- 27 个 item marker 与新三级标注图一致
- Atlas 与 Catalog 共享的节点位置一致
- 27 个 focusRect 均以新 marker 为中心且不越界
- 原有 zoom、矩形尺寸和 callout 配置保持不变
- Atlas/Catalog 均可重新生成预览，manifest 计数保持 9/27 与 3/9/27
- 映射报告删除旧的两个估算坐标说明，并记录新的图片尺寸与全部明确标注状态
