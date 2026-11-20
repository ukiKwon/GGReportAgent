(function (root) {
  'use strict';
  // 공통 팝업 틀(.dlg) — 여는 순서·닫기·Esc·바깥 클릭·포커스·저장 안 한 내용 확인을 한 곳에서 맡는다.
  // 규격: 사용자 11-20 시안 4판(handoff/agents/history/2026-11-20_dlg_sian/sian.html),
  //       design-reviewer 2026-11-19_1946_a81b2ea2 · 2026-11-20_0949_a79603d8.
  //  - 닫기 = requestClose 하나: [닫기]·[취소]·Esc·바깥 클릭이 모두 여기로 온다.
  //  - 쓰는 창은 opts.isDirty()가 참이면 위쪽(.dlg-note)에 "닫으면 … 사라집니다 [버리고 닫기][계속 작성]"을 펼친다.
  //  - 팝업 위 팝업: 늦게 연 것이 위(z = 30 + 열린 순서), Esc는 맨 위 창에만.
  //  - 닫으면 열기 전 포커스로 돌아간다. 뒤 화면은 inert(키보드·마우스가 닿지 않음).
  // 순수 함수(zFor·mergeDescribedBy·removeDescribedBy)는 node 테스트용으로 따로 둔다.
  const dlg = {};

  dlg.Z_BASE = 30;
  dlg.DIRTY_TEXT = '닫으면 입력한 내용이 사라집니다.';

  // 열린 순서(0부터) → z-index. 시스템 알림(39)보다 아래에 머문다.
  dlg.zFor = function (depth) {
    const d = Math.max(0, Math.floor(Number(depth) || 0));
    return Math.min(dlg.Z_BASE + d, 38);
  };

  // aria-describedby 토큰 합치기·빼기 — 기존 연결을 덮어쓰지 않는다.
  function tokens(s) { return String(s == null ? '' : s).split(/\s+/).filter(Boolean); }
  dlg.mergeDescribedBy = function (existing, id) {
    const t = tokens(existing);
    if (id && t.indexOf(id) < 0) t.push(id);
    return t.join(' ');
  };
  dlg.removeDescribedBy = function (existing, id) {
    const t = tokens(existing).filter(function (x) { return x !== id; });
    return t.length ? t.join(' ') : null;
  };

  // ── DOM ───────────────────────────────────────────────────────────
  const stack = [];   // { overlay, opts, opener, inerted: [] }

  function entryOf(overlay) {
    for (let i = 0; i < stack.length; i += 1) if (stack[i].overlay === overlay) return stack[i];
    return null;
  }
  function top() { return stack.length ? stack[stack.length - 1] : null; }
  function boxOf(overlay) { return overlay.querySelector('.dlg') || overlay; }

  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function focusables(box) {
    return Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), function (n) {
      return !n.hidden && n.offsetParent !== null;
    });
  }

  function setInert(overlay) {
    const out = [];
    const body = overlay.ownerDocument.body;
    Array.prototype.forEach.call(body.children, function (n) {
      if (n === overlay || n.contains(overlay) || n.inert) return;
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
      n.inert = true; out.push(n);
    });
    return out;
  }

  // 열기. opts: { isDirty(): bool, dirtyText, onClose(), focus: Element }
  dlg.open = function (overlay, opts) {
    if (!overlay) return;
    const o = opts || {};
    const old = entryOf(overlay);
    if (old) { old.opts = o; return; }   // 이미 열려 있으면 옵션만 갈아 끼운다
    const doc = overlay.ownerDocument;
    const e = { overlay: overlay, opts: o, opener: doc.activeElement, inerted: [] };
    overlay.style.zIndex = String(dlg.zFor(stack.length));
    overlay.style.display = '';
    e.inerted = setInert(overlay);
    stack.push(e);
    wireOnce(doc);
    const box = boxOf(overlay);
    const t = o.focus || box.querySelector('.dlg-t[tabindex]') || focusables(box)[0];
    if (t && t.focus) t.focus();
  };

  // 바로 닫기(확인 없이).
  dlg.close = function (overlay) {
    const e = entryOf(overlay);
    if (!e) { if (overlay) overlay.style.display = 'none'; return; }
    hideConfirm(e);
    overlay.style.display = 'none';
    overlay.style.zIndex = '';
    stack.splice(stack.indexOf(e), 1);
    e.inerted.forEach(function (n) { n.inert = false; });
    if (typeof e.opts.onClose === 'function') { try { e.opts.onClose(); } catch (err) { /* 닫기는 막지 않는다 */ } }
    if (e.opener && e.opener.focus && e.opener.isConnected) e.opener.focus();
  };

  // [닫기]·[취소]·Esc·바깥 클릭이 부르는 하나의 닫기.
  dlg.requestClose = function (overlay) {
    const e = entryOf(overlay);
    if (!e) return;
    if (e.cf) return;   // 확인 상자가 이미 열려 있음
    let dirty = false;
    try { dirty = typeof e.opts.isDirty === 'function' && !!e.opts.isDirty(); } catch (err) { dirty = false; }
    if (dirty) showConfirm(e); else dlg.close(overlay);
  };

  dlg.isOpen = function (overlay) { return !!entryOf(overlay); };
  dlg.depth = function () { return stack.length; };

  function showConfirm(e) {
    const box = boxOf(e.overlay);
    const doc = e.overlay.ownerDocument;
    let note = box.querySelector('.dlg-note');
    if (!note) {
      note = doc.createElement('div'); note.className = 'dlg-note';
      const bar = box.querySelector('.dlg-bar');
      if (bar && bar.nextSibling) box.insertBefore(note, bar.nextSibling); else box.appendChild(note);
    }
    const cf = doc.createElement('div');
    cf.className = 'dlg-cf'; cf.setAttribute('role', 'group');
    const p = doc.createElement('p'); p.textContent = e.opts.dirtyText || dlg.DIRTY_TEXT;
    p.id = (e.overlay.id || 'dlg') + '-cf-t'; cf.setAttribute('aria-labelledby', p.id);
    const row = doc.createElement('div'); row.className = 'dlg-cf-row';
    const drop = doc.createElement('button'); drop.type = 'button'; drop.className = 'dlg-danger'; drop.textContent = '버리고 닫기';
    const keep = doc.createElement('button'); keep.type = 'button'; keep.className = 'dlg-go'; keep.textContent = '계속 작성';
    drop.addEventListener('click', function () { dlg.close(e.overlay); });
    keep.addEventListener('click', function () { hideConfirm(e, true); });
    row.appendChild(drop); row.appendChild(keep); cf.appendChild(p); cf.appendChild(row);
    note.insertBefore(cf, note.firstChild);
    // 확인 상자가 열린 동안 머리·발 단추는 막는다(규격 7-7).
    e.locked = Array.prototype.filter.call(box.querySelectorAll('.dlg-acts button, .dlg-foot button'), function (b) {
      if (b.disabled) return false; b.disabled = true; return true;
    });
    e.cf = cf;
    keep.focus();
  }

  function hideConfirm(e, refocus) {
    if (!e.cf) return;
    e.cf.remove(); e.cf = null;
    (e.locked || []).forEach(function (b) { b.disabled = false; });
    e.locked = null;
    if (refocus) {
      const box = boxOf(e.overlay);
      const t = box.querySelector('.dlg-body ' + FOCUSABLE.split(',')[2].trim()) || focusables(box)[0];
      if (t && t.focus) t.focus();
    }
  }

  let wired = false;
  function wireOnce(doc) {
    if (wired) return; wired = true;
    doc.addEventListener('keydown', function (ev) {
      const e = top();
      if (!e) return;
      if (ev.key === 'Escape') {
        ev.preventDefault(); ev.stopPropagation();
        if (e.cf) hideConfirm(e, true); else dlg.requestClose(e.overlay);
        return;
      }
      if (ev.key === 'Tab') {   // 포커스는 맨 위 창 안에서만 돈다
        const list = focusables(boxOf(e.overlay));
        if (!list.length) { ev.preventDefault(); return; }
        const first = list[0], last = list[list.length - 1];
        const a = doc.activeElement;
        if (ev.shiftKey && (a === first || !boxOf(e.overlay).contains(a))) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && (a === last || !boxOf(e.overlay).contains(a))) { ev.preventDefault(); first.focus(); }
      }
    }, true);
    doc.addEventListener('click', function (ev) {
      const e = top();
      if (e && ev.target === e.overlay) dlg.requestClose(e.overlay);   // 바깥(덮개) 클릭
    });
  }

  // ── 칸 경고 ─────────────────────────────────────────────────────────
  // 빠진 칸·잘못된 칸에 빨간 테두리 + 칸 바로 아래 한 줄. opts.focus면 그 칸으로 커서를 옮긴다.
  dlg.invalid = function (field, msg, opts) {
    if (!field) return;
    const o = opts || {};
    const doc = field.ownerDocument;
    const id = (field.id || ('dlg-f' + Math.random().toString(36).slice(2, 8))) + '-ferr';
    let p = doc.getElementById(id);
    if (!p) {
      p = doc.createElement('p'); p.className = 'dlg-ferr'; p.id = id;
      field.insertAdjacentElement('afterend', p);
    }
    p.textContent = msg || '';
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', dlg.mergeDescribedBy(field.getAttribute('aria-describedby'), id));
    if (!field.dataset.dlgClear) {
      field.dataset.dlgClear = '1';
      const clear = function () { dlg.clearInvalid(field); };
      field.addEventListener('input', clear); field.addEventListener('change', clear);
    }
    if (o.focus && field.focus) {
      field.focus();
      if (field.scrollIntoView) field.scrollIntoView({ block: 'nearest' });
    }
  };

  dlg.clearInvalid = function (field) {
    if (!field || field.getAttribute('aria-invalid') !== 'true') return;
    const doc = field.ownerDocument;
    const id = (field.id || '') + '-ferr';
    const p = field.id ? doc.getElementById(id) : (field.nextElementSibling && field.nextElementSibling.classList.contains('dlg-ferr') ? field.nextElementSibling : null);
    field.removeAttribute('aria-invalid');
    if (p) {
      const left = dlg.removeDescribedBy(field.getAttribute('aria-describedby'), p.id);
      if (left) field.setAttribute('aria-describedby', left); else field.removeAttribute('aria-describedby');
      p.remove();
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = dlg;
  else root.dlg = dlg;
})(typeof self !== 'undefined' ? self : this);
