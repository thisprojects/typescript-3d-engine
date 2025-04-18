import * as THREE from "three";
import { CollisionSystem } from "./collision";

export interface PhysicsObject {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isGrounded: boolean;
  isFalling: boolean;
  height: number;
  radius: number;
  canJump: boolean;
}

export class PhysicsSystem {
  private gravity: number = 0.02;
  private objects: PhysicsObject[] = [];
  private collisionSystem: CollisionSystem;
  private floorHeights: Map<string, number> = new Map(); // Stores floor height data
  private platformVelocities: Map<string, THREE.Vector3> = new Map(); // For lifts

  constructor(collisionSystem: CollisionSystem) {
    this.collisionSystem = collisionSystem;
  }

  public addObject(object: PhysicsObject): void {
    this.objects.push(object);
  }

  public removeObject(object: PhysicsObject): void {
    const index = this.objects.indexOf(object);
    if (index !== -1) {
      this.objects.splice(index, 1);
    }
  }

  public registerFloor(id: string, height: number): void {
    this.floorHeights.set(id, height);
  }

  public registerMovingPlatform(
    id: string,
    height: number,
    velocity: THREE.Vector3
  ): void {
    this.floorHeights.set(id, height);
    this.platformVelocities.set(id, velocity);
  }

  public update(deltaTime: number): void {
    // Update platform positions (for lifts, etc.)
    this.updateMovingPlatforms(deltaTime);

    // Update physics for all objects
    this.objects.forEach((object) => {
      this.updateObjectPhysics(object, deltaTime);
    });
  }

  private updateMovingPlatforms(deltaTime: number): void {
    // This would handle movement of lifts and other moving platforms
    // For simplicity, we'll just use a simple up/down motion
    for (const [id, velocity] of this.platformVelocities.entries()) {
      const currentHeight = this.floorHeights.get(id) || 0;

      // Just a simple example: platforms move up and down between 0 and 10 units
      if (currentHeight > 10 && velocity.y > 0) {
        velocity.y = -velocity.y;
      } else if (currentHeight < 0 && velocity.y < 0) {
        velocity.y = -velocity.y;
      }

      // Update the height
      this.floorHeights.set(id, currentHeight + velocity.y * deltaTime);
    }
  }

