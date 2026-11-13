"""미리보기 보고서 — 수집 배치를 화면 데이터와 견줘 사람이 반영 여부를 판단하게 한다 (NEXT 80 ③).

    python -m collector preview --batch <batch_id> [--out-root data/collector]

읽는 것: <out-root>/<batch_id>/manifest.json, frontend/data/institutions.js, institutions_nonmuni.js
쓰는 것: <out-root>/<batch_id>/preview.html, preview.csv (그 밖의 파일은 절대 쓰지 않는다)

화면 데이터 js는 실행하지 않고 작은 리터럴 파서로 읽는다. institutions.js의 구·군 레코드는 파일 뒤쪽에서
표로 '생성'되므로(window.institutions.push) 정적 파싱으로는 얻을 수 없다 — 그 사실을 보고서 머리에 적고,
정확히 맞추려면 --screen-json(node로 덤프한 최종 배열)을 준다.
"""

from __future__ import annotations

import csv
import datetime
import html
import io
import json
import os
import re
from pathlib import Path

from collector.batch import DEFAULT_OUT_ROOT

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INSTITUTIONS_JS = REPO_ROOT / "frontend" / "data" / "institutions.js"
DEFAULT_NONMUNI_JS = REPO_ROOT / "frontend" / "data" / "institutions_nonmuni.js"

BATCH_ID_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.\-]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NEAR_DAYS = 180   # 이 안이면 '같은 회차'로 본다

CAT_NEW, CAT_DIFF, CAT_DONE, CAT_MISSING = "새 소식", "값 다름", "이미 반영", "기관 못 찾음"
CATEGORIES = (CAT_NEW, CAT_DIFF, CAT_DONE, CAT_MISSING)
CAT_CLASS = {CAT_NEW: "new", CAT_DIFF: "diff", CAT_DONE: "done", CAT_MISSING: "miss"}

G2B_URL = "https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=%s&bidPbancOrd=%s"


class PreviewError(Exception):
    """사용자에게 그대로 보여도 되는 메시지만 담는다."""


# ── 안전한 JS 리터럴 파서 (실행하지 않는다) ─────────────────────────────

class _JsError(ValueError):
    pass


_ESC = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "0": "\0"}
_NUM = re.compile(r"-?\d+(?:\.\d+)?")
_IDENT = re.compile(r"[A-Za-z_$][\w$]*")
_CONSTS = {"true": True, "false": False, "null": None}


