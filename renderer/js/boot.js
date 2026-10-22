'use strict';
/* 启动引导：错误上报 + 正常初始化 / 冒烟测试驱动 */
window.addEventListener('error', function (e) { console.error('[window.onerror] ' + e.message); });

if (new URLSearchParams(location.search).get('smoke')) {
  /* 冒烟测试驱动：自动走一遍主要页面与操作 */
  setTimeout(async function () {
    try {
      await App.init();
      console.log('[smoke] init ok, books=' + App.books.length);
      let b = App.books.find(function (x) { return x.name === '冒烟测试'; });
      if (!b) b = await momo.createBook({ name: '冒烟测试' });
      const imported = await momo.importText({ bookId: b.id, text: 'apple = 苹果\nbus = 公交\ncat = 猫\n' });
      console.log('[smoke] import ' + JSON.stringify(imported));
      await App.setBook(b.id);
      const q = await momo.learnQueue({ bookId: b.id, opts: { sources: { new: true, review: true } } });
      console.log('[smoke] queue=' + q.queue.length);
      const ids = q.queue.map(function (x) { return x.id; });
      const tours = [
        ['book', { bookId: b.id }], ['learn', {}],
        ['tools', { bookId: b.id, ids: ids, tool: 'card' }],
        ['tools', { bookId: b.id, ids: ids, tool: 'list' }],
        ['tools', { bookId: b.id, ids: ids, tool: 'choice' }],
        ['tools', { bookId: b.id, ids: ids, tool: 'spell' }],
        ['tools', { bookId: b.id, ids: ids, tool: 'seq' }],
        ['forecast', {}], ['stats', {}], ['widgets', {}], ['known', {}], ['settings', {}]
      ];
      for (let i = 0; i < tours.length; i++) {
        App.go(tours[i][0], tours[i][1]);
        await App.sleep(450);
      }
      const bd = await momo.bookData(b.id);
      const rr = await momo.rate({ bookId: b.id, wordId: bd.words[0].id, rating: 3 });
      console.log('[smoke] rate ok=' + rr.ok + ' next=' + rr.intervalText);
      /* 桌面插件的开关与视觉自检由主进程 WIDGET-TEST 负责，避免两路竞态 */
      console.log('SMOKE-OK');
    } catch (e) {
      console.error('[smoke-fail] ' + (e && e.message));
    }
  }, 1200);
} else {
  App.init();
}
