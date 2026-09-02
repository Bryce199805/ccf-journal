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
│   ├── discover_non_ccf.js
│   ├── validate_data.js
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
# scraper/output/non_ccf_candidates.json - 发现脚本生成的 Non-CCF 候选

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

抓取流程固定使用 `data/all_journals_correct.json` 中的全部 CCF 期刊，并从 LetPub
“大类学科=计算机科学”搜索结果发现 Non-CCF 候选。Non-CCF 只有在详情页最新可用的
中科院分区满足“大类学科严格等于计算机科学，且大类分区为 1 区或 2 区”时才进入暂存数据。
新锐、JCR 和小类分区不参与准入。

所有命令从 `scraper/` 运行。自动测试只读取本地 fixture，不访问网络：

```bash
cd scraper
npm test
npm run validate:data -- --fixture
```

真实执行时先做 canary，再做全量。以下命令只生成 `scraper/output/` 下的候选、进度、
报告和 `letpub_full.staging.json`，不会直接覆盖正式文件：

```bash
cd scraper

# 候选发现 canary；通过后，不设置上限即可从页级进度继续全量发现
DISCOVERY_MAX_PAGES=2 npm run discover:non-ccf
npm run discover:non-ccf

# 详情 canary 会分层选择 CCF 与 Non-CCF，并要求实际出现接受和拒绝结果
MAX_JOURNALS=10 npm run scrape
npm run scrape

# 仅校验暂存数据，不发布
npm run validate:data

# 最终全量校验通过后，显式原子发布到 data/letpub_full.json
npm run publish:data
```

发现命令支持 `DISCOVERY_MAX_PAGES`、`DISCOVERY_DELAY_MS`（默认 12000）、
`DISCOVERY_JITTER_MS`（默认 1000）、`DISCOVERY_TIMEOUT_MS`（默认 20000）、
`DISCOVERY_RETRIES`（默认 3）和 `DISCOVERY_BACKOFF_MS`。详情命令支持
`MAX_JOURNALS`、`CANARY_CCF_JOURNALS`（默认 1）、`FORCE_REFRESH=1`、`REFRESH_DAYS`（默认 30）、
`SCRAPE_DELAY_MS`（联网执行不得低于 12000）、`SCRAPE_JITTER_MS`、
`SCRAPE_TIMEOUT_MS`、`SCRAPE_RETRIES` 和 `SCRAPE_BACKOFF_MS`。
`NON_CCF_FILE` 可覆盖候选输入路径；其余输入/输出路径也可使用脚本中同名的
`*_FILE` 环境变量覆盖，适合隔离 canary。

运行时文件及用途：

- `output/non_ccf_candidates.json`：成功完成本次请求页范围后生成的候选数组；每项含
  `journalid`、名称、简称、ISSN/EISSN、详情 URL 和来源页。
- `output/non_ccf_candidates.partial.json`：每页成功后保存的去重检查点；发现任务未完整
  成功时只更新此文件，不把正式候选标为成功。
- `output/discovery_progress.json` / `discovery_report.json`：每页状态、重试次数、失败类型、
  总页数、成功页/失败页和候选数。
- `output/letpub_full.staging.json`：基于现有正式数据构建的详情暂存结果；单本失败不会以空值
  覆盖旧数据。
- `output/scrape_progress.json` / `scrape_report.json`：每条任务的 `pending`、`success`、
  `rejected`、`not_found`、`parse_failed` 或 `rate_limited` 状态及闭合计数；拒绝项包含实际
  大类、分区和原因。有限 canary 报告使用 `mode=partial`，并以 `canaryCoverage` 明确记录
  本进度中已覆盖的 CCF、接受的 Non-CCF 和拒绝的 Non-CCF；任一类缺失时命令非零退出，
  再次运行相同 canary 命令会继续抽取未处理任务并累计覆盖。
- `output/identity_conflicts.json`：名称只能匹配或 journalid/ISSN/EISSN 冲突的机器可读报告。
- `output/validation_report.json`：结构、准入、CCF 关系、身份、计数和异常下降校验结果。

进程可用 `Ctrl-C` 安全中断。发现脚本按页、详情脚本按任务原子保存进度；使用相同命令重启
即可跳过仍在刷新周期内的 `success`/`rejected` 项并继续失败或待处理项。不要删除进度文件；
分区解析器升级后，旧版本产生的 `missing_cas_partition` 会自动重新处理一次，无需清理进度
或对全部任务执行强制刷新。
需要重新抓取所有任务时使用：

```bash
FORCE_REFRESH=1 npm run scrape
```

预期失败类型包括临时网络/HTTP 错误、LetPub 限流或验证码、搜索无结果、仅名称可匹配、
强身份冲突、详情结构异常和准入拒绝。限流任务会以非零退出状态提醒执行者；校验失败时
`npm run publish:data` 退出非零且正式文件保持不变。发布还要求发现报告为完整全量状态，
且详情报告中没有 `pending` 任务；canary 允许保留 `pending`，此时 `closed=false`，只能
校验、不能发布。旧 journalid/ISSN 仅作为查找提示，详情名称和 ISSN/EISSN 校验不一致时会
进入冲突报告。无法匹配 LetPub 的 CCF 仍以 CCF 全名保留，`journalid` 留空。
