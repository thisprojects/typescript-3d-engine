import * as THREE from "three";
import { OrientedBoundingBox } from "./orientedBoundingBox";

export interface Collidable {
  mesh: THREE.Mesh;
  getBoundingBox(): THREE.Box3;
  getOrientedBoundingBox(): OrientedBoundingBox;
}

export class Wall implements Collidable {
  public mesh: THREE.Mesh;
  private obb: OrientedBoundingBox;

  constructor(mesh: THREE.Mesh) {
    this.mesh = mesh;
    // Create an OBB for this wall
    this.obb = OrientedBoundingBox.fromMesh(mesh);
  }

  public getBoundingBox(): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.mesh);
  }

  public getOrientedBoundingBox(): OrientedBoundingBox {
    // Update the OBB in case the mesh has moved/rotated
    this.obb.update(this.mesh);
    return this.obb;
  }
}

export class CollisionSystem {
  private collidables: Collidable[] = [];
  private wallNormals: Map<Collidable, THREE.Vector3> = new Map();
  private debugMode: boolean = false;
  private debugMeshes: THREE.Object3D[] = [];
  private scene: THREE.Scene | null = null;

  constructor(scene?: THREE.Scene) {
    if (scene) {
      this.scene = scene;
      this.debugMode = true;
    }
  }

  public addCollidable(collidable: Collidable, normal?: THREE.Vector3): void {
    this.collidables.push(collidable);

    // Store wall normal if provided
    if (normal) {
      this.wallNormals.set(collidable, normal);
    }

    // Add debug visualization if in debug mode
    if (this.debugMode && this.scene) {
      const debugMesh = collidable.getOrientedBoundingBox().createDebugMesh();
      this.debugMeshes.push(debugMesh);
      this.scene.add(debugMesh);
    }
  }

  public checkCollision(
    position: THREE.Vector3,
    radius: number = 0.5,
    ignoreObject?: Collidable
  ): boolean {
    // Create a bounding sphere for the player/entity
    const boundingSphere = new THREE.Sphere(position, radius);

    // Check for collisions with all collidable objects
    for (const collidable of this.collidables) {
      // Skip if this is the object we're checking for (self-collision prevention)
      if (ignoreObject && collidable === ignoreObject) {
        continue;
      }

      // Get the oriented bounding box for this collidable
      const obb = collidable.getOrientedBoundingBox();

      // Check if the sphere intersects with the OBB
      if (obb.intersectsSphere(boundingSphere)) {
        return true; // Collision detected
      }
    }

    return false; // No collision
  }

  public getCollisionInfo(
    position: THREE.Vector3,
    radius: number = 0.5,
    ignoreObject?: Collidable
  ): {
    collision: boolean;
    penetration: THREE.Vector3 | null;
    collidable: Collidable | null;
  } {
    // Create a bounding sphere for the player/entity
    const boundingSphere = new THREE.Sphere(position, radius);
    const result = {
      collision: false,
      penetration: null as THREE.Vector3 | null,
      collidable: null as Collidable | null,
    };

    // Track the minimum penetration depth to find the most significant collision
    let minPenetrationDepth = Infinity;

    // Check for collisions with all collidable objects
    for (const collidable of this.collidables) {
      // Skip if this is the object we're checking for (self-collision prevention)
      if (ignoreObject && collidable === ignoreObject) {
        continue;
      }

      // Get the oriented bounding box for this collidable
      const obb = collidable.getOrientedBoundingBox();

      // Get detailed collision info
      const collisionInfo = obb.sphereCollisionInfo(boundingSphere);

      if (collisionInfo.collision && collisionInfo.penetration) {
        result.collision = true;

        // Calculate the penetration depth
        const penetrationDepth = collisionInfo.penetration.length();

        // If this is the deepest penetration so far, use it
        if (penetrationDepth < minPenetrationDepth) {
          minPenetrationDepth = penetrationDepth;
          result.penetration = collisionInfo.penetration;
          result.collidable = collidable;
        }
      }
    }

    return result;
  }

  public checkGroundCollision(
    position: THREE.Vector3,
    radius: number = 0.5,
    height: number = 3.0,
    ignoreObject?: Collidable
  ): {
    collision: boolean;
    groundY: number | null;
    normal: THREE.Vector3 | null;
    collidable: Collidable | null;
  } {
    const result = {
      collision: false,
      groundY: null as number | null,
      normal: null as THREE.Vector3 | null,
      collidable: null as Collidable | null,
    };

    // Cast a ray downward from position
    const rayStart = position.clone();
    const rayEnd = position.clone();
    rayEnd.y -= height; // Cast down by the player height

    // Check each collidable for intersection
    for (const collidable of this.collidables) {
      // Skip self-collision if needed
      if (ignoreObject && collidable === ignoreObject) {
        continue;
      }

      // Get the OBB for this collidable
      const obb = collidable.getOrientedBoundingBox();

      // Create a sphere at the current ray position for collision checks
      const testSphere = new THREE.Sphere(rayStart.clone(), radius);

      // Test multiple points along the ray by moving the sphere down
      const steps = 10; // Number of test points along the ray
      const stepSize = height / steps;

      for (let i = 0; i <= steps; i++) {
        // Position the test sphere at this step along the ray
        testSphere.center
          .copy(rayStart)
          .sub(new THREE.Vector3(0, i * stepSize, 0));

        // Check for collision at this point
        const collisionInfo = obb.sphereCollisionInfo(testSphere);

        if (collisionInfo.collision && collisionInfo.penetration) {
          result.collision = true;
          result.groundY = testSphere.center.y + testSphere.radius;
          result.normal = collisionInfo.penetration.clone().normalize();
          result.collidable = collidable;

          // If this is a wall (not a floor), we might want to ignore it
          // Check if the normal is pointing mostly upward
          if (result.normal && result.normal.y > 0.7) {
            // This is likely a floor, not a wall - exit early
            return result;
          }

          // If it's a wall (normal is horizontal), continue checking
          // as there might be a floor below
        }
      }
    }

    return result;
  }

  // Update debug visualizations
  public updateDebugVisualizations(): void {
    if (!this.debugMode) return;

    // Remove old debug meshes
    this.debugMeshes.forEach((mesh) => {
      if (this.scene) this.scene.remove(mesh);
    });
    this.debugMeshes = [];

    // Add new debug meshes
    this.collidables.forEach((collidable) => {
      const debugMesh = collidable.getOrientedBoundingBox().createDebugMesh();
      this.debugMeshes.push(debugMesh);
      if (this.scene) this.scene.add(debugMesh);
    });
  }

  // Toggle debug mode
  public setDebugMode(enabled: boolean, scene?: THREE.Scene): void {
    this.debugMode = enabled;
    if (enabled && scene) {
      this.scene = scene;
      this.updateDebugVisualizations();
    } else if (!enabled) {
      // Remove all debug meshes
      this.debugMeshes.forEach((mesh) => {
        if (this.scene) this.scene.remove(mesh);
      });
      this.debugMeshes = [];
    }
  }
}
