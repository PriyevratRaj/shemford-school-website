/* ============================================================
   STUDENT DASHBOARD — AUTH GUARD + PROFILE
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     Supabase config check
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
      'The Supabase CDN script did not load.'
    );
    return;
  }

  const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  /* ----------------------------------------------------------
     DOM references
  ---------------------------------------------------------- */

  const guard = document.getElementById('dashGuard');
  const shell = document.getElementById('dashShell');

  const nameEl = document.getElementById('dashUserName');
  const initialEl = document.getElementById('dashUserInitial');
  const logoutBtn = document.getElementById('dashLogout');
  const notifBtn = document.getElementById('dashNotificationsBtn');

  const menuBtn = document.getElementById('dashMenuBtn');
  const sidebar = document.getElementById('dashSidebar');
  const backdrop = document.getElementById('dashBackdrop');

  const greetingEl = document.getElementById('greeting');
  const welcomeNameEl = document.getElementById('welcomeName');
  const factSchoolEl = document.getElementById('factSchoolId');
  const factStatusEl = document.getElementById('factStatus');

  const profileNameEl = document.getElementById('profileName');
  const profileSchoolEl = document.getElementById('profileSchoolId');
  const profileStatusEl = document.getElementById('profileStatus');
  const profileAvatarEl = document.getElementById('profileAvatar');

  /* ----------------------------------------------------------
     Helpers
  ---------------------------------------------------------- */

  function redirectTo(path) {
    window.location.replace(path);
  }

  function setText(el, value) {
    if (!el) return;

    const v =
      value === null || value === undefined
        ? ''
        : String(value).trim();

    el.textContent = v || '–';
  }

  function initialOf(name) {
    const text = (name || '').trim();
    return text ? text[0].toUpperCase() : '–';
  }

  function capitalize(str) {
    if (!str) return '–';

    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function greetingForHour(hour) {
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';

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
      '</div></div>';
  }

  /* ----------------------------------------------------------
     Mobile sidebar
  ---------------------------------------------------------- */

  function openSidebar() {
    if (!sidebar || !backdrop) return;

    sidebar.classList.add('is-open');
    backdrop.hidden = false;

    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', 'true');
    }
  }

  function closeSidebar() {
    if (!sidebar || !backdrop) return;

    sidebar.classList.remove('is-open');
    backdrop.hidden = true;

    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      const isOpen =
        sidebar && sidebar.classList.contains('is-open');

      if (isOpen) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeSidebar);
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeSidebar();
    }
  });

  /* ----------------------------------------------------------
     Notifications
  ---------------------------------------------------------- */

  if (notifBtn) {
    notifBtn.addEventListener('click', function () {
      window.location.href = 'announcements.html';
    });
  }

  /* ----------------------------------------------------------
     Render student profile
  ---------------------------------------------------------- */

  function renderProfile(profile) {
    const name = profile.full_name || 'Student';
    const first =
      name.trim().split(/\s+/)[0] || name;

    const initial = initialOf(name);
    const status = capitalize(profile.status);
    const classSectionEl = document.getElementById('factClassSection');
    setText(classSectionEl, profile.class_section);

    setText(nameEl, name);
    setText(initialEl, initial);

    setText(
      greetingEl,
      greetingForHour(new Date().getHours())
    );

    setText(welcomeNameEl, first);
    setText(factSchoolEl, profile.school_id);
    setText(factStatusEl, status);

    setText(profileNameEl, name);
    setText(profileSchoolEl, profile.school_id);
    setText(profileStatusEl, status);
    setText(profileAvatarEl, initial);

    if (profile.status !== 'active') {
      if (factStatusEl) {
        factStatusEl.classList.add('is-inactive');
      }

      if (profileStatusEl) {
        profileStatusEl.classList.add('is-inactive');
      }
    }

    document.title =
      first + ' — Student Dashboard';
  }

  function revealDashboard() {
    if (shell) {
      shell.hidden = false;
    }

    if (guard) {
      guard.remove();
    }
  }

  /* ----------------------------------------------------------
     MAIN AUTH FLOW
  ---------------------------------------------------------- */

  async function init() {

    /* 1. Check session */

    const sessionResult =
      await supabase.auth.getSession();

    if (sessionResult.error) {
      console.error(
        '[student-dashboard] getSession error:',
        sessionResult.error
      );

      redirectTo('../login.html');
      return;
    }

    const session =
      sessionResult.data &&
      sessionResult.data.session;

    if (!session || !session.user) {
      redirectTo('../login.html');
      return;
    }

    /* 2. Load profile */

    const profileResult =
      await supabase
        .from('profiles')
        .select(
          'id, school_id, full_name, role, class_section, status'
        )
        .eq('id', session.user.id)
        .single();

    if (
      profileResult.error ||
      !profileResult.data
    ) {
      console.error(
        '[student-dashboard] profile load failed:',
        profileResult.error
      );

      await supabase.auth.signOut();
      redirectTo('../login.html');
      return;
    }

    const profile = profileResult.data;

    /* 3. Check account status */

    if (profile.status !== 'active') {
      await supabase.auth.signOut();

      showFatal(
        'Account ' +
          (profile.status || 'inactive'),
        'Your account is not active. Please contact the school office.'
      );

      return;
    }

    /* 4. Check role */

    if (profile.role !== 'student') {

      if (profile.role === 'teacher') {
        redirectTo('../teacher/dashboard.html');
        return;
      }

      if (profile.role === 'admin') {
        redirectTo('../admin/dashboard.html');
        return;
      }

      await supabase.auth.signOut();
      redirectTo('../login.html');

      return;
    }

    /* 5. Everything is good */

    renderProfile(profile);
    revealDashboard();

    /* 6. Logout */

    if (logoutBtn) {
      logoutBtn.addEventListener(
        'click',
        async function () {

          logoutBtn.disabled = true;

          try {
            await supabase.auth.signOut();
          } catch (error) {
            console.error(
              '[student-dashboard] signOut error:',
              error
            );
          }

          redirectTo('../login.html');
        }
      );
    }
  }

  init();

})();