/* content.js — 作品渲染引擎
   数据源：content.json（由 admin.html 通过 GitHub API 维护）
   页面用法（旧的手写作品卡片已由这些容器取代）：
     音乐：  <div class="work-grid" data-portfolio="music" data-filter="featured|all"></div>
     视频：  <div class="work-grid" data-portfolio="videos" data-group="interactive|sound" data-filter="featured|all"></div>
     随笔：  <div class="notes-container" data-portfolio="notes" data-filter="featured"></div>   ← 首页卡片
             <div class="work-grid"     data-portfolio="notes" data-filter="all"></div>          ← 列表卡片
   依赖：index/music 页需引入 APlayer + Meting（原有的 head 引入不受影响） */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bilibiliSrc(v) {
    return 'https://player.bilibili.com/player.html?isOutside=true&p=1' +
      '&aid=' + encodeURIComponent(v.aid) +
      '&bvid=' + encodeURIComponent(v.bvid) +
      '&cid=' + encodeURIComponent(v.cid);
  }

  /* ---------- 卡片模板（与原手写 HTML 逐字对齐） ---------- */

  function musicCard(m) {
    return '<div class="work-item">' +
      '<div class="work-info">' +
      '<h3>' + esc(m.title) + '</h3>' +
      '<p>' + esc(m.year) + '</p>' +
      '<div class="music-player-container">' +
      '<meting-js server="netease" type="song" id="' + esc(m.id) + '" theme="#333333" autoplay="false"></meting-js>' +
      '</div>' +
      '</div>' +
      '<div class="work-description">' + esc(m.desc) + '</div>' +
      '</div>';
  }

  function videoCard(v) {
    return '<div class="work-item full-width">' +
      '<div class="media-container">' +
      '<iframe src="' + esc(bilibiliSrc(v)) + '" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width: 100%; height: 100%; border: none;"></iframe>' +
      '</div>' +
      '<div class="work-info">' +
      '<h3>' + esc(v.title) + '</h3>' +
      '<p>' + esc(v.category) + '</p>' +
      '<p class="work-description">' + esc(v.desc) + '</p>' +
      '</div>' +
      '</div>';
  }

  /* 首页随笔卡片（.notes-container 内） */
  function noteCardHome(n) {
    return '<article class="note-item">' +
      '<span class="note-date">' + esc(n.date) + '</span>' +
      '<h3>' + esc(n.title) + '</h3>' +
      '<p>' + esc(n.desc_home || n.desc) + '</p>' +
      '<a href="article.html?slug=' + encodeURIComponent(n.slug) + '" class="read-more">阅读全文 </a>' +
      '</article>';
  }

  /* 分类页随笔卡片（.work-grid 内，对应 notes.html 原有标记） */
  function noteCardList(n) {
    return '<div class="work-item">' +
      '<div class="work-info">' +
      '<h3 class="serif">' + esc(n.title) + '</h3>' +
      '<p class="note-date">' + esc(n.date) + '</p>' +
      '</div>' +
      '<div class="work-description">' + esc(n.desc) + '</div>' +
      '<a href="article.html?slug=' + encodeURIComponent(n.slug) + '" class="read-more" style="display: inline-block; margin-top: 10px; color: var(--accent-color); text-decoration: underline;">阅读全文</a>' +
      '</div>';
  }

  /* ---------- 数据加载 ---------- */

  var _cache = null;
  function load() {
    if (_cache) return _cache;
    _cache = fetch('content.json?t=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('content.json HTTP ' + r.status);
        return r.json();
      });
    return _cache;
  }

  function render() {
    var boxes = document.querySelectorAll('[data-portfolio]');
    if (!boxes.length) return;
    load().then(function (data) {
      Array.prototype.forEach.call(boxes, function (box) {
        var kind = box.getAttribute('data-portfolio');
        var filter = box.getAttribute('data-filter');
        var group = box.getAttribute('data-group');
        var items = [];

        if (kind === 'music') {
          items = data.music || [];
          if (filter === 'featured') items = items.filter(function (m) { return m.featured; });
          box.innerHTML = items.map(musicCard).join('');
        } else if (kind === 'videos') {
          items = data.videos || [];
          if (group) items = items.filter(function (v) { return v.group === group; });
          if (filter === 'featured') items = items.filter(function (v) { return v.featured; });
          box.innerHTML = items.map(videoCard).join('');
        } else if (kind === 'notes') {
          items = data.notes || [];
          if (filter === 'featured') {
            items = items.filter(function (n) { return n.featured; });
            box.innerHTML = items.map(noteCardHome).join('');
          } else {
            box.innerHTML = items.map(noteCardList).join('');
          }
        }
      });
    }).catch(function (err) {
      console.error('[portfolio] 数据加载失败：', err);
    });
  }

  /* 导出给 article.html 使用 */
  window.Portfolio = { load: load, esc: esc, bilibiliSrc: bilibiliSrc };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
