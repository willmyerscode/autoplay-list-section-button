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

  /**
   * Creates an autoplay instance for a single List Section.
   * This function encapsulates all logic and state for one auto-scrolling section.
   *
   * @param {string} selector - The CSS selector to find the target list section.
   * @param {object} cfg - The configuration object for this specific instance.
   * @returns {object|null} An interface to control the instance, or null if initialization fails.
   */
  function createAutoScroller(selector, cfg) {
    const targetElement = selector === "" ? document.querySelector(".user-items-list-section") : document.querySelector(selector);
    if (!targetElement) return null;

    const arrows = targetElement.querySelectorAll('button[class*="__arrow-button"]');
    const directionIndex = getDirectionIndex(cfg.direction);
    if (!arrows[directionIndex]) return null;

    // --------------------------------------------------------------------------------
    // STATE MANAGEMENT
    //
    // This component uses a dual-state system to manage autoplay behavior intelligently.
    //
    // 1. External State (`externalState`):
    //    - Represents the user's explicit intent (e.g., clicking the play/pause button).
    //    - It's the "source of truth" for what the user *wants* to happen.
    //    - The UI (button icon) is always synced to this state.
    //    - Values: 'playing' | 'paused'.
    //
    // 2. Internal State (`internalState`):
    //    - Represents what the autoplay *engine* is actually doing (i.e., is the timer running?).
    //    - It is determined by the external state AND environmental factors like
    //      element visibility or site-wide blockers (e.g., Squarespace edit mode).
    //    - This allows the autoplay to pause itself when off-screen, without changing
    //      the user's intent to "playing". When it's visible again, it can resume automatically.
    //    - Values: 'running' | 'stopped'.
    // --------------------------------------------------------------------------------

    let externalState = "playing";
    let internalState = "stopped";

    // --- Timing State ---
    // These variables manage the timer to allow for seamless pause and resume.
    let timerId = null; // Stores the setTimeout ID.
    let cycleStartTime = 0; // Timestamp of when the current cycle began.
    let timeElapsedOnPause = 0; // How much time had passed in the cycle before it was paused.

    // --- Environmental State ---
    let isVisible = true; // Tracks element visibility via IntersectionObserver.
    let progressRafId = null; // requestAnimationFrame ID for the progress ring animation.

    // A flag to distinguish between programmatic clicks and user clicks.
    let isAdvancingProgrammatically = false;

    // ================================================================================
    // CORE ENGINE
    // ================================================================================

    /**
     * Advances the carousel to the next item and resets the cycle timer.
     */
    const advance = () => {
      // Extra safeguard: should not advance if the engine isn't supposed to be running.
      if (internalState !== "running") return;
      isAdvancingProgrammatically = true;
      arrows[directionIndex].click();
      isAdvancingProgrammatically = false;
    };

    /**
     * Starts the autoplay timer engine.
     * It can either start a fresh cycle or resume from where it left off.
     */
    const startEngine = () => {
      if (internalState === "running") return;
      internalState = "running";

      // If resuming, adjust the start time to account for the time already elapsed.
      // Otherwise, start a new cycle from scratch.
      cycleStartTime = Date.now() - timeElapsedOnPause;
      const remainingTime = cfg.timing * 1000 - timeElapsedOnPause;
      timeElapsedOnPause = 0; // Reset for next pause

      startProgressAnimation();

      timerId = setTimeout(() => {
        advance();
        // After advancing, if the engine is still supposed to be running,
        // we manually restart the next cycle. This fixes the main bug where
        // the loop would not continue after the first cycle.
        if (internalState === "running") {
          internalState = "stopped"; // Temporarily set to stopped to allow startEngine to run
          timeElapsedOnPause = 0; // Ensure it's a fresh cycle
          startEngine(); // Start the next cycle
        }
      }, remainingTime);
    };

    /**
     * Stops the autoplay timer engine and saves the elapsed time.
     */
    const stopEngine = () => {
      if (internalState === "stopped") return;
      internalState = "stopped";

      clearTimeout(timerId);
      timerId = null;
      stopProgressAnimation();

      // Record how far into the cycle we were, to allow for a smooth resume.
      timeElapsedOnPause = Date.now() - cycleStartTime;
    };

    /**
     * The central controller. Decides if the engine should be running based on all conditions.
     * This function is called whenever any factor that affects autoplay changes.
     */
    const updateEngineState = () => {
      const shouldRun = externalState === "playing" && isVisible && !isBlocked();
      if (shouldRun) {
        startEngine();
      } else {
        stopEngine();
      }
    };

    // ================================================================================
    // PROGRESS & UI
    // ================================================================================

    const setProgressDegrees = deg => {
      if (!controlsArr.length) return;
      controlsArr.forEach(c => c.style.setProperty("--progress", `${deg}deg`));
    };

    const updateProgress = () => {
      if (!controlsArr.length || internalState !== "running") return;
      const elapsed = Date.now() - cycleStartTime;
      const progress = Math.min(elapsed / (cfg.timing * 1000), 1);
      const degree = progress * 360;
      setProgressDegrees(degree);
    };

    const startProgressAnimation = () => {
      stopProgressAnimation(); // Ensure no multiple animations are running
      const animate = () => {
        updateProgress();
        if (internalState === "running") {
          progressRafId = requestAnimationFrame(animate);
        }
      };
      progressRafId = requestAnimationFrame(animate);
    };

    const stopProgressAnimation = () => {
      if (progressRafId) {
        cancelAnimationFrame(progressRafId);
        progressRafId = null;
      }
    };

    // ================================================================================
    // PUBLIC CONTROLS & UI BINDING
    // ================================================================================

    /**
     * Sets the user's intent to "playing".
     * This is triggered by the play button.
     */
    const play = () => {
      if (externalState === "playing") return;
      externalState = "playing";
      updateUI();
      updateEngineState();
    };

    /**
     * Sets the user's intent to "paused".
     * This is triggered by the pause button.
     */
    const pause = () => {
      if (externalState === "paused") return;
      externalState = "paused";
      updateUI();
      updateEngineState();
    };

    // --- UI Elements ---
    const controlsArr = [];
    const buttonsArr = [];

    /**
     * Updates the UI elements (e.g., button icon) based on the *external state*.
     */
    const updateUI = () => {
      const isPaused = externalState === "paused";
      buttonsArr.forEach(btn => {
        btn.innerHTML = isPaused ? cfg.playHTML : cfg.pauseHTML;
        btn.setAttribute("aria-label", isPaused ? "Play" : "Pause");
        btn.classList.toggle("is-paused", isPaused);
      });
      controlsArr.forEach(c => c.classList.toggle("is-paused", isPaused));
    };

    // --- Control Creation ---
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
          // The button toggles the external (intended) state.
          externalState === "paused" ? play() : pause();
        });

        // Prevent carousel drag from being triggered when clicking the button.
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

    // ================================================================================
    // EVENT LISTENERS & INITIALIZATION
    // ================================================================================

    /**
     * Resets the timer when the user manually navigates the carousel.
     */
    const resetTimer = () => {
      // Prevent programmatic advances from triggering a reset.
      // The timer is reset manually in the startEngine timeout.
      if (isAdvancingProgrammatically) return;

      // Stop the current engine cycle.
      stopEngine();
      // Reset the elapsed time and progress ring.
      timeElapsedOnPause = 0;
      setProgressDegrees(0);
      // Immediately re-evaluate the engine state. If the external state is
      // 'playing', this will start a fresh cycle.
      updateEngineState();
    };

    // --- Manual Navigation Listeners ---
    targetElement.querySelectorAll("button.user-items-list-carousel__arrow-button, button.mobile-arrow-button").forEach(btn => {
      btn.addEventListener("click", resetTimer);
    });

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
    }

    // --- Environmental Listeners ---

    // Pause/resume when the browser tab visibility changes.
    document.addEventListener("visibilitychange", () => {
      // Don't change the user's intent, just re-evaluate the engine state.
      updateEngineState();
    });

    // Pause/resume when the element scrolls into or out of view.
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(
        entries => {
          isVisible = entries[0].isIntersecting;
          // Re-evaluate the engine state based on the new visibility.
          updateEngineState();
        },
        {rootMargin: cfg.rootMargin}
      );
      observer.observe(targetElement);
    }

    // --- Initial Kick-off ---
    updateUI();
    updateEngineState();

    return {
      targetElement,
      play,
      pause,
      // Expose the external state for debugging or external control.
      get isPaused() {
        return externalState === "paused";
      },
      // Expose internal state for debugging.
      get internalState() {
        return internalState;
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
