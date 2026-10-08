/* ============================================================
   ADD STUDENT — FORM LOGIC
   ------------------------------------------------------------
   This file does NOT handle authentication or the sidebar.
   Those are handled by admin/dashboard.js, which is loaded
   BEFORE this file in add-student.html.

   This file only handles:
     1. Password visibility toggle.
     2. Client-side validation.
     3. Calling the create-student Edge Function.
     4. Showing success / error feedback.
     5. Preventing double submission.
     6. Resetting the form after successful creation.

   The phone field is collected in the UI but NOT sent to the
   Edge Function, because the current create-student function
   does not accept or store it.
   ============================================================= */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. Config + client
  ---------------------------------------------------------- */
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    console.error('[add-student] SUPABASE_CONFIG missing.');
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[add-student] Supabase SDK not loaded.');
    return;
  }

  const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  /* ----------------------------------------------------------
     2. DOM references
  ---------------------------------------------------------- */
  const form        = document.getElementById('asForm');
  const submitBtn   = document.getElementById('asSubmitBtn');
  const resetBtn    = document.getElementById('asResetBtn');

  const fullNameEl  = document.getElementById('asFullName');
  const emailEl     = document.getElementById('asEmail');
  const passwordEl  = document.getElementById('asPassword');
  const schoolIdEl  = document.getElementById('asSchoolId');
  const classSecEl  = document.getElementById('asClassSection');
  const rollNoEl    = document.getElementById('asRollNo');
  const phoneEl     = document.getElementById('asPhone');

  const passwordToggle = document.getElementById('asPasswordToggle');

  const alertEl       = document.getElementById('asAlert');
  const successPanel  = document.getElementById('asSuccess');
  const addAnotherBtn = document.getElementById('asAddAnotherBtn');

  const successNameEl     = document.getElementById('asSuccessName');
  const successSchoolIdEl = document.getElementById('asSuccessSchoolId');
  const successClassEl    = document.getElementById('asSuccessClass');
  const successRollEl     = document.getElementById('asSuccessRoll');
  const successEmailEl    = document.getElementById('asSuccessEmail');

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
    if (resetBtn) resetBtn.disabled = on;

    [fullNameEl, emailEl, passwordEl, schoolIdEl, classSecEl, rollNoEl, phoneEl]
      .forEach(function (el) { if (el) el.disabled = on; });
  }

  function markInvalid(el, invalid) {
    if (!el) return;
    if (invalid) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }

  function clearFieldErrors() {
    [fullNameEl, emailEl, passwordEl, schoolIdEl, classSecEl, rollNoEl, phoneEl]
      .forEach(function (el) { markInvalid(el, false); });
  }

  function isValidEmail(value) {
    // Simple, permissive check. Server is the real authority.
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function resetForm() {
    form.reset();
    clearFieldErrors();
    setAlert(null);
    if (successPanel) successPanel.hidden = true;
    if (fullNameEl) fullNameEl.focus();
  }

  function setTextSafe(el, value) {
    if (!el) return;
    const v = (value === null || value === undefined) ? '' : String(value);
    el.textContent = v || '—';
  }

  function showSuccess(data) {
    if (!successPanel) return;

    setTextSafe(successNameEl,     data.full_name);
    setTextSafe(successSchoolIdEl, data.school_id);
    setTextSafe(successClassEl,    data.class_section);
    setTextSafe(successRollEl,     data.roll_no);
    setTextSafe(successEmailEl,    data.email);

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
     6. Validation
  ---------------------------------------------------------- */
  function validateForm() {
    clearFieldErrors();

    const fullName = fullNameEl ? fullNameEl.value.trim() : '';
    const email    = emailEl ? emailEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const schoolId = schoolIdEl ? schoolIdEl.value.trim() : '';
    const classSec = classSecEl ? classSecEl.value.trim() : '';
    const rollRaw  = rollNoEl ? rollNoEl.value.trim() : '';

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
      setAlert('Please enter a valid email address.', 'error');
      emailEl.focus();
      return false;
    }

    if (!password) {
      markInvalid(passwordEl, true);
      if (!firstInvalid) firstInvalid = passwordEl;
    } else if (password.length < 8) {
      markInvalid(passwordEl, true);
      setAlert('Password must be at least 8 characters.', 'error');
      passwordEl.focus();
      return false;
    }

    if (!schoolId) {
      markInvalid(schoolIdEl, true);
      if (!firstInvalid) firstInvalid = schoolIdEl;
    }

    if (!classSec) {
      markInvalid(classSecEl, true);
      if (!firstInvalid) firstInvalid = classSecEl;
    }

    if (!rollRaw) {
      markInvalid(rollNoEl, true);
      if (!firstInvalid) firstInvalid = rollNoEl;
    } else {
      const n = Number(rollRaw);
      if (!Number.isInteger(n) || n < 1) {
        markInvalid(rollNoEl, true);
        setAlert('Roll Number must be a positive whole number.', 'error');
        rollNoEl.focus();
        return false;
      }
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
     7. Submit
  ---------------------------------------------------------- */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validateForm()) return;

    // Ensure we still have a session before invoking the function.
    const sessionRes = await supabase.auth.getSession();
    if (sessionRes.error || !sessionRes.data || !sessionRes.data.session) {
      setAlert('Your session has expired. Please log in again.', 'error');
      return;
    }

    const payload = {
      email:         emailEl.value.trim(),
      password:      passwordEl.value,
      school_id:     schoolIdEl.value.trim(),
      full_name:     fullNameEl.value.trim(),
      class_section: classSecEl.value.trim(),
      roll_no:       parseInt(rollNoEl.value, 10)
      // NOTE: phone is intentionally NOT sent — the create-student
      // Edge Function does not accept it.
    };

    setAlert(null);
    if (successPanel) successPanel.hidden = true;
    setSubmitting(true);

    let data = null;
    let fnError = null;

    try {
      const result = await supabase.functions.invoke('create-student', {
        body: payload
      });
      data = result.data;
      fnError = result.error;
    } catch (err) {
      console.error('[add-student] invoke threw:', err);
      fnError = err;
    }

    setSubmitting(false);

    /* --------------------------------------------------------
       Error handling
       - fnError       → transport / invocation problem
       - data.error    → business error from the Edge Function
       - success       → data.success !== false
    -------------------------------------------------------- */
    if (fnError) {
      const msg = (data && (data.error || data.message)) || null;
      setAlert(
        msg || 'Could not create the student. Please check your connection and try again.',
        'error'
      );
      return;
    }

    if (data && data.error) {
      const raw = String(data.error);

      if (/school[_\s-]?id/i.test(raw) && /exist|duplicate|unique/i.test(raw)) {
        setAlert('A student with this School ID already exists. Please use a different School ID.', 'error');
        markInvalid(schoolIdEl, true);
      } else if (/email/i.test(raw) && /exist|registered|duplicate/i.test(raw)) {
        setAlert('This email is already registered to another account.', 'error');
        markInvalid(emailEl, true);
      } else if (/email/i.test(raw) && /invalid/i.test(raw)) {
        setAlert('Please enter a valid email address.', 'error');
        markInvalid(emailEl, true);
      } else if (/password/i.test(raw)) {
        setAlert('The password does not meet the requirements. Please choose a stronger password.', 'error');
        markInvalid(passwordEl, true);
      } else if (/roll/i.test(raw)) {
        setAlert('The Roll Number is not valid. Please enter a positive whole number.', 'error');
        markInvalid(rollNoEl, true);
      } else if (/class/i.test(raw)) {
        setAlert('The Class & Section value is not valid.', 'error');
        markInvalid(classSecEl, true);
      } else if (/admin/i.test(raw) || /unauthor/i.test(raw) || /forbidden/i.test(raw) || /denied/i.test(raw)) {
        setAlert('You are not authorised to create student accounts. Please sign in as an active admin.', 'error');
      } else if (/session|token|jwt/i.test(raw)) {
        setAlert('Your session has expired. Please log in again.', 'error');
      } else {
        setAlert('Could not create the student: ' + raw, 'error');
      }
      return;
    }

    // Success
    setAlert('Student account created successfully.', 'success');

    // Capture the details BEFORE resetting the form.
    const details = {
      full_name:     payload.full_name,
      school_id:     payload.school_id,
      class_section: payload.class_section,
      roll_no:       payload.roll_no,
      email:         payload.email
    };

    // Try to prefer values returned by the Edge Function, if any.
    if (data) {
      details.full_name     = data.full_name     || details.full_name;
      details.school_id     = data.school_id     || details.school_id;
      details.class_section = data.class_section || details.class_section;
      details.roll_no       = (data.roll_no !== undefined && data.roll_no !== null)
                              ? data.roll_no : details.roll_no;
      details.email         = data.email         || details.email;
    }

    form.reset();
    clearFieldErrors();
    showSuccess(details);
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
     9. "Add Another Student" button
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
  [fullNameEl, emailEl, passwordEl, schoolIdEl, classSecEl, rollNoEl, phoneEl]
    .forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () {
        markInvalid(el, false);
      });
    });

})();