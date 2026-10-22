'use strict';
/* 断言式微测试框架 */
const tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }
function assert(cond, msg) { if (!cond) throw new Error('断言失败: ' + (msg || '')); }
function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error('断言失败: ' + (msg || '') + ' 期望≈' + b + ' 实际=' + a);
}

process.on('uncaughtException', function (e) { console.error('[未捕获异常]', e); process.exit(1); });

function run() {
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { t.fn(); pass++; console.log('  ✓ ' + t.name); }
    catch (e) { fail++; console.error('  ✗ ' + t.name + '\n    ' + (e && e.message)); }
  }
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}
/* 先导出，避免测试文件循环 require 时拿到未初始化的 exports */
module.exports = { test: test, assert: assert, near: near, run: run };

/* 直接执行时：自动加载同目录所有 *.test.js 并运行 */
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  fs.readdirSync(__dirname).forEach(function (f) {
    if (/\.test\.js$/.test(f)) require(path.join(__dirname, f));
  });
  run();
}
