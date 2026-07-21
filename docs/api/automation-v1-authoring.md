# Automation v1 Authoring API

## 1. 文档定位

本文是 Workbench `0.4.0` 对外提供的稳定创建契约。它供独立版本的 Skill 或其他离线编排客户端使用，覆盖内容寻址素材上传、`GuideAuthoringBundle v1` 只读校验和项目原子创建。

本契约只负责创建项目。针对已有项目的定向修改必须等待独立的 `GuideAuthoringChangeSet` 契约，客户端不得退回未版本化接口或直接修改 `project.json`。

## 2. 能力发现

客户端在写入前必须调用：

```http
GET /api/automation/v1/capabilities
```

Workbench `0.4.0` 返回的相关能力为：

```json
{
  "authoringContracts": [
    {
      "name": "guide-authoring-bundle",
      "selected": "1.0.0",
      "supported": ["1.0.0"]
    }
  ],
  "capabilities": ["atomic-authoring-create", "content-addressed-authoring-blobs"]
}
```

客户端必须根据 Automation Protocol、contract version 和 capability 判断兼容性，不能仅比较 Workbench SemVer。

## 3. 标准流程

```text
计算每个本地文件的 SHA-256 与字节数
  → PUT 缺失 Blob
  → POST Bundle validate
  → 用户或 Agent 修复阻塞问题
  → POST Bundle apply（携带本次 validationToken）
  → 使用返回的 projectPath 进入工作台校准
```

`validate` 不创建项目、不注册项目资产、不写 operation journal。`apply` 会重新验证 Blob 和 Bundle，不把先前校验结果当作可变状态缓存。

## 4. 上传内容寻址 Blob

```http
PUT /api/automation/v1/authoring/blobs/{sha256}
Content-Type: application/octet-stream
X-Blob-Size: 12345

<原始文件字节>
```

约束：

- URL 中的 `sha256` 必须是 64 位小写十六进制 SHA-256；
- `X-Blob-Size` 或 `Content-Length` 至少提供一个；同时提供时必须一致；
- 请求体按字节流写入临时文件，边写入边计算 hash 和大小；
- 默认单 Blob 上限为 512 MiB；
- 相同 hash、相同字节重复上传是幂等操作；
- 已存在的 hash 文件若实际损坏，接口失败关闭，不会用新内容静默覆盖。

首次写入返回 `201`，重复命中返回 `200`：

```json
{
  "data": {
    "sha256": "…",
    "size": 12345,
    "created": true
  }
}
```

## 5. GuideAuthoringBundle v1

### 5.1 根结构

```json
{
  "contract": "guide-authoring-bundle",
  "contractVersion": "1.0.0",
  "idempotencyKey": "UUID",
  "expectedRevision": 0,
  "project": {},
  "knowledge": {},
  "files": [],
  "panorama": {},
  "spatial": {},
  "scenes": [],
  "navigation": {},
  "products": {},
  "integrations": {}
}
```

所有对象均为 strict shape，未知字段会被拒绝。Bundle 不接受本地绝对路径、相对文件路径、URL 或内嵌文件字节，只接受已上传 Blob 的 SHA-256 和大小。

### 5.2 项目与双语内容

`project` 包含：

- `id`：安全的 kebab-case 项目 ID；
- `version`：安全的业务版本路径段；
- `title`：按 locale 索引的文案；
- `localization.defaultLocale`；
- `localization.supportedLocales`。

项目标题、阶段、分类、条目、Scene、hintText 和分享文案必须覆盖所有 `supportedLocales`，且不得携带未声明语言。Workbench 不补写译文或业务事实。

### 5.3 三级知识

`knowledge.stages` 是固定 tuple：

1. `upstream`；
2. `midstream`；
3. `downstream`。

每个 stage 包含 `label` 和有序 `categories`。每个 category 包含稳定 ID、双语标题、可选双语描述、experience 绑定和有序 `items`。Workbench 根据数组顺序生成 category/item order，并建立内部 item registry。

category、item、scene 和 route ID 必须全局无冲突；Scene、view、spatial、route、Atlas categoryIds、分享图和转场资产引用必须存在且类型匹配。

### 5.4 文件联合

运行时文件：

```json
{
  "usage": "runtime",
  "assetId": "panorama",
  "kind": "image",
  "blobSha256": "…",
  "size": 12345,
  "mimeType": "image/png",
  "extension": "png",
  "semanticRole": "panorama-image",
  "originalName": "panorama.png"
}
```

支持的运行时语义角色：

- `panorama-image`；
- `html-scene-bundle`；
- `transition-video`；
- `transition-poster`；
- `share-image`。

原始制作资料：

```json
{
  "usage": "authoring-source",
  "fileRef": "hotspot-map",
  "blobSha256": "…",
  "size": 4567,
  "mediaType": "image/png",
  "semanticRole": "hotspot-map",
  "originalName": "hotspots.png"
}
```

支持 `knowledge-source`、`hotspot-map`、`callout-map` 和 `focusrect-map`。这些资料随项目保留在 `authoring-sources/`，但不会进入 `project.assets` 或发布资产闭包。

### 5.5 空间与可选配置

- `panorama.imageAssetId` 必须引用语义角色为 `panorama-image` 的 image；
- `spatial.categories[]` 以 categoryId 绑定标准化 category layout；
- `spatial.items[]` 以 itemId 绑定 marker、可选 callout、`focusRect` 和 viewport override；
- `scenes`、`navigation`、`products`、`integrations` 直接使用 Workbench 当前稳定领域类型；
- 未提供 products 时，Workbench 使用自身默认产品配置，并让 Atlas 覆盖 Bundle 中的所有分类。

