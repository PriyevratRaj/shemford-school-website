/* ============================================================
   LIBRARIAN DASHBOARD — AUTH GUARD + DATA + ACTIONS
   ------------------------------------------------------------
   Responsibilities:
     1. Verify session + librarian role (two-layer check)
     2. Load library books, students, issues
     3. Render summary counts, books table, issued/due/overdue/history
     4. Wire section navigation, mobile drawer, logout
     5. Wire add/edit book, issue book, return/lost/damaged actions
     6. Refresh data + summary after every successful mutation

   All database writes go through the existing RPCs.
   No direct table INSERT/UPDATE/DELETE anywhere.
   All rendered DB text is set via textContent (never innerHTML).
   ============================================================ */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     0. Config + client
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
      'The Supabase CDN script did not load. Check your internet connection and refresh.'
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
  const $ = (id) => document.getElementById(id);

  const el = {
    // Guard / shell
    guard: $('libGuard'),
    shell: $('libShell'),

    // Header
    userInitial: $('libUserInitial'),
    userName: $('libUserName'),
    logout: $('libLogout'),
    notifBtn: $('libNotificationsBtn'),

    // Mobile drawer
    menuBtn: $('libMenuBtn'),
    sidebar: $('libSidebar'),
    backdrop: $('libBackdrop'),

    // Sections (data-section-panel)
    sections: document.querySelectorAll('[data-section-panel]'),
    navLinks: document.querySelectorAll('.dash-nav-link[data-section]'),

    // Dashboard summary
    statTotal: $('libStatTotal'),
    statAvailable: $('libStatAvailable'),
    statIssued: $('libStatIssued'),
    statDue: $('libStatDue'),
    statOverdue: $('libStatOverdue'),
    statError: $('libStatError'),
    statErrorText: $('libStatErrorText'),
    statRetry: $('libStatRetry'),

        // Library analytics
    booksRing: $('libBooksRing'),
    ringTotal: $('libRingTotal'),
    ringAvailable: $('libRingAvailable'),
    ringIssued: $('libRingIssued'),

    loansRing: $('libLoansRing'),
    ringActive: $('libRingActive'),
    ringOnTime: $('libRingOnTime'),
    ringOverdue: $('libRingOverdue'),

    monthlyChart: $('libMonthlyChart'),
    // Books
    addBookBtn: $('libAddBookBtn'),
    bookSearch: $('libBookSearch'),
    booksStatus: $('libBooksStatus'),
    booksTableWrap: $('libBooksTableWrap'),
    booksTableBody: $('libBooksTableBody'),
    booksEmpty: $('libBooksEmpty'),
    booksError: $('libBooksError'),
    booksErrorText: $('libBooksErrorText'),
    booksRetry: $('libBooksRetry'),

    // Issue form
    issueForm: $('libIssueForm'),
    issueStudent: $('libIssueStudent'),
    issueStudentSearch: $('libIssueStudentSearch'),
    issueBook: $('libIssueBook'),
    issueBookSearch: $('libIssueBookSearch'),
    issueStudentResults: $('libIssueStudentResults'),
    issueBookResults: $('libIssueBookResults'),
    issueDate: $('libIssueDate'),
    issueLoanDays: $('libIssueLoanDays'),
    issueDuePreview: $('libIssueDuePreview'),
    issueSubmit: $('libIssueSubmit'),
    issueAlert: $('libIssueAlert'),
    

    // Issued
    issuedRefresh: $('libIssuedRefresh'),
    issuedAlert: $('libIssuedAlert'),
    issuedTableWrap: $('libIssuedTableWrap'),
    issuedTableBody: $('libIssuedTableBody'),
    issuedEmpty: $('libIssuedEmpty'),
    issuedError: $('libIssuedError'),
    issuedErrorText: $('libIssuedErrorText'),
    issuedRetry: $('libIssuedRetry'),

    // Due / Overdue / History
    dueTableWrap: $('libDueTableWrap'),
    dueTableBody: $('libDueTableBody'),
    dueEmpty: $('libDueEmpty'),
    overdueTableWrap: $('libOverdueTableWrap'),
    overdueTableBody: $('libOverdueTableBody'),
    overdueEmpty: $('libOverdueEmpty'),
    historyTableWrap: $('libHistoryTableWrap'),
    historyTableBody: $('libHistoryTableBody'),
    historyEmpty: $('libHistoryEmpty'),

    // Add Book dialog
    addBookDialog: $('libAddBookDialog'),
    addBookForm: $('libAddBookForm'),
    addBookNumber: $('libAddBookNumber'),
    addTitle: $('libAddTitle'),
    addAuthor: $('libAddAuthor'),
    addCategory: $('libAddCategory'),
    addIsbn: $('libAddIsbn'),
    addBookAlert: $('libAddBookAlert'),
    addBookSubmit: $('libAddBookSubmit'),

    // Edit Book dialog
    editBookDialog: $('libEditBookDialog'),
    editBookForm: $('libEditBookForm'),
    editBookNumber: $('libEditBookNumber'),
    editTitle: $('libEditTitle'),
    editAuthor: $('libEditAuthor'),
    editCategory: $('libEditCategory'),
    editIsbn: $('libEditIsbn'),
    editBookId: $('libEditBookId'),
    editBookAlert: $('libEditBookAlert'),
    editBookSubmit: $('libEditBookSubmit'),

    // Confirm dialog
    confirmDialog: $('libConfirmDialog'),
    confirmTitle: $('libConfirmTitle'),
    confirmText: $('libConfirmText'),
    confirmSubmit: $('libConfirmSubmit'),
    confirmSubmitLabel: $('libConfirmSubmitLabel')
  };

  /* ----------------------------------------------------------
     2. Module state
  ---------------------------------------------------------- */
  const state = {
    currentUser: null,
    currentProfile: null,
    books: [],
    students: [],
    issues: [],
    todayISO: '',
    currentSection: 'dashboard',
    isSubmitting: false,
    confirmHandler: null
  };

  /* ----------------------------------------------------------
     3. Helpers
  ---------------------------------------------------------- */
  function redirectTo(path) {
    window.location.replace(path);
  }

  function setText(element, value) {
    if (!element) return;
    const s = (value === null || value === undefined) ? '' : String(value).trim();
    element.textContent = s || '—';
  }

  function setTextRaw(element, value) {
    if (!element) return;
    element.textContent = String(value ?? '');
  }

  function initialOf(name) {
    const t = (name || '').trim();
    return t ? t[0].toUpperCase() : 'L';
  }

  function escapeText(v) {
    // Returns plain text; only used for alert messages.
    return (v === null || v === undefined) ? '' : String(v);
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
    const h = document.createElement('h1');
    h.style.cssText = 'font-size:1.25rem;margin:0 0 .5rem;color:#111827;';
    h.textContent = title || 'Something went wrong';
    const p = document.createElement('p');
    p.style.cssText = 'margin:0 0 1.25rem;color:#6B7280;line-height:1.6;';
    p.textContent = message || 'Please try again or contact the school office.';
    const a = document.createElement('a');
    a.href = '../login.html';
    a.textContent = 'Return to Login';
    a.style.cssText =
      'display:inline-block;padding:.6rem 1rem;background:#F97316;' +
      'color:#fff;border-radius:8px;font-weight:600;text-decoration:none;';
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(a);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
  }

  function showAlert(element, message, variant) {
    if (!element) return;
    if (!message) {
      element.hidden = true;
      element.textContent = '';
      element.classList.remove('is-error', 'is-success', 'is-info');
      return;
    }
    element.hidden = false;
    element.textContent = message;
    element.classList.remove('is-error', 'is-success', 'is-info');
    if (variant) element.classList.add('is-' + variant);
  }

  function setButtonLoading(button, on) {
    if (!button) return;
    button.classList.toggle('is-loading', on);
    button.disabled = on;
  }

  function todayKolkataISO() {
    // Use Asia/Kolkata regardless of the browser's local timezone.
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return fmt.format(new Date());
  }

  function addDaysISO(iso, days) {
    // Safe for YYYY-MM-DD strings — build a UTC midnight Date.
    const parts = iso.split('-');
    const d = new Date(Date.UTC(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2])
    ));
    d.setUTCDate(d.getUTCDate() + days);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function formatDateDisplay(iso) {
    if (!iso) return '—';
    const parts = String(iso).split('-');
    if (parts.length < 3) return String(iso);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = Number(parts[2]);
    const m = Number(parts[1]) - 1;
    const y = Number(parts[0]);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return String(iso);
    return String(d).padStart(2, '0') + ' ' + months[m] + ' ' + y;
  }

  function daysBetweenISO(fromISO, toISO) {
    const a = fromISO.split('-').map(Number);
    const b = toISO.split('-').map(Number);
    const from = Date.UTC(a[0], a[1] - 1, a[2]);
    const to = Date.UTC(b[0], b[1] - 1, b[2]);
    return Math.round((to - from) / (24 * 60 * 60 * 1000));
  }

  function statusPillClass(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'available') return 'is-available';
    if (s === 'issued') return 'is-issued';
    if (s === 'lost') return 'is-lost';
    if (s === 'damaged') return 'is-damaged';
    return '';
  }

  /* ----------------------------------------------------------
     4. Mobile drawer
  ---------------------------------------------------------- */
  function openDrawer() {
    if (!el.sidebar || !el.backdrop) return;
    el.sidebar.classList.add('is-open');
    el.backdrop.hidden = false;
    if (el.menuBtn) el.menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    if (!el.sidebar || !el.backdrop) return;
    el.sidebar.classList.remove('is-open');
    el.backdrop.hidden = true;
    if (el.menuBtn) el.menuBtn.setAttribute('aria-expanded', 'false');
  }
  if (el.menuBtn) {
    el.menuBtn.addEventListener('click', function () {
      const open = el.sidebar && el.sidebar.classList.contains('is-open');
      if (open) closeDrawer(); else openDrawer();
    });
  }
  if (el.backdrop) el.backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeDrawer();
      closeAddBookDialog();
      closeEditBookDialog();
      closeConfirmDialog();
    }
  });

  /* ----------------------------------------------------------
     5. Notifications (placeholder)
  ---------------------------------------------------------- */
  if (el.notifBtn) {
    el.notifBtn.addEventListener('click', function () {
      // Simple placeholder — no fake data, no navigation.
      window.alert('Notifications will be available soon.');
    });
  }

  /* ----------------------------------------------------------
     6. Logout
  ---------------------------------------------------------- */
  function wireLogout() {
    if (!el.logout) return;
    el.logout.addEventListener('click', async function () {
      if (el.logout.disabled) return;
      el.logout.disabled = true;
      let error = null;
      try {
        const res = await supabase.auth.signOut();
        error = res && res.error ? res.error : null;
      } catch (err) {
        error = err;
      }
      if (error) {
        console.error('[librarian] signOut error:', error);
        el.logout.disabled = false;
        return;
      }
      redirectTo('../login.html');
    });
  }

  /* ----------------------------------------------------------
     7. Auth guard
  ---------------------------------------------------------- */
  async function requireLibrarian() {
    let sres;
    try {
      sres = await supabase.auth.getSession();
    } catch (err) {
      console.error('[librarian] getSession threw:', err);
      showFatal(
        'Could not verify your session',
        'We could not reach the authentication service. Please check your connection and try again.'
      );
      return null;
    }
    if (sres.error) {
      console.error('[librarian] getSession error:', sres.error);
      showFatal(
        'Could not verify your session',
        'Please sign in again to continue.'
      );
      return null;
    }
    const session = sres.data && sres.data.session;
    if (!session || !session.user) {
      redirectTo('../login.html');
      return null;
    }

    const userId = session.user.id;

    // profiles check
    let profileRes;
    try {
      profileRes = await supabase
        .from('profiles')
        .select('role, status, full_name')
        .eq('id', userId)
        .maybeSingle();
    } catch (err) {
      console.error('[librarian] profiles query threw:', err);
      showFatal(
        'Could not load your profile',
        'We could not reach the school database. Please try again.'
      );
      return null;
    }
    if (profileRes.error) {
      console.error('[librarian] profiles error:', profileRes.error);
      showFatal(
        'Could not load your profile',
        'Your profile could not be read. Please try again or contact the school office.'
      );
      return null;
    }
    const profile = profileRes.data;
    if (
      !profile ||
      profile.role !== 'librarian' ||
      profile.status !== 'active'
    ) {
      try { await supabase.auth.signOut(); } catch (e) {}
      redirectTo('../login.html');
      return null;
    }

    // librarian_profiles check
    let libRes;
    try {
      libRes = await supabase
        .from('librarian_profiles')
        .select('id, is_active')
        .eq('id', userId)
        .maybeSingle();
    } catch (err) {
      console.error('[librarian] librarian_profiles query threw:', err);
      showFatal(
        'Could not load your profile',
        'We could not reach the school database. Please try again.'
      );
      return null;
    }
    if (libRes.error) {
      console.error('[librarian] librarian_profiles error:', libRes.error);
      showFatal(
        'Could not load your profile',
        'Your profile could not be read. Please try again or contact the school office.'
      );
      return null;
    }
    if (!libRes.data || libRes.data.is_active !== true) {
      try { await supabase.auth.signOut(); } catch (e) {}
      redirectTo('../login.html');
      return null;
    }

    return { session, profile };
  }

  /* ----------------------------------------------------------
     8. Section switching
  ---------------------------------------------------------- */
  function setSection(name) {
    if (!name) return;
    state.currentSection = name;
    el.navLinks.forEach(function (btn) {
      const isActive = btn.getAttribute('data-section') === name;
      btn.classList.toggle('is-active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    el.sections.forEach(function (sec) {
      const key = sec.getAttribute('data-section-panel');
      sec.hidden = (key !== name);
    });
    closeDrawer();

    // Lazy-load section data if needed
    if (name === 'books' && state.books.length === 0) {
      loadBooks();
    } else if (
      (name === 'issued' || name === 'due' || name === 'overdue' || name === 'history') &&
      state.issues.length === 0
    ) {
      loadIssues();
    } else if (name === 'issue') {
      loadStudentsIfNeeded();
    }
  }

  el.navLinks.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setSection(btn.getAttribute('data-section'));
    });
  });

  /* ----------------------------------------------------------
     9. Reveal
  ---------------------------------------------------------- */
  function reveal() {
    if (el.shell) el.shell.hidden = false;
    if (el.guard) el.guard.remove();
  }

  /* ----------------------------------------------------------
     10. Load books (direct SELECT — RLS allows active librarians)
  ---------------------------------------------------------- */
  async function loadBooks() {
    if (el.booksError) el.booksError.hidden = true;
    if (el.booksEmpty) el.booksEmpty.hidden = true;
    if (el.booksTableWrap) el.booksTableWrap.hidden = true;
    setTextRaw(el.booksStatus, 'Loading books…');

    let res;
    try {
      res = await supabase
        .from('library_books')
        .select('id, book_number, title, author, category, isbn, status, created_at')
        .order('book_number', { ascending: true });
    } catch (err) {
      console.error('[librarian] loadBooks threw:', err);
      showBooksError('Could not load books. Please try again.');
      return;
    }

    if (res.error) {
      console.error('[librarian] loadBooks error:', res.error);
      showBooksError('Could not load books. Please try again.');
      return;
    }

    state.books = Array.isArray(res.data) ? res.data : [];
    renderBooks();
    populateIssueBookSelect();
    updateSummary();
  }

  function showBooksError(message) {
    setTextRaw(el.booksStatus, '');
    if (el.booksTableWrap) el.booksTableWrap.hidden = true;
    if (el.booksEmpty) el.booksEmpty.hidden = true;
    if (el.booksError) el.booksError.hidden = false;
    setTextRaw(el.booksErrorText, message);
  }

  function renderBooks() {
    if (!el.booksTableBody) return;

    const term = (el.bookSearch && el.bookSearch.value || '').trim().toLowerCase();
    const filtered = state.books.filter(function (b) {
      if (!term) return true;
      return [
        b.book_number,
        b.title,
        b.author,
        b.category,
        b.isbn
       ].some(function (value) {
        return String(value || '').toLowerCase().includes(term);
      });
    });

    el.booksTableBody.textContent = '';

    if (!filtered.length) {
      if (el.booksTableWrap) el.booksTableWrap.hidden = true;
      if (el.booksError) el.booksError.hidden = true;
      if (el.booksEmpty) {
        el.booksEmpty.hidden = false;
        const t = el.booksEmpty.querySelector('.lib-empty-title');
        const p = el.booksEmpty.querySelector('.lib-empty-text');
        if (term) {
          if (t) t.textContent = 'No matching books';
          if (p) p.textContent = 'Try a different search term.';
        } else {
          if (t) t.textContent = 'No books yet';
          if (p) p.textContent = 'Add a book to start building the library catalogue.';
        }
      }
      setTextRaw(el.booksStatus, filtered.length + ' shown');
      return;
    }

    if (el.booksEmpty) el.booksEmpty.hidden = true;
    if (el.booksError) el.booksError.hidden = true;
    if (el.booksTableWrap) el.booksTableWrap.hidden = false;

    const frag = document.createDocumentFragment();
    filtered.forEach(function (b) {
      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.textContent = b.book_number || '—';

      const tdTitle = document.createElement('td');
      tdTitle.textContent = b.title || '—';

      const tdAuthor = document.createElement('td');
      tdAuthor.textContent = b.author || '—';

      const tdCategory = document.createElement('td');
      tdCategory.textContent = b.category || '—';

      const tdIsbn = document.createElement('td');
      tdIsbn.textContent = b.isbn || '—';

      const tdStatus = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'lib-pill ' + statusPillClass(b.status);
      pill.textContent = b.status || '—';
      tdStatus.appendChild(pill);

      const tdActions = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'lib-row-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'lib-btn lib-btn-outline lib-btn-sm';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function () { openEditBook(b); });
      actions.appendChild(editBtn);

      if (b.status === 'available') {
        const lostBtn = document.createElement('button');
        lostBtn.type = 'button';
        lostBtn.className = 'lib-btn lib-btn-outline lib-btn-sm';
        lostBtn.textContent = 'Mark Lost';
        lostBtn.addEventListener('click', function () {
          confirmAction(
            'Mark book lost',
            'Mark book "' + (b.title || b.book_number) + '" as lost?',
            'Mark Lost',
            async function () {
              await runMarkBookLost(b.id);
            }
          );
        });
        actions.appendChild(lostBtn);

        const dmgBtn = document.createElement('button');
        dmgBtn.type = 'button';
        dmgBtn.className = 'lib-btn lib-btn-outline lib-btn-sm';
        dmgBtn.textContent = 'Mark Damaged';
        dmgBtn.addEventListener('click', function () {
          confirmAction(
            'Mark book damaged',
            'Mark book "' + (b.title || b.book_number) + '" as damaged?',
            'Mark Damaged',
            async function () {
              await runMarkBookDamaged(b.id);
            }
          );
        });
        actions.appendChild(dmgBtn);
      }

      tdActions.appendChild(actions);

      tr.appendChild(tdNum);
      tr.appendChild(tdTitle);
      tr.appendChild(tdAuthor);
      tr.appendChild(tdCategory);
      tr.appendChild(tdIsbn);
      tr.appendChild(tdStatus);
      tr.appendChild(tdActions);
      frag.appendChild(tr);
    });

    el.booksTableBody.appendChild(frag);
    setTextRaw(el.booksStatus, filtered.length + ' shown');
  }

  if (el.bookSearch) {
    el.bookSearch.addEventListener('input', renderBooks);
  }

  if (el.booksRetry) {
    el.booksRetry.addEventListener('click', function () {
      loadBooks();
    });
  }

  /* ----------------------------------------------------------
     11. Load students (RPC)
  ---------------------------------------------------------- */
  async function loadStudentsIfNeeded() {
    if (state.students.length > 0) {
      populateIssueStudentSelect();
      return;
    }
    let res;
    try {
      res = await supabase.rpc('get_library_students');
    } catch (err) {
      console.error('[librarian] get_library_students threw:', err);
      return;
    }
    if (res.error) {
      console.error('[librarian] get_library_students error:', res.error);
      return;
    }
    state.students = Array.isArray(res.data) ? res.data : [];

    // Sort: class_section, then roll_no, then full_name. Nulls last.
    state.students.sort(function (a, b) {
      const ac = (a.class_section || '').toLowerCase();
      const bc = (b.class_section || '').toLowerCase();
      if (ac !== bc) {
        if (!ac) return 1;
        if (!bc) return -1;
        return ac < bc ? -1 : 1;
      }
      const ar = a.roll_no;
      const br = b.roll_no;
      if (ar == null && br == null) {
        // fall through to name
      } else if (ar == null) return 1;
      else if (br == null) return -1;
      else if (ar !== br) return ar - br;
      const an = (a.full_name || '').toLowerCase();
      const bn = (b.full_name || '').toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });

    populateIssueStudentSelect();
  }

  
  function populateIssueStudentSelect() {
    if (!el.issueStudent || !el.issueStudentResults) return;

    const term = (
      el.issueStudentSearch?.value || ''
    ).trim().toLowerCase();

    el.issueStudentResults.textContent = '';

    if (!term) {
      el.issueStudentResults.textContent =
        'Type to search students.';
      return;
    }

    const matches = state.students.filter(function (student) {
      const name = String(student.full_name || '').toLowerCase();
      const schoolId = String(student.school_id || '').toLowerCase();
      const className = String(student.class_section || '').toLowerCase();
      const roll = String(student.roll_no ?? '').toLowerCase();

      return (
        name.startsWith(term) ||
        schoolId.includes(term) ||
        className.includes(term) ||
        roll.startsWith(term)
      );
    }).slice(0, 10);

    if (!matches.length) {
      el.issueStudentResults.textContent =
        'No matching students found.';
      return;
    }

    matches.forEach(function (student) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lib-btn lib-btn-outline';
      button.style.cssText =
        'display:block;width:100%;text-align:left;margin-top:6px;';

      const details = [
        student.full_name || 'Student',
        student.school_id || '',
        student.class_section || '',
        student.roll_no != null ? 'Roll ' + student.roll_no : ''
      ].filter(Boolean);

      const label = details.join(' · ');
      button.textContent = label;

      
    button.addEventListener('click', function () {
      const studentId = String(student.id);

      // Ensure the hidden select contains this student's ID.
      let option = Array.from(el.issueStudent.options).find(
        item => item.value === studentId
      );

      if (!option) {
        option = document.createElement('option');
        option.value = studentId;
        option.textContent = label;
        el.issueStudent.appendChild(option);
      }

      el.issueStudent.value = studentId;

      el.issueStudentSearch.value = label;
      el.issueStudentResults.textContent = '';

      console.log('[librarian] Selected student ID:', el.issueStudent.value);
    });


      el.issueStudentResults.appendChild(button);
    });
  }


  /* ----------------------------------------------------------
     12. Load issues (RPC)
  ---------------------------------------------------------- */
  async function loadIssues() {
    // Reset error panels in each list
    if (el.issuedError) el.issuedError.hidden = true;
    if (el.issuedAlert) el.issuedAlert.hidden = true;
    if (el.issuedEmpty) el.issuedEmpty.hidden = true;
    if (el.issuedTableWrap) el.issuedTableWrap.hidden = true;

    let res;
    try {
      res = await supabase.rpc('get_library_issue_list');
    } catch (err) {
      console.error('[librarian] get_library_issue_list threw:', err);
      showIssuedError('Could not load issues. Please try again.');
      return;
    }

    if (res.error) {
      console.error('[librarian] get_library_issue_list error:', res.error);
      showIssuedError('Could not load issues. Please try again.');
      return;
    }

    state.issues = Array.isArray(res.data) ? res.data : [];
    renderIssued();
    renderDue();
    renderOverdue();
    renderHistory();
    updateSummary();
  }

  function showIssuedError(message) {
    if (el.issuedError) el.issuedError.hidden = false;
    if (el.issuedErrorText) el.issuedErrorText.textContent = message;
    if (el.issuedTableWrap) el.issuedTableWrap.hidden = true;
    if (el.issuedEmpty) el.issuedEmpty.hidden = true;
  }

  function sortIssuesNewestFirst(rows) {
    return rows.slice().sort(function (a, b) {
      const ad = a.due_date || '';
      const bd = b.due_date || '';
      if (ad === bd) {
        const ai = a.issue_date || '';
        const bi = b.issue_date || '';
        return ai < bi ? 1 : ai > bi ? -1 : 0;
      }
      return ad < bd ? 1 : -1;
    });
  }

  /* ----------------------------------------------------------
     13. Render issued list
  ---------------------------------------------------------- */
  function renderIssued() {
    if (!el.issuedTableBody) return;

    const active = state.issues.filter(function (r) {
      return r.status === 'issued';
    });

    el.issuedTableBody.textContent = '';

    if (!active.length) {
      if (el.issuedTableWrap) el.issuedTableWrap.hidden = true;
      if (el.issuedError) el.issuedError.hidden = true;
      if (el.issuedEmpty) el.issuedEmpty.hidden = false;
      return;
    }
    if (el.issuedEmpty) el.issuedEmpty.hidden = true;
    if (el.issuedTableWrap) el.issuedTableWrap.hidden = false;

    const frag = document.createDocumentFragment();
    sortIssuesNewestFirst(active).forEach(function (r) {
      const tr = document.createElement('tr');

      const tdStudent = document.createElement('td');
      tdStudent.textContent = r.student_name || '—';

      const tdClass = document.createElement('td');
      const classBits = [];
      if (r.class_section) classBits.push(r.class_section);
      if (r.roll_no !== null && r.roll_no !== undefined) classBits.push('Roll ' + r.roll_no);
      tdClass.textContent = classBits.length ? classBits.join(' · ') : '—';

      const tdBookNo = document.createElement('td');
      tdBookNo.textContent = r.book_number || '—';

      const tdTitle = document.createElement('td');
      tdTitle.textContent = r.book_title || '—';

      const tdIssued = document.createElement('td');
      tdIssued.textContent = formatDateDisplay(r.issue_date);

      const tdDue = document.createElement('td');
      tdDue.textContent = formatDateDisplay(r.due_date);

      const tdActions = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'lib-row-actions';

      const ret = document.createElement('button');
      ret.type = 'button';
      ret.className = 'lib-btn lib-btn-primary lib-btn-sm';
      ret.textContent = 'Return';
      ret.addEventListener('click', function () {
        confirmAction(
          'Return book',
          'Return "' + (r.book_title || r.book_number) + '" from ' + (r.student_name || 'this student') + '?',
          'Confirm Return',
          async function () { await runReturn(r.issue_id, 'returned'); }
        );
      });
      actions.appendChild(ret);

      const lost = document.createElement('button');
      lost.type = 'button';
      lost.className = 'lib-btn lib-btn-outline lib-btn-sm';
      lost.textContent = 'Mark Lost';
      lost.addEventListener('click', function () {
        confirmAction(
          'Mark book lost',
          'Mark "' + (r.book_title || r.book_number) + '" as lost?',
          'Mark Lost',
          async function () { await runReturn(r.issue_id, 'lost'); }
        );
      });
      actions.appendChild(lost);

      const dmg = document.createElement('button');
      dmg.type = 'button';
      dmg.className = 'lib-btn lib-btn-outline lib-btn-sm';
      dmg.textContent = 'Mark Damaged';
      dmg.addEventListener('click', function () {
        confirmAction(
          'Mark book damaged',
          'Mark "' + (r.book_title || r.book_number) + '" as damaged?',
          'Mark Damaged',
          async function () { await runReturn(r.issue_id, 'damaged'); }
        );
      });
      actions.appendChild(dmg);

      tdActions.appendChild(actions);

      tr.appendChild(tdStudent);
      tr.appendChild(tdClass);
      tr.appendChild(tdBookNo);
      tr.appendChild(tdTitle);
      tr.appendChild(tdIssued);
      tr.appendChild(tdDue);
      tr.appendChild(tdActions);
      frag.appendChild(tr);
    });

    el.issuedTableBody.appendChild(frag);
  }

  if (el.issuedRefresh) {
    el.issuedRefresh.addEventListener('click', function () {
      loadIssues();
    });
  }
  if (el.issuedRetry) {
    el.issuedRetry.addEventListener('click', function () {
      loadIssues();
    });
  }

  /* ----------------------------------------------------------
     14. Render due today
  ---------------------------------------------------------- */
  function renderDue() {
    if (!el.dueTableBody) return;

    const today = state.todayISO;
    const active = state.issues.filter(function (r) {
      return r.status === 'issued' && r.due_date === today;
    });

    el.dueTableBody.textContent = '';

    if (!active.length) {
      if (el.dueTableWrap) el.dueTableWrap.hidden = true;
      if (el.dueEmpty) el.dueEmpty.hidden = false;
      return;
    }
    if (el.dueEmpty) el.dueEmpty.hidden = true;
    if (el.dueTableWrap) el.dueTableWrap.hidden = false;

    const frag = document.createDocumentFragment();
    active.forEach(function (r) {
      const tr = document.createElement('tr');
      const cells = [
        r.student_name || '—',
        classSummary(r),
        r.book_number || '—',
        r.book_title || '—',
        formatDateDisplay(r.issue_date),
        formatDateDisplay(r.due_date)
      ];
      cells.forEach(function (text) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    el.dueTableBody.appendChild(frag);
  }

  /* ----------------------------------------------------------
     15. Render overdue
  ---------------------------------------------------------- */
  function renderOverdue() {
    if (!el.overdueTableBody) return;

    const today = state.todayISO;
    const active = state.issues.filter(function (r) {
      return r.status === 'issued' && r.due_date < today;
    });

    el.overdueTableBody.textContent = '';

    if (!active.length) {
      if (el.overdueTableWrap) el.overdueTableWrap.hidden = true;
      if (el.overdueEmpty) el.overdueEmpty.hidden = false;
      return;
    }
    if (el.overdueEmpty) el.overdueEmpty.hidden = true;
    if (el.overdueTableWrap) el.overdueTableWrap.hidden = false;

    const frag = document.createDocumentFragment();
    active.forEach(function (r) {
      const tr = document.createElement('tr');
      const cells = [
        r.student_name || '—',
        classSummary(r),
        r.book_number || '—',
        r.book_title || '—',
        formatDateDisplay(r.issue_date),
        formatDateDisplay(r.due_date),
        String(Math.abs(daysBetweenISO(r.due_date, today))) + ' day' +
          (Math.abs(daysBetweenISO(r.due_date, today)) === 1 ? '' : 's')
      ];
      cells.forEach(function (text) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    el.overdueTableBody.appendChild(frag);
  }

  /* ----------------------------------------------------------
     16. Render history
  ---------------------------------------------------------- */

   
  function renderHistory() {
    if (!el.historyTableBody) return;

    const closed = state.issues.filter(function (r) {
      return ['returned', 'lost', 'damaged'].includes(r.status);
    });

    el.historyTableBody.textContent = '';

    if (!closed.length) {
      if (el.historyTableWrap) el.historyTableWrap.hidden = true;
      if (el.historyEmpty) el.historyEmpty.hidden = false;
      return;
    }

    if (el.historyEmpty) el.historyEmpty.hidden = true;
    if (el.historyTableWrap) el.historyTableWrap.hidden = false;

    const sorted = closed.slice().sort(function (a, b) {
      return String(b.returned_at || '').localeCompare(
        String(a.returned_at || '')
      );
    });

    const frag = document.createDocumentFragment();

    sorted.forEach(function (r) {
      const tr = document.createElement('tr');

      const cells = [
        r.student_name || '—',
        classSummary(r),
        r.book_number || '—',
        r.book_title || '—',
        formatDateDisplay(r.issue_date),
        formatDateDisplay(r.due_date),
        r.returned_at
          ? formatDateDisplay(String(r.returned_at).slice(0, 10))
          : '—'
      ];

      cells.forEach(function (text) {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });

      const tdStatus = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'lib-pill ' + statusPillClass(r.status);
      pill.textContent = r.status || '—';
      tdStatus.appendChild(pill);
      tr.appendChild(tdStatus);

      frag.appendChild(tr);
    });

    el.historyTableBody.appendChild(frag);
  }


  function classSummary(r) {
    const bits = [];
    if (r.class_section) bits.push(r.class_section);
    if (r.roll_no !== null && r.roll_no !== undefined) bits.push('Roll ' + r.roll_no);
    return bits.length ? bits.join(' · ') : '—';
  }
  
  function renderLibraryRings() {
    const books = state.books || [];
    const issues = state.issues || [];
    const today = state.todayISO;

    const available = books.filter(
      book => book.status === 'available'
    ).length;

    const issuedBooks = books.filter(
      book => book.status === 'issued'
    ).length;

    const trackedBooks = available + issuedBooks;
    const bookPercent = trackedBooks
      ? (available / trackedBooks) * 100
      : 0;

    if (el.ringTotal) el.ringTotal.textContent = books.length;
    if (el.ringAvailable) el.ringAvailable.textContent = available;
    if (el.ringIssued) el.ringIssued.textContent = issuedBooks;

    if (el.booksRing) {
      el.booksRing.style.background = trackedBooks
        ? `conic-gradient(#F97316 0% ${bookPercent}%, #FDBA74 ${bookPercent}% 100%)`
        : 'conic-gradient(#E5E7EB 0% 100%)';
    }

    const activeIssues = issues.filter(
      issue => issue.status === 'issued'
    );

    const overdue = activeIssues.filter(
      issue => issue.due_date && today && issue.due_date < today
    ).length;

    const onTime = activeIssues.length - overdue;
    const loanPercent = activeIssues.length
      ? (onTime / activeIssues.length) * 100
      : 0;

    if (el.ringActive) {
      el.ringActive.textContent = activeIssues.length;
    }
    if (el.ringOnTime) el.ringOnTime.textContent = onTime;
    if (el.ringOverdue) el.ringOverdue.textContent = overdue;

    if (el.loansRing) {
      el.loansRing.style.background = activeIssues.length
        ? `conic-gradient(#16A34A 0% ${loanPercent}%, #EF4444 ${loanPercent}% 100%)`
        : 'conic-gradient(#E5E7EB 0% 100%)';
    }
  }

  function getKolkataMonth(dateValue) {
    if (!dateValue) return '';

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(date);

    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;

    return year && month ? `${year}-${month}` : '';
  }

  function renderLibraryMonthlyChart() {
    const chart = el.monthlyChart;
    if (!chart) return;

    const issues = state.issues || [];
    const today = state.todayISO;

    if (!today) {
      chart.textContent = 'Activity data is not ready yet.';
      return;
    }

    const currentYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7)) - 1;
    const months = [];

    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(Date.UTC(
        currentYear,
        currentMonth - offset,
        1
      ));

      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;

      const label = new Intl.DateTimeFormat('en-IN', {
        month: 'short',
        timeZone: 'UTC'
      }).format(date);

      months.push({
        key,
        label: `${label} '${String(year).slice(-2)}`,
        issued: 0,
        returned: 0
      });
    }

    const monthMap = new Map(
      months.map(month => [month.key, month])
    );

    issues.forEach(issue => {
      // issue_date is a date-only value; preserve its stored calendar month.
      const issueMonth = String(issue.issue_date || '').slice(0, 7);
      const issueBucket = monthMap.get(issueMonth);

      if (issueBucket) issueBucket.issued++;

      if (issue.status === 'returned' && issue.returned_at) {
        const returnMonth = getKolkataMonth(issue.returned_at);
        const returnBucket = monthMap.get(returnMonth);

        if (returnBucket) returnBucket.returned++;
      }
    });

    const maxValue = Math.max(
      0,
      ...months.flatMap(month => [month.issued, month.returned])
    );

    chart.textContent = '';

    if (maxValue === 0) {
      const empty = document.createElement('p');
      empty.className = 'lib-chart-empty';
      empty.textContent = 'Not enough history yet';
      chart.appendChild(empty);
      return;
    }

    months.forEach(month => {
      const group = document.createElement('div');
      group.className = 'lib-chart-month';

      const bars = document.createElement('div');
      bars.className = 'lib-chart-bars';

      [
        { type: 'issued', value: month.issued },
        { type: 'returned', value: month.returned }
      ].forEach(item => {
        const bar = document.createElement('span');
        bar.className = `lib-chart-bar is-${item.type}`;
        bar.style.setProperty(
          '--bar-height',
          item.value ? `${Math.max(6, item.value / maxValue * 100)}%` : '0%'
        );
        bar.title = `${month.label}: ${item.value} ${item.type}`;
        bar.setAttribute(
          'aria-label',
          `${month.label}: ${item.value} ${item.type}`
        );
        bars.appendChild(bar);
      });

      const label = document.createElement('span');
      label.className = 'lib-chart-month-label';
      label.textContent = month.label;

      group.appendChild(bars);
      group.appendChild(label);
      chart.appendChild(group);
    });
  }

  /* ----------------------------------------------------------
     17. Summary statistics
  ---------------------------------------------------------- */
  function updateSummary() {
    if (el.statError) el.statError.hidden = true;

    const total = state.books.length;
    const available = state.books.filter(function (b) {
      return b.status === 'available';
    }).length;

    const today = state.todayISO;
    const active = state.issues.filter(function (r) {
      return r.status === 'issued';
    });
    const issued = active.length;
    const due = active.filter(function (r) { return r.due_date === today; }).length;
    const overdue = active.filter(function (r) { return r.due_date < today; }).length;

    setText(el.statTotal, String(total));
    setText(el.statAvailable, String(available));
    setText(el.statIssued, String(issued));
    setText(el.statDue, String(due));
    setText(el.statOverdue, String(overdue));

    setTextRaw(el.statTotalNote, '');
    setTextRaw(el.statAvailableNote, '');
    setTextRaw(el.statIssuedNote, '');
    setTextRaw(el.statDueNote, '');
    setTextRaw(el.statOverdueNote, '');

    renderLibraryRings();
    renderLibraryMonthlyChart();
  }

  if (el.statRetry) {
    el.statRetry.addEventListener('click', function () {
      loadAll();
    });
  }

  /* ----------------------------------------------------------
     18. Add Book dialog
  ---------------------------------------------------------- */
  function openAddBookDialog() {
    if (!el.addBookDialog) return;
    showAlert(el.addBookAlert, null);
    if (el.addBookForm) el.addBookForm.reset();
    if (typeof el.addBookDialog.showModal === 'function') {
      el.addBookDialog.showModal();
    } else {
      el.addBookDialog.setAttribute('open', '');
    }
    if (el.addBookNumber) el.addBookNumber.focus();
  }
  function closeAddBookDialog() {
    if (!el.addBookDialog) return;
    if (typeof el.addBookDialog.close === 'function') {
      if (el.addBookDialog.open) el.addBookDialog.close();
    } else {
      el.addBookDialog.removeAttribute('open');
    }
  }
  if (el.addBookBtn) {
    el.addBookBtn.addEventListener('click', openAddBookDialog);
  }
  if (el.addBookForm) {
    el.addBookForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.isSubmitting) return;
      showAlert(el.addBookAlert, null);

      const bookNumber = (el.addBookNumber && el.addBookNumber.value || '').trim();
      const title = (el.addTitle && el.addTitle.value || '').trim();
      const author = (el.addAuthor && el.addAuthor.value || '').trim();
      const category = (el.addCategory && el.addCategory.value || '').trim();
      const isbn = (el.addIsbn && el.addIsbn.value || '').trim();

      if (!bookNumber) {
        showAlert(el.addBookAlert, 'Book number is required.', 'error');
        return;
      }
      if (!title) {
        showAlert(el.addBookAlert, 'Title is required.', 'error');
        return;
      }

      state.isSubmitting = true;
      setButtonLoading(el.addBookSubmit, true);

      let res;
      try {
        res = await supabase.rpc('add_book', {
          p_book_number: bookNumber,
          p_title: title,
          p_author: author || null,
          p_category: category || null,
          p_isbn: isbn || null
        });
      } catch (err) {
        console.error('[librarian] add_book threw:', err);
        state.isSubmitting = false;
        setButtonLoading(el.addBookSubmit, false);
        showAlert(el.addBookAlert, 'Could not add the book. Please try again.', 'error');
        return;
      }

      state.isSubmitting = false;
      setButtonLoading(el.addBookSubmit, false);

      if (res.error) {
        console.error('[librarian] add_book error:', res.error);
        const msg = String(res.error.message || '');
        if (/duplicate|unique/i.test(msg)) {
          showAlert(el.addBookAlert, 'This book number already exists. Choose a different book number.', 'error');
        } else {
          showAlert(el.addBookAlert, 'Could not add the book: ' + msg, 'error');
        }
        return;
      }

      closeAddBookDialog();
      await loadBooks();
    });
  }

  /* ----------------------------------------------------------
     19. Edit Book dialog
  ---------------------------------------------------------- */
  function openEditBook(book) {
    if (!el.editBookDialog) return;
    showAlert(el.editBookAlert, null);
    if (el.editBookId) el.editBookId.value = book.id;
    if (el.editBookNumber) el.editBookNumber.textContent = book.book_number || '—';
    if (el.editTitle) el.editTitle.value = book.title || '';
    if (el.editAuthor) el.editAuthor.value = book.author || '';
    if (el.editCategory) el.editCategory.value = book.category || '';
    if (el.editIsbn) el.editIsbn.value = book.isbn || '';

    if (typeof el.editBookDialog.showModal === 'function') {
      el.editBookDialog.showModal();
    } else {
      el.editBookDialog.setAttribute('open', '');
    }
    if (el.editTitle) el.editTitle.focus();
  }
  function closeEditBookDialog() {
    if (!el.editBookDialog) return;
    if (typeof el.editBookDialog.close === 'function') {
      if (el.editBookDialog.open) el.editBookDialog.close();
    } else {
      el.editBookDialog.removeAttribute('open');
    }
  }
  if (el.editBookForm) {
    el.editBookForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.isSubmitting) return;
      showAlert(el.editBookAlert, null);

      const bookId = el.editBookId && el.editBookId.value;
      const title = (el.editTitle && el.editTitle.value || '').trim();
      const author = (el.editAuthor && el.editAuthor.value || '').trim();
      const category = (el.editCategory && el.editCategory.value || '').trim();
      const isbn = (el.editIsbn && el.editIsbn.value || '').trim();

      if (!bookId) {
        showAlert(el.editBookAlert, 'Missing book id.', 'error');
        return;
      }
      if (!title) {
        showAlert(el.editBookAlert, 'Title is required.', 'error');
        return;
      }

      state.isSubmitting = true;
      setButtonLoading(el.editBookSubmit, true);

      let res;
      try {
        res = await supabase.rpc('update_book_metadata', {
          p_book_id: bookId,
          p_title: title,
          p_author: author || null,
          p_category: category || null,
          p_isbn: isbn || null
        });
      } catch (err) {
        console.error('[librarian] update_book_metadata threw:', err);
        state.isSubmitting = false;
        setButtonLoading(el.editBookSubmit, false);
        showAlert(el.editBookAlert, 'Could not save changes. Please try again.', 'error');
        return;
      }

      state.isSubmitting = false;
      setButtonLoading(el.editBookSubmit, false);

      if (res.error) {
        console.error('[librarian] update_book_metadata error:', res.error);
        showAlert(el.editBookAlert, 'Could not save changes: ' + String(res.error.message || ''), 'error');
        return;
      }

      closeEditBookDialog();
      await loadBooks();
    });
  }

  /* ----------------------------------------------------------
     20. Confirm dialog
  ---------------------------------------------------------- */
  function confirmAction(title, text, confirmLabel, handler) {
    if (!el.confirmDialog) {
      // Fallback: no dialog available.
      if (window.confirm(text)) handler();
      return;
    }
    setTextRaw(el.confirmTitle, title || 'Confirm');
    setTextRaw(el.confirmText, text || 'Are you sure?');
    setTextRaw(el.confirmSubmitLabel, confirmLabel || 'Confirm');
    state.confirmHandler = handler;
    if (typeof el.confirmDialog.showModal === 'function') {
      el.confirmDialog.showModal();
    } else {
      el.confirmDialog.setAttribute('open', '');
    }
  }
  function closeConfirmDialog() {
    if (!el.confirmDialog) return;
    if (typeof el.confirmDialog.close === 'function') {
      if (el.confirmDialog.open) el.confirmDialog.close();
    } else {
      el.confirmDialog.removeAttribute('open');
    }
    state.confirmHandler = null;
  }
  if (el.confirmSubmit) {
    el.confirmSubmit.addEventListener('click', async function () {
      const handler = state.confirmHandler;
      if (!handler) return;
      setButtonLoading(el.confirmSubmit, true);
      try {
        await handler();
      } catch (err) {
        console.error('[librarian] confirm handler error:', err);
      } finally {
        setButtonLoading(el.confirmSubmit, false);
        closeConfirmDialog();
      }
    });
  }

  // Wire [data-close-dialog] buttons inside dialogs
  document.querySelectorAll('[data-close-dialog]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const dlg = btn.closest('dialog');
      if (dlg) {
        if (typeof dlg.close === 'function' && dlg.open) dlg.close();
        else dlg.removeAttribute('open');
      }
      // Also clear any pending confirm handler if this was the confirm dialog
      if (dlg && dlg.id === 'libConfirmDialog') {
        state.confirmHandler = null;
      }
    });
  });

  /* ----------------------------------------------------------
     21. Action helpers (RPC wrappers)
  ---------------------------------------------------------- */
  async function runReturn(issueId, outcome) {
    let res;
    try {
      res = await supabase.rpc('return_book', {
        p_issue_id: issueId,
        p_outcome: outcome
      });
    } catch (err) {
      console.error('[librarian] return_book threw:', err);
      showAlert(el.issuedAlert, 'Could not process the return. Please try again.', 'error');
      return;
    }
    if (res.error) {
      console.error('[librarian] return_book error:', res.error);
      showAlert(el.issuedAlert, 'Could not process the return: ' + String(res.error.message || ''), 'error');
      return;
    }
    showAlert(el.issuedAlert, 'Return processed.', 'success');
    await Promise.all([loadBooks(), loadIssues()]);
  }

  async function runMarkBookLost(bookId) {
    let res;
    try {
      res = await supabase.rpc('mark_book_lost', { p_book_id: bookId });
    } catch (err) {
      console.error('[librarian] mark_book_lost threw:', err);
      showAlert(el.booksStatus ? null : null, null); // no-op; keep console
      window.alert('Could not mark the book as lost. Please try again.');
      return;
    }
    if (res.error) {
      console.error('[librarian] mark_book_lost error:', res.error);
      window.alert('Could not mark the book as lost: ' + String(res.error.message || ''));
      return;
    }
    await loadBooks();
  }

  async function runMarkBookDamaged(bookId) {
    let res;
    try {
      res = await supabase.rpc('mark_book_damaged', { p_book_id: bookId });
    } catch (err) {
      console.error('[librarian] mark_book_damaged threw:', err);
      window.alert('Could not mark the book as damaged. Please try again.');
      return;
    }
    if (res.error) {
      console.error('[librarian] mark_book_damaged error:', res.error);
      window.alert('Could not mark the book as damaged: ' + String(res.error.message || ''));
      return;
    }
    await loadBooks();
  }

  /* ----------------------------------------------------------
     22. Issue form
  ---------------------------------------------------------- */
  function refreshIssueDuePreview() {
    if (!el.issueDuePreview) return;
    const issueDate = (el.issueDate && el.issueDate.value) || '';
    const days = Number((el.issueLoanDays && el.issueLoanDays.value) || 0);
    if (!issueDate || !days || days < 1 || days > 365) {
      el.issueDuePreview.textContent = '—';
      return;
    }
    const dueDate = addDaysISO(issueDate, days);
    el.issueDuePreview.textContent = formatDateDisplay(dueDate);
  }

  if (el.issueDate) el.issueDate.addEventListener('change', refreshIssueDuePreview);
  if (el.issueLoanDays) el.issueLoanDays.addEventListener('input', refreshIssueDuePreview);


  
  function populateIssueBookSelect() {
    if (!el.issueBook || !el.issueBookResults) return;

    const term = (
      el.issueBookSearch?.value || ''
    ).trim().toLowerCase();

    // Sirf available books
    console.log("All books:", state.books);
    console.log(
      "Book statuses:",
      state.books.map(book => ({
        title: book.title,
        status: book.status
      }))
    );
    const available = state.books.filter(function (book) {
      return String(book.status || '')
        .trim()
        .toLowerCase() === 'available';
    });

    // Hidden select ko available books se fill karo
    el.issueBook.textContent = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select book';
    el.issueBook.appendChild(placeholder);

    available.forEach(function (book) {
      const option = document.createElement('option');
      option.value = book.id;
      option.textContent =
        (book.book_number || '') + ' · ' +
        (book.title || 'Untitled');

      el.issueBook.appendChild(option);
    });

    // Search results
    el.issueBookResults.textContent = '';

    if (!term) {
      el.issueBookResults.textContent =
        'Type to search available books.';
      return;
    }

    const matches = available.filter(function (book) {
      return [
        book.book_number,
        book.title,
        book.author,
        book.category,
        book.isbn
      ].some(function (value) {
        return String(value || '')
          .toLowerCase()
          .includes(term);
      });
    }).slice(0, 10);

    if (!matches.length) {
      el.issueBookResults.textContent =
        'No matching available books found.';
      return;
    }

    matches.forEach(function (book) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lib-btn lib-btn-outline';
      button.style.cssText =
        'display:block;width:100%;text-align:left;margin-top:6px;';

      const label =
        (book.book_number || 'No number') + ' · ' +
        (book.title || 'Untitled') +
        (book.author ? ' · ' + book.author : '');

      button.textContent = label;

      button.addEventListener('click', function () {
        el.issueBook.value = book.id;
        el.issueBookSearch.value = label;
        el.issueBookResults.textContent = '';
      });

      el.issueBookResults.appendChild(button);
    });
  }


  if (el.issueStudentSearch) {
    el.issueStudentSearch.addEventListener(
      'input',
      populateIssueStudentSelect
    );
  }

  if (el.issueBookSearch) {
    el.issueBookSearch.addEventListener('input', function () {
      if (el.issueBook) {
        el.issueBook.value = '';
      }

      populateIssueBookSelect();
    });
  }
  if (el.issueForm) {
    el.issueForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (state.isSubmitting) return;
      showAlert(el.issueAlert, null);

      const studentId = el.issueStudent && el.issueStudent.value;
      const bookId = el.issueBook && el.issueBook.value;
      const issueDate = el.issueDate && el.issueDate.value;
      const loanDays = Number(el.issueLoanDays && el.issueLoanDays.value);

      if (!studentId) {
        showAlert(el.issueAlert, 'Please select a student.', 'error');
        return;
      }
      if (!bookId) {
        showAlert(el.issueAlert, 'Please select an available book.', 'error');
        return;
      }
      if (!issueDate) {
        showAlert(el.issueAlert, 'Please choose an issue date.', 'error');
        return;
      }
      if (!loanDays || loanDays < 1 || loanDays > 365) {
        showAlert(el.issueAlert, 'Loan duration must be between 1 and 365 days.', 'error');
        return;
      }

      state.isSubmitting = true;
      setButtonLoading(el.issueSubmit, true);

      let res;
      try {
        res = await supabase.rpc('issue_book', {
          p_student_id: studentId,
          p_book_id: bookId,
          p_loan_days: loanDays,
          p_issue_date: issueDate
        });
      } catch (err) {
        console.error('[librarian] issue_book threw:', err);
        state.isSubmitting = false;
        setButtonLoading(el.issueSubmit, false);
        showAlert(el.issueAlert, 'Could not issue the book. Please try again.', 'error');
        return;
      }

      state.isSubmitting = false;
      setButtonLoading(el.issueSubmit, false);

      if (res.error) {
        console.error('[librarian] issue_book error:', res.error);
        showAlert(el.issueAlert, 'Could not issue the book: ' + String(res.error.message || ''), 'error');
        return;
      }

      showAlert(el.issueAlert, 'Book issued successfully.', 'success');
      if (el.issueForm) el.issueForm.reset();
      if (el.issueDate) el.issueDate.value = state.todayISO;
      if (el.issueLoanDays) el.issueLoanDays.value = '14';
      refreshIssueDuePreview();
      populateIssueBookSelect();
      await Promise.all([loadBooks(), loadIssues()]);
    });
  }

  /* ----------------------------------------------------------
     23. Main data load
  ---------------------------------------------------------- */
  async function loadAll() {
    if (el.statError) el.statError.hidden = true;
    await Promise.all([loadBooks(), loadIssues()]);
  }

  /* ----------------------------------------------------------
     24. Init
  ---------------------------------------------------------- */
  async function init() {
    state.todayISO = todayKolkataISO();

    const auth = await requireLibrarian();
    if (!auth) return; // redirect or fatal already handled

    state.currentUser = auth.session.user;
    state.currentProfile = auth.profile;

    // Render identity
    const name = (auth.profile && auth.profile.full_name) || 'Librarian';
    setText(el.userName, name);
    setText(el.userInitial, initialOf(name));

    // Wire logout, but only after auth passed
    wireLogout();

    // Initialize form defaults
    if (el.issueDate) el.issueDate.value = state.todayISO;
    if (el.issueLoanDays) el.issueLoanDays.value = '14';
    refreshIssueDuePreview();

    // Reveal
    reveal();

    // Load initial data
    await loadAll();

    // Ensure the default section is dashboard
    setSection('dashboard');
  }

  init();

})();