/* admin.js — 管理后台逻辑（仅 admin.html 使用）
   安全模型：管理密码只挡门（哈希写死在此文件）；真正的写权限来自
   保存在你自己浏览器 localStorage 里的 GitHub PAT —— 访客的浏览器里没有钥匙，
   所以访客只能看，不能传。令牌仅授予该仓库的 Contents 写权限，随时可吊销。 */
(function () {
  'use strict';

  var OWNER = 'j849448285';
  var REPO_DEFAULT = 'portfolio';
  var BRANCH_DEFAULT = 'main';
  var ADMIN_PASS_SHA256 = '9d44084c7cb99ae42dc09b541ea40dc177a286378830bcf482d0d01e680710db';
  var LS = { ok: 'jzh_admin_ok', token: 'jzh_gh_token', repo: 'jzh_gh_repo', branch: 'jzh_gh_branch' };

  /* 全站数据缓存（编辑/删除时在此对象上改，发布时整体写回） */
  var data = { music: [], videos: [], notes: [] };
  /* 当前编辑状态：{ type:'music'|'video'|'note', index: n } ；null = 新增 */
  var editing = null;

  function $(id) { return document.getElementById(id); }
  function val(id) { return $(id).value.trim(); }

  async function sha256hex(s) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function status(el, kind, msg) {
    el.className = 'status ' + kind;
    el.innerHTML = msg;
  }
  function globalStatus(kind, msg) { status($('global-status'), kind, msg); }
  function clearGlobal() { $('global-status').className = 'status'; $('global-status').innerHTML = ''; }

  /* ---------------- GitHub API ---------------- */

  function repoFull() { return OWNER + '/' + (localStorage.getItem(LS.repo) || REPO_DEFAULT); }
  function branch() { return localStorage.getItem(LS.branch) || BRANCH_DEFAULT; }
  function hasToken() { return !!localStorage.getItem(LS.token); }

  async function gh(path, opts) {
    var headers = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + localStorage.getItem(LS.token) };
    if (opts && opts.body) headers['Content-Type'] = 'application/json';
    var res = await fetch('https://api.github.com/repos/' + repoFull() + path, {
      method: (opts && opts.method) || 'GET',
      headers: headers,
      body: opts && opts.body ? opts.body : undefined
    });
    return res;
  }

  function b64FromUTF8(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    var CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }
  function utf8FromB64(b64) {
    var bin = atob(b64.replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function fetchOnline() {
    var res = await gh('/contents/content.json?ref=' + encodeURIComponent(branch()));
    if (res.status === 404) return { data: { music: [], videos: [], notes: [] }, sha: null };
    if (!res.ok) throw new Error('读取线上数据失败：HTTP ' + res.status + '（令牌无效/过期或无权限时常见）');
    var j = await res.json();
    return { data: JSON.parse(utf8FromB64(j.content)), sha: j.sha };
  }

  async function publish(message) {
    var cur = await fetchOnline();          // 每次发布前取最新 sha，避免覆盖他人改动
    var body = {
      message: message,
      content: b64FromUTF8(JSON.stringify(data, null, 2) + '\n'),
      branch: branch()
    };
    if (cur.sha) body.sha = cur.sha;
    var res = await gh('/contents/content.json', { method: 'PUT', body: JSON.stringify(body) });
    if (!res.ok) {
      var t = await res.text();
      throw new Error('发布失败：HTTP ' + res.status + ' ' + t.slice(0, 240));
    }
  }

  /* ---------------- 解析器 ---------------- */

  function extractNetease(input) {
    var s = String(input).trim();
    var m = s.match(/music\.163\.com\S*?[?&]id=(\d+)/) || s.match(/^(\d{5,15})$/);
    return m ? m[1] : null;
  }

  async function fetchNeteaseMeta(id) {
    try {
      var r = await fetch('https://api.i-meto.com/meting/api?server=netease&type=track&id=' + encodeURIComponent(id));
      if (!r.ok) return null;
      var j = await r.json();
      if (Array.isArray(j) && j[0] && j[0].name) return { title: j[0].name, artist: j[0].artist || '' };
    } catch (e) { /* 网络或 CORS 失败则静默 */ }
    return null;
  }

  function parseBiliInput(input) {
    var s = String(input).trim();
    var out = {};
    var mAid = s.match(/aid=(\d+)/);
    var mBv = s.match(/bvid=(BV[0-9A-Za-z]+)/);
    var mCid = s.match(/cid=(\d+)/);
    if (mAid && mBv && mCid) return { aid: mAid[1], bvid: mBv[1], cid: mCid[1] };
    var bv = s.match(/BV[0-9A-Za-z]{10}/);
    if (bv) return { bvid: bv[0] };
    return null;
  }

  async function fetchBiliMeta(bvid) {
    try {
      var r = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + encodeURIComponent(bvid));
      if (!r.ok) return null;
      var j = await r.json();
      if (j && j.data) return {
        aid: j.data.aid, cid: j.data.cid,
        title: j.data.title || '', desc: (j.data.desc || '').slice(0, 500)
      };
    } catch (e) { /* CORS 或网络失败则静默 */ }
    return null;
  }

  function todayCN() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate());
  }
  function todayCompact() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function slugify(title, fallback) {
    var t = String(title).toLowerCase().trim()
      .replace(/[·""''（）()\[\]{}、，。！？?!:：;；'"\/\\\s]+/g, '-')
      .replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (/^[a-z0-9-]{1,60}$/.test(t) && /[a-z0-9]/.test(t)) return t;
    return fallback;
  }

  function uniqueSlug(base) {
    var s = base, i = 2;
    var taken = data.notes.map(function (n) { return n.slug; });
    while (taken.indexOf(s) !== -1 && !(editing && editing.type === 'note' && data.notes[editing.index] && data.notes[editing.index].slug === s)) {
      s = base + '-' + i; i++;
    }
    return s;
  }

  /* ---------------- 音乐表单 ---------------- */

  var musicId = '';

  $('music-parse').addEventListener('click', async function () {
    clearGlobal();
    var id = extractNetease(val('music-url'));
    if (!id) { globalStatus('err', '没有认出网易云歌曲 ID —— 请粘贴包含 song?id=数字 的链接，或直接输入纯数字 ID。'); return; }
    musicId = id;
    $('music-preview').innerHTML =
      '<meting-js server="netease" type="song" id="' + id + '" theme="#333333" autoplay="false"></meting-js>';
    var meta = await fetchNeteaseMeta(id);
    if (meta && meta.title && !val('music-title')) {
      $('music-title').value = meta.title + (meta.artist ? ' - ' + meta.artist : '');
    }
    if (!val('music-year')) $('music-year').value = todayCN().slice(0, -3);
    globalStatus('info', '已解析歌曲 ID：<strong>' + id + '</strong>，播放器预览已生成。' + (meta ? '（自动抓取歌名：' + meta.title + '）' : '（歌名未自动抓到，请手动填写标题）'));
  });

  $('music-publish').addEventListener('click', async function () {
    clearGlobal();
    if (!musicId) { globalStatus('err', '请先粘贴网易云链接并点「解析」。'); return; }
    if (!val('music-title')) { globalStatus('err', '标题不能为空。'); return; }
    var item = {
      id: musicId,
      title: val('music-title'),
      year: val('music-year') || todayCN().slice(0, -3),
      desc: val('music-desc'),
      featured: $('music-featured').checked
    };
    try {
      $('music-publish').disabled = true;
      globalStatus('info', '正在发布…');
      var online = await fetchOnline();
      data = online.data;
      if (editing && editing.type === 'music') {
        data.music[editing.index] = item;
      } else {
        data.music.unshift(item);
      }
      await publish('admin: ' + (editing ? '更新音乐' : '新增音乐') + '《' + item.title + '》');
      resetForm('music');
      globalStatus('ok', '✓ 已发布《' + item.title + '》。GitHub Pages 约 1 分钟后生效，可到 <a href="https://' + location.host + '/music.html" style="color:inherit" target="_blank">music.html</a> 查看。');
    } catch (e) {
      globalStatus('err', String(e.message || e));
    } finally {
      $('music-publish').disabled = false;
    }
  });

  /* ---------------- 视频表单 ---------------- */

  var videoIds = null; // {aid, bvid, cid}

  $('video-parse').addEventListener('click', async function () {
    clearGlobal();
    var parsed = parseBiliInput(val('video-url'));
    if (!parsed) { globalStatus('err', '没有认出 BV 号 —— 请粘贴 www.bilibili.com/video/BV… 链接，或整段分享 iframe 代码。'); return; }
    videoIds = parsed;
    var msgs = [];
    if (videoIds.aid && videoIds.cid) {
      renderVideoPreview();
      msgs.push('已解析 aid=' + videoIds.aid + ' / cid=' + videoIds.cid + '，播放器预览已生成。');
    }
    if (!videoIds.aid || !videoIds.cid) {
      var meta = await fetchBiliMeta(videoIds.bvid);
      if (meta) {
        videoIds.aid = meta.aid; videoIds.cid = meta.cid;
        if (meta.title && !val('video-title')) $('video-title').value = meta.title;
        if (meta.desc && !val('video-desc')) $('video-desc').value = meta.desc;
        renderVideoPreview();
        msgs.push('通过 BV 号自动取到 aid/cid。');
      } else {
        msgs.push('⚠️ 只拿到 BV 号，未能自动取 aid/cid —— 请到该视频「分享 → 嵌入代码」，把整段 iframe 代码粘贴进来再解析一次（内含全部三个编号）。');
      }
    }
    globalStatus('info', msgs.join(' '));
  });

  function renderVideoPreview() {
    $('video-preview').innerHTML =
      '<iframe src="https://player.bilibili.com/player.html?isOutside=true&p=1&aid=' + videoIds.aid +
      '&bvid=' + encodeURIComponent(videoIds.bvid) + '&cid=' + videoIds.cid +
      '" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" style="width:100%;height:260px;border:none;"></iframe>';
  }

  $('video-publish').addEventListener('click', async function () {
    clearGlobal();
    if (!videoIds || !videoIds.bvid) { globalStatus('err', '请先粘贴链接并点「解析」。'); return; }
    if (!videoIds.aid || !videoIds.cid) { globalStatus('err', '还缺 aid / cid：请改用「分享 → 嵌入代码」整段粘贴再解析。'); return; }
    if (!val('video-title')) { globalStatus('err', '标题不能为空。'); return; }
    var item = {
      bvid: videoIds.bvid,
      aid: videoIds.aid,
      cid: videoIds.cid,
      title: val('video-title'),
      category: val('video-category') || todayCN().slice(0, -3),
      desc: val('video-desc'),
      group: $('video-group').value,
      featured: $('video-featured').checked
    };
    try {
      $('video-publish').disabled = true;
      globalStatus('info', '正在发布…');
      var online = await fetchOnline();
      data = online.data;
      if (editing && editing.type === 'video') {
        data.videos[editing.index] = item;
      } else {
        data.videos.unshift(item);
      }
      await publish('admin: ' + (editing ? '更新视频' : '新增视频') + '《' + item.title + '》');
      resetForm('video');
      globalStatus('ok', '✓ 已发布《' + item.title + '》。GitHub Pages 约 1 分钟后生效。');
    } catch (e) {
      globalStatus('err', String(e.message || e));
    } finally {
      $('video-publish').disabled = false;
    }
  });

  /* ---------------- 随笔表单 ---------------- */

  $('note-title').addEventListener('input', function () {
    if (!editing || editing.type !== 'note') {
      $('note-slug').value = slugify(val('note-title'), uniqueSlug('note-' + todayCompact()));
    }
  });
  $('note-body').addEventListener('input', function () {
    $('note-preview').innerHTML = '<div class="md-body">' + marked.parse(val('note-body') || '') + '</div>';
  });

  $('note-publish').addEventListener('click', async function () {
    clearGlobal();
    if (!val('note-title')) { globalStatus('err', '标题不能为空。'); return; }
    var slug = val('note-slug').toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) { globalStatus('err', 'slug 只能含小写字母、数字、连字符（如 math-rock）。'); return; }
    var dup = data.notes.findIndex(function (n, i) {
      return n.slug === slug && !(editing && editing.type === 'note' && editing.index === i);
    });
    if (dup !== -1) { globalStatus('err', 'slug「' + slug + '」已被另一篇随笔占用，请换一个。'); return; }
    if (!val('note-body')) { globalStatus('err', '正文不能为空。'); return; }
    var item = {
      slug: slug,
      title: val('note-title'),
      date: val('note-date') || todayCN(),
      category: val('note-category') || '随笔',
      desc: val('note-desc'),
      featured: $('note-featured').checked,
      body: marked.parse(val('note-body'))
    };
    try {
      $('note-publish').disabled = true;
      globalStatus('info', '正在发布…');
      var online = await fetchOnline();
      data = online.data;
      if (editing && editing.type === 'note') {
        data.notes[editing.index] = item;
      } else {
        data.notes.unshift(item);
      }
      await publish('admin: ' + (editing ? '更新随笔' : '新增随笔') + '《' + item.title + '》');
      resetForm('note');
      globalStatus('ok', '✓ 已发布《' + item.title + '》。文章地址：/article.html?slug=' + slug + '（约 1 分钟后生效）');
    } catch (e) {
      globalStatus('err', String(e.message || e));
    } finally {
      $('note-publish').disabled = false;
    }
  });

  /* ---------------- 管理（列表 / 编辑 / 删除） ---------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderManage() {
    var mk = function (type, arr, titleFn, metaFn) {
      return arr.map(function (item, i) {
        return '<li><span class="m-title">' + esc(titleFn(item)) +
          (item.featured ? ' <span class="m-meta">★首页</span>' : '') +
          '</span><span class="m-meta">' + esc(metaFn(item)) + '</span>' +
          '<button class="btn ghost" data-edit type="button" data-type="' + type + '" data-i="' + i + '">编辑</button>' +
          '<button class="btn danger" data-del type="button" data-type="' + type + '" data-i="' + i + '">删除</button></li>';
      }).join('') || '<li><span class="m-meta">（空）</span></li>';
    };
    $('manage-music').innerHTML = mk('music', data.music,
      function (m) { return m.title; }, function (m) { return m.year || ''; });
    $('manage-video').innerHTML = mk('video', data.videos,
      function (v) { return v.title; }, function (v) { return v.category || ''; });
    $('manage-note').innerHTML = mk('note', data.notes,
      function (n) { return n.title; }, function (n) { return n.date || ''; });
  }

  document.addEventListener('click', async function (ev) {
    var t = ev.target.closest('button');
    if (!t) return;

    if (t.hasAttribute('data-edit')) {
      var type = t.getAttribute('data-type');
      var i = parseInt(t.getAttribute('data-i'), 10);
      startEdit(type, i);
    }
    if (t.hasAttribute('data-del')) {
      var type2 = t.getAttribute('data-type');
      var i2 = parseInt(t.getAttribute('data-i'), 10);
      var arr = type2 === 'music' ? data.music : type2 === 'video' ? data.videos : data.notes;
      var item = arr[i2];
      if (!item) return;
      if (!confirm('确定删除《' + (item.title || '') + '》？此操作将直接发布到线上。')) return;
      try {
        clearGlobal();
        globalStatus('info', '正在删除并发布…');
        var online = await fetchOnline();
        data = online.data;
        var arr2 = type2 === 'music' ? data.music : type2 === 'video' ? data.videos : data.notes;
        arr2.splice(i2, 1);
        await publish('admin: 删除' + ({ music: '音乐', video: '视频', note: '随笔' }[type2]) + '《' + (item.title || '') + '》');
        renderManage();
        globalStatus('ok', '✓ 已删除并发布。约 1 分钟后生效。');
      } catch (e) {
        globalStatus('err', String(e.message || e));
      }
    }
    if (t.hasAttribute('data-cancel')) {
      resetForm(t.getAttribute('data-cancel'));
    }
  });

  function showBanner(type, on) {
    $('banner-' + type).style.display = on ? 'block' : 'none';
  }

  function startEdit(type, i) {
    var online = null;
    editing = { type: type, index: i };
    clearGlobal();
    ['music', 'video', 'note'].forEach(function (x) { showBanner(x, false); });
    showBanner(type === 'video' ? 'video' : type, true);
    switchTab(type === 'video' ? 'video' : type);
    var arr = type === 'music' ? data.music : type === 'video' ? data.videos : data.notes;
    var it = arr[i];
    if (type === 'music') {
      musicId = it.id;
      $('music-url').value = 'https://music.163.com/song?id=' + it.id;
      $('music-title').value = it.title || '';
      $('music-year').value = it.year || '';
      $('music-desc').value = it.desc || '';
      $('music-featured').checked = !!it.featured;
      $('music-preview').innerHTML =
        '<meting-js server="netease" type="song" id="' + esc(it.id) + '" theme="#333333" autoplay="false"></meting-js>';
    } else if (type === 'video') {
      videoIds = { bvid: it.bvid, aid: it.aid, cid: it.cid };
      $('video-url').value = 'https://www.bilibili.com/video/' + it.bvid;
      $('video-title').value = it.title || '';
      $('video-category').value = it.category || '';
      $('video-desc').value = it.desc || '';
      $('video-group').value = it.group || 'interactive';
      $('video-featured').checked = !!it.featured;
      renderVideoPreview();
    } else {
      $('note-title').value = it.title || '';
      $('note-slug').value = it.slug || '';
      $('note-date').value = it.date || '';
      $('note-category').value = it.category || '';
      $('note-desc').value = it.desc || '';
      $('note-featured').checked = !!it.featured;
      $('note-body').value = it.body || '';   // 已是 HTML；直接再存一遍等价无损
      $('note-preview').innerHTML = '<div class="md-body">' + it.body + '</div>';
    }
  }

  function resetForm(type) {
    editing = null;
    ['music', 'video', 'note'].forEach(function (x) { showBanner(x, false); });
    if (type === 'music') {
      musicId = ''; setVals(['music-url', 'music-title', 'music-year', 'music-desc'], '');
      $('music-featured').checked = true; $('music-preview').innerHTML = '';
    } else if (type === 'video') {
      videoIds = null; setVals(['video-url', 'video-title', 'video-category', 'video-desc'], '');
      $('video-group').value = 'interactive'; $('video-featured').checked = true; $('video-preview').innerHTML = '';
    } else if (type === 'note') {
      setVals(['note-title', 'note-slug', 'note-date', 'note-category', 'note-desc', 'note-body'], '');
      $('note-featured').checked = false; $('note-preview').innerHTML = '';
    }
    renderManage();
  }
  function setVals(ids, v) { ids.forEach(function (id) { $(id).value = v; }); }

  $('manage-refresh').addEventListener('click', async function () {
    try {
      clearGlobal();
      globalStatus('info', '正在从线上读取…');
      var online = await fetchOnline();
      data = online.data;
      renderManage();
      globalStatus('ok', '✓ 已载入线上数据（ ' + data.music.length + ' 音乐 / ' + data.videos.length + ' 视频 / ' + data.notes.length + ' 随笔 ）。');
    } catch (e) {
      globalStatus('err', String(e.message || e));
    }
  });

  /* ---------------- 标签页 ---------------- */

  function switchTab(name) {
    Array.prototype.forEach.call($('tabs').children, function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    ['music', 'video', 'note', 'manage', 'settings'].forEach(function (p) {
      $('panel-' + p).classList.toggle('active', p === name);
    });
    clearGlobal();
  }
  $('tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (b) switchTab(b.getAttribute('data-tab'));
  });

  /* ---------------- 钥匙（PAT 设置） ---------------- */

  $('set-save').addEventListener('click', async function () {
    var st = $('set-status');
    var token = val('set-token');
    var repo = val('set-repo') || REPO_DEFAULT;
    var br = val('set-branch') || BRANCH_DEFAULT;
    if (!token) { status(st, 'err', '请粘贴令牌。'); return; }
    localStorage.setItem(LS.token, token);
    localStorage.setItem(LS.repo, repo);
    localStorage.setItem(LS.branch, br);
    status(st, 'info', '正在测试令牌…');
    try {
      var r1 = await fetch('https://api.github.com/repos/' + repoFull(), { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' } });
      if (r1.status === 401) { status(st, 'err', '令牌无效或已过期（401）。请回 GitHub 重新生成。'); return; }
      if (r1.status === 404) { status(st, 'err', '找不到仓库 ' + repoFull() + '（404）。检查仓库名/令牌是否包含该仓库权限。'); return; }
      if (!r1.ok) { status(st, 'err', 'GitHub 返回 HTTP ' + r1.status); return; }
      var r2 = await gh('/contents/content.json?ref=' + encodeURIComponent(br));
      if (r2.status === 403) { status(st, 'err', '令牌能访问仓库但没有 Contents 写权限（403）。请检查 fine-grained PAT 的 Permissions → Contents = Read and write。'); return; }
      status(st, 'ok', '✓ 钥匙验证通过（' + (r2.status === 200 ? '已能读写线上数据' : '线上暂无 content.json，首次发布会将自动创建') + '）。');
      loadOnlineSilently();
    } catch (e) {
      status(st, 'err', '测试失败：' + (e.message || e) + ' —— 大陆网络对 api.github.com 偶发抽风，可稍后重试。');
    }
  });

  $('set-clear').addEventListener('click', function () {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.repo);
    localStorage.removeItem(LS.branch);
    $('set-token').value = '';
    status($('set-status'), 'info', '已清除本机保存的令牌与仓库设置。');
  });

  async function loadOnlineSilently() {
    try {
      var online = await fetchOnline();
      data = online.data;
      renderManage();
    } catch (e) { /* 静默 */ }
  }

  /* ---------------- 门禁 ---------------- */

  async function tryUnlock() {
    var p = $('lock-pass').value;
    if (!p) return;
    var h = await sha256hex(p);
    if (h === ADMIN_PASS_SHA256) {
      sessionStorage.setItem(LS.ok, '1');
      enter();
    } else {
      $('lock-err').textContent = '密码不对。';
    }
  }
  $('lock-btn').addEventListener('click', tryUnlock);
  $('lock-pass').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') tryUnlock(); });

  function enter() {
    $('lockscreen').classList.add('hidden');
    $('admin').classList.remove('hidden');
    $('set-repo').value = localStorage.getItem(LS.repo) || REPO_DEFAULT;
    $('set-branch').value = localStorage.getItem(LS.branch) || BRANCH_DEFAULT;
    if (!hasToken()) {
      switchTab('settings');
      status($('set-status'), 'info', '第一次使用：请先粘贴 GitHub 访问令牌（PAT）。创建步骤见部署指南。');
    } else {
      switchTab('music');
      loadOnlineSilently();
    }
  }

  if (sessionStorage.getItem(LS.ok) === '1') {
    enter();
  }
})();
