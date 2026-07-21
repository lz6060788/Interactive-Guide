# 存储芯片产业链项目引导实施计划

## 目标

按照已确认的设计，从 `C:\Users\91252\Downloads\asset` 确定性创建 `memory-chip-industry-chain` 项目，并验证 Atlas/Catalog 都能编译。

## 任务 1：固化项目输入

- 使用 artifact-tool 读取 `data.xlsx`，以 `分类路径` 还原 3/9/27 层级。
- 为 category/item 编写稳定的显式 ID。
- 从两张标注图提取并人工复核 9/27 个圆点的归一化坐标。
- 生成项目专属 bootstrap input 与坐标审计数据；不把标注图和表格登记为运行时资产。

验收：所有二级和三级名称一一对应，没有未映射节点或重复 ID。

## 任务 2：补齐通用 bootstrap CLI

- 修复 `skills/guide-project-bootstrap/scripts/bootstrap-project.ts`：不能只创建空项目和上传资产，必须写入完整知识、空间和产品配置。
- 解析资产源路径与最终 `sourcePath`，避免把目标路径误当作输入路径。
- 使用临时数据目录装配、校验、编译，再将项目原子移动到目标数据目录。
- 若目标项目存在则失败，不覆盖已有项目。
- 在失败时清理临时目录。

验收：CLI 可重复用于其他项目输入；失败不会留下半成品项目。

## 任务 3：生成完整项目数据

- 以 `image_root.jpg` 注册唯一 panorama image asset。
- 写入知识结构、Atlas categoryIds、category hotspot/viewport、item marker/callout。
- 写入 Catalog focusRect 与 viewportOverride：默认宽 0.22、高 0.18、zoom 3.6，并钳制边界。
- 不配置 scenes、routes、标的、F10 URL、转场视频或埋点。
- 生成映射报告，明确 27 个 focusRect 需要人工校准。

验收：GuideProject schema 与 release validator 均通过。

## 任务 4：创建并验证

- 将通过预检的项目写入 `data/projects/memory-chip-industry-chain`。
- 校验底图文件、asset registry 与 project.json 一致。
- 运行 Atlas 和 Catalog compiler。
- 核对产物计数：3 stages、9 categories、27 items、9 hotspots、27 callouts、27 focusRects。
- 运行与 bootstrap/domain/compiler 相关的自动化测试和 TypeScript 类型检查。

验收：后台列表能够读取新项目，两个编辑器可进入，两个产品均可生成预览。

## 任务 5：交付记录

- 更新项目 bootstrap 报告，记录源文件摘要、坐标、映射结果、验证命令和待人工校准内容。
- 不提交 `data/projects` 中的本地项目数据（该目录受 `.gitignore` 管理）；提交通用 CLI 修复、项目输入和文档。

验收：新人可根据报告复现创建过程并找到全部待校准项。
