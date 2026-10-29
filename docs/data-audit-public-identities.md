# Public-source identity audit

Generated 2026-10-27. Machine-readable per-title evidence is in [data_audit_public_identities.json](../scraper/output/data_audit_public_identities.json).

## Scope and method

The original expansion adds 131 CCF titles and 80 NonCCF titles. Eleven of the CCF additions had already been remotely checked in the preceding catalog identity audit, so this pass checked the remaining 120 CCF records plus all 80 new NonCCF records: 200 records total. The prior-verification exclusions are recorded in the JSON. No LetPub endpoint or Cookie was used.

Checks used public ISSN Portal records, publisher pages, NLM Catalog and DBLP where relevant. A record is remote_verified when the accessible public source supports its journal identity and the supplied identifiers/publisher are consistent; this does not mean every optional online ISSN is populated. mismatch_candidate means a remote source surfaced a field, medium, continuation or publisher ambiguity that merits review; it is not a confirmed error. source_unavailable means this pass did not obtain enough usable public evidence. Each target row contains evidence URLs and notes. No formal catalog, scraper or hints file was changed.

## Results

| Scope | Checked | Remote verified | Mismatch candidates | Source unavailable |
|---|---:|---:|---:|---:|
| Newly added CCF, remaining after prior checks | 120 | 91 | 22 | 7 |
| Newly added NonCCF | 80 | 69 | 9 | 2 |
| **Total in this pass** | **200** | **160** | **31** | **9** |

Together with the 11 prior remotely checked CCF identities, all 131 additions have an external identity review. The earlier checks are listed under priorVerificationExclusions in the JSON.

## Candidate items for review

The current data model and source feeds do not always establish whether the generic issn is intended to be print, online or linking ISSN. Therefore, presence of a historical print number alongside a current online eISSN is not treated as proof of a wrong title or physical identity. Candidate rows retain the source URLs and detailed reasoning in the JSON.

### New CCF

| Journal | Review point |
|---|---|
| ACM Transactions on Architecture and Code Optimization | Print ISSN 1544-3566 ceased after 2018; online 1544-3973 continues. Generic-field semantics need review. |
| ACM Transactions on Design Automation of Electronic Systems | Print 1084-4309 through 2023; online 1557-7309 current. Generic-field semantics need review. |
| ACM Transactions on Mathematical Software | Print 0098-3500 through 2023; online 1557-7295 current. Generic-field semantics need review. |
| ACM Transactions on Software Engineering and Methodology | Print 1049-331X through 2023; online 1557-7392 continues. Generic-field semantics need review. |
| Annals of Pure and Applied Logic | Current online ISSN 1873-2461 is absent from the eISSN field. |
| Computer Communications | Current online ISSN 1873-703X is absent from the eISSN field. |
| Computer Languages, Systems and Structures | Current online ISSN 1873-6866 is absent from the eISSN field. |
| Computer Law & Security Review | Stored 0267-3649 belongs to the earlier title Computer Law and Security Report; the Review title's current pair is 2212-473X / 2212-4748. Serial/title continuation remains a catalog-policy question. |
| Discrete Applied Mathematics | Current online ISSN 1872-6771 is absent from eISSN. |
| Fundamenta Informaticae | Current online ISSN 1875-8681 is absent from eISSN; publisher transferred to Sage in 2025. |
| Future Generation Computer Systems | Current online ISSN 1872-7115 is absent from eISSN. |
| Information and Software Technology | Current online ISSN 1873-6025 is absent from eISSN. |
| Integration, the VLSI Journal | Online ISSN 1872-7522 is absent from eISSN. |
| Journal of Software: Evolution and Process | Wiley page uses online ISSN 2047-7481; stored 1532-060X and blank eISSN need historical/current interpretation. |
| Journal of Systems Architecture: Embedded Software Design | Online ISSN 1873-6165 is absent from eISSN. Earlier audit transcription 1873-6161 was invalid. |
| Journal of Systems and Software | Current online ISSN 1873-1228 is absent from eISSN. |
| Parallel Computing | Current online ISSN 1872-7336 is absent from eISSN. |
| Performance Evaluation: An International Journal | Online ISSN 1872-745X is absent from eISSN. Earlier audit transcription 1873-2232 was wrong. |
| Pervasive and Mobile Computing | Online ISSN 1873-1589 is absent from eISSN. |
| Science of Computer Programming | Online ISSN 1872-7964 is absent from eISSN. |
| Security and Communication Networks | ISSN Portal labels 1939-0114 as print, but the online record marks it “incorrect” and lists 1939-0122. Authority-record conflict merits review. |
| Theoretical Computer Science | Current online ISSN 1879-2294 is absent from eISSN. |

