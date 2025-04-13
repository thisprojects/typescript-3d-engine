import * as THREE from "three";
import { InputManager, Key } from "./input";
import { CollisionSystem } from "./collision";
import { IPosition } from "../types/level";
import { Enemy } from "./enemy";

export class Player {
  private camera: THREE.PerspectiveCamera;
  // New objects for rotation handling
  private cameraHolder: THREE.Object3D; // For yaw (left/right rotation)
  private cameraPitch: THREE.Object3D; // For pitch (up/down rotation)

  private velocity: THREE.Vector3;
  private speed: number = 0.2;
  private lookSensitivity: number = 0.002;
  private maxPitchAngle: number = Math.PI / 2.5; // Limit vertical rotation to avoid flipping
  private collisionRadius: number = 1.5; // Player collision radius
  private health: number = 100;
  private maxHealth: number = 100;
  private armor: number = 0;
  private maxArmor: number = 100;
  private lastDamageTime: number = 0;
  private damageInvulnerabilityTime: number = 500; // ms
  private isDead: boolean = false;
  private weaponDamage: number = 25;
  private weaponRange: number = 20;
  private lastShotTime: number = 0;
  private shootCooldown: number = 300; // ms

  constructor(camera: THREE.PerspectiveCamera, initialPosition?: IPosition) {
    this.camera = camera;
    this.velocity = new THREE.Vector3();

    // Create hierarchy for rotation handling
    this.cameraHolder = new THREE.Object3D(); // Handles yaw (left/right)
    this.cameraPitch = new THREE.Object3D(); // Handles pitch (up/down)

    // Setup hierarchy
    this.cameraHolder.add(this.cameraPitch);
    this.cameraPitch.add(this.camera);

    // Reset camera's rotation since we'll control it through the parent objects
    this.camera.rotation.set(0, 0, 0);

    // Position camera forward so it rotates around player's position
    this.camera.position.set(0, 0, 0);

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

    // Apply yaw rotation (left/right) to the holder object
    this.cameraHolder.rotation.y -= mouseMovement.x * this.lookSensitivity;

    // Apply pitch rotation (up/down) to the pitch object, with limits
    this.cameraPitch.rotation.x -= mouseMovement.y * this.lookSensitivity;

    // Clamp the pitch to avoid flipping over
    this.cameraPitch.rotation.x = Math.max(
      -this.maxPitchAngle,
      Math.min(this.maxPitchAngle, this.cameraPitch.rotation.x)
    );

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
    // Get forward and right vectors from the cameraHolder (using yaw only for movement)
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.cameraHolder.quaternion);
    forward.y = 0; // Keep movement on horizontal plane
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(this.cameraHolder.quaternion);
    right.y = 0;
    right.normalize();

    // Calculate desired movement vector
    const moveVector = new THREE.Vector3();
    moveVector.add(forward.clone().multiplyScalar(direction.z * this.speed));
    moveVector.add(right.clone().multiplyScalar(direction.x * this.speed));

    // Store current position for rollback if needed
    const originalPosition = this.cameraHolder.position.clone();

    // Try to move in the desired direction
    const newPosition = originalPosition.clone().add(moveVector);
    const collisionInfo = collisionSystem.getCollisionInfo(
      newPosition,
      this.collisionRadius
    );

    if (!collisionInfo.collision) {
      // No collision, move freely
      this.cameraHolder.position.copy(newPosition);
      return;
    }

    // If there's a collision, implement improved wall sliding for OBBs
    if (collisionInfo.penetration && collisionInfo.collidable) {
      // Get the wall normal (direction to push player out)
      const wallNormal = collisionInfo.penetration.clone().normalize();

      // Project the movement vector onto the wall plane
      const dot = moveVector.dot(wallNormal);
      const projectedMove = moveVector
        .clone()
        .sub(wallNormal.clone().multiplyScalar(dot));

      // Scale back to original speed if needed
      if (projectedMove.length() > 0) {
        if (projectedMove.length() > this.speed) {
          projectedMove.normalize().multiplyScalar(this.speed);
        }

        // Try the projected movement
        const slidingPosition = originalPosition.clone().add(projectedMove);

        if (
          !collisionSystem.checkCollision(slidingPosition, this.collisionRadius)
        ) {
          // Sliding successful
          this.cameraHolder.position.copy(slidingPosition);
          return;
        }
      }
    }

