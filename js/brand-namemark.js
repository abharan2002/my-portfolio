(() => {
  const mount = document.getElementById("brand-namemark");
  if (!mount) {
    return;
  }

  const root = document.documentElement;
  const labelText = (mount.dataset.text || "Abharan Gupta").trim() || "Abharan Gupta";

  const THREE_MODULE_URL = "https://unpkg.com/three@0.160.1/build/three.module.js";
  const FONT_LOADER_URL = "https://unpkg.com/three@0.160.1/examples/jsm/loaders/FontLoader.js";
  const TEXT_GEOMETRY_URL = "https://unpkg.com/three@0.160.1/examples/jsm/geometries/TextGeometry.js";
  const FONT_URL = "https://unpkg.com/three@0.160.1/examples/fonts/helvetiker_regular.typeface.json";

  const reducedMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

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

  const setMountState = (stateClass, message) => {
    mount.classList.remove("is-loading", "is-error", "is-static");
    if (stateClass) {
      mount.classList.add(stateClass);
    }

    if (message) {
      mount.setAttribute("data-state-message", message);
    } else {
      mount.removeAttribute("data-state-message");
    }
  };

  const applyStaticFallback = () => {
    mount.innerHTML = "";
    setMountState("is-static", "");
  };

  const loadFont = (FontLoader) =>
    new Promise((resolve, reject) => {
      const loader = new FontLoader();
      loader.load(FONT_URL, resolve, undefined, reject);
    });

  class BrandNamemarkLab {
    constructor({ THREE, TextGeometry, font }) {
      this.THREE = THREE;
      this.TextGeometry = TextGeometry;
      this.font = font;

      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.textGroup = null;
      this.textMesh = null;
      this.sweepLight = null;
      this.baseTextSize = null;

      this.materials = [];
      this.resizeObserver = null;
      this.intersectionObserver = null;
      this.themeObserver = null;

      this.clock = new THREE.Clock();
      this.rafId = null;
      this.visible = false;
      this.running = false;

      this.recruiterModeOn = root.getAttribute("data-recruiter-mode") === "on";
      this.prefersReducedMotion = Boolean(reducedMotionQuery && reducedMotionQuery.matches);

      this.tick = this.tick.bind(this);
      this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
      this.handleReducedMotionChange = this.handleReducedMotionChange.bind(this);
      this.handleRecruiterModeChange = this.handleRecruiterModeChange.bind(this);

      this.setupRenderer();
      this.setupScene();
      this.setupObservers();
      this.resize();
      this.syncRunning();
    }

    setupRenderer() {
      const { THREE } = this;
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.06;

      if ("outputColorSpace" in this.renderer) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }

      mount.innerHTML = "";
      mount.appendChild(this.renderer.domElement);
    }

    setupScene() {
      const { THREE } = this;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
      this.camera.position.set(0, 0.04, 6.8);

      const ambient = new THREE.AmbientLight(0x98afd8, 0.55);
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(2.7, 2.1, 4.4);

      const fill = new THREE.DirectionalLight(0x81aaf5, 0.45);
      fill.position.set(-2.6, -0.4, 2.1);

      const rim = new THREE.PointLight(0x8bc6ff, 0.35, 9, 2);
      rim.position.set(2.2, -0.5, -1.5);

      this.sweepLight = new THREE.PointLight(0xffffff, 1.8, 8.5, 1.9);
      this.sweepLight.position.set(-2.2, 0.16, 3.2);

      this.scene.add(ambient, key, fill, rim, this.sweepLight);

      this.textGroup = new THREE.Group();
      this.textGroup.rotation.set(-0.038, -0.065, 0);
      this.scene.add(this.textGroup);

      this.buildTextMesh();
      this.applyThemePalette();
      this.renderFrame();
    }

    buildTextMesh() {
      const { THREE, TextGeometry } = this;
      const geometry = new TextGeometry(labelText, {
        font: this.font,
        size: 1,
        height: 0.065,
        curveSegments: 20,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.008,
        bevelOffset: 0,
        bevelSegments: 4
      });

      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      if (bounds) {
        bounds.getCenter(center);
        bounds.getSize(size);
      }

      geometry.translate(-center.x, -center.y, -center.z);
      geometry.computeVertexNormals();

      const faceMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xdceaff,
        metalness: 0.58,
        roughness: 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissive: 0x09182f,
        emissiveIntensity: 0.16
      });

      const sideMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x1d3150,
        metalness: 0.45,
        roughness: 0.42,
        clearcoat: 0.55,
        clearcoatRoughness: 0.2,
        emissive: 0x081427,
        emissiveIntensity: 0.1
      });

      this.materials.push(faceMaterial, sideMaterial);

      this.textMesh = new THREE.Mesh(geometry, [faceMaterial, sideMaterial]);
      this.textMesh.position.y = 0.02;
      this.textGroup.add(this.textMesh);

      this.baseTextSize = {
        width: Math.max(size.x, 0.001),
        height: Math.max(size.y, 0.001)
      };
      this.fitTextScale();
    }

    fitTextScale() {
      if (!this.textMesh || !this.baseTextSize) {
        return;
      }

      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const aspect = width / height;
      const targetWidth = Math.min(8.6, Math.max(4.8, aspect * 0.62));
      const targetHeight = 1.24;
      const scaleFromWidth = targetWidth / this.baseTextSize.width;
      const scaleFromHeight = targetHeight / this.baseTextSize.height;
      const scale = Math.min(scaleFromWidth, scaleFromHeight);
      this.textMesh.scale.setScalar(scale);
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
          this.syncRunning();
        },
        {
          threshold: 0.15,
          rootMargin: "0px 0px -10% 0px"
        }
      );
      this.intersectionObserver.observe(mount);

      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      document.addEventListener("portfolio:recruiter-mode-change", this.handleRecruiterModeChange);
      addMediaListener(reducedMotionQuery, this.handleReducedMotionChange);

      this.themeObserver = new MutationObserver(() => {
        this.applyThemePalette();
        this.renderFrame();
      });
      this.themeObserver.observe(root, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });
    }

    handleVisibilityChange() {
      this.syncRunning();
    }

    handleRecruiterModeChange(event) {
      this.recruiterModeOn = Boolean(event && event.detail && event.detail.enabled);
      this.syncRunning();
    }

    handleReducedMotionChange(event) {
      this.prefersReducedMotion = Boolean(event.matches);
      this.syncRunning();
    }

    applyThemePalette() {
      const isDark = root.getAttribute("data-theme") === "dark";
      const primary = isDark ? 0xdcebff : 0x17345f;
      const side = isDark ? 0x2e4e7d : 0x294266;
      const emissive = isDark ? 0x0b1f3e : 0x0a1a31;

      if (this.materials[0]) {
        this.materials[0].color.setHex(primary);
        this.materials[0].emissive.setHex(emissive);
      }

      if (this.materials[1]) {
        this.materials[1].color.setHex(side);
        this.materials[1].emissive.setHex(emissive);
      }
    }

    resize() {
      if (!this.renderer || !this.camera) {
        return;
      }

      const width = Math.max(1, Math.floor(mount.clientWidth));
      const height = Math.max(1, Math.floor(mount.clientHeight));
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.fitTextScale();
      this.renderFrame();
    }

    canAnimate() {
      return !this.recruiterModeOn && !this.prefersReducedMotion;
    }

    syncRunning() {
      const shouldRun = this.visible && !document.hidden && this.canAnimate();
      this.setRunning(shouldRun);
      if (!shouldRun) {
        this.renderFrame();
      }
    }

    setRunning(shouldRun) {
      if (shouldRun === this.running) {
        return;
      }

      this.running = shouldRun;
      if (this.running) {
        this.clock.getDelta();
        this.tick();
      } else if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    tick() {
      if (!this.running) {
        return;
      }

      this.rafId = requestAnimationFrame(this.tick);

      const elapsed = this.clock.elapsedTime;
      if (this.sweepLight) {
        this.sweepLight.position.x = Math.sin(elapsed * 0.72) * 2.7;
        this.sweepLight.position.y = 0.16 + Math.cos(elapsed * 0.42) * 0.22;
        this.sweepLight.intensity = 1.65 + (Math.sin(elapsed * 0.86) * 0.24 + 0.24);
      }

      if (this.textGroup) {
        this.textGroup.rotation.y = -0.065 + Math.sin(elapsed * 0.34) * 0.018;
        this.textGroup.rotation.x = -0.038 + Math.cos(elapsed * 0.25) * 0.006;
      }

      this.renderFrame();
    }

    renderFrame() {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    }

    dispose() {
      this.setRunning(false);

      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      document.removeEventListener("portfolio:recruiter-mode-change", this.handleRecruiterModeChange);

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
      }
      if (this.themeObserver) {
        this.themeObserver.disconnect();
      }

      if (this.textGroup) {
        this.textGroup.traverse((node) => {
          if (node.geometry) {
            node.geometry.dispose();
          }
          if (node.material) {
            if (Array.isArray(node.material)) {
              node.material.forEach((material) => material.dispose());
            } else {
              node.material.dispose();
            }
          }
        });
      }

      if (this.renderer) {
        this.renderer.dispose();
      }
    }
  }

  const boot = async () => {
    if (window.location.protocol === "file:") {
      applyStaticFallback();
      return;
    }

    setMountState("is-loading", "Loading signature...");

    try {
      const [threeModule, fontLoaderModule, textGeometryModule] = await Promise.all([
        import(THREE_MODULE_URL),
        import(FONT_LOADER_URL),
        import(TEXT_GEOMETRY_URL)
      ]);

      const font = await loadFont(fontLoaderModule.FontLoader);
      const lab = new BrandNamemarkLab({
        THREE: threeModule,
        TextGeometry: textGeometryModule.TextGeometry,
        font
      });

      mount.brandNamemarkLab = lab;
      setMountState("", "");
    } catch (error) {
      console.error("Unable to initialize brand namemark:", error);
      applyStaticFallback();
    }
  };

  boot();
})();
