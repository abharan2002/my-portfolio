(() => {
  const root = document.documentElement;
  const commandToggle = document.querySelector(".command-toggle");
  const themeToggle = document.querySelector(".theme-toggle");
  const devOutput = document.getElementById("dev-ribbon-output");
  const devCommands = Array.from(document.querySelectorAll(".dev-command"));

  const constellationMount = document.getElementById("skill-constellation-canvas");
  const constellationTitle = document.getElementById("constellation-title");
  const constellationDescription = document.getElementById("constellation-description");
  const constellationLink = document.getElementById("constellation-link");

  if (!devCommands.length && !constellationMount) {
    return;
  }

  const THREE_MODULE_URL = "https://unpkg.com/three@0.160.1/build/three.module.js";
  const reducedMotionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let THREEInstance = null;
  let threeModulePromise = null;
  let threeLoadFailed = false;

  const TECH_STACK_NODES = [
    {
      title: "Java",
      description: "Primary backend language for high-throughput APIs, service orchestration, and production reliability.",
      href: "#experience",
      linkLabel: "See Java delivery impact",
      logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg",
      shortLabel: "Java",
      color: 0xf89820,
      position: [-2.15, 0.95, 0.2]
    },
    {
      title: "Spring Boot",
      description: "Framework backbone for modular service design, dependency injection, and maintainable API contracts.",
      href: "#expertise",
      linkLabel: "Review backend architecture",
      logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/spring/spring-original.svg",
      shortLabel: "Spring",
      color: 0x6db33f,
      position: [-1.05, 1.65, -0.22]
    },
    {
      title: "Apache Kafka",
      description: "Event-streaming layer for resilient message delivery, retries, and throughput-focused consumer pipelines.",
      href: "#experience",
      linkLabel: "Open event-driven outcomes",
      logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/apachekafka/apachekafka-original.svg",
      shortLabel: "Kafka",
      color: 0x44d3c4,
      position: [0.55, 1.55, 0.3]
    },
    {
      title: "Redis",
      description: "Caching and fast state coordination for low-latency reads, fan-out paths, and queue support.",
      href: "#experience",
      linkLabel: "Inspect realtime optimization",
      logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redis/redis-original.svg",
      shortLabel: "Redis",
      color: 0xdc382d,
      position: [1.95, 0.85, -0.2]
    },
    {
      title: "PostgreSQL",
      description: "Durable relational storage with schema discipline, query tuning, and reliable transactional behavior.",
      href: "#expertise",
      linkLabel: "View data-layer strengths",
      logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg",
      shortLabel: "Postgres",
      color: 0x336791,
      position: [2.15, -0.6, 0.1]
    },
    {
      title: "Docker",
      description: "Containerized runtime standards for reproducible builds, safer rollout, and predictable deployment parity.",
      href: "#expertise",
      linkLabel: "Check delivery tooling",
      logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/docker/docker-original.svg",
      shortLabel: "Docker",
      color: 0x2496ed,
      position: [0.95, -1.5, -0.15]
    },
    {
      title: "Kubernetes",
      description: "Cluster orchestration for scaling, workload isolation, and production-grade rollout controls.",
      href: "#expertise",
      linkLabel: "See infrastructure stack",
      logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kubernetes/kubernetes-plain.svg",
      shortLabel: "K8s",
      color: 0x326ce5,
      position: [-0.55, -1.72, 0.22]
    },
    {
      title: "AWS",
      description: "Cloud services used for storage, integration, and resilient production system operations.",
      href: "#experience",
      linkLabel: "Read cloud migration wins",
      logoUrl: "https://cdn.simpleicons.org/amazonwebservices/FF9900",
      shortLabel: "AWS",
      color: 0xff9900,
      position: [-2.0, -1.02, -0.18]
    },
    {
      title: "Google Cloud",
      description: "Target cloud platform for storage migration, performance improvements, and sustained operational scale.",
      href: "#experience",
      linkLabel: "See migration outcomes",
      logoUrl: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/googlecloud/googlecloud-original.svg",
      shortLabel: "GCP",
      color: 0x4285f4,
      position: [0.05, -0.05, 0.48]
    }
  ];

  const TECH_STACK_EDGES = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 0],
    [1, 8],
    [2, 8],
    [4, 8],
    [5, 8],
    [7, 8],
    [0, 8],
    [3, 5]
  ];

  const writeDevOutput = (message) => {
    if (devOutput) {
      devOutput.textContent = message;
    }
  };

  const isRecruiterMode = () => root.getAttribute("data-recruiter-mode") === "on";

  const isReducedMotion = () => Boolean(reducedMotionQuery && reducedMotionQuery.matches);

  const runDevCommand = (button) => {
    const action = button.dataset.devAction;
    const target = (button.dataset.devTarget || "").trim();
    const commandText = button.textContent.trim();

    if (action === "jump" && target.startsWith("#")) {
      const section = document.querySelector(target);
      if (section) {
        section.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
        history.replaceState(null, "", target);
        writeDevOutput(`Executed ${commandText} -> ${target.replace("#", "")} section.`);
      }
      return;
    }

    if (action === "external" && target) {
      window.open(target, "_blank", "noopener,noreferrer");
      writeDevOutput(`Executed ${commandText} -> opened external destination.`);
      return;
    }

    if (action === "palette") {
      if (commandToggle) {
        commandToggle.click();
        writeDevOutput(`Executed ${commandText} -> quick navigation opened.`);
      }
      return;
    }

    if (action === "theme") {
      if (themeToggle) {
        themeToggle.click();
        writeDevOutput(`Executed ${commandText} -> theme switched.`);
      }
    }
  };

  devCommands.forEach((button) => {
    button.addEventListener("click", () => runDevCommand(button));
  });

  const attachMediaQueryListener = (query, handler) => {
    if (!query) {
      return;
    }

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", handler);
    } else if (typeof query.addListener === "function") {
      query.addListener(handler);
    }
  };

  const setMountState = (mount, stateClass, message) => {
    mount.classList.remove("is-loading", "is-error");
    if (stateClass) {
      mount.classList.add(stateClass);
    }

    if (message) {
      mount.setAttribute("data-state-message", message);
    } else {
      mount.removeAttribute("data-state-message");
    }
  };

  const loadThree = async () => {
    if (THREEInstance) {
      return THREEInstance;
    }

    if (threeLoadFailed || window.location.protocol === "file:") {
      threeLoadFailed = true;
      return null;
    }

    if (!threeModulePromise) {
      threeModulePromise = import(THREE_MODULE_URL)
        .then((module) => {
          THREEInstance = module;
          return module;
        })
        .catch((error) => {
          console.error("Unable to load Three.js for immersive labs:", error);
          threeLoadFailed = true;
          return null;
        });
    }

    return threeModulePromise;
  };

  const disposeMaterial = (material) => {
    if (!material) {
      return;
    }

    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }

    [
      "map",
      "alphaMap",
      "emissiveMap",
      "roughnessMap",
      "metalnessMap",
      "normalMap",
      "aoMap",
      "bumpMap"
    ].forEach((key) => {
      if (material[key] && typeof material[key].dispose === "function") {
        material[key].dispose();
      }
    });

    material.dispose();
  };

  const disposeObject = (object) => {
    object.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        disposeMaterial(child.material);
      }
    });
  };

  class SkillConstellationLab {
    constructor({ THREE, mount, info }) {
      this.THREE = THREE;
      this.mount = mount;
      this.info = info;

      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.graph = null;
      this.clock = new THREE.Clock();
      this.rafId = null;
      this.running = false;

      this.nodeRecords = [];
      this.edgeRecords = [];
      this.hitTargets = [];
      this.raycaster = new THREE.Raycaster();
      this.pointer = new THREE.Vector2(3, 3);
      this.pointerInside = false;
      this.hoveredNodeIndex = -1;
      this.selectedNodeIndex = 0;
      this.scaleTarget = new THREE.Vector3();
      this.textureLoader = new THREE.TextureLoader();
      this.textureLoader.setCrossOrigin("anonymous");

      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerLeave = this.handlePointerLeave.bind(this);
      this.handlePointerClick = this.handlePointerClick.bind(this);
      this.tick = this.tick.bind(this);

      this.setupRenderer();
      this.setupScene();
      this.setupInteraction();
      this.setupResizeObserver();
      this.setSelectedNode(0);
      this.resize();
    }

    setupRenderer() {
      const { THREE } = this;
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
      });

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
      this.renderer.setClearColor(0x000000, 0);

      if ("outputColorSpace" in this.renderer) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      }

      this.mount.appendChild(this.renderer.domElement);
    }

    setupScene() {
      const { THREE } = this;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 28);
      this.camera.position.set(0, 0.1, 5.8);

      const ambient = new THREE.AmbientLight(0xffffff, 0.72);
      const key = new THREE.DirectionalLight(0x9fccff, 1.15);
      key.position.set(3, 4, 5);

      const fill = new THREE.DirectionalLight(0x4de1d8, 0.58);
      fill.position.set(-3.6, -1.8, 2.6);

      this.scene.add(ambient, key, fill);

      this.graph = new THREE.Group();
      this.scene.add(this.graph);

      TECH_STACK_NODES.forEach((node, index) => {
        const record = this.createNodeIcon(node, index);
        record.group.position.set(node.position[0], node.position[1], node.position[2]);
        record.basePosition.copy(record.group.position);
        this.graph.add(record.group);
        this.nodeRecords.push(record);
        this.hitTargets.push(record.hitMesh);
      });

      TECH_STACK_EDGES.forEach(([fromIndex, toIndex]) => {
        const from = TECH_STACK_NODES[fromIndex];
        const to = TECH_STACK_NODES[toIndex];
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(from.position[0], from.position[1], from.position[2]),
          new THREE.Vector3(to.position[0], to.position[1], to.position[2])
        ]);

        const material = new THREE.LineBasicMaterial({
          color: 0x4f6fae,
          transparent: true,
          opacity: 0.45
        });

        const line = new THREE.Line(geometry, material);
        this.graph.add(line);
        this.edgeRecords.push({ line, fromIndex, toIndex, material });
      });

      const starPositions = [];
      for (let index = 0; index < 220; index += 1) {
        const x = (Math.random() - 0.5) * 9;
        const y = (Math.random() - 0.5) * 6;
        const z = (Math.random() - 0.5) * 4;
        starPositions.push(x, y, z);
      }

      const starGeometry = new THREE.BufferGeometry();
      starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
      const starMaterial = new THREE.PointsMaterial({
        color: 0x7ea6e8,
        size: 0.03,
        transparent: true,
        opacity: 0.35
      });
      this.starField = new THREE.Points(starGeometry, starMaterial);
      this.scene.add(this.starField);
    }

    createNodeIcon(node, index) {
      const { THREE } = this;
      const group = new THREE.Group();
      const iconRoot = new THREE.Group();
      const materials = [];

      const fallbackTexture = this.createFallbackLogoTexture(node);
      const logoShadowMaterial = new THREE.SpriteMaterial({
        map: fallbackTexture,
        color: 0x02060f,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        depthTest: false,
        toneMapped: false
      });
      materials.push(logoShadowMaterial);
      const logoShadow = new THREE.Sprite(logoShadowMaterial);
      logoShadow.position.set(0.02, -0.06, -0.02);
      logoShadow.scale.set(0.66, 0.66, 1);
      iconRoot.add(logoShadow);

      const logoMaterial = new THREE.SpriteMaterial({
        map: fallbackTexture,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false
      });
      materials.push(logoMaterial);
      const logoSprite = new THREE.Sprite(logoMaterial);
      logoSprite.position.set(0, -0.04, 0);
      logoSprite.scale.set(0.66, 0.66, 1);
      iconRoot.add(logoSprite);

      if (node.logoUrl) {
        this.textureLoader.load(
          node.logoUrl,
          (texture) => {
            if ("colorSpace" in texture) {
              texture.colorSpace = THREE.SRGBColorSpace;
            }
            texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
            texture.needsUpdate = true;
            if (logoMaterial.map && logoMaterial.map !== texture) {
              logoMaterial.map.dispose();
            }
            logoMaterial.map = texture;
            logoShadowMaterial.map = texture;
            logoMaterial.needsUpdate = true;
            logoShadowMaterial.needsUpdate = true;
          },
          undefined,
          () => {}
        );
      }

      group.add(iconRoot);

      const hitMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const hitMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 14), hitMaterial);
      hitMesh.userData.nodeIndex = index;
      group.add(hitMesh);

      return {
        group,
        iconRoot,
        logoSprite,
        logoShadow,
        hitMesh,
        materials,
        basePosition: new THREE.Vector3(),
        floatOffset: Math.random() * Math.PI * 2
      };
    }

    createFallbackLogoTexture(node) {
      const { THREE } = this;
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        return texture;
      }

      context.clearRect(0, 0, size, size);
      const label = (node.shortLabel || node.title).slice(0, 8).toUpperCase();
      context.shadowColor = "rgba(0, 0, 0, 0.45)";
      context.shadowBlur = 16;
      context.shadowOffsetY = 4;
      context.fillStyle = "#ffffff";
      context.font = "700 72px IBM Plex Mono, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, size / 2, size / 2);

      const texture = new THREE.CanvasTexture(canvas);
      if ("colorSpace" in texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
      }
      texture.needsUpdate = true;
      return texture;
    }

    setupInteraction() {
      this.mount.addEventListener("pointermove", this.handlePointerMove, { passive: true });
      this.mount.addEventListener("pointerleave", this.handlePointerLeave, { passive: true });
      this.mount.addEventListener("click", this.handlePointerClick);
    }

    setupResizeObserver() {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(this.mount);
    }

    handlePointerMove(event) {
      const rect = this.mount.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      this.pointer.set(x, y);
      this.pointerInside = true;
    }

    handlePointerLeave() {
      this.pointerInside = false;
      this.pointer.set(3, 3);
      this.hoveredNodeIndex = -1;
    }

    handlePointerClick() {
      if (this.hoveredNodeIndex < 0) {
        return;
      }

      this.setSelectedNode(this.hoveredNodeIndex);
    }

    setSelectedNode(index) {
      if (index < 0 || index >= TECH_STACK_NODES.length) {
        return;
      }

      this.selectedNodeIndex = index;
      const node = TECH_STACK_NODES[index];

      if (this.info.title) {
        this.info.title.textContent = node.title;
      }

      if (this.info.description) {
        this.info.description.textContent = node.description;
      }

      if (this.info.link) {
        this.info.link.textContent = node.linkLabel;
        this.info.link.href = node.href;
        if (node.href.startsWith("http")) {
          this.info.link.target = "_blank";
          this.info.link.rel = "noopener noreferrer";
        } else {
          this.info.link.removeAttribute("target");
          this.info.link.removeAttribute("rel");
        }
      }
    }

    updateHoveredNode() {
      if (!this.pointerInside) {
        this.hoveredNodeIndex = -1;
        return;
      }

      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.hitTargets, false);
      this.hoveredNodeIndex = hits.length ? hits[0].object.userData.nodeIndex : -1;
      if (this.hoveredNodeIndex >= 0) {
        this.setSelectedNode(this.hoveredNodeIndex);
      }
    }

    resize() {
      const width = Math.max(1, Math.floor(this.mount.clientWidth));
      const height = Math.max(1, Math.floor(this.mount.clientHeight));
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
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
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;

      this.updateHoveredNode();

      const activeNodeIndex = this.hoveredNodeIndex >= 0 ? this.hoveredNodeIndex : this.selectedNodeIndex;
      this.nodeRecords.forEach((record, index) => {
        const isActive = index === activeNodeIndex;
        const isSelected = index === this.selectedNodeIndex;
        const targetScale = isActive ? 1.24 : isSelected ? 1.1 : 1;
        this.scaleTarget.set(targetScale, targetScale, targetScale);
        record.group.scale.lerp(this.scaleTarget, 0.16);

        const targetEmissive = isActive ? 0.98 : isSelected ? 0.75 : 0.48;
        record.materials.forEach((material) => {
          if (typeof material.emissiveIntensity === "number") {
            material.emissiveIntensity += (targetEmissive - material.emissiveIntensity) * 0.13;
          }
        });

        const driftX = Math.sin(elapsed * 0.8 + record.floatOffset) * 0.06;
        const driftY = Math.sin(elapsed * 1.5 + record.floatOffset) * 0.07;
        const driftZ = Math.cos(elapsed * 1.1 + record.floatOffset) * 0.12;
        record.group.position.x = record.basePosition.x + driftX;
        record.group.position.y = record.basePosition.y + driftY;
        record.group.position.z = record.basePosition.z + driftZ;

        if (record.logoShadow) {
          const shadowScale = isActive ? 0.7 : isSelected ? 0.67 : 0.64;
          record.logoShadow.scale.x += (shadowScale - record.logoShadow.scale.x) * 0.2;
          record.logoShadow.scale.y += (shadowScale - record.logoShadow.scale.y) * 0.2;
        }
      });

      this.edgeRecords.forEach((edge) => {
        const related = edge.fromIndex === activeNodeIndex || edge.toIndex === activeNodeIndex;
        edge.material.opacity += ((related ? 0.86 : 0.34) - edge.material.opacity) * 0.14;
      });

      this.graph.rotation.y = Math.sin(elapsed * 0.22) * 0.09;
      this.graph.rotation.x = Math.sin(elapsed * 0.14) * 0.05;
      this.starField.rotation.y -= delta * 0.02;
      this.renderer.render(this.scene, this.camera);
    }

    dispose() {
      this.setRunning(false);

      this.mount.removeEventListener("pointermove", this.handlePointerMove);
      this.mount.removeEventListener("pointerleave", this.handlePointerLeave);
      this.mount.removeEventListener("click", this.handlePointerClick);

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
      }

      if (this.graph) {
        disposeObject(this.graph);
      }
      if (this.starField) {
        disposeObject(this.starField);
      }

      if (this.renderer) {
        this.renderer.dispose();
        this.mount.innerHTML = "";
      }
    }
  }

  const labs = [
    {
      key: "constellation",
      mount: constellationMount,
      visible: false,
      loading: false,
      instance: null
    }
  ].filter((entry) => Boolean(entry.mount));

  if (!labs.length) {
    return;
  }

  const labsAllowed = () => !isRecruiterMode() && !isReducedMotion();

  const isLabInViewport = (mount) => {
    if (!mount) {
      return false;
    }

    const rect = mount.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const topBoundary = viewportHeight * 1.02;
    const bottomBoundary = -viewportHeight * 0.1;
    return rect.top < topBoundary && rect.bottom > bottomBoundary;
  };

  const disposeLab = (lab) => {
    if (lab.instance) {
      lab.instance.dispose();
      lab.instance = null;
    }

    lab.loading = false;
    if (lab.mount) {
      lab.mount.classList.remove("is-loading", "is-error");
      lab.mount.removeAttribute("data-state-message");
    }
  };

  const bootLab = async (lab) => {
    if (lab.instance || lab.loading || !lab.mount || !lab.visible || !labsAllowed()) {
      return;
    }

    lab.loading = true;
    setMountState(lab.mount, "is-loading", "Loading interactive lab...");
    const THREE = await loadThree();
    if (!THREE) {
      setMountState(
        lab.mount,
        "is-error",
        window.location.protocol === "file:"
          ? "Run this page with a local server to enable Three.js labs."
          : "Unable to load interactive lab."
      );
      lab.loading = false;
      return;
    }

    if (!lab.visible || !labsAllowed()) {
      setMountState(lab.mount, "", "");
      lab.loading = false;
      return;
    }

    try {
      lab.instance = new SkillConstellationLab({
        THREE,
        mount: lab.mount,
        info: {
          title: constellationTitle,
          description: constellationDescription,
          link: constellationLink
        }
      });

      setMountState(lab.mount, "", "");
      if (!document.hidden && labsAllowed()) {
        lab.instance.setRunning(true);
      }
    } catch (error) {
      console.error(`Failed to initialize ${lab.key} lab:`, error);
      setMountState(lab.mount, "is-error", "Interactive lab failed to initialize.");
    } finally {
      lab.loading = false;
    }
  };

  const syncLabs = () => {
    const modeAllowsLabs = labsAllowed();
    const shouldAnimate = modeAllowsLabs && !document.hidden;

    if (!modeAllowsLabs) {
      labs.forEach(disposeLab);
      return;
    }

    labs.forEach((lab) => {
      lab.visible = isLabInViewport(lab.mount);

      if (lab.visible) {
        if (lab.instance) {
          lab.instance.setRunning(shouldAnimate);
        } else {
          bootLab(lab);
        }
      } else if (lab.instance) {
        lab.instance.setRunning(false);
      }
    });
  };

  const labVisibilityObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const lab = labs.find((item) => item.mount === entry.target);
        if (!lab) {
          return;
        }

        lab.visible = entry.isIntersecting;
      });
      syncLabs();
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -14% 0px"
    }
  );

  labs.forEach((lab) => {
    labVisibilityObserver.observe(lab.mount);
  });

  let syncQueued = false;
  const queueLabSync = () => {
    if (syncQueued) {
      return;
    }

    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncLabs();
    });
  };

  document.addEventListener("visibilitychange", queueLabSync);
  window.addEventListener("scroll", queueLabSync, { passive: true });
  window.addEventListener("resize", queueLabSync);
  document.addEventListener("portfolio:recruiter-mode-change", () => {
    if (isRecruiterMode()) {
      writeDevOutput("Recruiter mode active. Interactive labs are paused.");
    } else {
      writeDevOutput("Non-recruiter mode active. Interactive engineering labs are live.");
    }
    queueLabSync();
  });
  attachMediaQueryListener(reducedMotionQuery, queueLabSync);

  queueLabSync();
})();
