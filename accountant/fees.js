/* ============================================================
   STUDENT FEES — ACCOUNTANT PORTAL
   ------------------------------------------------------------
   Flow:
     1. Config + Supabase client
     2. Session exists?                         no  → login
     3. Profile row in accountant_profiles?      no  → login
     4. Status 'active' AND role 'accountant'?   no  → login / fatal
     5. All good → reveal shell, wire UI
     6. Search profiles WHERE role='student'
     7. On select → load student_fee_charges and render

   No data is fetched until the accountant is verified.
   No student data is displayed if the accountant check fails.
   All database values are rendered with textContent.
   No service-role key is ever used.
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
  const guard       = document.getElementById('feesGuard');
  const shell       = document.getElementById('feesShell');

  const nameEl      = document.getElementById('feesUserName');
  const initialEl   = document.getElementById('feesUserInitial');
  const logoutBtn   = document.getElementById('feesLogout');
  const notifBtn    = document.getElementById('feesNotificationsBtn');

  const menuBtn     = document.getElementById('feesMenuBtn');
  const sidebar     = document.getElementById('feesSidebar');
  const backdrop    = document.getElementById('feesBackdrop');

  const alertEl     = document.getElementById('feesAlert');

  const searchInput = document.getElementById('feesSearch');
  const searchClear = document.getElementById('feesSearchClear');
  const searchStatus = document.getElementById('feesSearchStatus');
  const searchResults = document.getElementById('feesSearchResults');

  const studentPanel   = document.getElementById('feesStudentPanel');
  const studentName    = document.getElementById('feesStudentName');
  const studentMeta    = document.getElementById('feesStudentMeta');
  const studentClose   = document.getElementById('feesStudentClose');
  const studentSchoolId= document.getElementById('feesStudentSchoolId');
  const studentClass   = document.getElementById('feesStudentClass');
  const studentRoll    = document.getElementById('feesStudentRoll');
  const studentFullName= document.getElementById('feesStudentFullName');

  const outstandingTotal    = document.getElementById('feesOutstandingTotal');
  const outstandingNote     = document.getElementById('feesOutstandingNote');
  const outstandingTuition  = document.getElementById('feesOutstandingTuition');
  const outstandingTransport= document.getElementById('feesOutstandingTransport');

  const monthsLoading = document.getElementById('feesMonthsLoading');
  const monthsEmpty   = document.getElementById('feesMonthsEmpty');
  const monthsError   = document.getElementById('feesMonthsError');
  const monthsList    = document.getElementById('feesMonthsList');
  
  // Payment form
  const paymentSection = document.getElementById('feesPaymentSection');
  const receivePaymentBtn = document.getElementById('feesReceivePaymentBtn');
  const paymentForm = document.getElementById('feesPaymentForm');
  const payTuition = document.getElementById('feesPayTuition');
  const payTransport = document.getElementById('feesPayTransport');
  const payMethod = document.getElementById('feesPayMethod');
  const payNotes = document.getElementById('feesPayNotes');
  const paymentAmountPreview = document.getElementById('feesPaymentAmountPreview');
  const paymentFormError = document.getElementById('feesPaymentFormError');
  const paymentSubmitBtn = document.getElementById('feesPaymentSubmitBtn');
  const paymentCancelBtn = document.getElementById('feesPaymentCancelBtn');

  // Payment history
  const paymentHistorySection = document.getElementById('feesPaymentHistorySection');
  const paymentHistoryLoading = document.getElementById('feesPaymentHistoryLoading');
  const paymentHistoryEmpty = document.getElementById('feesPaymentHistoryEmpty');
  const paymentHistoryError = document.getElementById('feesPaymentHistoryError');
  const paymentHistoryList = document.getElementById('feesPaymentHistoryList');

  // Receipt
  const receiptPanel = document.getElementById('feesReceiptPanel');
  const receiptContent = document.getElementById('feesReceiptContent');
  const printReceiptBtn = document.getElementById('feesPrintReceiptBtn');


  /* ----------------------------------------------------------
     2. State
  ---------------------------------------------------------- */
  
  const state = {
    selectedStudent: null,
    searchToken: 0,
    searchTimer: null,
    monthsRequestToken: 0,
    outstandingTuitionDue: 0,
    outstandingTransportDue: 0,
    paymentInProgress: false
  };

  /* ----------------------------------------------------------
     3. Helpers
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
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }

    const wrap = document.createElement('div');
    wrap.style.cssText =
      'min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'padding:2rem;font-family:Inter,system-ui,sans-serif;background:#F9FAFB;';

    const card = document.createElement('div');
    card.style.cssText =
      'max-width:520px;background:#fff;border:1px solid #E5E7EB;' +
      'border-radius:14px;padding:2rem;';

    const heading = document.createElement('h1');
    heading.style.cssText = 'font-size:1.25rem;margin:0 0 .5rem;color:#111827;';
    heading.textContent = title || 'Something went wrong';

    const para = document.createElement('p');
    para.style.cssText = 'margin:0 0 1.25rem;color:#6B7280;line-height:1.6;';
    para.textContent = message || 'Please try again or contact the school office.';

    const link = document.createElement('a');
    link.href = '../login.html';
    link.textContent = 'Return to Login';
    link.style.cssText =
      'display:inline-block;padding:.6rem 1rem;background:#F97316;' +
      'color:#fff;border-radius:8px;font-weight:600;text-decoration:none;';

    card.appendChild(heading);
    card.appendChild(para);
    card.appendChild(link);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    if (!isFinite(n)) return String(value);
    return '₹' + n.toLocaleString('en-IN');
  }

  function formatMonth(iso) {
    // billing_month is a date — format as "October 2026".
    if (!iso) return '—';
    const parts = String(iso).split('-');
    if (parts.length < 3) return String(iso);
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    if (isNaN(y) || isNaN(m)) return String(iso);
    const d = new Date(y, m, 1);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  function monthSortKey(iso) {
    // 'YYYY-MM-DD' sorts correctly as a string, but be defensive.
    if (!iso) return '';
    return String(iso).slice(0, 10);
  }

  /* ----------------------------------------------------------
     4. Mobile sidebar (drawer)
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
     5. Disabled-link guard (Soon items)
  ---------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    const link = e.target.closest && e.target.closest('a[aria-disabled="true"]');
    if (!link) return;
    e.preventDefault();
  });

  /* ----------------------------------------------------------
     6. Notifications placeholder
  ---------------------------------------------------------- */
  if (notifBtn) {
    notifBtn.addEventListener('click', function () {
      setAlert('Notifications will be available soon.', 'info');
    });
  }

  /* ----------------------------------------------------------
     7. Logout
  ---------------------------------------------------------- */
  function wireLogout() {
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', async function () {
      if (logoutBtn.disabled) return;
      logoutBtn.disabled = true;

      let error = null;
      try {
        const res = await supabase.auth.signOut();
        error = res && res.error ? res.error : null;
      } catch (err) {
        error = err;
      }

      if (error) {
        console.error('[fees] signOut error:', error.message || error);
        logoutBtn.disabled = false;
        setAlert(
          'Logout could not be completed. Please check your connection and try again.',
          'error'
        );
        return;
      }

      redirectTo('../login.html');
    });
  }

  /* ----------------------------------------------------------
     8. Auth guard
  ---------------------------------------------------------- */
  async function requireAccountant() {
    let sres;
    try {
      sres = await supabase.auth.getSession();
    } catch (err) {
      console.error('[fees] getSession threw:', err);
      showFatal('Could not verify your session',
        'We could not reach the authentication service. ' +
        'Please check your internet connection and try again.');
      return null;
    }

    if (sres.error) {
      console.error('[fees] getSession error:', sres.error.message || sres.error);
      showFatal('Could not verify your session',
        'Please sign in again to continue.');
      return null;
    }

    const session = sres.data && sres.data.session;
    if (!session || !session.user) {
      redirectTo('../login.html');
      return null;
    }

    let pres;
    try {
      pres = await supabase
        .from('accountant_profiles')
        .select('id, full_name, email, role, status')
        .eq('id', session.user.id)
        .maybeSingle();
    } catch (err) {
      console.error('[fees] profile request threw:', err);
      showFatal('Could not load your profile',
        'We could not reach the school database. ' +
        'Please check your internet connection and try again.');
      return null;
    }

    if (pres.error) {
      console.error('[fees] profile load failed:', pres.error.message || pres.error);
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      showFatal('Could not load your profile',
        'Your profile could not be read. Please sign in again, ' +
        'or contact the school office.');
      return null;
    }

    const profile = pres.data;

    if (!profile) {
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      redirectTo('../login.html');
      return null;
    }

    if (profile.status !== 'active') {
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      const label = profile.status ? String(profile.status) : 'inactive';
      showFatal('Account ' + label,
        'Your accountant account is not active. ' +
        'Please contact the school office.');
      return null;
    }

    if (profile.role !== 'accountant') {
      try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
      redirectTo('../login.html');
      return null;
    }

    return { session, profile };
  }

  /* ----------------------------------------------------------
     9. Reveal + identity
  ---------------------------------------------------------- */
  function revealDashboard() {
    if (shell) shell.hidden = false;
    if (guard) guard.remove();
  }

  function renderIdentity(profile) {
    const name  = profile.full_name || profile.email || 'Accountant';
    setText(nameEl, name);
    setText(initialEl, initialOf(name));
    document.title = (name.split(' ')[0] || 'Accountant') + ' — Student Fees';
  }

  /* ----------------------------------------------------------
     10. Search state helpers
  ---------------------------------------------------------- */
  function setSearchStatus(message, variant) {
    if (!searchStatus) return;
    if (!message) {
      searchStatus.hidden = true;
      searchStatus.textContent = '';
      searchStatus.classList.remove('fees-status-error');
      return;
    }
    searchStatus.hidden = false;
    searchStatus.textContent = message;
    searchStatus.classList.remove('fees-status-error');
    if (variant === 'error') searchStatus.classList.add('fees-status-error');
  }

  function clearSearchResults() {
    if (searchResults) {
      searchResults.hidden = true;
      searchResults.textContent = '';
    }
  }

  function setClearButtonVisible(visible) {
    if (!searchClear) return;
    searchClear.hidden = !visible;
  }

  /* ----------------------------------------------------------
     11. Search students
     ----------------------------------------------------------
     Queries profiles WHERE role='student' with a fuzzy match
     on school_id, full_name, class_section or roll_no.
     Results are empty until the input has ≥2 characters.
  ---------------------------------------------------------- */
  async function runSearch(term) {
    const trimmed = (term || '').trim();
    const token = ++state.searchToken;

    if (trimmed.length < 2) {
      clearSearchResults();
      setSearchStatus(trimmed.length === 0 ? '' : 'Keep typing…');
      return;
    }

    setSearchStatus('Searching…');

    // Supabase's .or() with ilike does a case-insensitive LIKE.
    // We escape % and _ so a user typing them doesn't widen the match.
    const safe = trimmed.replace(/[%_]/g, function (c) { return '\\' + c; });
    const pattern = '%' + safe + '%';

    const orClause =
      'school_id.ilike.' + pattern +
      ',full_name.ilike.' + pattern +
      ',class_section.ilike.' + pattern;

    // roll_no is an integer — only include it when the term is numeric.
    const numeric = /^\d+$/.test(trimmed);
    const finalOr = numeric
      ? orClause + ',roll_no.eq.' + Number(trimmed)
      : orClause;

    let res;
    try {
      res = await supabase
        .from('profiles')
        .select('id, school_id, full_name, class_section, roll_no, status, role')
        .eq('role', 'student')
        .or(finalOr)
        .order('full_name', { ascending: true })
        .limit(25);
    } catch (err) {
      if (token !== state.searchToken) return;   // a newer search has superseded this one
      console.error('[fees] search threw:', err);
      clearSearchResults();
      setSearchStatus('Could not search students. Please try again.', 'error');
      return;
    }

    if (token !== state.searchToken) return;   // stale response

    if (res.error) {
      console.error('[fees] search failed:', res.error.message || res.error);
      clearSearchResults();

      // 42501 = insufficient_privilege (RLS blocked the read).
      if (res.error.code === '42501') {
        setSearchStatus(
          'Your account is not permitted to read student records. ' +
          'Ask the school admin to confirm the profiles SELECT policy for active accountants.',
          'error'
        );
      } else {
        setSearchStatus('Could not search students. Please try again.', 'error');
      }
      return;
    }

    const rows = Array.isArray(res.data) ? res.data : [];

    if (!rows.length) {
      clearSearchResults();
      setSearchStatus('No students matched your search.');
      return;
    }

    setSearchStatus(rows.length + (rows.length === 1 ? ' student found' : ' students found'));
    renderSearchResults(rows);
  }

  function renderSearchResults(rows) {
    if (!searchResults) return;

    searchResults.textContent = '';
    const frag = document.createDocumentFragment();

    rows.forEach(function (student) {
      const li = document.createElement('li');
      li.className = 'fees-result-item';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fees-result-btn';
      btn.setAttribute('data-student-id', String(student.id));

      const avatar = document.createElement('span');
      avatar.className = 'fees-result-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = initialOf(student.full_name);

      const text = document.createElement('span');
      text.className = 'fees-result-text';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'fees-result-name';
      nameSpan.textContent = student.full_name || 'Unnamed student';

      const metaSpan = document.createElement('span');
      metaSpan.className = 'fees-result-meta';
      const parts = [];
      if (student.school_id) parts.push(student.school_id);
      if (student.class_section) parts.push('Class ' + student.class_section);
      if (student.roll_no !== null && student.roll_no !== undefined && student.roll_no !== '') {
        parts.push('Roll ' + student.roll_no);
      }
      metaSpan.textContent = parts.length ? parts.join(' · ') : '—';

      text.appendChild(nameSpan);
      text.appendChild(metaSpan);

      const arrow = document.createElement('span');
      arrow.className = 'fees-result-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';

      btn.appendChild(avatar);
      btn.appendChild(text);
      btn.appendChild(arrow);

      li.appendChild(btn);
      frag.appendChild(li);
    });

    searchResults.appendChild(frag);
    searchResults.hidden = false;
  }

  /* ----------------------------------------------------------
     12. Student selection
  ---------------------------------------------------------- */
  function selectStudent(studentId) {
    // Find the row in the currently-rendered results so we have
    // the student's basic info immediately. The full details are
    // still loaded from Supabase below.
    let picked = null;

    if (searchResults) {
      const btns = searchResults.querySelectorAll('button[data-student-id]');
      for (let i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute('data-student-id') === String(studentId)) {
          picked = btns[i];
          break;
        }
      }
    }

    // We don't strictly need `picked` — we reload the profile and
    // charges from Supabase — but we use it to scroll into view.
    if (picked && picked.scrollIntoView) {
      picked.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    state.selectedStudent = studentId;
    loadStudent(studentId);
  }

  /* ----------------------------------------------------------
     13. Load student details + charges
  ---------------------------------------------------------- */
  async function loadStudent(studentId) {
    if (!studentPanel) return;

    const token = ++state.monthsRequestToken;
    state.outstandingTuitionDue = 0;
    state.outstandingTransportDue = 0;

    if (paymentSection) paymentSection.hidden = true;
    if (paymentHistorySection) paymentHistorySection.hidden = true;
    if (receiptPanel) receiptPanel.hidden = true;

    // Reset the panel to a loading state.
    studentPanel.hidden = false;

    setText(studentName, '—');
    setText(studentMeta, '—');
    setText(studentSchoolId, '—');
    setText(studentClass, '—');
    setText(studentRoll, '—');
    setText(studentFullName, '—');

    setText(outstandingTotal, '—');
    setText(outstandingTuition, '—');
    setText(outstandingTransport, '—');
    setText(outstandingNote, '');

    if (monthsList) {
      monthsList.hidden = true;
      monthsList.textContent = '';
    }
    if (monthsEmpty) monthsEmpty.hidden = true;
    if (monthsError) {
      monthsError.hidden = true;
      monthsError.textContent = '';
    }
    if (monthsLoading) monthsLoading.hidden = false;

    // Load the student's profile row (fresh, from Supabase).
    let studentRes;
    try {
      studentRes = await supabase
        .from('profiles')
        .select('id, school_id, full_name, class_section, roll_no, role, status')
        .eq('id', studentId)
        .eq('role', 'student')
        .maybeSingle();
    } catch (err) {
      if (token !== state.monthsRequestToken) return;
      console.error('[fees] student load threw:', err);
      showMonthsError('Could not load this student. Please try again.');
      return;
    }

    if (token !== state.monthsRequestToken) return;

    if (studentRes.error || !studentRes.data) {
      console.error('[fees] student load failed:',
        studentRes.error ? (studentRes.error.message || studentRes.error) : 'no data');
      showMonthsError('Could not load this student. Please try again.');
      return;
    }

    const student = studentRes.data;

    // Render identity.
    setText(studentFullName, student.full_name);
    setText(studentName, student.full_name);
    setText(studentSchoolId, student.school_id);
    setText(studentClass, student.class_section || '—');
    setText(studentRoll, student.roll_no !== null && student.roll_no !== undefined
      ? String(student.roll_no) : '—');

    // Meta line: "School ID · Class X-Y · Roll N"
    const metaParts = [];
    if (student.school_id) metaParts.push(student.school_id);
    if (student.class_section) metaParts.push('Class ' + student.class_section);
    if (student.roll_no !== null && student.roll_no !== undefined) {
      metaParts.push('Roll ' + student.roll_no);
    }
    setText(studentMeta, metaParts.length ? metaParts.join(' · ') : '—');

    // Load charges.
    let chargesRes;
    try {
      chargesRes = await supabase
        .from('student_fee_charges')
        .select('id, billing_month, tuition_amount, transport_amount, tuition_paid, transport_paid')
        .eq('student_id', studentId)
        .order('billing_month', { ascending: false });
    } catch (err) {
      if (token !== state.monthsRequestToken) return;
      console.error('[fees] charges request threw:', err);
      showMonthsError('Could not load fee charges. Please try again.');
      return;
    }

    if (token !== state.monthsRequestToken) return;

    if (chargesRes.error) {
      console.error('[fees] charges load failed:',
        chargesRes.error.message || chargesRes.error);
      if (chargesRes.error.code === '42501') {
        showMonthsError(
          'Your account is not permitted to read fee charges. ' +
          'Ask the school admin to confirm the accountant_read_fee_charges policy.'
        );
      } else {
        showMonthsError('Could not load fee charges. Please try again.');
      }
      return;
    }

    const charges = Array.isArray(chargesRes.data) ? chargesRes.data.slice() : [];

    // Sort defensively: newest first, using string compare on YYYY-MM-DD.
    charges.sort(function (a, b) {
      return monthSortKey(b.billing_month).localeCompare(monthSortKey(a.billing_month));
    });

    if (monthsLoading) monthsLoading.hidden = true;

    
    if (!charges.length) {
      if (monthsEmpty) monthsEmpty.hidden = false;
      setText(outstandingTotal, formatMoney(0));
      setText(outstandingTuition, formatMoney(0));
      setText(outstandingTransport, formatMoney(0));
      setText(outstandingNote, 'No fee charges recorded');

      state.outstandingTuitionDue = 0;
      state.outstandingTransportDue = 0;
    } else {
      renderCharges(charges);
    }

    if (paymentSection) paymentSection.hidden = false;
    if (paymentHistorySection) paymentHistorySection.hidden = false;
    await loadPaymentHistory(studentId);


    renderCharges(charges);
  }

  function showMonthsError(message) {
    if (monthsLoading) monthsLoading.hidden = true;
    if (monthsEmpty) monthsEmpty.hidden = true;
    if (monthsList) {
      monthsList.hidden = true;
      monthsList.textContent = '';
    }
    if (monthsError) {
      monthsError.hidden = false;
      monthsError.textContent = message;
    }
  }

  /* ----------------------------------------------------------
     14. Render monthly breakdown
     ----------------------------------------------------------
     For each charge row:
       tuition due     = max(0, tuition_amount  - tuition_paid)
       transport due   = max(0, transport_amount - transport_paid)
       row total due   = tuition due + transport due

     Month status:
       - "Paid"    if row total due == 0 and something was charged
       - "Partial" if some paid but not all
       - "Due"     if nothing paid but something charged
       - "No dues" if amounts are zero
  ---------------------------------------------------------- */
  function renderCharges(charges) {
    if (!monthsList) return;

    monthsList.textContent = '';
    const frag = document.createDocumentFragment();

    let totalTuitionDue = 0;
    let totalTransportDue = 0;

    charges.forEach(function (row) {
      const tuitionAmount  = Number(row.tuition_amount)  || 0;
      const transportAmount= Number(row.transport_amount)|| 0;
      const tuitionPaid    = Number(row.tuition_paid)    || 0;
      const transportPaid  = Number(row.transport_paid)  || 0;

      const tuitionDue   = Math.max(0, tuitionAmount   - tuitionPaid);
      const transportDue = Math.max(0, transportAmount - transportPaid);
      const rowDue       = tuitionDue + transportDue;

      totalTuitionDue   += tuitionDue;
      totalTransportDue += transportDue;

      // Build the card.
      const li = document.createElement('li');
      li.className = 'fees-month';

      const head = document.createElement('div');
      head.className = 'fees-month-head';

      const label = document.createElement('h4');
      label.className = 'fees-month-label';
      label.textContent = formatMonth(row.billing_month);

      const statusPill = document.createElement('span');
      statusPill.className = 'fees-month-status';

      const chargedTotal = tuitionAmount + transportAmount;
      if (chargedTotal === 0) {
        statusPill.classList.add('is-nodue');
        statusPill.textContent = 'No dues';
      } else if (rowDue === 0) {
        statusPill.classList.add('is-paid');
        statusPill.textContent = 'Paid';
      } else if ((tuitionPaid + transportPaid) > 0) {
        statusPill.classList.add('is-partial');
        statusPill.textContent = 'Partial';
      } else {
        statusPill.classList.add('is-due');
        statusPill.textContent = 'Due';
      }

      head.appendChild(label);
      head.appendChild(statusPill);

      const grid = document.createElement('div');
      grid.className = 'fees-month-grid';

      grid.appendChild(buildMonthBlock('Tuition',   tuitionAmount,   tuitionPaid,   tuitionDue));
      grid.appendChild(buildMonthBlock('Transport', transportAmount, transportPaid, transportDue));

      li.appendChild(head);
      li.appendChild(grid);
      frag.appendChild(li);
    });

    monthsList.appendChild(frag);
    monthsList.hidden = false;

    // Totals.
    const totalDue = totalTuitionDue + totalTransportDue;
    setText(outstandingTotal, formatMoney(totalDue));
    setText(outstandingTuition, formatMoney(totalTuitionDue));
    setText(outstandingTransport, formatMoney(totalTransportDue));
    state.outstandingTuitionDue = totalTuitionDue;
    state.outstandingTransportDue = totalTransportDue;

    if (totalDue === 0) {
      setText(outstandingNote, 'All charges are paid in full');
    } else {
      setText(outstandingNote,
        charges.length + (charges.length === 1 ? ' billing month' : ' billing months'));
    }
  }

  function buildMonthBlock(label, amount, paid, due) {
    const block = document.createElement('div');
    block.className = 'fees-month-block';

    const lbl = document.createElement('span');
    lbl.className = 'fees-month-block-label';
    lbl.textContent = label;

    const r1 = buildRow('Charged', amount, '');
    const r2 = buildRow('Paid',    paid,   'is-paid');
    const r3 = buildRow('Due',     due,    due > 0 ? 'is-due' : '');

    block.appendChild(lbl);
    block.appendChild(r1);
    block.appendChild(r2);
    block.appendChild(r3);

    return block;
  }

  function buildRow(rowLabel, value, variant) {
    const row = document.createElement('div');
    row.className = 'fees-month-row';
    if (variant) row.classList.add(variant);

    const l = document.createElement('span');
    l.className = 'fees-month-row-label';
    l.textContent = rowLabel;

    const v = document.createElement('span');
    v.className = 'fees-month-row-value';
    v.textContent = formatMoney(value);

    row.appendChild(l);
    row.appendChild(v);
    return row;
  }
  
  /* ----------------------------------------------------------
     PAYMENT HELPERS
  ---------------------------------------------------------- */

  function showPaymentError(message) {
    if (!paymentFormError) return;
    paymentFormError.textContent = message;
    paymentFormError.hidden = false;
  }

  function clearPaymentError() {
    if (!paymentFormError) return;
    paymentFormError.textContent = '';
    paymentFormError.hidden = true;
  }

  function updatePaymentPreview() {
    const tuition = Math.max(0, Number(payTuition?.value) || 0);
    const transport = Math.max(0, Number(payTransport?.value) || 0);
    if (paymentAmountPreview) {
      paymentAmountPreview.textContent =
        'Total to record: ' + formatMoney(tuition + transport);
    }
  }

  function resetPaymentForm() {
    if (paymentForm) paymentForm.reset();
    if (payTuition) payTuition.value = '0';
    if (payTransport) payTransport.value = '0';
    clearPaymentError();
    updatePaymentPreview();
    if (paymentForm) paymentForm.hidden = true;
    if (receivePaymentBtn) receivePaymentBtn.hidden = false;
  }

  function paymentMethodLabel(method) {
    const labels = {
      cash: 'Cash',
      cheque: 'Cheque',
      bank_transfer: 'Bank transfer',
      upi: 'UPI',
      other: 'Other'
    };
    return labels[method] || method || '—';
  }

  function renderReceipt(payment, studentId) {
    if (!receiptPanel || !receiptContent) return;

    const rows = [
      ['Receipt number', payment.receipt_number],
      ['Student name', studentFullName?.textContent],
      ['School ID', studentSchoolId?.textContent],
      ['Class', studentClass?.textContent],
      ['Roll number', studentRoll?.textContent],
      ['Payment date', payment.received_at
        ? new Date(payment.received_at).toLocaleString('en-IN')
        : new Date().toLocaleString('en-IN')],
      ['Payment method', paymentMethodLabel(payment.payment_method)],
      ['Amount received', formatMoney(payment.amount_total)],
      ['Notes', payment.notes || '—']
    ];

    receiptContent.textContent = '';

    const heading = document.createElement('h2');
    heading.textContent = 'Shemford Futuristic School';
    receiptContent.appendChild(heading);

    const subtitle = document.createElement('p');
    subtitle.textContent = 'Student Fee Payment Receipt';
    receiptContent.appendChild(subtitle);

    rows.forEach(function (item) {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = item[0] + ': ';
      p.appendChild(strong);
      p.appendChild(document.createTextNode(
        item[1] === null || item[1] === undefined
          ? '—'
          : String(item[1])
      ));
      receiptContent.appendChild(p);
    });

    receiptPanel.hidden = false;
    receiptPanel.dataset.studentId = studentId;
  }

  async function loadPaymentHistory(studentId) {
    if (!paymentHistorySection || !paymentHistoryList) return;

    paymentHistorySection.hidden = false;
    paymentHistoryList.hidden = true;
    paymentHistoryList.textContent = '';

    if (paymentHistoryLoading) paymentHistoryLoading.hidden = false;
    if (paymentHistoryEmpty) paymentHistoryEmpty.hidden = true;
    if (paymentHistoryError) {
      paymentHistoryError.hidden = true;
      paymentHistoryError.textContent = '';
    }

    const res = await supabase
      .from('student_fee_payments')
      .select(
        'id, receipt_number, amount_total, payment_method, received_at, notes'
      )
      .eq('student_id', studentId)
      .order('received_at', { ascending: false })
      .limit(50);

    if (paymentHistoryLoading) paymentHistoryLoading.hidden = true;

    if (res.error) {
      console.error('[fees] payment history failed:', res.error.message);
      if (paymentHistoryError) {
        paymentHistoryError.textContent =
          'Could not load payment history. Please try again.';
        paymentHistoryError.hidden = false;
      }
      return;
    }

    const payments = Array.isArray(res.data) ? res.data : [];

    if (!payments.length) {
      if (paymentHistoryEmpty) paymentHistoryEmpty.hidden = false;
      return;
    }

    const frag = document.createDocumentFragment();

    payments.forEach(function (payment) {
      const li = document.createElement('li');
      li.className = 'fees-payment-history-item';

      const title = document.createElement('strong');
      title.textContent =
        (payment.receipt_number || 'Receipt') +
        ' · ' + formatMoney(payment.amount_total);

      const date = document.createElement('p');
      date.textContent = payment.received_at
        ? new Date(payment.received_at).toLocaleString('en-IN')
        : 'Date unavailable';

      const method = document.createElement('p');
      method.textContent =
        'Method: ' + paymentMethodLabel(payment.payment_method);

      li.appendChild(title);
      li.appendChild(date);
      li.appendChild(method);

      if (payment.notes) {
        const notes = document.createElement('p');
        notes.textContent = 'Notes: ' + payment.notes;
        li.appendChild(notes);
      }

      frag.appendChild(li);
    });

    paymentHistoryList.appendChild(frag);
    paymentHistoryList.hidden = false;
  }

  async function submitFeePayment(event) {
    event.preventDefault();

    if (state.paymentInProgress) return;

    const studentId = state.selectedStudent;
    if (!studentId) {
      showPaymentError('Please select a student first.');
      return;
    }

    const tuition = Number(payTuition?.value);
    const transport = Number(payTransport?.value);
    const method = payMethod?.value || 'cash';
    const notes = payNotes?.value.trim() || '';

    if (
      !Number.isFinite(tuition) ||
      !Number.isFinite(transport) ||
      tuition < 0 ||
      transport < 0 ||
      Math.round(tuition * 100) !== tuition * 100 ||
      Math.round(transport * 100) !== transport * 100 ||
      tuition + transport <= 0
    ) {
      showPaymentError('Enter valid amounts greater than zero in total.');
      return;
    }

    if (
      tuition > state.outstandingTuitionDue ||
      transport > state.outstandingTransportDue
    ) {
      showPaymentError(
        'The entered amount exceeds the outstanding dues in that category.'
      );
      return;
    }

    const total = tuition + transport;
    const confirmed = window.confirm(
      'Confirm offline payment?\n\n' +
      'Student: ' + (studentFullName?.textContent || 'Selected student') +
      '\nTuition: ' + formatMoney(tuition) +
      '\nTransport: ' + formatMoney(transport) +
      '\nTotal: ' + formatMoney(total) +
      '\nMethod: ' + paymentMethodLabel(method) +
      '\n\nContinue only if the school has actually received this money.'
    );

    if (!confirmed) return;

    state.paymentInProgress = true;
    if (paymentSubmitBtn) {
      paymentSubmitBtn.disabled = true;
      paymentSubmitBtn.textContent = 'Recording payment…';
    }
    clearPaymentError();

    try {
      const res = await supabase.rpc('receive_student_fee_payment', {
        p_student_id: studentId,
        p_tuition_amount: tuition,
        p_transport_amount: transport,
        p_payment_method: method,
        p_notes: notes || null
      });

      if (res.error) {
        console.error('[fees] payment RPC failed:', res.error.message);
        showPaymentError(
          res.error.message ||
          'Payment could not be recorded. Please check the outstanding dues.'
        );
        return;
      }

      const result = Array.isArray(res.data) ? res.data[0] : res.data;

      if (
        !result ||
        !result.payment_id ||
        !result.receipt_number
      ) {
        showPaymentError(
          'The payment response could not be verified. Check payment history before retrying.'
        );
        return;
      }

      // Fetch the saved record so the receipt uses database values.
      const savedRes = await supabase
        .from('student_fee_payments')
        .select('id, receipt_number, amount_total, payment_method, received_at, notes')
        .eq('id', result.payment_id)
        .maybeSingle();

      const savedPayment = savedRes.data || {
        receipt_number: result.receipt_number,
        amount_total: result.amount_total,
        payment_method: method,
        received_at: new Date().toISOString(),
        notes: notes
      };

      resetPaymentForm();
      renderReceipt(savedPayment, studentId);

      // Reload dues and history from Supabase.
      await loadStudent(studentId);

      setAlert(
        'Payment recorded successfully. Receipt: ' +
        result.receipt_number,
        'info'
      );
    } catch (err) {
      console.error('[fees] payment submit threw:', err);
      showPaymentError(
        'We could not confirm the result. Check payment history before trying again.'
      );
    } finally {
      state.paymentInProgress = false;
      if (paymentSubmitBtn) {
        paymentSubmitBtn.disabled = false;
        paymentSubmitBtn.textContent = 'Confirm Payment';
      }
    }
  }

  if (receivePaymentBtn) {
    receivePaymentBtn.addEventListener('click', function () {
      clearPaymentError();
      if (paymentForm) paymentForm.hidden = false;
      receivePaymentBtn.hidden = true;
      updatePaymentPreview();
    });
  }

  if (paymentCancelBtn) {
    paymentCancelBtn.addEventListener('click', resetPaymentForm);
  }

  if (paymentForm) {
    paymentForm.addEventListener('submit', submitFeePayment);
  }

  if (payTuition) {
    payTuition.addEventListener('input', updatePaymentPreview);
  }

  if (payTransport) {
    payTransport.addEventListener('input', updatePaymentPreview);
  }

  if (printReceiptBtn) {
    printReceiptBtn.addEventListener('click', function () {
      if (!receiptPanel || receiptPanel.hidden) return;

      document.body.classList.add('fees-print-receipt');
      window.print();
    });
  }

  window.addEventListener('afterprint', function () {
    document.body.classList.remove('fees-print-receipt');
  });


  /* ----------------------------------------------------------
     15. Search event wiring
  ---------------------------------------------------------- */
  if (searchInput) {
    // Debounce — 250ms after the last keystroke.
    searchInput.addEventListener('input', function () {
      const hasText = searchInput.value.trim().length > 0;
      setClearButtonVisible(hasText);

      if (state.searchTimer) clearTimeout(state.searchTimer);

      const term = searchInput.value;
      state.searchTimer = setTimeout(function () {
        runSearch(term);
      }, 250);
    });

    // Enter key triggers search immediately, no debounce.
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.searchTimer) clearTimeout(state.searchTimer);
        runSearch(searchInput.value);
      }
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', function () {
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      setClearButtonVisible(false);
      clearSearchResults();
      setSearchStatus('');
      closeStudentPanel();
    });
  }

  if (searchResults) {
    searchResults.addEventListener('click', function (e) {
      const btn = e.target.closest && e.target.closest('button[data-student-id]');
      if (!btn) return;
      selectStudent(btn.getAttribute('data-student-id'));
    });
  }

  /* ----------------------------------------------------------
     16. Close selected student
  ---------------------------------------------------------- */
  function closeStudentPanel() {
    state.selectedStudent = null;
    state.monthsRequestToken++;   // invalidate any pending load

    if (studentPanel) studentPanel.hidden = true;

    if (monthsLoading) monthsLoading.hidden = true;
    if (monthsEmpty) monthsEmpty.hidden = true;
    if (monthsError) {
      monthsError.hidden = true;
      monthsError.textContent = '';
    }
    if (monthsList) {
      monthsList.hidden = true;
      monthsList.textContent = '';
    }

    setText(studentName, '—');
    setText(studentMeta, '—');
    setText(studentSchoolId, '—');
    setText(studentClass, '—');
    setText(studentRoll, '—');
    setText(studentFullName, '—');
    setText(outstandingTotal, '—');
    setText(outstandingTuition, '—');
    setText(outstandingTransport, '—');
    setText(outstandingNote, '');
  }

  if (studentClose) {
    studentClose.addEventListener('click', closeStudentPanel);
  }

  /* ----------------------------------------------------------
     17. Main
  ---------------------------------------------------------- */
  async function init() {
    try {
      const auth = await requireAccountant();
      if (!auth) return;   // redirect or fatal already handled

      renderIdentity(auth.profile);
      wireLogout();
      revealDashboard();

      // Search UI starts empty until the accountant types.
      setClearButtonVisible(false);
      clearSearchResults();
      setSearchStatus('');
    } catch (err) {
      console.error('[fees] unexpected init error:', err);
      showFatal('Something went wrong',
        'We could not load the fees page. ' +
        'Please try again, or return to the login page.');
    }
  }

  init();

})();