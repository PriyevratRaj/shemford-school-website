/* ============================================================
   ADD ACCOUNTANT — FORM LOGIC
   ------------------------------------------------------------
   This file does NOT handle authentication or the sidebar.
   Those are handled by admin/dashboard.js, which is loaded
   BEFORE this file in add-accountant.html.

   By the time this script runs:
     - The admin has been verified.
     - The shell is visible.
     - The logout button and sidebar are wired.

   This file only handles:
     1. Password visibility toggles (both password fields).
     2. Client-side validation (required fields, email format,
        password length, matching passwords).
     3. Calling the create-accountant Edge Function.
     4. Showing success / error feedback.
     5. Preventing double submission.
     6. Resetting the form after a successful creation.

   The Confirm Password field is used ONLY for client-side
   validation. It is never included in the payload sent to the
   Edge Function. The Edge Function receives exactly:
     { full_name, email, password }
   ============================================================= */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. Config + client
  ---------------------------------------------------------- */
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    console.error('[add-accountant] SUPABASE_CONFIG missing.');
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[add-accountant] Supabase SDK not loaded.');
    return;
  }

  const supabase = window.supabase.createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey
  );

  /* ----------------------------------------------------------
     2. DOM references
  ---------------------------------------------------------- */
  const form               = document.getElementById('aaForm');
  const submitBtn          = document.getElementById('aaSubmitBtn');
  const resetBtn           = document.getElementById('aaResetBtn');

  const fullNameEl         = document.getElementById('aaFullName');
  const emailEl            = document.getElementById('aaEmail');
  const passwordEl         = document.getElementById('aaPassword');
  const confirmPasswordEl  = document.getElementById('aaConfirmPassword');

  const passwordToggle        = document.getElementById('aaPasswordToggle');
  const confirmPasswordToggle = document.getElementById('aaConfirmPasswordToggle');

  const alertEl       = document.getElementById('aaAlert');
  const successPanel  = document.getElementById('aaSuccess');
  const successTextEl = document.getElementById('aaSuccessText');
  const addAnotherBtn = document.getElementById('aaAddAnotherBtn');

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

    // Disable the reset button too so the admin can't clear
    // the form mid-request.
    if (resetBtn) resetBtn.disabled = on;

    // Disable all inputs while submitting.
    [fullNameEl, emailEl, passwordEl, confirmPasswordEl]
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
    [fullNameEl, emailEl, passwordEl, confirmPasswordEl]
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
    // Reset both visibility toggles to their default "hidden" state.
    if (passwordEl) passwordEl.type = 'password';
    if (confirmPasswordEl) confirmPasswordEl.type = 'password';
    if (passwordToggle) {
      passwordToggle.setAttribute('aria-pressed', 'false');
      passwordToggle.setAttribute('aria-label', 'Show password');
    }
    if (confirmPasswordToggle) {
      confirmPasswordToggle.setAttribute('aria-pressed', 'false');
      confirmPasswordToggle.setAttribute('aria-label', 'Show password');
    }
    if (fullNameEl) fullNameEl.focus();
  }

  function showSuccess(accountantName) {
    if (!successPanel) return;
    if (successTextEl) {
      successTextEl.textContent =
        (accountantName ? accountantName + ' has been added. ' : 'The accountant has been added. ') +
        'The accountant can now log in using the email and password you provided.';
    }
    successPanel.hidden = false;
    successPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ----------------------------------------------------------
     5. Password visibility toggles
     ----------------------------------------------------------
     Each toggle controls only its own input. They are
     independent so the admin can reveal one field without
     revealing the other.
  ---------------------------------------------------------- */
  function wirePasswordToggle(toggleBtn, inputEl) {
    if (!toggleBtn || !inputEl) return;
    toggleBtn.addEventListener('click', function () {
      const isVisible = inputEl.type === 'text';
      inputEl.type = isVisible ? 'password' : 'text';
      toggleBtn.setAttribute('aria-pressed', String(!isVisible));
      toggleBtn.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
      inputEl.focus();
    });
  }

  wirePasswordToggle(passwordToggle, passwordEl);
  wirePasswordToggle(confirmPasswordToggle, confirmPasswordEl);

  /* ----------------------------------------------------------
     6. Client-side validation
     ----------------------------------------------------------
     This runs BEFORE the Edge Function is called so obvious
     mistakes never leave the browser. The Edge Function still
     validates on the server.
  ---------------------------------------------------------- */
  function validateForm() {
    clearFieldErrors();

    const fullName        = fullNameEl ? fullNameEl.value.trim() : '';
    const email           = emailEl ? emailEl.value.trim() : '';
    const password        = passwordEl ? passwordEl.value : '';
    const confirmPassword = confirmPasswordEl ? confirmPasswordEl.value : '';

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

    if (!confirmPassword) {
      markInvalid(confirmPasswordEl, true);
      if (!firstInvalid) firstInvalid = confirmPasswordEl;
    } else if (confirmPassword.length < 8) {
      markInvalid(confirmPasswordEl, true);
      if (!firstInvalid) firstInvalid = confirmPasswordEl;
      setAlert('Please confirm the password (minimum 8 characters).', 'error');
      if (firstInvalid && firstInvalid.focus) firstInvalid.focus();
      return false;
    }

    // If both passwords are non-empty and long enough, they must match.
    if (
      password &&
      confirmPassword &&
      password.length >= 8 &&
      confirmPassword.length >= 8 &&
      password !== confirmPassword
    ) {
      markInvalid(passwordEl, true);
      markInvalid(confirmPasswordEl, true);
      setAlert('Passwords do not match. Please re-enter them.', 'error');
      if (confirmPasswordEl && confirmPasswordEl.focus) confirmPasswordEl.focus();
      return false;
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
     admin and creates the accountant. No service-role key is
     ever present in this file.

     IMPORTANT: the payload contains only the three fields the
     Edge Function expects. Confirm Password is never sent.
  ---------------------------------------------------------- */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validateForm()) return;

    // Confirm we have a session before calling the function.
   
    let sessionRes;

    try {
      sessionRes = await supabase.auth.getSession();
    } catch (err) {
      console.error('[add-accountant] Session check failed:', err);
      setAlert('Could not verify your session. Please refresh and try again.', 'error');
      return;
    }

    if (
      sessionRes.error ||
      !sessionRes.data ||
      !sessionRes.data.session
    ) {
      setAlert('Your session has expired. Please log in again.', 'error');
      return;
    }


    // Payload — exactly the three fields the Edge Function accepts.
    const payload = {
      full_name: fullNameEl.value.trim(),
      email:     emailEl.value.trim(),
      password:  passwordEl.value
      // confirm_password is intentionally NOT included.
    };

    setAlert(null);
    if (successPanel) successPanel.hidden = true;
    setSubmitting(true);

    let data = null;
    let fnError = null;

    try {
      const result = await supabase.functions.invoke('create-accountant', {
        body: payload
      });
      data = result.data;
      fnError = result.error;
    } catch (err) {
      // Network failure, function not deployed, CORS, etc.
      console.error('[add-accountant] invoke threw:', err);
      fnError = err;
    }

    setSubmitting(false);

    // The Edge Function returns JSON on success and on failure.
    // We handle:
    //   - fnError              → transport / invocation problem
    //   - data.error           → business error from the function
    //   - success              → data with no error field
    if (fnError) {
      const msg = (data && (data.error || data.message)) || null;
      setAlert(
        msg || 'Could not create the accountant. Please check your connection and try again.',
        'error'
      );
      return;
    }

    if (data && data.error) {
      const raw = String(data.error);

      if (/email/i.test(raw) && /exist|registered|duplicate/i.test(raw)) {
        setAlert('This email is already registered to another account.', 'error');
        markInvalid(emailEl, true);
      } else if (/email/i.test(raw) && /invalid/i.test(raw)) {
        setAlert('Please enter a valid email address.', 'error');
        markInvalid(emailEl, true);
      } else if (/password/i.test(raw)) {
        setAlert('The password does not meet the requirements. Please choose a stronger password.', 'error');
        markInvalid(passwordEl, true);
      } else if (/full[_ ]?name/i.test(raw)) {
        setAlert('Please enter the accountant\'s full name.', 'error');
        markInvalid(fullNameEl, true);
      } else if (/admin/i.test(raw) || /unauthor/i.test(raw) || /forbidden/i.test(raw) || /denied/i.test(raw)) {
        setAlert('You are not authorised to create accountant accounts. Please sign in as an active admin.', 'error');
      } else if (/session|token|jwt/i.test(raw)) {
        setAlert('Your session has expired. Please log in again.', 'error');
      } else {
        setAlert('Could not create the accountant: ' + raw, 'error');
      }
      return;
    }

    // Success
    const accountantName =
      (data && (data.full_name || data.accountant_name)) || payload.full_name;

    setAlert('Accountant created successfully.', 'success');
    form.reset();
    clearFieldErrors();
    showSuccess(accountantName);
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
     9. "Add Another Accountant" button (in the success panel)
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
  [fullNameEl, emailEl, passwordEl, confirmPasswordEl]
    .forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () {
        markInvalid(el, false);
      });
    });

})();