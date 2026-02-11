(() => {
  const root = document.documentElement;
  const mount = document.querySelector(".hero-drift");
  const canvas = document.getElementById("hero-particle-drift");
  if (!mount || !canvas) {
    return;
  }

  const THREE_MODULE_URL = "https://unpkg.com/three@0.160.1/build/three.module.js";
  const reducedMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const parseRgbVariable = (name, fallback) => {
    const raw = getComputedStyle(root).getPropertyValue(name).trim();
    if (!raw) {
      return fallback;
    }

    const values = raw
      .split(",")
      .map((part) => Number.parseFloat(part.trim()))
      .filter((value) => Number.isFinite(value))
      .slice(0, 3);

    if (values.length !== 3) {
      return fallback;
    }

    return values.map((value) => clamp(value, 0, 255));
  };

  const parseNumberVariable = (name, fallback) => {
    const raw = Number.parseFloat(getComputedStyle(root).getPropertyValue(name));
    return Number.isFinite(raw) ? raw : fallback;
  };

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

  class HeroParticleDriftLab {
    constructor(THREE) {
      this.THREE = THREE;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.points = null;
      this.material = null;
      this.clock = new THREE.Clock();
      this.animationFrame = null;

      this.visible = true;
      this.running = false;
      this.recruiterModeOn = root.getAttribute("data-recruiter-mode") === "on";
      this.prefersReducedMotion = Boolean(reducedMotionQuery && reducedMotionQuery.matches);

      this.resizeObserver = null;
      this.intersectionObserver = null;
      this.themeObserver = null;

      this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
      this.handleReducedMotionChange = this.handleReducedMotionChange.bind(this);
      this.handleRecruiterModeChange = this.handleRecruiterModeChange.bind(this);
      this.tick = this.tick.bind(this);

      this.initRenderer();
      this.initScene();
      this.setupObservers();
      this.resize();
      this.applyThemePalette();
      this.syncAnimation();
    }

    initRenderer() {
      const { THREE } = this;
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power"
      });

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45));
      this.renderer.setClearColor(0x000000, 0);
      if ("outputColorSpace" in this.renderer) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
    }

    initScene() {
      const { THREE } = this;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
      this.camera.position.set(0, 0, 9);

      const count = 54;
      const positions = new Float32Array(count * 3);
      const scales = new Float32Array(count);
      const speeds = new Float32Array(count);
      const offsets = new Float32Array(count);
      const drifts = new Float32Array(count);
      const colors = new Float32Array(count * 3);

      for (let index = 0; index < count; index += 1) {
        const stride = index * 3;
        const depth = Math.random();
        positions[stride] = (Math.random() - 0.5) * 10;
        positions[stride + 1] = (Math.random() - 0.5) * 5.5;
        positions[stride + 2] = -depth * 6;

        scales[index] = 0.6 + Math.random() * 1.5 + depth * 1.5;
        speeds[index] = 0.06 + Math.random() * 0.12 + depth * 0.08;
        offsets[index] = Math.random() * Math.PI * 2;
        drifts[index] = 0.12 + Math.random() * 0.36;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
      geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
      geometry.setAttribute("aOffset", new THREE.BufferAttribute(offsets, 1));
      geometry.setAttribute("aDrift", new THREE.BufferAttribute(drifts, 1));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      this.material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexColors: true,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 8.0 },
          uOpacity: { value: 1.0 }
        },
        vertexShader: `
          attribute float aScale;
          attribute float aSpeed;
          attribute float aOffset;
          attribute float aDrift;
          uniform float uTime;
          uniform float uSize;
          varying vec3 vColor;
          varying float vDepth;

          void main() {
            vec3 p = position;
            p.x += sin((uTime * aSpeed) + aOffset) * aDrift;
            p.y += cos((uTime * (aSpeed * 0.85)) + aOffset) * (aDrift * 0.55);

            vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = uSize * aScale * (8.0 / -mvPosition.z);
            vColor = color;
            vDepth = clamp((-mvPosition.z) / 12.0, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          varying vec3 vColor;
          varying float vDepth;

          void main() {
            vec2 p = gl_PointCoord - vec2(0.5);
            float d = length(p);
            float soft = smoothstep(0.52, 0.0, d);
            float falloff = smoothstep(1.0, 0.15, vDepth);
            float alpha = soft * falloff * uOpacity;
            if (alpha < 0.003) discard;
            gl_FragColor = vec4(vColor, alpha);
          }
        `
      });

      this.points = new THREE.Points(geometry, this.material);
      this.scene.add(this.points);
    }

    setupObservers() {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(mount);

      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.target === mount) {
              this.visible = entry.isIntersecting;
            }
          });
          this.syncAnimation();
        },
        {
          threshold: 0.08
        }
      );
      this.intersectionObserver.observe(mount);

      this.themeObserver = new MutationObserver(() => {
        this.applyThemePalette();
      });
      this.themeObserver.observe(root, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });

      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      document.addEventListener("portfolio:recruiter-mode-change", this.handleRecruiterModeChange);
      addMediaListener(reducedMotionQuery, this.handleReducedMotionChange);
    }

    handleVisibilityChange() {
      this.syncAnimation();
    }

    handleReducedMotionChange(event) {
      this.prefersReducedMotion = Boolean(event.matches);
      this.syncAnimation();
    }

    handleRecruiterModeChange(event) {
      this.recruiterModeOn = Boolean(event && event.detail && event.detail.enabled);
      this.syncAnimation();
    }

    canAnimate() {
      return !this.recruiterModeOn && !this.prefersReducedMotion;
    }

    syncAnimation() {
      const shouldRun = this.visible && !document.hidden && this.canAnimate();
      if (shouldRun === this.running) {
        return;
      }

      this.running = shouldRun;
      if (this.running) {
        this.clock.getDelta();
        this.tick();
      } else if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    }

    applyThemePalette() {
      if (!this.points || !this.points.geometry) {
        return;
      }

      const core = parseRgbVariable("--hero-drift-core-rgb", [16, 84, 185]);
      const glow = parseRgbVariable("--hero-drift-glow-rgb", [0, 163, 163]);
      const coreAlpha = clamp(parseNumberVariable("--hero-drift-core-alpha", 0.13), 0.03, 0.22);
      const glowAlpha = clamp(parseNumberVariable("--hero-drift-glow-alpha", 0.08), 0.02, 0.18);

      const opacity = this.recruiterModeOn ? (coreAlpha + glowAlpha) * 0.45 : coreAlpha + glowAlpha;
      this.material.uniforms.uOpacity.value = opacity;

      const colors = this.points.geometry.getAttribute("color");
      for (let index = 0; index < colors.count; index += 1) {
        const mix = Math.random();
        colors.setXYZ(
          index,
          (core[0] * (1 - mix) + glow[0] * mix) / 255,
          (core[1] * (1 - mix) + glow[1] * mix) / 255,
          (core[2] * (1 - mix) + glow[2] * mix) / 255
        );
      }
      colors.needsUpdate = true;
    }

    resize() {
      const width = Math.max(1, Math.floor(mount.clientWidth));
      const height = Math.max(1, Math.floor(mount.clientHeight));
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderFrame();
    }

    tick() {
      if (!this.running) {
        return;
      }

      this.animationFrame = requestAnimationFrame(this.tick);
      this.material.uniforms.uTime.value = this.clock.elapsedTime;
      this.renderFrame();
    }

    renderFrame() {
      this.renderer.render(this.scene, this.camera);
    }
  }

  const boot = async () => {
    if (window.location.protocol === "file:") {
      return;
    }

    try {
      const THREE = await import(THREE_MODULE_URL);
      new HeroParticleDriftLab(THREE);
    } catch (error) {
      console.error("Unable to initialize hero particle drift:", error);
    }
  };

  boot();
})();
