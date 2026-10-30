/* Хранилище «Мой день»: localStorage как основа + Supabase как синхронизация.
   Никаких зависимостей. API: window.Den */
(function (global) {
  'use strict';

  var LS_STATE = 'den.state.v1';
  var LS_AUTH = 'den.auth.v1';
  var DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
  var LS_DIRTY = 'den.dirty.v1';

  var DEFAULTS = {
    dayStart: '07:00',
    dayEnd: '23:00',
    theme: 'dark',
    notify: false,
    leadMin: 5,
    dayReviewHour: 18,
    supabaseUrl: '',
    supabaseAnonKey: '',
    space: 'personal',
    vapidPublicKey: '',
    push: false
  };

  var cfgDefaults = (global.DEN_CONFIG || {});
  var auth = null;

  var state = {
    settings: extend({}, DEFAULTS, {
      supabaseUrl: cfgDefaults.supabaseUrl || '',
      supabaseAnonKey: cfgDefaults.supabaseAnonKey || '',
      space: cfgDefaults.space || 'personal',
      vapidPublicKey: cfgDefaults.vapidPublicKey || ''
    }),
    days: {}
  };

  var dirty = {};
  var status = 'off';
  var lastError = '';
  var lastSync = 0;
  var listeners = [];
  var pushTimer = null;
  var retryTimer = null;
  var retryDelay = 2000;
  var busy = false;

  /* ── утилиты ── */
  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function emit() {
    listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  /* ── загрузка / сохранение ── */
  function load() {
    var saved = read(LS_STATE, null);
    if (saved && typeof saved === 'object') {
      if (saved.days && typeof saved.days === 'object') {
        state.days = saved.days;
      }
      if (saved.settings) {
        state.settings = extend({}, DEFAULTS, {
          supabaseUrl: cfgDefaults.supabaseUrl || '',
          supabaseAnonKey: cfgDefaults.supabaseAnonKey || '',
          space: cfgDefaults.space || 'personal',
          vapidPublicKey: cfgDefaults.vapidPublicKey || ''
        }, saved.settings);
      }
    }
    var d = read(LS_DIRTY, null);
    if (d && typeof d === 'object') dirty = d;
    auth = read(LS_AUTH, null);
    refreshStatus();
  }

  var storageOk = true;

  function persist() {
    var ok = write(LS_STATE, { settings: state.settings, days: state.days });
    storageOk = ok;
    return ok;
  }

  function persistDirty() { write(LS_DIRTY, dirty); }

  /* ── дни ── */
  function emptyDay(date) {
    return { date: date, tasks: [], review: null, updatedAt: 0 };
  }

  function getDay(date) {
    var day = state.days[date];
    if (!day) return emptyDay(date);
    if (!Array.isArray(day.tasks)) day.tasks = [];
    return day;
  }

  function saveDay(day) {
    var prev = state.days[day.date];
    var floor = prev && prev.updatedAt ? prev.updatedAt + 1 : 0;
    day.updatedAt = Math.max(Date.now(), floor);
    state.days[day.date] = day;
    persist();
    dirty[day.date] = 1;
    persistDirty();
    refreshStatus();
    emit();
    schedulePush();
    return day;
  }

  function allDays() { return state.days; }

  /* Пакетное сохранение: один пересчёт и один рендер вместо цикла. */
  function saveMany(list) {
    if (!list || !list.length) return;
    var now = Date.now();
    list.forEach(function (day, index) {
      var prev = state.days[day.date];
      var floor = prev && prev.updatedAt ? prev.updatedAt + 1 : 0;
      day.updatedAt = Math.max(now + index, floor);
      state.days[day.date] = day;
      dirty[day.date] = 1;
    });
    persist();
    persistDirty();
    refreshStatus();
    emit();
    schedulePush();
  }

  /* ── произвольные документы (привычки и т.п.) ── */
  function getDoc(key, defaults) {
    var doc = state.days[key];
    if (!doc) doc = extend({ date: key, updatedAt: 0 }, defaults || {});
    return doc;
  }

  function saveDoc(doc) {
    if (!doc.date) doc.date = 'doc';
    var prev = state.days[doc.date];
    var floor = prev && prev.updatedAt ? prev.updatedAt + 1 : 0;
    doc.updatedAt = Math.max(Date.now(), floor);
    state.days[doc.date] = doc;
    persist();
    dirty[doc.date] = 1;
    persistDirty();
    refreshStatus();
    emit();
    schedulePush();
    return doc;
  }

  function removeDay(date) {
    delete state.days[date];
    persist();
    if (remoteReady()) {
      var cfg = remoteCfg();
      fetch(cfg.url + '/rest/v1/days?date=eq.' + encodeURIComponent(date) +
            '&space=eq.' + encodeURIComponent(cfg.space), {
        method: 'DELETE',
        headers: authHeaders(cfg)
      }).catch(function () {});
    }
    emit();
  }

  function newId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ── настройки ── */
  function getSettings() { return state.settings; }

  function setSettings(patch) {
    var before = { url: state.settings.supabaseUrl, key: state.settings.supabaseAnonKey };
    state.settings = extend({}, state.settings, patch);
    persist();
    var changedRemote =
      before.url !== state.settings.supabaseUrl ||
      before.key !== state.settings.supabaseAnonKey;
    if (changedRemote) {
      lastError = '';
      refreshStatus();
      if (remoteReady()) syncNow();
    }
    emit();
    return state.settings;
  }

  /* ── синхронизация ── */
  function remoteCfg() {
    var url = String(state.settings.supabaseUrl || '').trim().replace(/\/+$/, '');
    var key = String(state.settings.supabaseAnonKey || '').trim();
    if (!url || !key) return null;
    if (!/^https?:\/\//i.test(url)) return null;
    return { url: url, key: key, space: String(state.settings.space || 'personal') };
  }

  function remoteReady() { return !!remoteCfg(); }

  function authHeaders(cfg) {
    var headers = { 'apikey': cfg.key };
    // Вошли по magic link — запрос идёт от имени пользователя.
    if (auth && auth.access_token) {
      headers['Authorization'] = 'Bearer ' + auth.access_token;
      return headers;
    }
    // Новые ключи Supabase (sb_publishable_…) — короткие строки, не JWT:
    // их передают только в apikey. Legacy-ключи (eyJ…) идут ещё и в Bearer.
    if (/^eyJ/.test(cfg.key)) headers['Authorization'] = 'Bearer ' + cfg.key;
    return headers;
  }

  /* ── сессия входа ── */
  function getSession() { return auth; }

  function setSession(session) {
    auth = session;
    if (session) {
      write(LS_AUTH, session);
    } else {
      try { global.localStorage.removeItem(LS_AUTH); } catch (e) {}
    }
    emit();
  }

  function sessionValid() {
    return !!(auth && auth.access_token && (!auth.expires_at || Date.now() < auth.expires_at - 60000));
  }

  function refreshSession() {
    var cfg = remoteCfg();
    if (!auth || !auth.refresh_token || !cfg) return Promise.resolve(null);

    return fetch(cfg.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: auth.refresh_token })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
        email: (data.user && data.user.email) || (auth && auth.email) || '',
        user_id: (data.user && data.user.id) || (auth && auth.user_id) || ''
      });
      return auth;
    }).catch(function () {
      setSession(null);
      return null;
    });
  }

  function ensureSession() {
    if (!auth) return Promise.resolve(null);
    if (sessionValid()) return Promise.resolve(auth);
    return refreshSession();
  }

  function signIn(email) {
    var cfg = remoteCfg();
    if (!cfg) return Promise.reject(new Error('Сначала подключите Supabase'));

    var redirect = global.location.origin + global.location.pathname;
    return fetch(cfg.url + '/auth/v1/otp', {
      method: 'POST',
      headers: { 'apikey': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        create_user: true,
        email_redirect_to: redirect
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error('HTTP ' + res.status + ': ' + String(text).slice(0, 160));
        });
      }
      return true;
    });
  }

  function signOut() {
    if (auth && auth.access_token && remoteCfg()) {
      var cfg = remoteCfg();
      fetch(cfg.url + '/auth/v1/logout', {
        method: 'POST',
        headers: authHeaders(cfg)
      }).catch(function () {});
    }
    setSession(null);
  }

  function consumeAuthHash() {
    var hash = global.location.hash || '';
    if (hash.indexOf('access_token=') < 0) return false;

    var params = {};
    hash.slice(1).split('&').forEach(function (part) {
      var eq = part.indexOf('=');
      if (eq < 0) return;
      params[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
    });

    if (!params.access_token) return false;

    setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token || '',
      expires_at: Date.now() + (Number(params.expires_in) || 3600) * 1000,
      email: '',
      user_id: ''
    });

    try { global.history.replaceState(null, '', global.location.pathname + global.location.search); }
    catch (e) {}
    return true;
  }

  function fetchProfile() {
    var cfg = remoteCfg();
    if (!auth || !cfg) return Promise.resolve(null);

    return fetch(cfg.url + '/auth/v1/user', { headers: authHeaders(cfg) })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (user) {
        if (!user) return null;
        auth.email = user.email || auth.email;
        auth.user_id = user.id || auth.user_id;
        setSession(auth);
        return auth;
      })
      .catch(function () { return null; });
  }

  function claimLegacyRows() {
    var cfg = remoteCfg();
    if (!auth || !cfg) return Promise.resolve(0);

    return fetch(cfg.url + '/rest/v1/rpc/claim_legacy_rows', {
      method: 'POST',
      headers: extend({ 'Content-Type': 'application/json' }, authHeaders(cfg)),
      body: '{}'
    }).then(function (res) { return res.ok ? res.json() : 0; })
      .catch(function () { return 0; });
  }

  function savePushSub(rows) {
    var cfg = remoteCfg();
    if (!cfg) return Promise.reject(new Error('Supabase не подключён'));

    return fetch(cfg.url + '/rest/v1/push_subs?on_conflict=endpoint', {
      method: 'POST',
      headers: extend({
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      }, authHeaders(cfg)),
      body: JSON.stringify(rows)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error('HTTP ' + res.status + ': ' + String(text).slice(0, 160));
        });
      }
      return true;
    });
  }

  function dirtyCount() {
    var n = 0;
    for (var k in dirty) if (dirty[k]) n++;
    return n;
  }

  function refreshStatus() {
    var next;
    if (!remoteReady()) next = 'off';
    else if (lastError) next = 'error';
    else if (dirtyCount() > 0) next = 'pending';
    else next = 'ok';
    if (next !== status) { status = next; emit(); }
    else status = next;
  }

  function setError(msg) {
    lastError = msg || 'Ошибка';
    refreshStatus();
    emit();
  }

  function clearError() {
    if (lastError) lastError = '';
  }

  function fetchWithTimeout(url, options, ms) {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = null;
    if (controller) {
      options = extend({}, options, { signal: controller.signal });
      timer = setTimeout(function () { controller.abort(); }, ms || 15000);
    }
    return fetch(url, options).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  /* ── слияние версий дня ──
     Раньше день выбирался целиком по updatedAt, из-за чего удалённая
     на другом устройстве задача могла «воскреснуть». Теперь сливаем по id:
     у каждой задачи свой updatedAt, а удаления помечаются в day.removed. */

  function normalizeDay(day) {
    if (!Array.isArray(day.tasks)) day.tasks = [];
    if (!day.removed || typeof day.removed !== 'object') day.removed = {};
    if (!day.updatedAt) day.updatedAt = 0;
    return day;
  }

  function mergeDay(local, remote) {
    normalizeDay(local);
    normalizeDay(remote);

    var removed = {};
    [local.removed, remote.removed].forEach(function (map) {
      Object.keys(map || {}).forEach(function (id) {
        removed[id] = Math.max(removed[id] || 0, map[id] || 0);
      });
    });

    var byId = {};
    local.tasks.forEach(function (t) { if (t && t.id) byId[t.id] = t; });
    remote.tasks.forEach(function (t) {
      if (!t || !t.id) return;
      var cur = byId[t.id];
      if (!cur || (t.updatedAt || 0) > (cur.updatedAt || 0)) byId[t.id] = t;
    });

    var tasks = [];
    Object.keys(byId).forEach(function (id) {
      var task = byId[id];
      var death = removed[id];
      if (death && death >= (task.updatedAt || 0)) return;
      tasks.push(task);
    });
    tasks.sort(function (a, b) {
      return (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id));
    });

    var review = local.review;
    if (remote.review && (!local.review || (remote.review.at || 0) > (local.review.at || 0))) {
      review = remote.review;
    }

    return {
      date: local.date,
      tasks: tasks,
      removed: removed,
      review: review,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0)
    };
  }

  function pushDay(date) {
    var day = state.days[date];
    if (!day) { delete dirty[date]; persistDirty(); return Promise.resolve(); }

    var cfg = remoteCfg();
    if (!cfg) return Promise.resolve();

    var pushedAt = day.updatedAt;
    var body = [{
      date: day.date,
      payload: day,
      space: cfg.space,
      updated_at: new Date().toISOString()
    }];

    return fetchWithTimeout(cfg.url + '/rest/v1/days?on_conflict=space,date', {
      method: 'POST',
      headers: extend({
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      }, authHeaders(cfg)),
      body: JSON.stringify(body)
    }, 15000).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error('HTTP ' + res.status + ': ' + String(text).slice(0, 180));
        });
      }
    }).then(function () {
      var current = state.days[date];
      if (current && current.updatedAt === pushedAt) {
        delete dirty[date];
        persistDirty();
      }
      clearError();
    });
  }

  function pushAll() {
    var dates = Object.keys(dirty).filter(function (k) { return dirty[k]; });
    if (!dates.length) return Promise.resolve(true);

    var failed = [];
    var chain = Promise.resolve(true);
    dates.forEach(function (date) {
      chain = chain.then(function () {
        return pushDay(date).catch(function (err) { failed.push(err); });
      });
    });
    return chain.then(function () {
      if (failed.length) throw failed[0];
      return true;
    });
  }

  function pull() {
    var cfg = remoteCfg();
    if (!cfg) return Promise.resolve(false);

    var url = cfg.url + '/rest/v1/days?select=date,payload,updated_at' +
      '&space=eq.' + encodeURIComponent(cfg.space) +
      '&order=date.desc&limit=400';

    return fetchWithTimeout(url, { headers: authHeaders(cfg) }, 15000).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error('HTTP ' + res.status + ': ' + String(text).slice(0, 180));
        });
      }
      return res.json();
    }).then(function (rows) {
      if (!Array.isArray(rows)) return false;
      var changed = false;

      rows.forEach(function (row) {
        var p = row && row.payload;
        if (!p || !p.date) return;
        if (dirty[p.date]) return;                 // неотправленное не трогаем
        if (DATE_KEY.test(p.date) && !Array.isArray(p.tasks)) p.tasks = [];

        var local = state.days[p.date];
        if (!local) {
          state.days[p.date] = normalizeDay(p);
          changed = true;
          return;
        }

        var merged = mergeDay(local, p);
        if (JSON.stringify(merged) !== JSON.stringify(local)) {
          state.days[p.date] = merged;
          changed = true;
        }
      });

      if (changed) persist();
      clearError();
      return changed;
    });
  }

  function schedulePush() {
    if (!remoteReady()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      syncNow();
    }, 900);
  }

  function scheduleRetry() {
    if (retryTimer) return;
    var wait = retryDelay;
    retryTimer = setTimeout(function () {
      retryTimer = null;
      retryDelay = Math.min(retryDelay * 2, 60000);
      if (navigator.onLine !== false) syncNow();
    }, wait);
  }

  function syncNow() {
    if (!remoteReady()) { refreshStatus(); return Promise.resolve(false); }
    if (busy) return Promise.resolve(false);
    busy = true;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = null;
    refreshStatus();

    return ensureSession().then(function () { return pushAll(); })
      .then(function () { return pull(); })
      .then(function () {
        retryDelay = 2000;
        lastSync = Date.now();
        clearError();
        refreshStatus();
        emit();
        return true;
      })
      .catch(function (err) {
        setError(err && err.message ? err.message : String(err));
        scheduleRetry();
        return false;
      })
      .then(function (result) {
        busy = false;
        refreshStatus();
        if (dirtyCount() > 0 && !lastError) schedulePush();
        return result;
      });
  }

  /* ── экспорт / импорт ── */
  function exportAll() {
    var settings = extend({}, state.settings);
    settings.supabaseAnonKey = '';
    return clone({
      app: 'moy-den',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: settings,
      days: state.days
    });
  }

  function importAll(data) {
    if (!data || typeof data !== 'object' || !data.days || typeof data.days !== 'object') {
      throw new Error('Файл не похож на выгрузку «Мой день»');
    }
    var count = 0;
    Object.keys(data.days).forEach(function (date) {
      var day = data.days[date];
      if (!day || typeof day !== 'object') return;
      day.date = date;
      if (DATE_KEY.test(date) && !Array.isArray(day.tasks)) day.tasks = [];
      if (!day.updatedAt) day.updatedAt = Date.now();
      var local = state.days[date];
      if (local && (local.updatedAt || 0) > (day.updatedAt || 0)) return;
      state.days[date] = day;
      dirty[date] = 1;
      count++;
    });
    if (data.settings && typeof data.settings === 'object') {
      state.settings = extend({}, state.settings, data.settings);
    }
    persist();
    persistDirty();
    refreshStatus();
    emit();
    if (remoteReady()) syncNow();
    return count;
  }

  function clearAll() {
    var kept = {};
    Object.keys(state.days).forEach(function (key) {
      if (!DATE_KEY.test(key)) kept[key] = state.days[key];
    });
    state.days = kept;
    dirty = {};
    persist();
    persistDirty();
    emit();
  }

  /* ── публичный API ── */
  global.Den = {
    load: load,
    getSettings: getSettings,
    setSettings: setSettings,
    getDay: getDay,
    saveDay: saveDay,
    saveMany: saveMany,
    removeDay: removeDay,
    allDays: allDays,
    getDoc: getDoc,
    saveDoc: saveDoc,
    newId: newId,
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,
    syncNow: syncNow,
    status: function () { return status; },
    lastError: function () { return lastError; },
    lastSync: function () { return lastSync; },
    dirtyCount: dirtyCount,
    mergeDay: mergeDay,
    remoteReady: remoteReady,
    getSession: getSession,
    signIn: signIn,
    signOut: signOut,
    ensureSession: ensureSession,
    consumeAuthHash: consumeAuthHash,
    fetchProfile: fetchProfile,
    claimLegacyRows: claimLegacyRows,
    savePushSub: savePushSub,
    storageOk: function () { return storageOk; },
    onChange: function (fn) { listeners.push(fn); },
    DEFAULTS: DEFAULTS
  };

  load();
})(window);
