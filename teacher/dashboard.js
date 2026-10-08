/* ============================================================
   TEACHER DASHBOARD — AUTH GUARD + PROFILE
   ------------------------------------------------------------
   Flow:
     1. Is the user signed in?           → no  → ../login.html
     2. Can we load their profile row?   → no  → sign out → login
     3. Is their status 'active'?        → no  → sign out → message
     4. Is their role 'teacher'?         → no  → redirect to the
                                                  correct dashboard
     5. All good → render + reveal + wire logout

   Note: this JavaScript role check is a frontend guard only.
   Real security lives in Supabase Row Level Security.
   ============================================================= */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     Config check — we need SUPABASE_CONFIG and the SDK
  ---------------------------------------------------------- */
  if (
    !window.SUPABASE_CONFIG ||
    !window.SUPABASE_CONFIG.url ||
    !window.SUPABASE_CONFIG.anonKey
  ) {
    showFatal(
      'Configuration missing',
      'supabase-config.js did not load, or its values are empty. ' +
      'Make sure the file is in the project root.'
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
     DOM references — grab everything once.
     Every element is optional; helpers guard against null.
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

  const greetingEl    = document.getElementById('greeting');
  const welcomeNameEl = document.getElementById('welcomeName');
  const factSchoolEl  = document.getElementById('factSchoolId');
  const factStatusEl  = document.getElementById('factStatus');
  const factClassEl   = document.getElementById('factClassSection');

  const profileNameEl   = document.getElementById('profileName');
  const profileSchoolEl = document.getElementById('profileSchoolId');
  const profileStatusEl = document.getElementById('profileStatus');
  const profileAvatarEl = document.getElementById('profileAvatar');

  /* ----------------------------------------------------------
     Small helpers
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

  function capitalize(str) {
    if (!str) return '–';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function greetingForHour(h) {
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  function showFatal(title, message) {
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'padding:2rem;font-family:Inter,system-ui,sans-serif;background:#F9FAFB;">' +
        '<div style="max-width:520px;background:#fff;border:1px solid #E5E7EB;' +
        'border-radius:14px;padding:2rem;">' +
          '<h1 style="font-size:1.25rem;margin:0 0 .5rem;color:#111827;">' +
            title +
          '</h1>' +
          '<p style="margin:0;color:#6B7280;line-height:1.6;">' +
            message +
          '</p>' +
        '</div>' +
      '</div>';
  }

  /* ----------------------------------------------------------
     Where each role belongs.
     Note: 'teacher' is intentionally NOT mapped here. A teacher
     must never be redirected to teacher/dashboard.html — that
     would cause a redirect loop.
  ---------------------------------------------------------- */
  const OTHER_DASHBOARDS = {
    student: '../student/dashboard.html',
    admin:   '../admin/dashboard.html'
  };

  /* ----------------------------------------------------------
     Mobile sidebar
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

  if (backdrop) {
    backdrop.addEventListener('click', closeSidebar);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });

  /* ----------------------------------------------------------
     Notifications button — goes to announcements page
  ---------------------------------------------------------- */
  if (notifBtn) {
    notifBtn.addEventListener('click', function () {
      window.location.href = 'announcements.html';
    });
  }

  /* ----------------------------------------------------------
     Fill in the UI once we have the profile
  ---------------------------------------------------------- */
  function renderProfile(profile) {
    const name    = profile.full_name || 'Teacher';
    const first   = name.trim().split(/\s+/)[0] || name;
    const initial = initialOf(name);
    const status  = capitalize(profile.status);

    // Header
    setText(nameEl, name);
    setText(initialEl, initial);

    // Welcome block
    setText(greetingEl, greetingForHour(new Date().getHours()));
    setText(welcomeNameEl, first);
    setText(factSchoolEl, profile.school_id);
    setText(factStatusEl, status);

    // Optional: class section if the HTML has it
    if (factClassEl) {
      setText(factClassEl, profile.class_section || '–');
    }

    // Profile card
    setText(profileNameEl, name);
    setText(profileSchoolEl, profile.school_id);
    setText(profileStatusEl, status);
    setText(profileAvatarEl, initial);

    // Mark inactive statuses in red
    if (profile.status !== 'active') {
      if (factStatusEl) factStatusEl.classList.add('is-inactive');
      if (profileStatusEl) profileStatusEl.classList.add('is-inactive');
    }

    document.title = first + ' — Teacher Dashboard';
  }

  function revealDashboard() {
    if (shell) shell.hidden = false;
    if (guard) guard.remove();
  }

  /* ----------------------------------------------------------
     Wire the Logout button (only once, only if present)
  ---------------------------------------------------------- */
  function wireLogout() {
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', async function () {
      logoutBtn.disabled = true;
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('[teacher-dashboard] signOut error:', err);
      }
      redirectTo('../login.html');
    });
  }

  /* ----------------------------------------------------------
     Main flow
  ---------------------------------------------------------- */
  async function init() {

    /* 1. Session ---------------------------------------------------- */
    const sessionResult = await supabase.auth.getSession();

    if (sessionResult.error) {
      console.error('[teacher-dashboard] getSession error:', sessionResult.error);
      redirectTo('../login.html');
      return;
    }

    const session = sessionResult.data && sessionResult.data.session;
    if (!session || !session.user) {
      redirectTo('../login.html');
      return;
    }

    /* 2. Profile --------------------------------------------------- */
    const profileResult = await supabase
      .from('profiles')
      .select('id, school_id, full_name, role, class_section, status')
      .eq('id', session.user.id)
      .single();

    if (profileResult.error || !profileResult.data) {
      console.error('[teacher-dashboard] profile load failed:', profileResult.error);
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      redirectTo('../login.html');
      return;
    }

    const profile = profileResult.data;

    /* 3. Status ---------------------------------------------------- */
    if (profile.status !== 'active') {
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      showFatal(
        'Account ' + (profile.status || 'inactive'),
        'Your account is not active. Please contact the school office.'
      );
      return;
    }

    /* 4. Role ------------------------------------------------------ */
    if (profile.role !== 'teacher') {
      const target = OTHER_DASHBOARDS[profile.role];
      if (target) {
        redirectTo(target);
      } else {
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        redirectTo('../login.html');
      }
      return;
    }

    /* 5. Success --------------------------------------------------- */
    renderProfile(profile);
    revealDashboard();
    wireLogout();
  }

  init();

})();