(function () {
  // Only run if plugin marker exists
  const pluginEls = document.querySelectorAll('[data-wm-plugin="autoplay-list-section"]');
  if (!pluginEls.length) return;

  // Configuration
  const defaults = {
    playInBackend: true,
    timing: 3,
    section: "",
    direction: "forwards",
    rootMargin: "-75px 0px -75px 0px",
    showControls: true,
    playHTML: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>`,
    pauseHTML: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/></svg>`,
  };

  const globalSettings = window.wmAutoplayListSectionSettings || {};

  // Helpers
  const getDirectionIndex = value => {
    const v = String(value).toLowerCase().trim();
    return v === "0" || v === "left" || v === "back" || v === "backwards" || v === "prev" || v === "previous" ? 0 : 1;
  };

  const isBlocked = () => document.querySelector("body.sqs-edit-mode-active, .sqs-modal-lightbox-open, .wm-mega-menu--open");

  function createAutoScroller(selector, cfg) {
    const targetElement = selector === "" ? document.querySelector(".user-items-list-section") : document.querySelector(selector);
    if (!targetElement) return null;

    const arrows = targetElement.querySelectorAll('button[class*="__arrow-button"]');
    const directionIndex = getDirectionIndex(cfg.direction);
    if (!arrows[directionIndex]) return null;

    // State (simplified to 4 variables)
    let state = "playing";
    let timer = null;
    let cycleStart = Date.now();
    let isVisible = true;
    let progressRaf = null;

    // Core functions
    const advance = () => {
      if (isBlocked() || !isVisible) return;
      arrows[directionIndex].click();
      cycleStart = Date.now();
    };

    const setProgressDegrees = deg => {
      if (!controlsArr.length) return;
      controlsArr.forEach(c => c.style.setProperty("--progress", `${deg}deg`));
    };

    const updateProgress = () => {
      if (!controlsArr.length) return;
      const elapsed = Date.now() - cycleStart;
      const progress = Math.min(elapsed / (cfg.timing * 1000), 1);
      const degree = progress * 360;
      setProgressDegrees(degree);
    };

    const startProgressAnimation = () => {
      const animate = () => {
        updateProgress();
        if (state === "playing") {
          progressRaf = requestAnimationFrame(animate);
        }
      };
      progressRaf = requestAnimationFrame(animate);
    };

    const stopProgressAnimation = () => {
      if (progressRaf) {
        cancelAnimationFrame(progressRaf);
        progressRaf = null;
      }
    };

    const startTimer = () => {
      const elapsed = Date.now() - cycleStart;
      const remaining = Math.max(0, cfg.timing * 1000 - elapsed);

      startProgressAnimation();

      timer = setTimeout(() => {
        advance();
        if (state === "playing") startTimer();
      }, remaining);
    };

    const play = () => {
      if (state === "playing") return;
      state = "playing";
      cycleStart = Date.now(); // Reset to start fresh cycle
      startTimer();
      updateUI();
    };

    const pause = () => {
      if (state === "paused") return;
      state = "paused";
      clearTimeout(timer);
      timer = null;
      stopProgressAnimation();
      updateUI();
    };

    // UI (support multiple control instances)
    const controlsArr = [];
    const buttonsArr = [];

    const updateUI = () => {
      const isPaused = state === "paused";
      buttonsArr.forEach(btn => {
        btn.innerHTML = isPaused ? cfg.playHTML : cfg.pauseHTML;
        btn.setAttribute("aria-label", isPaused ? "Play" : "Pause");
        btn.classList.toggle("is-paused", isPaused);
      });
      controlsArr.forEach(c => c.classList.toggle("is-paused", isPaused));
    };

    // Create controls (desktop arrows, mobile arrows, or fallback)
    if (cfg.showControls) {
      const targets = [];
      const desktopBottom = targetElement.querySelector(".desktop-arrows .arrows-bottom");
      const desktopCenter = targetElement.querySelector("[data-navigation-placement='center']");
      const mobileArrows = targetElement.querySelector(".mobile-arrows");
      if (desktopBottom) targets.push(desktopBottom);
      if (desktopCenter) targets.push(desktopCenter);
      if (mobileArrows) targets.push(mobileArrows);
      if (!targets.length) {
        const fallback = targetElement.querySelector(".user-items-list-item-container") || targetElement;
        targets.push(fallback);
      }

      targets.forEach(appendTarget => {
        const controls = document.createElement("div");
        controls.className = "wm-autoplay-controls wm-autoplay-controls--bottom-right";
        controls.style.setProperty("--progress", "0deg");

        const background = document.createElement("div");
        background.className = "wm-autoplay-controls--bg";
        controls.appendChild(background);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wm-autoplay-toggle";

        btn.addEventListener("click", e => {
          e.preventDefault();
          state === "paused" ? play() : pause();
        });

        ["mousedown", "mouseup", "touchstart", "touchend"].forEach(eventName => {
          btn.addEventListener(eventName, e => e.stopPropagation());
        });

        if (appendTarget === desktopCenter) {
          const controlsContainer = document.createElement("div");
          controlsContainer.className = "desktop-controls-container";
          controlsContainer.appendChild(controls);
          appendTarget.appendChild(controlsContainer);
        } else {
          appendTarget.appendChild(controls);
        }
        controls.appendChild(btn);
        controlsArr.push(controls);
        buttonsArr.push(btn);
      });

      updateUI();
    }

    // Reset timer on manual navigation (works when playing or paused)
    const resetTimer = () => {
      cycleStart = Date.now();
      clearTimeout(timer);
      stopProgressAnimation();
      // Always reset visual progress to 0
      setProgressDegrees(0);
      if (state === "playing") {
        startTimer();
      }
      updateUI();
    };

    // Arrow button clicks
    targetElement.querySelectorAll("button[aria-label*='Next'], button[aria-label*='Previous'], button.mobile-arrow-button").forEach(btn => {
      btn.addEventListener("click", resetTimer);
    });

    // Drag interactions on the carousel list (click & drag only)
    const carouselList = targetElement.querySelector("ul");
    if (carouselList) {
      let dragStart = null;
      let hasMoved = false;

      ["mousedown", "touchstart"].forEach(eventName => {
        carouselList.addEventListener(eventName, e => {
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          dragStart = {x: clientX, y: clientY};
          hasMoved = false;
        });
      });

      ["mousemove", "touchmove"].forEach(eventName => {
        carouselList.addEventListener(eventName, e => {
          if (!dragStart) return;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          const deltaX = Math.abs(clientX - dragStart.x);
          const deltaY = Math.abs(clientY - dragStart.y);
          // Consider it a drag if moved more than 5px in any direction
          if (deltaX > 5 || deltaY > 5) {
            hasMoved = true;
          }
        });
      });

      ["mouseup", "touchend"].forEach(eventName => {
        carouselList.addEventListener(eventName, () => {
          if (dragStart && hasMoved) {
            resetTimer();
          }
          dragStart = null;
          hasMoved = false;
        });
      });

      // Do not reset on simple click; only on drag per spec
    }

    // Remove general quick mousedown-based pause; only toggle button controls state

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pause();
    });

    // Visibility observer
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(
        entries => {
          isVisible = entries[0].isIntersecting;
        },
        {rootMargin: cfg.rootMargin}
      );
      observer.observe(targetElement);
    }

    // Start playing
    startTimer();

    return {
      targetElement,
      play,
      pause,
      get isPaused() {
        return state === "paused";
      },
    };
  }

  // Initialize for each plugin element
  window.wmAutoplayListSection = window.wmAutoplayListSection || {};
  const instances = window.wmAutoplayListSection.instances || [];
  const isTopWindow = window.top === window.self;

  pluginEls.forEach(el => {
    const ds = el.dataset || {};
    const localSettings = {};
    if (ds.timing != null && ds.timing !== "") localSettings.timing = Number(ds.timing);
    if (ds.section != null) localSettings.section = ds.section;
    if (ds.direction != null && ds.direction !== "") localSettings.direction = ds.direction;
    if (ds.playInBackend != null && ds.playInBackend !== "") localSettings.playInBackend = String(ds.playInBackend).toLowerCase() === "true";
    if (ds.rootMargin) localSettings.rootMargin = ds.rootMargin;
    if (ds.showControls != null && ds.showControls !== "") localSettings.showControls = String(ds.showControls).toLowerCase() === "true";

    const config = Object.assign({}, defaults, globalSettings, localSettings);

    const selectors = config.section?.includes(",")
      ? config.section
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
      : [config.section];

    if (isTopWindow || (!isTopWindow && config.playInBackend)) {
      selectors.forEach(sel => {
        const instance = createAutoScroller(sel, config);
        if (instance) instances.push(instance);
      });
    }
  });

  window.wmAutoplayListSection.instances = instances;
})();
