/* ============================================================
   ADMIN DASHBOARD — AUTH GUARD + LIVE STATS
   ------------------------------------------------------------
   Flow:
     1. Session exists?              no  → ../login.html
     2. Profile row in admin_profiles? no  → sign out → login
     3. Status is 'active'?          no  → sign out → message
     4. Role is 'admin'?             no  → redirect to correct dashboard
     5. All good → render + load stats

   Stats are read from real tables (profiles, teacher_profiles).
   If RLS blocks a count, the card shows "—" with a short note.
   No fake numbers are ever shown.
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

  const greetingEl  = document.getElementById('admGreeting');
  const adminNameEl = document.getElementById('admAdminName');
  const alertEl     = document.getElementById('admAlert');

  const statStudentsEl        = document.getElementById('statStudents');
  const statStudentsNoteEl    = document.getElementById('statStudentsNote');
  const statTeachersEl        = document.getElementById('statTeachers');
  const statTeachersNoteEl    = document.getElementById('statTeachersNote');
  const statActiveTeachersEl  = document.getElementById('statActiveTeachers');
  const statActiveTeachersNoteEl = document.getElementById('statActiveTeachersNote');

  /* ----------------------------------------------------------
     2. Helpers
  ---------------------------------------------------------- */
  function redirectTo(path) { window.location.replace(path); }

  function setText(el, v) {
    if (!el) return;
    const s = (v === null || v === undefined) ? '' : String(v).trim();
    el.textContent = s || '—';
  }

  function initialOf(name) {
    const t = (name || '').trim();
    return t ? t[0].toUpperCase() : 'A';
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

  function greetingForHour(h) {
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  /* ----------------------------------------------------------
     3. Mobile sidebar (drawer)
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
     4. Sidebar group expand/collapse
     ----------------------------------------------------------
     Clicking a group header toggles the sub-list underneath.
     Desktop default: Students and Teachers open, Schedules
     closed. The state is driven by the `hidden` attribute and
     the `is-open` class on the toggle button.
  ---------------------------------------------------------- */
  document.querySelectorAll('.dash-nav-group-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const targetId = btn.getAttribute('data-target');
      const sublist = targetId ? document.getElementById(targetId) : null;
      const isOpen = btn.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (sublist) sublist.hidden = !isOpen;
    });
  });

  /* ----------------------------------------------------------
     5. Notifications button (placeholder)
  ---------------------------------------------------------- */
  if (notifBtn) {
    notifBtn.addEventListener('click', function () {
      setAlert('Notifications will be available soon.', 'info');
    });
  }

  /* ----------------------------------------------------------
     6. Logout
  ---------------------------------------------------------- */
  function wireLogout() {
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', async function () {
      logoutBtn.disabled = true;
      try { await supabase.auth.signOut(); }
      catch (err) { console.error('[admin-dashboard] signOut error:', err); }
      redirectTo('../login.html');
    });
  }

  /* ----------------------------------------------------------
     7. Role → dashboard map
     ----------------------------------------------------------
     Note: 'admin' is intentionally NOT mapped here. An admin
     must never be redirected to admin/dashboard.html — that
     would cause a loop.
  ---------------------------------------------------------- */
  const OTHER_DASHBOARDS = {
    student: '../student/dashboard.html',
    teacher: '../teacher/dashboard.html'
  };

  /* ----------------------------------------------------------
     8. Auth guard
  ---------------------------------------------------------- */
  async function requireAdmin() {
    const sres = await supabase.auth.getSession();
    if (sres.error) {
      console.error('[admin-dashboard] getSession error:', sres.error);
      redirectTo('../login.html');
      return null;
    }
    const session = sres.data && sres.data.session;
    if (!session || !session.user) {
      redirectTo('../login.html');
      return null;
    }

    // Read the admin's own row from admin_profiles.
    // RLS: "Admin can read own profile" allows this.
    const pres = await supabase
      .from('admin_profiles')
      .select('id, full_name, email, role, status')
      .eq('id', session.user.id)
      .single();

    if (pres.error || !pres.data) {
      console.error('[admin-dashboard] profile load failed:', pres.error);
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

    if (profile.role !== 'admin') {
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
     9. Reveal + render identity
  ---------------------------------------------------------- */
  function revealDashboard() {
    if (shell) shell.hidden = false;
    if (guard) guard.remove();
  }

  function renderIdentity(profile) {
    const name = profile.full_name || 'Admin';
    setText(nameEl, name);
    setText(initialEl, initialOf(name));
    setText(adminNameEl, name.split(' ')[0] || name);
    setText(greetingEl, greetingForHour(new Date().getHours()));
    document.title = (name.split(' ')[0] || 'Admin') + ' — Admin Dashboard';
  }

  /* ----------------------------------------------------------
     10. Statistics
     ----------------------------------------------------------
     We use `head: true, count: 'exact'` so Supabase returns the
     row count without shipping the rows themselves.

     If RLS blocks the count, `error` is set or `count` is null.
     We render "—" and a small note. We never display a fake 0.
  ---------------------------------------------------------- */
  async function loadStudentsCount() {
    if (statStudentsEl) statStudentsEl.textContent = '…';
    if (statStudentsNoteEl) statStudentsNoteEl.textContent = '';

    const res = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student');

    if (res.error || res.count === null || res.count === undefined) {
      // RLS or missing table — do not show a fake number.
      console.error('[admin-dashboard] students count failed:', res.error);
      if (statStudentsEl) statStudentsEl.textContent = '—';
      if (statStudentsNoteEl) {
        statStudentsNoteEl.textContent =
          res.error && res.error.code === '42501'
            ? 'Not permitted by policy'
            : 'Could not be read';
      }
      return;
    }

    if (statStudentsEl) statStudentsEl.textContent = String(res.count);
  }

  async function loadTeachersStats() {
    if (statTeachersEl) statTeachersEl.textContent = '…';
    if (statTeachersNoteEl) statTeachersNoteEl.textContent = '';
    if (statActiveTeachersEl) statActiveTeachersEl.textContent = '…';
    if (statActiveTeachersNoteEl) statActiveTeachersNoteEl.textContent = '';

    // Total teachers
    const totalRes = await supabase
      .from('teacher_profiles')
      .select('id', { count: 'exact', head: true });

    if (totalRes.error || totalRes.count === null || totalRes.count === undefined) {
      console.error('[admin-dashboard] teachers count failed:', totalRes.error);
      if (statTeachersEl) statTeachersEl.textContent = '—';
      if (statTeachersNoteEl) {
        statTeachersNoteEl.textContent =
          totalRes.error && totalRes.error.code === '42501'
            ? 'Not permitted by policy'
            : 'Could not be read';
      }
      if (statActiveTeachersEl) statActiveTeachersEl.textContent = '—';
      if (statActiveTeachersNoteEl) {
        statActiveTeachersNoteEl.textContent =
          totalRes.error && totalRes.error.code === '42501'
            ? 'Not permitted by policy'
            : 'Could not be read';
      }
      return;
    }

    if (statTeachersEl) statTeachersEl.textContent = String(totalRes.count);

    // Active teachers
    const activeRes = await supabase
      .from('teacher_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    if (activeRes.error || activeRes.count === null || activeRes.count === undefined) {
      console.error('[admin-dashboard] active teachers count failed:', activeRes.error);
      if (statActiveTeachersEl) statActiveTeachersEl.textContent = '—';
      if (statActiveTeachersNoteEl) {
        statActiveTeachersNoteEl.textContent =
          activeRes.error && activeRes.error.code === '42501'
            ? 'Not permitted by policy'
            : 'Could not be read';
      }
      return;
    }

    if (statActiveTeachersEl) {
      statActiveTeachersEl.textContent = String(activeRes.count);
    }
  }

  async function loadStats() {
    // Run in parallel — none of these depend on each other.
    await Promise.all([
      loadStudentsCount(),
      loadTeachersStats()
    ]);

    // If ANY stat failed to load, show a gentle note so the admin
    // understands why they see "—" rather than a number.
    const anyMissing =
      (statStudentsEl && statStudentsEl.textContent === '—') ||
      (statTeachersEl && statTeachersEl.textContent === '—') ||
      (statActiveTeachersEl && statActiveTeachersEl.textContent === '—');

    if (anyMissing) {
      setAlert(
        'Some statistics could not be read from your account. ' +
        'This is usually a permissions (RLS) issue on the corresponding table. ' +
        'We will add the required admin read policies in the next step.',
        'info'
      );
    }
  }

  /* ----------------------------------------------------------
     11. Main
  ---------------------------------------------------------- */
  async function init() {
    const auth = await requireAdmin();
    if (!auth) return;   // redirect / fatal already handled

    renderIdentity(auth.profile);
    wireLogout();
    revealDashboard();

    await loadStats();
  }

  init();

})();