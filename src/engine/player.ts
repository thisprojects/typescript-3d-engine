import * as THREE from "three";
import { InputManager, Key } from "./input";
import { CollisionSystem } from "./collision";
import { IPosition } from "../types/level";

export class Player {
  private camera: THREE.PerspectiveCamera;
  private velocity: THREE.Vector3;
  private speed: number = 0.2;
  private lookSensitivity: number = 0.002;
  private collisionRadius: number = 0.5; // Player collision radius

  constructor(camera: THREE.PerspectiveCamera, initialPosition?: IPosition) {
    this.camera = camera;
    this.velocity = new THREE.Vector3();

    if (initialPosition) {
      this.setPosition(initialPosition);
    }
  }

  public update(
    inputManager: InputManager,
    collisionSystem: CollisionSystem
  ): void {
    // Handle mouse movement for looking around
    const mouseMovement = inputManager.getMouseMovement();
    this.camera.rotation.y -= mouseMovement.x * this.lookSensitivity;

    // Handle keyboard movement
    const direction = new THREE.Vector3();

    // Forward/backward
    if (inputManager.isKeyPressed(Key.W)) {
      direction.z = 1;
    } else if (inputManager.isKeyPressed(Key.S)) {
      direction.z = -1;
    }

    // Left/right
    if (inputManager.isKeyPressed(Key.A)) {
      direction.x = -1;
    } else if (inputManager.isKeyPressed(Key.D)) {
      direction.x = 1;
    }

    // Normalize direction vector
    if (direction.length() > 0) {
      direction.normalize();
    } else {
      return; // No movement input, skip the rest
    }

    // Apply movement in camera direction
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.camera.quaternion);
    forward.y = 0; // Keep movement on horizontal plane
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();

    // Calculate desired movement vector
    const moveVector = new THREE.Vector3();
    moveVector.add(forward.clone().multiplyScalar(direction.z * this.speed));
    moveVector.add(right.clone().multiplyScalar(direction.x * this.speed));

    // Store current position for rollback if needed
    const originalPosition = this.camera.position.clone();

    // Try to move in the desired direction
    const newPosition = originalPosition.clone().add(moveVector);
    const collisionInfo = collisionSystem.getCollisionInfo(
      newPosition,
      this.collisionRadius
    );

    if (!collisionInfo.collision) {
      // No collision, move freely
      this.camera.position.copy(newPosition);
      return;
    }

    // If there's a collision, implement wall sliding

    // 1. First attempt: Project movement along the wall
    if (collisionInfo.penetration && collisionInfo.collidable) {
      // Get the wall normal (direction to push player out)
      const wallNormal = collisionInfo.penetration.clone().normalize();

      // Project the movement vector onto the wall plane
      const dot = moveVector.dot(wallNormal);
      const projectedMove = moveVector
        .clone()
        .sub(wallNormal.clone().multiplyScalar(dot));

      // Scale back to original speed
      if (projectedMove.length() > 0) {
        projectedMove.normalize().multiplyScalar(this.speed);

        // Try the projected movement
        const slidingPosition = originalPosition.clone().add(projectedMove);

        if (
          !collisionSystem.checkCollision(slidingPosition, this.collisionRadius)
        ) {
          // Sliding successful
          this.camera.position.copy(slidingPosition);
          return;
        }
      }
    }

    // 2. Second attempt: Try moving along each axis individually

    // Try X movement only
    const xOnlyMove = new THREE.Vector3(moveVector.x, 0, 0);
    const xOnlyPosition = originalPosition.clone().add(xOnlyMove);

    // Try Z movement only
    const zOnlyMove = new THREE.Vector3(0, 0, moveVector.z);
    const zOnlyPosition = originalPosition.clone().add(zOnlyMove);

    const canMoveX = !collisionSystem.checkCollision(
      xOnlyPosition,
      this.collisionRadius
    );
    const canMoveZ = !collisionSystem.checkCollision(
      zOnlyPosition,
      this.collisionRadius
    );

    // Apply valid movements
    if (canMoveX) {
      this.camera.position.x = xOnlyPosition.x;
    }

    if (canMoveZ) {
      this.camera.position.z = zOnlyPosition.z;
    }

    // If we moved in at least one direction, we've successfully slid along the wall
    if (canMoveX || canMoveZ) {
      return;
    }

    // 3. Final attempt: Find the best sliding direction by testing angles
    this.findBestSlidingDirection(
      originalPosition,
      moveVector,
      collisionSystem
    );
  }

  public setPosition(position: {
    x: number;
    y: number;
    z: number;
    rotation: number;
  }): void {
    this.camera.position.set(position.x, position.y + 1, position.z); // Add height offset for eye level
    this.camera.rotation.y = position.rotation;
  }

  private findBestSlidingDirection(
    startPos: THREE.Vector3,
    moveVector: THREE.Vector3,
    collisionSystem: CollisionSystem
  ): void {
    // Get the normalized moving direction
    const moveDir = moveVector.clone().normalize();

    // Define the number of angles to test
    const angleCount = 8;
    const angleStep = Math.PI / (angleCount - 1);

    // Test multiple angles to find the best sliding direction
    let bestDistance = 0;
    let bestPosition = startPos.clone();

    for (let i = 0; i < angleCount; i++) {
      // Calculate test angle (-90 to +90 degrees from original direction)
      const angle = -Math.PI / 2 + i * angleStep;

      // Create a rotated movement vector
      const rotatedDir = new THREE.Vector3(
        moveDir.x * Math.cos(angle) - moveDir.z * Math.sin(angle),
        0,
        moveDir.x * Math.sin(angle) + moveDir.z * Math.cos(angle)
      );

      // Scale to desired speed
      rotatedDir.multiplyScalar(this.speed);

      // Calculate test position
      const testPos = startPos.clone().add(rotatedDir);

      // Skip if collision at this position
      if (collisionSystem.checkCollision(testPos, this.collisionRadius)) {
        continue;
      }

      // Calculate how well this direction maintains our original intent
      // (dot product with original direction, higher is better)
      const dotWithOriginal = rotatedDir.dot(moveVector) / moveVector.length();

      // Weight based on how far we can move and how close to original direction
      const effectiveDistance =
        rotatedDir.length() * Math.max(0, dotWithOriginal);

      if (effectiveDistance > bestDistance) {
        bestDistance = effectiveDistance;
        bestPosition = testPos;
      }
    }

    // Apply the best sliding position if we found one
    if (bestDistance > 0) {
      this.camera.position.copy(bestPosition);
    }
  }
}
