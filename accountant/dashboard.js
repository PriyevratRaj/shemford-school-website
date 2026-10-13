
/* ============================================================
   SHEMFORD FUTURISTIC SCHOOL
   ACCOUNTANT DASHBOARD
   ------------------------------------------------------------
   1. Initialize Supabase
   2. Verify logged-in user
   3. Verify accountant profile and status
   4. Display accountant information
   5. Handle logout
   ============================================================ */

(function () {
  "use strict";

  const guard = document.getElementById("accGuard");
  const shell = document.getElementById("accShell");
  const alertBox = document.getElementById("accAlert");

  function showError(message) {
    if (guard) {
      guard.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Dashboard Error";

      const paragraph = document.createElement("p");
      paragraph.textContent = message;

      const link = document.createElement("a");
      link.href = "../login.html";
      link.textContent = "Return to Login";

      guard.append(heading, paragraph, link);
      guard.hidden = false;
    }
  }

  function showAlert(message) {
    if (!alertBox) return;

    alertBox.textContent = message;
    alertBox.hidden = false;
  }
    // DEMO ONLY — visual preview, no Supabase writes.
  function renderDemoFinance() {
    const demoValues = [
      {
        id: "accFeesCollected",
        target: 485000,
        format: (n) => "₹" + new Intl.NumberFormat("en-IN").format(n)
      },
      {
        id: "accPendingDues",
        target: 124500,
        format: (n) => "₹" + new Intl.NumberFormat("en-IN").format(n)
      },
      {
        id: "accPaymentCount",
        target: 128,
        format: (n) => new Intl.NumberFormat("en-IN").format(n)
      },
      {
        id: "accSalaryTotal",
        target: 210000,
        format: (n) => "₹" + new Intl.NumberFormat("en-IN").format(n)
      }
    ];

    // Clearly label every sample value.
    [
      "accFeesNote",
      "accDuesNote",
      "accPaymentsNote",
      "accSalaryNote"
    ].forEach((id) => {
      const note = document.getElementById(id);
      if (note) note.textContent = "DEMO PREVIEW · Not real records";
    });

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    demoValues.forEach(({ id, target, format }) => {
      const element = document.getElementById(id);
      if (!element) return;

      if (reducedMotion) {
        element.textContent = format(target);
        return;
      }

      const duration = 1200;
      const startTime = performance.now();

      function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(target * eased);

        element.textContent = format(current);

        if (progress < 1) {
          requestAnimationFrame(tick);
        }
      }

      element.textContent = format(0);
      requestAnimationFrame(tick);
    });
  }
  async function init() {
    // 1. Check Supabase configuration
    if (
      !window.supabase ||
      !window.SUPABASE_CONFIG ||
      !window.SUPABASE_CONFIG.url ||
      !window.SUPABASE_CONFIG.anonKey
    ) {
      showError(
        "Supabase configuration is missing. Please check supabase-config.js."
      );
      return;
    }

    // 2. Connect to Supabase
    const supabase = window.supabase.createClient(
      window.SUPABASE_CONFIG.url,
      window.SUPABASE_CONFIG.anonKey
    );

    // 3. Check the current login session
    console.log("STEP 1: Checking login session...");
    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      showError("Could not verify your login. Please try again.");
      return;
    }

    const session = sessionData.session;

    if (!session) {
      window.location.replace("../login.html");
      return;
    }

    // 4. Find this user's accountant profile
    console.log("STEP 2: Checking accountant profile...");
    const {
      data: profile,
      error: profileError
    } = await supabase
      .from("accountant_profiles")
      .select("id, full_name, email, role, status")
      .eq("id", session.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Accountant profile error:", profileError);

      showError(
        "Your accountant profile could not be verified. Check the accountant_profiles table and its SELECT policy."
      );
      return;
    }

    // 5. Only active accountant accounts are allowed
    if (
      !profile ||
      profile.role !== "accountant" ||
      profile.status !== "active"
    ) {
      await supabase.auth.signOut();
      window.location.replace("../login.html");
      return;
    }

    // 6. Display accountant information
    const name =
      profile.full_name ||
      profile.email ||
      session.user.email ||
      "Accountant";
    
    const nameElement = document.getElementById("accUserName");
    const avatarElement = document.getElementById("accUserInitial");
    const greetingElement = document.getElementById("accGreeting");
    const accountantNameElement = document.getElementById("accAccountantName");

    if (nameElement) nameElement.textContent = name;
    if (avatarElement) avatarElement.textContent = name.charAt(0).toUpperCase();
    if (greetingElement) greetingElement.textContent = "Welcome";
    if (accountantNameElement) accountantNameElement.textContent = name;

    
    


    // 7. Show the dashboard after successful verification
    console.log("STEP 3: Showing dashboard...");
        if (shell) {
      shell.hidden = false;
      renderDemoFinance();
    }

    if (guard) {
      guard.hidden = true;
    }

    // 8. Logout functionality
    async function logout() {
      const buttons = [
        document.getElementById("accLogout"),
        document.getElementById("acMobileLogout")
      ];

      buttons.forEach((button) => {
        if (button) button.disabled = true;
      });

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Logout error:", error);

        buttons.forEach((button) => {
          if (button) button.disabled = false;
        });

        showAlert("Logout failed. Please try again.");
        return;
      }

      window.location.replace("../login.html");
    }

    const logoutButton = document.getElementById("accLogout");
    const mobileLogoutButton =
      document.getElementById("accMobileLogout");

    if (logoutButton) {
      logoutButton.addEventListener("click", logout);
    }

    if (mobileLogoutButton) {
      mobileLogoutButton.addEventListener("click", logout);
    }

    console.log("Accountant dashboard initialized successfully.");
  }

  init().catch((error) => {
    console.error("Accountant dashboard initialization error:", error);

    showError(
      "Something went wrong while loading the dashboard. Check the browser console for details."
    );
  });
})();
