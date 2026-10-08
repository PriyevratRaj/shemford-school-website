/* ============================================================
   STUDENT HOMEWORK — VIEW ONLY
   ------------------------------------------------------------
   Auth guard mirrors student/dashboard.js exactly:
     1. Session exists?          no  → ../login.html
     2. Profile loads?           no  → sign out → login
     3. Status is 'active'?      no  → sign out → message
     4. Role is 'student'?       no  → redirect to correct dashboard
     5. All good → load homework for the student's class

   View-only page. Students cannot create, edit or delete.
   The database (RLS) enforces this too; the frontend just
   never offers those actions.
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
    showFatal(
      'Configuration missing',
      'supabase-config.js did not load, or its values are empty.'
    );
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    showFatal(
      'Supabase SDK failed to load',
      'The Supabase CDN script did not load. Check your internet connection.'
    );
    return;
  }

  const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  /* ----------------------------------------------------------
     1. DOM references
  ---------------------------------------------------------- */
  const guard         = document.getElementById('dashGuard');
  const shell         = document.getElementById('dashShell');

  const nameEl        = document.getElementById('dashUserName');
  const initialEl     = document.getElementById('dashUserInitial');
  const logoutBtn     = document.getElementById('dashLogout');
  const notifBtn      = document.getElementById('dashNotificationsBtn');

  const menuBtn       = document.getElementById('dashMenuBtn');
  const sidebar       = document.getElementById('dashSidebar');
  const backdrop      = document.getElementById('dashBackdrop');

  const studentNameEl = document.getElementById('hwStudentName');
  const studentClsEl  = document.getElementById('hwStudentClass');

  const alertEl       = document.getElementById('hwAlert');
  const loadingEl     = document.getElementById('hwLoading');
  const emptyEl       = document.getElementById('hwEmpty');
  const listEl        = document.getElementById('hwList');

  /* ----------------------------------------------------------
     2. Module state
  ---------------------------------------------------------- */
  let currentProfile = null;   // the student's profiles row

  /* ----------------------------------------------------------
     3. Helpers
  ---------------------------------------------------------- */
  function redirectTo(path) {
    window.location.replace(path);
  }

  function setText(el, value) {
    if (!el) return;
    const v = (value === null || value === undefined) ? '' : String(value).trim();
    el.textContent = v || '–';
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

  /* ----------------------------------------------------------
     4. Date helpers
     ----------------------------------------------------------
     ISO dates from Supabase come as 'YYYY-MM-DD'. We compare
     against today's date using a normalised local-time value
     so timezone shifts don't flip a day.
  ---------------------------------------------------------- */
  function parseISODate(iso) {
    if (!iso) return null;
    const parts = String(iso).split('-');
    if (parts.length !== 3) return null;
    const d = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    );
    return isNaN(d.getTime()) ? null : d;
  }

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function daysBetween(from, to) {
    const ms = 24 * 60 * 60 * 1000;
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / ms);
  }

  function formatDate(iso) {
    const d = parseISODate(iso);
    if (!d) return '–';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return String(d.getDate()).padStart(2, '0') + ' ' +
           months[d.getMonth()] + ' ' +
           d.getFullYear();
  }

  /**
   * Returns { label, cls } describing the due status.
   * label: 'Due Today' | 'Overdue' | 'Due in N day(s)' | 'Due tomorrow'
   * cls:   'is-today' | 'is-overdue' | 'is-future'
   */
  function dueStatus(iso) {
    const due = parseISODate(iso);
    if (!due) {
      return { label: 'No due date', cls: 'is-future' };
    }
    const diff = daysBetween(startOfToday(), due);

    if (diff === 0) {
      return { label: 'Due Today', cls: 'is-today' };
    }
    if (diff < 0) {
      const overdue = Math.abs(diff);
      return {
        label: overdue === 1 ? 'Overdue by 1 day' : 'Overdue by ' + overdue + ' days',
        cls: 'is-overdue'
      };
    }
    if (diff === 1) {
      return { label: 'Due tomorrow', cls: 'is-future' };
    }
    return { label: 'Due in ' + diff + ' days', cls: 'is-future' };
  }

  /* ----------------------------------------------------------
     5. Mobile sidebar (same pattern as dashboard.js)
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
      const isOpen = sidebar && sidebar.classList.contains('is-open');
      if (isOpen) closeSidebar();
      else openSidebar();
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });

  /* ----------------------------------------------------------
     6. Notifications button
  ---------------------------------------------------------- */
  if (notifBtn) {
    notifBtn.addEventListener('click', function () {
      window.location.href = 'announcements.html';
    });
  }

  /* ----------------------------------------------------------
     7. Auth guard
  ---------------------------------------------------------- */
  const OTHER_DASHBOARDS = {
    teacher: '../teacher/dashboard.html',
    admin:   '../admin/dashboard.html'
  };

  async function requireStudent() {
    const sessionResult = await supabase.auth.getSession();

    if (sessionResult.error) {
      console.error('[student-homework] getSession error:', sessionResult.error);
      redirectTo('../login.html');
      return null;
    }

    const session = sessionResult.data && sessionResult.data.session;
    if (!session || !session.user) {
      redirectTo('../login.html');
      return null;
    }

    const profileResult = await supabase
      .from('profiles')
      .select('id, school_id, full_name, role, class_section, status')
      .eq('id', session.user.id)
      .single();

    if (profileResult.error || !profileResult.data) {
      console.error('[student-homework] profile load failed:', profileResult.error);
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      redirectTo('../login.html');
      return null;
    }

    const profile = profileResult.data;

    if (profile.status !== 'active') {
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      showFatal(
        'Account ' + (profile.status || 'inactive'),
        'Your account is not active. Please contact the school office.'
      );
      return null;
    }

    if (profile.role !== 'student') {
      const target = OTHER_DASHBOARDS[profile.role];
      if (target) {
        redirectTo(target);
      } else {
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        redirectTo('../login.html');
      }
      return null;
    }

    return { session, profile };
  }

  /* ----------------------------------------------------------
     8. Reveal + logout
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
      catch (err) { console.error('[student-homework] signOut error:', err); }
      redirectTo('../login.html');
    });
  }

  /* ----------------------------------------------------------
     9. Render student info header
  ---------------------------------------------------------- */
  function renderStudentInfo(profile) {
    const name = profile.full_name || 'Student';
    setText(nameEl, name);
    setText(initialEl, initialOf(name));
    setText(studentNameEl, name);
    setText(studentClsEl, profile.class_section || '—');
  }

  /* ----------------------------------------------------------
     10. Load homework
      The query filters by class_section INSIDE Supabase,
      not in JavaScript. RLS still applies on top of this.
  ---------------------------------------------------------- */
  async function loadHomework() {
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (listEl) {
      listEl.hidden = true;
      listEl.innerHTML = '';
    }
    setAlert(null);

    const classSection = currentProfile && currentProfile.class_section;

    if (!classSection) {
      // No class assigned — show a friendly empty state instead of an error
      if (loadingEl) loadingEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    const result = await supabase
      .from('homework')
      .select(
        'id, teacher_id, teacher_name, class_section, subject, title, ' +
        'instructions, assigned_date, due_date, attachment_name, ' +
        'attachment_url, created_at'
      )
      .eq('class_section', classSection)
      .order('due_date', { ascending: true });

    if (loadingEl) loadingEl.hidden = true;

    if (result.error) {
      console.error('[student-homework] load error:', result.error);
      setAlert('Could not load homework. Please try again.', 'error');
      if (listEl) listEl.hidden = true;
      return;
    }

    const items = Array.isArray(result.data) ? result.data : [];

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (listEl) listEl.hidden = true;
      return;
    }

    renderList(items);
  }

  /* ----------------------------------------------------------
     11. Render list
  ---------------------------------------------------------- */
  function renderList(items) {
    if (!listEl) return;

    listEl.innerHTML = '';
    listEl.hidden = false;

    items.forEach(function (hw) {
      const due = dueStatus(hw.due_date);

      const instructionsHtml = hw.instructions
        ? escapeHtml(hw.instructions)
        : '<span class="hw-card-instructions is-empty">No instructions provided.</span>';

      const attachmentHtml = hw.attachment_url
        ? '<a class="hw-attachment" href="' + escapeHtml(hw.attachment_url) + '" ' +
            'target="_blank" rel="noopener">' +
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
              '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
              '<path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
            'View Attachment' +
          '</a>'
        : '';

      const card = document.createElement('article');
      card.className = 'hw-card';
      card.setAttribute('data-id', hw.id);

      card.innerHTML =
        '<div class="hw-card-head">' +
          '<div class="hw-card-tags">' +
            '<span class="hw-tag">' + escapeHtml(hw.subject || 'Subject') + '</span>' +
            '<span class="hw-tag hw-tag-plain">Class ' + escapeHtml(hw.class_section || '—') + '</span>' +
          '</div>' +
          '<span class="hw-due-badge ' + due.cls + '">' + escapeHtml(due.label) + '</span>' +
        '</div>' +
        '<h3 class="hw-card-title">' + escapeHtml(hw.title || 'Untitled') + '</h3>' +
        '<p class="hw-card-teacher">Teacher: <strong>' + escapeHtml(hw.teacher_name || '—') + '</strong></p>' +
        '<p class="hw-card-instructions">' + instructionsHtml + '</p>' +
        '<div class="hw-card-footer">' +
          '<div class="hw-dates">' +
            '<span>Assigned: <strong>' + escapeHtml(formatDate(hw.assigned_date)) + '</strong></span>' +
            '<span>Due: <strong>' + escapeHtml(formatDate(hw.due_date)) + '</strong></span>' +
          '</div>' +
          (attachmentHtml || '') +
        '</div>';

      listEl.appendChild(card);
    });
  }

  /* ----------------------------------------------------------
     12. Main
  ---------------------------------------------------------- */
  async function init() {
    const auth = await requireStudent();
    if (!auth) return;   // redirect / fatal already handled

    currentProfile = auth.profile;

    renderStudentInfo(currentProfile);
    wireLogout();
    revealDashboard();

    await loadHomework();
  }

  init();

})();