document.addEventListener("DOMContentLoaded", () => {
  // Cache frequently used nodes once the page is ready.
  const root = document.documentElement;
  const navWrap = document.querySelector(".nav-wrap");
  const menuToggle = document.querySelector(".menu-toggle");
  const themeToggle = document.querySelector(".theme-toggle");
  const recruiterToggle = document.querySelector(".recruiter-toggle");
  const commandToggle = document.querySelector(".command-toggle");
  const commandPalette = document.getElementById("command-palette");
  const commandBackdrop = commandPalette ? commandPalette.querySelector(".command-backdrop") : null;
  const commandInput = commandPalette ? commandPalette.querySelector(".command-input") : null;
  const commandItems = commandPalette ? Array.from(commandPalette.querySelectorAll(".command-item")) : [];
  const navLinks = document.querySelectorAll(".nav-links a");
  const railLinks = Array.from(document.querySelectorAll(".section-rail-list a[data-section]"));
  const sections = document.querySelectorAll("main section[id]");
  const revealItems = document.querySelectorAll(".reveal");
  const yearNode = document.getElementById("year");
  const nowBuildingDateNode = document.getElementById("now-building-date");
  const themeStorageKey = "abharan-theme";
  const recruiterStorageKey = "abharan-recruiter-mode";

  // Read saved theme safely; fall back to null if storage is blocked.
  const readStoredTheme = () => {
    try {
      return localStorage.getItem(themeStorageKey);
    } catch (error) {
      return null;
    }
  };

  // Persist theme when storage is available.
  const writeStoredTheme = (theme) => {
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch (error) {
      // Ignore storage failures and keep session theme only.
    }
  };

  // Apply theme and keep toggle accessibility labels in sync.
  const applyTheme = (theme, persist = true) => {
    const resolvedTheme = theme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", resolvedTheme);

    if (persist) {
      writeStoredTheme(resolvedTheme);
    }

    if (themeToggle) {
      const isDark = resolvedTheme === "dark";
      themeToggle.setAttribute("aria-pressed", String(isDark));
      themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    }
  };

  const systemThemeQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const storedTheme = readStoredTheme();
  const initialTheme = storedTheme || (systemThemeQuery && systemThemeQuery.matches ? "dark" : "light");
  applyTheme(initialTheme, Boolean(storedTheme));

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const currentTheme = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      applyTheme(currentTheme === "dark" ? "light" : "dark");
    });
  }

  if (!storedTheme && systemThemeQuery) {
    const syncSystemTheme = (event) => {
      applyTheme(event.matches ? "dark" : "light", false);
    };

    if (typeof systemThemeQuery.addEventListener === "function") {
      systemThemeQuery.addEventListener("change", syncSystemTheme);
    } else if (typeof systemThemeQuery.addListener === "function") {
      systemThemeQuery.addListener(syncSystemTheme);
    }
  }

  const readStoredRecruiterMode = () => {
    try {
      return localStorage.getItem(recruiterStorageKey);
    } catch (error) {
      return null;
    }
  };

  const writeStoredRecruiterMode = (enabled) => {
    try {
      localStorage.setItem(recruiterStorageKey, enabled ? "on" : "off");
    } catch (error) {
      // Ignore storage failures and keep session mode only.
    }
  };

  const applyRecruiterMode = (enabled, persist = true) => {
    const isEnabled = Boolean(enabled);
    root.setAttribute("data-recruiter-mode", isEnabled ? "on" : "off");

    if (persist) {
      writeStoredRecruiterMode(isEnabled);
    }

    if (recruiterToggle) {
      recruiterToggle.classList.toggle("is-active", isEnabled);
      recruiterToggle.setAttribute("aria-pressed", String(isEnabled));
      recruiterToggle.setAttribute("aria-label", isEnabled ? "Disable recruiter mode" : "Enable recruiter mode");
    }

    document.dispatchEvent(
      new CustomEvent("portfolio:recruiter-mode-change", {
        detail: {
          enabled: isEnabled
        }
      })
    );
  };

  const storedRecruiterMode = readStoredRecruiterMode();
  const initialRecruiterMode = storedRecruiterMode === null ? true : storedRecruiterMode === "on";
  applyRecruiterMode(initialRecruiterMode, Boolean(storedRecruiterMode));

  if (recruiterToggle) {
    recruiterToggle.addEventListener("click", () => {
      const current = root.getAttribute("data-recruiter-mode") === "on";
      applyRecruiterMode(!current);
    });
  }

  if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
  }

  if (nowBuildingDateNode) {
    const updatedLabel = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(new Date());
    nowBuildingDateNode.textContent = updatedLabel;
  }

  // Quick command palette state and helpers.
  let activeCommandIndex = 0;
  let filteredCommandItems = [...commandItems];

  const isPaletteOpen = () => Boolean(commandPalette && !commandPalette.hidden);

  const isTypingTarget = (target) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tagName = target.tagName;
    return (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT" ||
      target.isContentEditable
    );
  };

  const setActiveCommand = (index) => {
    if (!filteredCommandItems.length) {
      activeCommandIndex = 0;
      return;
    }

    const wrapped = (index + filteredCommandItems.length) % filteredCommandItems.length;
    activeCommandIndex = wrapped;

    filteredCommandItems.forEach((item, itemIndex) => {
      item.classList.toggle("is-active", itemIndex === activeCommandIndex);
      item.setAttribute("aria-selected", itemIndex === activeCommandIndex ? "true" : "false");
    });

    filteredCommandItems[activeCommandIndex].scrollIntoView({
      block: "nearest"
    });
  };

  const filterCommands = () => {
    const query = commandInput ? commandInput.value.trim().toLowerCase() : "";

    filteredCommandItems = commandItems.filter((item) => {
      const keywords = (item.dataset.keywords || "").toLowerCase();
      const label = (item.querySelector(".command-label")?.textContent || "").toLowerCase();
      const matches = !query || keywords.includes(query) || label.includes(query);
      item.hidden = !matches;
      return matches;
    });

    setActiveCommand(0);
  };

  const setActiveSection = (sectionId) => {
    if (!sectionId) {
      return;
    }

    const navSectionId = sectionId === "now-building" ? "about" : sectionId;

    navLinks.forEach((link) => {
      const target = link.getAttribute("href");
      link.classList.toggle("active", target === `#${navSectionId}`);
    });

    if (railLinks.length) {
      let activeRailIndex = -1;

      railLinks.forEach((link, index) => {
        const isActive = link.dataset.section === sectionId;
        link.classList.toggle("active", isActive);

        if (isActive) {
          activeRailIndex = index;
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      });

      const maxIndex = Math.max(railLinks.length - 1, 1);
      const progressValue = activeRailIndex >= 0 ? activeRailIndex / maxIndex : 0;
      root.style.setProperty("--section-progress", progressValue.toFixed(4));
    }
  };

  const closeCommandPalette = ({ focusToggle = false } = {}) => {
    if (!commandPalette || commandPalette.hidden) {
      return;
    }

    commandPalette.classList.remove("is-open");
    if (commandToggle) {
      commandToggle.setAttribute("aria-expanded", "false");
    }

    window.setTimeout(() => {
      if (!commandPalette.classList.contains("is-open")) {
        commandPalette.hidden = true;
      }
    }, 170);

    if (focusToggle && commandToggle) {
      commandToggle.focus();
    }
  };

  const runCommand = (item) => {
    const href = item.dataset.href;
    if (!href) {
      return;
    }

    const external = item.dataset.external === "true";
    closeCommandPalette();

    if (external) {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }

    if (href.startsWith("#")) {
      const section = document.querySelector(href);
      if (section) {
        setActiveSection(section.id);
        section.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
      history.replaceState(null, "", href);
      return;
    }

    window.location.href = href;
  };

  const openCommandPalette = () => {
    if (!commandPalette) {
      return;
    }

    if (commandInput) {
      commandInput.value = "";
    }
    filterCommands();

    commandPalette.hidden = false;
    requestAnimationFrame(() => {
      commandPalette.classList.add("is-open");
    });

    if (commandToggle) {
      commandToggle.setAttribute("aria-expanded", "true");
    }

    if (commandInput) {
      commandInput.focus();
    }
  };

  if (commandToggle && commandPalette) {
    commandToggle.addEventListener("click", () => {
      if (isPaletteOpen()) {
        closeCommandPalette({
          focusToggle: true
        });
        return;
      }

      openCommandPalette();
    });
  }

  if (commandBackdrop) {
    commandBackdrop.addEventListener("click", () => {
      closeCommandPalette({
        focusToggle: true
      });
    });
  }

  commandItems.forEach((item) => {
    item.addEventListener("click", () => {
      runCommand(item);
    });
  });

  if (commandInput) {
    commandInput.addEventListener("input", filterCommands);
    commandInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveCommand(activeCommandIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveCommand(activeCommandIndex - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const activeItem = filteredCommandItems[activeCommandIndex];
        if (activeItem) {
          runCommand(activeItem);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeCommandPalette({
          focusToggle: true
        });
      }
    });
  }

  // Global shortcut: "/" opens quick navigation unless user is typing.
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (!isPaletteOpen() && !isTypingTarget(event.target)) {
        event.preventDefault();
        openCommandPalette();
      }
      return;
    }

    if (event.key === "Escape" && isPaletteOpen()) {
      closeCommandPalette({
        focusToggle: true
      });
    }
  });

  // Mobile menu open/close behavior.
  if (menuToggle && navWrap) {
    menuToggle.addEventListener("click", () => {
      const expanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!expanded));
      navWrap.classList.toggle("open");
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", () => {
        const target = link.getAttribute("href");
        if (target && target.startsWith("#")) {
          setActiveSection(target.slice(1));
        }
        navWrap.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  railLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const sectionId = link.dataset.section;
      if (sectionId) {
        setActiveSection(sectionId);
      }
    });
  });

  // Stagger reveal animation using element-level delays.
  const revealVariantCycle = ["reveal-rise", "reveal-left", "reveal-right", "reveal-zoom"];
  revealItems.forEach((item, itemIndex) => {
    const requestedVariant = (item.dataset.revealVariant || "").trim().toLowerCase();
    const variantClass = requestedVariant ? `reveal-${requestedVariant}` : revealVariantCycle[itemIndex % revealVariantCycle.length];
    if (variantClass) {
      item.classList.add(variantClass);
    }

    item.style.setProperty("--delay", `${item.dataset.delay || 0}ms`);
  });

  // Reveal elements once as they enter the viewport.
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
      rootMargin: "0px 0px -6% 0px"
    }
  );

  revealItems.forEach((item) => revealObserver.observe(item));

  const sectionList = Array.from(sections);

  // Add section-level transition backgrounds as each section enters once.
  const sectionRevealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("section-in-view");
          sectionRevealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.08,
      rootMargin: "0px 0px -8% 0px"
    }
  );

  sectionList.forEach((section) => sectionRevealObserver.observe(section));

  const getActiveSectionFromViewport = () => {
    if (!sectionList.length) {
      return null;
    }

    const anchorY = window.innerHeight * 0.36;
    let activeSection = sectionList[0];

    sectionList.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top - anchorY <= 0) {
        activeSection = section;
      }
    });

    return activeSection;
  };

  let activeSectionTicking = false;
  const syncActiveSectionFromViewport = () => {
    activeSectionTicking = false;
    const activeSection = getActiveSectionFromViewport();
    if (activeSection) {
      setActiveSection(activeSection.id);
    }
  };

  const queueActiveSectionSync = () => {
    if (activeSectionTicking) {
      return;
    }

    activeSectionTicking = true;
    requestAnimationFrame(syncActiveSectionFromViewport);
  };

  window.addEventListener("scroll", queueActiveSectionSync, { passive: true });
  window.addEventListener("resize", queueActiveSectionSync);

  const hashSectionId = window.location.hash ? window.location.hash.slice(1) : "";
  const initialSection = sectionList.find((section) => section.id === hashSectionId) || sectionList[0];

  if (initialSection) {
    initialSection.classList.add("section-in-view");
    setActiveSection(initialSection.id);
  }

  queueActiveSectionSync();
});
