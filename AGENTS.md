# IP查询工具 - 项目文档

## 项目概述

这是一个专业的IP查询网站，提供全面的IP地址信息查询和隐私泄露检测功能。兼容 Cloudflare Pages 部署。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **地图**: Leaflet + OpenStreetMap
- **部署**: Cloudflare Pages + GitHub Actions

## 目录结构

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── ipinfo/
│   │   │       └── route.ts      # IP查询API (Edge Runtime)
│   │   ├── page.tsx              # 主页（IP查询界面）
│   │   ├── layout.tsx            # 布局组件
│   │   └── globals.css           # 全局样式
│   ├── components/
│   │   ├── MapView.tsx           # 地图组件
│   │   └── ui/                   # shadcn/ui组件库
│   ├── hooks/                    # 自定义Hooks
│   └── lib/
│       └── utils.ts              # 工具函数
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions 配置
├── public/                       # 静态资源
├── .cloudflare                   # Cloudflare配置
└── package.json                  # 依赖管理
```

## 功能特性

### 1. 双栈IP检测（IPv4 + IPv6）
- 同时检测用户的IPv4和IPv6地址
- 分别显示IPv4和IPv6的地理位置信息
- 分别显示IPv4和IPv6对应的地图定位
- 分别显示IPv4和IPv6的IP纯净度
- 自动获取并展示ISP、国家、城市、坐标等信息

### 2. IP属地查询
- 查询IP地址的地理位置信息
- 显示国家、城市、区域、ISP
- 显示时区和坐标信息

### 3. ASN信息查询
- 查询IP所属的自治系统号信息
- 显示网络名称、描述和持有者信息
- 使用RIPEstat API进行查询

### 4. IP定位地图
- 使用Leaflet + OpenStreetMap显示IP位置
- 支持缩放和拖拽
- 自定义标记图标

### 5. IP纯净度检测
- 检测VPN使用情况
- 检测代理服务器
- 检测Tor出口节点
- 检测数据中心/托管服务
- 检测中国IP（包含中国大陆、香港、台湾、澳门）
- 风险等级评估（低/中/高）
- 精确的纯净度分数计算（0-100）

### 6. WebRTC泄露检测
- 通过RTCPeerConnection检测本地IP泄露
- 实时收集ICE候选地址
- 显示泄露的IP地址列表

### 7. DNS泄露检测
- 检测DNS查询是否泄露
- 提供安全建议
- 建议使用DNS over HTTPS

## 页面结构

### 1. 双栈IP检测卡片（首页自动加载）
- 显示IPv4和IPv6地址信息
- 分别显示地图定位
- 分别显示IP纯净度

### 2. 隐私泄露检测
- WebRTC泄露检测
- DNS泄露检测

### 3. 隐私保护建议

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建生产版本
pnpm build

# Cloudflare Pages 构建
pnpm build:cloudflare

# 启动生产服务
pnpm start

# 代码检查
pnpm lint

# TypeScript类型检查
pnpm ts-check
```

## 环境要求

- Node.js 20+
- pnpm 9+

## Cloudflare Pages 部署

### 1. GitHub Actions 自动部署（推荐）

1. Fork 仓库到你的 GitHub
2. 在 Cloudflare Dashboard 获取：
   - API Token
   - Account ID
   - 项目名称
3. 添加 GitHub Secrets：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_PROJECT_NAME`
4. 推送代码到 main 分支，自动部署

### 2. 手动部署

```bash
# 安装依赖
pnpm install

# 构建 Cloudflare 版本
pnpm build:cloudflare

# 部署
npx wrangler pages deploy .open-next
```

## API接口

### GET /api/ipinfo

查询指定IP的详细信息，或自动检测当前公网IP。

**参数**:
- `ip` (可选): 要查询的IP地址
- `detect=1` (可选): 自动检测当前公网IP（服务端调用外部API，避免CORS问题）

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
      "reasons": [],
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
      "desc": "Google LLC",
      "holders": ["AS15169"]
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

## 第三方API

项目使用以下免费API服务：

1. **ip-api.com** - IP地理位置查询 + 数据中心/代理检测
2. **ipinfo.io** - IP信息查询（地理位置、ASN归属）
3. **ProxyCheck.io** - 代理/VPN/数据中心检测（免费版每天100次）
4. **RIPEstat** - ASN信息查询
5. **OpenStreetMap** - 地图瓦片服务
6. **icanhazip** - IPv4/IPv6地址检测
7. **ifconfig.me** - IPv4/IPv6地址检测
8. **checkip.amazonaws.com** - IPv4地址检测

## 注意事项

1. WebRTC泄露检测需要浏览器支持WebRTC
2. DNS泄露检测为模拟实现，实际生产环境需要服务端支持
3. 地图组件使用动态导入，避免SSR问题
4. API路由使用Edge Runtime，可在Cloudflare边缘节点运行
5. 所有fetch调用使用`cache: 'no-store'`以兼容Edge Runtime

## 纯净度分数计算规则

纯净度分数基于实际检测结果精确计算，分数范围 0-100。

### 基础分值
- 初始分数：100分

### 扣分规则
| 检测项 | 扣分 | 说明 |
|--------|------|------|
| 代理服务器 | -45分 | 严重风险 |
| Tor出口节点 | -40分 | 严重风险 |
| VPN服务 | -30分 | 中高风险 |
| 可疑中国出口节点 | -35分 | 海外IP但使用中国运营商 |
| 托管服务 | -15分 | 中等风险 |
| 数据中心 | -10分 | 轻微风险 |
| 中国大陆IP | -5分 | 仅地理位置因素 |
| 港澳台IP | -3分 | 仅地理位置因素 |

## 安全建议

项目提供以下隐私保护建议：

- 使用可靠的VPN服务隐藏真实IP
- 启用浏览器WebRTC保护功能
- 使用DNS over HTTPS加密DNS查询
- 定期检查IP纯净度
