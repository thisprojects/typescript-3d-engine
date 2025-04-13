import * as THREE from "three";

export class Renderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  constructor(container: HTMLElement) {
    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Set up camera with improved settings to prevent texture glitching
    this.camera = new THREE.PerspectiveCamera(
      75, // Reduced FOV from 90 to 75 - very important for reducing distortion
      window.innerWidth / window.innerHeight,
      0.1, // Increased near plane (from 0.5 to 0.1) to reduce z-fighting
      100 // Reduced far plane for better depth precision
    );

    // Initialize renderer with specific settings to fix texture issues
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true, // This helps with z-fighting/flickering
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(1); // Force pixel ratio to 1 to prevent scaling issues

    container.appendChild(this.renderer.domElement);

    // Handle window resize
    window.addEventListener("resize", this.onWindowResize.bind(this));
  }

  public addObject(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  public removeObject(object: THREE.Object3D): void {
    this.scene.remove(object);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public createConsistentTexture(path: string): THREE.Texture {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(path);

    // Configure texture to prevent glitching
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; // This is crucial - disable mipmaps

    return texture;
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Add getters for camera and scene
  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  public getScene(): THREE.Scene {
    return this.scene;
  }
}
