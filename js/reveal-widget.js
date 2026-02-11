(() => {
  let THREE = null;
  let threeLoadPromise = null;

  // Default settings for the hover reveal widget.
  const DEFAULTS = {
    topImage: "images/hero.png",
    bottomImage: "",
    hoverRadius: 0.18,
    hoverSoftness: 0.45,
    hoverStrength: 1,
    revealMode: "circle",
    performanceMode: "auto",
    touchHoldMs: 220,
    maxPixelRatio: 2
  };

  const REVEAL_MODE_INDEX = {
    circle: 0,
    blob: 1,
    sweep: 2
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const parseNumber = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const parseString = (value, fallback) => {
    if (typeof value !== "string") {
      return fallback;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : fallback;
  };

  const webglAvailable = () => {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch (error) {
      return false;
    }
  };

  const detectLowPowerDevice = () => {
    const cores = navigator.hardwareConcurrency || 8;
    const memory = navigator.deviceMemory || 8;
    return cores <= 4 || memory <= 4;
  };

  const resolveQualityProfile = ({
    performanceMode,
    prefersReducedMotion,
    isCoarsePointer,
    isLowPowerDevice,
    maxPixelRatio
  }) => {
    if (prefersReducedMotion) {
      return {
        pixelRatioCap: Math.min(maxPixelRatio, 1.1),
        pulseStrength: 0,
        warpStrength: 0,
        ringStrength: 0,
        tiltScale: 0,
        scaleBoost: 0,
        instantMotion: true,
        disableTilt: true
      };
    }

    if (performanceMode === "high") {
      return {
        pixelRatioCap: maxPixelRatio,
        pulseStrength: 0.008,
        warpStrength: 0.045,
        ringStrength: 0.14,
        tiltScale: 1,
        scaleBoost: 0.015,
        instantMotion: false,
        disableTilt: false
      };
    }

    if (performanceMode === "low") {
      return {
        pixelRatioCap: Math.min(maxPixelRatio, 1.25),
        pulseStrength: 0.0035,
        warpStrength: 0.022,
        ringStrength: 0.06,
        tiltScale: 0.45,
        scaleBoost: 0.008,
        instantMotion: false,
        disableTilt: isCoarsePointer
      };
    }

    const shouldConserve = isLowPowerDevice || isCoarsePointer;

    if (shouldConserve) {
      return {
        pixelRatioCap: Math.min(maxPixelRatio, 1.35),
        pulseStrength: 0.004,
        warpStrength: 0.026,
        ringStrength: 0.07,
        tiltScale: isCoarsePointer ? 0.25 : 0.6,
        scaleBoost: isCoarsePointer ? 0.006 : 0.01,
        instantMotion: false,
        disableTilt: isCoarsePointer
      };
    }

    return {
      pixelRatioCap: maxPixelRatio,
      pulseStrength: 0.008,
      warpStrength: 0.045,
      ringStrength: 0.14,
      tiltScale: 1,
      scaleBoost: 0.015,
      instantMotion: false,
      disableTilt: false
    };
  };

  const applyStaticWidgetFallback = (node, topImage, message) => {
    node.classList.remove("is-loading", "is-error");
    node.classList.add("is-static");
    node.classList.toggle("is-file-fallback", Boolean(message));

    if (message) {
      node.setAttribute("data-state-message", message);
    } else {
      node.removeAttribute("data-state-message");
    }

    node.textContent = "";

    const image = document.createElement("img");
    image.src = topImage || DEFAULTS.topImage;
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    image.loading = "eager";
    image.fetchPriority = "high";
    node.appendChild(image);
  };

  const isRecruiterModeEnabled = () => document.documentElement.getAttribute("data-recruiter-mode") === "on";

  const ensureThreeModule = async () => {
    if (THREE) {
      return THREE;
    }

    if (!threeLoadPromise) {
      threeLoadPromise = import("https://unpkg.com/three@0.160.1/build/three.module.js")
        .then((module) => {
          THREE = module;
          return module;
        })
        .catch((error) => {
          threeLoadPromise = null;
          throw error;
        });
    }

    return threeLoadPromise;
  };

  class HoverRevealWidget {
    constructor(container, options) {
      this.container = container;
      this.options = options;

      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.material = null;
      this.quad = null;

      this.textureLoader = new THREE.TextureLoader();
      this.topTexture = null;
      this.bottomTexture = null;

      this.width = 0;
      this.height = 0;
      this.disposed = false;
      this.isVisible = true;
      this.rafId = null;
      this.clock = new THREE.Clock();

      this.pointerCurrent = new THREE.Vector2(0.5, 0.5);
      this.pointerTarget = new THREE.Vector2(0.5, 0.5);
      this.hoverCurrent = 0;
      this.hoverTarget = 0;

      this.tiltCurrent = { x: 0, y: 0 };
      this.tiltTarget = { x: 0, y: 0 };

      this.touchReleaseTimer = null;
      this.lastPointerType = "mouse";
      this.contextLost = false;
      this.isSimplified = false;

      this.reducedMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
      this.coarsePointerQuery = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;

      this.prefersReducedMotion = Boolean(this.reducedMotionQuery && this.reducedMotionQuery.matches);
      this.isCoarsePointer = Boolean(this.coarsePointerQuery && this.coarsePointerQuery.matches);
      this.isLowPowerDevice = detectLowPowerDevice();
      this.qualityProfile = resolveQualityProfile({
        performanceMode: this.options.performanceMode,
        prefersReducedMotion: this.prefersReducedMotion,
        isCoarsePointer: this.isCoarsePointer,
        isLowPowerDevice: this.isLowPowerDevice,
        maxPixelRatio: this.options.maxPixelRatio
      });

      this.tick = this.tick.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerLeave = this.handlePointerLeave.bind(this);
      this.handlePointerEnter = this.handlePointerEnter.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerCancel = this.handlePointerCancel.bind(this);
      this.handleEnvironmentChange = this.handleEnvironmentChange.bind(this);
      this.handleContextLost = this.handleContextLost.bind(this);
      this.handleContextRestored = this.handleContextRestored.bind(this);
      this.handleRecruiterModeChange = this.handleRecruiterModeChange.bind(this);

      this.setupRenderer();
      this.setupScene();
      this.bindEvents();
      this.setSimplifiedMode(document.documentElement.getAttribute("data-recruiter-mode") === "on");
      this.loadTextures();
    }

    setupRenderer() {
      // Cap pixel ratio to keep rendering smooth on high-DPI displays.
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.qualityProfile.pixelRatioCap));
      this.renderer.setClearColor(0x000000, 0);

      if ("outputColorSpace" in this.renderer) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }

      this.container.appendChild(this.renderer.domElement);
    }

    setupScene() {
      this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
      this.scene = new THREE.Scene();

      this.material = new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: null },
          uBottom: { value: null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uTopSize: { value: new THREE.Vector2(1, 1) },
          uBottomSize: { value: new THREE.Vector2(1, 1) },
          uPointer: { value: new THREE.Vector2(0.5, 0.5) },
          uHover: { value: 0 },
          uRadius: { value: this.options.hoverRadius },
          uSoftness: { value: this.options.hoverSoftness },
          uStrength: { value: this.options.hoverStrength },
          uMode: { value: REVEAL_MODE_INDEX[this.options.revealMode] ?? REVEAL_MODE_INDEX.circle },
          uPulseStrength: { value: this.qualityProfile.pulseStrength },
          uWarpStrength: { value: this.qualityProfile.warpStrength },
          uRingStrength: { value: this.qualityProfile.ringStrength },
          uTime: { value: 0 }
        },
        vertexShader: `
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;

          uniform sampler2D uTop;
          uniform sampler2D uBottom;
          uniform vec2 uResolution;
          uniform vec2 uTopSize;
          uniform vec2 uBottomSize;
          uniform vec2 uPointer;
          uniform float uHover;
          uniform float uRadius;
          uniform float uSoftness;
          uniform float uStrength;
          uniform float uMode;
          uniform float uPulseStrength;
          uniform float uWarpStrength;
          uniform float uRingStrength;
          uniform float uTime;

          varying vec2 vUv;

          vec2 coverUv(vec2 uv, vec2 imageSize, vec2 viewportSize) {
            float viewportRatio = viewportSize.x / max(viewportSize.y, 0.0001);
            float imageRatio = imageSize.x / max(imageSize.y, 0.0001);
            vec2 result = uv;

            if (viewportRatio > imageRatio) {
              float scale = imageRatio / viewportRatio;
              result.y = uv.y * scale + (1.0 - scale) * 0.5;
            } else {
              float scale = viewportRatio / imageRatio;
              result.x = uv.x * scale + (1.0 - scale) * 0.5;
            }

            return clamp(result, 0.0, 1.0);
          }

          void main() {
            vec2 uvTop = coverUv(vUv, uTopSize, uResolution);

            vec2 pointerDelta = vUv - uPointer;
            vec2 pointerDeltaAspect = pointerDelta;
            pointerDeltaAspect.x *= uResolution.x / max(uResolution.y, 0.0001);
            float dist = length(pointerDeltaAspect);

            float pulse = sin((uTime * 4.5) + (dist * 45.0)) * uPulseStrength * uHover;
            float radius = max(0.0001, uRadius + pulse);
            float feather = max(radius * max(uSoftness, 0.02), 0.0001);

            float reveal = 0.0;
            float mode = floor(uMode + 0.5);

            if (mode < 0.5) {
              // Circular reveal mask with soft edge around cursor.
              reveal = 1.0 - smoothstep(radius - feather, radius, dist);
            } else if (mode < 1.5) {
              // Organic blob reveal with animated boundary wobble.
              float angle = atan(pointerDeltaAspect.y, pointerDeltaAspect.x);
              float wobble = sin(angle * 5.0 + (uTime * 2.8)) * 0.08 + cos(angle * 3.0 - (uTime * 2.1)) * 0.05;
              float blobRadius = max(0.0001, radius * (1.0 + (wobble * uHover)));
              float blobFeather = max(blobRadius * max(uSoftness, 0.02), 0.0001);
              reveal = 1.0 - smoothstep(blobRadius - blobFeather, blobRadius, dist);
            } else {
              // Diagonal sweep reveal around cursor.
              vec2 dir = normalize(vec2(1.0, 0.35));
              float along = dot(pointerDeltaAspect, dir);
              float across = dot(pointerDeltaAspect, vec2(-dir.y, dir.x));
              float sweepHalfWidth = max(radius * 0.55, 0.01);
              float sweepHalfLength = max(radius * 1.7, 0.035);
              float edgeSoftness = max(feather * 0.85, 0.0001);
              float band = 1.0 - smoothstep(sweepHalfWidth - edgeSoftness, sweepHalfWidth + edgeSoftness, abs(across));
              float lengthMask = 1.0 - smoothstep(sweepHalfLength - edgeSoftness, sweepHalfLength + edgeSoftness, abs(along));
              reveal = band * lengthMask;
            }

            reveal *= uHover;
            reveal = clamp(reveal * uStrength, 0.0, 1.0);

            // Mild lens-like UV distortion for depth feel while hovering.
            float warpBase = (mode < 1.5) ? (1.0 - smoothstep(0.0, radius * 1.45, dist)) : reveal;
            float warp = warpBase * uWarpStrength * uHover;
            vec2 uvBottomWarped = vUv - pointerDelta * warp;
            vec2 uvBottom = coverUv(uvBottomWarped, uBottomSize, uResolution);

            vec4 topColor = texture2D(uTop, uvTop);
            vec4 bottomColor = texture2D(uBottom, uvBottom);
            vec4 mixedColor = mix(topColor, bottomColor, reveal);

            // Subtle ring accent around the reveal boundary.
            float ring = 0.0;
            if (mode < 1.5) {
              ring = exp(-pow((dist - radius) / max(feather * 0.65, 0.0001), 2.0)) * uRingStrength * uHover;
            }
            mixedColor.rgb += vec3(ring * 0.75, ring * 0.95, ring * 1.1);

            // Match image brightness with standard sRGB display output.
            mixedColor.rgb = pow(max(mixedColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
            mixedColor.a = 1.0;

            gl_FragColor = mixedColor;
          }
        `
      });

      const geometry = new THREE.PlaneGeometry(1, 1);
      this.quad = new THREE.Mesh(geometry, this.material);
      this.quad.position.set(0.5, 0.5, 0);
      this.quad.frustumCulled = false;
      this.scene.add(this.quad);
    }

    bindEvents() {
      this.container.addEventListener("pointerenter", this.handlePointerEnter, { passive: true });
      this.container.addEventListener("pointermove", this.handlePointerMove, { passive: true });
      this.container.addEventListener("pointerleave", this.handlePointerLeave, { passive: true });
      this.container.addEventListener("pointerdown", this.handlePointerDown, { passive: true });
      this.container.addEventListener("pointerup", this.handlePointerUp, { passive: true });
      this.container.addEventListener("pointercancel", this.handlePointerCancel, { passive: true });

      if (this.renderer && this.renderer.domElement) {
        this.renderer.domElement.addEventListener("webglcontextlost", this.handleContextLost, { passive: false });
        this.renderer.domElement.addEventListener("webglcontextrestored", this.handleContextRestored, { passive: true });
      }

      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === this.container) {
            this.resize(entry.contentRect.width, entry.contentRect.height);
          }
        }
      });
      this.resizeObserver.observe(this.container);

      this.visibilityObserver = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          this.isVisible = Boolean(entry && entry.isIntersecting);
          if (this.isVisible) {
            this.requestFrame();
          }
        },
        { threshold: 0.01 }
      );
      this.visibilityObserver.observe(this.container);

      if (this.reducedMotionQuery) {
        if (typeof this.reducedMotionQuery.addEventListener === "function") {
          this.reducedMotionQuery.addEventListener("change", this.handleEnvironmentChange);
        } else if (typeof this.reducedMotionQuery.addListener === "function") {
          this.reducedMotionQuery.addListener(this.handleEnvironmentChange);
        }
      }

      if (this.coarsePointerQuery) {
        if (typeof this.coarsePointerQuery.addEventListener === "function") {
          this.coarsePointerQuery.addEventListener("change", this.handleEnvironmentChange);
        } else if (typeof this.coarsePointerQuery.addListener === "function") {
          this.coarsePointerQuery.addListener(this.handleEnvironmentChange);
        }
      }

      document.addEventListener("portfolio:recruiter-mode-change", this.handleRecruiterModeChange);
    }

    handleEnvironmentChange() {
      const nextReduced = Boolean(this.reducedMotionQuery && this.reducedMotionQuery.matches);
      const nextCoarse = Boolean(this.coarsePointerQuery && this.coarsePointerQuery.matches);

      if (nextReduced === this.prefersReducedMotion && nextCoarse === this.isCoarsePointer) {
        return;
      }

      this.prefersReducedMotion = nextReduced;
      this.isCoarsePointer = nextCoarse;

      this.applyQualityProfile(
        resolveQualityProfile({
          performanceMode: this.options.performanceMode,
          prefersReducedMotion: this.prefersReducedMotion,
          isCoarsePointer: this.isCoarsePointer,
          isLowPowerDevice: this.isLowPowerDevice,
          maxPixelRatio: this.options.maxPixelRatio
        })
      );
    }

    handleContextLost(event) {
      event.preventDefault();
      this.contextLost = true;
      this.clearTouchReleaseTimer();

      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      this.container.style.transform = "";
      this.setState("is-error", "Graphics context paused. Restoring...");
    }

    handleContextRestored() {
      this.contextLost = false;
      this.setState("", "");
      this.clock.getDelta();
      this.requestFrame();
    }

    handleRecruiterModeChange(event) {
      this.setSimplifiedMode(Boolean(event && event.detail && event.detail.enabled));
    }

    setSimplifiedMode(enabled) {
      const nextState = Boolean(enabled);
      if (nextState === this.isSimplified) {
        return;
      }

      this.isSimplified = nextState;
      this.container.classList.toggle("is-simplified", this.isSimplified);

      this.clearTouchReleaseTimer();
      this.hoverTarget = 0;
      this.hoverCurrent = 0;
      this.pointerTarget.set(0.5, 0.5);
      this.pointerCurrent.set(0.5, 0.5);
      this.tiltTarget.x = 0;
      this.tiltTarget.y = 0;
      this.tiltCurrent.x = 0;
      this.tiltCurrent.y = 0;
      this.container.style.transform = "";
      this.requestFrame();
    }

    applyQualityProfile(nextProfile) {
      this.qualityProfile = nextProfile;

      if (this.renderer) {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.qualityProfile.pixelRatioCap));
        if (this.width > 0 && this.height > 0) {
          this.renderer.setSize(this.width, this.height, false);
        }
      }

      if (this.material) {
        this.material.uniforms.uPulseStrength.value = this.qualityProfile.pulseStrength;
        this.material.uniforms.uWarpStrength.value = this.qualityProfile.warpStrength;
        this.material.uniforms.uRingStrength.value = this.qualityProfile.ringStrength;
      }

      if (this.qualityProfile.disableTilt || this.qualityProfile.instantMotion) {
        this.tiltTarget.x = 0;
        this.tiltTarget.y = 0;
      }

      this.requestFrame();
    }

    async loadTextures() {
      this.setState("is-loading", "Loading hover reveal...");

      try {
        const [top, bottom] = await Promise.all([this.loadTexture(this.options.topImage), this.loadBottomTextureWithFallback()]);

        this.topTexture = top;
        this.bottomTexture = bottom;

        this.material.uniforms.uTop.value = this.topTexture;
        this.material.uniforms.uBottom.value = this.bottomTexture;
        this.material.uniforms.uTopSize.value.set(this.topTexture.image.width, this.topTexture.image.height);
        this.material.uniforms.uBottomSize.value.set(this.bottomTexture.image.width, this.bottomTexture.image.height);

        this.setState("", "");
        this.resize(this.container.clientWidth, this.container.clientHeight);
        this.requestFrame();
      } catch (error) {
        console.error("Hover reveal texture load failed:", error);
        this.setState("is-error", "Unable to load landing image.");
      }
    }

    async loadBottomTextureWithFallback() {
      if (!this.options.bottomImage) {
        return this.createFallbackBottomTexture();
      }

      try {
        return await this.loadTexture(this.options.bottomImage);
      } catch (error) {
        console.warn("Bottom image missing; using generated fallback texture.", error);
        return this.createFallbackBottomTexture();
      }
    }

    loadTexture(path) {
      return new Promise((resolve, reject) => {
        this.textureLoader.load(
          path,
          (texture) => {
            resolve(this.prepareTexture(texture));
          },
          undefined,
          reject
        );
      });
    }

    prepareTexture(texture) {
      if ("colorSpace" in texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
      }
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    }

    createFallbackBottomTexture() {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 800;

      const context = canvas.getContext("2d");
      if (!context) {
        const fallbackTexture = new THREE.Texture(canvas);
        fallbackTexture.needsUpdate = true;
        return this.prepareTexture(fallbackTexture);
      }

      const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#15284f");
      gradient.addColorStop(0.52, "#1f437a");
      gradient.addColorStop(1, "#0f6a67");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.globalAlpha = 0.14;
      context.strokeStyle = "#d4e7ff";
      context.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 36) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, canvas.height);
        context.stroke();
      }
      for (let y = 0; y < canvas.height; y += 36) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(canvas.width, y);
        context.stroke();
      }

      context.globalAlpha = 0.24;
      for (let i = 0; i < 140; i += 1) {
        const radius = 8 + Math.random() * 32;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const glow = context.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, "rgba(109, 168, 255, 0.82)");
        glow.addColorStop(1, "rgba(109, 168, 255, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }

      context.globalAlpha = 1;
      context.font = "600 44px Space Grotesk, sans-serif";
      context.fillStyle = "rgba(236, 245, 255, 0.95)";
      context.fillText("Add your background image to data-bottom-image", 62, canvas.height - 72);

      const fallbackTexture = new THREE.CanvasTexture(canvas);
      fallbackTexture.needsUpdate = true;
      return this.prepareTexture(fallbackTexture);
    }

    setState(stateClass, message) {
      this.container.classList.remove("is-loading", "is-error");
      if (stateClass) {
        this.container.classList.add(stateClass);
      }

      if (message) {
        this.container.setAttribute("data-state-message", message);
      } else {
        this.container.removeAttribute("data-state-message");
      }
    }

    resize(rawWidth, rawHeight) {
      const width = Math.max(1, Math.floor(rawWidth));
      const height = Math.max(1, Math.floor(rawHeight));

      if (width === this.width && height === this.height) {
        return;
      }

      this.width = width;
      this.height = height;

      this.renderer.setSize(width, height, false);
      this.material.uniforms.uResolution.value.set(width, height);
      this.requestFrame();
    }

    clearTouchReleaseTimer() {
      if (this.touchReleaseTimer) {
        window.clearTimeout(this.touchReleaseTimer);
        this.touchReleaseTimer = null;
      }
    }

    scheduleTouchRelease() {
      this.clearTouchReleaseTimer();
      this.touchReleaseTimer = window.setTimeout(() => {
        this.hoverTarget = 0;
        this.requestFrame();
      }, this.options.touchHoldMs);
    }

    updatePointerFromEvent(event) {
      if (!this.width || !this.height || !this.topTexture || !this.bottomTexture) {
        return false;
      }

      const rect = this.container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }

      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);

      const u = clamp(x / rect.width, 0, 1);
      const v = clamp(1 - y / rect.height, 0, 1);
      this.pointerTarget.set(u, v);

      const pointerType = event.pointerType || this.lastPointerType;
      const shouldDisableTilt = this.qualityProfile.disableTilt || this.prefersReducedMotion || pointerType === "touch";

      if (shouldDisableTilt) {
        this.tiltTarget.x = 0;
        this.tiltTarget.y = 0;
      } else {
        const nx = u - 0.5;
        const ny = v - 0.5;
        const tiltScale = this.qualityProfile.tiltScale;
        this.tiltTarget.x = clamp(ny * 10 * tiltScale, -6.5 * tiltScale, 6.5 * tiltScale);
        this.tiltTarget.y = clamp(nx * 14 * tiltScale, -8.5 * tiltScale, 8.5 * tiltScale);
      }

      return true;
    }

    handlePointerEnter(event) {
      if (this.isSimplified) {
        return;
      }

      this.lastPointerType = event.pointerType || this.lastPointerType;
      this.clearTouchReleaseTimer();
      this.hoverTarget = 1;
      this.requestFrame();
    }

    handlePointerLeave() {
      if (this.isSimplified) {
        return;
      }

      if (this.lastPointerType === "touch" || this.isCoarsePointer) {
        this.scheduleTouchRelease();
      } else {
        this.hoverTarget = 0;
      }

      this.tiltTarget.x = 0;
      this.tiltTarget.y = 0;
      this.requestFrame();
    }

    handlePointerDown(event) {
      if (this.isSimplified) {
        return;
      }

      this.lastPointerType = event.pointerType || this.lastPointerType;
      this.clearTouchReleaseTimer();
      if (this.updatePointerFromEvent(event)) {
        this.hoverTarget = 1;
        this.requestFrame();
      }
    }

    handlePointerMove(event) {
      if (this.isSimplified) {
        return;
      }

      this.lastPointerType = event.pointerType || this.lastPointerType;
      this.clearTouchReleaseTimer();
      if (this.updatePointerFromEvent(event)) {
        this.hoverTarget = 1;
        this.requestFrame();
      }
    }

    handlePointerUp(event) {
      if (this.isSimplified) {
        return;
      }

      this.lastPointerType = event.pointerType || this.lastPointerType;
      if (this.lastPointerType === "touch" || this.isCoarsePointer) {
        this.scheduleTouchRelease();
      }
    }

    handlePointerCancel(event) {
      if (this.isSimplified) {
        return;
      }

      this.lastPointerType = event.pointerType || this.lastPointerType;
      this.scheduleTouchRelease();
      this.tiltTarget.x = 0;
      this.tiltTarget.y = 0;
      this.requestFrame();
    }

    renderFrame(deltaSeconds) {
      if (this.isSimplified) {
        this.pointerTarget.set(0.5, 0.5);
        this.pointerCurrent.copy(this.pointerTarget);
        this.hoverTarget = 0;
        this.hoverCurrent = 0;
        this.tiltTarget.x = 0;
        this.tiltTarget.y = 0;
        this.tiltCurrent.x = 0;
        this.tiltCurrent.y = 0;
        this.container.style.transform = "";

        this.material.uniforms.uPointer.value.copy(this.pointerCurrent);
        this.material.uniforms.uHover.value = 0;
        this.material.uniforms.uTime.value += deltaSeconds;

        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);
        return false;
      }

      if (this.qualityProfile.instantMotion) {
        this.pointerCurrent.copy(this.pointerTarget);
        this.hoverCurrent = this.hoverTarget;
        this.tiltCurrent.x = 0;
        this.tiltCurrent.y = 0;
      } else {
        const pointerSpeed = this.isCoarsePointer ? 9 : 13;
        const hoverSpeed = this.isCoarsePointer ? 6 : 8;
        const tiltSpeed = this.isCoarsePointer ? 7.5 : 10;

        const pointerLerp = clamp(deltaSeconds * pointerSpeed, 0.04, 0.3);
        const hoverLerp = clamp(deltaSeconds * hoverSpeed, 0.05, 0.24);
        const tiltLerp = clamp(deltaSeconds * tiltSpeed, 0.06, 0.32);

        this.pointerCurrent.lerp(this.pointerTarget, pointerLerp);
        this.hoverCurrent += (this.hoverTarget - this.hoverCurrent) * hoverLerp;
        this.tiltCurrent.x += (this.tiltTarget.x - this.tiltCurrent.x) * tiltLerp;
        this.tiltCurrent.y += (this.tiltTarget.y - this.tiltCurrent.y) * tiltLerp;
      }

      if (this.qualityProfile.disableTilt || this.qualityProfile.instantMotion) {
        this.container.style.transform = "";
      } else {
        const motion = Math.max(this.hoverCurrent, 0);
        const scale = 1 + motion * this.qualityProfile.scaleBoost;
        this.container.style.transform = `perspective(1100px) rotateX(${this.tiltCurrent.x.toFixed(3)}deg) rotateY(${this.tiltCurrent.y.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      }

      this.material.uniforms.uPointer.value.copy(this.pointerCurrent);
      this.material.uniforms.uHover.value = clamp(this.hoverCurrent, 0, 1);
      this.material.uniforms.uTime.value += deltaSeconds;

      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);

      const hoverSettled = Math.abs(this.hoverTarget - this.hoverCurrent) < 0.001;
      const tiltSettled =
        this.qualityProfile.disableTilt ||
        (Math.abs(this.tiltTarget.x - this.tiltCurrent.x) < 0.01 && Math.abs(this.tiltTarget.y - this.tiltCurrent.y) < 0.01);
      const pointerSettled = this.pointerCurrent.distanceToSquared(this.pointerTarget) < 0.000001;

      return !(hoverSettled && tiltSettled && pointerSettled && this.hoverCurrent < 0.001);
    }

    requestFrame() {
      if (!this.rafId && !this.disposed) {
        this.rafId = requestAnimationFrame(this.tick);
      }
    }

    tick() {
      this.rafId = null;

      if (this.disposed || !this.isVisible || this.contextLost) {
        return;
      }

      if (!this.topTexture || !this.bottomTexture) {
        return;
      }

      const delta = Math.min(this.clock.getDelta(), 0.05);
      const keepAnimating = this.renderFrame(delta);

      if (keepAnimating) {
        this.requestFrame();
      }
    }

    dispose() {
      this.disposed = true;

      this.container.removeEventListener("pointerenter", this.handlePointerEnter);
      this.container.removeEventListener("pointermove", this.handlePointerMove);
      this.container.removeEventListener("pointerleave", this.handlePointerLeave);
      this.container.removeEventListener("pointerdown", this.handlePointerDown);
      this.container.removeEventListener("pointerup", this.handlePointerUp);
      this.container.removeEventListener("pointercancel", this.handlePointerCancel);

      if (this.renderer && this.renderer.domElement) {
        this.renderer.domElement.removeEventListener("webglcontextlost", this.handleContextLost);
        this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleContextRestored);
      }

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      if (this.visibilityObserver) {
        this.visibilityObserver.disconnect();
      }

      if (this.reducedMotionQuery) {
        if (typeof this.reducedMotionQuery.removeEventListener === "function") {
          this.reducedMotionQuery.removeEventListener("change", this.handleEnvironmentChange);
        } else if (typeof this.reducedMotionQuery.removeListener === "function") {
          this.reducedMotionQuery.removeListener(this.handleEnvironmentChange);
        }
      }

      if (this.coarsePointerQuery) {
        if (typeof this.coarsePointerQuery.removeEventListener === "function") {
          this.coarsePointerQuery.removeEventListener("change", this.handleEnvironmentChange);
        } else if (typeof this.coarsePointerQuery.removeListener === "function") {
          this.coarsePointerQuery.removeListener(this.handleEnvironmentChange);
        }
      }

      document.removeEventListener("portfolio:recruiter-mode-change", this.handleRecruiterModeChange);

      this.clearTouchReleaseTimer();

      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      this.container.style.transform = "";

      if (this.topTexture) {
        this.topTexture.dispose();
      }
      if (this.bottomTexture) {
        this.bottomTexture.dispose();
      }

      if (this.material) {
        this.material.dispose();
      }
      if (this.quad && this.quad.geometry) {
        this.quad.geometry.dispose();
      }

      if (this.renderer) {
        this.renderer.dispose();
      }
    }
  }

  const buildOptions = (container) => {
    const dataset = container.dataset;
    const hasTopImage = Object.prototype.hasOwnProperty.call(dataset, "topImage");
    const hasBottomImage = Object.prototype.hasOwnProperty.call(dataset, "bottomImage");
    const topImage = hasTopImage ? dataset.topImage.trim() : DEFAULTS.topImage;
    const bottomImage = hasBottomImage ? dataset.bottomImage.trim() : DEFAULTS.bottomImage;

    // Backward compatibility with old brush-* attributes.
    const radiusFallback = parseNumber(dataset.brushSize, DEFAULTS.hoverRadius);
    const softnessFallback = parseNumber(dataset.brushSoftness, DEFAULTS.hoverSoftness);
    const strengthFallback = parseNumber(dataset.brushStrength, DEFAULTS.hoverStrength);

    const revealModeRaw = parseString(dataset.revealMode, DEFAULTS.revealMode).toLowerCase();
    const revealMode = Object.prototype.hasOwnProperty.call(REVEAL_MODE_INDEX, revealModeRaw)
      ? revealModeRaw
      : DEFAULTS.revealMode;

    const performanceModeRaw = parseString(dataset.performanceMode, DEFAULTS.performanceMode).toLowerCase();
    const performanceMode = ["auto", "high", "low"].includes(performanceModeRaw) ? performanceModeRaw : DEFAULTS.performanceMode;

    return {
      topImage,
      bottomImage,
      hoverRadius: clamp(parseNumber(dataset.hoverRadius, radiusFallback), 0.06, 0.42),
      hoverSoftness: clamp(parseNumber(dataset.hoverSoftness, softnessFallback), 0.08, 0.95),
      hoverStrength: clamp(parseNumber(dataset.hoverStrength, strengthFallback), 0.35, 1.25),
      revealMode,
      performanceMode,
      touchHoldMs: clamp(parseNumber(dataset.touchHoldMs, DEFAULTS.touchHoldMs), 80, 1200),
      maxPixelRatio: DEFAULTS.maxPixelRatio
    };
  };

  const boot = async () => {
    const widgetNodes = Array.from(document.querySelectorAll(".reveal-widget"));
    if (!widgetNodes.length) {
      return;
    }

    const isFileProtocol = window.location.protocol === "file:";
    const hasWebGL = webglAvailable();

    if (isFileProtocol) {
      widgetNodes.forEach((node) => {
        const options = buildOptions(node);
        applyStaticWidgetFallback(node, options.topImage, "");
      });
      return;
    }

    const bootInteractiveWidget = async (node) => {
      const options = buildOptions(node);

      if (!hasWebGL) {
        applyStaticWidgetFallback(node, options.topImage, "");
        node.dataset.revealDeferred = "false";
        return;
      }

      try {
        await ensureThreeModule();
      } catch (error) {
        applyStaticWidgetFallback(node, options.topImage, "");
        node.dataset.revealDeferred = "false";
        return;
      }

      if (node.revealWidget) {
        return;
      }

      node.classList.remove("is-static", "is-file-fallback", "is-loading", "is-error");
      node.removeAttribute("data-state-message");
      node.textContent = "";

      // Expose instance for quick tuning from DevTools.
      node.revealWidget = new HoverRevealWidget(node, options);
      node.dataset.revealDeferred = "false";
    };

    const applyRecruiterStaticMode = () => {
      widgetNodes.forEach((node) => {
        if (node.revealWidget) {
          node.revealWidget.setSimplifiedMode(true);
          return;
        }

        const options = buildOptions(node);
        applyStaticWidgetFallback(node, options.topImage, "");
        node.dataset.revealDeferred = "true";
      });
    };

    const hydrateDeferredWidgets = () => {
      widgetNodes.forEach((node) => {
        if (node.dataset.revealDeferred === "true") {
          void bootInteractiveWidget(node);
        } else if (node.revealWidget) {
          node.revealWidget.setSimplifiedMode(false);
        }
      });
    };

    document.addEventListener("portfolio:recruiter-mode-change", (event) => {
      const enabled = Boolean(event && event.detail && event.detail.enabled);
      if (enabled) {
        applyRecruiterStaticMode();
        return;
      }

      hydrateDeferredWidgets();
    });

    if (isRecruiterModeEnabled()) {
      applyRecruiterStaticMode();
      return;
    }

    await Promise.all(widgetNodes.map((node) => bootInteractiveWidget(node)));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