缺失空间信息不会被填入虚构坐标。它会进入 `calibrationQueue`，供用户在 Workbench 中手动修复。Catalog 条目缺少 `focusRect` 时不能通过发布级校验。

HTML Scene ZIP 还必须满足：根目录存在精确名称 `index.html`，无绝对路径、反斜杠、`.` / `..` 段、符号链接、重复路径或大小写冲突；最多 200 个 entry、单文件最多 10 MiB、压缩包和解压总量分别最多 100 MiB。

## 6. 只读校验

```http
POST /api/automation/v1/authoring/bundles/validate
Content-Type: application/json

<GuideAuthoringBundle v1>
```

成功解析请求后固定返回 `200`。是否可 apply 由 `data.ok` 表示：

```json
{
  "data": {
    "ok": true,
    "contract": "guide-authoring-bundle",
    "contractVersion": "1.0.0",
    "workbenchVersion": "0.4.0",
    "requestHash": "…",
    "validationToken": "…",
    "validationTokenAlgorithm": "sha256-authoring-validation-v1",
    "blobFingerprint": "…",
    "projectId": "memory-chip-industry-chain",
    "baseRevision": 0,
    "projectedRevision": 1,
    "summary": {},
    "issues": [],
    "releaseIssues": [],
    "calibrationQueue": [],
    "normalizationNotes": []
  }
}
```

- `issues` 是阻止创建的字段级问题；
- `releaseIssues` 是创建后仍会阻止 Review 批准/发布的问题；
- `calibrationQueue` 是需要用户在工作台处理的 category/item 定位任务；
- `validationToken` 绑定精确 Bundle、Blob 声明、Workbench 版本和 expected revision；它不是身份认证令牌。

若 JSON 或 contract shape 无效，返回 `400 BAD_REQUEST`；不支持的 contract/version 返回 `400 CONTRACT_UNSUPPORTED`。

## 7. 原子创建

```http
POST /api/automation/v1/authoring/bundles/apply
Content-Type: application/json

{
  "bundle": { "…": "GuideAuthoringBundle v1" },
  "validationToken": "validate 返回的 token"
}
```

成功返回 `200`：

```json
{
  "data": {
    "contract": "guide-authoring-bundle",
    "contractVersion": "1.0.0",
    "workbenchVersion": "0.4.0",
    "projectId": "memory-chip-industry-chain",
    "revision": 1,
    "requestHash": "…",
    "validationToken": "…",
    "projectSha256": "…",
    "projectTreeSha256": "…",
    "projectTreeHashAlgorithm": "sha256-path-length-content-v1",
    "calibrationQueue": [],
    "projectPath": "/projects/memory-chip-industry-chain"
  }
}
```

`projectSha256` 是 canonical project JSON hash。`projectTreeSha256` 覆盖项目中除 `project.json` 外的所有持久化文件，包括运行时资产和 authoring source。

## 8. 原子性、幂等与恢复

创建过程：

1. 在 `data/authoring/staging/` 内物化完整项目目录；
2. 对 project JSON 和完整文件树计算目标 hash；
3. 写入 `prepared` operation journal；
4. 将完整项目目录一次 rename 到 `data/projects/{projectId}`；
5. 复核可见项目 hash，并把 journal 更新为 `succeeded`。

因此项目在 commit 前对 ProjectRepository 不可见，不会出现“可见 assets、缺 project.json”的半成品。

幂等范围为 `(contract, projectId, idempotencyKey)`：

- 同 key、同 request hash：返回第一次成功结果，不重复增加 revision；
- 同 key、不同 request hash：`409 IDEMPOTENCY_KEY_REUSED`；
- 进程在 `prepared` 后中断：下次同请求会复核 staging 或可见项目的 project/tree hash，再完成 journal；
- staging、journal 与可见项目互相矛盾：`409 OPERATION_RECOVERY_REQUIRED`，不猜测或覆盖现有项目。

## 9. 稳定错误码

| HTTP | code                          | 含义                                          |
| ---: | ----------------------------- | --------------------------------------------- |
|  400 | `BAD_REQUEST`                 | 请求 shape、header 或字段无效                 |
|  400 | `CONTRACT_UNSUPPORTED`        | contract 名称或版本不支持                     |
|  400 | `BLOB_HASH_MISMATCH`          | 上传字节与 URL hash 不符                      |
|  400 | `BLOB_SIZE_MISMATCH`          | 实际字节数与声明不符                          |
|  400 | `AUTHORING_VALIDATION_FAILED` | apply 时仍有阻塞问题                          |
|  409 | `PROJECT_EXISTS`              | creation-only 目标项目已存在                  |
|  409 | `IDEMPOTENCY_KEY_REUSED`      | 同 key 被用于不同请求                         |
|  409 | `VALIDATION_TOKEN_STALE`      | token 与当前请求/Workbench 不匹配             |
|  409 | `OPERATION_IN_PROGRESS`       | 同一 journal 正被更新                         |
|  409 | `OPERATION_RECOVERY_REQUIRED` | 持久状态无法安全自动恢复                      |
|  413 | `BLOB_TOO_LARGE`              | Blob 超出上限                                 |
|  500 | `APPLY_ATOMICITY_FAILED`      | commit 前或恢复中的内部失败；同请求可安全重试 |

客户端必须按 `code` 分支，不解析 `error` 自然语言。

## 10. Workspace 布局

```text
data/
├─ authoring/
│  ├─ blobs/{sha-prefix}/{sha256}
│  ├─ operations/{projectId}/{sha256(idempotencyKey)}.json
│  └─ staging/{operationId}/...
└─ projects/{projectId}/
   ├─ project.json
   ├─ assets/...
   └─ authoring-sources/
      ├─ manifest.json
      └─ blobs/{sha256}
```

Skill 只能通过 Automation v1 API 操作这些状态，不得直接读写上述目录。
