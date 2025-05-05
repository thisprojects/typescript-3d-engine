import * as THREE from "three";
import { CollisionSystem, Wall } from "./collision";

import { ILevel, IRoom, ITexture, IStep } from "../types/level";
import level1 from "../maps/map.json";
import { EnemySpawnPoint } from "./enemyManager";
import { EnemyType } from "./enemy";

export class Level {
  public objects: THREE.Object3D[] = [];
  public collisionSystem: CollisionSystem;
  private textureLoader: THREE.TextureLoader;
  private wallTextures: Map<string, THREE.Texture>;
  private floorTextures: Map<string, THREE.Texture>;
  private stepTextures: Map<string, THREE.Texture>; // New texture map for steps
  private levelMap: ILevel;
  private spawnPoint;
  public enemySpawnPoints: EnemySpawnPoint[] = [];

  constructor() {
    // Pass the scene to the collision system for debug visualization
    this.collisionSystem =
      new CollisionSystem(/* Uncomment for debug mode: this.scene */);
    this.textureLoader = new THREE.TextureLoader();
    this.wallTextures = new Map();
    this.floorTextures = new Map();
    this.stepTextures = new Map(); // Initialize the step textures map
    this.levelMap = level1;

    this.spawnPoint = this.levelMap.spawnPoint;

    this.loadTextures(this.levelMap.textures);
    this.createLevel(this.levelMap.rooms);
    this.createEnemySpawnPoints(this.levelMap.enemies || []);
  }

  private createEnemySpawnPoints(enemyData: any[]): void {
    if (!enemyData || !Array.isArray(enemyData)) return;

    enemyData.forEach((enemy) => {
      const position = new THREE.Vector3(enemy.x, enemy.y, enemy.z);

      // Convert string type to enum
      let enemyType = EnemyType.IMP;
      switch (enemy.type?.toLowerCase()) {
        case "zombie":
          enemyType = EnemyType.ZOMBIE;
          break;
        case "demon":
          enemyType = EnemyType.DEMON;
          break;
        default:
          enemyType = EnemyType.IMP;
      }

      this.enemySpawnPoints.push({
        position,
        type: enemyType,
      });
    });
  }

  // Update loadTextures method to handle step textures
  private loadTextures(textures: ITexture[]): void {
    textures.forEach((texture: ITexture) => {
      const textureObject = this.textureLoader.load(texture.path);

      // Fix #1: Remove automatic texture repeating which can cause glitches
      // Set explicit repeating settings
      textureObject.wrapS = THREE.ClampToEdgeWrapping;
      textureObject.wrapT = THREE.ClampToEdgeWrapping;

      switch (texture.type) {
        case "wall":
          // Fix #2: CRUCIAL - Use different filtering for textures
          // LinearFilter for both prevents mipmap thrashing
          textureObject.minFilter = THREE.LinearFilter;
          textureObject.magFilter = THREE.LinearFilter;

          // Fix #3: Only set repeating if absolutely necessary and use integer values

          textureObject.wrapS = textureObject.wrapT = THREE.RepeatWrapping;
          textureObject.repeat.set(10, 1); // Try with 1 first, then adjust if needed

          this.wallTextures.set(texture.name, textureObject);
          break;

        case "floor":
          // Same improvements for floor textures
          textureObject.minFilter = THREE.LinearFilter;
          textureObject.magFilter = THREE.LinearFilter;

          textureObject.wrapS = textureObject.wrapT = THREE.RepeatWrapping;
          textureObject.repeat.set(25, 25);

          this.floorTextures.set(texture.name, textureObject);
          break;

        case "step":
          // Configure step textures similarly to floor textures
          textureObject.minFilter = THREE.LinearFilter;
          textureObject.magFilter = THREE.LinearFilter;

          textureObject.wrapS = textureObject.wrapT = THREE.RepeatWrapping;
          textureObject.repeat.set(5, 1); // Smaller repeat for steps

          this.stepTextures.set(texture.name, textureObject);
          break;

        case "block":
          // Configure step textures similarly to floor textures
          textureObject.minFilter = THREE.LinearFilter;
          textureObject.magFilter = THREE.LinearFilter;

          textureObject.wrapS = textureObject.wrapT = THREE.RepeatWrapping;
          textureObject.repeat.set(5, 1); // Smaller repeat for steps

          this.stepTextures.set(texture.name, textureObject);
          break;

        default:
          console.error("Unknown texture type");
      }
    });
  }

