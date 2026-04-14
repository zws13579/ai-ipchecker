# IP查询工具 (IP Lookup Tool)

一个专业的IP查询网站，提供全面的IP地址信息查询和隐私泄露检测功能。

## 功能特性

- **IP属地查询** - 查询IP地址的国家、城市、区域、ISP信息
- **ASN信息查询** - 显示自治系统号详细信息
- **IP定位地图** - 使用OpenStreetMap显示IP地理位置
- **IP纯净度检测** - 检测VPN、代理、Tor、数据中心等风险
- **WebRTC泄露检测** - 实时检测浏览器WebRTC是否泄露真实IP
- **DNS泄露检测** - 检测DNS查询是否存在泄露风险

## 技术栈

- **前端框架**: Next.js 16 (App Router)
- **UI组件**: shadcn/ui (基于 Radix UI)
- **样式**: Tailwind CSS 4
- **地图**: Leaflet + OpenStreetMap
- **部署**: Cloudflare Pages

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 代码检查
pnpm lint

# TypeScript检查
pnpm ts-check

# 构建
pnpm build
```

## 部署到 Cloudflare Pages

### 方法一：使用 GitHub Actions（推荐）

1. **Fork 此仓库到你的 GitHub**

2. **获取 Cloudflare 凭证**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 获取以下信息：
     - Cloudflare API Token
     - Cloudflare Account ID
     - 项目名称

3. **添加 GitHub Secrets**
   在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加：
   - `CLOUDFLARE_API_TOKEN`: 你的 Cloudflare API Token
   - `CLOUDFLARE_ACCOUNT_ID`: 你的 Cloudflare Account ID
   - `CLOUDFLARE_PROJECT_NAME`: 部署的项目名称（如 `ip-lookup`）

4. **推送代码到 main 分支**
   GitHub Actions 将自动构建并部署。

### 方法二：手动部署

```bash
# 安装依赖
pnpm install

# 构建并转换为 Cloudflare Workers 格式
pnpm build:cloudflare

# 使用 wrangler 部署
npx wrangler pages deploy .open-next
```

### Cloudflare 零配置部署

如果你使用 Next.js 16 和 @opennextjs/cloudflare v1.18+，可以自动部署：

1. Fork 此仓库
2. 在 Cloudflare Dashboard 中创建新 Pages 项目
3. 连接到你的 GitHub 仓库
4. 选择框架预设（Next.js）
5. 点击部署

## 环境变量

无需配置环境变量，API 使用免费的第三方服务：
- [ip-api.com](http://ip-api.com) - IP地理位置查询
- [ipinfo.io](https://ipinfo.io) - IP纯净度检测
- [RIPEstat](https://stat.ripe.net) - ASN信息查询

## 目录结构

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── ipinfo/
│   │   │       └── route.ts      # IP查询API (Edge Runtime)
│   │   ├── page.tsx              # 主页
│   │   ├── layout.tsx            # 布局组件
│   │   └── globals.css           # 全局样式
│   ├── components/
│   │   ├── MapView.tsx           # 地图组件
│   │   └── ui/                   # shadcn/ui组件库
│   └── lib/
│       └── utils.ts              # 工具函数
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions 配置
└── public/                       # 静态资源
```

## Cloudflare Pages 配置

- **构建命令**: `pnpm build:cloudflare`
- **输出目录**: `.open-next`
- **Node.js 版本**: 20.x

## 注意事项

1. WebRTC泄露检测需要浏览器支持 WebRTC
2. DNS泄露检测为客户端模拟实现
3. 地图组件使用动态导入，避免 SSR 问题
4. API 路由使用 Edge Runtime，可在全球快速响应

## License

MIT
