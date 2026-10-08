/* ============================================================
   ADD TEACHER — FORM LOGIC
   ------------------------------------------------------------
   This file does NOT handle authentication or the sidebar.
   Those are handled by admin/dashboard.js, which is loaded
   BEFORE this file in add-teacher.html.

   By the time this script runs:
     - The admin has been verified.
     - The shell is visible.
     - The logout button and sidebar are wired.

   This file only handles:
     1. Password visibility toggle.
     2. Client-side validation (required fields, email format,
        password length).
     3. Calling the create-teacher Edge Function.
     4. Showing success / error feedback.
     5. Preventing double submission.
     6. Resetting the form after a successful creation.
   ============================================================= */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. Config + client
  ---------------------------------------------------------- */
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    console.error('[add-teacher] SUPABASE_CONFIG missing.');
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[add-teacher] Supabase SDK not loaded.');
    return;
  }

  const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  /* ----------------------------------------------------------
     2. DOM references
  ---------------------------------------------------------- */
  const form        = document.getElementById('atForm');
  const submitBtn   = document.getElementById('atSubmitBtn');
  const resetBtn    = document.getElementById('atResetBtn');

  const fullNameEl  = document.getElementById('atFullName');
  const emailEl     = document.getElementById('atEmail');
  const passwordEl  = document.getElementById('atPassword');
  const schoolIdEl  = document.getElementById('atSchoolId');
  const subjectEl   = document.getElementById('atSubject');
  const phoneEl     = document.getElementById('atPhone');
  const joiningEl   = document.getElementById('atJoiningDate');

  const passwordToggle = document.getElementById('atPasswordToggle');

  const alertEl       = document.getElementById('atAlert');
  const successPanel  = document.getElementById('atSuccess');
  const successTextEl = document.getElementById('atSuccessText');
  const addAnotherBtn = document.getElementById('atAddAnotherBtn');

  if (!form || !submitBtn) return;

  /* ----------------------------------------------------------
     3. State
  ---------------------------------------------------------- */
  let isSubmitting = false;

  /* ----------------------------------------------------------
     4. Helpers
  ---------------------------------------------------------- */
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

  function setSubmitting(on) {
    isSubmitting = on;
    submitBtn.classList.toggle('is-loading', on);
    submitBtn.disabled = on;

    // Also disable the reset button while submitting, to prevent
    // the admin from clearing the form mid-request.
    if (resetBtn) resetBtn.disabled = on;

    // Disable all inputs while submitting.
    [fullNameEl, emailEl, passwordEl, schoolIdEl, subjectEl, phoneEl, joiningEl]
      .forEach(function (el) {
        if (el) el.disabled = on;
      });
  }

  function markInvalid(el, invalid) {
    if (!el) return;
    if (invalid) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }

  function clearFieldErrors() {
    [fullNameEl, emailEl, passwordEl, schoolIdEl, subjectEl, phoneEl, joiningEl]
      .forEach(function (el) { markInvalid(el, false); });
  }

  function isValidEmail(value) {
    // Simple, permissive check — the server is the real authority.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function resetForm() {
    form.reset();
    clearFieldErrors();
    setAlert(null);
    if (successPanel) successPanel.hidden = true;
    if (fullNameEl) fullNameEl.focus();
  }

  function showSuccess(teacherName) {
    if (!successPanel) return;
    if (successTextEl) {
      successTextEl.textContent =
        (teacherName ? teacherName + ' has been added. ' : 'The teacher has been added. ') +
        'The teacher can now log in using the email and password you provided.';
    }
    successPanel.hidden = false;
    successPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ----------------------------------------------------------
     5. Password visibility toggle
  ---------------------------------------------------------- */
  if (passwordToggle && passwordEl) {
    passwordToggle.addEventListener('click', function () {
      const isVisible = passwordEl.type === 'text';
      passwordEl.type = isVisible ? 'password' : 'text';
      passwordToggle.setAttribute('aria-pressed', String(!isVisible));
      passwordToggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
      passwordEl.focus();
    });
  }

  /* ----------------------------------------------------------
     6. Client-side validation
     ----------------------------------------------------------
     This runs BEFORE the Edge Function is called so obvious
     mistakes never leave the browser. The Edge Function still
     validates on the server.
  ---------------------------------------------------------- */
  function validateForm() {
    clearFieldErrors();

    const fullName = fullNameEl ? fullNameEl.value.trim() : '';
    const email    = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const schoolId = schoolIdEl ? schoolIdEl.value.trim() : '';

    let firstInvalid = null;

    if (!fullName) {
      markInvalid(fullNameEl, true);
      if (!firstInvalid) firstInvalid = fullNameEl;
    }

    if (!email) {
      markInvalid(emailEl, true);
      if (!firstInvalid) firstInvalid = emailEl;
    } else if (!isValidEmail(email)) {
      markInvalid(emailEl, true);
      if (!firstInvalid) firstInvalid = emailEl;
      setAlert('Please enter a valid email address.', 'error');
      if (firstInvalid && firstInvalid.focus) firstInvalid.focus();
      return false;
    }

    if (!password) {
      markInvalid(passwordEl, true);
      if (!firstInvalid) firstInvalid = passwordEl;
    } else if (password.length < 8) {
      markInvalid(passwordEl, true);
      if (!firstInvalid) firstInvalid = passwordEl;
      setAlert('Password must be at least 8 characters.', 'error');
      if (firstInvalid && firstInvalid.focus) firstInvalid.focus();
      return false;
    }

    if (!schoolId) {
      markInvalid(schoolIdEl, true);
      if (!firstInvalid) firstInvalid = schoolIdEl;
    }

    if (firstInvalid) {
      setAlert('Please fill in all required fields.', 'error');
      if (firstInvalid.focus) firstInvalid.focus();
      return false;
    }

    setAlert(null);
    return true;
  }

  /* ----------------------------------------------------------
     7. Submit handler
     ----------------------------------------------------------
     The Edge Function is called via supabase.functions.invoke,
     which automatically attaches the current session's JWT as
     the Authorization header. The Edge Function verifies the
     admin and creates the teacher. No service-role key is ever
     present in this file.
  ---------------------------------------------------------- */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validateForm()) return;

    // Confirm we have a session before calling the function.
    const sessionRes = await supabase.auth.getSession();
    if (sessionRes.error || !sessionRes.data || !sessionRes.data.session) {
      setAlert('Your session has expired. Please log in again.', 'error');
      return;
    }

    const payload = {
      email:        emailEl.value.trim(),
      password:     passwordEl.value,
      school_id:    schoolIdEl.value.trim(),
      full_name:    fullNameEl.value.trim(),
      subject:      subjectEl ? subjectEl.value.trim() : '',
      phone:        phoneEl ? phoneEl.value.trim() : '',
      joining_date: joiningEl ? joiningEl.value : ''
    };

    setAlert(null);
    if (successPanel) successPanel.hidden = true;
    setSubmitting(true);

    let data = null;
    let fnError = null;

    try {
      const result = await supabase.functions.invoke('create-teacher', {
        body: payload
      });
      data = result.data;
      fnError = result.error;
    } catch (err) {
      // Network failure, function not deployed, CORS, etc.
      console.error('[add-teacher] invoke threw:', err);
      fnError = err;
    }

    setSubmitting(false);

    // The Edge Function returns JSON on success and on failure.
    // We handle:
    //   - fnError              → transport / invocation problem
    //   - data.error           → business error from the function
    //   - data.success === true → success
    if (fnError) {
      // Try to read a message the function may have placed on data.
      const msg = (data && (data.error || data.message)) || null;
      setAlert(
        msg || 'Could not create the teacher. Please check your connection and try again.',
        'error'
      );
      return;
    }

    if (data && data.error) {
      // Business-level error from inside the function.
      // Common ones we surface nicely:
      const raw = String(data.error);

      if (/school[_ ]?id/i.test(raw) && /exist|duplicate|unique/i.test(raw)) {
        setAlert('A teacher with this School ID already exists. Please use a different School ID.', 'error');
        markInvalid(schoolIdEl, true);
      } else if (/email/i.test(raw) && /exist|registered|duplicate/i.test(raw)) {
        setAlert('This email is already registered to another account.', 'error');
        markInvalid(emailEl, true);
      } else if (/password/i.test(raw)) {
        setAlert('The password does not meet the requirements. Please choose a stronger password.', 'error');
        markInvalid(passwordEl, true);
      } else if (/admin/i.test(raw) || /unauthor/i.test(raw) || /forbidden/i.test(raw)) {
        setAlert('You are not authorised to create teacher accounts. Please sign in as an active admin.', 'error');
      } else if (/email/i.test(raw) && /invalid/i.test(raw)) {
        setAlert('Please enter a valid email address.', 'error');
        markInvalid(emailEl, true);
      } else {
        setAlert('Could not create the teacher: ' + raw, 'error');
      }
      return;
    }

    // Success
    const teacherName = (data && (data.full_name || data.teacher_name)) || payload.full_name;
    setAlert('Teacher created successfully.', 'success');
    form.reset();
    clearFieldErrors();
    showSuccess(teacherName);
  });

  /* ----------------------------------------------------------
     8. Reset button
  ---------------------------------------------------------- */
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      resetForm();
    });
  }

  /* ----------------------------------------------------------
     9. Add another button (in the success panel)
  ---------------------------------------------------------- */
  if (addAnotherBtn) {
    addAnotherBtn.addEventListener('click', function () {
      if (successPanel) successPanel.hidden = true;
      resetForm();
    });
  }

  /* ----------------------------------------------------------
     10. Clear field error while typing
  ---------------------------------------------------------- */
  [fullNameEl, emailEl, passwordEl, schoolIdEl, subjectEl, phoneEl, joiningEl]
    .forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () {
        markInvalid(el, false);
      });
    });

})();

