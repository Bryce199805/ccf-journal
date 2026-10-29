# CCF seventh edition journal snapshot

The public catalog and source metadata are stored in the whitelisted files `data/all_journals_correct.json` and `data/ccf_catalog_meta.json`. This folder contains the row-level PDF audit:

- `ccf_pdf_transcription_audit.json`: verification of every official journal row against the formal PDF.

## Verification results

The formal PDF has 72 pages and SHA-256 `271b630b576bf8a4f802e767f5694caded93680e22b3a19bef7902591c45c1d3`. Its embedded creation and modification dates are 2026-04-09 11:13:27 +08:00, consistent with the official announcement's April 9 erratum note. The announcement does not identify the corrected row. The full PDF journal section nevertheless matches the pinned transcription by domain, level, sequence, abbreviation, and title: 295 rows and 291 unique titles. Four titles appear in two domains each: TOMM, DKE, IPL, and IJIS.

The transcription had a text-extraction line break in the abbreviation `JCOMPLEXITY`; this snapshot normalizes it. Officially blank abbreviations remain blank.

The first comparison report is preserved at `scraper/output/ccf_catalog_diff.json`. A later review found its Python normalizer did not equate `&` with `and`, and its removed-title count included legitimate name changes. The comparator now follows `scraper/lib/identity.js`. See `scraper/ccf_title_aliases.json` for nine verified old-to-current title mappings and `ccf_catalog_diff_revised.json` for the revised classification. The original 15 removed-title rows consist of nine same-journal aliases and six titles absent from the current official journal catalog. IMWUT is among the six: there is no target in the current journal source, and it does not appear in the formal PDF's journal or conference sections.

The alias records include LetPub journal IDs, ISSNs/eISSNs, source URLs, publisher evidence, and the target's current official title. Never use an abbreviation alone as an identity key; abbreviations can collide. Continue to verify the journal detail page after an alias-based lookup.

## Rebuild and verify

Run the following with a saved copy of the pinned transcription and the exact PDF whose checksum is recorded above:

```sh
python3 scraper/collect_ccf_catalog.py \
  --input-json /path/to/ccf-2026.json \
  --verify-pdf /path/to/ccf-2026.pdf \
  --current /path/to/previous/all_journals_correct.json \
  --report /path/to/ccf_catalog_diff.json
```

`--verify-pdf` requires PyMuPDF. The script validates the domain set, level counts, relation count, unique title count, nonempty titles, and duplicate relations before writing. It writes each output through a temporary file and atomic rename. PDF audit output defaults to this folder.
