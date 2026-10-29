# 期刊目录身份审计

日期：2026-10-27。本节身份来源核对未访问 LetPub；独立认证检查另见文末。原始基线只读查询 `docker/data/backups/ccf-before-catalog-20261026T124421Z.db` 的 `entries` 科学目录字段；未读取用户或个人表。该备份含 166 条 CCF 期刊和 107 条 NonCCF 期刊。

## 审计范围

- 修订后的官方目录差分得到 **131 个新增 CCF 标题**。140 个表面新增标题中，6 个按证据归为同刊别名，3 个归为新序号续刊，故这两类分别审计。另审计 TON 现刊续刊身份。
- 对后续 NonCCF 扩展，和已含 CCF 扩容的 `/tmp/ccf-zone3-baseline.json` 对比得到 **80 条新增 NonCCF**。这份基线不能用来计算 CCF 扩容数。
- 新 CCF 131 条均对应当前官方目录关系，且每条都有官方 CCF publisher 和目录 URL。ISSN checksum 均通过；没有跨记录 ISSN 冲突。Computational Linguistics 的 `issn` 与 `eissn` 同为 1530-9312，但该刊自2009年起无印刷版；现有证据不足以认定 generic ISSN 字段错置。
- 权威来源定向核验 **18 个现行身份（40 个来源 URL）**：14 个来自新增 CCF 标题、另有 4 个续刊身份。不是对全部 131 个标题或 80 个 NonCCF 的逐刊网络核验。

## 发现与待处理项

1. **字段语义待确认，不能定为错：** Computational Linguistics（journalid 8783）在 `issn` 和 `eissn` 都填 1530-9312。MIT Press 当前页列 0891-2017 与 1530-9312；其 2009/2010 出版说明指出自第35卷第1期起不再发行印刷版。故 0891-2017 是历史印刷序号/ISSN-L，不代表当前仍有印刷版。数据的 `issn` 字段未声明为 print-only，所以两列重复不构成已证实错误；不得直接把 ISSN-L 当当前印刷号写回。建议保留值，等确认上游字段语义后再议。
2. 六个新增 CCF 占位记录的印刷/在线 ISSN 和 publisher 字段为空，但发行方或 ISSN 权威来源已找到当前序号：ACM Transactions in Quantum Computing、Behaviour & Information Technology、PLOS Computational Biology、The Computer Journal、The Journal of Symbolic Logic、Virtual Reality & Intelligent Hardware。建议审阅独立 proposals 文件。 PLOS Computational Biology 的印刷号 1553-734X 已于 2008 年第 4 卷第 1 期停止印刷，当前在线号为 1553-7358；建议只填在线号，历史 print/ISSN-L 单独留在建议说明。原引用的 PLOS Biology publishing-information 是包含所有 PLOS 刊物的共享表，确实列有该刊；另加 PLOS Computational Biology 专页只是让入口更直接。ACM 的发行方标题为 “ACM Transactions on Quantum Computing”，CCF 官方标题仍保留原文 “ACM Transactions in Quantum Computing”，只作出版方名称变体，不改 CCF 标题。BIT 的 Taylor & Francis 页面检索摘要原文列出 “Print ISSN: 0144-929X Online ISSN: 1362-3001”；因直接页面可能返回403，另用 ISSN Portal 对两号的媒介与现行状态交叉确认。
3. 补全前 131 条中 8 条 publisher 为空、16 条 `officialUrl` 为空。官方目录中的 CCF publisher 和 CCF catalog URL 均存在；这些 LetPub/发行方详情字段需要后续补源。
4. 新增 CCF 中 IEEE Transactions on Sustainable Computing 的 2377-3782 仅列在 `issn` 字段，但 IEEE Xplore 把它标为 Electronic ISSN。因当前未用权威ISSN记录确认媒介字段，列待核验，不自行改写。

## 续刊序号与历史身份隔离

`currentSerialLookupConfirmed=false` 表示尚未确认通过**现刊序号找到 LetPub 详情**，不表示权威现刊 ISSN 未确认。本次另行查权威来源确认以下现刊身份；LetPub 详情仍未知，历史行不得拿来继承现刊指标。

