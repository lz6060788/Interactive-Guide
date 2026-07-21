# 陀螺仪横向滑动模块接入计划

## 目标

- 为可左右拖动的内容新增“设备左右翻转驱动横向平移”能力。
- 能力同时接入运行时图片节点宿主 `PlayerHost` 与共享 HTML 节点脚本 `shared/node-viewer.js`。
- 保持手势拖拽与陀螺仪共存，不互相抢状态。

## 范围

- 运行时宿主：仅对 `imageFitMode === 'fitHeight'` 的图片节点启用横向体感平移。
- 共享 HTML 节点：对 `shared/node-viewer.js` 管理的横向可拖拽页面启用横向体感平移。
- 暂不覆盖 `fitWidth` 的纵向拖拽场景，也不改动 `nodes/html/` 下仍保留内联逻辑的页面。

## 设计要点

1. 拆出独立的陀螺仪控制模块，负责：
   - 监听 `deviceorientation`
   - 处理 iOS `DeviceOrientationEvent.requestPermission()` 分支
   - 将 `gamma` 左右翻转角度映射为横向位移
   - 提供启用、停用、暂停、恢复、重置基线等生命周期 API
2. 手动拖拽优先：
   - 拖拽进行中暂停陀螺仪驱动
   - 拖拽结束后以当前偏移重新设定体感基线，避免跳变
3. 权限策略：
   - 无需权限的浏览器直接启用监听
   - 需要用户手势授权的浏览器，显示“启用体感”按钮作为显式授权入口
   - 首次有效拖拽动作仍保留权限申请兜底，避免只靠显式按钮
4. 接入边界：
   - `PlayerHost` 负责根据当前节点是否可横向拖动来启停模块
   - `shared/node-viewer.js` 负责在图片居中、DOM 初始化和退出卸载阶段同步体感状态

## 计划步骤

1. 新增运行时宿主侧陀螺仪模块并接入 `PlayerHost`
2. 新增共享 HTML 节点侧 `shared/gyro-pan-controller.js`
3. 改造 `shared/node-viewer.js`，接入体感平移与拖拽协同
4. 为 9 个复用共享脚本的 HTML 页面补充陀螺仪脚本引用
5. 执行类型检查、构建和诊断，回填文档结果

## 进度

- [x] 完成现状梳理与方案确认
- [x] 完成宿主侧模块实现与接入
- [x] 完成共享 HTML 侧模块实现与接入
- [x] 完成共享页面脚本引用更新
- [x] 完成校验与结果回填

## 实现结果

- 新增 `src/runtime/player-core/gyro-pan-controller.ts`，提供独立的体感平移控制器。
- `PlayerHost` 已接入该控制器，仅在 `imageFitMode === 'fitHeight'` 且非转场中的图片节点启用。
- 新增 `data/workspace/guide_1779344993154/nodes/shared/gyro-pan-controller.js`，供共享 HTML 节点脚本复用。
- `shared/node-viewer.js` 已接入体感平移，并与初始化、退出卸载、背景点击返回、手动拖拽协同工作。
- iOS 等需要授权的环境下，宿主和共享 HTML 页面都会显示“启用体感”按钮。
- 9 个复用 `shared/node-viewer.js` 的 HTML 页面已补充 `shared/gyro-pan-controller.js` 引用。

## 校验结果

- `npm run typecheck` 通过
- `npm run build:player-host` 通过
- `player-host.ts`、`gyro-pan-controller.ts`、`shared/node-viewer.js`、`shared/gyro-pan-controller.js` diagnostics 均为空
