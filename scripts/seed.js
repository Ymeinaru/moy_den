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
    { id: 'h1', name: 'не курить', time: '09:00', skill: 'other', checks: {} },
    { id: 'h2', name: 'ходить в зал', time: '13:00', skill: 'sport', checks: {} },
    { id: 'h3', name: 'готовить', time: '', skill: 'cook', checks: {} },
    { id: 'h4', name: 'читать 20 минут', time: '21:30', skill: 'rest', checks: {} }
  ];
  habits.items[0].checks[shift(t, -3)] = true;
  habits.items[0].checks[shift(t, -2)] = true;
  habits.items[0].checks[t] = true;
  habits.items[1].checks[shift(t, -1)] = true;
  habits.items[3].checks[t] = true;
  habits.items[3].checks[shift(t, -1)] = true;

  habits.items.push({ id: 'h5', name: 'выпил', time: '', kind: 'bad', skill: 'other', checks: {} });
  habits.items[4].checks[t] = true;
  habits.items[4].checks[shift(t, -1)] = true;

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
        skill: x[5] || 'other',
        note: '',
        createdAt: Date.now() - i * 1000
      };
    });
    Den.saveDay(day);
  }

  seed(t, [
    ['Разобрать входящие', '09:00', 30, 'high', true, 'work'],
    ['Созвон с командой', '11:00', 45, 'med', true, 'work'],
    ['Приготовить ужин', '19:30', 60, 'med', true, 'cook'],
    ['План на неделю', '13:30', 60, 'high', false, 'work'],
    ['Прогулка', '18:00', 45, 'low', false, 'sport'],
    ['Купить продукты', '', 45, 'med', false, 'home'],
    ['Позвонить в сервис', '', 15, 'low', false, 'home']
  ]);

  seed(shift(t, -1), [
    ['Отчёт за квартал', '10:00', 90, 'high', true, 'work'],
    ['Спортзал', '19:00', 60, 'med', true, 'sport'],
    ['Ответить на письма', '', 30, 'low', false, 'work']
  ]);

  seed(shift(t, -2), [
    ['Ревью макетов', '12:00', 45, 'med', true, 'work'],
    ['Сходить к врачу', '16:00', 60, 'high', true, 'home']
  ]);

  // давно без занятий — должно включиться понижение опыта
  seed(shift(t, -6), [
    ['Курс английского', '20:00', 60, 'med', true, 'study'],
    ['Готовка на неделю', '12:00', 120, 'low', true, 'cook']
  ]);

  seed(shift(t, -7), [
    ['Урок английского', '19:00', 60, 'med', true, 'study']
  ]);

  seed(shift(t, 1), [
    ['Черновик презентации', '10:00', 90, 'high', false, 'work'],
    ['Позвонить маме', '20:00', 15, 'low', false, 'home']
  ]);

  function activate() {
    var target = (location.hash || '#day').slice(1);
    var tab = document.getElementById('tab-' + target);
    if (tab) tab.click();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate);
  else setTimeout(activate, 0);
})();
