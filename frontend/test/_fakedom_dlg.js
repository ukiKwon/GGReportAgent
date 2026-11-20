'use strict';
// dlg.test.js 전용 아주 작은 가짜 DOM(jsdom 없음). dlg.js가 쓰는 만큼만 흉내 낸다:
// 클래스·태그·[속성]·:not([속성])·자손 선택자, focus/activeElement, inert, 이벤트 등록.

function makeDoc() {
  const listeners = {};
  const byId = {};
  const doc = {
    activeElement: null,
    addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
    getElementById: function (id) { return byId[id] || null; },
    createElement: function (t) { return El(t); },
    fire: function (t, ev) { (listeners[t] || []).forEach(function (f) { f(ev); }); }
  };
  function El(tag, attrs, kids) {
    const e = {
      tagName: tag.toUpperCase(), attrs: Object.assign({}, attrs || {}), children: [], parentNode: null,
      ownerDocument: doc, style: {}, dataset: {}, disabled: false, hidden: false, inert: false,
      offsetParent: {}, textContent: '', listeners: {}, isConnected: true,
      get id() { return this.attrs.id || ''; },
      set id(v) { this.attrs.id = v; byId[v] = this; },
      get className() { return this.attrs.class || ''; },
      set className(v) { this.attrs.class = v; },
      get type() { return this.attrs.type || ''; },
      set type(v) { this.attrs.type = v; },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      setAttribute: function (k, v) { this.attrs[k] = String(v); if (k === 'id') byId[v] = this; },
      removeAttribute: function (k) { delete this.attrs[k]; },
      appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
      insertBefore: function (c, ref) {
        c.parentNode = this;
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        return c;
      },
      get firstChild() { return this.children[0] || null; },
      get nextSibling() { const p = this.parentNode; return p ? (p.children[p.children.indexOf(this) + 1] || null) : null; },
      get nextElementSibling() { return this.nextSibling; },
      insertAdjacentElement: function (pos, c) {
        const p = this.parentNode; c.parentNode = p;
        p.children.splice(p.children.indexOf(this) + 1, 0, c);
        if (c.id) byId[c.id] = c;
        return c;
      },
      remove: function () {
        const p = this.parentNode;
        if (p) p.children.splice(p.children.indexOf(this), 1);
        this.parentNode = null;
        if (this.id && byId[this.id] === this) delete byId[this.id];
      },
      contains: function (n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; },
      addEventListener: function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      focus: function () { doc.activeElement = this; },
      click: function () { const self = this; (this.listeners.click || []).forEach(function (f) { f({ target: self }); }); },
      querySelector: function (s) { return this.querySelectorAll(s)[0] || null; },
      querySelectorAll: function (s) {
        const out = []; const self = this;
        walk(this, function (n) { if (s.split(',').some(function (p) { return matches(n, p.trim(), self); })) out.push(n); });
        return out;
      }
    };
    e.classList = { contains: function (c) { return (e.attrs.class || '').split(/\s+/).indexOf(c) >= 0; } };
    if (e.attrs.id) byId[e.attrs.id] = e;
    (kids || []).forEach(function (k) { e.appendChild(k); });
    return e;
  }
  function walk(n, f) { n.children.forEach(function (c) { f(c); walk(c, f); }); }
  function simple(n, s) {
    const nots = [];
    s = s.replace(/:not\(([^)]*)\)/g, function (_, x) { nots.push(x); return ''; });
    const m = s.match(/^([a-z]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i);
    if (!m) return false;
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && !m[2].split('.').filter(Boolean).every(function (c) { return n.classList.contains(c); })) return false;
    const attrOk = function (a) {
      const am = a.match(/^([\w-]+)(?:="([^"]*)")?$/);
      if (am[1] === 'disabled') return am[2] === undefined ? n.disabled : false;
      const v = n.getAttribute(am[1]);
      return am[2] === undefined ? v !== null : v === am[2];
    };
    if (m[3] && !(m[3].match(/\[[^\]]+\]/g) || []).every(function (a) { return attrOk(a.slice(1, -1)); })) return false;
    return nots.every(function (x) { return !simple(n, x); });
  }
  function matches(n, sel, scope) {
    const parts = sel.split(/\s+/);
    if (!simple(n, parts[parts.length - 1])) return false;
    let i = parts.length - 2;
    for (let x = n.parentNode; i >= 0 && x && x !== scope.parentNode; x = x.parentNode) if (simple(x, parts[i])) i -= 1;
    return i < 0;
  }
  doc.El = El;
  doc.body = El('body');
  return doc;
}

