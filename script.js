/* ============================================================
   SHEMFORD FUTURISTIC SCHOOL — HOMEPAGE SCRIPT
   ------------------------------------------------------------
   Responsibilities (frontend only, no backend):
   1. Mobile navigation toggle
   2. Header shadow on scroll
   3. Footer year
   4. Scroll reveal via IntersectionObserver
   5. Image fallback for missing assets
   ============================================================= */

(function () {
  'use strict';

  /* ----------------------------------------------------------
     1. Mobile navigation
  ---------------------------------------------------------- */
  const navToggle = document.getElementById('navToggle');
  const primaryNav = document.getElementById('primaryNav');

  if (navToggle && primaryNav) {
    const setExpanded = (isOpen) => {
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute(
        'aria-label',
        isOpen ? 'Close navigation menu' : 'Open navigation menu'
      );
      primaryNav.classList.toggle('is-open', isOpen);
    };

    navToggle.addEventListener('click', () => {
      const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
      setExpanded(!isOpen);
    });

    // Close when a link is clicked (mobile)
    primaryNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 860px)').matches) {
          setExpanded(false);
        }
      });
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' &&
          navToggle.getAttribute('aria-expanded') === 'true') {
        setExpanded(false);
        navToggle.focus();
      }
    });

    // Close when clicking outside (mobile)
    document.addEventListener('click', (e) => {
      if (!window.matchMedia('(max-width: 860px)').matches) return;
      if (navToggle.getAttribute('aria-expanded') !== 'true') return;
      if (primaryNav.contains(e.target) || navToggle.contains(e.target)) return;
      setExpanded(false);
    });

    // Reset state on resize back to desktop
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth > 860) setExpanded(false);
      }, 150);
    });
  }


  /* ----------------------------------------------------------
     2. Header shadow on scroll
  ---------------------------------------------------------- */
  const header = document.getElementById('siteHeader');

  if (header) {
    const updateHeader = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }


  /* ----------------------------------------------------------
     3. Footer year
  ---------------------------------------------------------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());


  /* ----------------------------------------------------------
     4. Scroll reveal
     Uses IntersectionObserver. Elements with [data-reveal]
     fade+slide into view once.
     Respects prefers-reduced-motion (CSS already disables
     the transition, but we also skip observing entirely).
  ---------------------------------------------------------- */
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const revealTargets = document.querySelectorAll('[data-reveal]');

  if (!prefersReducedMotion && 'IntersectionObserver' in window && revealTargets.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.08 }
    );

    revealTargets.forEach((el, index) => {
      // Stagger children inside the same grid lightly
      el.style.transitionDelay = `${Math.min(index % 4, 3) * 60}ms`;
      observer.observe(el);
    });
  } else {
    // No observer or reduced motion — reveal everything immediately
    revealTargets.forEach((el) => el.classList.add('is-revealed'));
  }


  /* ----------------------------------------------------------
     5. Image fallback
     If a placeholder image is missing, dim the container and
     keep the layout intact instead of showing a broken icon.
     This keeps the homepage looking intentional until the real
     photos are dropped into assets/images/.
  ---------------------------------------------------------- */
  document.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.visibility = 'hidden';
      const parent = img.parentElement;
      if (parent) parent.classList.add('is-image-missing');
    });
  });

})();