  public getSpawnPoint() {
    return this.spawnPoint; // Default to first spawn point
  }

  private createLevel(rooms: IRoom[]): void {
    rooms.forEach((room) => {
      room.walls.forEach((wall) => {
        this.createWall(
          wall.x,
          wall.y,
          wall.z,
          wall.width,
          wall.height,
          wall.depth,
          wall.rotation,
          wall.texture,
          new THREE.Vector3(wall.normal.x, wall.normal.y, wall.normal.z)
        );
      });

      room.floors.forEach((floor) => {
        this.createFloor(
          floor.width,
          floor.length,
          floor.texture,
          floor.rotation,
          floor.y,
          floor.z,
          floor.x
        );
      });

      // Add step creation
      if (room.steps) {
        room.steps.forEach((step) => {
          this.createStep(
            step.x,
            step.y,
            step.z,
            step.width,
            step.depth,
            step.height,
            step.rotation,
            step.texture,
            new THREE.Vector3(step.normal.x, step.normal.y, step.normal.z)
          );
        });
      }

      if (room.blocks) {
        room.blocks.forEach((block) => {
          this.createStep(
            block.x,
            block.y,
            block.z,
            block.width,
            block.depth,
            block.height,
            block.rotation,
            block.texture,
            new THREE.Vector3(0, 0, 0)
          );
        });
      }
    });

    // Add light
    const light = new THREE.AmbientLight(0xffffff, 0.5);
    this.objects.push(light);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(0, 10, 0);
    this.objects.push(directionalLight);
  }

  private createFloor(
    width: number,
    length: number,
    texture: string,
    rotation: number,
    y: number,
    z: number,
    x: number
  ): void {
    const floorGeometry = new THREE.PlaneGeometry(width, length);

    const floorMaterial = new THREE.MeshStandardMaterial({
      map: this.floorTextures.get(texture),
      roughness: 0.8,
    });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = rotation;
    floor.position.x = x;
    floor.position.y = y;
    floor.position.z = z;

    this.objects.push(floor);
  }

  // New method to create steps
  private createStep(
    x: number,
    y: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    rotation: number,
    textureKey: string,
    normal: THREE.Vector3
  ): void {
    // Create a box geometry for the step
    const stepGeometry = new THREE.BoxGeometry(width, height, depth);

    // Get texture for this step or fallback to floor texture
    const texture =
      this.stepTextures.get(textureKey) || this.floorTextures.get("floor");

    // Create material for the step
    const stepMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
    });

    // Create the step mesh
    const step = new THREE.Mesh(stepGeometry, stepMaterial);

    // Position the step
    // For a step, we position its bottom at y and center at x/z
    step.position.set(x, y + height / 2, z);
    step.rotation.y = rotation;

    // Add the step to scene objects
    this.objects.push(step);

    // Add the step to the collision system with its normal
    const collidableStep = new Wall(step);

    // Add top surface normal for collision (important for player to stand on it)
    this.collisionSystem.addCollidable(collidableStep, normal);
  }

  private createWall(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    rotation: number,
    textureKey: string,
    normal: THREE.Vector3
  ): void {
    // Fix #4: Use PlaneGeometry instead of BoxGeometry for walls when possible
    // This prevents texture coordinate issues on the sides
    let wallGeometry;
    let isThinWall = false;

    if (depth < 0.1) {
      // For very thin walls, use PlaneGeometry instead
      wallGeometry = new THREE.PlaneGeometry(width, height);
      isThinWall = true;
    } else {
      wallGeometry = new THREE.BoxGeometry(width, height, depth);
    }

    // Get texture for this wall
    const texture = this.wallTextures.get(textureKey);

    // Fix #5: Use MeshBasicMaterial instead of MeshStandardMaterial for simpler rendering
    // This eliminates potential lighting-related glitches
    const wallMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });

    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(x, y + 1.5, z);
    wall.rotation.y = rotation;

    this.objects.push(wall);

    // Add the wall to the collision system with its normal
    const collidableWall = new Wall(wall);
    this.collisionSystem.addCollidable(collidableWall, normal);
  }
}
