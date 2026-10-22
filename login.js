/* ============================================================
   SCHOOL LOGIN — FRONTEND CONTROLLER
   ------------------------------------------------------------
   Responsibilities:
     ✓ Validate email + password
     ✓ Sign in with Supabase Auth
     ✓ Find Student / Teacher / Admin / Accountant profile
     ✓ Check role + account status
     ✓ Redirect to correct dashboard

   Profile tables checked in order:
     1. profiles            → role: student
     2. teacher_profiles    → role: teacher
     3. admin_profiles      → role: admin
     4. accountant_profiles → role: accountant

   Only the first matching profile is used. If no profile
   exists in any of the four tables, the user is signed out.
   ============================================================ */

(function () {
  'use strict';

  const { url, anonKey } = window.SUPABASE_CONFIG;

  const supabase = window.supabase.createClient(url, anonKey);

  const form       = document.getElementById('loginForm');
  const emailEl    = document.getElementById('email');
  const passwordEl = document.getElementById('password');
  const submitBtn  = document.getElementById('loginSubmit');
  const alertEl    = document.getElementById('formAlert');
  const toggleBtn  = document.getElementById('passwordToggle');

  if (!form || !emailEl || !passwordEl || !submitBtn || !alertEl) {
    return;
  }

  /* ----------------------------------------------------------
     ALERT
     ---------------------------------------------------------- */

  const setAlert = (message, variant) => {
    if (!message) {
      alertEl.hidden = true;
      alertEl.textContent = '';
      alertEl.classList.remove('is-error', 'is-info');
      return;
    }

    alertEl.hidden = false;
    alertEl.textContent = message;

    alertEl.classList.remove('is-error', 'is-info');

    if (variant) {
      alertEl.classList.add(`is-${variant}`);
    }
  };

  /* ----------------------------------------------------------
     LOADING STATE
     ---------------------------------------------------------- */

  const setLoading = (isLoading) => {
    submitBtn.classList.toggle('is-loading', isLoading);
    submitBtn.disabled = isLoading;

    emailEl.disabled = isLoading;
    passwordEl.disabled = isLoading;
  };

  /* ----------------------------------------------------------
     INVALID FIELD
     ---------------------------------------------------------- */

  const markInvalid = (el, invalid) => {
    if (invalid) {
      el.setAttribute('aria-invalid', 'true');
    } else {
      el.removeAttribute('aria-invalid');
    }
  };

  /* ----------------------------------------------------------
     PASSWORD VISIBILITY
     ---------------------------------------------------------- */

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isVisible = passwordEl.type === 'text';

      passwordEl.type = isVisible ? 'password' : 'text';

      toggleBtn.setAttribute(
        'aria-pressed',
        String(!isVisible)
      );

      toggleBtn.setAttribute(
        'aria-label',
        isVisible ? 'Show password' : 'Hide password'
      );

      passwordEl.focus();
    });
  }

  /* ----------------------------------------------------------
     VALIDATION
     ---------------------------------------------------------- */

  const validate = () => {
    let valid = true;

    const email = emailEl.value.trim();
    const password = passwordEl.value;

    markInvalid(emailEl, false);
    markInvalid(passwordEl, false);

    if (!email) {
      markInvalid(emailEl, true);
      valid = false;
    }

    if (!password) {
      markInvalid(passwordEl, true);
      valid = false;
    }

    if (!valid) {
      setAlert(
        'Please enter your email address and password.',
        'error'
      );

      if (!email) {
        emailEl.focus();
      } else {
        passwordEl.focus();
      }
    }

    return valid;
  };

  /* ----------------------------------------------------------
     HELPER: look up a profile row from one table
     ----------------------------------------------------------
     Returns one of:
       { kind: 'found',    profile: {...} }
       { kind: 'missing' }                → no row
       { kind: 'error',    message: '…' } → query failed
  ---------------------------------------------------------- */
  const lookupProfile = async (table, userId) => {
    const { data, error } = await supabase
      .from(table)
      .select('role, status')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error(`[login] ${table} lookup error:`, error);
      return { kind: 'error', message: error.message };
    }

    if (!data) {
      return { kind: 'missing' };
    }

    return { kind: 'found', profile: data };
  };

  /* ----------------------------------------------------------
     LOGIN
     ---------------------------------------------------------- */

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    setAlert(null);

    if (!validate()) {
      return;
    }

    const email = emailEl.value.trim();
    const password = passwordEl.value;

    setLoading(true);

    try {

      /* ------------------------------------------------------
         SUPABASE LOGIN
         ------------------------------------------------------ */

      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email,
          password: password
        });

      if (error) {
        console.error('[login] Supabase error:', error);

        setAlert(error.message, 'error');
        setLoading(false);
        return;
      }

      if (!data || !data.user) {
        setAlert(
          'Unable to sign in. Please try again.',
          'error'
        );

        setLoading(false);
        return;
      }

      const userId = data.user.id;

      
      // LIBRARIAN PRE-CHECK
      const librarianRes = await supabase
        .from('librarian_profiles')
        .select('id, is_active')
        .eq('id', userId)
        .maybeSingle();

      if (librarianRes.error) {
        console.error(
          '[login] librarian_profiles lookup error:',
          librarianRes.error
        );

        await supabase.auth.signOut();

        setAlert(
          'We could not verify your school profile right now. Please try again or contact the school office.',
          'error'
        );

        setLoading(false);
        return;
      }

      if (librarianRes.data) {
        if (librarianRes.data.is_active !== true) {
          await supabase.auth.signOut();

          setAlert(
            'Your librarian account is not active. Please contact the school office.',
            'error'
          );

          setLoading(false);
          return;
        }

        const libProfileRes = await supabase
          .from('profiles')
          .select('role, status')
          .eq('id', userId)
          .maybeSingle();

        if (libProfileRes.error) {
          console.error(
            '[login] librarian profiles lookup error:',
            libProfileRes.error
          );

          await supabase.auth.signOut();

          setAlert(
            'We could not verify your school profile right now. Please try again or contact the school office.',
            'error'
          );

          setLoading(false);
          return;
        }

        if (
          !libProfileRes.data ||
          libProfileRes.data.role !== 'librarian' ||
          libProfileRes.data.status !== 'active'
        ) {
          await supabase.auth.signOut();

          setAlert(
            'Your account has an invalid role. Please contact the school office.',
            'error'
          );

          setLoading(false);
          return;
        }

        window.location.replace('librarian/dashboard.html');
        return;
      }
      // END LIBRARIAN PRE-CHECK


      /* ------------------------------------------------------
         ORDER OF PROFILE CHECKS
         ------------------------------------------------------
         Each entry describes one role. We iterate through them
         in order and stop at the first table that contains a
         matching row. The `role` field is compared exactly;
         the `status` must be "active".
      ------------------------------------------------------ */
      const roleConfig = [
        {
          table: 'profiles',
          role: 'student',
          dashboard: 'student/dashboard.html',
          label: 'school',
          inactiveMessage:
            'Your school account is not active. Please contact the school office.'
        },
        {
          table: 'teacher_profiles',
          role: 'teacher',
          dashboard: 'teacher/dashboard.html',
          label: 'teacher',
          inactiveMessage:
            'Your teacher account is not active. Please contact the school office.'
        },
        {
          table: 'admin_profiles',
          role: 'admin',
          dashboard: 'admin/dashboard.html',
          label: 'admin',
          inactiveMessage:
            'Your admin account is not active. Please contact the school office.'
        },
        {
          table: 'accountant_profiles',
          role: 'accountant',
          dashboard: 'accountant/dashboard.html',
          label: 'accountant',
          inactiveMessage:
            'Your accountant account is not active. Please contact the school office.'
        }
      ];

      for (const role of roleConfig) {

        const result = await lookupProfile(role.table, userId);

        /* ------------------------------------------------
           Query failure — do NOT silently treat as missing.
           Sign out and tell the user something went wrong.
           ------------------------------------------------ */
        if (result.kind === 'error') {
          await supabase.auth.signOut();

          setAlert(
            'We could not verify your school profile right now. Please try again or contact the school office.',
            'error'
          );

          setLoading(false);
          return;
        }

        /* ------------------------------------------------
           No row in this table — try the next one.
           ------------------------------------------------ */
        if (result.kind === 'missing') {
          continue;
        }

        /* ------------------------------------------------
           Found a profile — validate status and role.
           ------------------------------------------------ */
        const profile = result.profile;

        if (profile.status !== 'active') {
          await supabase.auth.signOut();

          setAlert(role.inactiveMessage, 'error');
          setLoading(false);
          return;
        }

        if (profile.role !== role.role) {
          await supabase.auth.signOut();

          setAlert(
            'Your account has an invalid role. Please contact the school office.',
            'error'
          );

          setLoading(false);
          return;
        }

        /* ------------------------------------------------
           Valid profile — redirect to the right dashboard.
           ------------------------------------------------ */
        window.location.replace(role.dashboard);
        return;
      }

      /* ------------------------------------------------------
         NO PROFILE FOUND IN ANY TABLE
         ------------------------------------------------------ */

      console.error(
        '[login] No student, teacher, admin, accountant, or librarian profile found.'
      );

      await supabase.auth.signOut();

      setAlert(
        'Your account exists, but your school profile could not be found. Please contact the school office.',
        'error'
      );

      setLoading(false);

    } catch (err) {

      console.error('[login] Unexpected error:', err);

      setAlert(
        'Unable to sign in. Please try again.',
        'error'
      );

      setLoading(false);
    }
  });

  /* ----------------------------------------------------------
     CLEAR ERROR WHILE TYPING
     ---------------------------------------------------------- */

  [emailEl, passwordEl].forEach((el) => {

    el.addEventListener('input', () => {

      markInvalid(el, false);

      if (
        !alertEl.hidden &&
        alertEl.classList.contains('is-error')
      ) {
        setAlert(null);
      }

    });

  });

})();