    // Improved multi-directional sliding attempts
    this.findBestSlidingDirection(
      originalPosition,
      moveVector,
      collisionSystem
    );
  }

  private findBestSlidingDirection(
    startPos: THREE.Vector3,
    moveVector: THREE.Vector3,
    collisionSystem: CollisionSystem
  ): void {
    // Get the normalized moving direction
    const moveDir = moveVector.clone().normalize();

    // Define the number of angles to test - increased for better coverage
    const angleCount = 16; // Increased from 8
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
      this.cameraHolder.position.copy(bestPosition);
    }
  }

  public setPosition(position: {
    x: number;
    y: number;
    z: number;
    rotation: number;
  }): void {
    // Set position of the camera holder
    this.cameraHolder.position.set(position.x, position.y + 1.5, position.z); // Add height offset for eye level
    this.cameraHolder.rotation.y = position.rotation;

    // Reset pitch when setting position
    this.cameraPitch.rotation.x = 0;
  }

  public getPosition(): THREE.Vector3 {
    return this.cameraHolder.position.clone();
  }

  public getDirection(): THREE.Vector3 {
    // Get the actual camera direction based on both yaw and pitch
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(
      this.camera.getWorldQuaternion(new THREE.Quaternion())
    );
    return direction.normalize();
  }

  public takeDamage(amount: number): void {
    // Check if player is invulnerable
    const currentTime = Date.now();
    if (currentTime - this.lastDamageTime < this.damageInvulnerabilityTime) {
      return;
    }

    // Record damage time for invulnerability period
    this.lastDamageTime = currentTime;

    // Calculate actual damage after armor
    let actualDamage = amount;
    if (this.armor > 0) {
      // Armor absorbs 2/3 of damage
      const armorAbsorption = Math.min(this.armor, actualDamage * (2 / 3));
      this.armor -= armorAbsorption;
      actualDamage -= armorAbsorption;
    }

    // Apply damage to health
    this.health -= actualDamage;

    // Check if dead
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }

    console.log(`Player hit! Health: ${this.health}, Armor: ${this.armor}`);

    // You would add screen flash or other damage feedback here
  }

  private die(): void {
    if (this.isDead) return;

    this.isDead = true;
    console.log("Player died!");

    // Implement death behavior (game over screen, etc.)
  }

  public isPlayerDead(): boolean {
    return this.isDead;
  }

  public shoot(enemies: Enemy[]): void {
    const currentTime = Date.now();
    if (currentTime - this.lastShotTime < this.shootCooldown) {
      return; // Can't shoot yet
    }

    this.lastShotTime = currentTime;

    // Create a ray from camera
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera); // Center of screen

    type TClosestHit = { distance: number; enemy: Enemy } | null;
    // Check for hits
    let closestHit: TClosestHit = null;

    enemies.forEach((enemy) => {
      // We need to calculate if the ray hits the enemy
      // In a real implementation, you would use raycaster.intersectObject
      // For simplicity, we'll use a distance-based approach

      const direction = this.getDirection();
      const enemyPosition = enemy.mesh.position;
      const playerPosition = this.cameraHolder.position;

      // Vector from player to enemy
      const toEnemy = enemyPosition.clone().sub(playerPosition);

      // Project toEnemy onto player direction
      const projection = toEnemy.dot(direction);

      // Enemy is behind player if projection is negative
      if (projection < 0) return;

      // Calculate the closest point on the ray to the enemy
      const closestPoint = playerPosition
        .clone()
        .add(direction.clone().multiplyScalar(projection));

      // Distance from closest point to enemy center
      const distance = closestPoint.distanceTo(enemyPosition);

      // If within range, consider it a hit
      if (distance < 1.0 && projection < this.weaponRange) {
        // If this is the closest hit so far, record it
        if (!closestHit || projection < closestHit.distance) {
          closestHit = {
            distance: projection,
            enemy: enemy,
          };
        }
      }
    });

    // Hit the closest enemy
    if (closestHit) {
      const hit = closestHit as TClosestHit;
      const killed = hit?.enemy.takeDamage(this.weaponDamage);
      console.log(`Hit enemy! ${killed ? "Killed!" : ""}`);

      // Add hit effects, sounds, etc.
    }
  }

  public heal(amount: number): void {
    this.health = Math.min(this.health + amount, this.maxHealth);
  }

  public addArmor(amount: number): void {
    this.armor = Math.min(this.armor + amount, this.maxArmor);
  }

  public getHealth(): number {
    return this.health;
  }

  public getArmor(): number {
    return this.armor;
  }

  // Add method to get the camera object (needed for the renderer)
  public getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  // Add method to get the cameraHolder (needed for adding to scene)
  public getCameraHolder(): THREE.Object3D {
    return this.cameraHolder;
  }
}
