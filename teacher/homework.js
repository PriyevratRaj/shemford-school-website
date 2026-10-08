/* ============================================================
   TEACHER HOMEWORK — CREATE / LIST / EDIT / DELETE
   ------------------------------------------------------------
   Auth guard mirrors teacher/dashboard.js exactly:
     1. Session exists?          no  → ../login.html
     2. Profile loads?           no  → sign out → login
     3. Status is 'active'?      no  → sign out → message
     4. Role is 'teacher'?       no  → redirect to correct dashboard
     5. All good → load list + wire form

   Note: this JavaScript role check is a frontend guard only.
   Real security lives in Supabase Row Level Security.
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
  const guard        = document.getElementById('dashGuard');
  const shell        = document.getElementById('dashShell');

  const nameEl       = document.getElementById('dashUserName');
  const initialEl    = document.getElementById('dashUserInitial');
  const logoutBtn    = document.getElementById('dashLogout');
  const notifBtn     = document.getElementById('dashNotificationsBtn');

  const menuBtn      = document.getElementById('dashMenuBtn');
  const sidebar      = document.getElementById('dashSidebar');
  const backdrop     = document.getElementById('dashBackdrop');

  const alertEl      = document.getElementById('hwAlert');

  const formEl       = document.getElementById('hwForm');
  const formTitle    = document.getElementById('hwFormTitle');
  const formSub      = document.getElementById('hwFormSub');
  const saveBtn      = document.getElementById('hwSaveBtn');
  const cancelBtn    = document.getElementById('hwCancelBtn');

  const classEl      = document.getElementById('hwClass');
  const subjectEl    = document.getElementById('hwSubject');
  const titleEl      = document.getElementById('hwTitle');
  const instrEl      = document.getElementById('hwInstructions');
  const assignedEl   = document.getElementById('hwAssigned');
  const dueEl        = document.getElementById('hwDue');

  const loadingEl    = document.getElementById('hwLoading');
  const emptyEl      = document.getElementById('hwEmpty');
  const listEl       = document.getElementById('hwList');
  const countEl      = document.getElementById('hwCount');

  /* ----------------------------------------------------------
     2. Module state
  ---------------------------------------------------------- */
  let currentUser   = null;   // { id, ... } from session.user
  let teacherName   = '';     // resolved from profiles.full_name
  let editingId     = null;   // null when creating; uuid when editing
  let allHomework   = [];     // local cache of the teacher's rows

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

  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDate(iso) {
    if (!iso) return '–';
    // iso is 'YYYY-MM-DD'; render as 'DD MMM YYYY'
    const parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
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
      alertEl.classList.remove('is-success', 'is-error', 'is-info');
      return;
    }
    alertEl.hidden = false;
    alertEl.textContent = message;
    alertEl.classList.remove('is-success', 'is-error', 'is-info');
    if (variant) alertEl.classList.add('is-' + variant);
  }

  function setSaving(isSaving) {
    if (!saveBtn) return;
    saveBtn.classList.toggle('is-loading', isSaving);
    saveBtn.disabled = isSaving;
  }

  function clearFieldError(el) {
    if (el) el.removeAttribute('aria-invalid');
  }
  function markFieldError(el) {
    if (el) el.setAttribute('aria-invalid', 'true');
  }

  /* ----------------------------------------------------------
     4. Mobile sidebar (same pattern as dashboard.js)
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
     5. Notifications button
  ---------------------------------------------------------- */
  if (notifBtn) {
    notifBtn.addEventListener('click', function () {
      window.location.href = 'announcements.html';
    });
  }

  /* ----------------------------------------------------------
     6. Auth guard
  ---------------------------------------------------------- */
  const OTHER_DASHBOARDS = {
    student: '../student/dashboard.html',
    admin:   '../admin/dashboard.html'
  };

  async function requireTeacher() {
    const sessionResult = await supabase.auth.getSession();

    if (sessionResult.error) {
      console.error('[teacher-homework] getSession error:', sessionResult.error);
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
      console.error('[teacher-homework] profile load failed:', profileResult.error);
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

    if (profile.role !== 'teacher') {
      const target = OTHER_DASHBOARDS[profile.role];
      if (target) {
        redirectTo(target);
      } else {
        try { await supabase.auth.signOut(); } catch (e) { /* ignore */ }
        redirectTo('../login.html');
      }
      return null;
    }

    // Success — populate header chip and remember teacher name
    teacherName = profile.full_name || 'Teacher';
    setText(nameEl, teacherName);
    setText(initialEl, initialOf(teacherName));

    return { session, profile };
  }

  /* ----------------------------------------------------------
     7. Reveal + logout
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
      catch (err) { console.error('[teacher-homework] signOut error:', err); }
      redirectTo('../login.html');
    });
  }

  /* ----------------------------------------------------------
     8. Form defaults
  ---------------------------------------------------------- */
  function resetForm() {
    editingId = null;
    if (formEl) formEl.reset();
    if (assignedEl) assignedEl.value = todayISO();
    if (dueEl) dueEl.value = '';
    if (formTitle) formTitle.textContent = 'Create Homework';
    if (formSub) {
      formSub.textContent =
        'Fill in the details and save. Students from the selected class will see it instantly.';
    }
    if (cancelBtn) cancelBtn.hidden = true;

    [classEl, subjectEl, titleEl, instrEl, assignedEl, dueEl].forEach(clearFieldError);
    setAlert(null);
  }

  function enterEditMode(hw) {
    editingId = hw.id;
    if (classEl) classEl.value = hw.class_section || '';
    if (subjectEl) subjectEl.value = hw.subject || '';
    if (titleEl) titleEl.value = hw.title || '';
    if (instrEl) instrEl.value = hw.instructions || '';
    if (assignedEl) assignedEl.value = hw.assigned_date || todayISO();
    if (dueEl) dueEl.value = hw.due_date || '';

    if (formTitle) formTitle.textContent = 'Edit Homework';
    if (formSub) {
      formSub.textContent =
        'Update the details and save. Changes will be reflected for students in the selected class.';
    }
    if (cancelBtn) cancelBtn.hidden = false;

    setAlert(null);

    // Scroll to form
    const formCard = document.querySelector('.hw-form-card');
    if (formCard && formCard.scrollIntoView) {
      formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ----------------------------------------------------------
     9. Validation
  ---------------------------------------------------------- */
  function validateForm() {
    let ok = true;

    [classEl, subjectEl, titleEl, assignedEl, dueEl].forEach(clearFieldError);

    if (!classEl || !classEl.value) {
      markFieldError(classEl); ok = false;
    }
    if (!subjectEl || !subjectEl.value) {
      markFieldError(subjectEl); ok = false;
    }
    if (!titleEl || !titleEl.value.trim()) {
      markFieldError(titleEl); ok = false;
    }
    if (!assignedEl || !assignedEl.value) {
      markFieldError(assignedEl); ok = false;
    }
    if (!dueEl || !dueEl.value) {
      markFieldError(dueEl); ok = false;
    }

    if (ok && assignedEl.value && dueEl.value) {
      // due date must not be before assigned date
      if (dueEl.value < assignedEl.value) {
        markFieldError(dueEl);
        setAlert('Due date cannot be earlier than the assigned date.', 'error');
        dueEl.focus();
        return false;
      }
    }

    if (!ok) {
      setAlert('Please fill in all required fields.', 'error');
      const first =
        (classEl && !classEl.value && classEl) ||
        (subjectEl && !subjectEl.value && subjectEl) ||
        (titleEl && !titleEl.value.trim() && titleEl) ||
        (assignedEl && !assignedEl.value && assignedEl) ||
        (dueEl && !dueEl.value && dueEl);
      if (first && first.focus) first.focus();
      return false;
    }

    return true;
  }

  /* ----------------------------------------------------------
     10. Load list
  ---------------------------------------------------------- */
  async function loadHomework() {
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (listEl) listEl.hidden = true;

    const result = await supabase
      .from('homework')
      .select('id, teacher_id, teacher_name, class_section, subject, title, instructions, assigned_date, due_date, created_at')
      .eq('teacher_id', currentUser.id)
      .order('created_at', { ascending: false });

    if (loadingEl) loadingEl.hidden = true;

    if (result.error) {
      console.error('[teacher-homework] load error:', result.error);
      setAlert('Could not load your homework. Please try again.', 'error');
      renderList([]);
      return;
    }

    allHomework = Array.isArray(result.data) ? result.data : [];
    renderList(allHomework);
  }

  /* ----------------------------------------------------------
     11. Render list
  ---------------------------------------------------------- */
  function renderList(items) {
    if (countEl) {
      countEl.textContent =
        items.length === 0
          ? 'No items'
          : items.length + (items.length === 1 ? ' item' : ' items');
    }

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (listEl) {
        listEl.hidden = true;
        listEl.innerHTML = '';
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (!listEl) return;
    listEl.hidden = false;
    listEl.innerHTML = '';

    items.forEach(function (hw) {
      const card = document.createElement('article');
      card.className = 'hw-item';
      card.setAttribute('data-id', hw.id);

      const instructions = hw.instructions
        ? escapeHtml(hw.instructions)
        : '<span style="color:var(--muted)">No instructions</span>';

      card.innerHTML =
        '<div class="hw-item-main">' +
          '<div class="hw-item-tags">' +
            '<span class="hw-tag">' + escapeHtml(hw.subject || '—') + '</span>' +
            '<span class="hw-tag hw-tag-plain">Class ' + escapeHtml(hw.class_section || '—') + '</span>' +
          '</div>' +
          '<h3 class="hw-item-title">' + escapeHtml(hw.title || 'Untitled') + '</h3>' +
          '<p class="hw-item-instructions">' + instructions + '</p>' +
          '<div class="hw-item-dates">' +
            '<span>Assigned: <strong>' + escapeHtml(formatDate(hw.assigned_date)) + '</strong></span>' +
            '<span>Due: <strong>' + escapeHtml(formatDate(hw.due_date)) + '</strong></span>' +
          '</div>' +
        '</div>' +
        '<div class="hw-item-actions">' +
          '<button type="button" class="hw-btn hw-btn-edit" data-action="edit" data-id="' + escapeHtml(hw.id) + '">' +
            'Edit' +
          '</button>' +
          '<button type="button" class="hw-btn hw-btn-delete" data-action="delete" data-id="' + escapeHtml(hw.id) + '">' +
            'Delete' +
          '</button>' +
        '</div>';

      listEl.appendChild(card);
    });
  }

  /* ----------------------------------------------------------
     12. Save (create or update)
  ---------------------------------------------------------- */
  async function handleSave(event) {
    event.preventDefault();
    setAlert(null);

    if (!validateForm()) return;

    const payload = {
      class_section: classEl.value.trim(),
      subject: subjectEl.value.trim(),
      title: titleEl.value.trim(),
      instructions: (instrEl.value || '').trim() || null,
      assigned_date: assignedEl.value,
      due_date: dueEl.value
    };

    setSaving(true);

    if (editingId) {
      // ----- UPDATE -----
      const result = await supabase
        .from('homework')
        .update(payload)
        .eq('id', editingId)
        .eq('teacher_id', currentUser.id)   // extra safety; RLS also enforces
        .select('id')
        .single();

      setSaving(false);

      if (result.error) {
        console.error('[teacher-homework] update error:', result.error);
        setAlert('Could not update homework. Please try again.', 'error');
        return;
      }

      setAlert('Homework updated successfully.', 'success');
      resetForm();
      await loadHomework();
      return;
    }

    // ----- INSERT -----
    const insertRow = Object.assign({}, payload, {
      teacher_id: currentUser.id,        // always the authenticated user
      teacher_name: teacherName          // from profiles.full_name
      // attachment_name, attachment_url left NULL for now
    });

    const result = await supabase
      .from('homework')
      .insert(insertRow)
      .select('id')
      .single();

    setSaving(false);

    if (result.error) {
      console.error('[teacher-homework] insert error:', result.error);
      setAlert('Could not save homework. Please try again.', 'error');
      return;
    }

    setAlert('Homework created successfully.', 'success');
    resetForm();
    await loadHomework();
  }

  /* ----------------------------------------------------------
     13. Delete
  ---------------------------------------------------------- */
  async function handleDelete(id) {
    const target = allHomework.find(function (x) { return x.id === id; });
    const label = target
      ? (target.subject + ' — ' + target.title)
      : 'this homework';

    const confirmed = window.confirm(
      'Delete ' + label + '?\n\nThis cannot be undone.'
    );
    if (!confirmed) return;

    setAlert(null);

    const result = await supabase
      .from('homework')
      .delete()
      .eq('id', id)
      .eq('teacher_id', currentUser.id)   // extra safety; RLS also enforces
      .select('id');

    if (result.error) {
      console.error('[teacher-homework] delete error:', result.error);
      setAlert('Could not delete homework. Please try again.', 'error');
      return;
    }

    // If we were editing this exact item, exit edit mode
    if (editingId === id) resetForm();

    setAlert('Homework deleted.', 'success');
    await loadHomework();
  }

  /* ----------------------------------------------------------
     14. Event wiring
  ---------------------------------------------------------- */
  function wireEvents() {
    if (formEl) formEl.addEventListener('submit', handleSave);

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        resetForm();
        setAlert('Editing cancelled.', 'info');
      });
    }

    if (listEl) {
      listEl.addEventListener('click', function (e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');

        if (action === 'edit') {
          const hw = allHomework.find(function (x) { return x.id === id; });
          if (hw) enterEditMode(hw);
        } else if (action === 'delete') {
          handleDelete(id);
        }
      });
    }
  }

  /* ----------------------------------------------------------
     15. Main
  ---------------------------------------------------------- */
  async function init() {
    const auth = await requireTeacher();
    if (!auth) return;   // redirect / fatal already handled

    currentUser = auth.session.user;

    resetForm();
    wireEvents();
    wireLogout();
    revealDashboard();

    await loadHomework();
  }

  init();

})();