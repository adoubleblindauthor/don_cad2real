import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

// ============================================================
// Lightbox
// ============================================================

function initializeLightbox() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightbox-img");

  if (!lightbox || !lightboxImage) return;

  document.querySelectorAll(".clickable").forEach((image) => {
    image.addEventListener("click", () => {
      lightboxImage.src = image.src;
      lightboxImage.alt = image.alt || "Enlarged figure";
      lightbox.classList.add("open");
      lightbox.setAttribute("aria-hidden", "false");
    });
  });

  const closeLightbox = () => {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImage.src = "";
  };

  lightbox.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
  });
}

// ============================================================
// Carousels
// ============================================================

const carouselState = new WeakMap();

function getCarouselIndex(wrapper, totalItems) {
  if (!carouselState.has(wrapper)) {
    carouselState.set(wrapper, Math.min(1, Math.max(0, totalItems - 1)));
  }
  return carouselState.get(wrapper);
}

function updateCarousel(wrapper) {
  const carousel = wrapper.querySelector(".carousel");
  if (!carousel) return;

  const items = carousel.querySelectorAll(".carousel-item");
  if (!items.length) return;

  const currentIndex = getCarouselIndex(wrapper, items.length);

  items.forEach((item, index) => {
    item.classList.toggle("active", index === currentIndex);
  });

  const itemWidth = items[0].getBoundingClientRect().width;
  const style = window.getComputedStyle(carousel);
  const gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 0;
  const offset =
    wrapper.clientWidth / 2 -
    itemWidth / 2 -
    currentIndex * (itemWidth + gap);

  carousel.style.transform = `translateX(${offset}px)`;
}

function moveCarousel(wrapper, direction) {
  const items = wrapper.querySelectorAll(".carousel-item");
  if (!items.length) return;

  let index = getCarouselIndex(wrapper, items.length) + direction;
  index = (index + items.length) % items.length;
  carouselState.set(wrapper, index);
  updateCarousel(wrapper);
}

function initializeCarousels() {
  const wrappers = document.querySelectorAll(".carousel-wrapper");

  wrappers.forEach((wrapper) => {
    wrapper.querySelectorAll("[data-carousel-direction]").forEach((button) => {
      button.addEventListener("click", () => {
        moveCarousel(wrapper, Number(button.dataset.carouselDirection));
      });
    });

    updateCarousel(wrapper);
  });

  window.addEventListener("resize", () => {
    wrappers.forEach(updateCarousel);
  });
}

// ============================================================
// 3D viewer configuration
// ============================================================

const viewerConfigs = {
  gear: {
    elementId: "viewer-gear",
    mesh: "./static/meshes/gear_casing_minkowski.stl",
  },
  mirror: {
    elementId: "viewer-mirror",
    mesh: "./static/meshes/rear_mirror_mold_minkowski.stl",
  },
  jig: {
    elementId: "viewer-jig",
    mesh: "./static/meshes/jig_minkowski.stl",
  },
};

const trajectoryFiles = {
  circle: {
    gear: "./static/trajectories/gear_casing_minkowski_circle.txt",
    mirror: "./static/trajectories/rear_mirror_mold_minkowski_circle.txt",
    jig: "./static/trajectories/jig_minkowski_circle.txt",
  },
  square: {
    gear: "./static/trajectories/gear_casing_minkowski_square.txt",
    mirror: "./static/trajectories/rear_mirror_mold_minkowski_square.txt",
    jig: "./static/trajectories/jig_minkowski_square.txt",
  },
  sinusoid: {
    gear: "./static/trajectories/gear_casing_minkowski_sinusoid.txt",
    mirror: "./static/trajectories/rear_mirror_mold_minkowski_sinusoid.txt",
    jig: "./static/trajectories/jig_minkowski_sinusoid.txt",
  },
};

const viewers = {};

// ============================================================
// Mesh + trajectory viewer
// ============================================================

