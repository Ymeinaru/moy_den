/* «Мой день» — логика. Без зависимостей, без сборки. */
(function () {
  'use strict';

  /* ───────────────────────── Константы ───────────────────────── */
  var WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  var WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  var MONTH = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
               'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var PRIO_NAME = { high: 'высокий', med: 'средний', low: 'низкий' };
  var ESTIMATES = [15, 30, 45, 60, 90, 120];
  var DEFAULT_EST = 30;
  var HABITS_KEY = 'habits';
  var SKILLS_KEY = 'skills';
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var HABIT_XP = 0.25;
  var REPEATS = [
    { id: '', label: 'Не повторять' },
    { id: 'day', label: 'Каждый день' },
    { id: 'weekdays', label: 'По будням' },
    { id: 'week', label: 'Раз в неделю' },
    { id: 'month', label: 'Раз в месяц' }
  ];
  var LEVEL_BASE = 50;
  var LEVEL_STEP = 25;

  var SKILL_DEFAULTS = [
    { id: 'cook', name: 'Готовка', emoji: '🍳' },
    { id: 'sport', name: 'Спорт', emoji: '🏋️' },
    { id: 'work', name: 'Работа', emoji: '💼' },
    { id: 'study', name: 'Учёба', emoji: '📚' },
    { id: 'home', name: 'Дом', emoji: '🏠' },
    { id: 'rest', name: 'Отдых', emoji: '🌿' },
    { id: 'other', name: 'Разное', emoji: '🧩' }
  ];

  var state = {
    date: null,
    view: 'day',
    habitWeek: null,
    weekStart: null,
    lastFocus: null,
    timer: null
  };

  /* ───────────────────────── Утилиты ───────────────────────── */
  function $(id) { return document.getElementById(id); }

  function el(tag, cls) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function icon(id, size) {
    var svg = svgEl('svg', { width: size || 16, height: size || 16, 'aria-hidden': 'true' });
    var use = svgEl('use', { href: '#' + id });
    svg.appendChild(use);
    return svg;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); }

  function parseYmd(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
  }

  function shiftYmd(s, n) {
    var d = parseYmd(s);
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  function mondayOf(s) {
    var d = parseYmd(s);
    var dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return ymd(d);
  }

  function humanDate(s) {
    var d = parseYmd(s);
    var text = WD[d.getDay()] + ', ' + d.getDate() + ' ' + MONTH[d.getMonth()];
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function shortDate(s) {
    var d = parseYmd(s);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function relLabel(s) {
    var diff = Math.round((parseYmd(s) - parseYmd(todayStr())) / 86400000);
    if (diff === 0) return 'сегодня';
    if (diff === 1) return 'завтра';
    if (diff === -1) return 'вчера';
    if (diff === 2) return 'послезавтра';
    if (diff > 2 && diff <= 7) return 'через ' + diff + ' дн.';
    if (diff < -1 && diff >= -7) return Math.abs(diff) + ' дн. назад';
    return capitalize(WD[parseYmd(s).getDay()]);
  }

  function toMin(hhmm) {
    if (!hhmm) return 0;
    var p = String(hhmm).split(':');
    return Number(p[0]) * 60 + Number(p[1] || 0);
  }

  function fromMin(min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }

  function fmtDur(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' мин';
    var h = Math.floor(min / 60);
    var r = min % 60;
    return r ? h + ' ч ' + r + ' мин' : h + ' ч';
  }

  function plural(n, one, few, many) {
    var abs = Math.abs(n) % 100;
    var last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  function toast(text, actionLabel, onAction) {
    var node = $('toast');
    clearTimeout(node._t);
    node.textContent = '';
    node.classList.toggle('has-action', !!(actionLabel && onAction));

    var label = el('span');
    label.textContent = text;
    node.appendChild(label);

    function hide() {
      node.classList.remove('show');
      setTimeout(function () {
        if (!node.classList.contains('show')) {
          node.textContent = '';
          node.classList.remove('has-action');
        }
      }, 300);
    }

    if (actionLabel && onAction) {
      var action = el('button', 'toast-action');
      action.type = 'button';
      action.textContent = actionLabel;
      action.onclick = function () {
        hide();
        try { onAction(); } catch (e) { console.error(e); }
      };
      node.appendChild(action);
      node._t = setTimeout(hide, 6500);
    } else {
      node._t = setTimeout(hide, 5000);
    }

    node.classList.add('show');
  }

  function announce(text) {
    var node = $('srStatus');
    if (!node) return;
    node.textContent = '';
    setTimeout(function () { node.textContent = text; }, 60);
  }

  function estOf(task) { return Number(task.est) > 0 ? Number(task.est) : DEFAULT_EST; }

  function spentOf(task) { return Number(task.spent) > 0 ? Number(task.spent) : 0; }

  /* Для опыта берём фактическое время, если оно учтено, иначе оценку. */
  function xpMinutes(task) {
    var spent = spentOf(task);
    return spent > 0 ? spent : estOf(task);
  }

  function runningMinutes(task) {
    if (!task.timerStart) return 0;
    return Math.max(1, Math.round((Date.now() - task.timerStart) / 60000));
  }

  function stopTimer(task) {
    if (!task || !task.timerStart) return 0;
    var mins = runningMinutes(task);
    task.spent = (Number(task.spent) || 0) + mins;
    task.timerStart = null;
    task.updatedAt = Date.now();
    return mins;
  }

  function nextRepeatDate(date, rule) {
    if (!rule) return '';
    var d = parseYmd(date);
    if (rule === 'day') return shiftYmd(date, 1);
    if (rule === 'week') return shiftYmd(date, 7);
    if (rule === 'weekdays') {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      return ymd(d);
    }
    if (rule === 'month') {
      var day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, last));
      return ymd(d);
    }
    return '';
  }

  function sortTasks(a, b) {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    var order = { high: 0, med: 1, low: 2 };
    var pa = order[a.prio] === undefined ? 1 : order[a.prio];
    var pb = order[b.prio] === undefined ? 1 : order[b.prio];
    if (pa !== pb) return pa - pb;
    return (a.createdAt || 0) - (b.createdAt || 0);
  }

  function weekLabel(startStr) {
    var a = parseYmd(startStr);
    var b = parseYmd(shiftYmd(startStr, 6));
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return a.getDate() + ' — ' + pad(b.getDate()) + ' ' + MONTH[a.getMonth()];
    }
    if (a.getFullYear() === b.getFullYear()) {
      return a.getDate() + ' ' + MONTH_SHORT[a.getMonth()] + ' — ' +
             pad(b.getDate()) + ' ' + MONTH_SHORT[b.getMonth()];
    }
    return a.getDate() + ' ' + MONTH_SHORT[a.getMonth()] + ' ' + a.getFullYear() + ' — ' +
           b.getDate() + ' ' + MONTH_SHORT[b.getMonth()] + ' ' + b.getFullYear();
  }

  /* ───────────────────────── Данные ───────────────────────── */
  function currentDay() { return Den.getDay(state.date); }

  function findTask(id) {
    var tasks = currentDay().tasks;
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }

  function mutate(fn) {
    var day = currentDay();
    fn(day);
    Den.saveDay(day);
  }

  function habitsDoc() {
    var doc = Den.getDoc(HABITS_KEY, { items: [] });
    if (!Array.isArray(doc.items)) doc.items = [];
    doc.items.forEach(function (h) {
      if (!h.checks || typeof h.checks !== 'object') h.checks = {};
      if (!h.id) h.id = Den.newId();
    });
    return doc;
  }

  function habitDone(habit, date) { return !!(habit.checks && habit.checks[date]); }

  function toggleHabit(id, date) {
    if (date > todayStr()) { toast('Будущие дни не отмечаем'); return; }
    var doc = habitsDoc();
    var found = null;
    doc.items.forEach(function (h) { if (h.id === id) found = h; });
    if (!found) return;
    var nowOn = !found.checks[date];
    if (nowOn) found.checks[date] = true;
    else delete found.checks[date];
    Den.saveDoc(doc);
    announce('Привычка «' + found.name + '» ' + (nowOn ? 'отмечена' : 'снята'));
  }

  function dayStats(date) {
    var day = Den.allDays()[date];
    var tasks = (day && Array.isArray(day.tasks)) ? day.tasks : [];
    var done = 0, minutes = 0;
    tasks.forEach(function (t) {
      if (t.done) { done++; minutes += estOf(t); }
    });
    return { total: tasks.length, done: done, minutes: minutes };
  }

  function skillsDoc() {
    var doc = Den.getDoc(SKILLS_KEY, { items: [] });
    if (!Array.isArray(doc.items) || !doc.items.length) {
      doc.items = SKILL_DEFAULTS.map(function (s) {
        return { id: s.id, name: s.name, emoji: s.emoji };
      });
    }
    doc.items.forEach(function (s) {
      if (!s.id) s.id = Den.newId();
      if (!s.emoji) s.emoji = '🎯';
      if (!s.name) s.name = 'Навык';
    });
    return doc;
  }

  function skillById(id) {
    var list = skillsDoc().items;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    for (var j = 0; j < list.length; j++) if (list[j].id === 'other') return list[j];
    return { id: 'other', name: 'Разное', emoji: '🧩' };
  }

  function fmtXp(value) {
    var rounded = Math.round((value || 0) * 10) / 10;
    if (Math.abs(rounded - Math.round(rounded)) < 0.001) return String(Math.round(rounded));
    return String(rounded).replace('.', ',');
  }

  function levelInfo(xp) {
    var level = 1;
    var acc = 0;
    var need = LEVEL_BASE;
    var guard = 0;
    while (xp >= acc + need && guard < 500) {
      acc += need;
      level += 1;
      need = LEVEL_BASE + LEVEL_STEP * (level - 1);
      guard += 1;
    }
    return { level: level, into: xp - acc, need: need, acc: acc };
  }

  function decayFor(earned, lastDate) {
    if (!earned) return { idle: 0, days: 0, penalty: 0, effective: 0 };
    var idle = lastDate
      ? Math.round((parseYmd(todayStr()) - parseYmd(lastDate)) / 86400000)
      : 0;
    // Дизмораль не отключается: два дня простоя — норма, с третьего идёт минус.
    var days = Math.max(0, idle - 2);
    var penalty = days > 0 ? Math.min(earned * 0.15 * days, earned * 0.6) : 0;
    return { idle: idle, days: days, penalty: penalty, effective: earned - penalty };
  }

  function xpSummary() {
    var map = Den.allDays();
    var habits = habitsDoc().items;
    var today = todayStr();

    var known = {};
    skillsDoc().items.forEach(function (s) { known[s.id] = 1; });

    function realSkill(id) {
      return (id && known[id]) ? id : 'other';
    }

    var earned = {};
    var last = {};
    var todayXp = 0;
    var badMarks = 0;

    function add(sid, gain, date) {
      earned[sid] = (earned[sid] || 0) + gain;
      if (!last[sid] || date > last[sid]) last[sid] = date;
    }

    Object.keys(map).forEach(function (date) {
      if (!DATE_RE.test(date)) return;

      (map[date].tasks || []).forEach(function (t) {
        if (!t.done) return;
        var gain = xpMinutes(t) / 60;
        add(realSkill(t.skill), gain, date);
        if (date === today) todayXp += gain;
      });

      habits.forEach(function (h) {
        if (h.kind === 'bad') return;
        if (!(h.checks && h.checks[date])) return;
        add(realSkill(h.skill), HABIT_XP, date);
        if (date === today) todayXp += HABIT_XP;
      });
    });

    /* вредные привычки: каждая отметка — минус 1 XP, размазанный по всем навыкам */
    habits.forEach(function (h) {
      if (h.kind !== 'bad') return;
      Object.keys(h.checks || {}).forEach(function (d) {
        if (DATE_RE.test(d) && h.checks[d]) badMarks += 1;
      });
    });

    var skillCount = Math.max(1, skillsDoc().items.length);
    var badShare = badMarks / skillCount;

    var bySkill = {};
    var total = 0;
    var penaltyTotal = 0;
    var idlePenalties = [];

    Object.keys(earned).forEach(function (sid) {
      var d = decayFor(earned[sid], last[sid]);
      var share = earned[sid] > 0 ? badShare : 0;
      var effective = Math.max(0, d.effective - share);
      bySkill[sid] = {
        earned: earned[sid],
        effective: effective,
        decay: d.penalty,
        badShare: share,
        penalty: (earned[sid] - effective),
        idle: d.idle,
        days: d.days
      };
      total += effective;
      penaltyTotal += d.penalty;
      if (d.penalty > 0) {
        idlePenalties.push({ id: sid, penalty: d.penalty, idle: d.idle });
      }
    });

    idlePenalties.sort(function (a, b) { return b.penalty - a.penalty; });

    return {
      total: total,
      today: todayXp,
      bySkill: bySkill,
      idlePenalties: idlePenalties,
      penalty: penaltyTotal,
      badMarks: badMarks,
      badShare: badShare
    };
  }

  function habitStreak(habit) {
    var checks = habit.checks || {};
    var count = 0;
    var date = todayStr();
    for (var i = 0; i < 1000; i++) {
      if (checks[date]) count += 1;
      else if (i > 0) break;
      date = shiftYmd(date, -1);
    }
    return count;
  }

  function habitBest(habit) {
    var checks = habit.checks || {};
    var dates = Object.keys(checks).filter(function (d) {
      return DATE_RE.test(d) && checks[d];
    }).sort();
    var best = 0;
    var run = 0;
    var prev = null;
    dates.forEach(function (d) {
      run = (prev && shiftYmd(prev, 1) === d) ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    return best;
  }

  function habitsStat(date) {
    var items = habitsDoc().items;
    var done = 0;
    items.forEach(function (h) { if (habitDone(h, date)) done++; });
    return { total: items.length, done: done };
  }

  function isActiveDay(date) {
    if (dayStats(date).done > 0) return true;
    return habitsStat(date).done > 0;
  }

  function streakNow() {
    var n = 0;
    var date = todayStr();
    for (var i = 0; i < 500; i++) {
      if (isActiveDay(date)) n++;
      else if (i > 0) break;
      date = shiftYmd(date, -1);
    }
    return n;
  }

  function bestStreak() {
    var seen = {};
    Object.keys(Den.allDays()).forEach(function (k) { if (DATE_RE.test(k)) seen[k] = 1; });
    habitsDoc().items.forEach(function (h) {
      Object.keys(h.checks || {}).forEach(function (d) { if (DATE_RE.test(d)) seen[d] = 1; });
    });

    var dates = Object.keys(seen).sort();
    var best = 0, run = 0, prev = null;
    dates.forEach(function (date) {
      if (date > todayStr()) return;
      if (isActiveDay(date)) {
        run = (prev && shiftYmd(prev, 1) === date) ? run + 1 : 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
      prev = date;
    });
    return best;
  }

  function taskNode(t) {
    var li = el('li', 'task prio-' + (t.prio || 'med') + (t.done ? ' done' : ''));
    li.dataset.id = t.id;

    var check = el('button', 'check');
    check.type = 'button';
    check.dataset.act = 'toggle';
    check.setAttribute('aria-pressed', t.done ? 'true' : 'false');
    check.setAttribute('aria-label', t.title);
    check.dataset.fkey = 'task:' + t.id + ':toggle';
    check.appendChild(icon('i-check', 12));

    var main = el('div', 'task-main');
    var title = el('span', 'task-title');
    title.textContent = t.title;
    main.appendChild(title);

    var meta = el('span', 'task-meta');
    var parts = [];
    if (t.timerStart) parts.push('⏱ ' + fmtDur(runningMinutes(t)));
    else if (spentOf(t)) parts.push(fmtDur(spentOf(t)) + ' факт');
    else if (t.est) parts.push(fmtDur(t.est));
    if (t.start) parts.push('в ' + t.start);
    if (t.repeat) parts.push('↻');
    if (t.note) parts.push('заметка');
    parts.push(PRIO_NAME[t.prio || 'med']);
    meta.textContent = parts.join(' · ');
    main.appendChild(meta);

    var more = el('button', 'task-more');
    more.type = 'button';
    more.dataset.act = 'more';
    more.setAttribute('aria-label', 'Действия: ' + t.title);
    more.dataset.fkey = 'task:' + t.id + ':more';
    more.appendChild(icon('i-more', 18));

    li.appendChild(check);
    li.appendChild(main);
    li.appendChild(more);
    return li;
  }

  /* ───────────────────────── Раскладка блоков ───────────────────────── */
  function layout(scheduled, dayStart) {
    var items = scheduled.map(function (t) {
      var s = toMin(t.start);
      return { task: t, start: s, end: s + estOf(t), lane: 0, total: 1 };
    }).sort(function (a, b) { return a.start - b.start || a.end - b.end; });

    var clusters = [];
    var cluster = null;

    items.forEach(function (item) {
      if (!cluster || item.start >= cluster.end) {
        cluster = { items: [], end: item.end, lanes: [] };
        clusters.push(cluster);
      }
      cluster.items.push(item);
      cluster.end = Math.max(cluster.end, item.end);

      var lane = 0;
      while (cluster.lanes[lane] !== undefined && cluster.lanes[lane] > item.start) lane++;
      cluster.lanes[lane] = item.end;
      item.lane = lane;
      item.cluster = cluster;
    });

    clusters.forEach(function (c) {
      var total = Math.max(1, c.lanes.length);
      c.items.forEach(function (item) { item.total = total; });
    });

    items.forEach(function (item) {
      if (item.start < dayStart) {
        item.end = Math.max(item.end, dayStart + 1);
        item.start = dayStart;
      }
    });

    return items;
  }

  /* ───────────────────────── Рендер: день ───────────────────────── */
  function renderDay() {
    var settings = Den.getSettings();
    var day = currentDay();
    var tasks = day.tasks.slice();
    var done = tasks.filter(function (t) { return t.done; }).length;
    var total = tasks.length;

    $('dateLabel').textContent = shortDate(state.date);
    $('dateSub').textContent = relLabel(state.date);
    document.title = humanDate(state.date) + ' · Мой день';

    renderHabitChips();

    var scheduled = tasks.filter(function (t) { return !!t.start; });
    var unscheduled = tasks.filter(function (t) { return !t.start; }).sort(sortTasks);
    var startMin = toMin(settings.dayStart);
    var endMin = toMin(settings.dayEnd);
    if (endMin <= startMin) endMin = startMin + 60;

    var offDay = scheduled.filter(function (t) {
      var sMin = toMin(t.start);
      return sMin >= endMin || sMin + estOf(t) <= startMin;
    });
    var onGrid = scheduled.filter(function (t) { return offDay.indexOf(t) < 0; });

    var items = layout(onGrid, startMin);
    var offGrid = offDay.map(function (t) { return { task: t, start: toMin(t.start) }; });

    var conflictClusters = [];
    items.forEach(function (i) {
      if (i.total > 1 && conflictClusters.indexOf(i.cluster) < 0) conflictClusters.push(i.cluster);
    });
    var conflicts = conflictClusters.length;

    var planned = tasks.reduce(function (sum, t) { return sum + estOf(t); }, 0);
    var plannedSched = onGrid.reduce(function (sum, t) { return sum + estOf(t); }, 0);

    var summaryRow = $('summaryText').parentNode;
    summaryRow.hidden = total === 0;

    var summary = $('summaryText');
    summary.textContent = '';
    if (total) {
      summary.appendChild(document.createTextNode('Сделано '));
      var b = el('b');
      b.textContent = done + ' из ' + total;
      summary.appendChild(b);
      summary.appendChild(document.createTextNode(' · план ≈ ' + fmtDur(planned)));
    }

    if (conflicts) {
      var warn = el('span', 'u-danger');
      warn.style.fontSize = '12px';
      warn.style.marginLeft = '6px';
      warn.textContent = conflicts + ' ' + plural(conflicts, 'накладка', 'накладки', 'накладок');
      summary.appendChild(warn);
    }

    var pct = total ? Math.round(done / total * 100) : 0;
    $('progressBar').style.width = pct + '%';
    $('progress').setAttribute('aria-valuenow', String(pct));
    $('progress').setAttribute('aria-valuetext', done + ' из ' + total + ' задач выполнено');

    $('taskCount').textContent = unscheduled.length ? unscheduled.length + ' шт.' : '';

    var list = $('taskList');
    list.textContent = '';
    unscheduled.forEach(function (t) { list.appendChild(taskNode(t)); });

    var empty = $('emptyState');
    empty.hidden = total > 0;
    empty.textContent = 'Пока пусто. Напиши задачу в поле внизу или ткни в час в расписании.';

    var timeline = $('timeline');
    timeline.textContent = '';
    for (var m = startMin; m < endMin; m += 60) {
      var row = el('div', 'hour');
      row.dataset.min = String(m);
      var label = el('span', 'hour-label');
      label.textContent = fromMin(m);
      row.appendChild(label);
      timeline.appendChild(row);
    }

    var hourH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 56;
    var pxPerMin = hourH / 60;

    var blocks = $('blocks');
    blocks.textContent = '';
    blocks.style.height = ((endMin - startMin) * pxPerMin) + 'px';

    items.forEach(function (item) {
      var t = item.task;
      var top = (item.start - startMin) * pxPerMin;
      var height = Math.max(16, (item.end - item.start) * pxPerMin - 3);
      var widthPct = 100 / item.total;
      var leftPct = item.lane * widthPct;

      var block = el('button', 'block prio-' + (t.prio || 'med') + (t.done ? ' done' : ''));
      block.type = 'button';
      if (height < 40) block.classList.add('compact');
      block.dataset.id = t.id;
      if (item.total > 1) block.classList.add('conflict');
      block.style.top = top + 'px';
      block.style.height = height + 'px';
      block.style.left = 'calc(' + leftPct + '% + 2px)';
      block.style.width = 'calc(' + widthPct + '% - 4px)';

      var time = el('span', 'block-time');
      time.textContent = fromMin(toMin(t.start));
      var title = el('span', 'block-title');
      title.textContent = t.title;
      block.appendChild(time);
      block.appendChild(title);
      block.setAttribute('aria-label', t.title + ', ' + fromMin(toMin(t.start)) + ', ' +
        fmtDur(estOf(t)) + ', приоритет ' + PRIO_NAME[t.prio || 'med'] +
        (t.done ? ', выполнено' : ''));
      blocks.appendChild(block);
    });

    if (state.date === todayStr()) {
      var now = new Date();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= startMin && nowMin <= endMin) {
        var line = el('div', 'now-line');
        line.style.top = ((nowMin - startMin) * pxPerMin) + 'px';
        line.setAttribute('aria-hidden', 'true');
        blocks.appendChild(line);
      }
    }

    var offNode = $('offGrid');
    if (offGrid.length) {
      offNode.hidden = false;
      offNode.textContent = 'Вне сетки: ' + offGrid.map(function (i) {
        return fromMin(toMin(i.task.start)) + ' — ' + i.task.title;
      }).join(', ');
    } else {
      offNode.hidden = true;
      offNode.textContent = '';
    }

    var free = endMin - startMin;
    var load = $('loadCount');
    if (scheduled.length) {
      var left = free - plannedSched;
      load.textContent = left >= 0 ? 'свободно ≈ ' + fmtDur(left) : 'перебор на ' + fmtDur(-left);
      load.className = 'count' + (left < 0 ? ' u-danger' : '');
    } else {
      load.textContent = '';
      load.className = 'count';
    }

    renderReviewCta(day);
    renderXpCard();
    updateSyncUI();
  }

  function renderXpCard() {
    var xp = xpSummary();
    var info = levelInfo(xp.total);
    var pct = info.need ? Math.round(info.into / info.need * 100) : 0;

    $('levelBadge').textContent = String(info.level);
    $('levelTitle').textContent = 'Уровень ' + info.level;
    $('levelNums').textContent = fmtXp(info.into) + ' из ' + info.need + ' XP';
    $('levelBar').style.width = pct + '%';
    $('levelBarWrap').setAttribute('aria-valuenow', String(pct));
    $('levelBarWrap').setAttribute('aria-valuetext',
      'до ' + (info.level + 1) + ' уровня ' + fmtXp(info.need - info.into) + ' XP');
    $('xpToday').textContent = xp.today ? '+' + fmtXp(xp.today) + ' XP сегодня' : '';

    var box = $('skillChips');
    box.textContent = '';

    var rows = skillsDoc().items.map(function (sk) {
      var v = xp.bySkill[sk.id] || { effective: 0, penalty: 0 };
      return { skill: sk, xp: v.effective, penalty: v.penalty };
    }).filter(function (r) { return r.xp > 0 || r.penalty > 0; })
      .sort(function (a, b) { return b.xp - a.xp; });

    if (!rows.length) {
      var hint = el('span', 'skill-chip');
      hint.textContent = 'Выполни задачу — опыт придёт сюда';
      box.appendChild(hint);
    } else {
      rows.forEach(function (row) {
        var chip = el('span', 'skill-chip');
        var em = el('span', 'em');
        em.textContent = row.skill.emoji;
        var name = el('span');
        name.textContent = row.skill.name;
        var val = el('b');
        val.textContent = fmtXp(row.xp);
        chip.appendChild(em);
        chip.appendChild(name);
        chip.appendChild(val);
        box.appendChild(chip);
      });
    }

    var note = $('decayNote');
    var notes = [];

    if (xp.idlePenalties.length) {
      notes.push('Опыт понижен: ' + xp.idlePenalties.map(function (r) {
        var sk = skillById(r.id);
        return sk.name + ' −' + fmtXp(r.penalty) + ' XP (' + r.idle + ' ' +
          plural(r.idle, 'день', 'дня', 'дней') + ' без занятий)';
      }).join(' · '));
    }

    if (xp.badMarks > 0) {
      notes.push('Срывы: ' + xp.badMarks + ' × −1 XP (по −' + fmtXp(xp.badShare) +
        ' с каждого навыка)');
    }

    if (notes.length) {
      note.hidden = false;
      note.textContent = notes.join(' · ');
    } else {
      note.hidden = true;
      note.textContent = '';
    }
  }

  function renderSkillStats() {
    var xp = xpSummary();
    var info = levelInfo(xp.total);
    var pct = info.need ? Math.round(info.into / info.need * 100) : 0;

    $('levelBadgeBig').textContent = String(info.level);
    $('levelTitleBig').textContent = 'Уровень ' + info.level;
    $('levelNumsBig').textContent = fmtXp(info.into) + ' из ' + info.need + ' XP';
    $('levelBarBig').style.width = pct + '%';
    var levelNote = '';
    if (xp.penalty > 0) levelNote += ' · −' + fmtXp(xp.penalty) + ' за простой';
    if (xp.badMarks > 0) levelNote += ' · −' + xp.badMarks + ' за срывы';
    $('levelTotalXp').textContent = 'всего ' + fmtXp(xp.total) + ' XP' + levelNote;

    var items = skillsDoc().items.map(function (sk) {
      var v = xp.bySkill[sk.id] || { effective: 0, penalty: 0, idle: 0 };
      return { skill: sk, xp: v.effective, penalty: v.penalty, idle: v.idle };
    }).sort(function (a, b) { return b.xp - a.xp; });

    $('skillCount').textContent = items.length + ' ' + plural(items.length, 'навык', 'навыка', 'навыков');

    var grid = $('skillGrid');
    grid.textContent = '';
    $('skillEmpty').hidden = items.length > 0;

    items.forEach(function (row) {
      var s = row.skill;
      var lvl = levelInfo(row.xp);
      var p = lvl.need ? Math.round(lvl.into / lvl.need * 100) : 0;

      var card = el('button', 'skill-card');
      card.type = 'button';
      card.dataset.fkey = 'skill:' + s.id;
      card.setAttribute('aria-label', s.name + ': уровень ' + lvl.level + ', ' + fmtXp(row.xp) +
        ' опыта' + (row.penalty > 0 ? ', понижено на ' + fmtXp(row.penalty) : '') + '. Изменить');

      var top = el('div', 'sk-top');
      var em = el('span', 'em');
      em.textContent = s.emoji;
      var name = el('span');
      name.textContent = s.name;
      var lvlTag = el('span', 'sk-lvl');
      lvlTag.textContent = 'Ур. ' + lvl.level;
      top.appendChild(em);
      top.appendChild(name);
      top.appendChild(lvlTag);

      var bar = el('div', 'level-bar');
      var fill = el('i');
      fill.style.width = p + '%';
      bar.appendChild(fill);

      var xpTxt = el('div', 'sk-xp');
      xpTxt.textContent = fmtXp(row.xp) + ' XP';
      if (row.penalty > 0) {
        var pen = el('span', 'sk-penalty');
        pen.textContent = ' · −' + fmtXp(row.penalty);
        xpTxt.appendChild(pen);
      } else if (!row.xp) {
        xpTxt.textContent = '0 XP — пока пусто';
      }

      card.appendChild(top);
      card.appendChild(bar);
      card.appendChild(xpTxt);
      card.onclick = function () { skillSheet(s.id); };
      grid.appendChild(card);
    });
  }

  function renderHabitChips() {
    var box = $('habitChips');
    if (!box) return;
    box.textContent = '';

    var items = habitsDoc().items;
    $('habitChipsCount').textContent = items.length
      ? habitsStat(state.date).done + '/' + items.length
      : '';

    if (!items.length) {
      var hint = el('button', 'habit-chip');
      hint.type = 'button';
      hint.textContent = '+ Добавить привычку';
      hint.onclick = function () {
        setView('habits');
        setTimeout(function () { habitSheet(); }, 150);
      };
      box.appendChild(hint);
      return;
    }

    items.forEach(function (h) {
      var isBad = h.kind === 'bad';
      var on = habitDone(h, state.date);
      var btn = el('button', 'habit-chip' + (isBad ? ' is-bad' : ''));
      btn.type = 'button';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', isBad ? ('Срыв: ' + h.name) : h.name);
      btn.dataset.fkey = 'habit:' + h.id;

      var tick = el('span', 'tick');
      tick.appendChild(icon('i-check', 11));
      var name = el('span');
      name.textContent = h.name;

      btn.appendChild(tick);
      btn.appendChild(name);
      if (state.date > todayStr()) btn.disabled = true;
      btn.onclick = function () { toggleHabit(h.id, state.date); };
      box.appendChild(btn);
    });
  }

  function renderReviewCta(day) {
    var text = $('reviewText');
    var cta = $('reviewCta');
    var settings = Den.getSettings();
    var reviewed = !!(day.review && day.review.at);
    var isToday = state.date === todayStr();
    var hour = new Date().getHours();
    cta.hidden = isToday && !reviewed && hour < (Number(settings.dayReviewHour) || 18);
    text.textContent = '';
    var total = day.tasks.length;
    var done = day.tasks.filter(function (t) { return t.done; }).length;
    var hs = habitsStat(state.date);

    if (day.review && day.review.at) {
      var t1 = el('span');
      t1.textContent = 'Итоги подведены: ';
      var b1 = el('b');
      b1.textContent = done + ' из ' + total;
      text.appendChild(t1);
      text.appendChild(b1);
      $('reviewBtn').textContent = 'Открыть';
      return;
    }

    if (!total && !hs.total) {
      text.textContent = 'Чем займёшься? Добавь задачи — вечером подведём итоги.';
    } else {
      var b = el('b');
      b.textContent = done + ' из ' + total;
      text.appendChild(document.createTextNode('Сделано '));
      text.appendChild(b);
      text.appendChild(document.createTextNode(' · привычки ' + hs.done + '/' + hs.total));
    }
    $('reviewBtn').textContent = 'Итоги';
  }

  /* ───────────────────────── Рендер: привычки ───────────────────────── */
  function renderHabits() {
    var start = state.habitWeek;
    var days = [];
    for (var i = 0; i < 7; i++) days.push(shiftYmd(start, i));

    $('habitWeekLabel').textContent = weekLabel(start);

    var box = $('habitList');
    box.textContent = '';
    var items = habitsDoc().items;
    $('habitEmpty').hidden = items.length > 0;

    items.forEach(function (h) {
      var isBad = h.kind === 'bad';
      var row = el('div', 'habit-row' + (isBad ? ' is-bad' : ''));

      var top = el('div', 'habit-top');
      var nameBtn = el('button', 'habit-name');
      nameBtn.type = 'button';
      nameBtn.textContent = h.name;
      nameBtn.setAttribute('aria-label', 'Изменить привычку: ' + h.name);
      nameBtn.style.textAlign = 'left';
      nameBtn.onclick = function () { habitSheet(h.id); };
      top.appendChild(nameBtn);

      if (isBad) {
        var kindTag = el('span', 'habit-kind');
        kindTag.textContent = 'вредная';
        top.appendChild(kindTag);
      }

      if (h.time) {
        var time = el('span', 'habit-time');
        time.textContent = h.time;
        top.appendChild(time);
      }

      var streak = isBad ? 0 : habitStreak(h);
      if (streak > 0) {
        var fire = el('span', 'habit-streak');
        fire.textContent = '🔥 ' + streak;
        fire.title = 'Лучшая серия: ' + habitBest(h);
        fire.setAttribute('aria-label', 'серия ' + streak + ' ' +
          plural(streak, 'день', 'дня', 'дней') + ' подряд');
        top.appendChild(fire);
      }

      var doneCount = days.filter(function (d) { return habitDone(h, d); }).length;
      var pct = isBad
        ? Math.round((7 - doneCount) / 7 * 100)
        : Math.round(doneCount / 7 * 100);

      var pctNode = el('span', 'habit-pct');
      pctNode.textContent = isBad
        ? 'срывов ' + doneCount + ' · чисто ' + pct + '%'
        : doneCount + ' из 7 · ' + pct + '%';
      if (isBad && doneCount > 0) pctNode.classList.add('u-danger');
      top.appendChild(pctNode);
      row.appendChild(top);

      var dayBox = el('div', 'habit-days');
      days.forEach(function (d) {
        var on = habitDone(h, d);
        var dot = el('button', 'day-dot');
        dot.type = 'button';
        dot.setAttribute('aria-pressed', on ? 'true' : 'false');
        dot.setAttribute('aria-label', WD_SHORT[parseYmd(d).getDay()] + ', ' + shortDate(d) +
          (isBad ? (on ? ' — срыв' : ' — без срыва') : ''));
        dot.dataset.fkey = 'habit:' + h.id + ':' + d;
        if (isBad && on) dot.classList.add('is-bad');
        if (d === todayStr()) dot.classList.add('is-today');
        if (d > todayStr()) dot.disabled = true;

        var wd = el('span', 'wd');
        wd.textContent = WD_SHORT[parseYmd(d).getDay()];
        var num = el('span');
        num.textContent = String(parseYmd(d).getDate());
        dot.appendChild(wd);
        dot.appendChild(num);
        dot.onclick = function () { toggleHabit(h.id, d); };
        dayBox.appendChild(dot);
      });
      row.appendChild(dayBox);

      var bar = el('div', 'habit-bar' + (isBad ? ' is-bad' : ''));
      var fill = el('i');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      row.appendChild(bar);

      box.appendChild(row);
    });

    var goodMarks = 0;
    var badMarks = 0;
    items.forEach(function (h) {
      days.forEach(function (d) {
        if (!habitDone(h, d)) return;
        if (h.kind === 'bad') badMarks += 1;
        else goodMarks += 1;
      });
    });

    var note = '';
    if (goodMarks) note += 'Полезных отметок: ' + goodMarks + '. ';
    if (badMarks) note += 'Срывов за неделю: ' + badMarks + ' (−' + badMarks + ' XP). ';
    $('habitNote').textContent = note ||
      'Привычка — это один маленький шаг, который повторяется. Начни с одной.';
  }

  /* ───────────────────────── Рендер: неделя ───────────────────────── */
  function ringNode(pct) {
    var C = 2 * Math.PI * 23;
    var svg = svgEl('svg', { class: 'ring', viewBox: '0 0 54 54', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { class: 'ring-bg', cx: 27, cy: 27, r: 23 }));
    var fg = svgEl('circle', {
      class: 'ring-fg', cx: 27, cy: 27, r: 23,
      'stroke-dasharray': C.toFixed(1),
      'stroke-dashoffset': (C * (1 - pct)).toFixed(1)
    });
    svg.appendChild(fg);
    return svg;
  }

  function renderWeek() {
    var start = state.weekStart;
    $('weekLabel').textContent = weekLabel(start);

    var grid = $('weekGrid');
    grid.textContent = '';
    var totals = { done: 0, total: 0, habits: 0, habitSlots: 0 };

    for (var i = 0; i < 7; i++) {
      var date = shiftYmd(start, i);
      var s = dayStats(date);
      var hs = habitsStat(date);
      var denom = s.total + hs.total;
      var num = s.done + hs.done;
      var pct = denom ? num / denom : 0;

      totals.done += s.done;
      totals.total += s.total;
      totals.habits += hs.done;
      totals.habitSlots += hs.total;

      var card = el('button', 'day-card');
      card.type = 'button';
      card.dataset.date = date;
      if (date === todayStr()) card.classList.add('is-today');
      card.dataset.fkey = 'day:' + date;
      if (date === todayStr()) card.setAttribute('aria-current', 'date');
      card.setAttribute('aria-label', 'Открыть день: ' + capitalize(WD[parseYmd(date).getDay()]) + ', ' +
        shortDate(date) + ', ' + (denom ? num + ' из ' + denom : 'пока нет задач'));

      var dow = el('span', 'dow');
      dow.textContent = capitalize(WD[parseYmd(date).getDay()]);
      var dnum = el('span', 'dnum');
      dnum.textContent = pad(parseYmd(date).getDate()) + '.' + pad(parseYmd(date).getMonth() + 1);

      card.appendChild(dow);
      card.appendChild(dnum);
      card.appendChild(ringNode(pct));

      var meta = el('span', 'dmeta');
      if (!denom) {
        meta.textContent = 'Пока нет задач';
      } else {
        var line1 = el('span');
        line1.textContent = s.done + ' из ' + s.total + ' задач';
        meta.appendChild(line1);
        if (hs.total) {
          var line2 = el('span');
          line2.textContent = 'привычки ' + hs.done + '/' + hs.total;
          meta.appendChild(line2);
        }
      }
      card.appendChild(meta);

      var add = el('span', 'dadd');
      add.textContent = '+ Задачи';
      card.appendChild(add);

      grid.appendChild(card);
    }

    var pctWeek = (totals.total + totals.habitSlots)
      ? Math.round((totals.done + totals.habits) / (totals.total + totals.habitSlots) * 100)
      : 0;
    $('weekNote').textContent = 'Неделя: ' + totals.done + ' из ' + totals.total + ' задач' +
      (totals.habitSlots ? ' и ' + totals.habits + ' из ' + totals.habitSlots + ' отметок привычек' : '') +
      ' · ' + pctWeek + '%';
  }

  /* ───────────────────────── Рендер: итоги ───────────────────────── */
  function renderStats() {
    var last14 = [];
    for (var i = 13; i >= 0; i--) last14.push(shiftYmd(todayStr(), -i));

    var counts = last14.map(function (d) { return dayStats(d).done; });
    var max = Math.max.apply(null, counts.concat([1]));

    var bars = $('bars');
    bars.textContent = '';
    last14.forEach(function (date, idx) {
      var col = el('div', 'bar-col');
      col.setAttribute('role', 'listitem');
      col.setAttribute('aria-label', shortDate(date) + ' — ' + counts[idx] + ' ' +
        plural(counts[idx], 'задача', 'задачи', 'задач') + (date === todayStr() ? ', сегодня' : ''));
      var bar = el('div', 'bar');
      bar.setAttribute('aria-hidden', 'true');
      var value = counts[idx];
      bar.style.height = Math.max(3, Math.round(value / max * 100)) + '%';
      if (value > 0) bar.classList.add('has');
      if (date === todayStr()) bar.classList.add('today');
      bar.title = value + ' ' + plural(value, 'задача', 'задачи', 'задач');
      var label = el('div', 'bar-label');
      label.setAttribute('aria-hidden', 'true');
      label.textContent = String(parseYmd(date).getDate());
      col.appendChild(bar);
      col.appendChild(label);
      bars.appendChild(col);
    });

    var done7 = 0, total7 = 0;
    last14.slice(7).forEach(function (d) {
      var s = dayStats(d);
      done7 += s.done;
      total7 += s.total;
    });

    var activeIn14 = counts.filter(function (v) { return v > 0; }).length;
    $('barsCount').textContent = activeIn14 + ' ' + plural(activeIn14, 'день', 'дня', 'дней');

    $('statStreak').textContent = streakNow();
    $('statBest').textContent = bestStreak();
    $('statDone7').textContent = done7;
    $('statRate').textContent = '';
    $('statRate').appendChild(document.createTextNode(total7 ? Math.round(done7 / total7 * 100) : 0));
    var small = el('small');
    small.textContent = '%';
    $('statRate').appendChild(small);

    var allDone = 0, allMin = 0, activeDays = 0;
    Object.keys(Den.allDays()).forEach(function (d) {
      if (!DATE_RE.test(d)) return;
      var s = dayStats(d);
      allDone += s.done;
      allMin += s.minutes;
      if (s.total > 0) activeDays++;
    });
    $('statAllDone').textContent = allDone;
    $('statAllTime').textContent = '';
    $('statAllTime').appendChild(document.createTextNode(String(Math.round(allMin / 60))));
    var h = el('small');
    h.textContent = 'ч';
    $('statAllTime').appendChild(h);

    $('statsNote').textContent = activeDays
      ? 'Дней с планами: ' + activeDays + ' · хранится локально и в Supabase'
      : 'Пока нет данных — заполни пару дней.';

    var day = currentDay();
    var s = dayStats(state.date);
    var hs = habitsStat(state.date);
    var line = humanDate(state.date) + ': ' + s.done + ' из ' + s.total + ' задач';
    if (hs.total) line += ', привычки ' + hs.done + ' из ' + hs.total;
    if (day.review && day.review.note) line += '. Заметка: «' + day.review.note + '»';
    $('reviewSummary').textContent = line + '.';
    renderSkillStats();
  }

  /* ───────────────────────── Шторки ───────────────────────── */
  function openSheet(build) {
    var back = $('sheetBackdrop');
    state.lastFocus = document.activeElement;
    back.textContent = '';

    var sheet = el('div', 'sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.appendChild(el('div', 'sheet-handle'));
    build(sheet);

    var title = sheet.querySelector('h2');
    if (title) {
      title.id = 'sheetTitle';
      sheet.setAttribute('aria-labelledby', 'sheetTitle');
    }

    back.appendChild(sheet);
    back.hidden = false;
    document.body.style.overflow = 'hidden';

    var appRoot = document.querySelector('.app');
    if (appRoot) {
      appRoot.inert = true;
      appRoot.setAttribute('aria-hidden', 'true');
    }

    back.onclick = function (e) { if (e.target === back) closeSheet(); };
    document.addEventListener('keydown', onSheetKey);

    var focusable = sheet.querySelector('input:not([type=hidden]), button');
    if (focusable) setTimeout(function () { focusable.focus(); }, 60);
    return sheet;
  }

  function onSheetKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key !== 'Tab') return;

    var sheet = $('sheetBackdrop').querySelector('.sheet');
    if (!sheet) return;
    var nodes = sheet.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), ' +
      'textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!nodes.length) return;

    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function closeSheet() {
    var back = $('sheetBackdrop');
    if (back.hidden) return;
    back.hidden = true;
    back.textContent = '';
    back.onclick = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onSheetKey);

    var appRoot = document.querySelector('.app');
    if (appRoot) {
      appRoot.inert = false;
      appRoot.removeAttribute('aria-hidden');
    }
    if (state.lastFocus && state.lastFocus.focus && state.lastFocus.isConnected !== false) {
      state.lastFocus.focus();
    } else if (state.view) {
      var tab = $('tab-' + state.view);
      if (tab) tab.focus();
    }
  }

  /* ───────────────────────── Редактор задачи ───────────────────────── */
  function openEditor(id, preset) {
    var task = id ? findTask(id) : null;
    var draft = {
      prio: task ? (task.prio || 'med') : ((preset && preset.prio) || 'med'),
      est: task ? estOf(task) : DEFAULT_EST,
      skill: task ? (task.skill || 'other') : (Den.getSettings().lastSkill || 'other'),
      repeat: task ? (task.repeat || '') : ''
    };

    openSheet(function (sheet) {
      var h = el('h2');
      h.textContent = task ? 'Задача' : 'Новая задача';
      sheet.appendChild(h);

      var f1 = el('div', 'field');
      var l1 = el('label');
      l1.setAttribute('for', 'fTitle');
      l1.textContent = 'Что сделать';
      var input = el('input', 'input');
      input.id = 'fTitle';
      input.type = 'text';
      input.maxLength = 200;
      input.value = task ? task.title : '';
      input.placeholder = 'Например: разобрать входящие';
      input.autocomplete = 'off';
      f1.appendChild(l1);
      f1.appendChild(input);
      sheet.appendChild(f1);

      var f2 = el('div', 'field');
      var l2 = el('span', 'field-label');
      l2.textContent = 'Приоритет';
      var seg = el('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Приоритет');
      [['high', 'Высокий'], ['med', 'Средний'], ['low', 'Низкий']].forEach(function (pair) {
        var btn = el('button');
        btn.type = 'button';
        btn.dataset.prio = pair[0];
        btn.textContent = pair[1];
        btn.setAttribute('aria-pressed', draft.prio === pair[0] ? 'true' : 'false');
        btn.onclick = function () {
          draft.prio = pair[0];
          Array.prototype.forEach.call(seg.children, function (b) {
            b.setAttribute('aria-pressed', b.dataset.prio === draft.prio ? 'true' : 'false');
          });
        };
        seg.appendChild(btn);
      });
      f2.appendChild(l2);
      f2.appendChild(seg);
      sheet.appendChild(f2);

      var fSkill = el('div', 'field');
      var lSkill = el('span', 'field-label');
      lSkill.textContent = 'Навык — куда пойдёт опыт';
      var skillChips = el('div', 'chips');
      skillsDoc().items.forEach(function (sk) {
        var chip = el('button', 'chip');
        chip.type = 'button';
        chip.dataset.skill = sk.id;
        chip.textContent = sk.emoji + ' ' + sk.name;
        chip.setAttribute('aria-pressed', draft.skill === sk.id ? 'true' : 'false');
        chip.onclick = function () {
          draft.skill = sk.id;
          Array.prototype.forEach.call(skillChips.children, function (c) {
            c.setAttribute('aria-pressed', c.dataset.skill === draft.skill ? 'true' : 'false');
          });
        };
        skillChips.appendChild(chip);
      });
      fSkill.appendChild(lSkill);
      fSkill.appendChild(skillChips);
      sheet.appendChild(fSkill);

      var fRep = el('div', 'field');
      var lRep = el('span', 'field-label');
      lRep.textContent = 'Повтор';
      var repChips = el('div', 'chips');
      REPEATS.forEach(function (r) {
        var chip = el('button', 'chip');
        chip.type = 'button';
        chip.dataset.repeat = r.id;
        chip.textContent = r.label;
        chip.setAttribute('aria-pressed', draft.repeat === r.id ? 'true' : 'false');
        chip.onclick = function () {
          draft.repeat = r.id;
          Array.prototype.forEach.call(repChips.children, function (c) {
            c.setAttribute('aria-pressed', c.dataset.repeat === draft.repeat ? 'true' : 'false');
          });
        };
        repChips.appendChild(chip);
      });
      fRep.appendChild(lRep);
      fRep.appendChild(repChips);
      sheet.appendChild(fRep);

      var f3 = el('div', 'field');
      var l3 = el('span', 'field-label');
      l3.textContent = 'Сколько времени';
      var chips = el('div', 'chips');
      ESTIMATES.forEach(function (m) {
        var chip = el('button', 'chip');
        chip.type = 'button';
        chip.dataset.est = String(m);
        chip.textContent = m < 60 ? m + ' мин' : (m === 60 ? '1 ч' : (m === 90 ? '1,5 ч' : '2 ч'));
        chip.setAttribute('aria-pressed', draft.est === m ? 'true' : 'false');
        chip.onclick = function () {
          draft.est = m;
          Array.prototype.forEach.call(chips.children, function (c) {
            c.setAttribute('aria-pressed', Number(c.dataset.est) === draft.est ? 'true' : 'false');
          });
        };
        chips.appendChild(chip);
      });
      f3.appendChild(l3);
      f3.appendChild(chips);
      sheet.appendChild(f3);

      var f4 = el('div', 'field');
      var l4 = el('label');
      l4.setAttribute('for', 'fTime');
      l4.textContent = 'Начало (необязательно)';
      var row = el('div', 'row');
      var time = el('input', 'input');
      time.id = 'fTime';
      time.type = 'time';
      time.step = 300;
      time.value = task ? (task.start || '') : ((preset && preset.start) || '');
      var clear = el('button', 'btn ghost tiny');
      clear.type = 'button';
      clear.textContent = 'Без времени';
      clear.onclick = function () { time.value = ''; };
      row.appendChild(time);
      row.appendChild(clear);
      f4.appendChild(l4);
      f4.appendChild(row);
      sheet.appendChild(f4);

      var f5 = el('div', 'field');
      var l5 = el('label');
      l5.setAttribute('for', 'fNote');
      l5.textContent = 'Заметка (необязательно)';
      var note = el('textarea', 'textarea');
      note.id = 'fNote';
      note.value = task ? (task.note || '') : '';
      note.placeholder = 'Детали, ссылки, следующий шаг';
      f5.appendChild(l5);
      f5.appendChild(note);
      sheet.appendChild(f5);

      var actions = el('div', 'sheet-actions');
      var cancel = el('button', 'btn ghost');
      cancel.type = 'button';
      cancel.textContent = 'Отмена';
      cancel.onclick = closeSheet;
      var save = el('button', 'btn primary');
      save.type = 'button';
      save.textContent = task ? 'Сохранить' : 'Добавить';
      save.onclick = commit;
      actions.appendChild(cancel);
      actions.appendChild(save);
      sheet.appendChild(actions);

      function commit() {
        var title = input.value.trim();
        if (!title) { input.focus(); toast('Нужно название'); return; }
        var values = {
          title: title,
          prio: draft.prio,
          est: draft.est,
          start: time.value || '',
          note: note.value.trim(),
          skill: draft.skill,
          repeat: draft.repeat
        };
        Den.setSettings({ lastSkill: values.skill });
        if (task) {
          var found = false;
          mutate(function (d) {
            for (var i = 0; i < d.tasks.length; i++) {
              if (d.tasks[i].id === task.id) {
                d.tasks[i].title = values.title;
                d.tasks[i].prio = values.prio;
                d.tasks[i].est = values.est;
                d.tasks[i].start = values.start;
                d.tasks[i].note = values.note;
                d.tasks[i].skill = values.skill;
                d.tasks[i].repeat = values.repeat;
                d.tasks[i].updatedAt = Date.now();
                found = true;
                return;
              }
            }
          });
          if (!found) { closeSheet(); toast('Задача уже удалена'); return; }
        } else {
          mutate(function (d) {
            d.tasks.push({
              id: Den.newId(),
              title: values.title,
              prio: values.prio,
              est: values.est,
              start: values.start,
              note: values.note,
              skill: values.skill,
              repeat: values.repeat,
              series: Den.newId(),
              done: false,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          });
        }
        closeSheet();
        toast(task ? 'Сохранено' : 'Добавлено');
      }

      input.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
      };
    });
  }

  /* ───────────────────────── Действия над задачей ───────────────────────── */
  function toggleTask(id) {
    var before = findTask(id);
    var becameDone = !!(before && !before.done);
    var finishedTimer = 0;

    mutate(function (day) {
      for (var i = 0; i < day.tasks.length; i++) {
        if (day.tasks[i].id === id) {
          var t = day.tasks[i];
          if (becameDone && t.timerStart) finishedTimer = stopTimer(t);
          t.done = !t.done;
          t.doneAt = t.done ? Date.now() : null;
          t.updatedAt = Date.now();
          return;
        }
      }
    });

    var after = findTask(id);
    if (after) {
      announce('Задача «' + after.title + '» ' + (after.done ? 'выполнена' : 'снова активна'));
      if (becameDone) scheduleRepeat(after, state.date);
    }
    if (finishedTimer) toast('Записано ' + fmtDur(finishedTimer));
  }

  function scheduleRepeat(task, date) {
    if (!task || !task.repeat) return 0;
    var next = nextRepeatDate(date, task.repeat);
    if (!next) return 0;

    var series = task.series || task.id;
    var target = Den.getDay(next);
    var exists = (target.tasks || []).some(function (t) {
      return (t.series || t.id) === series && !t.done;
    });
    if (exists) return 0;

    var copy = JSON.parse(JSON.stringify(task));
    copy.id = Den.newId();
    copy.series = series;
    copy.done = false;
    copy.doneAt = null;
    copy.timerStart = null;
    copy.spent = 0;
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();

    target.tasks.push(copy);
    Den.saveDay(target);
    toast('Следующий раз: ' + shortDate(next));
    return 1;
  }

  function startTaskTimer(id) {
    var running = [];
    Object.keys(Den.allDays()).forEach(function (date) {
      if (!DATE_RE.test(date)) return;
      var day = Den.allDays()[date];
      var touched = false;
      (day.tasks || []).forEach(function (t) {
        if (t.timerStart && t.id !== id) {
          stopTimer(t);
          running.push(t);
          touched = true;
        }
      });
      if (touched) Den.saveMany([day]);
    });

    mutate(function (day) {
      day.tasks.forEach(function (t) {
        if (t.id === id) { t.timerStart = Date.now(); t.updatedAt = Date.now(); }
      });
    });

    toast(running.length ? 'Предыдущий таймер остановлен' : 'Таймер запущен');
  }

  function stopTaskTimer(id) {
    var mins = 0;
    mutate(function (day) {
      day.tasks.forEach(function (t) {
        if (t.id === id) mins = stopTimer(t);
      });
    });
    toast(mins ? 'Записано ' + fmtDur(mins) : 'Таймер не был запущен');
  }

  function removeTask(id) {
    var date = state.date;
    var day = Den.getDay(date);
    var removed = null;

    day.tasks = day.tasks.filter(function (t) {
      if (t.id === id) { removed = t; return false; }
      return true;
    });
    if (!removed) return;

    if (!day.removed) day.removed = {};
    day.removed[id] = Date.now();
    Den.saveDay(day);

    toast('Задача удалена', 'Отменить', function () {
      var back = Den.getDay(date);
      if (!Array.isArray(back.tasks)) back.tasks = [];
      removed.updatedAt = Date.now();
      back.tasks.push(removed);
      if (back.removed) delete back.removed[removed.id];
      Den.saveDay(back);
      toast('Возвращено');
    });
  }

  function moveToTomorrow(id) {
    var day = currentDay();
    var task = null;
    day.tasks = day.tasks.filter(function (t) {
      if (t.id === id) { task = t; return false; }
      return true;
    });
    if (!task) return;

    if (!day.removed) day.removed = {};
    day.removed[id] = Date.now();
    Den.saveDay(day);

    var target = shiftYmd(state.date, 1);
    var next = Den.getDay(target);
    task.id = Den.newId();
    task.start = '';
    task.done = false;
    task.doneAt = null;
    task.updatedAt = Date.now();
    next.tasks.push(task);
    Den.saveDay(next);
    toast('Перенесено на ' + shortDate(target));
  }

  function openActions(id) {
    var task = findTask(id);
    if (!task) return;

    openSheet(function (sheet) {
      var h = el('h2');
      h.textContent = task.title;
      h.style.fontSize = '16.5px';
      sheet.appendChild(h);

      var list = el('div', 'menu-list');

      if (!task.done) {
        if (task.timerStart) {
          list.appendChild(menuItem('i-clock', 'Остановить таймер', function () {
            closeSheet();
            setTimeout(function () { stopTaskTimer(id); }, 100);
          }));
        } else {
          list.appendChild(menuItem('i-clock', 'Запустить таймер', function () {
            closeSheet();
            setTimeout(function () { startTaskTimer(id); }, 100);
          }));
        }
      }

      list.appendChild(menuItem('i-gear', 'Изменить', function () {
        closeSheet();
        setTimeout(function () { openEditor(id); }, 120);
      }));

      if (task.start) {
        list.appendChild(menuItem('i-close', 'Убрать из расписания', function () {
          mutate(function (day) {
            day.tasks.forEach(function (t) {
              if (t.id === id) { t.start = ''; t.updatedAt = Date.now(); }
            });
          });
          closeSheet();
        }));
      }

      list.appendChild(menuItem('i-tomorrow', 'Перенести на завтра', function () {
        closeSheet();
        setTimeout(function () { moveToTomorrow(id); }, 100);
      }));

      var del = menuItem('i-trash', 'Удалить', function () {
        closeSheet();
        setTimeout(function () { removeTask(id); }, 100);
      });
      del.classList.add('danger');
      list.appendChild(del);
      sheet.appendChild(list);

      var actions = el('div', 'sheet-actions');
      var cancel = el('button', 'btn ghost');
      cancel.type = 'button';
      cancel.textContent = 'Закрыть';
      cancel.onclick = closeSheet;
      actions.appendChild(cancel);
      sheet.appendChild(actions);
    });
  }

  function menuItem(iconId, label, onClick) {
    var btn = el('button', 'menu-item');
    btn.type = 'button';
    btn.appendChild(icon(iconId, 18));
    var span = el('span');
    span.textContent = label;
    btn.appendChild(span);
    btn.onclick = onClick;
    return btn;
  }

  /* ───────────────────────── Привычка: редактор ───────────────────────── */
  function habitSheet(id) {
    var doc = habitsDoc();
    var habit = null;
    doc.items.forEach(function (h) { if (h.id === id) habit = h; });

    openSheet(function (sheet) {
      var h = el('h2');
      h.textContent = habit ? 'Привычка' : 'Новая привычка';
      sheet.appendChild(h);

      var hint = el('p', 'hint');
      hint.textContent = 'Маленькое действие, которое повторяется каждый день.';
      sheet.appendChild(hint);

      var f1 = el('div', 'field');
      var l1 = el('label');
      l1.setAttribute('for', 'hName');
      l1.textContent = 'Название';
      var name = el('input', 'input');
      name.id = 'hName';
      name.type = 'text';
      name.maxLength = 80;
      name.value = habit ? habit.name : '';
      name.placeholder = 'Например: не курить';
      name.autocomplete = 'off';
      f1.appendChild(l1);
      f1.appendChild(name);
      sheet.appendChild(f1);

      var f2 = el('div', 'field');
      var l2 = el('label');
      l2.setAttribute('for', 'hTime');
      l2.textContent = 'Время (необязательно)';
      var time = el('input', 'input');
      time.id = 'hTime';
      time.type = 'time';
      time.step = 900;
      time.value = habit ? (habit.time || '') : '';
      f2.appendChild(l2);
      f2.appendChild(time);
      sheet.appendChild(f2);

      var fType = el('div', 'field');
      var lType = el('span', 'field-label');
      lType.textContent = 'Тип';
      var typeSeg = el('div', 'seg');
      typeSeg.setAttribute('role', 'group');
      typeSeg.setAttribute('aria-label', 'Тип привычки');
      var kind = habit ? (habit.kind || 'good') : 'good';
      [['good', 'Полезная'], ['bad', 'Вредная']].forEach(function (pair) {
        var btn = el('button');
        btn.type = 'button';
        btn.dataset.kind = pair[0];
        btn.textContent = pair[1];
        btn.setAttribute('aria-pressed', kind === pair[0] ? 'true' : 'false');
        btn.onclick = function () {
          kind = pair[0];
          Array.prototype.forEach.call(typeSeg.children, function (b) {
            b.setAttribute('aria-pressed', b.dataset.kind === kind ? 'true' : 'false');
          });
          fSk.hidden = kind === 'bad';
        };
        typeSeg.appendChild(btn);
      });
      fType.appendChild(lType);
      fType.appendChild(typeSeg);
      sheet.appendChild(fType);

      var fSk = el('div', 'field');
      var lSk = el('label');
      lSk.setAttribute('for', 'hSkill');
      lSk.textContent = 'Навык — куда пойдёт опыт';
      var skillSel = el('select', 'select');
      skillSel.id = 'hSkill';
      skillsDoc().items.forEach(function (sk) {
        var opt = document.createElement('option');
        opt.value = sk.id;
        opt.textContent = sk.emoji + ' ' + sk.name;
        skillSel.appendChild(opt);
      });
      skillSel.value = habit ? (habit.skill || 'other') : 'other';
      if (kind === 'bad') fSk.hidden = true;
      fSk.appendChild(lSk);
      fSk.appendChild(skillSel);
      sheet.appendChild(fSk);

      var actions = el('div', 'sheet-actions');
      var cancel = el('button', 'btn ghost');
      cancel.type = 'button';
      cancel.textContent = 'Отмена';
      cancel.onclick = closeSheet;
      actions.appendChild(cancel);

      if (habit) {
        var del = el('button', 'btn ghost');
        del.type = 'button';
        del.textContent = 'Удалить';
        del.style.color = 'var(--danger)';
        del.onclick = function () {
          var fresh = habitsDoc();
          fresh.items = fresh.items.filter(function (x) { return x.id !== habit.id; });
          Den.saveDoc(fresh);
          closeSheet();
          toast('Привычка удалена');
        };
        actions.appendChild(del);
      }

      var save = el('button', 'btn primary');
      save.type = 'button';
      save.textContent = habit ? 'Сохранить' : 'Добавить';
      save.onclick = function () {
        var value = name.value.trim();
        if (!value) { name.focus(); toast('Нужно название'); return; }
        var fresh = habitsDoc();
        if (habit) {
          fresh.items.forEach(function (x) {
            if (x.id === habit.id) {
              x.name = value;
              x.time = time.value || '';
              x.skill = skillSel.value;
              x.kind = kind;
            }
          });
        } else {
          fresh.items.push({
            id: Den.newId(),
            name: value,
            time: time.value || '',
            skill: skillSel.value,
            kind: kind,
            checks: {}
          });
        }
        Den.saveDoc(fresh);
        closeSheet();
        toast(habit ? 'Сохранено' : 'Привычка добавлена');
      };
      actions.appendChild(save);
      sheet.appendChild(actions);

      name.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); save.click(); }
      };
    });
  }

  /* ───────────────────────── Навык: редактор ───────────────────────── */
  /* Удаление навыка: его задачи и привычки переводим на «Разное»,
     чтобы опыт не пропал из интерфейса. */
  function reassignSkill(fromId, toId) {
    var map = Den.allDays();
    var touchedDays = [];

    Object.keys(map).forEach(function (date) {
      if (!DATE_RE.test(date)) return;
      var day = map[date];
      if (!Array.isArray(day.tasks)) return;
      var touched = false;
      day.tasks.forEach(function (t) {
        if (t.skill === fromId) { t.skill = toId; touched = true; }
      });
      if (touched) touchedDays.push(day);
    });

    if (touchedDays.length) Den.saveMany(touchedDays);

    var hdoc = habitsDoc();
    var habitsTouched = false;
    hdoc.items.forEach(function (h) {
      if (h.skill === fromId) { h.skill = toId; habitsTouched = true; }
    });
    if (habitsTouched) Den.saveDoc(hdoc);

    return touchedDays.length;
  }

  function skillSheet(id) {
    var doc = skillsDoc();
    var skill = null;
    doc.items.forEach(function (s) { if (s.id === id) skill = s; });

    openSheet(function (sheet) {
      var h = el('h2');
      h.textContent = skill ? 'Навык' : 'Новый навык';
      sheet.appendChild(h);

      var hint = el('p', 'hint');
      hint.textContent = 'Опыт за задачу идёт в её навык и в общий уровень.';
      sheet.appendChild(hint);

      var f1 = el('div', 'field');
      var l1 = el('label');
      l1.setAttribute('for', 'skName');
      l1.textContent = 'Название';
      var name = el('input', 'input');
      name.id = 'skName';
      name.type = 'text';
      name.maxLength = 40;
      name.value = skill ? skill.name : '';
      name.placeholder = 'Например: Музыка';
      name.autocomplete = 'off';
      f1.appendChild(l1);
      f1.appendChild(name);
      sheet.appendChild(f1);

      var f2 = el('div', 'field');
      var l2 = el('label');
      l2.setAttribute('for', 'skEmoji');
      l2.textContent = 'Значок (один символ, необязательно)';
      var emoji = el('input', 'input');
      emoji.id = 'skEmoji';
      emoji.type = 'text';
      emoji.maxLength = 2;
      emoji.value = skill ? skill.emoji : '';
      emoji.placeholder = '🎯';
      f2.appendChild(l2);
      f2.appendChild(emoji);
      sheet.appendChild(f2);

      var actions = el('div', 'sheet-actions');
      var cancel = el('button', 'btn ghost');
      cancel.type = 'button';
      cancel.textContent = 'Отмена';
      cancel.onclick = closeSheet;
      actions.appendChild(cancel);

      if (skill && skill.id !== 'other') {
        var del = el('button', 'btn ghost');
        del.type = 'button';
        del.textContent = 'Удалить';
        del.style.color = 'var(--danger)';
        del.onclick = function () {
          var ok = confirm(
            'Удалить навык «' + skill.name + '»?\n\n' +
            'Задачи и привычки останутся, но перейдут в «Разное» — ' +
            'их опыт сохранится и продолжит считаться.'
          );
          if (!ok) return;

          var moved = reassignSkill(skill.id, 'other');

          var fresh = skillsDoc();
          fresh.items = fresh.items.filter(function (x) { return x.id !== skill.id; });
          Den.saveDoc(fresh);

          closeSheet();
          render();
          toast(moved ? 'Навык удалён, дни перенесены в «Разное»' : 'Навык удалён');
        };
        actions.appendChild(del);
      }

      var save = el('button', 'btn primary');
      save.type = 'button';
      save.textContent = skill ? 'Сохранить' : 'Добавить';
      save.onclick = function () {
        var value = name.value.trim();
        if (!value) { name.focus(); toast('Нужно название'); return; }
        var fresh = skillsDoc();
        var icon = emoji.value.trim() || '🎯';
        if (skill) {
          fresh.items.forEach(function (x) {
            if (x.id === skill.id) { x.name = value; x.emoji = icon; }
          });
        } else {
          fresh.items.push({ id: Den.newId(), name: value, emoji: icon });
        }
        Den.saveDoc(fresh);
        closeSheet();
        render();
        toast(skill ? 'Сохранено' : 'Навык добавлен');
      };
      actions.appendChild(save);
      sheet.appendChild(actions);

      name.onkeydown = function (e) {
        if (e.key === 'Enter') { e.preventDefault(); save.click(); }
      };
    });
  }

  /* ───────────────────────── Поиск ───────────────────────── */
  function openSearch() {
    openSheet(function (sheet) {
      var h = el('h2');
      h.textContent = 'Поиск';
      sheet.appendChild(h);

      var input = el('input', 'input');
      input.type = 'search';
      input.placeholder = 'Название задачи…';
      input.setAttribute('autocomplete', 'off');
      sheet.appendChild(input);

      var list = el('div', 'search-list');
      sheet.appendChild(list);

      var hint = el('p', 'hint');
      hint.textContent = 'Ищет по всем дням. Достаточно двух букв.';

      function draw() {
        list.textContent = '';
        var q = input.value.trim().toLowerCase();
        if (q.length < 2) { list.appendChild(hint); return; }

        var found = [];
        var days = Den.allDays();
        Object.keys(days).forEach(function (date) {
          if (!DATE_RE.test(date)) return;
          (days[date].tasks || []).forEach(function (t) {
            if (String(t.title).toLowerCase().indexOf(q) >= 0) {
              found.push({ date: date, task: t });
            }
          });
        });

        if (!found.length) { list.appendChild(hint); return; }

        found.sort(function (a, b) {
          return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0);
        });

        found.slice(0, 40).forEach(function (row) {
          var btn = el('button', 'search-row');
          btn.type = 'button';

          var date = el('span', 'search-date');
          date.textContent = shortDate(row.date);

          var title = el('span', 'search-title');
          title.textContent = row.task.title;

          btn.appendChild(date);
          btn.appendChild(title);

          if (row.task.done) {
            var mark = el('span', 'search-mark');
            mark.textContent = '✓';
            btn.appendChild(mark);
          }

          btn.onclick = function () {
            closeSheet();
            setDate(row.date);
            setView('day');
          };
          list.appendChild(btn);
        });
      }

      input.oninput = draw;
      draw();
      setTimeout(function () { input.focus(); }, 80);
    });
  }

  /* ───────────────────────── Итоги дня ───────────────────────── */
  function openReview() {
    var day = currentDay();
    var total = day.tasks.length;
    var done = day.tasks.filter(function (t) { return t.done; }).length;
    var minutes = day.tasks.reduce(function (sum, t) { return t.done ? sum + estOf(t) : sum; }, 0);
    var unfinished = day.tasks.filter(function (t) { return !t.done; });
    var hs = habitsStat(state.date);

    openSheet(function (sheet) {
      var h = el('h2');
      h.textContent = 'Итоги дня';
      sheet.appendChild(h);

      var hint = el('p', 'hint');
      hint.textContent = humanDate(state.date);
      sheet.appendChild(hint);

      var grid = el('div', 'stat-grid');
      grid.appendChild(statCard(done + ' из ' + total, 'задач сделано'));
      grid.appendChild(statCard(fmtDur(minutes), 'по оценкам'));
      sheet.appendChild(grid);

      if (hs.total) {
        var habitLine = el('p', 'small-note');
        habitLine.textContent = 'Привычки: ' + hs.done + ' из ' + hs.total + ' отмечено.';
        sheet.appendChild(habitLine);
      }

      if (unfinished.length) {
        var label = el('div', 'field-label');
        label.style.marginTop = '14px';
        label.textContent = 'Осталось (' + unfinished.length + ')';
        sheet.appendChild(label);

        var shortList = el('ul', 'task-list');
        shortList.style.marginTop = '8px';
        unfinished.slice(0, 6).forEach(function (t) {
          var li = el('li', 'task prio-' + (t.prio || 'med'));
          var main = el('div', 'task-main');
          var title = el('span', 'task-title');
          title.textContent = t.title;
          main.appendChild(title);
          li.appendChild(main);
          shortList.appendChild(li);
        });
        sheet.appendChild(shortList);
        if (unfinished.length > 6) {
          var more = el('p', 'small-note');
          more.textContent = 'и ещё ' + (unfinished.length - 6);
          sheet.appendChild(more);
        }
      }

      var f = el('div', 'field');
      f.style.marginTop = '16px';
      var l = el('label');
      l.setAttribute('for', 'fReview');
      l.textContent = 'Заметка о дне';
      var note = el('textarea', 'textarea');
      note.id = 'fReview';
      note.placeholder = 'Что получилось, что мешало, что унести в завтра';
      note.value = (day.review && day.review.note) || '';
      f.appendChild(l);
      f.appendChild(note);
      sheet.appendChild(f);

      var actions = el('div', 'sheet-actions');
      if (unfinished.length) {
        var move = el('button', 'btn ghost');
        move.type = 'button';
        move.textContent = 'Перенести ' + unfinished.length + ' на завтра';
        move.onclick = function () {
          closeSheet();
          setTimeout(function () {
            unfinished.forEach(function (t) { moveToTomorrow(t.id); });
            toast('Незакрытое перенесено');
          }, 120);
        };
        actions.appendChild(move);
      }

      var save = el('button', 'btn primary');
      save.type = 'button';
      save.textContent = 'Сохранить итоги';
      save.onclick = function () {
        mutate(function (d) {
          d.review = { at: Date.now(), note: note.value.trim(), done: done, total: total };
        });
        closeSheet();
        toast('Итоги сохранены');
      };
      actions.appendChild(save);
      sheet.appendChild(actions);
    });
  }

  function statCard(num, caption) {
    var card = el('div', 'stat');
    var n = el('div', 'num');
    n.textContent = num;
    var c = el('div', 'cap');
    c.textContent = caption;
    card.appendChild(n);
    card.appendChild(c);
    return card;
  }

  /* ───────────────────────── Настройки ───────────────────────── */
  function fillTimeOptions(select, fromHour, toHour, step) {
    select.textContent = '';
    for (var m = fromHour * 60; m <= toHour * 60; m += (step || 30)) {
      var opt = document.createElement('option');
      opt.value = fromMin(m);
      opt.textContent = fromMin(m);
      select.appendChild(opt);
    }
  }

  function renderSettings() {
    var s = Den.getSettings();

    if (!$('setDayStart').children.length) {
      fillTimeOptions($('setDayStart'), 0, 23, 60);
      fillTimeOptions($('setDayEnd'), 0, 23, 60);
      fillTimeOptions($('setReviewHour'), 15, 23, 1);
      [0, 5, 10, 15, 30, 60].forEach(function (m) {
        var opt = document.createElement('option');
        opt.value = String(m);
        opt.textContent = m === 0 ? 'В момент начала' : 'За ' + m + ' мин';
        $('setLead').appendChild(opt);
      });
    }

    $('setDayStart').value = s.dayStart;
    $('setDayEnd').value = s.dayEnd;
    $('setReviewHour').value = pad(Number(s.dayReviewHour) || 18) + ':00';
    $('setLead').value = String(s.leadMin);
    $('setTheme').value = s.theme || 'dark';
    $('setNotify').checked = !!s.notify;
    $('setSbUrl').value = s.supabaseUrl || '';
    $('setSbKey').value = s.supabaseAnonKey || '';
    $('setSpace').value = s.space || 'personal';

    updatePermissionHint();
    updateSyncUI();
    renderAuth();
    renderPush();
  }

  function updatePermissionHint() {
    var hint = $('notifyPermHint');
    var perm = $('permState');
    if (!('Notification' in window)) {
      hint.textContent = 'браузер не поддерживает';
      perm.textContent = 'Недоступно';
      $('askNotify').disabled = true;
      return;
    }
    var p = Notification.permission;
    perm.textContent = p === 'granted' ? 'Разрешено'
      : (p === 'denied' ? 'Запрещено в настройках' : 'Не запрошено');
    hint.textContent = p === 'denied'
      ? 'включи уведомления для сайта в настройках'
      : 'по времени начала задачи';
    $('askNotify').disabled = p === 'granted';
  }

  function applyTheme() {
    var theme = Den.getSettings().theme || 'dark';
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }

  var lastSyncStatus = '';

  function updateSyncUI() {
    var st = Den.status();
    ['syncDot', 'syncDot2'].forEach(function (id) {
      var node = $(id);
      if (node) node.dataset.state = st;
    });

    var text = {
      off: 'Локальный режим',
      ok: 'Синхронизировано',
      pending: 'Ждёт отправки',
      error: 'Ошибка синхронизации'
    }[st] || '';

    var dot = $('syncDot');
    if (dot) dot.setAttribute('aria-label', 'Синхронизация: ' + (text || 'локальный режим'));

    if (st !== lastSyncStatus) {
      lastSyncStatus = st;
      if (st === 'error' || st === 'ok') announce('Синхронизация: ' + text);
    }

    var msg = $('syncMsg');
    if (msg && !Den.storageOk()) {
      msg.textContent = 'Браузер не сохраняет данные — проверь приватный режим';
      return;
    }
    if (msg) {
      msg.textContent = text;
      if (st === 'error') {
        var err = Den.lastError();
        if (err) msg.textContent = text + ': ' + err;
      }
    }
  }

  /* ───────────────────────── Аккаунт и push ───────────────────────── */
  function renderAuth() {
    var session = Den.getSession();
    var signedIn = !!(session && session.access_token);
    $('authSignedOut').hidden = signedIn;
    $('authSignedIn').hidden = !signedIn;
    if (signedIn) {
      $('authEmailLabel').textContent = session.email || 'выполнен вход';
    }
  }

  function renderPush() {
    var enabled = !!Den.getSettings().push;
    var supported = 'serviceWorker' in navigator && 'PushManager' in window;
    var msg = $('pushMsg');
    var dot = $('pushDot');
    $('setPush').checked = enabled;

    if (!supported) {
      dot.dataset.state = 'off';
      msg.textContent = 'Браузер не поддерживает push';
      $('setPush').disabled = true;
      return;
    }

    if (!enabled) {
      dot.dataset.state = 'off';
      msg.textContent = 'Не включено';
      return;
    }

    dot.dataset.state = 'ok';
    var granted = (typeof Notification !== 'undefined') && Notification.permission === 'granted';
    msg.textContent = 'Включено · ' + (granted ? 'разрешено' : 'нет разрешения');
  }

  function urlBase64ToUint8Array(base64) {
    var padding = '='.repeat((4 - (base64.length % 4)) % 4);
    var normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(normalized);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function savePushSub(subscription) {
    var json = subscription.toJSON();
    return Den.savePushSub([{
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
      lead_min: Number(Den.getSettings().leadMin) || 5,
      space: Den.getSettings().space || 'personal'
    }]);
  }

  function enablePush() {
    var vapid = Den.getSettings().vapidPublicKey;
    if (!vapid) { toast('Нет VAPID-ключа в config.js'); return Promise.resolve(false); }
    if (!Den.remoteReady()) { toast('Сначала подключи Supabase'); return Promise.resolve(false); }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast('Браузер не умеет push');
      return Promise.resolve(false);
    }

    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('разрешение не выдано');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (existing) {
        if (existing) return existing;
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid)
        });
      });
    }).then(function (subscription) {
      return savePushSub(subscription);
    }).then(function () {
      Den.setSettings({ push: true });
      renderPush();
      toast('Push включён');
      return true;
    }).catch(function (err) {
      Den.setSettings({ push: false });
      renderPush();
      toast('Не удалось: ' + (err && err.message ? err.message : 'ошибка'));
      return false;
    });
  }

  function disablePush() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (!sub) return null;
      return sub.unsubscribe();
    }).catch(function () {}).then(function () {
      Den.setSettings({ push: false });
      renderPush();
      toast('Push выключен');
    });
  }

  /* ───────────────────────── Напоминания ───────────────────────── */
  function reminderKey(date) { return 'den.notified.' + date; }

  function readNotified(date) {
    try {
      var list = JSON.parse(localStorage.getItem(reminderKey(date)) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function notifySimple(title, body, tag) {
    var opts = { body: body, tag: tag || 'den' };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) {
        if (reg && reg.showNotification) reg.showNotification(title, opts);
        else new Notification(title, opts);
      }).catch(function () {
        try { new Notification(title, opts); } catch (e) {}
      });
      return;
    }
    try { new Notification(title, opts); } catch (e) {}
  }

  function notifyTask(task) {
    var title = 'Скоро: ' + task.title;
    var opts = { body: 'Начало в ' + task.start, tag: 'den-' + task.id };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) {
        if (reg && reg.showNotification) reg.showNotification(title, opts);
        else new Notification(title, opts);
      }).catch(function () {
        try { new Notification(title, opts); } catch (e) {}
      });
      return;
    }
    try { new Notification(title, opts); } catch (e) {}
  }

  function writeNotified(date, list) {
    try { localStorage.setItem(reminderKey(date), JSON.stringify(list)); } catch (e) {}
  }

  function tickReminders() {
    var s = Den.getSettings();
    if (!s.notify) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    var today = todayStr();
    var day = Den.getDay(today);
    var notified = readNotified(today);
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var changed = false;

    day.tasks.forEach(function (t) {
      if (!t.start || t.done) return;
      if (notified.indexOf(t.id) >= 0) return;
      var at = toMin(t.start) - (s.leadMin || 0);
      if (nowMin >= at && nowMin <= at + 90) {
        notifyTask(t);
        notified.push(t.id);
        changed = true;
      } else if (nowMin > at + 90) {
        notified.push(t.id);
        changed = true;
      }
    });

    if (changed) writeNotified(today, notified);
  }

  function decayKey() { return 'den.decay.notified'; }

  function readDecaySeen() {
    try {
      var data = JSON.parse(localStorage.getItem(decayKey()) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (e) { return {}; }
  }

  function writeDecaySeen(data) {
    try { localStorage.setItem(decayKey(), JSON.stringify(data)); } catch (e) {}
  }

  function checkDecay() {
    var xp = xpSummary();
    if (!xp.idlePenalties.length) return;

    var today = todayStr();
    var seen = readDecaySeen();
    var changed = false;
    var fresh = [];

    xp.idlePenalties.forEach(function (row) {
      if (seen[row.id] === today) return;
      seen[row.id] = today;
      changed = true;
      fresh.push(row);
    });

    if (changed) writeDecaySeen(seen);

    fresh.forEach(function (row) {
      var sk = skillById(row.id);
      var days = row.idle + ' ' + plural(row.idle, 'день', 'дня', 'дней');
      var text = sk.name + ': −' + fmtXp(row.penalty) + ' XP за ' + days + ' без занятий';

      if (Den.getSettings().notify && 'Notification' in window && Notification.permission === 'granted') {
        notifySimple('Опыт понижен', text, 'den-decay-' + row.id);
      }
      toast('Опыт понижен: ' + sk.name + ' −' + fmtXp(row.penalty));
    });
  }

  function askPermission() {
    if (!('Notification' in window)) { toast('Браузер не умеет уведомления'); return; }
    Notification.requestPermission().then(function (p) {
      updatePermissionHint();
      if (p === 'granted') {
        Den.setSettings({ notify: true });
        renderSettings();
        toast('Уведомления включены');
      } else {
        toast('Разрешение не выдано');
      }
    }).catch(function () { toast('Не удалось запросить разрешение'); });
  }

  /* ───────────────────────── Экспорт ───────────────────────── */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  function exportJson() {
    download('moy-den-' + todayStr() + '.json',
      JSON.stringify(Den.exportAll(), null, 2), 'application/json');
    toast('Файл сохранён');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var count = Den.importAll(JSON.parse(String(reader.result)));
        toast('Импортировано дней: ' + count);
      } catch (e) {
        toast(e.message || 'Не удалось прочитать файл');
      }
    };
    reader.onerror = function () { toast('Не удалось прочитать файл'); };
    reader.readAsText(file);
  }

  function icsEscape(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  function stamp(date) {
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
      'T' + pad(date.getHours()) + pad(date.getMinutes()) + '00';
  }

  function stampUtc(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function foldLine(line) {
    if (line.length <= 74) return line;
    var out = [];
    var i = 0;
    while (i < line.length) {
      var chunk = line.substr(i, i === 0 ? 74 : 73);
      out.push((i === 0 ? '' : ' ') + chunk);
      i += chunk.length;
    }
    return out.join('\r\n');
  }

  function exportIcs() {
    var date = shiftYmd(todayStr(), 1);
    var day = Den.getDay(date);
    var tasks = day.tasks.filter(function (t) { return !!t.start; });
    if (!tasks.length) { toast('На завтра нет задач со временем'); return; }

    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moy Den//Planner//RU', 'CALSCALE:GREGORIAN'];

    tasks.forEach(function (t) {
      var base = parseYmd(date);
      var startMin = toMin(t.start);
      var start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, startMin, 0);
      var end = new Date(start.getTime() + estOf(t) * 60000);
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + t.id + '@moy-den');
      lines.push('DTSTAMP:' + stampUtc(new Date()));
      lines.push('DTSTART:' + stamp(start));
      lines.push('DTEND:' + stamp(end));
      lines.push('SUMMARY:' + icsEscape(t.title));
      if (t.note) lines.push('DESCRIPTION:' + icsEscape(t.note));
      lines.push('BEGIN:VALARM');
      lines.push('TRIGGER:-PT10M');
      lines.push('ACTION:DISPLAY');
      lines.push('DESCRIPTION:' + icsEscape(t.title));
      lines.push('END:VALARM');
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    download('moy-den-' + date + '.ics', lines.map(foldLine).join('\r\n'), 'text/calendar;charset=utf-8');
    toast('Календарь на завтра сохранён');
  }

  /* ───────────────────────── Навигация ───────────────────────── */
  var VIEWS = ['day', 'habits', 'week', 'stats', 'settings'];

  function setView(view) {
    state.view = view;
    VIEWS.forEach(function (key) {
      var page = $('page-' + key);
      var tab = $('tab-' + key);
      var active = key === view;
      page.hidden = !active;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelector('.quickadd').hidden = view !== 'day';

    if (view === 'habits') renderHabits();
    if (view === 'week') renderWeek();
    if (view === 'stats') renderStats();
    if (view === 'settings') renderSettings();
  }

  function setDate(date) {
    state.date = date;
    renderDay();
    announce('Открыт ' + humanDate(date));
    if (state.view === 'stats') renderStats();
  }

  /* ───────────────────────── События ───────────────────────── */
  function bind() {
    $('prevDay').onclick = function () { setDate(shiftYmd(state.date, -1)); };
    $('nextDay').onclick = function () { setDate(shiftYmd(state.date, 1)); };
    $('todayBtn').onclick = function () { setDate(todayStr()); };

    $('taskList').addEventListener('click', onTaskAreaClick);
    $('blocks').addEventListener('click', onTaskAreaClick);

    $('timeline').addEventListener('click', function (e) {
      var hour = e.target.closest ? e.target.closest('.hour') : null;
      if (!hour) return;
      var min = Number(hour.dataset.min) || toMin(Den.getSettings().dayStart);
      openEditor(null, { start: fromMin(min) });
    });

    $('quickForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('quickInput');
      var title = input.value.trim();
      if (!title) { input.focus(); return; }
      mutate(function (day) {
        day.tasks.push({
          id: Den.newId(), title: title, prio: 'med', est: DEFAULT_EST,
          start: '', note: '', done: false, createdAt: Date.now(),
          updatedAt: Date.now(),
          skill: Den.getSettings().lastSkill || 'other'
        });
      });
      input.value = '';
      input.focus();
      toast('Добавлено');
    });

    $('reviewBtn').onclick = openReview;
    $('reviewOpen').onclick = openReview;

    $('authSend').onclick = function () {
      var email = $('authEmail').value.trim();
      if (!email || email.indexOf('@') < 0) { toast('Нужна почта'); return; }
      toast('Отправляю ссылку…');
      Den.signIn(email).then(function () {
        toast('Письмо отправлено — открой ссылку в этом браузере');
      }).catch(function (err) {
        toast('Ошибка: ' + (err && err.message ? err.message : 'не вышло'));
      });
    };

    $('authSignOut').onclick = function () {
      Den.signOut();
      renderAuth();
      toast('Вы вышли');
    };

    $('setPush').onchange = function () {
      if (this.checked) enablePush();
      else disablePush();
    };

    $('addHabit').onclick = function () { habitSheet(); };
    $('addSkill').onclick = function () { skillSheet(); };

    $('habitPrev').onclick = function () {
      state.habitWeek = shiftYmd(state.habitWeek, -7);
      renderHabits();
    };
    $('habitNext').onclick = function () {
      state.habitWeek = shiftYmd(state.habitWeek, 7);
      renderHabits();
    };
    $('habitToday').onclick = function () {
      state.habitWeek = mondayOf(todayStr());
      renderHabits();
    };

    $('weekPrev').onclick = function () {
      state.weekStart = shiftYmd(state.weekStart, -7);
      renderWeek();
    };
    $('weekNext').onclick = function () {
      state.weekStart = shiftYmd(state.weekStart, 7);
      renderWeek();
    };
    $('weekToday').onclick = function () {
      state.weekStart = mondayOf(todayStr());
      renderWeek();
    };

    $('weekGrid').addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.day-card') : null;
      if (!card) return;
      setDate(card.dataset.date);
      setView('day');
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      setTimeout(function () { $('quickInput').focus(); }, 220);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-goto]'), function (btn) {
      btn.onclick = function () {
        var target = btn.dataset.goto;
        setView(target);
        $('tab-' + target).focus();
      };
    });

    $('goSettings').onclick = function () { setView('settings'); };

    $('syncDot').onclick = function () {
      if (!Den.remoteReady()) { setView('settings'); $('setSbUrl').focus(); return; }
      toast('Синхронизация…');
      Den.syncNow().then(function (ok) { toast(ok ? 'Готово' : 'Не удалось синхронизировать'); });
    };

    VIEWS.forEach(function (key) {
      var tab = $('tab-' + key);
      tab.onclick = function () {
        setView(key);
        var page = $('page-' + key);
        if (page && page.focus) {
          try { page.focus({ preventScroll: true }); } catch (err) { page.focus(); }
        }
      };
      tab.addEventListener('keydown', function (e) {
        var idx = VIEWS.indexOf(key);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          var next = VIEWS[(idx + 1) % VIEWS.length];
          setView(next);
          $('tab-' + next).focus();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          var prev = VIEWS[(idx + VIEWS.length - 1) % VIEWS.length];
          setView(prev);
          $('tab-' + prev).focus();
        }
        if (e.key === 'Home') {
          e.preventDefault();
          setView(VIEWS[0]);
          $('tab-' + VIEWS[0]).focus();
        }
        if (e.key === 'End') {
          e.preventDefault();
          var lastView = VIEWS[VIEWS.length - 1];
          setView(lastView);
          $('tab-' + lastView).focus();
        }
      });
    });

    $('setDayStart').onchange = function () { Den.setSettings({ dayStart: this.value }); renderDay(); };
    $('setDayEnd').onchange = function () { Den.setSettings({ dayEnd: this.value }); renderDay(); };
    $('setReviewHour').onchange = function () {
      Den.setSettings({ dayReviewHour: Number(String(this.value).split(':')[0]) });
      renderDay();
    };
    $('setLead').onchange = function () { Den.setSettings({ leadMin: Number(this.value) }); };
    $('setTheme').onchange = function () { Den.setSettings({ theme: this.value }); applyTheme(); };
    $('setNotify').onchange = function () {
      Den.setSettings({ notify: this.checked });
      if (this.checked) askPermission();
    };
    $('askNotify').onclick = askPermission;

    $('saveSb').onclick = function () {
      var url = $('setSbUrl').value.trim();
      var key = $('setSbKey').value.trim();
      var space = $('setSpace').value.trim() || 'personal';
      if (!url || !key) { toast('Нужны URL и ключ'); return; }
      if (!/^https?:\/\//i.test(url)) { toast('URL должен начинаться с https://'); return; }
      if (/^sb_secret_/i.test(key)) {
        toast('Это секретный ключ — в браузер его нельзя. Нужен publishable');
        return;
      }
      Den.setSettings({ supabaseUrl: url, supabaseAnonKey: key, space: space });
      toast('Подключаюсь…');
      Den.syncNow().then(function (ok) {
        toast(ok ? 'Синхронизация работает' : 'Проверь ключи и таблицу days');
        updateSyncUI();
      });
    };

    $('clearSb').onclick = function () {
      Den.setSettings({ supabaseUrl: '', supabaseAnonKey: '' });
      renderSettings();
      toast('Локальный режим');
    };

    $('exportJson').onclick = exportJson;
    $('exportIcs').onclick = exportIcs;
    $('importJson').onclick = function () { $('fileImport').click(); };
    $('fileImport').onchange = function () {
      if (this.files && this.files[0]) importJson(this.files[0]);
      this.value = '';
    };
    $('resetAll').onclick = function () {
      if (confirm('Удалить все дни из этого браузера? Данные в Supabase останутся.')) {
        Den.clearAll();
        renderDay();
        toast('Локальные данные удалены');
      }
    };

    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        if ($('sheetBackdrop').hidden) openSearch();
        return;
      }

      if (!$('sheetBackdrop').hidden) return;
      if (typing) return;

      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openEditor(); return; }
      if (e.key === '/') { e.preventDefault(); openSearch(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setDate(shiftYmd(state.date, -1)); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); setDate(shiftYmd(state.date, 1)); return; }
      if (e.key === 't' || e.key === 'T') { setDate(todayStr()); return; }
      if (e.key >= '1' && e.key <= '5') { setView(VIEWS[Number(e.key) - 1]); return; }
    });

    $('printView').onclick = function () { window.print(); };

    /* перетаскивание блоков мышью */
    $('blocks').addEventListener('pointerdown', function (event) {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      var block = event.target.closest ? event.target.closest('.block') : null;
      if (!block) return;

      var id = block.dataset.id;
      var startY = event.clientY;
      var origTop = parseFloat(block.style.top) || 0;
      var moved = false;
      var hour = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 56;
      var pxPerMin = hour / 60;

      function onMove(ev) {
        var dy = ev.clientY - startY;
        if (!moved && Math.abs(dy) < 5) return;
        moved = true;
        block.style.top = Math.max(0, origTop + dy) + 'px';
        block.style.cursor = 'grabbing';
      }

      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        block.style.cursor = '';
        if (!moved) return;

        state.dragged = true;
        var newTop = parseFloat(block.style.top) || 0;
        var mins = toMin(Den.getSettings().dayStart) + Math.round(newTop / pxPerMin / 15) * 15;
        mins = Math.max(0, Math.min(23 * 60 + 45, mins));

        mutate(function (day) {
          day.tasks.forEach(function (t) {
            if (t.id === id) { t.start = fromMin(mins); t.updatedAt = Date.now(); }
          });
        });
        toast('Перенесено на ' + fromMin(mins));
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    window.addEventListener('scroll', function () {
      $('appbar').classList.toggle('is-scrolled', window.scrollY > 4);
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        tickReminders();
        checkDecay();
        if (Den.remoteReady()) Den.syncNow();
        render();
      }
    });

    window.addEventListener('online', function () {
      if (Den.remoteReady()) Den.syncNow();
    });

    window.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf('den.') !== 0) return;
      Den.load();
      applyTheme();
      render();
    });

    window.addEventListener('focus', function () {
      if (Den.remoteReady() && Den.dirtyCount() === 0) Den.syncNow();
    });
  }

  function onTaskAreaClick(e) {
    if (state.dragged) { state.dragged = false; return; }
    var node = e.target.closest ? e.target.closest('.task, .block') : null;
    if (!node) return;
    var id = node.dataset.id;
    var action = e.target.closest('[data-act]');
    var act = action ? action.dataset.act : '';
    if (act === 'toggle') { e.stopPropagation(); toggleTask(id); return; }
    if (act === 'more') { e.stopPropagation(); openActions(id); return; }
    openEditor(id);
  }

  /* ───────────────────────── Старт ───────────────────────── */
  function render() {
    var active = document.activeElement;
    var key = active && active.getAttribute ? active.getAttribute('data-fkey') : '';
    try {
      renderSafe();
    } catch (err) {
      console.error(err);
      if (!render.failed) {
        render.failed = true;
        toast('Что-то пошло не так — обнови приложение');
      }
    }
    if (key) {
      var again = document.querySelector('[data-fkey="' + key + '"]');
      if (again && again !== document.activeElement) {
        try { again.focus({ preventScroll: true }); } catch (err) { again.focus(); }
      }
    }
  }

  function renderSafe() {
    renderDay();
    if (state.view === 'habits') renderHabits();
    if (state.view === 'week') renderWeek();
    if (state.view === 'stats') renderStats();
  }

  function tickClock() {
    var t = todayStr();
    var editing = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');

    if (t !== state.lastToday) {
      var followedDay = state.date === state.lastToday;
      var followedHabits = state.habitWeek === mondayOf(state.lastToday);
      var followedWeek = state.weekStart === mondayOf(state.lastToday);
      state.lastToday = t;
      if (followedDay) state.date = t;
      if (followedHabits) state.habitWeek = mondayOf(t);
      if (followedWeek) state.weekStart = mondayOf(t);
      if (!editing) render();
      return;
    }

    if (state.date === t && !editing) renderDay();
  }

  function registerSw() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  function init() {
    state.date = todayStr();
    state.lastToday = todayStr();
    state.habitWeek = mondayOf(state.date);
    state.weekStart = mondayOf(state.date);

    applyTheme();
    bind();
    renderSettings();
    render();

    state.timer = setInterval(function () {
      tickClock();
      tickReminders();
    }, 30000);

    Den.onChange(function () {
      if (document.activeElement && document.activeElement.id === 'quickInput') return;
      render();
    });

    registerSw();
    checkDecay();

    if (Den.consumeAuthHash()) {
      Den.fetchProfile()
        .then(function () { return Den.claimLegacyRows(); })
        .then(function (claimed) {
          if (claimed) toast('Вход выполнен, перенесено дней: ' + claimed);
          else toast('Вход выполнен');
          renderAuth();
          renderSettings();
          return Den.syncNow();
        })
        .catch(function () {});
    }

    if (Den.remoteReady()) Den.syncNow();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