Most of these are missing-online-identifier candidates, not evidence of a wrong journal. Entries with print ISSNs that stopped while the online serial continues need the field's intended semantics clarified before proposing edits.

### Follow-up corrections

Further primary-source review found no confirmed identity error among the 32 candidates. In particular, HEC's 2023–24 government directory lists `2096-4862` and `2523-3246` together on a single Cybersecurity / SpringerOpen row; article records in the UTS and University of Adelaide repositories likewise assign both to the same Cybersecurity articles. DOAJ lists the corresponding SpringerOpen journal with IIE as its other organisation. These records supersede the earlier uncertainty in this audit note. [HEC 2023–24 directory](https://www.hec.gov.pk/english/services/faculty/journals/Documents/hjrs%202023-24.pdf), [DOAJ](https://doaj.org/toc/2523-3246), [UTS repository](https://opus.lib.uts.edu.au/handle/10453/175961), [University of Adelaide repository](https://digital.library.adelaide.edu.au/items/cdb537e3-944b-41ab-a0bc-c3efb649459a/full).

Two online ISSNs in the original candidate notes were transcription errors: Journal of Systems Architecture is `1873-6165` (not `1873-6161`), and Performance Evaluation is `1872-745X` (not `1873-2232`). [ISSN Portal: Journal of Systems Architecture](https://portal.issn.org/resource/ISSN/1873-6165), [DBLP](https://dblp.org/db/journals/jsa/index.html), [ScienceDirect: Performance Evaluation](https://www.sciencedirect.com/journal/performance-evaluation), [Jülich catalog](https://juser.fz-juelich.de/record/90577/?ln=en). The corrected per-record evidence is in the JSON audit and the detailed review file.

### New NonCCF

| Journal | Review point |
|---|---|
| INFORMATICA | ISSN Portal says latest publisher is Vilnius University Press; stored SAGE/IOS Press appears historical. |
| JOURNAL OF PROCESS CONTROL | Current online ISSN 1873-2771 is absent from eISSN. |
| SIMULATION MODELLING PRACTICE AND THEORY | Print ISSN 1569-190X ceased in 2024; online 1878-1462 continues. Current/historical field semantics need review. |
| Forensic Science International—Digital Investigation | Data generic ISSN is online 2666-2817; print is 2666-2825; eISSN field is empty. This is a medium-field completeness candidate, not a different-identity finding. |
| Big Data Research | Online ISSN 2214-580X is absent from eISSN. |
| Sustainable Computing—Informatics & Systems | Online ISSN 2210-5387 is absent from eISSN. |
| Argument & Computation | Online 1946-2174 and print 1946-2166 are paired; Portal's “incorrect ISSN” annotation conflicts with its confirmed print record. Publisher transfer history is consistent with SAGE / former IOS Press. |
| Entertainment Computing | Online ISSN 1875-953X is absent from eISSN. |
| International Journal of Critical Infrastructure Protection | Online ISSN 2212-2087 is absent from eISSN. |

## Sources unavailable

Nine rows remain source_unavailable; these are not mismatch findings:

- New CCF: ACM Transactions on Privacy and Security; Acta Informatica; Computer Networks (the title was found, but its online identifier was not); Computers & Security (title/current print ISSN found, but no accessible authority result for online ISSN); EURASIP Journal on Information Security; Formal Aspects of Computing; Wireless Communications and Mobile Computing (print identifier found, but current publisher/online pair not resolved).
- New NonCCF: Nonlinear Analysis—Hybrid Systems; Journal on Multimodal User Interfaces.

## Notes on scope and limitations

The audit is a public bibliographic identity comparison, not a full check of ranking, CCF category/rank, or every official URL. It does not infer a title merge from similar names or abbreviations. Historical/current serial relationships remain separate where sources did not settle continuity. currentSerialLookupConfirmed and similar LetPub enrichment flags are outside this audit and must not be read as ISSN-validity fields.
