import * as THREE from "three";
import { InputManager, Key } from "./input";
import { CollisionSystem } from "./collision";
import { IPosition } from "../types/level";
import { Enemy } from "./enemy";

export class Player {
  private camera: THREE.PerspectiveCamera;
  private velocity: THREE.Vector3;
  private speed: number = 0.2;
  private lookSensitivity: number = 0.002;
  private collisionRadius: number = 0.5; // Player collision radius
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
    this.camera.position.set(position.x, position.y + 1.5, position.z); // Add height offset for eye level
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

  public getPosition(): THREE.Vector3 {
    return this.camera.position.clone();
  }

  public getDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(this.camera.quaternion);
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
      const playerPosition = this.camera.position;

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
}
