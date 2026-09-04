# 抓取脚本构建与测试计划（高级 Agent）

## 1. Agent 任务

构建一个可恢复、可验证、可重复运行的期刊发现与详情抓取工具，并使用本地 fixture 完成测试。此任务只生产代码、测试、示例配置和使用文档，不执行真实候选发现或正式详情抓取，不覆盖当前有效数据。

## 2. 允许与禁止

允许修改：

- `scraper/**`；
- 与抓取命令直接相关的 README；
- 最小化且已脱敏的 HTML/JSON 测试 fixture；
- 本计划文档中的完成状态或交接信息。

禁止修改或执行：

- 不修改 `server/**`、`web/**`、`deploy/**`；
- 不导入或修改生产数据库；
- 不运行完整候选发现；
- 不运行正式详情抓取；
- 不替换 `data/letpub_full.json`；
- 不提交或推送，除非用户明确授权。

开始前执行并记录：

```bash
git status --short --branch
git diff -- scraper README.md
```

保留工作区已有改动，不能用重置、检出或清理命令丢弃其他人的文件。

## 3. 固定业务规则

### 3.1 数据范围

- CCF 来源固定为 `data/all_journals_correct.json`，全部保留。
- Non-CCF 候选来自 LetPub“大类学科=计算机科学”的搜索结果。
- Non-CCF 是否入选只能依据详情页最新可用的中科院分区：大类严格等于 `计算机科学`，大类分区为 `1区` 或 `2区`。
- 搜索页的新锐分区、JCR 分区和小类分区均不能用于上述准入判断。

### 3.2 期刊身份

匹配优先级为：

1. LetPub `journalid`；
2. 标准化 ISSN；
3. 标准化 EISSN；
4. 名称只生成冲突报告，不允许静默选取第一个结果。

简称不是主键。同一期刊的多个 CCF 领域关系必须全部保留。

## 4. 必须完成的程序

### 4.1 `scraper/discover_non_ccf.js`

- 使用 `searchcategory1=计算机科学` 遍历动态分页；
- 提取 `journalid`、名称、简称、ISSN、详情 URL 和来源页码；
- 按 `journalid` 去重；
- 支持页级断点恢复、限速、随机抖动、超时、有限重试和指数退避；
- 支持 `DISCOVERY_MAX_PAGES`，供执行 Agent 做 canary；
- 部分页失败时不得把候选文件标为完整成功；
- 输出候选暂存文件、进度和机器可读发现报告。

### 4.2 `scraper/lib/letpub_parser.js`

- 解析函数接收已下载 HTML，不得为同一期刊重复请求详情页；
- 根据页面语义识别影响因子字段，不能硬编码完整年份标签；
- 根据区块标题识别新锐、JCR 和不同年份的中科院分区；
- 不能依赖区块固定排列顺序；
- 输出 `casPartitions[year]`、`latestCASYear`、`latestCAS` 或含义完全等价的结构；
- 保留 `journalid`、LetPub URL 和 `fetchedAt`。

### 4.3 `scraper/lib/catalog_policy.js`

- 从可用的中科院年度中选择最新年份；
- 只接受“大类=计算机科学且大类分区=1区/2区”的 Non-CCF；
- 返回结构化的接受/拒绝结果和原因；
- CCF 期刊不得因分区缺失或不满足规则而被删除。

### 4.4 `scraper/batch_scrape.js`

- 同时处理 CCF 和发现得到的 Non-CCF 候选；
- CCF 优先复用已知 `journalid`、ISSN/EISSN；
- 支持 `MAX_JOURNALS`、`FORCE_REFRESH` 和可配置刷新天数；
- 默认请求间隔不少于 12 秒并加入轻微随机抖动；
- 为每条任务记录 `pending`、`success`、`rejected`、`not_found`、`parse_failed` 或 `rate_limited`；
- `rejected` 记录实际大类、分区和原因；
- 中断后能继续，重复运行不重复追加；
- 单次失败不能用空值覆盖已有有效数据；
- 正式结果先写暂存文件，校验通过后才允许原子替换。

### 4.5 `scraper/validate_data.js`

提供 `npm run validate:data`，至少检查：

- JSON 结构和必填字段；
- 正式 Non-CCF 全部满足最新中科院大类规则；
- CCF 条目没有被分区规则误删；
- `journalid` 唯一；
- ISSN/EISSN 格式及身份冲突；
- CCF 多领域关系未丢失；
- 成功、拒绝、失败和待处理计数闭合；
- 与上次有效数据相比发生异常大幅下降时拒绝发布。

校验结果必须通过退出码表达：通过为 0，失败为非 0。

## 5. 离线测试要求

所有自动测试默认不得访问网络。fixture 至少覆盖：

- 搜索结果和分页；
- CCF 详情页；
- Non-CCF 计算机科学 1区和 2区；
- 计算机科学 3/4区；
- 非计算机科学 1/2区；
- 多个中科院年份且页面顺序变化；
- 缺字段、空结果、限流页和结构异常；
- journalid/ISSN 冲突；
- 进度恢复及重复运行幂等性；
- 暂存结果校验失败时不覆盖正式文件。

建议命令：

```bash
cd scraper
npm test
npm run validate:data -- --fixture
```

如果校验程序不适合 `--fixture`，可提供等价的临时输入参数，但必须写入 README。

## 6. 运行接口约定

构建 Agent 必须确保执行 Agent 可以直接使用以下接口或清楚记录等效命令：

```bash
cd scraper

DISCOVERY_MAX_PAGES=2 npm run discover:non-ccf
npm run discover:non-ccf

MAX_JOURNALS=10 npm run scrape
npm run scrape

npm run validate:data
```

运行目录、输出路径和环境变量必须统一，不能让不同脚本读写不同名称的正式文件。

## 7. 完成标准

- 所有离线单元及集成测试通过；
- 动态年份和分区类型识别不依赖页面顺序；
- 发现和详情抓取均支持恢复、限速、重试和失败报告；
- 校验失败时正式数据不变；
- README 写明 canary、全量、恢复、强制刷新和校验命令；
- 未进行真实完整抓取，未修改生产数据库；
- 没有修改任务范围外的文件。

## 8. 交给执行 Agent 的交接清单

最终回复必须包含：

1. 修改文件清单；
2. 每个可执行命令及环境变量说明；
3. 测试命令、通过数和失败数；
4. 运行时输出文件及其 schema/用途；
5. 安全中断和恢复方法；
6. 已知限制及预期失败类型；
7. `git status --short` 和当前 commit SHA；
8. 明确声明“未执行正式抓取，未覆盖正式数据”。

只有以上清单完整且测试通过，脚本才可被冻结并交给执行 Agent。
