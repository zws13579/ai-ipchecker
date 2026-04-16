# IP查询工具 (IP Lookup Tool)

一个专业的IP查询网站，提供全面的IP地址信息查询和隐私泄露检测功能。

## 功能特性

### 核心功能

- **IP属地查询** - 查询IP地址的国家、城市、区域、ISP信息
- **双栈IP检测** - 同时检测IPv4和IPv6地址
- **ASN信息查询** - 显示自治系统号详细信息
- **IP定位地图** - 使用OpenStreetMap显示IP地理位置
- **IP纯净度检测** - 检测VPN、代理、Tor、数据中心等风险

### 隐私泄露检测

- **WebRTC泄露检测** - 实时检测浏览器WebRTC是否泄露真实IP
- **DNS泄露检测** - 基于正确的DNS泄露检测原理，检测DNS查询是否存在泄露风险

## 技术栈

- **前端框架**: Next.js 16 (App Router)
- **UI组件**: shadcn/ui (基于 Radix UI)
- **样式**: Tailwind CSS 4
- **地图**: Leaflet + OpenStreetMap
- **部署**: Cloudflare Pages / Vercel / 任意Node.js环境

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器 (端口5000)
pnpm dev

# 代码检查
pnpm lint

# TypeScript检查
pnpm ts-check

# 构建生产版本
pnpm build

# 启动生产服务
pnpm start
```

## API接口

### GET /api/ipinfo

查询指定IP的详细信息，或自动检测当前公网IP。

**参数**:
- `ip` (可选): 要查询的IP地址
- `detect` (可选): 自动检测当前公网IP

**响应**:
```json
{
  "success": true,
  "data": {
    "geo": {
      "ip": "8.8.8.8",
      "country": "United States",
      "countryCode": "US",
      "region": "Virginia",
      "city": "Ashburn",
      "latitude": 39.03,
      "longitude": -77.5,
      "isp": "Google LLC",
      "asn": "15169",
      "asName": "Google LLC",
      "timezone": "America/New_York"
    },
    "cleanliness": {
      "isClean": true,
      "riskLevel": "low",
      "cleanlinessScore": 100,
      "details": {
        "isProxy": false,
        "isVPN": false,
        "isTor": false,
        "isHosting": false,
        "isDatacenter": false,
        "isChineseIP": false
      }
    },
    "asn": {
      "asn": "AS15169",
      "name": "GOOGLE",
      "desc": "Google LLC"
    }
  }
}
```

### GET /api/myip

同时获取用户的 IPv4 和 IPv6 地址及其详细信息。

**响应**:
```json
{
  "success": true,
  "ipv4": {
    "ip": "8.8.8.8",
    "version": "ipv4",
    "isDetected": true,
    "geo": { ... },
    "cleanliness": { ... }
  },
  "ipv6": {
    "ip": "未检测到IPv6",
    "version": "ipv6",
    "isDetected": false
  }
}
```

### GET /api/dns-leak

DNS泄露检测API。

**响应**:
```json
{
  "success": true,
  "testId": "test-123456-abc",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "results": [
    {
      "dnsServer": "Cloudflare",
      "dnsServerIP": "1.1.1.1",
      "resolvedIP": null,
      "country": "Australia",
      "isp": "Cloudflare, Inc",
      "success": false
    },
    {
      "dnsServer": "阿里DNS",
      "dnsServerIP": "223.5.5.5",
      "resolvedIP": "23.239.16.110",
      "country": "China",
      "isp": "Hangzhou Alibaba Advertising Co",
      "success": true
    }
  ],
  "leakInfo": {
    "isLeaking": true,
    "leakLevel": "medium",
    "explanation": "检测到DNS查询经过多个不同的DNS服务器，可能存在DNS泄露。"
  },
  "recommendations": [
    "使用可靠的VPN服务确保DNS查询安全",
    "启用DNS over HTTPS (DoH)加密DNS流量"
  ]
}
```

## 第三方API

项目使用以下免费API服务：

- [ip-api.com](http://ip-api.com) - IP地理位置查询
- [ipinfo.io](https://ipinfo.io) - IP信息查询
- [RIPEstat](https://stat.ripe.net) - ASN信息查询
- [OpenStreetMap](https://www.openstreetmap.org) - 地图瓦片服务

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── dns-leak/           # DNS泄露检测API
│   │   │   └── route.ts
│   │   ├── ipinfo/             # IP信息查询API
│   │   │   └── route.ts
│   │   └── myip/               # 双栈IP检测API
│   │       └── route.ts
│   ├── page.tsx                # 主页
│   ├── layout.tsx              # 布局组件
│   └── globals.css             # 全局样式
├── components/
│   ├── detectors/              # 检测组件
│   │   ├── DNSLeakDetector.tsx
│   │   └── WebRTCLeakDetector.tsx
│   ├── MapView.tsx             # 地图组件
│   └── ui/                     # shadcn/ui组件库
└── lib/
    └── utils.ts                # 工具函数
```

## DNS泄露检测原理

DNS泄露检测的核心原理：

1. **唯一标识生成** - 生成随机子域名作为检测标识
2. **触发查询** - 客户端通过多个DoH服务器查询该域名
3. **路径追踪** - 分析各DoH服务器的响应和地理位置
4. **结果分析** - 根据DNS服务器响应的多样性判断泄露等级

泄露等级：
- **安全** - DNS查询正常，响应来源单一
- **低风险** - DNS查询通过远程服务器进行（VPN正常表现）
- **中风险** - 多个不同的DNS服务器响应
- **高风险** - 多个不同的DNS服务器响应
- **严重风险** - 大量不同的DNS服务器响应

## 部署

### Cloudflare Pages

#### 方式一：GitHub Actions 自动部署

1. Fork 此仓库到你的 GitHub
2. 在 Cloudflare Dashboard 创建新 Pages 项目
3. 连接到你的 GitHub 仓库
4. 选择框架预设（Next.js）
5. 添加以下 GitHub Secrets：
   - `CLOUDFLARE_API_TOKEN`: 你的 Cloudflare API Token
   - `CLOUDFLARE_ACCOUNT_ID`: 你的 Cloudflare Account ID
   - `CLOUDFLARE_PROJECT_NAME`: 项目名称

6. **重要**：在 Cloudflare Dashboard 中设置兼容性标志：
   - 进入 Pages 项目 → Settings → Compatibility flags
   - 为 Production 和 Preview 环境都添加 `nodejs_compat` 标志

#### 方式二：手动部署

1. Fork 此仓库到你的 GitHub
2. 在 Cloudflare Dashboard 创建新 Pages 项目
3. 连接到你的 GitHub 仓库
4. 选择框架预设（Next.js）
5. 构建命令: `pnpm build:cloudflare`
6. 输出目录: `.open-next`
7. **重要**：在 Settings → Compatibility flags 中添加 `nodejs_compat`

### Vercel

```bash
pnpm install
pnpm build
```

然后部署到 Vercel 即可。

### 任意Node.js环境

```bash
pnpm install
pnpm build
pnpm start
```

服务将在 5000 端口运行。

## 注意事项

1. WebRTC泄露检测需要浏览器支持 WebRTC
2. DNS泄露检测使用服务端API，需要在支持Node.js的环境中运行
3. 地图组件使用动态导入，避免 SSR 问题
4. API 路由使用 Edge Runtime，可在全球快速响应

## License

MIT
