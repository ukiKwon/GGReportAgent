const test = require('node:test');
const assert = require('node:assert');
const exporter = require('../js/export.js');

test('serializeInstitutions: window 전역 래핑 + 파싱 가능 JSON', () => {
  const s = exporter.serializeInstitutions([{ name:'A', type:'공기업', region:'11', confidence:'추정', sources:['u'] }]);
  assert.ok(s.startsWith('window.institutions = '));
  assert.ok(s.trim().endsWith(';'));
  const json = s.replace('window.institutions = ', '').replace(/;\s*$/, '');
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed[0].name, 'A');
});
