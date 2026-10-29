#!/usr/bin/env python3
"""Extract only visible journal IDs and anchor titles from a search page on stdin."""
import json
import re
import sys
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlsplit


HIDDEN = {"script", "style", "noscript", "template", "svg"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class SearchParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.anchor = None
        self.results = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        hide = tag in HIDDEN or "hidden" in attrs or attrs.get("aria-hidden") == "true"
        style = (attrs.get("style") or "").replace(" ", "").lower()
        hide = hide or "display:none" in style or "visibility:hidden" in style
        if tag not in VOID:
            self.stack.append((tag, hide))
        if tag == "a" and not any(hidden for _, hidden in self.stack) and attrs.get("href"):
            self.anchor = {"href": attrs["href"], "parts": []}

    def handle_endtag(self, tag):
        if tag == "a" and self.anchor is not None:
            query = parse_qs(urlsplit(self.anchor["href"]).query)
            ids = query.get("journalid", [])
            if not ids:
                match = re.search(r"(?:^|[?&])journalid=(\d+)(?:&|$)", self.anchor["href"])
                ids = [match.group(1)] if match else []
            title = re.sub(r"\s+", " ", " ".join(self.anchor["parts"])).strip()
            for journalid in ids:
                if re.fullmatch(r"\d+", journalid):
                    self.results.append({"journalid": journalid, "title": title})
            self.anchor = None
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        if self.anchor is not None and not any(hidden for _, hidden in self.stack):
            self.anchor["parts"].append(data)


parser = SearchParser()
parser.feed(sys.stdin.read())
unique = []
seen = set()
for row in parser.results:
    marker = (row["journalid"], row["title"])
    if marker not in seen:
        seen.add(marker)
        unique.append(row)
sys.stdout.write(json.dumps({"results": unique}, ensure_ascii=False))
