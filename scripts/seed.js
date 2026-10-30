/* Только для локального предпросмотра: наполняет демо-данными. */
(function () {
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function shift(date, n) {
    var d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  function today() { return ymd(new Date()); }

  var t = today();
  var habits = Den.getDoc('habits', { items: [] });
  habits.items = [
    { id: 'h1', name: 'не курить', time: '09:00', checks: {} },
    { id: 'h2', name: 'ходить в зал', time: '13:00', checks: {} },
    { id: 'h3', name: 'готовить', time: '', checks: {} },
    { id: 'h4', name: 'читать 20 минут', time: '21:30', checks: {} }
  ];
  habits.items[0].checks[shift(t, -3)] = true;
  habits.items[0].checks[shift(t, -2)] = true;
  habits.items[0].checks[t] = true;
  habits.items[1].checks[shift(t, -1)] = true;
  habits.items[3].checks[t] = true;
  habits.items[3].checks[shift(t, -1)] = true;
  Den.saveDoc(habits);

  function seed(date, tasks) {
    var day = Den.getDay(date);
    day.tasks = tasks.map(function (x, i) {
      return {
        id: date + '-' + i,
        title: x[0],
        start: x[1] || '',
        est: x[2] || 30,
        prio: x[3] || 'med',
        done: !!x[4],
        note: '',
        createdAt: Date.now() - i * 1000
      };
    });
    Den.saveDay(day);
  }

  seed(t, [
    ['Разобрать входящие', '09:00', 30, 'high', true],
    ['Созвон с командой', '11:00', 45, 'med', true],
    ['План на неделю', '13:30', 60, 'high', false],
    ['Прогулка', '18:00', 45, 'low', false],
    ['Купить продукты', '', 45, 'med', false],
    ['Позвонить в сервис', '', 15, 'low', false]
  ]);

  seed(shift(t, -1), [
    ['Отчёт за квартал', '10:00', 90, 'high', true],
    ['Спортзал', '19:00', 60, 'med', true],
    ['Ответить на письма', '', 30, 'low', false]
  ]);

  seed(shift(t, -2), [
    ['Ревью макетов', '12:00', 45, 'med', true],
    ['Сходить к врачу', '16:00', 60, 'high', true]
  ]);

  seed(shift(t, 1), [
    ['Черновик презентации', '10:00', 90, 'high', false],
    ['Позвонить маме', '20:00', 15, 'low', false]
  ]);

  function activate() {
    var target = (location.hash || '#day').slice(1);
    var tab = document.getElementById('tab-' + target);
    if (tab) tab.click();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate);
  else setTimeout(activate, 0);
})();