class MeshTrajectoryViewer {
  constructor(elementId, meshPath) {
    this.container = document.getElementById(elementId);
    if (!this.container) {
      throw new Error(`Viewer container not found: ${elementId}`);
    }

    this.mesh = null;
    this.trajectoryObject = null;
    this.meshCenter = new THREE.Vector3();
    this.meshSize = 1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f5);

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.001, 10000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    this.addLights();
    this.showMessage("Loading mesh...");
    this.loadMesh(meshPath);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);

    this.animate();
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 1.8));

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 1, 2);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 1.2);
    fill.position.set(-1, -0.5, 1);
    this.scene.add(fill);
  }

  showMessage(text, isError = false) {
    this.clearMessage();
    const message = document.createElement("div");
    message.className = `mesh-viewer-message${isError ? " error" : ""}`;
    message.textContent = text;
    this.container.appendChild(message);
    this.messageElement = message;
  }

  clearMessage() {
    if (this.messageElement) {
      this.messageElement.remove();
      this.messageElement = null;
    }
  }

  loadMesh(meshPath) {
    const loader = new STLLoader();

    loader.load(
      meshPath,
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        if (!geometry.boundingBox || geometry.attributes.position.count === 0) {
          this.showMessage("Mesh is empty or invalid.", true);
          return;
        }

        const material = new THREE.MeshStandardMaterial({
          color: 0xb8b8b8,
          roughness: 0.7,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        this.fitCameraToMesh();
        this.clearMessage();
      },
      undefined,
      (error) => {
        console.error(`Failed to load mesh: ${meshPath}`, error);
        this.showMessage(`Failed to load mesh: ${meshPath}`, true);
      }
    );
  }

  fitCameraToMesh() {
    if (!this.mesh) return;

    const box = new THREE.Box3().setFromObject(this.mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);

    if (!Number.isFinite(maxSize) || maxSize <= 0) {
      this.showMessage("Mesh has invalid dimensions.", true);
      return;
    }

    this.meshCenter.copy(center);
    this.meshSize = maxSize;

    const fovRadians = THREE.MathUtils.degToRad(this.camera.fov);
    const fitHeightDistance = maxSize / (2 * Math.tan(fovRadians / 2));
    const fitWidthDistance = fitHeightDistance / Math.max(this.camera.aspect, 0.1);
    const distance = 1.45 * Math.max(fitHeightDistance, fitWidthDistance);

    const direction = new THREE.Vector3(1, -1, 0.8).normalize();
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.near = Math.max(distance / 1000, maxSize / 10000, 0.000001);
    this.camera.far = Math.max(distance * 100, maxSize * 100);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.minDistance = maxSize * 0.1;
    this.controls.maxDistance = maxSize * 20;
    this.controls.update();
  }

  async loadTrajectory(path) {
    this.removeTrajectory();

    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      const points = [];

      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const values = trimmed.split(/[,\s]+/).map(Number);
        if (values.length >= 3 && values.slice(0, 3).every(Number.isFinite)) {
          points.push(new THREE.Vector3(values[0], values[1], values[2]));
        }
      }

      if (points.length < 2) {
        throw new Error("Trajectory must contain at least two valid XYZ points.");
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0xe11d48 });
      this.trajectoryObject = new THREE.Line(geometry, material);
      this.scene.add(this.trajectoryObject);
    } catch (error) {
      console.error(`Failed to load trajectory ${path}:`, error);
    }
  }

  removeTrajectory() {
    if (!this.trajectoryObject) return;

    this.scene.remove(this.trajectoryObject);
    this.trajectoryObject.geometry.dispose();
    this.trajectoryObject.material.dispose();
    this.trajectoryObject = null;
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// ============================================================
// Trajectory switching
// ============================================================

async function loadTrajectorySet(name) {
  const files = trajectoryFiles[name];
  if (!files) return;

  await Promise.all(
    Object.entries(files).map(([viewerName, path]) => {
      const viewer = viewers[viewerName];
      return viewer ? viewer.loadTrajectory(path) : Promise.resolve();
    })
  );
}

async function initializeMeshViewers() {
  const configs = Object.entries(viewerConfigs);

  for (const [name, config] of configs) {
    const element = document.getElementById(config.elementId);
    if (!element) {
      console.error(`Missing viewer element #${config.elementId}`);
      continue;
    }

    try {
      viewers[name] = new MeshTrajectoryViewer(config.elementId, config.mesh);
    } catch (error) {
      console.error(`Failed to initialize viewer ${name}:`, error);
    }
  }

  const buttons = document.querySelectorAll(".trajectory-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      buttons.forEach((other) => other.classList.remove("active"));
      button.classList.add("active");
      await loadTrajectorySet(button.dataset.trajectory);
    });
  });

  await loadTrajectorySet("circle");
}

// ============================================================
// Application initialization
// ============================================================

function initializeApplication() {
  initializeLightbox();
  initializeCarousels();
  initializeMeshViewers();
}

document.addEventListener("DOMContentLoaded", initializeApplication);