#!/usr/bin/env python3
"""Extract only safe, visible WOS evidence from one HTML document on stdin."""
import json
import re
import sys
from html.parser import HTMLParser


HIDDEN = {"script", "style", "textarea", "iframe", "noscript", "nav", "header", "footer", "aside", "template"}
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
WOS = re.compile(r"WOS分区等级|WOS期刊JCR分区|WOS分区|按JIF指标学科分区|按JCI指标学科分区|JIF学科分区|JCI学科分区", re.I)
WOS_HEAD = re.compile(r"WOS分区等级|WOS期刊JCR分区|WOS分区", re.I)
SECTION_BOUNDARY = re.compile(r"期刊分区表预警名单|新锐期刊|中科院|中国科学院|CiteScore排名|JCR期刊引证报告", re.I)


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = []
        self.login_form = False
        self.in_login_form = False
        self.login_form_stack = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        style = attrs.get("style", "") or ""
        hidden = tag in HIDDEN or "hidden" in attrs or re.search(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", style, re.I)
        parent_hidden = bool(self.stack and self.stack[-1][1])
        self.stack.append((tag, parent_hidden or bool(hidden)))
        if tag == "form":
            action = attrs.get("action", "") or ""
            is_login = bool(re.search(r"(?:^|[?&])page=login(?:&|$)", action, re.I))
            self.login_form_stack.append(is_login)
        elif tag == "input" and self.login_form_stack and self.login_form_stack[-1]:
            if (attrs.get("type", "").lower() == "password" or re.search(r"password|pwd", attrs.get("name", ""), re.I)):
                self.login_form = True
        if tag not in VOID:
            return
        if self.stack:
            self.stack.pop()

    def handle_startendtag(self, tag, attrs):
        if tag not in VOID:
            self.handle_starttag(tag, attrs)
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        if tag == "form" and self.login_form_stack:
            self.login_form_stack.pop()

    def handle_data(self, data):
        if not (self.stack and self.stack[-1][1]):
            self.parts.append(data)


def extract_signals(source):
    parser = TextExtractor()
    parser.feed(source)
    visible = re.sub(r"[\u200b-\u200f\ufeff]", "", " ".join(parser.parts))
    text = re.sub(r"\s+", "", visible)
    evidence = []
    for match in list(WOS.finditer(text))[:6]:
        boundary = SECTION_BOUNDARY.search(text, match.end())
        stop = boundary.start() if boundary else min(len(text), match.start() + 500)
        # Excerpts stay within the visible WOS section, before unrelated journal/CAS blocks.
        evidence.append(text[match.start():min(stop, match.start() + 500)])
    gate = bool(re.search(r"注册或登录后.{0,160}(?:查看)?WOS分区等级", text, re.I))
    detail = bool(re.search(r"期刊名字|期刊ISSN|最新影响因子|CiteScore排名|中科院升级版分区|WOS期刊JCR分区", text, re.I))
    gate = bool(re.search(r"注册或登录后.{0,160}(?:查看)?WOS分区等级", text, re.I))
    zone_text = ""
    wos_value = False
    if not gate:
        for heading in WOS_HEAD.finditer(text):
            end = SECTION_BOUNDARY.search(text, heading.end())
            region = text[heading.end():end.start() if end else min(len(text), heading.end() + 180)]
            # A WOS heading needs a directly associated zone or explicit WOS/JIF/JCI quartile data.
            if re.search(r"(?:[1-4]\s*区|Q[1-4]|[一二三四]区)", region, re.I):
                wos_value = True
                zone = re.search(r"([1-4])区|([一二三四])区", region)
                if zone:
                    zone_text = (zone.group(1) or str("一二三四".index(zone.group(2)) + 1)) + "区"
                break
    not_indexed = bool(re.search(r"此期刊未被最新的JCR期刊引证报告收录", text, re.I))
    unavailable = bool(re.search(r"WOS分区等级[:：]?.{0,300}?(?:0区|暂无按学科分区信息)", text, re.I))
    rate_text = bool(re.search(r"(?:访问|请求|操作)(?:速度)?(?:过快|过于频繁|频繁)|速度过快|请勿频繁(?:访问|请求|操作)", text, re.I))
    captcha = bool(re.search(r"captcha|验证码", text, re.I))
    challenge = bool(re.search(r"(?:人机|安全|访问)验证|verify\s+(?:that\s+)?you\s+are\s+human|checking\s+your\s+browser|challenge-platform|cf-chl|g-recaptcha|hcaptcha|turnstile", text, re.I))
    return {"loginFormPresent": parser.login_form, "loginGateVisible": gate,
                      "hasJournalDetailContent": detail, "wosSectionPresent": bool(WOS.search(text)),
                      "wosZone": zone_text, "wosAvailable": wos_value,
                      "wosNotIndexed": not_indexed, "wosUnavailable": unavailable,
                      "rateLimited": rate_text or (captcha and challenge),
                      "wosScienceEvidence": [{"source": "visible_science_context", "text": item} for item in evidence]}


def main():
    print(json.dumps(extract_signals(sys.stdin.read()), ensure_ascii=False))


if __name__ == "__main__":
    main()
