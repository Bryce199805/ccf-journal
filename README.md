# CCF 推荐期刊会议目录

CCF 推荐学术会议和期刊的在线查询工具，支持分区查询、影响因子排序、收藏、自定义标签、备注以及跨设备同步等功能。

## 功能

- 期刊/会议分类浏览，支持卡片和表格两种视图
- 中科院分区、新锐分区、JCR 分区多维度筛选（支持多选）
- TOP 期刊筛选
- 影响因子、CiteScore、H 指数等指标排序
- 期刊详情弹窗：分区对比、排名、投稿信息一览
- 收藏功能（支持游客和登录用户）
- 自定义标签分类，按标签筛选收藏条目
- 个人备注，为任意条目添加备注信息
- 用户注册登录，跨设备数据同步
- 深色模式

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + Vite 8 + TypeScript + Tailwind CSS v4 + shadcn/ui |
| 后端 | Go 1.22 + Gin + SQLite (CGO) |
| 爬虫 | Node.js (Puppeteer) |
| 部署 | Docker (多阶段构建) + Nginx 反向代理 |

## 项目结构

```
├── scraper/          # LetPub 数据爬虫
│   ├── batch_scrape.js
│   ├── scrape_remaining.js
│   ├── import_data.js    # 生成 server/db/import_data.json
│   └── lib/
├── server/           # Go 后端 API
│   ├── cmd/server/
│   ├── db/schema.sql
│   └── internal/
├── web/              # React 前端
│   ├── src/
│   └── public/
├── docker/           # Docker 部署
│   ├── Dockerfile
│   └── docker-compose.yml
└── data/             # 数据文件
    ├── all_journals_correct.json
    ├── all_conferences_correct.json
    ├── all_letpub_data.json
    └── letpub_full.json
```

## 本地开发

### 前置条件

- Node.js 20+
- Go 1.22+
- Docker & Docker Compose

### 准备数据

```bash
# 将数据文件放入 data/ 目录（需自行准备）
# data/letpub_full.json - LetPub 爬取的期刊数据
# data/all_conferences_correct.json - CCF 会议列表
# data/all_journals_correct.json - CCF 期刊列表

# 生成 import_data.json
cd scraper && node import_data.js
```

### 启动后端

```bash
cd server
go run ./cmd/server
```

### 启动前端

```bash
cd web
npm install
npm run dev
```

前端开发服务器默认代理 API 请求到 `http://localhost:8080`。

## Docker 部署

```bash
# 1. 生成 import_data.json
cd scraper && node import_data.js && cd ..

# 2. 构建并启动
cd docker && docker compose up -d
```

容器内后端监听 8080 端口，配合 Nginx 反向代理提供 HTTPS 访问。

### Nginx 反向代理配置示例

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/nginx/ssl/your-domain.pem;
    ssl_certificate_key /etc/nginx/ssl/your-domain.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://ccf-directory:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 数据更新

```bash
# 1. 运行爬虫更新 LetPub 数据
cd scraper && bash run.sh

# 2. 重新生成 import_data.json
node import_data.js

# 3. 重新构建 Docker 镜像（会自动导入新数据）
cd ../docker && docker compose build && docker compose up -d
```
