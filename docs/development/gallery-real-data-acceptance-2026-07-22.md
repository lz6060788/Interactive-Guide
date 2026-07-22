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

## 5. 自动化与构建结果

| 检查 | 结果 |
|------|------|
| `npm test` | 201/201 通过 |
| 管理端 Vitest | 30/30 通过 |
| `npm run typecheck` | 通过 |
| `npm run build:server` | 通过 |
| `npm run build:admin` | 通过 |
| `npm run lint` | 0 error；7 个既有 warning |

新增用例覆盖 Gallery 编译、缺图失败、双语解析、URL ID/标题聚焦、跨阶段选择派生、编辑器结构能力，以及预览在外部切换三级节点时复用已挂载场景、不回跳首项。

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

## 7. 语言说明

真实工作簿没有英文列。为遵守“不生成合成数据、不伪造翻译”的项目规则，验收项目仅声明 `zh-CN`。Gallery 对中英文清单、提示文字和节点内容的切换能力由包含真实双语字段的自动化用例验证；业务英文文案补齐后无需改代码即可启用 `en-US`。
