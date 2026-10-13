/* ============================================================
   SHEMFORD FUTURISTIC SCHOOL — TEACHER LIST
   ------------------------------------------------------------
   Uses existing Supabase tables:
     - admin_profiles (to verify the logged-in admin)
     - teacher_profiles (source of teacher records)

   Read-only. No hardcoded data. No service-role key.
   All database text is rendered with textContent, never innerHTML.
   ============================================================ */

(() => {
  "use strict";

  /* ----------------------------------------------------------
     1. DOM references
     ----------------------------------------------------------
     IDs must exist in admin/teachers.html. If any are missing,
     verifyRequiredElements() reports them rather than throwing.
  ---------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);

  const el = {
    alert:         $("directoryAlert"),
    total:         $("totalTeachers"),
    active:        $("activeTeachers"),
    resultCount:   $("resultCount"),
    refresh:       $("refreshTeachers"),
    search:        $("teacherSearch"),
    statusFilter:  $("statusFilter"),
    loading:       $("directoryLoading"),
    empty:         $("directoryEmpty"),
    tableWrap:     $("directoryTableWrap"),
    tableBody:     $("teacherTableBody"),
    dialog:        $("teacherDialog"),
    closeDialog:   $("closeTeacherDialog"),
    detailName:    $("detailTeacherName"),
    detailSchool:  $("detailSchoolId"),
    detailEmail:   $("detailEmail"),
    detailPhone:   $("detailPhone"),
    detailSubject: $("detailSubject"),
    detailJoining: $("detailJoining"),
    detailStatus:  $("detailStatus")
  };

  /* ----------------------------------------------------------
     2. Module state
     ----------------------------------------------------------
     `loadError` is a separate flag from "database is empty".
     The table's empty state is only shown when the fetch
     succeeded AND there are no rows. A failed fetch sets
     loadError and shows the alert instead.
  ---------------------------------------------------------- */
  const state = {
    supabase: null,
    teachers: [],
    isFetching: false,
    listenersBound: false,
    loadError: null      // null = no error; string = error message
  };

  /* ----------------------------------------------------------
     3. Helpers
  ---------------------------------------------------------- */
  function normalized(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function displayValue(value) {
    return value === null || value === undefined || value === ""
      ? "—"
      : String(value);
  }

  function showDate(value) {
    if (!value) return "—";
    const iso = String(value).length === 10 ? `${value}T00:00:00` : value;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function getInitials(name) {
    const parts = String(name || "Teacher").trim().split(/\s+/);
    return parts.slice(0, 2).map((p) => (p[0] || "").toUpperCase()).join("");
  }

  function showAlert(message, kind) {
    if (!el.alert) return;
    el.alert.textContent = message;
    // Reset any prior state. The CSS handles styling via class names
    // already present in the HTML for the alert element.
    el.alert.classList.remove("is-error", "is-info");
    if (kind) el.alert.classList.add(kind);
    el.alert.hidden = false;
  }

  function hideAlert() {
    if (!el.alert) return;
    el.alert.textContent = "";
    el.alert.classList.remove("is-error", "is-info");
    el.alert.hidden = true;
  }

  function setLoading(on) {
    if (el.loading) el.loading.hidden = !on;
    if (on) {
      // While loading, hide both the table and the empty state.
      if (el.tableWrap) el.tableWrap.hidden = true;
      if (el.empty) el.empty.hidden = true;
    }
  }

  function setRefreshBusy(on) {
    if (!el.refresh) return;
    el.refresh.disabled = on;
    el.refresh.textContent = on ? "Loading…" : "↻ Refresh";
  }

  /* ----------------------------------------------------------
     4. Verify the HTML contains all required elements
  ---------------------------------------------------------- */
  function verifyRequiredElements() {
    const missing = Object.entries(el)
      .filter(([, node]) => !node)
      .map(([key]) => key);

    if (missing.length) {
      console.error(
        "[teachers.js] Missing DOM elements: " + missing.join(", ") +
        ". Please check admin/teachers.html."
      );
      return false;
    }
    return true;
  }

  /* ----------------------------------------------------------
     5. Admin authentication guard
  ---------------------------------------------------------- */
  async function checkAdminAccess() {
    const { data: sessionData, error: sessionError } =
      await state.supabase.auth.getSession();

    if (sessionError) {
      throw new Error(
        "Could not read your session. Please refresh and sign in again."
      );
    }

    const session = sessionData && sessionData.session;
    if (!session || !session.user) {
      window.location.replace("../login.html");
      return false;
    }

    const { data: admin, error } = await state.supabase
      .from("admin_profiles")
      .select("id, role, status")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      throw new Error(
        "Could not verify admin access. Check the admin_profiles " +
        "SELECT policy in Supabase."
      );
    }

    const isAdmin =
      admin &&
      normalized(admin.role) === "admin" &&
      normalized(admin.status) === "active";

    if (!isAdmin) {
      await state.supabase.auth.signOut();
      window.location.replace("../login.html");
      return false;
    }

    return true;
  }

  /* ----------------------------------------------------------
     6. Load teachers from public.teacher_profiles
     ----------------------------------------------------------
     On failure, we set state.loadError and keep the table hidden.
     On success with zero rows, state.loadError is cleared and
     the empty state is shown by renderTeachers().
  ---------------------------------------------------------- */
  async function loadTeachers() {
    if (state.isFetching) return;
    state.isFetching = true;

    hideAlert();
    setLoading(true);
    setRefreshBusy(true);

    // Clear the previous error so a successful retry wipes it out.
    state.loadError = null;

    try {
      const { data, error } = await state.supabase
        .from("teacher_profiles")
        .select(
          "id, school_id, full_name, role, created_at, status, " +
          "subject, phone, joining_date, email"
        )
        .order("full_name", { ascending: true });

      if (error) {
        throw new Error(
          "Could not load teacher records. If this looks like a " +
          "permissions problem, ask the school admin to confirm the " +
          "teacher_profiles SELECT policy for active admins."
        );
      }

      state.teachers = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("[teachers.js] load failed:", err);
      // Leave the previous dataset in place? No — clear it, so the
      // page never shows stale data mixed with an error. The table
      // stays hidden because loadError is set.
      state.teachers = [];
      state.loadError = err.message || "Could not load the teacher list.";
    } finally {
      state.isFetching = false;
      setLoading(false);
      setRefreshBusy(false);
    }

    // If the fetch failed, show the error alert with a retry option.
    // Otherwise, update the UI with the fetched data.
    if (state.loadError) {
      showAlert(state.loadError + " You can click Refresh to try again.", "is-error");
      updateStatistics();
      renderTeachers();   // will show the error state, not "No teachers yet"
      return;
    }

    updateStatistics();
    renderTeachers();
  }

  /* ----------------------------------------------------------
     7. Statistics
  ---------------------------------------------------------- */
  function updateStatistics() {
    const total = state.teachers.length;
    const activeCount = state.teachers.filter(
      (t) => normalized(t.status) === "active"
    ).length;

    if (el.total)  el.total.textContent  = state.loadError ? "—" : String(total);
    if (el.active) el.active.textContent = state.loadError ? "—" : String(activeCount);
  }

  /* ----------------------------------------------------------
     8. Filtering
     ----------------------------------------------------------
     The status select may have its All option as value=""
     OR value="all" (or missing entirely). We treat both as
     "no filter". Active/Inactive are compared lowercased.
  ---------------------------------------------------------- */
  function getFilteredTeachers() {
    const q = normalized(el.search ? el.search.value : "");

    const statusRaw = el.statusFilter ? el.statusFilter.value : "";
    const statusValue = normalized(statusRaw);
    const filterByStatus =
      statusValue !== "" && statusValue !== "all";

    return state.teachers.filter((t) => {
      if (filterByStatus && normalized(t.status) !== statusValue) {
        return false;
      }
      if (!q) return true;

      return (
        normalized(t.full_name).includes(q) ||
        normalized(t.school_id).includes(q) ||
        normalized(t.email).includes(q) ||
        normalized(t.subject).includes(q) ||
        normalized(t.phone).includes(q)
      );
    });
  }

  /* ----------------------------------------------------------
     9. Rendering the table
     ----------------------------------------------------------
     The empty state has three distinct meanings:
       a) Load failed        → keep table hidden, show alert only
       b) Database is empty  → show empty state "No teachers yet"
       c) Filters exclude all → show empty state "No teachers match"
  ---------------------------------------------------------- */
  function renderTeachers() {
    if (!el.tableBody) return;

    const emptyTitle = el.empty ? el.empty.querySelector("h3") : null;
    const emptyText  = el.empty ? el.empty.querySelector("p")  : null;

    // ---- Case (a): the load failed ----
    if (state.loadError) {
      if (el.tableWrap) el.tableWrap.hidden = true;
      if (el.empty) el.empty.hidden = true;  // do not misuse the empty state
      if (el.resultCount) el.resultCount.textContent = "Could not load teachers";
      return;
    }

    const filtered = getFilteredTeachers();

    if (el.resultCount) {
      el.resultCount.textContent =
        filtered.length === 1
          ? "1 teacher shown"
          : `${filtered.length} teachers shown`;
    }

    el.tableBody.textContent = "";

    // ---- Case (b): the database is genuinely empty ----
    if (!state.teachers.length) {
      if (el.tableWrap) el.tableWrap.hidden = true;
      if (el.empty) {
        el.empty.hidden = false;
        if (emptyTitle) emptyTitle.textContent = "No teachers yet";
        if (emptyText)  emptyText.textContent  =
          "Teacher records will appear here once they are added.";
      }
      return;
    }

    // ---- Case (c): filters exclude every row ----
    if (!filtered.length) {
      if (el.tableWrap) el.tableWrap.hidden = true;
      if (el.empty) {
        el.empty.hidden = false;
        if (emptyTitle) emptyTitle.textContent = "No teachers match";
        if (emptyText)  emptyText.textContent  =
          "Try changing your search or filters.";
      }
      return;
    }

    // ---- Build the rows ----
    const frag = document.createDocumentFragment();

    filtered.forEach((t) => {
      const tr = document.createElement("tr");

      // Cell 1 — Teacher (avatar + name + "Teacher" role hint)
      const tdName = document.createElement("td");
      const nameCell = document.createElement("div");
      nameCell.className = "student-name-cell";

      const avatar = document.createElement("span");
      avatar.className = "student-avatar";
      avatar.textContent = getInitials(t.full_name);
      avatar.setAttribute("aria-hidden", "true");

      const nameText = document.createElement("span");
      nameText.className = "student-name-text";

      const strong = document.createElement("strong");
      strong.textContent = displayValue(t.full_name);

      const small = document.createElement("small");
      small.textContent = "Teacher";

      nameText.appendChild(strong);
      nameText.appendChild(small);

      nameCell.appendChild(avatar);
      nameCell.appendChild(nameText);
      tdName.appendChild(nameCell);

      // Cell 2 — School ID
      const tdSchool = document.createElement("td");
      tdSchool.textContent = displayValue(t.school_id);

      // Cell 3 — Subject
      const tdSubject = document.createElement("td");
      tdSubject.textContent = displayValue(t.subject);

      // Cell 4 — Email
      const tdEmail = document.createElement("td");
      tdEmail.textContent = displayValue(t.email);

      // Cell 5 — Status pill
      const tdStatus = document.createElement("td");
      const pill = document.createElement("span");
      const statusKey = normalized(t.status);
      pill.className = "status-pill " + (
        statusKey === "active"   ? "active"   :
        statusKey === "inactive" ? "inactive" :
        ""
      );
      pill.textContent = displayValue(t.status);
      tdStatus.appendChild(pill);

      // Cell 6 — Details button
      const tdAction = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "view-student-button";
      btn.textContent = "View details";
      btn.setAttribute("data-teacher-id", String(t.id));
      tdAction.appendChild(btn);

      // Assemble row.
      tr.appendChild(tdName);
      tr.appendChild(tdSchool);
      tr.appendChild(tdSubject);
      tr.appendChild(tdEmail);
      tr.appendChild(tdStatus);
      tr.appendChild(tdAction);

      frag.appendChild(tr);
    });

    el.tableBody.appendChild(frag);

    if (el.tableWrap) el.tableWrap.hidden = false;
    if (el.empty) el.empty.hidden = true;
  }

  /* ----------------------------------------------------------
     10. Teacher details dialog
  ---------------------------------------------------------- */
  function openTeacherDetails(teacherId) {
    const teacher = state.teachers.find(
      (t) => String(t.id) === String(teacherId)
    );
    if (!teacher || !el.dialog) return;

    if (el.detailName)    el.detailName.textContent    = displayValue(teacher.full_name);
    if (el.detailSchool)  el.detailSchool.textContent  = displayValue(teacher.school_id);
    if (el.detailEmail)   el.detailEmail.textContent   = displayValue(teacher.email);
    if (el.detailPhone)   el.detailPhone.textContent   = displayValue(teacher.phone);
    if (el.detailSubject) el.detailSubject.textContent = displayValue(teacher.subject);
    if (el.detailJoining) el.detailJoining.textContent = showDate(teacher.joining_date);
    if (el.detailStatus)  el.detailStatus.textContent  = displayValue(teacher.status);

    if (typeof el.dialog.showModal === "function") {
      if (!el.dialog.open) el.dialog.showModal();
    } else {
      el.dialog.setAttribute("open", "");
    }
  }

  function closeTeacherDetails() {
    if (!el.dialog) return;
    if (typeof el.dialog.close === "function" && el.dialog.open) {
      el.dialog.close();
    } else {
      el.dialog.removeAttribute("open");
    }
  }

  /* ----------------------------------------------------------
     11. Event listeners — bound exactly once
  ---------------------------------------------------------- */
  function bindEvents() {
    if (state.listenersBound) return;
    state.listenersBound = true;

    if (el.search) {
      el.search.addEventListener("input", renderTeachers);
    }

    if (el.statusFilter) {
      el.statusFilter.addEventListener("change", renderTeachers);
    }

    if (el.refresh) {
      el.refresh.addEventListener("click", () => {
        if (state.isFetching) return;
        loadTeachers();
      });
    }

    if (el.tableBody) {
      el.tableBody.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-teacher-id]");
        if (!btn) return;
        openTeacherDetails(btn.getAttribute("data-teacher-id"));
      });
    }

    if (el.closeDialog) {
      el.closeDialog.addEventListener("click", closeTeacherDetails);
    }

    if (el.dialog) {
      el.dialog.addEventListener("click", (event) => {
        if (event.target === el.dialog) closeTeacherDetails();
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && el.dialog && el.dialog.open) {
        closeTeacherDetails();
      }
    });
  }

  /* ----------------------------------------------------------
     12. Entry point
  ---------------------------------------------------------- */
  async function init() {
    try {
      if (!verifyRequiredElements()) {
        const fallback = document.getElementById("directoryAlert");
        if (fallback) {
          fallback.hidden = false;
          fallback.textContent =
            "This page is missing required elements. Please check " +
            "admin/teachers.html.";
        }
        return;
      }

      const config = window.SUPABASE_CONFIG;
      if (!config || !config.url || !config.anonKey) {
        throw new Error(
          "Supabase configuration is missing. Check ../supabase-config.js."
        );
      }
      if (!window.supabase || !window.supabase.createClient) {
        throw new Error(
          "Supabase JS failed to load. Refresh the page and try again."
        );
      }

      state.supabase = window.supabase.createClient(config.url, config.anonKey);

      bindEvents();

      const allowed = await checkAdminAccess();
      if (!allowed) return;

      await loadTeachers();
    } catch (err) {
      console.error("[teachers.js] startup error:", err);
      if (el.loading) el.loading.hidden = true;
      if (el.tableWrap) el.tableWrap.hidden = true;
      showAlert(err.message || "Could not start the teacher list.", "is-error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();