class _Lit:
    def __init__(self, text: str, pos: int = 0):
        self.s = text
        self.i = pos

    def ws(self) -> None:
        s, n = self.s, len(self.s)
        while self.i < n:
            c = s[self.i]
            if c.isspace():
                self.i += 1
            elif s.startswith("//", self.i):
                j = s.find("\n", self.i)
                self.i = n if j < 0 else j + 1
            elif s.startswith("/*", self.i):
                j = s.find("*/", self.i + 2)
                if j < 0:
                    raise _JsError("comment")
                self.i = j + 2
            else:
                break

    def peek(self) -> str:
        self.ws()
        return self.s[self.i] if self.i < len(self.s) else ""

    def string(self) -> str:
        s = self.s
        quote = s[self.i]
        self.i += 1
        out = []
        while self.i < len(s):
            c = s[self.i]
            if c == quote:
                self.i += 1
                return "".join(out)
            if c == "\n":
                break
            if c == "\\":
                self.i += 1
                e = s[self.i:self.i + 1]
                if e == "u":
                    try:
                        out.append(chr(int(s[self.i + 1:self.i + 5], 16)))
                    except ValueError:
                        raise _JsError("escape")
                    self.i += 5
                else:
                    out.append(_ESC.get(e, e))
                    self.i += 1
                continue
            out.append(c)
            self.i += 1
        raise _JsError("string")

    def value(self):
        c = self.peek()
        if c in ("\"", "'"):
            return self.string()
        if c == "{":
            return self.object()
        if c == "[":
            return self.array()
        m = _NUM.match(self.s, self.i)
        if m:
            self.i = m.end()
            return float(m.group()) if "." in m.group() else int(m.group())
        m = _IDENT.match(self.s, self.i)
        if not m:
            raise _JsError("value")
        name = m.group()
        self.i = m.end()
        if name in _CONSTS:
            return _CONSTS[name]
        if name in ("E", "G", "U") and self.peek() == "(":
            self.i += 1
            args = []
            while self.peek() != ")":
                if self.peek() == "":
                    raise _JsError("call")
                args.append(self.value())
                if self.peek() == ",":
                    self.i += 1
            self.i += 1
            if name == "U":
                if not args or not all(isinstance(a, str) for a in args) or len(args) > 2:
                    raise _JsError("U")
                return G2B_URL % (args[0], args[1] if len(args) > 1 else "000")
            if len(args) != 1:
                raise _JsError(name)
            return args[0]
        raise _JsError(name)

    def object(self) -> dict:
        self.i += 1
        out: dict = {}
        while True:
            c = self.peek()
            if c == "}":
                self.i += 1
                return out
            if c == "":
                raise _JsError("object")
            if c in ("\"", "'"):
                key = self.string()
            else:
                m = _IDENT.match(self.s, self.i)
                if not m:
                    raise _JsError("key")
                key = m.group()
                self.i = m.end()
            if self.peek() != ":":
                raise _JsError("colon")
            self.i += 1
            out[key] = self.value()
            if self.peek() == ",":
                self.i += 1

    def array(self) -> list:
        self.i += 1
        out: list = []
        while True:
            c = self.peek()
            if c == "]":
                self.i += 1
                return out
            if c == "":
                raise _JsError("array")
            out.append(self.value())
            if self.peek() == ",":
                self.i += 1

    def top_array(self):
        """원소 단위로 실패를 허용한다. (원소 목록, 실패 수)."""
        self.i += 1   # '['
        items, failed = [], 0
        while True:
            c = self.peek()
            if c == "]":
                self.i += 1
                break
            if c == "":
                break
            if c == ",":
                self.i += 1
                continue
            start = self.i
            try:
                v = self.value()
                ok = isinstance(v, dict)
            except (_JsError, RecursionError):
                ok = False
            if ok:
                items.append(v)
            else:
                failed += 1
                self.i = start
                self._skip_element()
                if self.i <= start:
                    self.i = start + 1
        return items, failed

    def _skip_element(self) -> None:
        s, depth = self.s, 0
        while self.i < len(s):
            c = s[self.i]
            if c in ("\"", "'"):
                before = self.i
                try:
                    self.string()
                except _JsError:
                    self.i = max(self.i, before + 1)
                continue
            if s.startswith("//", self.i) or s.startswith("/*", self.i):
                try:
                    self.ws()
                except _JsError:
                    self.i = len(s)
                continue
            if c in "([{":
                depth += 1
            elif c in ")]}":
                if depth == 0:
                    return
                depth -= 1
            elif c == "," and depth == 0:
                self.i += 1
                return
            self.i += 1


def parse_js_array(text: str, marker: str):
    """marker(정규식, '… = [' 로 끝남) 뒤의 배열 리터럴을 읽는다. (레코드 목록, 실패 수, 찾았는지)."""
    m = re.search(marker, text)
    if not m:
        return [], 0, False
    lit = _Lit(text, m.end() - 1)
    items, failed = lit.top_array()
    return items, failed, True


# ── 화면 데이터 읽기 ────────────────────────────────────────────────────

