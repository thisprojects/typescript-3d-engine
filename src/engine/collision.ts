import * as THREE from "three";

export interface Collidable {
  mesh: THREE.Mesh;
  getBoundingBox(): THREE.Box3;
}

export class Wall implements Collidable {
  public mesh: THREE.Mesh;

  constructor(mesh: THREE.Mesh) {
    this.mesh = mesh;
  }

  public getBoundingBox(): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.mesh);
  }
}

export class CollisionSystem {
  private collidables: Collidable[] = [];
  private wallNormals: Map<Collidable, THREE.Vector3> = new Map();

  constructor() {}

  public addCollidable(collidable: Collidable, normal?: THREE.Vector3): void {
    this.collidables.push(collidable);

    // Store wall normal if provided
    if (normal) {
      this.wallNormals.set(collidable, normal);
    }
  }

  public checkCollision(
    position: THREE.Vector3,
    radius: number = 0.5
  ): boolean {
    // Create a bounding sphere for the player
    const playerBoundingSphere = new THREE.Sphere(position, radius);

    // Check for collisions with all collidable objects
    for (const collidable of this.collidables) {
      const objectBoundingBox = collidable.getBoundingBox();

      // Check if the sphere intersects with the box
      if (this.sphereIntersectsBox(playerBoundingSphere, objectBoundingBox)) {
        return true; // Collision detected
      }
    }

    return false; // No collision
  }

  public getCollisionInfo(
    position: THREE.Vector3,
    radius: number = 0.5
  ): {
    collision: boolean;
    penetration: THREE.Vector3 | null;
    collidable: Collidable | null;
  } {
    // Create a bounding sphere for the player
    const playerBoundingSphere = new THREE.Sphere(position, radius);
    const result = {
      collision: false,
      penetration: null as THREE.Vector3 | null,
      collidable: null as Collidable | null,
    };

    // Check for collisions with all collidable objects
    for (const collidable of this.collidables) {
      const objectBoundingBox = collidable.getBoundingBox();

      // Get detailed collision info
      const collisionInfo = this.sphereBoxCollisionInfo(
        playerBoundingSphere,
        objectBoundingBox
      );

      if (collisionInfo.collision) {
        result.collision = true;
        result.penetration = collisionInfo.penetration;
        result.collidable = collidable;
        return result; // Return on first collision (could be improved to find closest/deepest)
      }
    }

    return result;
  }

  private sphereIntersectsBox(sphere: THREE.Sphere, box: THREE.Box3): boolean {
    // Find the closest point on the box to the sphere
    const closestPoint = new THREE.Vector3();
    closestPoint.copy(sphere.center);

    // Clamp each coordinate to the box
    closestPoint.x = Math.max(box.min.x, Math.min(box.max.x, closestPoint.x));
    closestPoint.y = Math.max(box.min.y, Math.min(box.max.y, closestPoint.y));
    closestPoint.z = Math.max(box.min.z, Math.min(box.max.z, closestPoint.z));

    // Calculate squared distance between the closest point and sphere center
    const distanceSquared = closestPoint.distanceToSquared(sphere.center);

    // Check if this distance is less than the radius squared
    return distanceSquared < sphere.radius * sphere.radius;
  }

  private sphereBoxCollisionInfo(
    sphere: THREE.Sphere,
    box: THREE.Box3
  ): {
    collision: boolean;
    penetration: THREE.Vector3 | null;
  } {
    // Find the closest point on the box to the sphere
    const closestPoint = new THREE.Vector3();
    closestPoint.copy(sphere.center);

    // Clamp each coordinate to the box
    closestPoint.x = Math.max(box.min.x, Math.min(box.max.x, closestPoint.x));
    closestPoint.y = Math.max(box.min.y, Math.min(box.max.y, closestPoint.y));
    closestPoint.z = Math.max(box.min.z, Math.min(box.max.z, closestPoint.z));

    // Calculate distance between the closest point and sphere center
    const distance = closestPoint.distanceTo(sphere.center);

    // Check if this distance is less than the radius
    if (distance < sphere.radius) {
      // Calculate penetration vector
      const penetration = new THREE.Vector3();

      if (distance > 0) {
        // Direction from closest point to sphere center
        penetration.subVectors(sphere.center, closestPoint).normalize();
        // Scale by penetration depth
        penetration.multiplyScalar(sphere.radius - distance);
      } else {
        // Sphere center is inside the box, use the shortest exit direction
        const distToMin = new THREE.Vector3(
          sphere.center.x - box.min.x,
          sphere.center.y - box.min.y,
          sphere.center.z - box.min.z
        );

        const distToMax = new THREE.Vector3(
          box.max.x - sphere.center.x,
          box.max.y - sphere.center.y,
          box.max.z - sphere.center.z
        );

        // Find shortest exit
        if (
          distToMin.x < distToMax.x &&
          distToMin.x < distToMin.y &&
          distToMin.x < distToMin.z
        ) {
          penetration.set(-distToMin.x - sphere.radius, 0, 0);
        } else if (distToMax.x < distToMin.y && distToMax.x < distToMin.z) {
          penetration.set(distToMax.x + sphere.radius, 0, 0);
        } else if (distToMin.y < distToMax.y && distToMin.y < distToMin.z) {
          penetration.set(0, -distToMin.y - sphere.radius, 0);
        } else if (distToMax.y < distToMin.z) {
          penetration.set(0, distToMax.y + sphere.radius, 0);
        } else if (distToMin.z < distToMax.z) {
          penetration.set(0, 0, -distToMin.z - sphere.radius);
        } else {
          penetration.set(0, 0, distToMax.z + sphere.radius);
        }
      }

      return {
        collision: true,
        penetration: penetration,
      };
    }

    return {
      collision: false,
      penetration: null,
    };
  }
}
