
/* ============================================================
   SHEMFORD FUTURISTIC SCHOOL — STUDENT DIRECTORY
   Uses existing Supabase tables:
   - admin_profiles
   - profiles
   - attendance
   - homework

   No hardcoded student records.
   ============================================================ */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    supabase: null,
    students: [],
    attendance: [],
    homework: [],
    selectedStudent: null
  };

  const el = {
    alert: $("directoryAlert"),
    total: $("totalStudents"),
    active: $("activeStudents"),
    classes: $("totalClasses"),
    search: $("studentSearch"),
    classFilter: $("classFilter"),
    statusFilter: $("statusFilter"),
    resultCount: $("resultCount"),
    loading: $("directoryLoading"),
    empty: $("directoryEmpty"),
    tableWrap: $("directoryTableWrap"),
    tableBody: $("studentTableBody"),
    refresh: $("refreshStudents"),
    dialog: $("studentDialog"),
    closeDialog: $("closeStudentDialog"),
    detailName: $("detailStudentName"),
    detailLoading: $("detailLoading"),
    detailContent: $("studentDetailContent"),
    detailError: $("detailError"),
    schoolId: $("detailSchoolId"),
    rollNo: $("detailRollNo"),
    className: $("detailClass"),
    status: $("detailStatus"),
    created: $("detailCreated"),
    present: $("detailPresent"),
    absent: $("detailAbsent"),
    other: $("detailOther"),
    attendanceNote: $("attendanceNote"),
    attendanceHistory: $("attendanceHistory"),
    studentHomework: $("studentHomework")
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function showAlert(message) {
    el.alert.textContent = message;
    el.alert.hidden = false;
  }

  function hideAlert() {
    el.alert.textContent = "";
    el.alert.hidden = true;
  }

  function showDate(value) {
    if (!value) return "—";

    const date = new Date(`${value}`.length === 10 ? `${value}T00:00:00` : value);

    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric"
        });
  }

  function displayValue(value) {
    return value === null || value === undefined || value === ""
      ? "—"
      : String(value);
  }

  function normalized(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function getClassName(student) {
    return String(student.class_section || "Unassigned").trim();
  }

  function getInitials(name) {
    const parts = String(name || "Student").trim().split(/\s+/);
    return parts.slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  }

  async function checkAdminAccess() {
    const { data: sessionData, error: sessionError } =
      await state.supabase.auth.getSession();

    if (sessionError) throw sessionError;

    const session = sessionData?.session;

    if (!session?.user) {
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
        "Could not verify admin access. Check the admin_profiles SELECT policy in Supabase. " +
        error.message
      );
    }

    if (
      !admin ||
      normalized(admin.role) !== "admin" ||
      normalized(admin.status) !== "active"
    ) {
      await state.supabase.auth.signOut();
      window.location.replace("../login.html");
      return false;
    }

    return true;
  }

  async function loadDirectory() {
    hideAlert();
    el.loading.hidden = false;
    el.tableWrap.hidden = true;
    el.empty.hidden = true;
    el.refresh.disabled = true;
    el.refresh.textContent = "Loading…";

    try {
      // Load students from the existing profiles table.
      const { data: students, error: studentsError } = await state.supabase
        .from("profiles")
        .select("id, school_id, full_name, role, created_at, class_section, status, roll_no")
        .eq("role", "student")
        .order("class_section", { ascending: true })
        .order("roll_no", { ascending: true });

      if (studentsError) {
        throw new Error(
          "Unable to read student profiles. Check the profiles SELECT policy for admins. " +
          studentsError.message
        );
      }

      state.students = students || [];
      console.log("Student query result:", {
        count: students?.length,
        error: studentsError?.message,
        data: students
      });
      state.attendance = [];
      state.homework = [];

      const ids = state.students.map(student => student.id).filter(Boolean);

      // Attendance summaries are optional if there are no student records.
      if (ids.length) {
        const { data: attendanceRows, error: attendanceError } =
          await state.supabase
            .from("attendance")
            .select("student_id, attendance_date, status, class_section, roll_no")
            .in("student_id", ids)
            .order("attendance_date", { ascending: false });

        if (attendanceError) {
          console.warn("Attendance could not be loaded:", attendanceError.message);
          showAlert(
            "Student records loaded, but attendance could not be read. " +
            "Check the attendance table's SELECT policy for admins."
          );
        } else {
          state.attendance = attendanceRows || [];
        }
      }

      // Homework is assigned at class/section level in the confirmed schema.
      const { data: homeworkRows, error: homeworkError } = await state.supabase
        .from("homework")
        .select("id, class_section, subject, title, instructions, assigned_date, due_date, attachment_name, attachment_url")
        .order("due_date", { ascending: true });

      if (homeworkError) {
        console.warn("Homework could not be loaded:", homeworkError.message);
        if (!el.alert.hidden) {
          el.alert.textContent += " Homework could not be read; check its SELECT policy.";
        } else {
          showAlert(
            "Student records loaded, but homework could not be read. " +
            "Check the homework SELECT policy for admins."
          );
        }
      } else {
        state.homework = homeworkRows || [];
      }

      populateClassFilter();
      updateStatistics();
      renderStudents();

      if (!state.students.length) {
        showAlert(
          "No student profiles were returned. If students already exist, check your profiles table and its admin SELECT policy."
        );
      }
    } catch (error) {
      console.error("Student directory error:", error);
      showAlert(error.message || "Unable to load the student directory.");
    } finally {
      el.loading.hidden = true;
      el.refresh.disabled = false;
      el.refresh.textContent = "↻ Refresh";
    }
  }

  function populateClassFilter() {
    const currentValue = el.classFilter.value;

    const classes = [...new Set(
      state.students.map(getClassName).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    el.classFilter.innerHTML =
      '<option value="">All classes</option>' +
      classes.map(name =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
      ).join("");

    if (classes.includes(currentValue)) {
      el.classFilter.value = currentValue;
    }
  }

  
  function updateStatistics() {
    el.total.textContent = state.students.length;

    const classes = new Set(
      state.students
        .map(getClassName)
        .filter(name => name !== "Unassigned")
    );

    el.classes.textContent = classes.size;
  }

  function getFilteredStudents() {
    const query = normalized(el.search.value);
    const classValue = el.classFilter.value;
    const statusValue = normalized(el.statusFilter.value);

    return state.students.filter(student => {
      const matchesSearch =
        !query ||
        normalized(student.full_name).includes(query) ||
        normalized(student.school_id).includes(query) ||
        String(student.roll_no ?? "").includes(query);

      const matchesClass =
        !classValue || getClassName(student) === classValue;

      const matchesStatus =
        !statusValue || normalized(student.status) === statusValue;

      return matchesSearch && matchesClass && matchesStatus;
    });
  }

  function renderStudents() {
    const filtered = getFilteredStudents();

    el.resultCount.textContent =
      `${filtered.length} student${filtered.length === 1 ? "" : "s"} shown`;

    el.tableBody.innerHTML = filtered.map(student => {
      const studentId = escapeHtml(student.id);
      const name = escapeHtml(displayValue(student.full_name));
      const schoolId = escapeHtml(displayValue(student.school_id));
      const className = escapeHtml(getClassName(student));
      const rollNo = escapeHtml(displayValue(student.roll_no));
      const status = normalized(student.status);
      const statusClass = status === "active"
        ? "active"
        : status === "inactive"
          ? "inactive"
          : "";

      return `
        <tr>
          <td>
            <div class="student-name-cell">
              <span class="student-avatar">${escapeHtml(getInitials(student.full_name))}</span>
              <span class="student-name-text">
                <strong>${name}</strong>
                <small>Student</small>
              </span>
            </div>
          </td>
          <td>${schoolId}</td>
          <td>${className}</td>
          <td>${rollNo}</td>
          <td><span class="status-pill ${statusClass}">${escapeHtml(displayValue(student.status))}</span></td>
          <td><button class="view-student-button" type="button" data-student-id="${studentId}">View details</button></td>
        </tr>
      `;
    }).join("");

    el.empty.hidden = filtered.length !== 0;
    el.tableWrap.hidden = filtered.length === 0;
  }

  function resetStudentDetails() {
    el.detailContent.hidden = true;
    el.detailLoading.hidden = false;
    el.detailError.hidden = true;
    el.detailError.textContent = "";
    el.attendanceHistory.innerHTML = "";
    el.studentHomework.innerHTML = "";
  }

  async function openStudentDetails(studentId) {
    const student = state.students.find(item => item.id === studentId);
    if (!student) return;

    state.selectedStudent = student;
    resetStudentDetails();

    el.detailName.textContent = student.full_name || "Student Details";

    if (!el.dialog.open) {
      el.dialog.showModal();
    }

    el.schoolId.textContent = displayValue(student.school_id);
    el.rollNo.textContent = displayValue(student.roll_no);
    el.className.textContent = getClassName(student);
    el.status.textContent = displayValue(student.status);
    el.created.textContent = showDate(student.created_at);

    try {
      // Fetch this student's latest attendance records directly.
      const { data: records, error } = await state.supabase
        .from("attendance")
        .select("attendance_date, status, class_section, roll_no")
        .eq("student_id", student.id)
        .order("attendance_date", { ascending: false })
        .limit(30);

      if (error) {
        throw new Error(
          "Could not load this student's attendance. Check attendance SELECT permissions. " +
          error.message
        );
      }

      const history = records || [];
      const countStatus = (status) => history.filter(
        record => normalized(record.status) === status
      ).length;

      el.present.textContent = countStatus("present");
      el.absent.textContent = countStatus("absent");
      el.other.textContent = history.length -
        countStatus("present") - countStatus("absent");

      el.attendanceNote.textContent =
        `Showing up to ${history.length} most recent attendance records. Counts above apply to these records only.`;

      el.attendanceHistory.innerHTML = history.length
        ? history.map(record => `
            <div class="history-row">
              <strong>${escapeHtml(showDate(record.attendance_date))}</strong>
              <span>${escapeHtml(displayValue(record.status))}</span>
            </div>
          `).join("")
        : '<p class="small-note">No attendance records were found for this student.</p>';

      // Homework is shared with the student's class/section.
      const classKey = normalized(student.class_section);
      const classHomework = state.homework.filter(
        item => normalized(item.class_section) === classKey
      );

      el.studentHomework.innerHTML = classHomework.length
        ? classHomework.map(item => {
            const attachment = item.attachment_url
              ? `<p><a href="${escapeHtml(item.attachment_url)}" target="_blank" rel="noopener noreferrer">Open attachment</a></p>`
              : "";

            return `
              <article class="homework-row">
                <strong>${escapeHtml(displayValue(item.title))}</strong>
                <span>${escapeHtml(displayValue(item.subject))}</span>
                <p>${escapeHtml(displayValue(item.instructions))}</p>
                <p>Assigned: ${escapeHtml(showDate(item.assigned_date))} · Due: ${escapeHtml(showDate(item.due_date))}</p>
                ${attachment}
              </article>
            `;
          }).join("")
        : '<p class="small-note">No class-level homework records were found for this class/section.</p>';

      el.detailLoading.hidden = true;
      el.detailContent.hidden = false;
    } catch (error) {
      console.error("Student details error:", error);
      el.detailLoading.hidden = true;
      el.detailError.textContent = error.message || "Unable to load details.";
      el.detailError.hidden = false;
    }
  }

  function bindEvents() {
    el.search.addEventListener("input", renderStudents);
    el.classFilter.addEventListener("change", renderStudents);
    el.statusFilter.addEventListener("change", renderStudents);
    el.refresh.addEventListener("click", loadDirectory);

    el.tableBody.addEventListener("click", event => {
      const button = event.target.closest("[data-student-id]");
      if (!button) return;

      openStudentDetails(button.dataset.studentId);
    });

    el.closeDialog.addEventListener("click", () => {
      el.dialog.close();
    });

    el.dialog.addEventListener("click", event => {
      if (event.target === el.dialog) {
        el.dialog.close();
      }
    });
  }

  async function init() {
    try {
      const config = window.SUPABASE_CONFIG;

      if (!config?.url || !config?.anonKey) {
        throw new Error(
          "Supabase configuration is missing. Check ../supabase-config.js."
        );
      }

      if (!window.supabase?.createClient) {
        throw new Error("Supabase JS failed to load. Refresh the page and try again.");
      }

      state.supabase = window.supabase.createClient(
        config.url,
        config.anonKey
      );

      bindEvents();

      const allowed = await checkAdminAccess();
      if (!allowed) return;

      await loadDirectory();
    } catch (error) {
      console.error("Student directory startup error:", error);
      showAlert(error.message || "Could not start the student directory.");
      el.loading.hidden = true;
    }
  }

  init();
})();
