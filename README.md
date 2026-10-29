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
| 爬虫 | Node.js 20+（内置 HTTPS，无第三方运行时依赖） |
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
├── compose.yaml      # 默认 Docker Compose 部署入口
├── docker/
│   └── Dockerfile    # 多阶段镜像构建
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
- GCC 或 Clang（Go SQLite CGO 编译需要）

如使用容器部署，则只需安装 Docker 和 Docker Compose，无需在宿主机安装 Node.js、Go 或 C
编译器。

### 准备数据

```bash
# 将数据文件放入 data/ 目录（需自行准备）
# data/letpub_full.json - LetPub 爬取的期刊数据
# data/all_conferences_correct.json - CCF 会议列表
# data/all_journals_correct.json - CCF 期刊列表
# scraper/output/non_ccf_candidates.json - 发现脚本生成的 Non-CCF 候选

# 如需脱离 Docker 本地启动后端，生成 import_data.json
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

前端开发服务器默认监听 `0.0.0.0:5173`，可通过 `http://本机局域网IP:5173` 访问，API 请求代理到 `http://localhost:8080`。

## Docker 部署

服务器只需安装 Docker 和 Docker Compose，并在仓库根目录准备以下数据文件：

- `data/all_journals_correct.json`：完整官方 CCF 期刊目录
- `data/ccf_catalog_meta.json`：目录版本与来源
- `data/letpub_full.json`：LetPub 指标与 Non-CCF 期刊
- `data/all_conferences_correct.json`：现有会议目录

随后从仓库根目录执行：

```bash
docker compose up -d --build
```

Compose 会自动构建前端和后端、把数据转换为服务端导入格式，并在首次启动时自动生成 JWT
签名密钥。SQLite 数据库和密钥都持久化在 `docker/data/`，更新镜像或重启容器不会丢失。
默认监听所有网卡的 8080 端口，可直接通过 `http://服务器IP:8080` 访问。

端口、监听地址和时区均为可选配置；默认值已经可以直接使用。如需修改，复制
`.env.example` 为 `.env` 后调整即可：

```bash
cp .env.example .env
docker compose up -d --build
```

常用维护命令：

```bash
docker compose ps
docker compose logs -f --tail=100
docker compose restart
docker compose down
```

更新程序时只需拉取代码并重新执行 `docker compose up -d --build`。更新期刊数据时，替换上述
JSON 文件后执行同一命令即可。用户、收藏和笔记位于 `docker/data/ccf.db`，不会由代码或
期刊数据自动同步；迁移服务器时可按需手动复制整个 `docker/data/` 目录。

若需要域名和 HTTPS，可让宿主机 Nginx 反向代理 `127.0.0.1:8080`。

### Nginx 反向代理配置示例

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/nginx/ssl/your-domain.pem;
    ssl_certificate_key /etc/nginx/ssl/your-domain.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 数据更新

CCF 期刊目录已扩展到全部十个领域，采用第七版正式目录（2026-03-31 发布，
2026-04-09 勘误）。会议目录仍单独维护，不随期刊目录更新。

导入器将官方期刊目录与 LetPub 指标合并；没有 LetPub 详情的期刊也会入库并可检索、收藏。
多领域期刊保留各领域等级，领域与等级筛选要求同一条归属同时匹配。
更新数据库时保留条目 ID、用户收藏和笔记；从当前目录移除的旧期刊保留为历史条目，
不再进入常规目录列表，仍可通过原有收藏和详情链接访问。官方目录以外的已有 Non-CCF 期刊继续保留。

```bash
# 重建固定版本的期刊目录、来源元数据和差异报告
python3 scraper/collect_ccf_catalog.py
# 单独补全 CCF，复用进度并避免采集 Non-CCF 候选
cd scraper
CCF_ONLY=1 REFRESH_DAYS=90 npm run scrape
# 生成导入数据；Docker 构建也会自动执行
node import_data.js
```

差异报告在 `scraper/output/ccf_catalog_diff.json`；版本与来源在
`data/ccf_catalog_meta.json`。采集脚本采用固定提交的结构化转录，来源及正式 PDF
校验记录见 `docs/ccf-catalog-update.md`。再次运行目录重建时，差异基于当时的本地目录。
CCF_ONLY 报告只代表 CCF 详情补全，已有 Non-CCF 数据继续沿用；发布时仍需通过
完整数据校验，并保留成功的全量候选发现报告。

抓取流程固定使用 `data/all_journals_correct.json` 中的全部 CCF 期刊，并从 LetPub
“大类学科=计算机科学”搜索结果发现 Non-CCF 候选。Non-CCF 只有在详情页最新可用的
中科院分区满足“大类学科严格等于计算机科学，且大类分区为 1 区、2 区或 3 区”时才进入暂存数据。
新锐、JCR 和小类分区不参与准入。
策略版本升级后，会本地重评旧拒绝检查点：仍不符合的四区或非计算机大类无需重新联网；
此前仅因三区而被拒绝的候选会重新抓取详情并核验，不用删除历史进度。

只扩展 Non-CCF、不刷新已有 CCF 时可执行：

```bash
cd scraper
NON_CCF_ONLY=1 REFRESH_DAYS=365 npm run scrape
npm run validate:data
npm run publish:data
```

已有成功数据按刷新周期复用，新候选仍需通过详情身份与最新可用中科院大类分区校验。
`NON_CCF_ONLY` 与 `CCF_ONLY` 分别限定采集范围；发布前仍校验完整暂存数据。

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

LetPub 的部分 WOS 数据仅在登录后可见。如需抓取这些字段，请从自己的 LetPub 登录会话中取得
Cookie，通过环境变量临时传入，并先运行鉴权 canary 验证其有效性（不要将 Cookie 写入仓库）：

```bash
export LETPUB_COOKIE='你的 LetPub Cookie'
npm run auth:canary
npm run scrape
```

`auth:canary` 默认检查期刊 `3567`，可用 `LETPUB_AUTH_CANARY_JOURNALID` 覆盖。未设置
`LETPUB_COOKIE` 时爬虫仍可匿名运行，但登录后才可见的 WOS 字段可能缺失；鉴权全量数据的
最终校验还会检查可信的 WOS 数据来源。

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

### 新增期刊数据校对

校对记录和已发布的补全见 [数据校对进度](docs/data-audit-progress.md)，逐字段来源保存在
`data/journal_identity_corrections.json`。更名续刊与同一串号下的缺失字段分别核对，不能直接
给现刊继承历史刊物的指标。

隔离审计入口需要 Node.js 和 Python 3（仅标准库），从仓库根目录运行：

```bash
node scraper/run_data_audit.js --auto --wait-for-cookie
```

先将自己的登录 Cookie 私密写入 `/tmp/ccf-letpub-audit-session.cookie`，权限设为 `0600`。
命令依次认证、试采与批量核对，结果及脱敏证据只写入 `scraper/output/` 的审计专用文件，
不直接发布指标。请求至少间隔 12 秒；认证请求的临时网络错误最多尝试三次。明确出现登录
门禁时保存断点并等待 Cookie 文件更新，再自动验证与续跑；未知页面或结构错误会停止，
不能据此断言 Cookie 失效。Cookie 不得写入仓库、报告或命令参数。
