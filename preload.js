'use strict';
/* 预加载：向渲染进程暴露安全的 API 桥 */
const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).then(function (r) {
    if (r && r.ok === false) throw new Error(r.error || '操作失败');
    return r ? r.data : undefined;
  });
}
function on(channel, cb) {
  ipcRenderer.on(channel, function (e, payload) { cb(payload); });
}

contextBridge.exposeInMainWorld('momo', {
  /* 设置 */
  getSettings: function () { return invoke('settings:get'); },
  setSettings: function (patch) { return invoke('settings:set', patch); },

  /* 词库 */
  listBooks: function () { return invoke('books:list'); },
  createBook: function (o) { return invoke('books:create', o); },
  deleteBook: function (id) { return invoke('books:delete', id); },
  updateBook: function (o) { return invoke('books:update', o); },
  bookData: function (id) { return invoke('book:data', id); },

  /* 导入 */
  importText: function (o) { return invoke('import:text', o); },
  importFile: function (o) { return invoke('import:file', o); },
  pickImportFiles: function () { return invoke('import:pick'); },

  /* 词条 */
  addOneWord: function (o) { return invoke('words:addOne', o); },
  updateWord: function (o) { return invoke('words:update', o); },
  deleteWords: function (o) { return invoke('words:delete', o); },
  setFlags: function (o) { return invoke('words:flags', o); },
  touchShown: function (o) { return invoke('words:touch', o); },
  wordDetail: function (o) { return invoke('word:detail', o); },

  /* 学习 */
  learnQueue: function (o) { return invoke('learn:queue', o); },
  rate: function (o) { return invoke('learn:rate', o); },

  /* 全局熟词 */
  listKnown: function () { return invoke('known:list'); },
  setKnown: function (o) { return invoke('known:set', o); },

  /* 预览统计 */
  forecast: function (o) { return invoke('forecast', o); },
  forecastDetail: function (o) { return invoke('forecast:detail', o); },
  stats: function () { return invoke('stats'); },

  /* 顺序模式 */
  getSeq: function (bookId) { return invoke('seq:get', bookId); },
  setSeq: function (o) { return invoke('seq:set', o); },

  /* 贴纸 */
  listStickers: function () { return invoke('stickers:list'); },
  createSticker: function (s) { return invoke('stickers:create', s); },
  updateSticker: function (o) { return invoke('stickers:update', o); },
  deleteSticker: function (id) { return invoke('stickers:delete', id); },

  /* 插件 */
  widgetWords: function (o) { return invoke('widget:words', o); },
  widgetState: function () { return invoke('widget:state'); },
  toggleCarousel: function (on) { return invoke('widget:carousel', on); },
  toggleChoice: function (on) { return invoke('widget:choice', on); },
  resizeWidget: function (o) { return invoke('widget:resize', o); },
  setKbMode: function (on) { return invoke('choice:kbmode', on); },

  /* 备份与系统 */
  exportBackup: function () { return invoke('backup:export'); },
  importBackup: function () { return invoke('backup:import'); },
  openDataDir: function () { return invoke('app:dataDir'); },
  appInfo: function () { return invoke('app:info'); },
  quitApp: function () { return invoke('app:quit'); },
  winMin: function () { return invoke('window:min'); },
  confirmDialog: function (o) { return invoke('confirm', o); },

  /* 事件 */
  onSettings: function (cb) { on('settings:changed', cb); },
  onDataChanged: function (cb) { on('data:changed', cb); },
  onStickers: function (cb) { on('stickers:changed', cb); },
  onWidgetState: function (cb) { on('widgets:state', cb); },
  onKbAnswer: function (cb) { on('kb:answer', cb); },
  onImportRequest: function (cb) { on('import:request', cb); }
});