| 当前刊名 | 当前序号 | 已核实来源 | 历史身份 |
|---|---|---|---|
| IEEE Transactions on Networking | eISSN 2998-4157 | [IEEE Xplore](https://ieeexplore.ieee.org/abstract/document/11677248)、[ISSN Portal](https://portal.issn.org/resource/ISSN/2998-4157) | IEEE/ACM 1063-6692 / 1558-2566；旧 LetPub 3432 |
| IEEE Transactions on Audio, Speech and Language Processing | eISSN 2998-4173 | [IEEE Xplore](https://ieeexplore.ieee.org/abstract/document/11716693)、[ISSN Portal](https://portal.issn.org/resource/ISSN/2998-4173) | IEEE/ACM 2329-9290 / 2329-9304；更早 IEEE 1558-7916 / 1558-7924；旧 ID 9779、3363 |
| ENGINEERING Information Technology & Electronic Engineering | 3069-8928 / 3069-8936 | [当前发行方页面](https://www.academax.com/EITEE/callForPaperList) | FITEE 2095-9184 / 2095-9230；旧 ID 10004 |
| Discover Computing | 2948-2984 / 2948-2992 | [Springer](https://link.springer.com/journal/10791)、[NLM](https://www.ncbi.nlm.nih.gov/nlmcatalog?term=2948-2984%5BISSN%5D)、[ISSN Portal](https://portal.issn.org/resource/ISSN-L/2948-2984) | Information Retrieval Journal 1386-4564 / 1573-7659；旧 ID 3566 |

## 其他身份抽查发现

- ACM Transactions on Internet of Things 的 ISSN-L 记录区分印刷号 2691-1914 与在线号 2577-6207，当前字段顺序正确。
- High-Confidence Computing 的 ISSN Portal 确认 2667-2952 属于连字符标题；近似拼写候选 44225 已隔离，未进入正式库。
- PACMPL 官方 ACM SIGPLAN 页面确认其为 ACM 电子刊，eISSN 2475-1421。
- ACM TQC、BIT、PLOS Computational Biology、The Computer Journal、Journal of Symbolic Logic、VRIH 等来源已逐条记录在 JSON 的 `remoteVerification`。
- 80 条新 NonCCF 只完成离线 ISSN 唯一性与 CAS 2025 计算机科学大类 1–3 区筛选审计，未逐刊远程身份核验。它们的 WoS/JCR 字段均为匿名获取下的 `source_missing`；不能解读为未收录。候选全集快照采集时已 53 天，且没有刷新。

完整机器审计、131 条逐项字段、18 个权威来源身份核验和待审 proposals 见 [`scraper/output/audit_catalog_identities.json`](../scraper/output/audit_catalog_identities.json) 与 [`scraper/output/audit_catalog_identity_proposals.json`](../scraper/output/audit_catalog_identity_proposals.json)。CCF 官方领域等级基准为 `data/all_journals_correct.json`。

## 已应用的元数据补全（2026-10-27）

六条空占位记录已按独立权威来源补充当前序号、出版商与官网：ACM TQC、Behaviour & Information Technology、PLOS Computational Biology、The Computer Journal、The Journal of Symbolic Logic、Virtual Reality & Intelligent Hardware。CCF 官方题名保持原样，PLOS 仅补当前在线号，不把已停止发行的印刷序号作为当前印刷号补入。

逐字段前后值与来源见 [`data/journal_identity_corrections.json`](../data/journal_identity_corrections.json)。这六条依然是未匹配 LetPub 的占位记录，没有新增影响因子、CAS 或 WoS/JCR 值。校验通过：452 条期刊（291 CCF、161 NonCCF），295 条官方领域关系，0 身份冲突；仅六条占位元数据发生变化，其他记录和全部指标保持不变。元数据补全后采集器 93 项测试通过；认证与断点证据修复后全套 99 项测试通过。六条补全已同步运行服务，健康检查通过，数据库逐字段与补丁一致；用户、收藏、笔记和标签内容哈希与发布前一致。发布前数据库备份：`docker/data/backups/ccf-before-audit-20261027T044555Z.db`。

认证网页逐刊校对仍待实际请求结果；此前的离线完整性检查不能替代逐刊来源核对。

## 认证状态与未完成项

2026-10-27T07:04:29.133352+00:00 的真实认证请求返回 HTTP 200、正常期刊页面结构，但 `loginPage=true`、`authenticatedContentAvailable=false`，因此旧探针未放行认证校对。该探针全页匹配登录入口的规则可能过宽，正在修正后复验，暂不将这一结果单独视为会话已过期的充分证据。尚未启动新增期刊的批量网页校对，已请求更新 Cookie。待完成：逐刊身份与 IF/CiteScore/CAS/WoS/JCR 来源对比、五年影响因子空值原因核实，以及针对已证实差异的修正。

不得把本地完整性检查或六条元数据补全表述为全部新增期刊均已完成外部校对；80 条新增 NonCCF 的 WoS 仍是 `source_missing`，并不表示未收录。
