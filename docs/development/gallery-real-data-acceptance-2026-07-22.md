# Gallery 真实数据与产物验收记录

> 日期：2026-07-22  
> 状态：自动化与本地浏览器验收通过，待业务方终验  
> 项目：`semiconductor-equipment-gallery`

## 1. 验收输入

- 工作簿：`产业链分类表.xlsx`
- 工作表：`半导体设备`
- 数据范围：`A1:G30`，1 行表头、29 行三级节点
- 节点图片：29 张 PNG 透明图

外部绝对路径只在本次导入时使用，没有写入 `project.json`、Gallery Manifest 或独立产物。

## 2. 数据映射结果

| 项目 | 结果 |
|------|------|
| 三级节点 | 29 |
| PNG 图片 | 29 |
| 精确同名映射 | 28 |
| 显式别名映射 | 1 |
| 缺失图片 | 0 |
| 重复占用 | 0 |
| 无主图片 | 0 |

唯一别名：工作簿第 8 行的“掩模版”绑定到 `掩模板.png`。导入器没有启用通用模糊匹配。

完整逐项映射记录位于：

- `data/projects/semiconductor-equipment-gallery/gallery-import-report.json`
- `data/projects/semiconductor-equipment-gallery/project.json`

## 3. 产物检查

真实 Gallery bundle 已由与工作台相同的 compiler、browser runtime packager 和 static validator 生成：

- 产品：`gallery`
- Manifest：Gallery Manifest 1.0.0
- 阶段数：3
- 条目数：29
- 唯一图片引用：29
- JavaScript：ES5 语法校验通过
- 静态资源：全部为 bundle 内相对路径

最近一次验收产物：

- `data/draft-builds/semiconductor-equipment-gallery/gallery-1784694092793-1/gallery/index.html`
- `data/draft-builds/semiconductor-equipment-gallery/gallery-1784694092793-1/gallery/gallery-acceptance.png`

## 4. 浏览器验收

在 375 × 808 视口、Chrome headless 环境执行：

1. 以 `?focus=item-010` 打开产物，激活节点为“光刻设备”，图片为 `光刻设备.png`。
2. 点击 `item-011` 后，右侧激活项、左侧图片和 URL 同步变为“涂胶显影设备”。
3. 切换到下游后，默认激活“逻辑晶圆厂”，URL 同步为 `item-024`。
4. 上述三个状态的可见图片元素数量均为 1。
5. 真实项目未设置 Atlas 链接，Gallery 右下角没有 Atlas 按钮。
6. 页面无运行时脚本错误；唯一 404 为静态测试服务器未提供 `favicon.ico`，不属于产品资源。
7. 以 `?focus=射频电源` 打开最新预览产物，初始化节点为稳定 ID `item-002`，左图替代文本和实际加载图片均为“射频电源”。

## 5. 自动化与构建结果

| 检查 | 结果 |
|------|------|
| `npm test` | 206/206 通过 |
| 管理端 Vitest | 32/32 通过 |
| `npm run typecheck` | 通过 |
| `npm run build:server` | 通过 |
| `npm run build:admin` | 通过 |
| `npm run lint` | 0 error；7 个既有 warning |

新增用例覆盖 Gallery 编译、缺图失败、双语解析、URL ID/任意已维护语言标题聚焦、跨阶段选择派生、编辑器结构能力、单语产物隐藏语言入口和双语产物语言切换，以及预览在外部切换三级节点时复用已挂载场景、不回跳首项。

## 6. 工作台验收入口

启动后端与管理端后：

1. 在项目首页找到 `semiconductor-equipment-gallery`。
2. 点击 Gallery 进入 `/projects/semiconductor-equipment-gallery/gallery-editor`。
3. 左栏显示 3 个阶段、全部二级分类和 29 个已绑定节点。
4. 中栏显示真实 Gallery runtime；右栏可修改中文标题/描述、复用图片或上传替换图片。
5. “真实预览”和“Gallery ZIP”会先保存当前修改，再使用正式构建链路产出。

### 6.1 工作台回归验收

在 1920 × 1080 Chrome headless 环境针对真实项目执行：

1. Gallery 工具栏计算背景色为 `rgb(251, 250, 246)`，结构栏、工具栏和属性栏使用工作台暖白主题；黑色仅存在于中栏真实 Gallery runtime 预览。
2. 点击左侧“射频电源”，等待两轮预览过渡后，结构树和属性栏仍保持“射频电源”，未回到首项“真空系统”。
3. 在上游创建临时二级节点，新增并重命名三级节点，保存后状态恢复为 `all synced`。
4. 删除该二级节点及其三级节点并再次保存，临时数据从知识树、空间布局、Gallery 图片映射及 Atlas/导航/Scene 关联中移除。
5. 全过程无浏览器控制台或页面脚本错误；验收结束后真实项目结构恢复为原始 29 节点。
6. 中栏 Gallery 预览容器宽高差不超过 1px，实际为 1:1；底部提示的几何中心与运行时容器中心重合。
7. 将二级分类栏约束到 120px 后仍产生横向溢出，计算样式为 `overflow-x: auto`、`scrollbar-width: none`，真实鼠标纵向滚轮可驱动横向位移；恢复宽度后布局位置和高度不变。
8. Catalog 与 Gallery 共用的运行时 chrome 单元测试验证：提示左右安全区严格对称、WebKit/Firefox/旧 Edge 滚动条均隐藏、激活二级分类自动滚动到可视区。
9. 以 `?focus=射频电源` 打开工作台，属性栏直接初始化为稳定节点 `item-002`；点击“+ English”后该节点英文标题为空，可录入 `RF Power Supply`，工作台进入未保存状态。验收过程未点击保存，真实项目仍保持仅中文配置。

## 7. 语言说明

真实工作簿没有英文列。为遵守“不生成合成数据、不伪造翻译”的项目规则，验收项目仅声明 `zh-CN`。

Gallery 工作台会为仅中文项目显示“+ English”：启用后只确定性补入固定阶段标签 `Upstream / Midstream / Downstream`，分类、节点和底部提示保持空白等待业务录入；项目英文标题和分享文案在项目设置页维护。保存时先写入语言配置，再按修订号写入英文内容。发布门禁仍要求所有已启用语言完整，避免把不完整英文产物误发布。

独立产物在启用两种及以上语言时显示左下角 `中 / EN` 切换器，并保留当前 `focus`；`focus` 可使用稳定节点 ID、中文标题或英文标题，标题匹配在选择 `lang` 之前完成。跨语言标题聚焦和双语 Manifest 由自动化用例验证，工作台英文空白录入态由真实浏览器验证。

## 8. 图片纵向滚动实验分支验收

分支 `codex/gallery-image-scroll-experiment` 在不改变 manifest 与真实数据的前提下，将单图淡入淡出替换为纵向滚动：

1. 从“真空系统”选择顺序靠后的“射频电源”时，浏览器捕获到 `data-motion=scrolling` 与 `data-direction=forward`，完成后回到 `idle`。
2. 不通过点击、直接滚动右侧三级列表到 `item-003` 时，左图再次进入纵向滚动，最终图片辅助文本与右侧激活项同时为“运动控制系统”。
3. 整个离场/入场过程的图片面板中始终只有 1 个 `img` 元素；方向正反计算另由单元测试覆盖。
4. 方形预览、提示居中、二级标签横向滚动、稳定选择和结构 CRUD 浏览器回归继续通过。
5. 根测试 206/206、管理端测试 32/32 通过；根与管理端类型检查、Server/Admin 生产构建通过。
