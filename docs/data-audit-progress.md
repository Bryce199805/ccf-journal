# 新增期刊数据校对进度

## 已发布结果

截至第三轮，按真实认证详情证据复核并发布 **217 条**期刊记录（137 CCF、80 Non-CCF）；首轮采用190条，第二轮补充及重核26条，第三轮补充3条。没有直接用暂存文件覆盖正式数据：JSEP 的旧题名误接已排除，27号暂存状态异常按实际详情证据处理。前期 27 条身份元数据补全继续保留。

正式目录仍为 **452 条期刊：291 CCF、161 Non-CCF，295 条 CCF 领域关系**。新增的80条 Non-CCF 中，80条均已核验 WoS/JIF/JCI，并复核2025中科院计算机科学大类1–3区准入条件。

首轮六个原无详情的 CCF 条目已取得真实匹配：

| CCF 目录题名 | LetPub ID | 详情核对的 ISSN / eISSN |
|---|---|---|
| IEEE Transactions on Networking（原 IEEE/ACM Transactions on Networking） | 44828 | — / 2998-4157 |
| Discover Computing（原 Information Retrieval Journal） | 44745 | 2948-2984 / 2948-2992 |
| The Journal of Symbolic Logic | 5207 | 0022-4812 / 1943-5886 |
| Virtual Reality & Intelligent Hardware | 32213 | 2096-5796 / 2666-1209 |
| Behaviour & Information Technology | 1051 | 0144-929X / 1362-3001 |
| The Computer Journal | 1985 | 0010-4620 / 1460-2067 |

TON 与 Discover Computing 均依据现刊新序号命中，没有拿历史串号或历史指标充当现刊。TON 暂无 JIF 分区时保留未知，未借用 IEEE/ACM 旧刊的影响因子。

## JSEP 身份更正

上一轮把当前 CCF 的 Journal of Software: Evolution and Process 误接到了 LetPub 5156。该来源实际是前题名 Journal of Software Maintenance and Evolution: Research and Practice（1532-060X/1532-0618），其0影响因子与未收录状态不能代表现刊。原身份线索也混合了前题名印刷号与现刊在线号，已纠正。

现刊使用 Wiley 与 ISSN 权威记录确认的 2047-7473/2047-7481。旧数据库条目、历史指标和所有个人引用保留为独立历史记录，现刊建立独立身份；第二轮已实际验证现刊9548，题名与2047-7473一致；现刊IF为1.600、JIF Q3，旧刊5156的0值与未收录状态保留在独立历史记录。没有借用8908的指标。

该分离由显式、带原始名称与序号约束的导入规则执行，要求同批次存在匹配现刊序号的替代条目。Go单测及真实数据库副本连续两次导入均通过；重复导入不产生重复记录，全部用户、收藏、笔记和标签哈希不变。运行服务健康检查与实际数据库检查均通过。备份：`docker/data/backups/ccf-before-audit-pass1-20261029T084717Z.db`。

## 首轮覆盖与补查

223个任务中，2条试采加221条批量任务已全部尝试。机器记录191项success、24项网络失败、8项未匹配/冲突，0 pending；`closed=false`，不能称全部条目均通过验证。success中的JSEP旧刊误接已人工排除，因此正式采用190条证据。

第二轮实际包含2条试采及27条批量尝试，累计214 success。发现旧not_found缓存使CL/PLOS没有重试后，将身份匹配版本升为7并增加回归；第三轮仅重试9个未解任务，补充TSC、CL与Drones，成功项不重复请求。最终217 success、6项未解决、0 pending，仍为`closed=false`。6项中TELO实际原因是检索网络超时，不能把它解释成来源确定不存在。已补充失败分类修复：后续搜索network_error/server_error写入可重试的parse_failed；既有not_found网络失败也不会被成功缓存跳过。本轮原始报表保留，没有回写采集历史。

完整Node回归125/125、补充搜索网络失败重试回归后batch_scrape测试43/43、Python解析4/4、Go全套测试通过；真实数据库副本连续两次导入通过，目录仍452条，历史记录与个人引用保留。最终发布前备份为`docker/data/backups/ccf-before-audit-final-20261029T140422Z.db`。

| 未解决条目 | 实际证据及处理 |
|---|---|
| ACM Transactions on Recommender Systems（TORS） | 本轮未找到可验证的详情候选；保留未知。 |
| IEEE Transactions on Audio, Speech and Language Processing（TASLP） | 候选3363仍是旧1558-7916/1558-7924，不能替代现刊2998-4173。 |
| ACM Transactions on Evolutionary Learning and Optimization（TELO） | 本轮检索超时，不能认定未收录或来源无记录。 |
| ACM Journal on Autonomous Transportation Systems（JATS） | 本轮未找到可验证的详情候选；保留未知。 |
| PLOS Computational Biology | 三个来源ID 6771/8953/10628均通过题名与现刊在线序号核验，属于来源重复页；自动流程因多ID保留冲突；三页主要分区/IF相同，但H-index分别148/138/空，未任意选择一个写入。 |
| Engineering, Information Technology and Electronic Engineering（EITEE，原FITEE） | 新现刊3069-8928/3069-8936本轮仍未找到可验证详情；不借用旧刊指标。 |

