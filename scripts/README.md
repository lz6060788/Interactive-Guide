# Bundle 上传工具

将 Interactive Guide 的 runtime bundle 产物上传到 S3 兼容的对象存储（如腾讯云 COS）。

## 依赖

- Node.js 18+

无需安装任何 npm 依赖，`upload-bundle.mjs` 是自包含的单文件。

## 配置

在脚本同目录下创建 `.env` 文件，或通过环境变量传入：

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `OBJECT_STORAGE_ENDPOINT` | 是 | 对象存储 endpoint | `https://cos.ap-nanjing.myqcloud.com` |
| `OBJECT_STORAGE_BUCKET` | 是 | 存储桶名称 | `narrative-1301799665` |
| `OBJECT_STORAGE_ACCESS_KEY` | 是 | 访问密钥 ID | `AKIDxxx` |
| `OBJECT_STORAGE_SECRET_KEY` | 是 | 访问密钥 Secret | `Nn8cxx` |
| `OBJECT_STORAGE_REGION` | 否 | 区域 | `ap-nanjing`（默认 `oss-cn-hangzhou`） |
| `OBJECT_STORAGE_PROTOCOL` | 否 | 协议 | `https`（默认） |
| `OBJECT_STORAGE_PREFIX` | 否 | key 前缀 | 留空 |
| `BUNDLE_PUBLIC_BASE_URL` | 否 | 公网访问域名 | 留空时自动拼接 |

### .env 示例

```env
OBJECT_STORAGE_ENDPOINT=https://cos.ap-nanjing.myqcloud.com
OBJECT_STORAGE_BUCKET=narrative-1301799665
OBJECT_STORAGE_ACCESS_KEY=<your-access-key>
OBJECT_STORAGE_SECRET_KEY=<your-secret-key>
OBJECT_STORAGE_REGION=ap-nanjing
```

## 用法

```bash
node upload-bundle.mjs <bundle目录路径>
```

### 示例

```bash
# 上传指定 bundle
node upload-bundle.mjs ./data/runtime-bundles/guide_1779344993154-1779701357572

# 查看帮助
node upload-bundle.mjs --help
```

### 输出示例

```
Bundle:    guide_1779344993154-1779701357572
Guide:     guide_1779344993154 v1.0.0
Endpoint:  https://cos.ap-nanjing.myqcloud.com
Bucket:    narrative-1301799665
Key prefix: interactive-guide/guide_1779344993154/1.0.0
Public URL: https://narrative-1301799665.cos.ap-nanjing.myqcloud.com

  [OK] app.js (90.0 KB)
  [OK] manifest.json (31.4 KB)
  [OK] index.html (1.2 KB)
  ...

Done: 43 uploaded, 0 failed
Entry: https://narrative-1301799665.cos.ap-nanjing.myqcloud.com/interactive-guide/guide_1779344993154/1.0.0/index.html
```

## OSS 目录结构

上传后的 key 前缀为 `interactive-guide/{guideId}/{version}/`，完整结构：

```
interactive-guide/
  {guideId}/
    {version}/
      manifest.json
      bundle.json
      index.html
      styles.css
      app.js
      assets/
        nodes/
          {nodeId}.png
          {nodeId}.html
          lib/*.js
          shared/*
        edges/
          {edgeId}.mp4
```

## 访问

上传完成后，通过以下地址访问：

```
{BUNDLE_PUBLIC_BASE_URL}/interactive-guide/{guideId}/{version}/index.html
```

`BUNDLE_PUBLIC_BASE_URL` 未设置时自动拼接为 `https://{bucket}.{endpoint_host}`。

如果存储桶未开启公有读权限，需要在云控制台配置或通过 CDN 加速访问。

## 重新构建

修改 `upload-bundle.ts` 后重新打包：

```bash
npm run build:upload-bundle
```

产物输出到 `scripts/dist/upload-bundle.mjs`。
