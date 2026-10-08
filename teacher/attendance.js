/* ============================================================
   TEACHER ATTENDANCE — LIVE SUPABASE MODE
   ------------------------------------------------------------
   Flow:
     1. Session → profile → teacher/active checks.
     2. Teacher picks a class + date.
     3. Real students load from public.profiles.
     4. Existing attendance for that class/date is merged in.
     5. Teacher marks Present/Absent, bulk actions work.
     6. Save upserts each student's row into public.attendance,
        keyed on (student_id, attendance_date) so repeat saves
        update in place instead of duplicating.

   Security: only the anon key is used. All rules are enforced
   by Supabase RLS on public.attendance and public.profiles.
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
  const guard       = document.getElementById('dashGuard');
  const shell       = document.getElementById('dashShell');
  const nameEl      = document.getElementById('dashUserName');
  const initialEl   = document.getElementById('dashUserInitial');
  const logoutBtn   = document.getElementById('dashLogout');
  const notifBtn    = document.getElementById('dashNotificationsBtn');
  const menuBtn     = document.getElementById('dashMenuBtn');
  const sidebar     = document.getElementById('dashSidebar');
  const backdrop    = document.getElementById('dashBackdrop');

  const alertEl     = document.getElementById('attAlert');
  const classEl     = document.getElementById('attClass');
  const dateEl      = document.getElementById('attDate');

  const summaryEl   = document.getElementById('attSummary');
  const sumTotalEl  = document.getElementById('sumTotal');
  const sumPresentEl= document.getElementById('sumPresent');
  const sumAbsentEl = document.getElementById('sumAbsent');

  const bulkEl      = document.getElementById('attBulk');
  const bulkPresent = document.getElementById('bulkPresent');
  const bulkAbsent  = document.getElementById('bulkAbsent');

  const emptyEl     = document.getElementById('attEmpty');
  const emptyTitleEl= document.getElementById('attEmptyTitle');
  const emptyTextEl = document.getElementById('attEmptyText');

  const tableWrapEl = document.getElementById('attTableWrap');
  const tableBodyEl = document.getElementById('attTableBody');
  const cardsEl     = document.getElementById('attCards');

  const saveBarEl   = document.getElementById('attSaveBar');
  const saveBtnEl   = document.getElementById('attSaveBtn');

  const testBadgeEl = document.querySelector('.att-test-badge');

  /* ----------------------------------------------------------
     2. State
  ---------------------------------------------------------- */
  let currentUser = null;   // session.user
  let rows = [];            // [{ id, school_id, roll, name, class_section, status }]
  let isSaving = false;

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

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function setAlert(message, variant) {
    if (!alertEl) return;
    if (!message) {
      alertEl.hidden = true;
      alertEl.textContent = '';
      alertEl.classList.remove('is-success', 'is-error', 'is-info');
      return;
    }
    alertEl.hidden = false;
    alertEl.textContent = message;
    alertEl.classList.remove('is-success', 'is-error', 'is-info');
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

  function setSaving(saving) {
    isSaving = saving;
    if (!saveBtnEl) return;
    saveBtnEl.classList.toggle('is-loading', saving);
    saveBtnEl.disabled = saving;
  }

  function showEmpty(title, text) {
    if (emptyTitleEl) emptyTitleEl.textContent = title;
    if (emptyTextEl)  emptyTextEl.textContent  = text;
    if (emptyEl) emptyEl.hidden = false;
    if (tableWrapEl) tableWrapEl.hidden = true;
    if (cardsEl) cardsEl.hidden = true;
    if (bulkEl) bulkEl.hidden = true;
    if (summaryEl) summaryEl.hidden = true;
    if (saveBarEl) saveBarEl.hidden = true;
  }

  function hideEmpty() {
    if (emptyEl) emptyEl.hidden = true;
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
    if (e.key === 'Escape') closeSidebar();
  });

  /* ----------------------------------------------------------
     5. Notifications button
  ---------------------------------------------------------- */
  if (notifBtn) {
    notifBtn.addEventListener('click', function () {
      setAlert('Notifications will be available soon.', 'info');
    });
  }

  /* ----------------------------------------------------------
     6. Auth guard
  ---------------------------------------------------------- */
  const OTHER_DASHBOARDS = {
    student: '../student/dashboard.html',
    admin:   '../admin/dashboard.html'
  };

  async function requireTeacher() {
    const sres = await supabase.auth.getSession();
    if (sres.error) {
      console.error('[teacher-attendance] getSession error:', sres.error);
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
      console.error('[teacher-attendance] profile load failed:', pres.error);
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
    if (profile.role !== 'teacher') {
      const target = OTHER_DASHBOARDS[profile.role];
      if (target) redirectTo(target);
      else {
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        redirectTo('../login.html');
      }
      return null;
    }

    currentUser = session.user;
    setText(nameEl, profile.full_name || 'Teacher');
    setText(initialEl, initialOf(profile.full_name || 'T'));

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
      catch (err) { console.error('[teacher-attendance] signOut error:', err); }
      redirectTo('../login.html');
    });
  }

  /* ----------------------------------------------------------
     8. Load real students + existing attendance
  ---------------------------------------------------------- */
  async function loadClassData() {
    const classSection = classEl ? classEl.value : '';
    const date = dateEl ? dateEl.value : '';

    setAlert(null);

    if (!classSection) {
      rows = [];
      showEmpty('Select a class to begin',
        'Choose a class and date above to load the student list.');
      return;
    }
    if (!date) {
      rows = [];
      showEmpty('Select a date', 'Pick an attendance date to load students.');
      return;
    }

    hideEmpty();
    if (tableWrapEl) tableWrapEl.hidden = true;
    if (cardsEl) cardsEl.hidden = true;
    if (bulkEl) bulkEl.hidden = true;
    if (summaryEl) summaryEl.hidden = true;
    if (saveBarEl) saveBarEl.hidden = true;

    // 1. Load active students in this class
    const studentsRes = await supabase
      .from('profiles')
      .select('id, school_id, full_name, role, status, class_section, roll_no')
      .eq('role', 'student')
      .eq('status', 'active')
      .eq('class_section', classSection)
      .order('roll_no', { ascending: true });

    if (studentsRes.error) {
      console.error('[teacher-attendance] students load error:', studentsRes.error);
      rows = [];
      showEmpty('Could not load students',
        'Something went wrong while loading students. Please try again.');
      return;
    }

    const students = Array.isArray(studentsRes.data) ? studentsRes.data : [];

    if (!students.length) {
      rows = [];
      showEmpty('No active students found',
        'There are no active students in this class.');
      return;
    }

    // 2. Load existing attendance for these students on that date
    const studentIds = students.map(function (s) { return s.id; });

    const attendanceRes = await supabase
      .from('attendance')
      .select('student_id, status')
      .eq('attendance_date', date)
      .in('student_id', studentIds);

    if (attendanceRes.error) {
      console.error('[teacher-attendance] attendance load error:', attendanceRes.error);
      // Not fatal — fall back to defaulting everyone to present
    }

    const existing = {};
    (attendanceRes.data || []).forEach(function (r) {
      existing[r.student_id] = r.status;
    });

    // 3. Build working rows
    rows = students.map(function (s, idx) {
      const saved = existing[s.id];
      let status = 'present';
      if (saved === 'present' || saved === 'absent') status = saved;
      return {
        id: s.id,
        school_id: s.school_id || '—',
        roll: (typeof s.roll_no === 'number' && s.roll_no > 0) ? s.roll_no : (idx + 1),
        name: s.full_name || 'Student',
        class_section: s.class_section || classSection,
        status: status
      };
    });

    renderAll();
  }

  /* ----------------------------------------------------------
     9. Render
  ---------------------------------------------------------- */
  function renderAll() {
    if (!rows.length) {
      showEmpty('No active students found',
        'There are no active students in this class.');
      return;
    }
    hideEmpty();

    if (bulkEl) bulkEl.hidden = false;
    if (summaryEl) summaryEl.hidden = false;
    if (saveBarEl) saveBarEl.hidden = false;

    renderTable();
    renderCards();
    updateSummary();
  }

  function renderTable() {
    if (!tableBodyEl) return;
    tableBodyEl.innerHTML = '';

    rows.forEach(function (s) {
      const groupName = 'student_' + s.id + '_attendance';
      const initial = initialOf(s.name);

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="att-roll">' + escapeHtml(s.roll) + '</span></td>' +
        '<td>' +
          '<div class="att-student-cell">' +
            '<span class="att-avatar" aria-hidden="true">' + escapeHtml(initial) + '</span>' +
            '<span class="att-student-name">' + escapeHtml(s.name) + '</span>' +
          '</div>' +
        '</td>' +
        '<td class="att-radio-cell">' +
          '<label class="att-radio att-radio-present" for="' + groupName + '_present">' +
            '<input type="radio" id="' + groupName + '_present" ' +
              'name="' + groupName + '" value="present" ' +
              (s.status === 'present' ? 'checked' : '') + '>' +
            '<span class="att-radio-mark" aria-hidden="true"></span>' +
            '<span class="sr-only">Present for ' + escapeHtml(s.name) + '</span>' +
          '</label>' +
        '</td>' +
        '<td class="att-radio-cell">' +
          '<label class="att-radio att-radio-absent" for="' + groupName + '_absent">' +
            '<input type="radio" id="' + groupName + '_absent" ' +
              'name="' + groupName + '" value="absent" ' +
              (s.status === 'absent' ? 'checked' : '') + '>' +
            '<span class="att-radio-mark" aria-hidden="true"></span>' +
            '<span class="sr-only">Absent for ' + escapeHtml(s.name) + '</span>' +
          '</label>' +
        '</td>';
      tableBodyEl.appendChild(tr);
    });

    if (tableWrapEl) tableWrapEl.hidden = false;
  }

  function renderCards() {
    if (!cardsEl) return;
    cardsEl.innerHTML = '';

    rows.forEach(function (s) {
      const groupName = 'student_' + s.id + '_attendance_m';
      const initial = initialOf(s.name);

      const card = document.createElement('div');
      card.className = 'att-card-student';
      card.innerHTML =
        '<div class="att-card-student-top">' +
          '<span class="att-avatar" aria-hidden="true">' + escapeHtml(initial) + '</span>' +
          '<div class="att-card-student-info">' +
            '<div class="att-card-roll">Roll No. ' + escapeHtml(s.roll) + '</div>' +
            '<div class="att-card-student-name">' + escapeHtml(s.name) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="att-card-student-controls">' +
          '<label class="att-card-radio att-card-radio-present" for="' + groupName + '_present">' +
            '<input type="radio" id="' + groupName + '_present" ' +
              'name="' + groupName + '" value="present" ' +
              (s.status === 'present' ? 'checked' : '') + '>' +
            '<span class="att-card-radio-mark" aria-hidden="true"></span>' +
            'Present' +
          '</label>' +
          '<label class="att-card-radio att-card-radio-absent" for="' + groupName + '_absent">' +
            '<input type="radio" id="' + groupName + '_absent" ' +
              'name="' + groupName + '" value="absent" ' +
              (s.status === 'absent' ? 'checked' : '') + '>' +
            '<span class="att-card-radio-mark" aria-hidden="true"></span>' +
            'Absent' +
          '</label>' +
        '</div>';
      cardsEl.appendChild(card);
    });

    cardsEl.hidden = false;
  }

  function updateSummary() {
    let present = 0, absent = 0;
    rows.forEach(function (s) {
      if (s.status === 'present') present++;
      else if (s.status === 'absent') absent++;
    });
    setText(sumTotalEl, rows.length);
    setText(sumPresentEl, present);
    setText(sumAbsentEl, absent);
  }

  /* ----------------------------------------------------------
     10. Change handling
     ----------------------------------------------------------
     One delegated listener on document catches every radio
     change (both table and card variants). We match the row by
     the UUID embedded in the input's name attribute.
  ---------------------------------------------------------- */
  document.addEventListener('change', function (e) {
    const input = e.target;
    if (!input || input.type !== 'radio') return;
    const name = input.getAttribute('name') || '';

    // Name pattern: student_<uuid>_attendance   (table)
    //               student_<uuid>_attendance_m (mobile card)
    const m = name.match(/^student_(.+?)_attendance(_m)?$/);
    if (!m) return;

    const studentId = m[1];
    const row = rows.find(function (r) { return r.id === studentId; });
    if (!row) return;

    row.status = input.value;

    // Mirror selection across both table and card views
    const tableRadios = document.querySelectorAll(
      'input[name="student_' + studentId + '_attendance"]'
    );
    const cardRadios = document.querySelectorAll(
      'input[name="student_' + studentId + '_attendance_m"]'
    );
    tableRadios.forEach(function (r) { r.checked = (r.value === input.value); });
    cardRadios.forEach(function (r) { r.checked = (r.value === input.value); });

    updateSummary();
  });

  /* ----------------------------------------------------------
     11. Bulk actions
  ---------------------------------------------------------- */
  function setAllStatus(status) {
    if (!rows.length) return;
    rows.forEach(function (r) { r.status = status; });

    document.querySelectorAll('input[type="radio"][name^="student_"]')
      .forEach(function (r) { r.checked = (r.value === status); });

    updateSummary();
  }

  if (bulkPresent) {
    bulkPresent.addEventListener('click', function () { setAllStatus('present'); });
  }
  if (bulkAbsent) {
    bulkAbsent.addEventListener('click', function () { setAllStatus('absent'); });
  }

  /* ----------------------------------------------------------
     12. Save — real upsert into public.attendance
  ---------------------------------------------------------- */
  async function saveAttendance() {
    if (isSaving) return;

    const classSection = classEl ? classEl.value : '';
    const date = dateEl ? dateEl.value : '';

    if (!classSection) {
      setAlert('Please select a class first.', 'error');
      return;
    }
    if (!date) {
      setAlert('Please select an attendance date.', 'error');
      return;
    }
    if (!rows.length) {
      setAlert('There are no students to save.', 'error');
      return;
    }

    setAlert(null);
    setSaving(true);

    const payload = rows.map(function (r) {
      return {
        student_id: r.id,
        school_id: r.school_id,
        roll_no: r.roll,
        class_section: r.class_section,
        attendance_date: date,
        status: r.status,
        marked_by: currentUser.id
      };
    });

    const result = await supabase
      .from('attendance')
      .upsert(payload, { onConflict: 'student_id,attendance_date' })
      .select('id');

    setSaving(false);

    if (result.error) {
      console.error('[teacher-attendance] save error:', result.error);
      setAlert('Could not save attendance. Please try again.', 'error');
      return;
    }

    setAlert('Attendance saved successfully.', 'success');
  }

  if (saveBtnEl) {
    saveBtnEl.addEventListener('click', saveAttendance);
  }

  /* ----------------------------------------------------------
     13. Controls
  ---------------------------------------------------------- */
  if (classEl) classEl.addEventListener('change', loadClassData);
  if (dateEl)  dateEl.addEventListener('change', loadClassData);

  /* ----------------------------------------------------------
     14. Main
  ---------------------------------------------------------- */
  async function init() {
    const auth = await requireTeacher();
    if (!auth) return;

    // Live mode label
    if (testBadgeEl) testBadgeEl.textContent = 'Live Mode — Supabase';

    // Default date = today, cap at today
    const today = todayISO();
    if (dateEl) {
      dateEl.value = today;
      dateEl.max = today;
    }

    wireLogout();
    revealDashboard();

    showEmpty('Select a class to begin',
      'Choose a class and date above to load the student list.');
  }

  init();

})();