CL现已按1477-8424匹配1986，来源明确显示未在最新JCR；源0.000规范化为未知，未继承同缩写Computational Linguistics的序号，也没有把后继Journal of Computer Languages的指标或CCF等级直接移植。CLSR的现行注册序号与来源旧序号之间仍保留谱系说明，不擅自清空或跨记录复制指标。

## 指标解释与来源限制

- 网页“五年IF”注明网友提供且没有年份，193条去重来源值只保留在隔离审计说明中，没有写入当年正式指标。
- 157条实时IF样本标注的截点是2026-09-20，不等同于采集当日的实时值。
- 2026新锐学术版不能替代2025中科院升级版；Non-CCF仍按最新可用中科院计算机科学大类1–3区准入。
- 明确不在最新JCR/暂无JIF时，源页0.000不作为官方零影响因子展示；原始返回值保留在证据中。
- 失败记录保留原数据，未知不能变成“未收录”。Cookie仅用于临时认证，未写入仓库或报告；最终详情请求仍取得认证内容，无需再次更新。采集进程已结束，没有后台待确认的采集任务。

公开身份核对200项（另11条沿用此前已核来源）：首轮159匹配、32待复核、9来源不可用；21个同串号空eISSN已补齐。Cybersecurity两号属于同一刊系，未作错误替换；JSA与Performance Evaluation的错误建议值仅是首轮审计转录错误，已修正，并非原数据库已有错误。

详见 [公开身份核对](data-audit-public-identities.md)、[复核与跨串号证据](data-audit-public-review.md) 和 [逐字段身份补丁](../data/journal_identity_corrections.json)。

## 2026-10-29 定向复核与前端适配

更新临时Cookie后已重新通过真实认证，定向核对剩余6项；没有抓取此前217项已通过的详情。独立报告`scraper/output/data_audit_remaining_followup.json`为0600，仅保存核对证据，不含凭据。

- TORS、JATS、EITEE按现刊序号及题名仍未找到可验证详情；不是未收录结论。
- TELO检索网络失败；TASLP本次旧候选3363详情请求也网络失败，既有旧序号不符的判断保留。
- PLOS本次搜索仍公开展示6771/8953/10628三个同刊重复页；H-index不一致，未任意选页覆盖正式数据。没有新的可发布指标，正式认证通过数仍217，新增80条Non-CCF均已完成认证核对。

前端已修复翻页回顶：在实际返回页码变化后滚动到页面顶部，支持异步加载和缓存页，不因同页刷新/收藏变更跳动。卡片、表格及会议使用相同行为。补齐表格JCR分区/未知状态、详情JCI学科排名；未知详情统一标记“详情待核对”，不误作未收录。修正收藏筛选的条件Hook调用，适配手机详情宽度、指标布局和可横向滚动的长分区表。

前端默认监听`0.0.0.0:5173`，支持局域网预览，API仍代理本机8080。构建及本次修改文件的ESLint通过；Chromium真实浏览器12项检查通过：十个领域入口、异步下一页、缓存上一页、表格翻页、Non-CCF三区筛选、JSEP现刊及JIF/JCI、待补充指标、多领域关系、收藏切换、会议翻页、375px页面及详情布局。测试未写入收藏/笔记等用户数据。修复已部署正式服务（8080），部署后再次通过12项浏览器验收，包含DKE在数据库与人工智能两个领域的筛选；服务健康，用户/收藏/笔记/标签哈希均与部署前一致。5173局域网预览继续保留。

完整`npm run lint`仍有11项既有错误，位于TagBadge/TagManager、通用UI导出、use-auth/use-tags和theme-provider，未将其声明为全量lint通过。

最后公开索引复核也未发现TELO/TORS/JATS/EITEE新的现刊详情ID。PLOS的[公开检索结果](https://www.letpub.com.cn/index.php?page=journalapp&searchname=PLoS+Comput&view=search)再次列出三个同题名来源页；列表指标与认证详情还存在差异，因此不把检索摘要数值当作最新详情指标。[PLOS官方信息](https://journals.plos.org/ploscompbiol/s/journal-information)可确认期刊序号，但不能指定LetPub的规范记录ID。本次核对结束，没有等待中的采集进程，也无需再更新Cookie。

## CCF等级与前端设计修复

标题徽标与领域关系组件原先分别显示等级，导致同一期刊重复出现A/B/C。本次统一以领域关系为依据展示“CCF A/B/C”，普通领域行只展示学科；相同关系去重，旧格式或格式异常回退到原目录字段。当前291条CCF期刊、295条领域关系全部核验等级一致。若未来不同领域确有不同等级，汇总显示“多等级”，并在对应领域注明等级，避免擅自选取最高等级。

卡片改为桌面双列、移动端单列；标题、领域、分区、指标与出版商分层，操作按钮独立占位，未知指标保留破折号。详情移除重复题名，表格统一等级标识并改善边框与悬停状态。移动端高级筛选支持展开/收起，保留选择并提示已选条件数量；页头增加布局与主题按钮的可访问标签。

已部署8080正式服务，5173预览仍监听0.0.0.0。构建和本次修改文件ESLint通过，部署后的15项Chromium浏览器检查通过，涵盖唯一等级、DKE多领域筛选、深浅色主题、翻页回顶、移动端筛选和详情。用户/收藏/笔记/标签哈希与部署前一致。完整lint此前11项既有问题仍未纳入本次修复。
