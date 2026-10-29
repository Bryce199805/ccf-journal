#!/usr/bin/env python3
"""Build this project's journal catalog from the pinned CCF 7th-edition transcription.

The transcription is tied to a commit and checked against the formal 2026 PDF.
Use --input-json to run offline; otherwise the script downloads the pinned source.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
import tempfile
import urllib.request
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = (
    "https://raw.githubusercontent.com/haozhou-wong/ccf-recommended-list-2026-markdown/"
    "dcf1a02335fb44dcaf785997d5c535ab41628a16/data/ccf-2026.json"
)
OFFICIAL_URL = "https://www.ccf.org.cn/Academic_Evaluation/By_category/"
PDF_SHA256 = "271b630b576bf8a4f802e767f5694caded93680e22b3a19bef7902591c45c1d3"
EXPECTED_COUNTS = {
    "计算机体系结构/并行与分布计算/存储系统": {"A": 6, "B": 10, "C": 12},
    "计算机网络": {"A": 3, "B": 6, "C": 12},
    "网络与信息安全": {"A": 3, "B": 5, "C": 9},
    "软件工程/系统软件/程序设计语言": {"A": 4, "B": 12, "C": 9},
    "数据库/数据挖掘/内容检索": {"A": 4, "B": 14, "C": 16},
    "计算机科学理论": {"A": 3, "B": 13, "C": 12},
    "计算机图形学与多媒体": {"A": 4, "B": 9, "C": 15},
    "人工智能": {"A": 4, "B": 21, "C": 39},
    "人机交互与普适计算": {"A": 2, "B": 8, "C": 5},
    "交叉/综合/新兴": {"A": 4, "B": 15, "C": 16},
}
EXPECTED_UNIQUE_TITLES = 291


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "ccf-directory-catalog/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read()


def norm(value):
    value = unicodedata.normalize("NFKC", str(value or "")).upper().replace("&", " AND ")
    return " ".join(re.findall(r"[A-Z0-9\u4e00-\u9fff]+", value))


def compact(value):
    return "".join(re.findall(r"[A-Z0-9\u4e00-\u9fff]+", unicodedata.normalize("NFKC", str(value or "")).upper()))


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_source(source):
    domains = source.get("domains") if isinstance(source, dict) else None
    if not isinstance(domains, list) or not domains:
        raise ValueError("CCF source has no domain list; refusing to write outputs")
    names = [d.get("name") if isinstance(d, dict) else None for d in domains]
    if len(names) != len(set(names)):
        raise ValueError("CCF source contains duplicate domain names; refusing to write outputs")
    if set(names) != set(EXPECTED_COUNTS) or len(names) != len(EXPECTED_COUNTS):
        raise ValueError("CCF source domain set is incomplete or unexpected; refusing to write outputs")

    titles = set()
    relation_keys = set()
    for domain in domains:
        dname = domain["name"]
        journals = domain.get("journals")
        if not isinstance(journals, dict) or set(journals) != {"A", "B", "C"}:
            raise ValueError(f"{dname}: missing or invalid journal levels; refusing to write outputs")
        observed = {}
        for level, rows in journals.items():
            if level not in {"A", "B", "C"}:
                raise ValueError(f"{dname}: illegal level {level!r}; refusing to write outputs")
            if not isinstance(rows, list):
                raise ValueError(f"{dname}/{level}: journal rows must be a list; refusing to write outputs")
            observed[level] = len(rows)
            for row in rows:
                title = norm(row.get("full_name"))
                if not title:
                    raise ValueError(f"{dname}/{level}: empty journal title; refusing to write outputs")
                key = (dname, title)
                if key in relation_keys:
                    raise ValueError(f"{dname}: duplicate journal relation {row.get('full_name')!r}; refusing to write outputs")
                relation_keys.add(key)
                titles.add(title)
        if observed != EXPECTED_COUNTS[dname]:
            raise ValueError(f"{dname}: journal level counts {observed!r} do not match audited PDF counts; refusing to write outputs")

    total = sum(sum(level_counts.values()) for level_counts in EXPECTED_COUNTS.values())
    if len(relation_keys) != total or total != 295:
        raise ValueError("CCF journal relation total is empty or incomplete; refusing to write outputs")
    if len(titles) != EXPECTED_UNIQUE_TITLES:
        raise ValueError(f"CCF unique title count {len(titles)} does not match audited count {EXPECTED_UNIQUE_TITLES}; refusing to write outputs")


def verify_pdf(source, pdf_path):
    try:
        import fitz
    except ImportError as exc:
        raise ValueError("PDF verification requires PyMuPDF (fitz)") from exc

    pdf_bytes = Path(pdf_path).read_bytes()
    digest = hashlib.sha256(pdf_bytes).hexdigest()
    if digest != PDF_SHA256:
        raise ValueError(f"PDF SHA-256 {digest} does not match the pinned formal PDF {PDF_SHA256}")
    pdf = fitz.open(stream=pdf_bytes, filetype="pdf")
    pdf_metadata = pdf.metadata or {}
    records = []
    for domain in source["domains"]:
        name = domain["name"]
        starts = [i for i, page in enumerate(pdf) if "推荐国际学术期刊" in page.get_text() and name in page.get_text()]
        ends = [i for i, page in enumerate(pdf) if "推荐国际学术会议" in page.get_text() and name in page.get_text()]
        if len(starts) != 1 or len(ends) != 1 or ends[0] <= starts[0]:
            raise ValueError(f"PDF does not contain one identifiable journal section for {name}")
        level = None
        for page_index in range(starts[0], ends[0]):
            page = pdf[page_index]
            for match in re.finditer(r"([一二三])、\s*([ABC])\s*类", page.get_text()):
                level = match.group(2)
            if not level:
                continue
            words = page.get_text("words")
            sequence_words = sorted(
                [(float(w[1]), int(w[4])) for w in words
                 if 72 <= w[0] <= 108 and w[4].isdigit() and 80 < w[1] < 780],
                key=lambda item: item[0],
            )
            for index, (y, sequence) in enumerate(sequence_words):
                lower = (sequence_words[index - 1][0] + y) / 2 if index else y - 12
                upper = (y + sequence_words[index + 1][0]) / 2 if index + 1 < len(sequence_words) else 780
                abbr = " ".join(w[4] for w in words if 112 <= w[0] < 185 and lower <= w[1] < upper)
                full = " ".join(w[4] for w in words if 185 <= w[0] < 477 and lower <= w[1] < upper)
                records.append({"domain": name, "level": level, "sequence": sequence,
                                "pdfAbbr": abbr, "pdfFull": full, "page": page_index + 1})

    expected = {(d["name"], level, row["seq"]): row
                for d in source["domains"] for level, rows in d["journals"].items() for row in rows}
    actual = {(r["domain"], r["level"], r["sequence"]): r for r in records}
    if len(records) != 295 or len(actual) != 295 or set(actual) != set(expected):
        raise ValueError(f"PDF journal row keys differ from transcription (PDF={len(records)}, source={len(expected)})")

    audited = []
    for key, row in expected.items():
        pdf_row = actual[key]
        source_abbr = row.get("abbr", "") or ""
        source_full = row["full_name"]
        if source_abbr and compact(source_abbr) != compact(pdf_row["pdfAbbr"]):
            raise ValueError(f"PDF abbreviation mismatch at {key}: {source_abbr!r} != {pdf_row['pdfAbbr']!r}")
        source_compact, pdf_compact = compact(source_full), compact(pdf_row["pdfFull"])
        if source_compact not in pdf_compact and pdf_compact not in source_compact:
            raise ValueError(f"PDF title mismatch at {key}: {source_full!r} != {pdf_row['pdfFull']!r}")
        audited.append({"domain": key[0], "level": key[1], "sequence": key[2],
                        "abbr": source_abbr, "full": source_full,
                        "pdfAbbr": pdf_row["pdfAbbr"], "pdfFull": pdf_row["pdfFull"],
                        "page": pdf_row["page"], "status": "verified"})

    level_counts = {d["name"]: {level: len(d["journals"][level]) for level in "ABC"} for d in source["domains"]}
    title_domains = defaultdict(list)
    for record in audited:
        title_domains[norm(record["full"])].append(record["domain"])
    duplicates = [{"full": next(r["full"] for r in audited if norm(r["full"]) == title),
                   "domains": sorted(set(domains))}
                  for title, domains in title_domains.items() if len(domains) > 1]
    return {
        "pdfSha256": digest,
        "pdfPages": len(pdf),
        "pdfCreationDate": pdf_metadata.get("creationDate", ""),
        "pdfModificationDate": pdf_metadata.get("modDate", ""),
        "verifiedRelationCount": len(audited),
        "uniqueTitleCount": len(title_domains),
        "duplicateDomainRelations": duplicates,
        "levelCountsByDomain": level_counts,
        "entries": sorted(audited, key=lambda r: (r["domain"], r["level"], r["sequence"])),
    }


def atomic_write_many(files):
    staged = []
    try:
        for path, content in files.items():
            path = Path(path)
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                             prefix=f".{path.name}.", suffix=".tmp", delete=False) as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
                staged.append((Path(stream.name), path))
        for temporary, destination in staged:
            os.replace(temporary, destination)
    finally:
        for temporary, _ in staged:
            if temporary.exists():
                temporary.unlink()


def flatten_catalog(source):
    out = {}
    for domain in source["domains"]:
        target = out.setdefault(domain["name"], [])
        for level in ("A", "B", "C"):
            for row in domain["journals"].get(level, []):
                target.append({
                    "level": level,
                    "abbr": "JCOMPLEXITY" if norm(row.get("abbr")) == "JCOMPLEXI TY" else (row.get("abbr", "") or ""),
                    "full": row["full_name"],
                    "publisher": row.get("publisher", ""),
                    "url": row.get("url", ""),
                })
    return out


def compare(current, catalog, letpub):
    old_by_domain = {d: {norm(x["full"]): x for x in rows} for d, rows in current.items()}
    new_by_domain = {d: {norm(x["full"]): x for x in rows} for d, rows in catalog.items()}
    old_global, new_global = {}, {}
    for domain, rows in current.items():
        for row in rows:
            old_global.setdefault(norm(row["full"]), []).append((domain, row))
    for domain, rows in catalog.items():
        for row in rows:
            new_global.setdefault(norm(row["full"]), []).append((domain, row))

    letpub_by_name = {}
    for row in letpub:
        for name in (row.get("ccfFull"), row.get("name")):
            if name:
                letpub_by_name.setdefault(norm(name), []).append(row)

    added, removed, level_changes, domain_changes = [], [], [], []
    letpub_matches, letpub_unmatched = [], []
    all_names = sorted(set(old_global) | set(new_global))
    for name in all_names:
        before, after = old_global.get(name, []), new_global.get(name, [])
        old_domains, new_domains = {d for d, _ in before}, {d for d, _ in after}
        if after and not before:
            for domain, row in after:
                added.append({"domain": domain, **row})
        elif before and not after:
            for domain, row in before:
                removed.append({"domain": domain, **row})
        elif old_domains != new_domains:
            domain_changes.append({"full": after[0][1]["full"], "from": sorted(old_domains), "to": sorted(new_domains)})
        for domain, row in after:
            old = old_by_domain.get(domain, {}).get(name)
            if old and old.get("level") != row.get("level"):
                level_changes.append({"domain": domain, "full": row["full"], "from": old.get("level"), "to": row.get("level")})

    # Preserve official names and only list CCF relations when the journal is represented
    # by LetPub. A title match is used for this catalog-level comparison.
    ccf_names = set(new_global)
    for name in sorted(ccf_names):
        matches = letpub_by_name.get(name, [])
        item = {"full": new_global[name][0][1]["full"], "domains": sorted(d for d, _ in new_global[name])}
        (letpub_matches if matches else letpub_unmatched).append({**item, "letpubCount": len(matches)})

    return {
        "summary": {
            "domains": len(catalog),
            "currentEntryCount": sum(len(v) for v in current.values()),
            "officialEntryCount": sum(len(v) for v in catalog.values()),
            "letpubEntryCount": len(letpub),
            "addedTitleCount": len(added), "removedTitleCount": len(removed),
            "levelChangeCount": len(level_changes), "domainChangeCount": len(domain_changes),
            "letpubMatchedTitleCount": len(letpub_matches),
            "letpubUnmatchedTitleCount": len(letpub_unmatched),
        },
        "added": added, "removed": removed, "levelChanges": level_changes,
        "domainChanges": domain_changes, "letpubMatches": letpub_matches,
        "letpubUnmatched": letpub_unmatched,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-json", help="Use a local copy of the pinned transcription")
    parser.add_argument("--current", default=str(ROOT / "data/all_journals_correct.json"))
    parser.add_argument("--letpub", default=str(ROOT / "data/letpub_full.json"))
    parser.add_argument("--output", default=str(ROOT / "data/all_journals_correct.json"))
    parser.add_argument("--report", default=str(ROOT / "scraper/output/ccf_catalog_diff.json"))
    parser.add_argument("--verify-pdf", help="Verify every journal row against a local formal PDF")
    parser.add_argument("--audit-output", default=str(ROOT / "scraper/fixtures/catalog/ccf_pdf_transcription_audit.json"))
    args = parser.parse_args()

    payload = Path(args.input_json).read_bytes() if args.input_json else fetch(SOURCE_URL)
    source = json.loads(payload.decode("utf-8"))
    validate_source(source)
    pdf_audit = verify_pdf(source, args.verify_pdf) if args.verify_pdf else None
    catalog = flatten_catalog(source)
    current, letpub = read_json(args.current), read_json(args.letpub)

    diff = compare(current, catalog, letpub)
    official_total = sum(len(rows) for rows in catalog.values())
    diff["summary"]["catalogEntryCount"] = official_total
    diff["summary"]["officialAddedRelationCount"] = sum(
        1 for d, rows in catalog.items() for row in rows
        if norm(row["full"]) not in {norm(x["full"]) for x in current.get(d, [])}
    )
    meta = {
        "organization": "中国计算机学会（CCF）",
        "catalog": "中国计算机学会推荐国际学术会议和期刊目录",
        "edition": "第七版",
        "publishedAt": "2026-03-31",
        "erratumUpdatedAt": "2026-04-09",
        "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "officialAnnouncement": OFFICIAL_URL,
        "officialCategoryPages": [OFFICIAL_URL + p for p in [
            "ARCH_DCP_SS/", "CN/", "NIS/", "TCSE_SS_PDL/", "DM_CS/", "TCS/",
            "CGAndMT/", "AI/", "HCIAndPC/", "Cross_Compre_Emerging/",
        ]],
        "primaryDocument": "第七版中国计算机学会推荐国际学术会议和期刊目录（正式版），CCF 公告附件；公告注明 2026-04-09 更新修正一处勘误。",
        "formalPdfMirror": "https://github.com/LovenSar/CCF_RANK/blob/55ca5eae67c26d518c6a8b71ee5827a053086f20/第七版中国计算机学会推荐国际学术会议和期刊目录（正式版）-CCF-ABC.pdf",
        "formalPdfSha256": PDF_SHA256,
        "formalPdfCreationDate": "2026-04-09T11:13:27+08:00",
        "formalPdfModificationDate": "2026-04-09T11:13:27+08:00",
        "pdfAudit": {
            "path": "scraper/fixtures/catalog/ccf_pdf_transcription_audit.json",
            "verifiedRelations": 295,
            "uniqueJournalTitles": 291,
        },
        "structuredTranscription": SOURCE_URL,
        "transcriptionCommit": "dcf1a02335fb44dcaf785997d5c535ab41628a16",
        "notes": [
            "The CCF announcement is authoritative; all 295 journal relations in the pinned transcription were checked by domain, level, sequence, abbreviation, and title against the formal PDF.",
            "The checked PDF metadata records creation and modification at 2026-04-09 11:13:27 +08:00, consistent with the announcement's 2026-04-09 erratum update.",
            "The CCF announcement does not identify the corrected row; the audit verifies the complete post-erratum PDF snapshot and records its checksum.",
            "Static CCF category pages were not treated as the source of truth because their contents may lag the formal PDF.",
            "Officially blank abbreviations remain empty. The line-wrapped PDF abbreviation JCOMPLEXI / TY is normalized to JCOMPLEXITY.",
            "A journal appearing in multiple CCF domains remains a separate domain relation in all_journals_correct.json.",
        ],
    }
    out_path, report_path = Path(args.output), Path(args.report)
    files = {
        out_path: json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        report_path: json.dumps(diff, ensure_ascii=False, indent=2) + "\n",
        ROOT / "data/ccf_catalog_meta.json": json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
    }
    if pdf_audit is not None:
        files[args.audit_output] = json.dumps(pdf_audit, ensure_ascii=False, indent=2) + "\n"
    atomic_write_many(files)
    print(json.dumps(diff["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