  private updateObjectPhysics(object: PhysicsObject, deltaTime: number): void {
    const originalPosition = object.position.clone();
    let newPosition = originalPosition.clone();

    // Apply gravity if not grounded
    if (!object.isGrounded) {
      object.velocity.y -= this.gravity * deltaTime;
      object.isFalling = true;
    }

    // Apply velocity to position
    newPosition.add(object.velocity.clone().multiplyScalar(deltaTime));

    // Check floor collisions (vertical)
    const floorInfo = this.checkFloorCollision(newPosition, object.radius);

    if (floorInfo.collision) {
      // Place object on floor
      newPosition.y = floorInfo.height + object.height / 2;
      object.velocity.y = 0;
      object.isGrounded = true;
      object.isFalling = false;
      object.canJump = true;

      // If on a moving platform, apply its velocity to the object
      if (
        floorInfo.platformId &&
        this.platformVelocities.has(floorInfo.platformId)
      ) {
        const platformVel = this.platformVelocities.get(floorInfo.platformId)!;
        newPosition.add(platformVel.clone().multiplyScalar(deltaTime));
      }
    } else {
      // No floor below, object is falling
      object.isGrounded = false;
    }

    // Check ceiling collisions
    const ceilingInfo = this.checkCeilingCollision(newPosition, object.height);

    if (ceilingInfo.collision) {
      // Prevent moving up through ceiling
      newPosition.y = ceilingInfo.height - object.height / 2;
      object.velocity.y = 0; // Stop upward velocity
    }

    // Check wall collisions (already handled by CollisionSystem)
    // But we need to use the adjusted height
    const wallCheckPosition = newPosition.clone();

    // Only check horizontal movement for walls
    wallCheckPosition.y = originalPosition.y;

    const wallCollision = this.collisionSystem.getCollisionInfo(
      wallCheckPosition,
      object.radius
    );

    if (wallCollision.collision) {
      // Use wall sliding logic from your existing collision system
      // But apply it only to X and Z components
      if (wallCollision.penetration) {
        const wallNormal = wallCollision.penetration.clone().normalize();
        wallNormal.y = 0; // Only consider horizontal component

        if (wallNormal.lengthSq() > 0) {
          wallNormal.normalize();

          // Calculate horizontal velocity
          const horizontalVelocity = new THREE.Vector3(
            object.velocity.x,
            0,
            object.velocity.z
          );

          // Project horizontal velocity onto wall plane
          const dot = horizontalVelocity.dot(wallNormal);
          const projectedVelocity = horizontalVelocity
            .clone()
            .sub(wallNormal.clone().multiplyScalar(dot));

          // Apply projected velocity only to X and Z
          newPosition.x = originalPosition.x + projectedVelocity.x * deltaTime;
          newPosition.z = originalPosition.z + projectedVelocity.z * deltaTime;
        }
      }
    }

    // Check for stairs/steps (gradual height changes)
    if (object.isGrounded) {
      const stepHeight = 0.5; // Maximum height of a step that can be climbed
      const stepCheckPosition = newPosition.clone();
      stepCheckPosition.y += stepHeight;

      const stepFloorInfo = this.checkFloorCollision(
        stepCheckPosition,
        object.radius
      );

      if (
        stepFloorInfo.collision &&
        stepFloorInfo.height < newPosition.y + stepHeight &&
        stepFloorInfo.height > newPosition.y
      ) {
        // This is a small step up, automatically climb it
        newPosition.y = stepFloorInfo.height + object.height / 2;
      }
    }

    // Update object position
    object.position.copy(newPosition);
  }

  private checkFloorCollision(
    position: THREE.Vector3,
    radius: number
  ): {
    collision: boolean;
    height: number;
    platformId: string | null;
  } {
    // Implementation depends on your level system
    // For now, we'll just check against our registered floors

    const result = {
      collision: false,
      height: 0,
      platformId: null as string | null,
    };

    // Raycast downward to check for floor
    // First, we'll just check against our registered floor heights
    let highestFloor = -Infinity;
    let highestFloorId = null;

    for (const [id, height] of this.floorHeights.entries()) {
      // For each floor, check if object is above it and within its bounds
      if (
        position.y > height &&
        position.y - height < 2 * radius && // Maximum step-down distance
        height > highestFloor
      ) {
        highestFloor = height;
        highestFloorId = id;
      }
    }

    if (highestFloor > -Infinity) {
      result.collision = true;
      result.height = highestFloor;
      result.platformId = highestFloorId;
    }

    // For more complex levels, you would use raycasting here
    // to check actual meshes in the scene

    return result;
  }

  private checkCeilingCollision(
    position: THREE.Vector3,
    height: number
  ): {
    collision: boolean;
    height: number;
  } {
    // Similar to floor check, but upward
    // For now, we'll just check a fixed ceiling height

    const result = {
      collision: false,
      height: 0,
    };

    const ceilingHeight = 10; // Example ceiling height

    if (position.y + height / 2 > ceilingHeight) {
      result.collision = true;
      result.height = ceilingHeight;
    }

    return result;
  }

  public jump(object: PhysicsObject, jumpForce: number): boolean {
    if (object.isGrounded && object.canJump) {
      object.velocity.y = jumpForce;
      object.isGrounded = false;
      object.canJump = false; // Prevent double jumping
      return true;
    }
    return false;
  }

  // Helper methods for level editing/integration
  public getHeightAt(position: THREE.Vector2): number {
    // In a real implementation, this would check the actual terrain/floor height
    // For now, we'll just return the floor height if it exists
    for (const [id, height] of this.floorHeights.entries()) {
      // Very simple implementation - in a real game, you'd check actual floor boundaries
      return height;
    }
    return 0; // Default floor height
  }
}
