(() => {
  const root = document.documentElement;
  const cards = Array.from(document.querySelectorAll("#projects .case-card"));
  if (!cards.length) {
    return;
  }

  const THREE_MODULE_URL = "https://unpkg.com/three@0.160.1/build/three.module.js";
  const reducedMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const coarsePointerQuery = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;

  const addMediaListener = (query, handler) => {
    if (!query) {
      return;
    }

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", handler);
      return;
    }

    if (typeof query.addListener === "function") {
      query.addListener(handler);
    }
  };

  const wrapCardContent = (card) => {
    const existing = card.querySelector(":scope > .case-card-tilt");
    if (existing) {
      return existing;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "case-card-tilt";
    while (card.firstChild) {
      wrapper.appendChild(card.firstChild);
    }
    card.appendChild(wrapper);
    return wrapper;
  };

  class CardTiltController {
    constructor({ THREE, card, wrapper }) {
      this.THREE = THREE;
      this.card = card;
      this.wrapper = wrapper;

      this.object3D = new THREE.Object3D();
      this.targetRotation = new THREE.Vector2();
      this.currentRotation = new THREE.Vector2();
      this.maxRotation = new THREE.Vector2(THREE.MathUtils.degToRad(5.8), THREE.MathUtils.degToRad(7.2));

      this.targetLift = 0;
      this.currentLift = 0;
      this.hovered = false;

      this.handlePointerEnter = this.handlePointerEnter.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerLeave = this.handlePointerLeave.bind(this);

      this.card.classList.add("case-card-3d");
      this.bindEvents();
      this.render(true);
    }

    bindEvents() {
      this.card.addEventListener("pointerenter", this.handlePointerEnter, { passive: true });
      this.card.addEventListener("pointermove", this.handlePointerMove, { passive: true });
      this.card.addEventListener("pointerleave", this.handlePointerLeave, { passive: true });
    }

    unbindEvents() {
      this.card.removeEventListener("pointerenter", this.handlePointerEnter);
      this.card.removeEventListener("pointermove", this.handlePointerMove);
      this.card.removeEventListener("pointerleave", this.handlePointerLeave);
    }

    handlePointerEnter() {
      this.hovered = true;
      this.targetLift = 12;
    }

    handlePointerMove(event) {
      const rect = this.card.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      this.targetRotation.x = -ny * this.maxRotation.x;
      this.targetRotation.y = nx * this.maxRotation.y;
      this.targetLift = 12;
    }

    handlePointerLeave() {
      this.hovered = false;
      this.targetRotation.set(0, 0);
      this.targetLift = 0;
    }

    step() {
      this.currentRotation.lerp(this.targetRotation, 0.14);
      this.currentLift += (this.targetLift - this.currentLift) * 0.13;
      this.render(false);

      const rotationEnergy = Math.abs(this.currentRotation.x) + Math.abs(this.currentRotation.y);
      return this.hovered || rotationEnergy > 0.0012 || this.currentLift > 0.1;
    }

    render(force) {
      this.object3D.rotation.set(this.currentRotation.x, this.currentRotation.y, 0);
      this.object3D.position.set(0, 0, this.currentLift);
      this.object3D.updateMatrix();

      const elements = this.object3D.matrix.elements.map((value) => Number(value.toFixed(8)));
      const matrixValue = `matrix3d(${elements.join(",")})`;

      if (force || this.wrapper.style.transform !== matrixValue) {
        this.wrapper.style.transform = matrixValue;
      }

      const shadowOpacity = 0.17 + this.currentLift * 0.012;
      const shadowY = 12 + this.currentLift * 0.75;
      this.card.style.setProperty("--card-shadow-opacity", shadowOpacity.toFixed(3));
      this.card.style.setProperty("--card-shadow-y", `${shadowY.toFixed(2)}px`);
      this.card.classList.toggle("is-tilting", this.hovered || this.currentLift > 0.2);
    }

    reset() {
      this.hovered = false;
      this.targetRotation.set(0, 0);
      this.currentRotation.set(0, 0);
      this.targetLift = 0;
      this.currentLift = 0;
      this.wrapper.style.transform = "translate3d(0, 0, 0)";
      this.card.style.setProperty("--card-shadow-opacity", "0.2");
      this.card.style.setProperty("--card-shadow-y", "12px");
      this.card.classList.remove("is-tilting");
    }
  }

  class ProjectCardTiltLab {
    constructor(THREE) {
      this.THREE = THREE;
      this.controllers = cards.map((card) => {
        const wrapper = wrapCardContent(card);
        return new CardTiltController({ THREE, card, wrapper });
      });

      this.recruiterModeOn = root.getAttribute("data-recruiter-mode") === "on";
      this.prefersReducedMotion = Boolean(reducedMotionQuery && reducedMotionQuery.matches);
      this.isCoarsePointer = Boolean(coarsePointerQuery && coarsePointerQuery.matches);

      this.running = false;
      this.animationFrame = null;
      this.tick = this.tick.bind(this);
      this.handleReducedMotionChange = this.handleReducedMotionChange.bind(this);
      this.handleCoarsePointerChange = this.handleCoarsePointerChange.bind(this);
      this.handleRecruiterModeChange = this.handleRecruiterModeChange.bind(this);

      addMediaListener(reducedMotionQuery, this.handleReducedMotionChange);
      addMediaListener(coarsePointerQuery, this.handleCoarsePointerChange);
      document.addEventListener("portfolio:recruiter-mode-change", this.handleRecruiterModeChange);

      this.syncAnimation();
    }

    canAnimate() {
      return !this.recruiterModeOn && !this.prefersReducedMotion && !this.isCoarsePointer;
    }

    handleReducedMotionChange(event) {
      this.prefersReducedMotion = Boolean(event.matches);
      this.syncAnimation();
    }

    handleCoarsePointerChange(event) {
      this.isCoarsePointer = Boolean(event.matches);
      this.syncAnimation();
    }

    handleRecruiterModeChange(event) {
      this.recruiterModeOn = Boolean(event && event.detail && event.detail.enabled);
      this.syncAnimation();
    }

    syncAnimation() {
      if (!this.canAnimate()) {
        this.controllers.forEach((controller) => controller.reset());
        this.stopLoop();
        return;
      }

      this.startLoop();
    }

    startLoop() {
      if (this.running) {
        return;
      }
      this.running = true;
      this.animationFrame = requestAnimationFrame(this.tick);
    }

    stopLoop() {
      this.running = false;
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }

    tick() {
      if (!this.running) {
        return;
      }

      let hasMotion = false;
      this.controllers.forEach((controller) => {
        hasMotion = controller.step() || hasMotion;
      });

      if (hasMotion) {
        this.animationFrame = requestAnimationFrame(this.tick);
      } else {
        this.running = false;
        this.animationFrame = null;
      }
    }
  }

  const boot = async () => {
    if (window.location.protocol === "file:") {
      return;
    }

    try {
      const THREE = await import(THREE_MODULE_URL);
      new ProjectCardTiltLab(THREE);
    } catch (error) {
      console.error("Unable to initialize project card tilt lab:", error);
    }
  };

  boot();
})();
