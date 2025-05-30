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
  private weaponSprite: THREE.Sprite | null = null;
  private weaponImage: THREE.Mesh | null = null;
  private currentWeapon: string = "pistol"; // Default weapon
  private weaponTextures: Map<string, THREE.Texture> = new Map();

  // Physics properties
  private gravity: number = 0.02;
  private verticalVelocity: number = 0;
  private jumpForce: number = 0.3;
  private isOnGround: boolean = false;
  private standingHeight: number = 1.5; // Eye level height when standing
  private playerHeight: number = 3.0; // Total height of player for ground detection
  private lastJumpTime: number = 0;
  private jumpCooldown: number = 200; // ms - prevent jump spamming

  // Step climbing properties
  private maxStepHeight: number = 0.5; // Maximum height the player can step up
  private isClimbing: boolean = false;
  private climbDuration: number = 200; // ms
  private climbStartTime: number = 0;
  private climbStartPosition: THREE.Vector3 = new THREE.Vector3();
  private climbTargetPosition: THREE.Vector3 = new THREE.Vector3();

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

    this.loadWeaponTextures();

    if (initialPosition) {
      this.setPosition(initialPosition);
    }
  }

  public loadWeaponTextures(): void {
    const textureLoader = new THREE.TextureLoader();

    // Load weapon textures
    const weaponTypes = ["pistol", "shotgun", "chaingun"];
    weaponTypes.forEach((type) => {
      textureLoader.load(`/weapons/${type}.png`, (texture) => {
        this.weaponTextures.set(type, texture);

        // If this is the current weapon and we don't have a sprite yet, create it
        if (type === this.currentWeapon && !this.weaponImage) {
          this.createWeaponDisplay();
        }
      });
    });
  }

  public switchWeapon(weaponType: string): void {
    if (
      this.currentWeapon === weaponType ||
      !this.weaponTextures.has(weaponType)
    )
      return;

    this.currentWeapon = weaponType;

    // Remove existing weapon display if any
    if (this.weaponImage) {
      this.camera.remove(this.weaponImage);
      this.weaponImage = null;
    }

    // Create new weapon display
    this.createWeaponDisplay();
  }

  private updateWeaponBobbing(deltaTime: number): void {
    if (!this.weaponImage) return;

    // Simple bobbing effect based on time
    const bobFrequency = 1; // How fast it bobs
    const bobAmount = 0.03; // How much it moves

    // Calculate bobbing based on time
    const bobOffset = Math.sin(Date.now() * 0.005 * bobFrequency) * bobAmount;

    // Apply bobbing to weapon position
    this.weaponImage.position.y = -0.5 + bobOffset;
    this.weaponImage.position.x = -0 - bobOffset + 0.001;

    // Add slight rotation for more natural movement
    this.weaponImage.rotation.z = bobOffset * 0.1;
  }

  private createWeaponDisplay(): void {
    if (!this.weaponTextures.has(this.currentWeapon)) return;

    const texture = this.weaponTextures.get(this.currentWeapon)!;

    const aspectRatio = texture.image.width / texture.image.height;
    const width = 0.7;
    const height = width / aspectRatio;

    const geometry = new THREE.PlaneGeometry(width, height);

    // Create material with color tint to darken the texture
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Add these properties to reduce brightness:
      color: new THREE.Color(0xaaaaaa),
    });

    this.weaponImage = new THREE.Mesh(geometry, material);
    this.weaponImage.position.set(0, -0.5, -1);
    this.camera.add(this.weaponImage);
  }

  public update(
    inputManager: InputManager,
    collisionSystem: CollisionSystem,
    deltaTime: number
  ): void {
    // If currently climbing a step, handle that first
    if (this.isClimbing) {
      this.updateStepClimbing();
      this.updateWeaponBobbing(deltaTime);
      return;
    }

    // Get mouse movement delta
    const mouseMovement = inputManager.getMouseMovement();

    // Fix #1: Use smaller sensitivity values to make movement smoother
    const adjustedSensitivity = this.lookSensitivity * 0.5;

    // Fix #2: Apply easing to the rotation to prevent sudden changes
    const easingFactor = 0.8;

    // Calculate target rotations with easing
    const targetYaw =
      this.cameraHolder.rotation.y - mouseMovement.x * adjustedSensitivity;
    const targetPitch =
      this.cameraPitch.rotation.x - mouseMovement.y * adjustedSensitivity;

    // Apply easing to the rotation
    this.cameraHolder.rotation.y =
      this.cameraHolder.rotation.y * (1 - easingFactor) +
      targetYaw * easingFactor;

    // Apply pitch with clamping
    const clampedPitch = Math.max(
      -this.maxPitchAngle,
      Math.min(this.maxPitchAngle, targetPitch)
    );

    this.cameraPitch.rotation.x =
      this.cameraPitch.rotation.x * (1 - easingFactor) +
      clampedPitch * easingFactor;

    // Handle keyboard movement
    const direction = new THREE.Vector3();

    // Forward/backward
    if (inputManager.isKeyPressed(Key.W)) {
      direction.z = -1;
    } else if (inputManager.isKeyPressed(Key.S)) {
      direction.z = 1;
    }

    // Left/right
    if (inputManager.isKeyPressed(Key.A)) {
      direction.x = -1;
    } else if (inputManager.isKeyPressed(Key.D)) {
      direction.x = 1;
    }

    // Apply physics for vertical movement
    this.updateVerticalMovement(inputManager, collisionSystem, deltaTime);

    // No horizontal movement input, skip the rest of horizontal movement
    if (direction.length() === 0) {
      return;
    }

    // Normalize direction vector
    direction.normalize();

    // Fix #3: Use Euler angles directly instead of quaternions for movement
    // This provides more stable movement with less texture swimming
    const rotationY = this.cameraHolder.rotation.y;

    // Calculate movement direction using simple trigonometry
    const moveVector = new THREE.Vector3();
    moveVector.x =
      direction.x * Math.cos(rotationY) + direction.z * Math.sin(rotationY);
    moveVector.z =
      direction.z * Math.cos(rotationY) - direction.x * Math.sin(rotationY);

    // Scale movement by speed
    moveVector.multiplyScalar(this.speed);

    // Current position
    const originalPosition = this.cameraHolder.position.clone();

    // Calculate new position (only update x and z, y is handled by physics)
    const newPosition = originalPosition.clone();
    newPosition.x += moveVector.x;
    newPosition.z += moveVector.z;

    // Check for collisions
    const collisionInfo = collisionSystem.getCollisionInfo(
      newPosition,
      this.collisionRadius
    );

    if (!collisionInfo.collision) {
      // No collision, move freely (but only update x and z)
      this.cameraHolder.position.x = newPosition.x;
      this.cameraHolder.position.z = newPosition.z;
      this.updateWeaponBobbing(deltaTime);
      return;
    }

    // Try to step up if there's a collision
    if (
      this.tryStepUp(collisionSystem, originalPosition, newPosition, moveVector)
    ) {
      // Successfully started climbing a step
      return;
    }

    // If there's a collision and can't step up, implement improved wall sliding for OBBs
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

        // Try the projected movement (only x and z)
        const slidingPosition = originalPosition.clone();
        slidingPosition.x += projectedMove.x;
        slidingPosition.z += projectedMove.z;

        if (
          !collisionSystem.checkCollision(slidingPosition, this.collisionRadius)
        ) {
          // Sliding successful
          this.cameraHolder.position.x = slidingPosition.x;
          this.cameraHolder.position.z = slidingPosition.z;
          this.updateWeaponBobbing(deltaTime);
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

    this.updateWeaponBobbing(deltaTime);
  }

  private updateVerticalMovement(
    inputManager: InputManager,
    collisionSystem: CollisionSystem,
    deltaTime: number
  ): void {
    // Skip vertical movement update if currently climbing a step
    if (this.isClimbing) return;

    // Normalize deltaTime to avoid physics issues at different frame rates
    const dt = Math.min(deltaTime / 16.67, 2.0); // Cap at 2x normal time step

    // Apply gravity to vertical velocity
    this.verticalVelocity -= this.gravity * dt;

    // Check for jump input - only when on ground
    if (inputManager.isKeyPressed(Key.SPACE) && this.isOnGround) {
      const currentTime = Date.now();
      if (currentTime - this.lastJumpTime > this.jumpCooldown) {
        this.verticalVelocity = this.jumpForce;
        this.isOnGround = false;
        this.lastJumpTime = currentTime;
      }
    }

    // Store current position
    const currentPosition = this.cameraHolder.position.clone();

    // Ground detection using the specialized method
    const groundCheck = collisionSystem.checkGroundCollision(
      currentPosition,
      this.collisionRadius,
      this.playerHeight
    );

    // Handle ground collision
    if (groundCheck.collision && groundCheck.groundY !== null) {
      // Only consider it ground if we're moving downward or already on ground
      if (this.verticalVelocity <= 0) {
        // Calculate the appropriate Y position (feet at ground level)
        const targetY = groundCheck.groundY + this.standingHeight;

        // If we're close to the ground or below it
        if (currentPosition.y <= targetY + 0.1) {
          // Snap to ground position
          this.cameraHolder.position.y = targetY;
          this.verticalVelocity = 0;
          this.isOnGround = true;
          return; // Exit early, no need for further movement
        }
      }
    } else {
      // No ground detected below
      this.isOnGround = false;
    }

    // Ceiling collision check when moving upward
    if (this.verticalVelocity > 0) {
      // Position to check (top of player)
      const headPosition = currentPosition.clone();
      headPosition.y += this.standingHeight * 0.5;

      // Check for collision at the head position with upward movement applied
      const ceilingCheck = collisionSystem.getCollisionInfo(
        new THREE.Vector3(
          headPosition.x,
          headPosition.y + this.verticalVelocity * dt,
          headPosition.z
        ),
        this.collisionRadius * 0.5
      );

      if (ceilingCheck.collision) {
        // Hit ceiling, stop upward momentum
        this.verticalVelocity = 0;
      }
    }

    // Apply vertical movement
    this.cameraHolder.position.y += this.verticalVelocity * dt;

    // Terminal velocity limit to prevent falling too fast
    const terminalVelocity = -0.5;
    if (this.verticalVelocity < terminalVelocity) {
      this.verticalVelocity = terminalVelocity;
    }

    // Absolute minimum Y position as a failsafe
    const absoluteMinY = 0.5; // Adjust based on your level's floor height
    if (this.cameraHolder.position.y < absoluteMinY + this.standingHeight) {
      this.cameraHolder.position.y = absoluteMinY + this.standingHeight;
      this.verticalVelocity = 0;
      this.isOnGround = true;
    }
  }

  // New method to try stepping up
  private tryStepUp(
    collisionSystem: CollisionSystem,
    originalPosition: THREE.Vector3,
    newPosition: THREE.Vector3,
    moveVector: THREE.Vector3
  ): boolean {
    // Only try to step up if on the ground
    if (!this.isOnGround) return false;

    // Check if there's a step we can climb
    // First, try moving to a position slightly higher than the current position
    const stepTestPosition = newPosition.clone();
    stepTestPosition.y += this.maxStepHeight;

    // Check if there's a collision at the higher position
    if (
      collisionSystem.checkCollision(stepTestPosition, this.collisionRadius)
    ) {
      // If there's still a collision higher up, we can't step here
      return false;
    }

    // Now check if there's ground at or below the new higher position
    const groundCheck = collisionSystem.checkGroundCollision(
      stepTestPosition,
      this.collisionRadius,
      this.maxStepHeight + 0.1 // Just need to check a bit below the higher position
    );

    // If we found ground and it's within step height range
    if (groundCheck.collision && groundCheck.groundY !== null) {
      const groundHeight = groundCheck.groundY + this.standingHeight;
      const heightDifference = groundHeight - originalPosition.y;

      // Only climb if the step is within our climb range
      if (heightDifference > 0 && heightDifference <= this.maxStepHeight) {
        // Start the climbing process
        this.startStepClimbing(originalPosition, newPosition, groundHeight);
        return true;
      }
    }

    return false;
  }

  // Method to start the step climbing process
  private startStepClimbing(
    startPosition: THREE.Vector3,
    targetHorizontalPosition: THREE.Vector3,
    targetYPosition: number
  ): void {
    this.isClimbing = true;
    this.climbStartTime = Date.now();
    this.climbStartPosition.copy(startPosition);

    // Target position combines horizontal movement and vertical step up
    this.climbTargetPosition.set(
      targetHorizontalPosition.x,
      targetYPosition,
      targetHorizontalPosition.z
    );
  }

  private updateStepClimbing(): void {
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.climbStartTime;

    if (elapsedTime >= this.climbDuration) {
      // Climbing finished
      this.cameraHolder.position.copy(this.climbTargetPosition);
      this.isClimbing = false;
      this.verticalVelocity = 0;
      return;
    }

    // Calculate progress (0 to 1)
    const progress = elapsedTime / this.climbDuration;

    // Smooth easing for the step climb
    // Use a sine-based easing for more natural movement
    const easedProgress = Math.sin((progress * Math.PI) / 2);

    // Interpolate between start and target positions
    this.cameraHolder.position.lerpVectors(
      this.climbStartPosition,
      this.climbTargetPosition,
      easedProgress
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

      // Calculate test position (only update x and z)
      const testPos = startPos.clone();
      testPos.x += rotatedDir.x;
      testPos.z += rotatedDir.z;

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

    // Apply the best sliding position if we found one (only update x and z)
    if (bestDistance > 0) {
      this.cameraHolder.position.x = bestPosition.x;
      this.cameraHolder.position.z = bestPosition.z;
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

    // Reset physics state
    this.verticalVelocity = 0;
    this.isOnGround = false; // Will be updated in the next frame
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

    if (this.weaponImage) {
      const recoilAmount = 0.05;
      this.weaponImage.position.y += recoilAmount;

      setTimeout(() => {
        if (this.weaponImage) {
          this.weaponImage.position.y -= recoilAmount;
        }
      }, 50);
    }

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

      // Add muzzle flash or shooting animation

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