def _read_text(path: Path):
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def load_screen(institutions_js=None, nonmuni_js=None, screen_json=None):
    """화면 레코드 목록과 파싱 현황(info)을 돌려준다. 파일은 읽기만 한다."""
    info = {"mode": "js", "institutions": 0, "institutions_failed": 0, "generated_blocks": 0,
            "nonmuni": 0, "nonmuni_failed": 0, "screen_json": 0, "missing_files": []}
    screens: list = []
    if screen_json:
        text = _read_text(Path(screen_json))
        try:
            data = json.loads(text) if text is not None else None
        except ValueError:
            data = None
        if not isinstance(data, list):
            raise PreviewError("--screen-json을 읽을 수 없습니다(JSON 배열이어야 함)")
        screens = [r for r in data if isinstance(r, dict)]
        info["mode"] = "screen-json"
        info["screen_json"] = len(screens)
        return screens, info

    ij = Path(institutions_js or DEFAULT_INSTITUTIONS_JS)
    text = _read_text(ij)
    if text is None:
        info["missing_files"].append(ij.name)
    else:
        items, failed, found = parse_js_array(text, r"window\.institutions\s*=\s*\[")
        if not found:
            info["missing_files"].append(ij.name + "(배열 못 찾음)")
        screens += items
        info["institutions"], info["institutions_failed"] = len(items), failed
        info["generated_blocks"] = text.count("window.institutions.push(")
    nj = Path(nonmuni_js or DEFAULT_NONMUNI_JS)
    text = _read_text(nj)
    if text is None:
        info["missing_files"].append(nj.name)
    else:
        items, failed, found = parse_js_array(text, r"root\.institutionsNonMuni\s*=\s*\[")
        if not found:
            info["missing_files"].append(nj.name + "(배열 못 찾음)")
        screens += items
        info["nonmuni"], info["nonmuni_failed"] = len(items), failed
    return screens, info


# ── 기관 맞추기 ─────────────────────────────────────────────────────────

_STRIP = ("재단법인", "(재)", "（재）", "㈜", "(주)", "주식회사")


def _norm(name: str) -> str:
    n = name or ""
    for token in _STRIP:
        n = n.replace(token, "")
    return re.sub(r"[\s·ㆍ・‧]+", "", n)   # 가운뎃점 글자가 출처마다 달라 비교에서 뺀다


def _admin(name: str) -> str:
    n = _norm(name)
    if len(n) > 2 and n.endswith(("시청", "군청", "구청")):
        n = n[:-1]
    return n


def _s(v) -> str:
    return v if isinstance(v, str) else ""


def _screen_key(rec: dict) -> str:
    return _s(rec.get("region")) + "|" + _s(rec.get("name"))   # logic.instKey와 같은 규칙


class _Index:
    def __init__(self, screens: list):
        self.by_key: dict = {}
        self.by_region: dict = {}
        self.by_norm: dict = {}
        for rec in screens:
            self.by_key.setdefault(_screen_key(rec), rec)
            self.by_region.setdefault(_s(rec.get("region")), []).append(rec)
            self.by_norm.setdefault(_norm(_s(rec.get("name"))), []).append(rec)

    def find(self, facts: dict):
        """(화면 레코드 또는 None, 못 찾은 이유)."""
        if facts["key"] and facts["key"] in self.by_key:
            return self.by_key[facts["key"]], ""
        names = [n for n in (facts["name"], facts["key_name"]) if n]
        if not names:
            return None, "기관 이름 없음"
        region = facts["region"]
        if region:
            tails = set()
            for n in names:
                tails.add(_admin(n))
                parts = n.split()
                if parts:
                    tails.add(_admin(parts[-1]))
            cands = [r for r in self.by_region.get(region, []) if _admin(_s(r.get("name"))) in tails]
            if len(cands) == 1:
                return cands[0], ""
            if len(cands) > 1:
                return None, "같은 지역에 이름이 겹치는 곳이 여러 곳"
            return None, "화면에 없거나 해석하지 못함(새 기관 후보일 수 있음)"
        cands = self.by_norm.get(_norm(names[0]), [])
        if len(cands) == 1:
            return cands[0], ""
        if len(cands) > 1:
            return None, "같은 이름이 화면에 여러 곳"
        return None, "화면에 없거나 해석하지 못함(새 기관 후보일 수 있음)"


