(() => {
  const shortDayNames = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  const dayInMilliseconds = 24 * 60 * 60 * 1000;
  const greenWeekMonday = Date.UTC(2026, 7, 24) / dayInMilliseconds;

  let schedule = window.EMBEDDED_SCHEDULE;
  let weekType = 'white';
  let selectedDay = 1;
  let selectionIsAutomatic = true;

  function timeToMinutes(value) {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  function escapeHtml(value) {
    const entities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
    return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
  }

  function activeLessons() {
    return schedule.lessons
      .filter(row => row[weekType])
      .map(row => ({...row, lesson: row[weekType]}));
  }

  function weekTypeForDate(date) {
    const calendarDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / dayInMilliseconds;
    const monday = calendarDay - ((date.getDay() + 6) % 7);
    const weeksFromAnchor = Math.round((monday - greenWeekMonday) / 7);
    return Math.abs(weeksFromAnchor % 2) === 0 ? 'green' : 'white';
  }

  function selectCurrentDate() {
    const today = new Date();
    weekType = weekTypeForDate(today);
    selectedDay = today.getDay();
    selectionIsAutomatic = true;
    localStorage.setItem('scheduleWeek', weekType);
  }

  function currentAndNextLessons() {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const ordered = [];

    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      const date = new Date(now.getTime() + dayOffset * dayInMilliseconds);
      const dateWeekType = weekTypeForDate(date);
      schedule.lessons
        .filter(row => row.day === date.getDay() && row[dateWeekType])
        .forEach(row => ordered.push({...row, dayOffset, lesson: row[dateWeekType]}));
    }

    const current = ordered.find(row =>
      row.dayOffset === 0 &&
      timeToMinutes(row.start) <= currentTime &&
      currentTime <= timeToMinutes(row.end)
    ) || null;

    let next = ordered.find(row =>
      row.dayOffset > 0 || (row.dayOffset === 0 && timeToMinutes(row.start) > currentTime)
    ) || null;

    if (current) next = ordered[ordered.indexOf(current) + 1] || next;
    return {current, next};
  }

  function summaryCard(row, state, label) {
    if (!row) {
      return `<article class="now-card ${state}"><small>${label}</small><strong>—</strong></article>`;
    }
    return `<article class="now-card ${state}"><small>${label} · ${shortDayNames[row.day]} ${row.start}</small><strong>${escapeHtml(row.lesson.title)}</strong><div><span class="room">ауд. ${escapeHtml(row.lesson.room)}</span><span>${escapeHtml(row.lesson.type)}</span></div></article>`;
  }

  function renderSummary() {
    const {current, next} = currentAndNextLessons();
    const routeLesson = row => row ? {
      day: row.day,
      time: row.start,
      end: row.end,
      title: row.lesson.title,
      room: row.lesson.room
    } : null;
    window.SCHEDULE_ROUTE = {current: routeLesson(current), next: routeLesson(next)};
    document.getElementById('nowStrip').innerHTML =
      summaryCard(current, 'current', 'Сейчас') + summaryCard(next, 'next', 'Следующая');
  }

  function renderDayButtons() {
    const lessons = activeLessons();
    document.getElementById('daySwitcher').innerHTML = [1, 2, 3, 4, 5, 6, 0]
      .map(day => {
        const lessonCount = lessons.filter(row => row.day === day).length;
        const activeClass = day === selectedDay ? 'active' : '';
        return `<button type="button" class="day-button ${activeClass}" data-day="${day}"><b>${shortDayNames[day]}</b><span>${lessonCount} пар</span></button>`;
      })
      .join('');

    document.querySelectorAll('.day-button').forEach(button => {
      button.addEventListener('click', () => {
        selectedDay = Number(button.dataset.day);
        selectionIsAutomatic = false;
        render();
      });
    });
  }

  function cardState(row, index, rows) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const isCurrent = row.day === now.getDay() &&
      timeToMinutes(row.start) <= currentTime &&
      currentTime <= timeToMinutes(row.end);
    if (isCurrent) return ['current', 'сейчас'];

    const isNextToday = row.day === now.getDay() &&
      timeToMinutes(row.start) > currentTime &&
      !rows.slice(0, index).some(item => timeToMinutes(item.start) > currentTime);
    const isFirstOnUpcomingDay = selectionIsAutomatic && selectedDay !== now.getDay() && index === 0;
    if (isNextToday || isFirstOnUpcomingDay) return ['next', 'следующая'];

    return ['', `${index + 1} пара`];
  }

  function renderLessonCards() {
    const rows = activeLessons()
      .filter(row => row.day === selectedDay)
      .sort((first, second) => timeToMinutes(first.start) - timeToMinutes(second.start));
    const container = document.getElementById('lessonCards');

    if (!rows.length) {
      container.innerHTML = '<article class="lesson-card empty"><strong>Пар нет</strong></article>';
      return;
    }

    container.innerHTML = rows.map((row, index) => {
      const [state, label] = cardState(row, index, rows);
      const lesson = row.lesson;
      const groups = escapeHtml((lesson.groups || []).join(', '));
      const teacher = lesson.teacher ? `<p class="lesson-teacher">${escapeHtml(lesson.teacher)}</p>` : '';
      return `<article class="lesson-card ${state}"><div class="lesson-top"><div class="lesson-time">${row.start} <span>—</span> ${row.end}</div><span class="lesson-state">${label}</span></div><h2>${escapeHtml(lesson.title)}</h2>${teacher}<div class="lesson-meta"><span class="meta-pill room">ауд. ${escapeHtml(lesson.room)}</span><span class="meta-pill type">${escapeHtml(lesson.type)}</span><span class="meta-pill">${groups}</span></div></article>`;
    }).join('');
  }

  function render() {
    window.SCHEDULE_STATE = {weekType, selectedDay};
    document.querySelectorAll('.week-button').forEach(button => {
      button.classList.toggle('active', button.dataset.week === weekType);
    });
    renderSummary();
    renderDayButtons();
    renderLessonCards();
  }

  function showLoadError(error) {
    console.error('Не удалось загрузить schedule.json', error);
    document.getElementById('lessonCards').innerHTML =
      '<div class="schedule-error"><strong>Не удалось загрузить расписание</strong></div>';
  }

  document.querySelectorAll('.week-button').forEach(button => {
    button.addEventListener('click', () => {
      weekType = button.dataset.week;
      localStorage.setItem('scheduleWeek', weekType);
      selectionIsAutomatic = false;
      render();
    });
  });

  selectCurrentDate();
  render();

  if (window.location.protocol !== 'file:') {
    fetch('schedule.json')
      .then(response => {
        if (!response.ok) throw new Error(`schedule.json: HTTP ${response.status}`);
        return response.json();
      })
      .then(json => {
        schedule = json;
        selectCurrentDate();
        render();
      })
      .catch(showLoadError);
  }
})();
