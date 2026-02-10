(() => {
  let THREE = null;

  // Default settings for the hero reveal widget.
  const DEFAULTS = {
    topImage: "images/hero.png",
    bottomImage: "",
    brushSize: 0.12,
    brushSoftness: 0.82,
    brushStrength: 0.9,
    decay: true,
    decayRate: 0.24,
    maskScale: 0.65,
    maxPixelRatio: 2
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const parseBoolean = (value, fallback) => {
    if (value == null || value === "") {
      return fallback;
    }

    return value !== "false" && value !== "0";
  };

  const parseNumber = (value, fallback) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const webglAvailable = () => {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch (error) {
      return false;
    }
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
    node.appendChild(image);
  };

  class MaskRevealWidget {
    constructor(container, options) {
      this.container = container;
      this.options = options;

      this.renderer = null;
      this.mainScene = null;
      this.maskScene = null;
      this.decayScene = null;
      this.camera = null;

      this.finalMaterial = null;
      this.brushMaterial = null;
      this.decayMaterial = null;
      this.brushMesh = null;

      this.maskFront = null;
      this.maskBack = null;

      this.textureLoader = new THREE.TextureLoader();
      this.topTexture = null;
      this.bottomTexture = null;

      this.pointsQueue = [];
      this.lastPoint = null;
      this.lastPaintTime = -Infinity;
      this.decayTailMs = Math.max(1000, (1 / Math.max(this.options.decayRate, 0.01)) * 1000 + 200);

      this.width = 0;
      this.height = 0;
      this.brushRadiusPx = 1;
      this.rafId = null;
      this.needsRender = false;
      this.disposed = false;
      this.isVisible = true;
      this.clock = new THREE.Clock();
      this.tmpClearColor = new THREE.Color();

      this.tick = this.tick.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerLeave = this.handlePointerLeave.bind(this);
      this.handlePointerEnter = this.handlePointerEnter.bind(this);

      this.setupRenderer();
      this.setupScenes();
      this.bindEvents();
      this.loadTextures();
    }

    setupRenderer() {
      // Cap pixel ratio to keep rendering smooth on high-DPI screens.
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio));
      this.renderer.setClearColor(0x000000, 0);
      if ("outputColorSpace" in this.renderer) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      this.container.appendChild(this.renderer.domElement);
    }

    setupScenes() {
      this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

      const fullscreenGeometry = new THREE.PlaneGeometry(1, 1);

      // Final pass: blend top and bottom textures using the mask texture.
      this.mainScene = new THREE.Scene();
      this.finalMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTop: { value: null },
          uBottom: { value: null },
          uMask: { value: null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uTopSize: { value: new THREE.Vector2(1, 1) },
          uBottomSize: { value: new THREE.Vector2(1, 1) }
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
          uniform sampler2D uMask;
          uniform vec2 uResolution;
          uniform vec2 uTopSize;
          uniform vec2 uBottomSize;

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
            vec2 uvBottom = coverUv(vUv, uBottomSize, uResolution);

            vec4 topColor = texture2D(uTop, uvTop);
            vec4 bottomColor = texture2D(uBottom, uvBottom);
            float maskValue = texture2D(uMask, vUv).r;
            maskValue = smoothstep(0.02, 0.98, maskValue);

            vec4 mixedColor = mix(topColor, bottomColor, maskValue);
            mixedColor.rgb = pow(max(mixedColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
            gl_FragColor = mixedColor;
          }
        `
      });

      this.finalQuad = new THREE.Mesh(fullscreenGeometry, this.finalMaterial);
      this.finalQuad.position.set(0.5, 0.5, 0);
      this.finalQuad.frustumCulled = false;
      this.mainScene.add(this.finalQuad);

      // Brush pass: paint soft circular strokes into the mask render target.
      this.maskScene = new THREE.Scene();
      this.brushMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uSoftness: { value: this.options.brushSoftness },
          uStrength: { value: this.options.brushStrength }
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

          uniform float uSoftness;
          uniform float uStrength;
          varying vec2 vUv;

          void main() {
            vec2 p = vUv - 0.5;
            float dist = length(p);
            float inner = clamp(0.5 * (1.0 - uSoftness), 0.0, 0.49);
            float alpha = 1.0 - smoothstep(inner, 0.5, dist);
            alpha *= uStrength;
            gl_FragColor = vec4(vec3(alpha), alpha);
          }
        `,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      this.brushMesh = new THREE.Mesh(fullscreenGeometry.clone(), this.brushMaterial);
      this.brushMesh.position.set(0.5, 0.5, 0);
      this.brushMesh.frustumCulled = false;
      this.maskScene.add(this.brushMesh);

      // Decay pass: fade the mask gradually when the pointer is idle.
      this.decayScene = new THREE.Scene();
      this.decayMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uMask: { value: null },
          uDecayRate: { value: this.options.decayRate },
          uDelta: { value: 0.016 }
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

          uniform sampler2D uMask;
          uniform float uDecayRate;
          uniform float uDelta;
          varying vec2 vUv;

          void main() {
            float value = texture2D(uMask, vUv).r;
            value = max(0.0, value - (uDecayRate * uDelta));
            gl_FragColor = vec4(vec3(value), 1.0);
          }
        `,
        depthTest: false,
        depthWrite: false
      });

      this.decayQuad = new THREE.Mesh(fullscreenGeometry.clone(), this.decayMaterial);
      this.decayQuad.position.set(0.5, 0.5, 0);
      this.decayQuad.frustumCulled = false;
      this.decayScene.add(this.decayQuad);
    }

    bindEvents() {
      this.container.addEventListener("pointerenter", this.handlePointerEnter, { passive: true });
      this.container.addEventListener("pointermove", this.handlePointerMove, { passive: true });
      this.container.addEventListener("pointerleave", this.handlePointerLeave, { passive: true });

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
            this.needsRender = true;
            this.requestFrame();
          }
        },
        { threshold: 0.01 }
      );
      this.visibilityObserver.observe(this.container);
    }

    async loadTextures() {
      this.setState("is-loading", "Loading reveal widget...");

      try {
        const top = await this.loadTexture(this.options.topImage);
        const bottom = await this.loadBottomTextureWithFallback();

        this.topTexture = top;
        this.bottomTexture = bottom;

        this.finalMaterial.uniforms.uTop.value = this.topTexture;
        this.finalMaterial.uniforms.uBottom.value = this.bottomTexture;
        this.finalMaterial.uniforms.uTopSize.value.set(this.topTexture.image.width, this.topTexture.image.height);
        this.finalMaterial.uniforms.uBottomSize.value.set(this.bottomTexture.image.width, this.bottomTexture.image.height);

        this.setState("", "");
        this.resize(this.container.clientWidth, this.container.clientHeight);
        this.needsRender = true;
        this.requestFrame();
      } catch (error) {
        console.error("Reveal widget texture load failed:", error);
        this.setState("is-error", "Unable to load landing top image.");
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
      gradient.addColorStop(0, "#14274f");
      gradient.addColorStop(0.55, "#183a6b");
      gradient.addColorStop(1, "#0f5f6a");
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.globalAlpha = 0.13;
      context.strokeStyle = "#d7e6ff";
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
      for (let i = 0; i < 120; i += 1) {
        const radius = 8 + Math.random() * 34;
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const glow = context.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, "rgba(110, 161, 255, 0.85)");
        glow.addColorStop(1, "rgba(110, 161, 255, 0)");
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
      this.finalMaterial.uniforms.uResolution.value.set(width, height);

      this.brushRadiusPx = this.options.brushSize * Math.min(width, height);
      this.recreateMaskTargets();

      this.lastPoint = null;
      this.pointsQueue.length = 0;
      this.needsRender = true;
      this.requestFrame();
    }

    recreateMaskTargets() {
      // Render to lower-res mask targets for better performance.
      const maskWidth = Math.max(64, Math.round(this.width * this.options.maskScale));
      const maskHeight = Math.max(64, Math.round(this.height * this.options.maskScale));

      const params = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false
      };

      const nextFront = new THREE.WebGLRenderTarget(maskWidth, maskHeight, params);
      const nextBack = new THREE.WebGLRenderTarget(maskWidth, maskHeight, params);

      this.clearTarget(nextFront);
      this.clearTarget(nextBack);

      if (this.maskFront) {
        this.maskFront.dispose();
      }
      if (this.maskBack) {
        this.maskBack.dispose();
      }

      this.maskFront = nextFront;
      this.maskBack = nextBack;
      this.finalMaterial.uniforms.uMask.value = this.maskFront.texture;
    }

    clearTarget(target) {
      const prevTarget = this.renderer.getRenderTarget();
      const prevAlpha = this.renderer.getClearAlpha();
      this.renderer.getClearColor(this.tmpClearColor);

      this.renderer.setRenderTarget(target);
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear(true, true, true);
      this.renderer.setRenderTarget(prevTarget);

      this.renderer.setClearColor(this.tmpClearColor, prevAlpha);
    }

    handlePointerEnter() {
      this.lastPoint = null;
    }

    handlePointerLeave() {
      this.lastPoint = null;
    }

    handlePointerMove(event) {
      if (!this.width || !this.height || !this.topTexture || !this.bottomTexture) {
        return;
      }

      const rect = this.container.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);

      const currentPoint = {
        x,
        y,
        u: clamp(x / rect.width, 0, 1),
        v: clamp(1 - y / rect.height, 0, 1)
      };

      this.queuePoint(currentPoint);
      this.lastPaintTime = performance.now();
      this.requestFrame();
    }

    queuePoint(point) {
      const spacing = Math.max(2, this.brushRadiusPx * 0.33);

      if (!this.lastPoint) {
        this.pointsQueue.push(point);
        this.lastPoint = point;
        return;
      }

      const dx = point.x - this.lastPoint.x;
      const dy = point.y - this.lastPoint.y;
      const distance = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(distance / spacing));

      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        this.pointsQueue.push({
          x: this.lastPoint.x + dx * t,
          y: this.lastPoint.y + dy * t,
          u: this.lastPoint.u + (point.u - this.lastPoint.u) * t,
          v: this.lastPoint.v + (point.v - this.lastPoint.v) * t
        });
      }

      if (this.pointsQueue.length > 1000) {
        this.pointsQueue.splice(0, this.pointsQueue.length - 1000);
      }

      this.lastPoint = point;
    }

    paintQueuedPoints() {
      if (!this.pointsQueue.length || !this.maskFront) {
        return false;
      }

      const prevTarget = this.renderer.getRenderTarget();
      const prevAutoClear = this.renderer.autoClear;

      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(this.maskFront);

      const diameterX = (2 * this.brushRadiusPx) / this.width;
      const diameterY = (2 * this.brushRadiusPx) / this.height;

      for (const point of this.pointsQueue) {
        this.brushMesh.position.set(point.u, point.v, 0);
        this.brushMesh.scale.set(diameterX, diameterY, 1);
        this.renderer.render(this.maskScene, this.camera);
      }

      this.pointsQueue.length = 0;
      this.renderer.setRenderTarget(prevTarget);
      this.renderer.autoClear = prevAutoClear;

      return true;
    }

    applyDecay(deltaSeconds) {
      if (!this.options.decay || !this.maskFront || !this.maskBack || this.options.decayRate <= 0) {
        return false;
      }

      this.decayMaterial.uniforms.uMask.value = this.maskFront.texture;
      this.decayMaterial.uniforms.uDelta.value = deltaSeconds;
      this.decayMaterial.uniforms.uDecayRate.value = this.options.decayRate;

      const prevTarget = this.renderer.getRenderTarget();
      const prevAutoClear = this.renderer.autoClear;

      this.renderer.autoClear = true;
      this.renderer.setRenderTarget(this.maskBack);
      this.renderer.clear(true, true, true);
      this.renderer.render(this.decayScene, this.camera);
      this.renderer.setRenderTarget(prevTarget);
      this.renderer.autoClear = prevAutoClear;

      const swap = this.maskFront;
      this.maskFront = this.maskBack;
      this.maskBack = swap;
      this.finalMaterial.uniforms.uMask.value = this.maskFront.texture;

      return true;
    }

    renderFinal() {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.mainScene, this.camera);
    }

    requestFrame() {
      if (!this.rafId && !this.disposed) {
        this.rafId = requestAnimationFrame(this.tick);
      }
    }

    tick() {
      this.rafId = null;

      if (this.disposed || !this.isVisible) {
        return;
      }

      if (!this.topTexture || !this.bottomTexture || !this.maskFront) {
        return;
      }

      const delta = Math.min(this.clock.getDelta(), 0.05);
      const now = performance.now();
      let changed = false;

      if (this.pointsQueue.length > 0) {
        changed = this.paintQueuedPoints() || changed;
      }

      if (this.options.decay) {
        const idleMs = now - this.lastPaintTime;
        const shouldDecay = idleMs > 20 && idleMs < this.decayTailMs;
        if (shouldDecay) {
          changed = this.applyDecay(delta) || changed;
        }
      }

      if (changed || this.needsRender) {
        // Draw the composed frame only when the scene changed.
        this.renderFinal();
        this.needsRender = false;
      }

      const shouldContinue =
        this.pointsQueue.length > 0 ||
        (this.options.decay && now - this.lastPaintTime < this.decayTailMs) ||
        this.needsRender;

      if (shouldContinue) {
        this.requestFrame();
      }
    }

    dispose() {
      this.disposed = true;

      this.container.removeEventListener("pointerenter", this.handlePointerEnter);
      this.container.removeEventListener("pointermove", this.handlePointerMove);
      this.container.removeEventListener("pointerleave", this.handlePointerLeave);

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }
      if (this.visibilityObserver) {
        this.visibilityObserver.disconnect();
      }

      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      if (this.maskFront) {
        this.maskFront.dispose();
      }
      if (this.maskBack) {
        this.maskBack.dispose();
      }
      if (this.topTexture) {
        this.topTexture.dispose();
      }
      if (this.bottomTexture) {
        this.bottomTexture.dispose();
      }

      if (this.finalMaterial) {
        this.finalMaterial.dispose();
      }
      if (this.brushMaterial) {
        this.brushMaterial.dispose();
      }
      if (this.decayMaterial) {
        this.decayMaterial.dispose();
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

    return {
      topImage,
      bottomImage,
      brushSize: clamp(parseNumber(dataset.brushSize, DEFAULTS.brushSize), 0.02, 0.35),
      brushSoftness: clamp(parseNumber(dataset.brushSoftness, DEFAULTS.brushSoftness), 0.05, 0.98),
      brushStrength: clamp(parseNumber(dataset.brushStrength, DEFAULTS.brushStrength), 0.1, 1),
      decay: parseBoolean(dataset.decay, DEFAULTS.decay),
      decayRate: clamp(parseNumber(dataset.decayRate, DEFAULTS.decayRate), 0, 2),
      maskScale: clamp(parseNumber(dataset.maskScale, DEFAULTS.maskScale), 0.25, 1),
      maxPixelRatio: DEFAULTS.maxPixelRatio
    };
  };

  const boot = async () => {
    const widgetNodes = document.querySelectorAll(".reveal-widget");
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

    if (!THREE) {
      try {
        THREE = await import("https://unpkg.com/three@0.160.1/build/three.module.js");
      } catch (error) {
        widgetNodes.forEach((node) => {
          const options = buildOptions(node);
          applyStaticWidgetFallback(node, options.topImage, "");
        });
        return;
      }
    }

    widgetNodes.forEach((node) => {
      const options = buildOptions(node);
      if (!hasWebGL) {
        applyStaticWidgetFallback(node, options.topImage, "");
        return;
      }

      // Expose instance for quick debugging/tuning from DevTools if needed.
      node.revealWidget = new MaskRevealWidget(node, options);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