function makeDialog(doc, id, withField) {
  const E = doc.El;
  const title = E('h2', { class: 'dlg-t', tabindex: '-1', id: id + '-t' });
  const cancel = E('button'); const save = E('button', { class: 'dlg-go' });
  const field = E('input', { id: id + '-name' });
  const box = E('div', { class: 'dlg' }, [
    E('header', { class: 'dlg-bar' }, [title, E('div', { class: 'dlg-acts' }, [cancel, save])]),
    E('div', { class: 'dlg-body' }, withField ? [field] : [])]);
  const ov = E('div', { class: 'modal-overlay', id: id }, [box]);
  ov.style.display = 'none';
  doc.body.appendChild(ov);
  return { ov: ov, title: title, save: save, cancel: cancel, field: field };
}

function key(doc, k, extra) {
  const ev = Object.assign({
    key: k, shiftKey: false, prevented: false, stopped: false,
    preventDefault: function () { this.prevented = true; }, stopPropagation: function () { this.stopped = true; }
  }, extra || {});
  doc.fire('keydown', ev);
  return ev;
}

// 문서마다 dlg 모듈을 새로 읽는다(document 리스너를 한 번만 다는 구조라).
exports.register = function (test, assert, freshDlg) {
  test('쌓기: 늦게 연 창이 위(z 30·31), Esc 한 번에 맨 위 창만 닫히고 커서는 연 자리로', function () {
    const D = freshDlg(); const doc = makeDoc();
    const shell = doc.El('main'); doc.body.appendChild(shell);
    const opener = doc.El('button'); shell.appendChild(opener); opener.focus();
    const a = makeDialog(doc, 'a'); const b = makeDialog(doc, 'b');
    D.open(a.ov);
    assert.strictEqual(a.ov.style.zIndex, '30'); assert.strictEqual(doc.activeElement, a.title);
    assert.strictEqual(shell.inert, true);
    D.open(b.ov);
    assert.strictEqual(b.ov.style.zIndex, '31'); assert.strictEqual(D.depth(), 2); assert.strictEqual(a.ov.inert, true);
    key(doc, 'Escape');
    assert.strictEqual(b.ov.style.display, 'none'); assert.strictEqual(D.depth(), 1);
    assert.strictEqual(a.ov.style.display, ''); assert.strictEqual(a.ov.inert, false);
    key(doc, 'Escape');
    assert.strictEqual(D.depth(), 0); assert.strictEqual(shell.inert, false); assert.strictEqual(doc.activeElement, opener);
  });

  test('빈 스택에서는 Esc를 건드리지 않는다(옛 팝업 Esc 처리와 충돌 없음)', function () {
    const D = freshDlg(); const doc = makeDoc(); const a = makeDialog(doc, 'a');
    D.open(a.ov); D.close(a.ov);
    const ev = key(doc, 'Escape');
    assert.strictEqual(ev.prevented, false); assert.strictEqual(ev.stopped, false);
  });

  test('미리 inert였던 노드는 닫은 뒤에도 inert 그대로', function () {
    const D = freshDlg(); const doc = makeDoc();
    const pre = doc.El('aside'); pre.inert = true; doc.body.appendChild(pre);
    const a = makeDialog(doc, 'a');
    D.open(a.ov); D.close(a.ov);
    assert.strictEqual(pre.inert, true);
  });

  test('한글 조합 중 Esc는 창을 닫지 않는다', function () {
    const D = freshDlg(); const doc = makeDoc(); const a = makeDialog(doc, 'a');
    D.open(a.ov); key(doc, 'Escape', { isComposing: true });
    assert.strictEqual(D.depth(), 1);
  });

  test('바깥 클릭: 누른 곳·뗀 곳이 모두 덮개일 때만 닫힘(글을 끌어 선택하다 놓으면 유지)', function () {
    const D = freshDlg(); const doc = makeDoc(); const a = makeDialog(doc, 'a');
    D.open(a.ov);
    doc.fire('mousedown', { target: a.title }); doc.fire('click', { target: a.ov });
    assert.strictEqual(D.depth(), 1);
    const other = doc.El('div'); doc.body.appendChild(other);
    doc.fire('mousedown', { target: other }); doc.fire('click', { target: other });
    assert.strictEqual(D.depth(), 1);
    doc.fire('mousedown', { target: a.ov }); doc.fire('click', { target: a.ov });
    assert.strictEqual(D.depth(), 0);
  });

  test('저장 안 한 내용: 확인 상자 하나·머리 단추 잠금, Esc는 상자만 접고 커서는 쓰던 칸, [버리고 닫기]는 onClose 1회', function () {
    const D = freshDlg(); const doc = makeDoc(); const a = makeDialog(doc, 'a', true);
    let closed = 0;
    D.open(a.ov, { isDirty: function () { return true; }, onClose: function () { closed += 1; } });
    a.field.focus();
    D.requestClose(a.ov); D.requestClose(a.ov);
    assert.strictEqual(a.ov.querySelectorAll('.dlg-cf').length, 1);
    assert.strictEqual(a.save.disabled, true); assert.strictEqual(a.cancel.disabled, true);
    key(doc, 'Escape');
    assert.strictEqual(a.ov.querySelectorAll('.dlg-cf').length, 0);
    assert.strictEqual(a.save.disabled, false); assert.strictEqual(doc.activeElement, a.field);
    assert.strictEqual(D.depth(), 1);
    D.requestClose(a.ov);
    a.ov.querySelector('.dlg-danger').click();
    assert.strictEqual(D.depth(), 0); assert.strictEqual(closed, 1);
  });

  test('확인 상자가 떠 있는 동안 저장 응답이 와도 단추는 잠긴 채, 접으면 응답 상태로(setDisabled, qa 2단계 P2-1)', function () {
    const D = freshDlg(); const doc = makeDoc(); const a = makeDialog(doc, 'a', true);
    D.open(a.ov, { isDirty: function () { return true; } });
    D.setDisabled(a.save, true);              // 저장 중
    D.requestClose(a.ov);                     // Esc → 확인 상자
    D.setDisabled(a.save, false);             // 응답 도착
    assert.strictEqual(a.save.disabled, true);
    D.invalid(a.field, '기관명을 적으세요.', { focus: true });   // 409 칸 경고 — [계속 작성]에서 커서를 뺏지 않는다
    assert.strictEqual(doc.activeElement.textContent, '계속 작성');
    key(doc, 'Escape');                       // 상자 접기
    assert.strictEqual(a.save.disabled, false);
    assert.strictEqual(a.cancel.disabled, false);
  });

  test('isDirty·onClose가 예외를 던져도 닫히고 inert가 풀린다', function () {
    const D = freshDlg(); const doc = makeDoc();
    const shell = doc.El('main'); doc.body.appendChild(shell);
    const a = makeDialog(doc, 'a');
    D.open(a.ov, { isDirty: function () { throw new Error('x'); }, onClose: function () { throw new Error('y'); } });
    D.requestClose(a.ov);
    assert.strictEqual(D.depth(), 0); assert.strictEqual(shell.inert, false);
  });

  test('closeAll: 확인 없이 위에서부터 모두 닫는다(로그아웃)', function () {
    const D = freshDlg(); const doc = makeDoc(); const a = makeDialog(doc, 'a'); const b = makeDialog(doc, 'b');
    D.open(a.ov, { isDirty: function () { return true; } }); D.open(b.ov);
    D.closeAll();
    assert.strictEqual(D.depth(), 0); assert.strictEqual(a.ov.style.display, 'none');
  });

  test('칸 경고: 두 번 불러도 줄 하나, 지우면 기존 describedby만 남는다(id 있는 칸·없는 칸)', function () {
    const D = freshDlg(); const doc = makeDoc(); const a = makeDialog(doc, 'a', true);
    a.field.setAttribute('aria-describedby', 'h1');
    D.invalid(a.field, '기관명을 적으세요.'); D.invalid(a.field, '기관명을 적으세요.');
    assert.strictEqual(a.ov.querySelectorAll('.dlg-ferr').length, 1);
    assert.strictEqual(a.field.getAttribute('aria-describedby'), 'h1 a-name-ferr');
    assert.strictEqual(a.field.getAttribute('aria-invalid'), 'true');
    D.clearInvalid(a.field);
    assert.strictEqual(a.ov.querySelectorAll('.dlg-ferr').length, 0);
    assert.strictEqual(a.field.getAttribute('aria-describedby'), 'h1');
    const bare = doc.El('input'); a.ov.querySelector('.dlg-body').appendChild(bare);
    D.invalid(bare, 'a'); D.invalid(bare, 'b');
    assert.strictEqual(a.ov.querySelectorAll('.dlg-ferr').length, 1);
    D.clearInvalid(bare);
    assert.strictEqual(a.ov.querySelectorAll('.dlg-ferr').length, 0);
    assert.strictEqual(bare.getAttribute('aria-describedby'), null);
  });
};
