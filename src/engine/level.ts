import * as THREE from "three";
import { CollisionSystem, Wall } from "./collision";

import { ILevel, IRoom, ITexture } from "../types/level";
import level1 from "../maps/map.json";

export class Level {
  public objects: THREE.Object3D[] = [];
  public collisionSystem: CollisionSystem;
  private textureLoader: THREE.TextureLoader;
  private wallTextures: Map<string, THREE.Texture>;
  private floorTextures: Map<string, THREE.Texture>;
  private levelMap: ILevel;
  private spawnPoint;

  constructor() {
    this.collisionSystem = new CollisionSystem();
    this.textureLoader = new THREE.TextureLoader();
    this.wallTextures = new Map();
    this.floorTextures = new Map();
    this.levelMap = level1;

    this.spawnPoint = this.levelMap.spawnPoint;

    this.loadTextures(this.levelMap.textures);
    this.createLevel(this.levelMap.rooms);
  }

  private loadTextures(textures: ITexture[]): void {
    // Load wall textures

    textures.forEach((texture: ITexture) => {
      const textureObject = this.textureLoader.load(texture.path);
      textureObject.wrapS = textureObject.wrapT = THREE.RepeatWrapping;

      switch (texture.type) {
        case "wall":
          // Make the texture repeat (important for DOOM-like aesthetics)
          textureObject.repeat.set(7, 4); // Adjust repeating as needed

          // Enable mipmapping for better quality at distance
          textureObject.minFilter = THREE.LinearMipmapLinearFilter;
          textureObject.magFilter = THREE.LinearFilter;

          this.wallTextures.set(texture.name, textureObject);
          break;
        case "floor":
          textureObject.repeat.set(25, 25); // Adjust repeating as needed
          this.floorTextures.set(texture.name, textureObject);
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
    const wallGeometry = new THREE.BoxGeometry(width, height, depth);

    // Get texture for this wall
    const texture = this.wallTextures.get(textureKey);

    const wallMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.7,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });

    const wall = new THREE.Mesh(wallGeometry, wallMaterial);

    wall.position.set(x, y + 1.5, z); // Adjust height to sit on floor
    wall.rotation.y = rotation;

    this.objects.push(wall);

    // Add the wall to the collision system with its normal
    const collidableWall = new Wall(wall);
    this.collisionSystem.addCollidable(collidableWall, normal);
  }
}
