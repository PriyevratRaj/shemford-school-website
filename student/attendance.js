/* ============================================================
   STUDENT ATTENDANCE — VIEW ONLY (calendar)
   ------------------------------------------------------------
   Flow:
     1. Session → profile → student/active checks.
     2. Query attendance for the logged-in student only.
     3. Render a monthly calendar (default) with Present/Absent
        colours, plus a yearly view with 12 mini calendars.
     4. Month/year navigation filters already-loaded data — no
        extra Supabase requests.

   Security: the frontend only ever reads the signed-in
   student's own attendance. RLS on public.attendance enforces
   that at the database layer.
   ============================================================= */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     0. Config check
  ---------------------------------------------------------- */
  if (
    !window.SUPABASE_CONFIG ||
    !window.SUPABASE_CONFIG.url ||
    !window.SUPABASE_CONFIG.anonKey
  ) {
    showFatal('Configuration missing',
      'supabase-config.js did not load, or its values are empty.');
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    showFatal('Supabase SDK failed to load',
      'The Supabase CDN script did not load. Check your internet connection.');
    return;
  }

  const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  /* ----------------------------------------------------------
     1. DOM references
  ---------------------------------------------------------- */
  const guard        = document.getElementById('dashGuard');
  const shell        = document.getElementById('dashShell');
  const nameEl       = document.getElementById('dashUserName');
  const initialEl    = document.getElementById('dashUserInitial');
  const logoutBtn    = document.getElementById('dashLogout');
  const notifBtn     = document.getElementById('dashNotificationsBtn');
  const menuBtn      = document.getElementById('dashMenuBtn');
  const sidebar      = document.getElementById('dashSidebar');
  const backdrop     = document.getElementById('dashBackdrop');

  const alertEl      = document.getElementById('attAlert');

  const viewMonthlyBtn = document.getElementById('viewMonthly');
  const viewYearlyBtn  = document.getElementById('viewYearly');

  const loadingEl    = document.getElementById('attLoading');
  const emptyEl      = document.getElementById('attEmpty');

  const monthlyEl    = document.getElementById('attMonthly');
  const yearlyEl     = document.getElementById('attYearly');

  const monthTitleEl = document.getElementById('attMonthlyTitle');
  const prevMonthBtn = document.getElementById('attPrevMonth');
  const nextMonthBtn = document.getElementById('attNextMonth');
  const calendarEl   = document.getElementById('attCalendarDays');

  const sumMonthPresent = document.getElementById('sumMonthPresent');
  const sumMonthAbsent  = document.getElementById('sumMonthAbsent');
  const sumMonthPercent = document.getElementById('sumMonthPercent');

  const yearTitleEl  = document.getElementById('attYearlyTitle');
  const prevYearBtn  = document.getElementById('attPrevYear');
  const nextYearBtn  = document.getElementById('nextYear') || document.getElementById('attNextYear');
  const yearlyGridEl = document.getElementById('attYearlyGrid');

  const sumYearPresent = document.getElementById('sumYearPresent');
  const sumYearAbsent  = document.getElementById('sumYearAbsent');
  const sumYearPercent = document.getElementById('sumYearPercent');

  const detailBackdrop = document.getElementById('attDetailBackdrop');
  const detailEl       = document.getElementById('attDetail');
  const detailCloseBtn = document.getElementById('attDetailClose');
  const detailTitleEl  = document.getElementById('attDetailTitle');
  const detailStatusEl = document.getElementById('attDetailStatus');

  /* ----------------------------------------------------------
     2. State
  ---------------------------------------------------------- */
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec'];

  // attendanceMap: { 'YYYY-MM-DD': 'present' | 'absent' | 'holiday' }
  let attendanceMap = {};

  // View state
  const today = new Date();
  let currentYear  = today.getFullYear();
  let currentMonth = today.getMonth(); // 0-11
  let currentView  = 'monthly';        // 'monthly' | 'yearly'

  /* ----------------------------------------------------------
     3. Helpers
  ---------------------------------------------------------- */
  function redirectTo(path) { window.location.replace(path); }

  function setText(el, v) {
    if (!el) return;
    const s = (v === null || v === undefined) ? '' : String(v).trim();
    el.textContent = s || '–';
  }

  function initialOf(name) {
    const t = (name || '').trim();
    return t ? t[0].toUpperCase() : '–';
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function isoDate(y, m /* 0-11 */, d) {
    return y + '-' + pad2(m + 1) + '-' + pad2(d);
  }

  function daysInMonth(y, m /* 0-11 */) {
    return new Date(y, m + 1, 0).getDate();
  }

  // ISO weekday 1-7 with Monday first (1) ... Sunday (7)
  function isoWeekdayMonFirst(y, m, d) {
    const js = new Date(y, m, d).getDay(); // 0=Sun ... 6=Sat
    return js === 0 ? 7 : js;
  }

  function isFutureDate(y, m, d) {
    const dt = new Date(y, m, d);
    const t  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return dt.getTime() > t.getTime();
  }

  function isSameMonthAsCurrent(y, m) {
    return y === today.getFullYear() && m === today.getMonth();
  }

  function formatLongDate(iso) {
    const p = String(iso).split('-');
    if (p.length !== 3) return iso;
    const y = Number(p[0]), m = Number(p[1]) - 1, d = Number(p[2]);
    return d + ' ' + MONTHS[m] + ' ' + y;
  }

  function setAlert(message, variant) {
    if (!alertEl) return;
    if (!message) {
      alertEl.hidden = true;
      alertEl.textContent = '';
      alertEl.classList.remove('is-error', 'is-info');
      return;
    }
    alertEl.hidden = false;
    alertEl.textContent = message;
    alertEl.classList.remove('is-error', 'is-info');
    if (variant) alertEl.classList.add('is-' + variant);
  }

  function showFatal(title, message) {
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'padding:2rem;font-family:Inter,system-ui,sans-serif;background:#F9FAFB;">' +
        '<div style="max-width:520px;background:#fff;border:1px solid #E5E7EB;' +
        'border-radius:14px;padding:2rem;">' +
          '<h1 style="font-size:1.25rem;margin:0 0 .5rem;color:#111827;">' + title + '</h1>' +
          '<p style="margin:0;color:#6B7280;line-height:1.6;">' + message + '</p>' +
        '</div>' +
      '</div>';
  }

  /* ----------------------------------------------------------
     4. Mobile sidebar
  ---------------------------------------------------------- */
  function openSidebar() {
    if (!sidebar || !backdrop) return;
    sidebar.classList.add('is-open');
    backdrop.hidden = false;
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    if (!sidebar || !backdrop) return;
    sidebar.classList.remove('is-open');
    backdrop.hidden = true;
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      const open = sidebar && sidebar.classList.contains('is-open');
      if (open) closeSidebar(); else openSidebar();
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeSidebar(); closeDetail(); }
  });

  /* ----------------------------------------------------------
     5. Notifications button
  ---------------------------------------------------------- */
  if (notifBtn) {
    notifBtn.addEventListener('click', function () {
      window.location.href = 'announcements.html';
    });
  }

  /* ----------------------------------------------------------
     6. Auth guard
  ---------------------------------------------------------- */
  const OTHER_DASHBOARDS = {
    teacher: '../teacher/dashboard.html',
    admin:   '../admin/dashboard.html'
  };

  async function requireStudent() {
    const sres = await supabase.auth.getSession();
    if (sres.error) {
      console.error('[student-attendance] getSession error:', sres.error);
      redirectTo('../login.html');
      return null;
    }
    const session = sres.data && sres.data.session;
    if (!session || !session.user) {
      redirectTo('../login.html');
      return null;
    }

    const pres = await supabase
      .from('profiles')
      .select('id, school_id, full_name, role, status')
      .eq('id', session.user.id)
      .single();

    if (pres.error || !pres.data) {
      console.error('[student-attendance] profile load failed:', pres.error);
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      redirectTo('../login.html');
      return null;
    }

    const profile = pres.data;
    if (profile.status !== 'active') {
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      showFatal('Account ' + (profile.status || 'inactive'),
        'Your account is not active. Please contact the school office.');
      return null;
    }
    if (profile.role !== 'student') {
      const target = OTHER_DASHBOARDS[profile.role];
      if (target) redirectTo(target);
      else {
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        redirectTo('../login.html');
      }
      return null;
    }

    setText(nameEl, profile.full_name || 'Student');
    setText(initialEl, initialOf(profile.full_name || 'S'));

    return { session, profile };
  }

  /* ----------------------------------------------------------
     7. Reveal + logout
  ---------------------------------------------------------- */
  function revealDashboard() {
    if (shell) shell.hidden = false;
    if (guard) guard.remove();
  }

  function wireLogout() {
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', async function () {
      logoutBtn.disabled = true;
      try { await supabase.auth.signOut(); }
      catch (err) { console.error('[student-attendance] signOut error:', err); }
      redirectTo('../login.html');
    });
  }

  /* ----------------------------------------------------------
     8. Load attendance (once)
  ---------------------------------------------------------- */
  async function loadAttendance(userId) {
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (monthlyEl) monthlyEl.hidden = true;
    if (yearlyEl) yearlyEl.hidden = true;
    setAlert(null);

    const result = await supabase
      .from('attendance')
      .select('attendance_date, status')
      .eq('student_id', userId)
      .order('attendance_date', { ascending: true });

    if (loadingEl) loadingEl.hidden = true;

    if (result.error) {
      console.error('[student-attendance] load error:', result.error);
      setAlert('Could not load your attendance. Please try again.', 'error');
      return false;
    }

    const rows = Array.isArray(result.data) ? result.data : [];

    attendanceMap = {};
    rows.forEach(function (r) {
      if (!r.attendance_date) return;
      attendanceMap[r.attendance_date] = r.status;
    });

    if (!rows.length) {
      if (emptyEl) emptyEl.hidden = false;
      return false;
    }

    return true;
  }

  /* ----------------------------------------------------------
     9. Status lookup
  ---------------------------------------------------------- */
  function getStatus(y, m, d) {
    const iso = isoDate(y, m, d);
    return attendanceMap[iso] || null;
  }

  /* ----------------------------------------------------------
     10. Monthly view
  ---------------------------------------------------------- */
  function renderMonthly() {
    if (!calendarEl) return;

    monthTitleEl.textContent = MONTHS[currentMonth] + ' ' + currentYear;

    // Summary for this month
    const y = currentYear, m = currentMonth;
    const total = daysInMonth(y, m);
    let present = 0, absent = 0;

    calendarEl.innerHTML = '';

    // Leading blanks (Monday-first)
    const firstIso = isoWeekdayMonFirst(y, m, 1); // 1-7
    for (let i = 1; i < firstIso; i++) {
      const blank = document.createElement('div');
      blank.className = 'att-day-empty';
      blank.setAttribute('aria-hidden', 'true');
      calendarEl.appendChild(blank);
    }

    for (let d = 1; d <= total; d++) {
      const status = getStatus(y, m, d);
      const future = isFutureDate(y, m, d);

      if (status === 'present') present++;
      else if (status === 'absent') absent++;

      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'att-day';
      cell.setAttribute('data-date', isoDate(y, m, d));
      cell.setAttribute('role', 'gridcell');

      let cls = 'is-neutral';
      let label = 'Not marked';
      if (future) {
        cell.disabled = true;
        cls = 'is-neutral';
        label = '—';
      } else if (status === 'present') {
        cls = 'is-present';
        label = 'Present';
      } else if (status === 'absent') {
        cls = 'is-absent';
        label = 'Absent';
      } else if (status === 'holiday') {
        cls = 'is-neutral';
        label = 'Holiday';
      } else {
        cls = 'is-neutral';
        label = '';
      }
      cell.classList.add(cls);

      cell.innerHTML =
        '<span class="att-day-num">' + d + '</span>' +
        (label && !future
          ? '<span class="att-day-status">' + label + '</span>'
          : '');

      cell.setAttribute('aria-label',
        isoDate(y, m, d) + ' — ' + (future ? 'Future date' : label));

      cell.addEventListener('click', function () {
        showDetail(isoDate(y, m, d), status, future);
      });

      calendarEl.appendChild(cell);
    }

    // Summary
    const denom = present + absent;
    const pct = denom > 0 ? Math.round((present / denom) * 100) : 0;
    setText(sumMonthPresent, present);
    setText(sumMonthAbsent, absent);
    setText(sumMonthPercent, pct + '%');

    // Disable next-month when on current month
    if (nextMonthBtn) {
      const isCurrent = isSameMonthAsCurrent(currentYear, currentMonth);
      nextMonthBtn.disabled = isCurrent;
    }
  }

  /* ----------------------------------------------------------
     11. Yearly view
  ---------------------------------------------------------- */
  function renderYearly() {
    if (!yearlyGridEl) return;

    yearTitleEl.textContent = currentYear;

    yearlyGridEl.innerHTML = '';

    let yPresent = 0, yAbsent = 0;

    for (let m = 0; m < 12; m++) {
      const mini = document.createElement('div');
      mini.className = 'att-mini';

      const title = document.createElement('h3');
      title.className = 'att-mini-title';
      title.textContent = MONTHS_SHORT[m] + ' ' + currentYear;
      mini.appendChild(title);

      const wd = document.createElement('div');
      wd.className = 'att-mini-weekdays';
      ['M','T','W','T','F','S','S'].forEach(function (ch) {
        const s = document.createElement('span');
        s.textContent = ch;
        wd.appendChild(s);
      });
      mini.appendChild(wd);

      const grid = document.createElement('div');
      grid.className = 'att-mini-days';

      const firstIso = isoWeekdayMonFirst(currentYear, m, 1);
      for (let i = 1; i < firstIso; i++) {
        const blank = document.createElement('span');
        blank.className = 'att-mini-day is-empty';
        grid.appendChild(blank);
      }

      const total = daysInMonth(currentYear, m);
      for (let d = 1; d <= total; d++) {
        const status = getStatus(currentYear, m, d);
        const future = isFutureDate(currentYear, m, d);

        if (status === 'present') yPresent++;
        else if (status === 'absent') yAbsent++;

        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'att-mini-day';
        cell.textContent = d;

        if (future) {
          cell.disabled = true;
        } else if (status === 'present') {
          cell.classList.add('is-present');
        } else if (status === 'absent') {
          cell.classList.add('is-absent');
        }

        cell.addEventListener('click', function () {
          showDetail(isoDate(currentYear, m, d), status, future);
        });

        grid.appendChild(cell);
      }

      mini.appendChild(grid);
      yearlyGridEl.appendChild(mini);
    }

    const denom = yPresent + yAbsent;
    const pct = denom > 0 ? Math.round((yPresent / denom) * 1000) / 10 : 0;
    setText(sumYearPresent, yPresent);
    setText(sumYearAbsent, yAbsent);
    setText(sumYearPercent, (pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)) + '%');

    // Disable next-year when on current year
    if (nextYearBtn) {
      nextYearBtn.disabled = (currentYear >= today.getFullYear());
    }
  }

  /* ----------------------------------------------------------
     12. Detail panel
  ---------------------------------------------------------- */
  function showDetail(iso, status, future) {
    if (!detailEl || !detailBackdrop) return;

    detailTitleEl.textContent = formatLongDate(iso);

    detailStatusEl.classList.remove('is-present', 'is-absent', 'is-neutral');

    if (future) {
      detailStatusEl.textContent = 'Future date — attendance not yet recorded.';
      detailStatusEl.classList.add('is-neutral');
    } else if (status === 'present') {
      detailStatusEl.textContent = 'Present';
      detailStatusEl.classList.add('is-present');
    } else if (status === 'absent') {
      detailStatusEl.textContent = 'Absent';
      detailStatusEl.classList.add('is-absent');
    } else if (status === 'holiday') {
      detailStatusEl.textContent = 'Holiday';
      detailStatusEl.classList.add('is-neutral');
    } else {
      detailStatusEl.textContent = 'Attendance not marked';
      detailStatusEl.classList.add('is-neutral');
    }

    detailBackdrop.hidden = false;
    detailEl.hidden = false;
  }

  function closeDetail() {
    if (detailBackdrop) detailBackdrop.hidden = true;
    if (detailEl) detailEl.hidden = true;
  }

  if (detailCloseBtn) detailCloseBtn.addEventListener('click', closeDetail);
  if (detailBackdrop) detailBackdrop.addEventListener('click', closeDetail);

  /* ----------------------------------------------------------
     13. View + navigation wiring
  ---------------------------------------------------------- */
  function setView(view) {
    currentView = view;
    if (viewMonthlyBtn) {
      viewMonthlyBtn.classList.toggle('is-active', view === 'monthly');
      viewMonthlyBtn.setAttribute('aria-selected', String(view === 'monthly'));
    }
    if (viewYearlyBtn) {
      viewYearlyBtn.classList.toggle('is-active', view === 'yearly');
      viewYearlyBtn.setAttribute('aria-selected', String(view === 'yearly'));
    }

    if (monthlyEl) monthlyEl.hidden = (view !== 'monthly');
    if (yearlyEl) yearlyEl.hidden = (view !== 'yearly');

    if (view === 'monthly') renderMonthly();
    else renderYearly();
  }

  if (viewMonthlyBtn) {
    viewMonthlyBtn.addEventListener('click', function () { setView('monthly'); });
  }
  if (viewYearlyBtn) {
    viewYearlyBtn.addEventListener('click', function () { setView('yearly'); });
  }

  /* Month nav */
  function shiftMonth(delta) {
    let m = currentMonth + delta;
    let y = currentYear;
    while (m < 0)  { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }

    // Do not allow future months
    if (y > today.getFullYear() ||
        (y === today.getFullYear() && m > today.getMonth())) {
      return;
    }
    currentMonth = m;
    currentYear = y;
    renderMonthly();
  }

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', function () { shiftMonth(-1); });
  }
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', function () { shiftMonth(1); });
  }

  /* Year nav */
  function shiftYear(delta) {
    const target = currentYear + delta;
    if (target > today.getFullYear()) return;
    currentYear = target;
    renderYearly();
  }

  if (prevYearBtn) {
    prevYearBtn.addEventListener('click', function () { shiftYear(-1); });
  }
  if (nextYearBtn) {
    nextYearBtn.addEventListener('click', function () { shiftYear(1); });
  }

  /* ----------------------------------------------------------
     14. Main
  ---------------------------------------------------------- */
  async function init() {
    const auth = await requireStudent();
    if (!auth) return;

    const ok = await loadAttendance(auth.session.user.id);

    wireLogout();
    revealDashboard();

    if (!ok) {
      // Empty state already shown by loadAttendance
      return;
    }

    setView('monthly');
  }

  init();

})();