# ── 레코드 사실 추출·분류 ───────────────────────────────────────────────

def _date(v):
    return v if isinstance(v, str) and DATE_RE.match(v) else ""


def _to_date(v):
    try:
        return datetime.date.fromisoformat(v)
    except (TypeError, ValueError):
        return None


def _term(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and v > 0 else None


def _facts(rec: dict) -> dict:
    def sub(k):
        v = rec.get(k)
        return v if isinstance(v, dict) else {}
    inst, notice, cand, sched, ev = sub("institution"), sub("notice"), sub("candidate"), sub("schedule"), sub("evidence")
    fields = cand.get("fields") if isinstance(cand.get("fields"), dict) else {}
    key = _s(notice.get("institution_key")) or _s(inst.get("key"))
    key_region, _, key_name = key.partition("|")
    region = key_region if "|" in key else _s(inst.get("region_code"))
    return {
        "id": _s(rec.get("notice_id")), "title": _s(rec.get("title")),
        "key": key if "|" in key else "", "key_name": key_name, "region": region,
        "name": _s(inst.get("name_ko")),
        "number": _s(notice.get("number")), "mgt_no": _s(notice.get("mgt_no")),
        "url": _s(ev.get("url")), "role": _s(cand.get("role")) or _s(notice.get("kind")),
        "notice_at": _date(fields.get("notice_at")) or _date(sched.get("posted_at")),
        "deadline_at": _date(fields.get("deadline_at")) or _date(sched.get("deadline_at")),
        "contract_end": _date(fields.get("contract_end")) or _date(sched.get("contract_end")),
        "last_bid": _date(fields.get("last_bid")) or _date(sched.get("last_bid")),
        "term": _term(fields.get("term")) or _term(sched.get("term")),
        "bank": _s(fields.get("bank")), "award_at": _date(fields.get("award_at")),
        "bank_status": _s(fields.get("bank_status")),
    }


def _sources(screen: dict) -> list:
    src = screen.get("sources")
    return [x for x in src if isinstance(x, str)] if isinstance(src, list) else []


def _has_token(text: str, token: str) -> bool:
    if len(token) < 4:
        return False
    return re.search(r"(?<![0-9A-Za-z])" + re.escape(token) + r"(?![0-9A-Za-z])", text) is not None


def _near(a: str, b: str) -> bool:
    da, db = _to_date(a), _to_date(b)
    return da is not None and db is not None and abs((da - db).days) <= NEAR_DAYS


_BANK_BRANCH = ("금융센터", "지점", "지부", "출장소")
_BANK_PREFIX = re.compile(r"^(?:dgb|kb|ibk|bnk|nh|sh|jb|sc|kdb)", re.I)   # 금융그룹 영문 접두(같은 은행)
_BANK_ALIAS = {"im뱅크": "아이엠뱅크", "대구은행": "아이엠뱅크", "농협": "농협은행"}   # 대구은행→iM뱅크(2024 상호 변경)
_BANK_SPLIT = re.compile(r"[·ㆍ・‧,/]|\s및\s")       # 공동(1·2금고) 표기는 은행별로 나눠 비교한다(qa 11-13 P2)


def _bank_one(name) -> str:
    n = re.sub(r"[(（][^)）]*[)）]", " ", _s(name))          # 괄호 안(지점명·주식회사 표기) 제거
    words = n.split()
    kept = [w for w in words if not w.endswith(_BANK_BRANCH)] if len(words) > 1 else words
    n = _BANK_PREFIX.sub("", _norm(" ".join(kept))).lower()
    return _BANK_ALIAS.get(n, n)


def _bank_norm(name) -> frozenset:
    return frozenset(x for x in (_bank_one(part) for part in _BANK_SPLIT.split(_s(name))) if x)


def _bank_same(a, b) -> bool:
    x, y = _bank_norm(a), _bank_norm(b)
    if not x or not y:
        return True            # 한쪽이 비면 '다름'으로 보지 않는다(화면 빈칸은 CSV 열로 눈으로 확인)
    if len(x) != len(y):
        return False           # 단독 금고 ↔ 공동 금고는 다름
    return all(any(i == j or (min(len(i), len(j)) >= 4 and (i in j or j in i)) for j in y) for i in x)


def classify(facts: dict, screen):
    """(분류, 사유). screen이 None이면 '기관 못 찾음'(사유는 호출자가 채운다)."""
    if screen is None:
        return CAT_MISSING, ""
    last_bid, contract_end = _date(screen.get("lastBid")), _date(screen.get("contractEnd"))
    refs = [d for d in (last_bid, contract_end) if d]
    srcs = _sources(screen)
    text = "\n".join(srcs)

    by = ""
    if facts["number"] and _has_token(text, facts["number"]):
        by = "공고번호"
    elif facts["mgt_no"] and not facts["mgt_no"].isdigit() and _has_token(text, facts["mgt_no"]):
        by = "관리번호"
    elif facts["url"] and facts["url"] in srcs:
        by = "근거 URL"
    elif {facts["notice_at"], facts["last_bid"]} & set(refs):
        by = "날짜 일치"
    elif facts["deadline_at"] and facts["deadline_at"] == contract_end:
        by = "마감일 일치"

    s_exp = _date(screen.get("contractExpiry"))
    # 지난 회차(11-13 미리보기 오탐): 수집한 약정 만료가 화면 현 약정 만료보다 이르거나, 공고가 현 약정 시작 전(만료-6년)이면
    # 이미 지나간 회차다 — '새 소식'·'값 다름'으로 올리지 않는다.
    if s_exp:
        if facts["contract_end"] and facts["contract_end"] < s_exp:
            return CAT_DONE, "이전 회차(수집 약정 만료 %s < 화면 현 약정 만료 %s)" % (facts["contract_end"], s_exp)
        cut = _to_date(s_exp)
        newest_any = max([d for d in (facts["notice_at"], facts["deadline_at"]) if d] or [""])
        if cut and newest_any and _to_date(newest_any) and _to_date(newest_any) < cut - datetime.timedelta(days=365 * 6 + 1):   # 2월 29일 안전(security 11-13)
            return CAT_DONE, "이전 회차로 보임(공고 %s, 화면 현 약정 만료 %s)" % (newest_any, s_exp)

    if by:
        diffs = []
        s_term = _term(screen.get("term"))
        if facts["term"] and s_term and facts["term"] != s_term:
            diffs.append("약정 연수 수집 %d년 ≠ 화면 %d년" % (facts["term"], s_term))
        if facts["contract_end"] and s_exp and facts["contract_end"] != s_exp:
            diffs.append("약정 만료 수집 %s ≠ 화면 %s" % (facts["contract_end"], s_exp))
        if facts["bank"] and not _bank_same(facts["bank"], screen.get("bank")):
            diffs.append("낙찰자 수집 %s ≠ 화면 %s" % (facts["bank"], _s(screen.get("bank"))))
        if diffs:
            return CAT_DIFF, "반영된 회차(%s)인데 " % by + "; ".join(diffs)
        return CAT_DONE, "화면에 이미 있음(%s)" % by

    dates = [d for d in (facts["notice_at"], facts["deadline_at"]) if d]
    if not dates:
        return CAT_NEW, "공고일·마감일 없음 — 사람이 확인"
    newest = max(dates)
    if not refs:
        return CAT_NEW, "화면에 날짜 없음, 수집 %s" % newest
    if newest > max(refs):
        return CAT_NEW, "공고·마감일 %s가 화면 최신일 %s보다 새로움" % (newest, max(refs))
    for d in dates:
        for r in refs:
            if _near(d, r):
                return CAT_DIFF, "같은 회차로 보이나 날짜 다름(수집 %s, 화면 %s)" % (d, r)
    return CAT_DONE, "화면보다 오래된 공고 — 이전 회차로 보임"


CSV_COLUMNS = ("분류", "사유", "공고ID", "제목", "수집_기관명", "화면_기관명", "공고일", "마감일",
               "약정만료(수집)", "약정연수(수집)", "화면_lastBid", "화면_contractEnd", "화면_약정연수", "근거URL",
               "낙찰자(수집)", "낙찰일(수집)", "낙찰상태(수집)", "화면_bank")


def build_rows(records: list, screens: list) -> list:
    index = _Index(screens)
    rows = []
    for rec in records:
        if not isinstance(rec, dict):
            continue
        facts = _facts(rec)
        screen, why = index.find(facts)
        cat, reason = classify(facts, screen)
        if screen is None:
            reason = why
        rows.append({
            "cat": cat, "reason": reason, "id": facts["id"], "title": facts["title"],
            "name": facts["name"] or facts["key_name"],
            "screen_name": _s(screen.get("name")) if screen else "",
            "notice_at": facts["notice_at"], "deadline_at": facts["deadline_at"],
            "contract_end": facts["contract_end"], "term": facts["term"] or "",
            "s_last_bid": _date(screen.get("lastBid")) if screen else "",
            "s_contract_end": _date(screen.get("contractEnd")) if screen else "",
            "s_term": (_term(screen.get("term")) or "") if screen else "",
            "url": facts["url"],
            "bank": facts["bank"], "award_at": facts["award_at"], "bank_status": facts["bank_status"],
            "s_bank": _s(screen.get("bank")) if screen else "",
        })
    order = {c: i for i, c in enumerate(CATEGORIES)}
    rows.sort(key=lambda r: (order[r["cat"]], r["name"], r["notice_at"] or ""))
    return rows


# ── 출력 ────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape("" if v is None else str(v), quote=True)


def _csv_cell(v) -> str:
    t = "" if v is None else str(v)
    return "'" + t if t[:1] in ("=", "+", "-", "@", "\t", "\r") else t


def build_csv(rows: list) -> str:
    buf = io.StringIO(newline="")
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(CSV_COLUMNS)
    for r in rows:
        w.writerow([_csv_cell(x) for x in (
            r["cat"], r["reason"], r["id"], r["title"], r["name"], r["screen_name"], r["notice_at"],
            r["deadline_at"], r["contract_end"], r["term"], r["s_last_bid"], r["s_contract_end"],
            r["s_term"], r["url"], r["bank"], r["award_at"], r["bank_status"], r["s_bank"])])
    return buf.getvalue()


def _parse_note(info: dict) -> str:
    if info["mode"] == "screen-json":
        return "화면 데이터: --screen-json에서 %d건 읽음(js 해석 안 함)." % info["screen_json"]
    note = ("화면 데이터 해석 건수 — institutions.js 직접 기재 %d곳(해석 실패 %d), "
            "생성 블록(push) %d곳은 해석하지 않음 · institutions_nonmuni.js %d곳(해석 실패 %d)."
            % (info["institutions"], info["institutions_failed"], info["generated_blocks"],
               info["nonmuni"], info["nonmuni_failed"]))
    if info["missing_files"]:
        note += " 못 읽은 파일: " + ", ".join(info["missing_files"]) + "."
    if info["generated_blocks"]:
        note += (" 구·군 레코드 대부분이 생성 블록에 있어 '기관 못 찾음'이 많이 나올 수 있습니다 —"
                 " 정확히 맞추려면 --screen-json을 쓰세요.")
    return note


def build_html(manifest: dict, rows: list, info: dict, counts: dict) -> str:
    src = manifest.get("source") if isinstance(manifest.get("source"), dict) else {}
    head = ("<tr>" + "".join("<th>%s</th>" % _e(c) for c in CSV_COLUMNS[:13] + CSV_COLUMNS[14:]) + "<th>근거</th></tr>")   # 근거URL은 링크로 맨 끝
    body = []
    for r in rows:
        url = r["url"]
        if url.startswith(("http://", "https://")):
            link = '<a href="%s" rel="noreferrer noopener">원문</a>' % _e(url)
        else:
            link = _e(url)
        cells = (r["cat"], r["reason"], r["id"], r["title"], r["name"], r["screen_name"], r["notice_at"],
                 r["deadline_at"], r["contract_end"], r["term"], r["s_last_bid"], r["s_contract_end"], r["s_term"],
                 r["bank"], r["award_at"], r["bank_status"], r["s_bank"])
        body.append('<tr class="%s">%s<td>%s</td></tr>'
                    % (CAT_CLASS[r["cat"]], "".join("<td>%s</td>" % _e(c) for c in cells), link))
    summary = " · ".join("%s %d건" % (c, counts[c]) for c in CATEGORIES)
    return """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>수집 미리보기 — %(bid)s</title>
<style>
body{font-family:'Malgun Gothic',sans-serif;margin:16px;color:#222}
table{border-collapse:collapse;font-size:12px}
th,td{border:1px solid #ccc;padding:3px 6px;vertical-align:top}
th{background:#f0f0f0;position:sticky;top:0}
tr.new td{background:#e8f5e9}tr.diff td{background:#fff8e1}tr.done td{background:#f5f5f5;color:#666}tr.miss td{background:#fdecea}
.note{background:#eef;padding:6px 10px;margin:8px 0}
</style></head><body>
<h1>수집 미리보기</h1>
<p>배치 %(bid)s · 수집 %(at)s · 소스 %(src)s · 공고 %(n)d건</p>
<p><b>%(summary)s</b></p>
<p class="note">%(parse)s</p>
<p class="note">이 보고서는 참고용입니다. 화면 데이터 파일은 고치지 않았습니다. 반영 여부는 사람이 판단하세요.
기관 연결은 이름 비교이며(지역 코드가 있으면 같은 지역 안에서만) 추정입니다.</p>
<table>%(head)s%(body)s</table>
</body></html>
""" % {"bid": _e(manifest.get("batch_id")), "at": _e(manifest.get("collected_at")),
       "src": _e(src.get("name_ko") or src.get("slug")), "n": len(rows), "summary": _e(summary),
       "parse": _e(_parse_note(info)), "head": head, "body": "\n".join(body)}


def _write_text(path: Path, text: str, encoding: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding=encoding, newline="")
    os.replace(tmp, path)


def run_preview(batch_id: str, out_root=DEFAULT_OUT_ROOT, institutions_js=None, nonmuni_js=None,
                screen_json=None) -> dict:
    if not isinstance(batch_id, str) or not BATCH_ID_RE.match(batch_id) or ".." in batch_id:
        raise PreviewError("batch_id 형식이 올바르지 않습니다")
    batch_dir = Path(out_root) / batch_id
    manifest_path = batch_dir / "manifest.json"
    if not manifest_path.is_file():
        raise PreviewError("배치를 찾을 수 없습니다: %s" % batch_id)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise PreviewError("manifest.json을 읽을 수 없습니다")
    records = manifest.get("records") if isinstance(manifest, dict) else None
    if not isinstance(records, list):
        raise PreviewError("manifest.json에 records(배열)가 없습니다")

    screens, info = load_screen(institutions_js, nonmuni_js, screen_json)
    rows = build_rows(records, screens)
    counts = {c: 0 for c in CATEGORIES}
    for r in rows:
        counts[r["cat"]] += 1
    _write_text(batch_dir / "preview.html", build_html(manifest, rows, info, counts), "utf-8")
    _write_text(batch_dir / "preview.csv", build_csv(rows), "utf-8-sig")
    return {"batch_id": batch_id, "records": len(rows), "counts": counts,
            "screen": {k: info[k] for k in ("mode", "institutions", "institutions_failed",
                                            "generated_blocks", "nonmuni", "nonmuni_failed", "screen_json")},
            "files": ["preview.html", "preview.csv"]}
