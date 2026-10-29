# 公共期刊身份候选复核

复核日期：2026-10-28。逐项复核 [公共身份审计中的32条 mismatch_candidate](../scraper/output/data_audit_public_identities.json)，结构化结论和逐条来源见 [复核 JSON](../scraper/output/data_audit_public_review.json)。本文件作为独立复核说明保存；既有 [公共身份审计报告](data-audit-public-identities.md) 保持原样。

## 范围与方法

本次只处理原审计中32条候选，不重新检查另168条。利用现有证据并补查 ISSN International Centre、出版商、NLM 与 DBLP 等公开来源。未访问 LetPub，也未使用 Cookie。数据的 `issn` 是通用字段，没有声明只存印刷 ISSN；因此仅因 `eissn` 为空、`issn` 对应已停印的旧印刷载体、或当前出版商名称与旧记录不同，不判为错误。

复核结果为：32条全部完成审阅；目前没有足够证据确认字段错误。Cybersecurity 的两号经主办机构相关证据、期刊索引及文章级元数据复核，应视为同刊 print/online 标识，不得按错刊处理。未确认错误不等于所有字段都已完整，也不应用作自动修正依据。

## 错误结论撤回与数据审计勘误

此前曾建议把 Cybersecurity 的 `issn` 改成 `2523-3246`。该判断已撤回：HEC 2023–24 政府目录将 `2096-4862` 和 `2523-3246` 同列于 Cybersecurity / SpringerOpen 一行；UTS 与阿德莱德大学论文库也在同一篇 Cybersecurity 论文元数据中合列两号。[HEC目录](https://www.hec.gov.pk/english/services/faculty/journals/Documents/hjrs%202023-24.pdf) · [UTS论文元数据](https://opus.lib.uts.edu.au/handle/10453/175961) · [阿德莱德大学论文元数据](https://digital.library.adelaide.edu.au/items/cdb537e3-944b-41ab-a0bc-c3efb649459a/full)。DOAJ 将在线刊 `2523-3246` 对应 SpringerOpen 新加坡出版、IIE 为 other organisation，且期刊官网为 SpringerOpen 站点。[DOAJ期刊页](https://doaj.org/toc/2523-3246) · [SpringerOpen期刊页](https://cybersecurity.springeropen.com/about)。合并证据足以推翻“因出版地/载体不同就不是同刊”的推论；两个标识均保留，不提出修正。

原候选审计中另有两处 eISSN 抄录错误，已在复核 JSON 的 `auditCorrections` 中纠正：

- Journal of Systems Architecture：应为 `1873-6165`，不是 checksum 无效的 `1873-6161`。[ISSN Portal](https://portal.issn.org/resource/ISSN/1873-6165) · [DBLP](https://dblp.org/db/journals/jsa/index.html)
- Performance Evaluation：应为 `1872-745X`，不是 `1873-2232`。[ScienceDirect](https://www.sciencedirect.com/journal/performance-evaluation) · [Jülich期刊权威记录](https://juser.fz-juelich.de/record/90577/?ln=en)

这是审计证据中的号码抄录问题，不是把相应期刊判为身份错误。

## 空 eISSN 字段补全建议

以下21条建议均同时满足：提议号码校验位正确；权威在线 ISSN 记录把它链接到当前 `issn`/ISSN-L 及该刊名。每条 JSON 提案都包含 `journalid`、`title`、变更前空 `eissn`、当前 `issn`、建议 `eissn`、来源和身份关联理由。这里只提供可应用的字段补全，不修改正式目录，也不重算或更改任何指标。

| 期刊（journalid） | 建议 eISSN | 来源 |
|---|---:|---|
| Annals of Pure and Applied Logic（634） | 1873-2461 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1873-2461) |
| Computer Communications（1982） | 1873-703X | [ISSN Portal](https://portal.issn.org/resource/ISSN/1873-703X) |
| Computer Languages, Systems and Structures（1986） | 1873-6866 | [NLM Catalog](https://www.ncbi.nlm.nih.gov/nlmcatalog/101670243) |
| Discrete Applied Mathematics（2315） | 1872-6771 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1872-6771) |
| Fundamenta Informaticae（2961） | 1875-8681 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1875-8681) |
| Future Generation Computer Systems（2972） | 1872-7115 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1872-7115) |
| Information and Software Technology（3562） | 1873-6025 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1873-6025) |
| Integration, the VLSI Journal（3606） | 1872-7522 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1872-7522) |
| Journal of Systems Architecture（5214） | 1873-6165 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1873-6165) |
| Journal of Systems and Software（5213） | 1873-1228 | [ISSN Portal ISSN-L记录](https://portal.issn.org/resource/ISSN-L/0164-1212) |
| Parallel Computing（6492） | 1872-7336 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1872-7336) |
| Performance Evaluation（6554） | 1872-745X | [ScienceDirect](https://www.sciencedirect.com/journal/performance-evaluation) |
| Pervasive and Mobile Computing（8947） | 1873-1589 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1873-1589) |
| Science of Computer Programming（7410） | 1872-7964 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1872-7964) |
| Theoretical Computer Science（7797） | 1879-2294 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1879-2294) |
| JOURNAL OF PROCESS CONTROL（5082） | 1873-2771 | [ISSN Portal](https://portal.issn.org/resource/ISSN/1873-2771) |
| SIMULATION MODELLING PRACTICE AND THEORY（7510） | 1878-1462 | [ISSN Portal ISSN-L记录](https://portal.issn.org/resource/ISSN-L/1569-190X) |
| Big Data Research（10682） | 2214-580X | [ISSN Portal](https://portal.issn.org/resource/ISSN/2214-580X) |
| Sustainable Computing—Informatics & Systems（10154） | 2210-5387 | [ISSN Portal](https://portal.issn.org/resource/ISSN/2210-5387) |
| Entertainment Computing（10775） | 1875-953X | [ISSN Portal](https://portal.issn.org/resource/ISSN/1875-953X) |
| International Journal of Critical Infrastructure Protection（8849） | 2212-2087 | [ISSN Portal](https://portal.issn.org/resource/ISSN/2212-2087) |

以下条目不提供本轮补全：

- **Computer Law & Security Review（journalid 12923）**：不作为单纯 eISSN 空字段补全；现刊与旧题名有连续出版证据，建议当前行改用 `2212-473X` / `2212-4748`，并保留前题名 `0267-3649` / `1873-6734` 历史映射。指标只作为有来源/年份的连续刊数据保留；若拆成不同serial记录，不复制旧指标。
- **Journal of Software: Evolution and Process（journalid 5156）**：当前行混合了现刊 Wiley URL 与前题名/ISSN `1532-060X`。建议当前行改为 `2047-7473` / `2047-7481` 并保留旧题名映射；现存provider指标隔离在前题名快照中，取得来源和年份映射前不迁移到新串号。
- **Forensic Science International—Digital Investigation（journalid 11288）**：通用 `issn` 已存有效在线号 `2666-2817`；字段没有声明 `issn` 必为print，也没有规则要求 `eissn` 与 `issn` 重复，故不补同值。

## 两个跨串号案例的来源与判断

本节只处理 journalid 12923 和 5156。机器可读的前后字段值、来源及指标处理提案位于复核 JSON 的 `crossSerialCaseReviews` 与 `currentIdentityProposals`。

### Computer Law & Security Review（12923）

ISSN Portal 将 `0267-3649` / `1873-6734` 列为前题名 *Computer Law and Security Report* 的 print/online 序列；现刊 *Computer Law & Security Review* 的当前序列为 `2212-473X` / `2212-4748`，ISSN-L也不同。Elsevier 当前产品页使用现刊名和 `2212-473X`，并称该刊自1985年出版。馆藏记录标示现刊从2009年 Volume 25 Issue 1开始，前一卷 Volume 24 对应2008年。这是题名更改后的连续出版关系，不只是停印后保留的 print ISSN。[Elsevier现刊页](https://shop.elsevier.com/journals/computer-law-and-security-review/2212-473X) · [前题名在线串号](https://portal.issn.org/resource/ISSN/1873-6734) · [现刊ISSN-L](https://portal.issn.org/resource/ISSN-L/2212-473X) · [UC Berkeley馆藏](https://lawcat.berkeley.edu/record/374545) · [DBLP卷期序列](https://dblp.org/db/journals/clsr/index.html)

建议当前标题行使用 `issn=2212-473X`、`eissn=2212-4748`，并把 `0267-3649` / `1873-6734` 记录为前题名标识。staging中的名称与官方URL均指向现刊，submissionUrl为空。现有指标可以作为连续刊的历史指标保留，但须保留来源和年份；不要复制到另一个独立serial记录，也不要宣称某指标专属于某ISSN。本轮未从官方来源核实其最新JIF年份，因此不建议改动JIF值。

### Journal of Software: Evolution and Process（5156）

ISSN Portal 将 `1532-060X` 列为前题名 *Journal of Software Maintenance and Evolution* 的独立ISSN-L；现刊使用 `2047-7473`（print）和 `2047-7481`（online），组成新的ISSN-L。Wiley官方档案从旧题名的2011年 Volume 23 切换到现题名的2012年 Volume 24，卷号连续；Wiley明确称现刊延续前题名的研究传统。[Wiley沿革说明](https://onlinelibrary.wiley.com/page/journal/20477481/homepage/productinformation.html) · [Wiley 2010旧题名卷期](https://onlinelibrary.wiley.com/loi/20477481/year/2010) · [ISSN 1532-060X](https://portal.issn.org/resource/ISSN/1532-060X) · [现行print ISSN](https://portal.issn.org/resource/ISSN/2047-7473) · [现行online ISSN](https://portal.issn.org/resource/ISSN/2047-7481)

主线程核对确认 formal CCF 行5156的名称/ISSN属于前题名，但其 CCF 身份是当前 JSEP；该行还含 `IF=0.000`、`WoS=not_indexed` 等旧provider状态，因此这是确定的当前/前题名元数据混合，不是generic ISSN的print/electronic歧义。修复计划：保留CCF journalid 5156及引用，将活动元数据更正为现刊名、`2047-7473` / `2047-7481`、Wiley现刊与投稿URL；把旧题名、`1532-060X` / `1532-0618` 和旧provider指标归档到前题名快照，不能带入当前串号。non_ccf_candidates中的9548（print）与8908（online）是当前题名候选，须先由主线程核验完整provider详情，不在本计划中合并或复用。数据库导入前，应先归档旧条并将旧身份还原到归档的ccf_full条目，避免fallback把旧entryID复用于现刊；实际数据库操作须由主线程备份后执行。本轮Wiley当前页虽显示JIF 1.6和CiteScore 4.7，但没有核实指标年度，不写年度字段。[Wiley当前期刊和指标页](https://onlinelibrary.wiley.com/journal/20477481)

这两项是身份与指标来源管理提案，不是正式目录改动；本轮未改任何正式数据或指标。

## 其余候选的处理

- **通用 ISSN 字段与载体字段缺失：** 多条记录保存了有效印刷 ISSN、但没有填写在线 ISSN；Forensic Science International—Digital Investigation 则把有效在线 ISSN 放在通用 `issn` 中。证据不支持将它们判错，也不建议仅为填满 `eissn` 而自动修改目录。
- **停印后的历史印刷 ISSN：** 四条 ACM 期刊和 SIMULATION MODELLING PRACTICE AND THEORY 的印刷序列停止或进入历史状态，但对应在线序列仍属同一 ISSN-L 期刊身份。除非数据模型明确规定通用字段必须是现行在线 ISSN，否则不构成身份冲突。
- **出版商沿革与权威记录注记：** Fundamenta Informaticae、INFORMATICA、Argument & Computation 的出版商字段涉及发行方转移、存档方或历史出版商名称；现有证据不足以确认字段必错。Security and Communication Networks 的 `1939-0114`（print）与 `1939-0122`（online）均为该刊序列；在线记录中的 “Incorrect ISSN” 注记不推翻印刷 ISSN 的确认记录。

其余候选为在线 ISSN 缺项，但主 ISSN 和标题身份有来源支持。逐条分类、说明和可复核的来源 URL 均保存在 JSON 中。

## 限制

这是对候选条目的公开书目身份复核，不是对期刊收录、排名、影响因子、CCF分类或所有出版商字段的全面校验。ISSN Portal 描述载体和串号关系；ISSN-L 关系不自动等于数据模型应选用的唯一号码。未对未确认候选提出字段变更。此次没有修改正式目录或抓取数据。
