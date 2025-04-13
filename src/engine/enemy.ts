import * as THREE from "three";
import { Collidable, CollisionSystem } from "./collision";
import { OrientedBoundingBox } from "./orientedBoundingBox";
import { Player } from "./player";

export enum EnemyState {
  IDLE,
  PATROLLING,
  CHASING,
  ATTACKING,
  DAMAGED,
  DYING,
}

export enum EnemyType {
  IMP,
  ZOMBIE,
  DEMON,
}

export interface EnemyDefinition {
  type: EnemyType;
  health: number;
  speed: number;
  damage: number;
  attackRange: number;
  detectionRange: number;
  modelPath: string;
  scale: number;
}

export const ENEMY_DEFINITIONS: Record<EnemyType, EnemyDefinition> = {
  [EnemyType.IMP]: {
    type: EnemyType.IMP,
    health: 60,
    speed: 0.03,
    damage: 10,
    attackRange: 1.5,
    detectionRange: 15,
    modelPath: "/models/imp.glb", // You'll need to add these models
    scale: 0.8,
  },
  [EnemyType.ZOMBIE]: {
    type: EnemyType.ZOMBIE,
    health: 100,
    speed: 0.02,
    damage: 15,
    attackRange: 1.2,
    detectionRange: 12,
    modelPath: "/models/zombie.glb",
    scale: 1.0,
  },
  [EnemyType.DEMON]: {
    type: EnemyType.DEMON,
    health: 150,
    speed: 0.04,
    damage: 25,
    attackRange: 1.0,
    detectionRange: 18,
    modelPath: "/models/demon.glb",
    scale: 1.2,
  },
};

export class Enemy implements Collidable {
  public mesh: THREE.Mesh;
  public model: THREE.Group | null = null;
  public state: EnemyState = EnemyState.IDLE;
  public health: number;
  public type: EnemyType;
  public speed: number;
  public damage: number;
  public attackRange: number;
  public detectionRange: number;
  public collisionRadius: number = 1; // Enemy collision radius

  // For navigation
  public targetPosition: THREE.Vector3 = new THREE.Vector3();
  public lastAttackTime: number = 0;
  public attackCooldown: number = 1000; // ms
  public currentPathIndex: number = 0;
  public patrolPath: THREE.Vector3[] = [];
  public moveDirection: THREE.Vector3 = new THREE.Vector3();

  // Animation properties
  public animationMixer: THREE.AnimationMixer | null = null;
  public animations: Map<string, THREE.AnimationAction> = new Map();
  public currentAnimation: string | null = null;

  constructor(position: THREE.Vector3, type: EnemyType = EnemyType.IMP) {
    // Create a placeholder mesh until the model is loaded
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);

    // Set properties based on enemy type
    const definition = ENEMY_DEFINITIONS[type];
    this.type = type;
    this.health = definition.health;
    this.speed = definition.speed;
    this.damage = definition.damage;
    this.attackRange = definition.attackRange;
    this.detectionRange = definition.detectionRange;

    // Load the actual model
    this.loadModel(definition.modelPath, definition.scale);
  }

  public loadModel(modelPath: string, scale: number): void {
    // In a real implementation, you would use GLTFLoader to load the model
    // For now, we'll keep using the placeholder mesh
    console.log(`Loading model from: ${modelPath} at scale ${scale}`);
    // Example of loading model with Three.js GLTFLoader:
    /*
    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        this.model = gltf.scene;
        this.model.scale.set(scale, scale, scale);
        this.mesh.add(this.model);
        
        // Set up animations
        this.animationMixer = new THREE.AnimationMixer(this.model);
        gltf.animations.forEach((clip) => {
          const action = this.animationMixer.clipAction(clip);
          this.animations.set(clip.name, action);
        });
        
        // Play idle animation by default
        this.playAnimation('idle');
      },
      undefined,
      (error) => {
        console.error('Error loading enemy model:', error);
      }
    );
    */
  }

  public update(
    deltaTime: number,
    player: Player,
    collisionSystem: CollisionSystem
  ): void {
    // Update animation mixer if it exists
    if (this.animationMixer) {
      this.animationMixer.update(deltaTime / 1000);
    }

    // Get player position
    const playerPosition = player.getPosition();

    // Calculate distance to player
    const distanceToPlayer = this.mesh.position.distanceTo(playerPosition);

    // Update state based on distance to player and current state
    this.updateState(distanceToPlayer);

    // Handle behavior based on current state
    switch (this.state) {
      case EnemyState.IDLE:
        this.handleIdleState();
        break;

      case EnemyState.PATROLLING:
        this.handlePatrolState(collisionSystem);
        break;

      case EnemyState.CHASING:
        this.handleChaseState(playerPosition, collisionSystem);
        break;

      case EnemyState.ATTACKING:
        this.handleAttackState(playerPosition, player);
        break;

      case EnemyState.DAMAGED:
        // Handle damage animation/behavior
        break;

      case EnemyState.DYING:
        // Handle death animation/behavior
        break;
    }

    // Look at player if chasing or attacking
    if (
      this.state === EnemyState.CHASING ||
      this.state === EnemyState.ATTACKING
    ) {
      // Create a temporary vector at the same height as the enemy
      const lookPosition = new THREE.Vector3(
        playerPosition.x,
        this.mesh.position.y,
        playerPosition.z
      );
      this.mesh.lookAt(lookPosition);
    }
  }

  public updateState(distanceToPlayer: number): void {
    // State transition logic
    switch (this.state) {
      case EnemyState.IDLE:
      case EnemyState.PATROLLING:
        if (distanceToPlayer <= this.detectionRange) {
          this.setState(EnemyState.CHASING);
        }
        break;

      case EnemyState.CHASING:
        if (distanceToPlayer > this.detectionRange) {
          this.setState(EnemyState.PATROLLING);
        } else if (distanceToPlayer <= this.attackRange) {
          this.setState(EnemyState.ATTACKING);
        }
        break;

      case EnemyState.ATTACKING:
        if (distanceToPlayer > this.attackRange) {
          this.setState(EnemyState.CHASING);
        }
        break;

      case EnemyState.DAMAGED:
        // After damage animation completes, go back to chasing if player is in range
        if (distanceToPlayer <= this.detectionRange) {
          this.setState(EnemyState.CHASING);
        } else {
          this.setState(EnemyState.IDLE);
        }
        break;
    }
  }

  public setState(newState: EnemyState): void {
    if (this.state === newState) return;

    this.state = newState;

    // Update animation based on new state
    switch (newState) {
      case EnemyState.IDLE:
        this.playAnimation("idle");
        break;

      case EnemyState.PATROLLING:
        this.playAnimation("walk");
        break;

      case EnemyState.CHASING:
        this.playAnimation("run");
        break;

      case EnemyState.ATTACKING:
        this.playAnimation("attack");
        break;

      case EnemyState.DAMAGED:
        this.playAnimation("hit");
        break;

      case EnemyState.DYING:
        this.playAnimation("death");
        break;
    }
  }

  public playAnimation(name: string): void {
    if (!this.animations.has(name) || this.currentAnimation === name) return;

    // Stop current animation
    if (this.currentAnimation && this.animations.has(this.currentAnimation)) {
      this.animations.get(this.currentAnimation)?.fadeOut(0.2);
    }

    // Start new animation
    const action = this.animations.get(name);
    if (action) {
      action.reset().fadeIn(0.2).play();
      this.currentAnimation = name;
    }
  }

  public handleIdleState(): void {
    // In idle state, enemy just stands still or performs idle animation
    // Randomly transition to patrol state
    if (Math.random() < 0.005) {
      this.setState(EnemyState.PATROLLING);
      this.generatePatrolPath();
    }
  }

  public handlePatrolState(collisionSystem: CollisionSystem): void {
    // If no patrol path or reached end of path, generate a new one
    if (
      this.patrolPath.length === 0 ||
      this.currentPathIndex >= this.patrolPath.length
    ) {
      this.generatePatrolPath();
      this.currentPathIndex = 0;
    }

    // Move along patrol path
    if (this.patrolPath.length > 0) {
      const targetPoint = this.patrolPath[this.currentPathIndex];
      const distanceToTarget = this.mesh.position.distanceTo(targetPoint);

      if (distanceToTarget < 0.5) {
        // Reached waypoint, move to next one
        this.currentPathIndex++;
      } else {
        // Move towards waypoint with collision detection
        this.moveTowardsWithCollision(
          targetPoint,
          this.speed * 0.5,
          collisionSystem
        );
      }
    }
  }

  public handleChaseState(
    playerPosition: THREE.Vector3,
    collisionSystem: CollisionSystem
  ): void {
    // Move towards player with collision detection
    this.moveTowardsWithCollision(playerPosition, this.speed, collisionSystem);
  }

  public handleAttackState(
    playerPosition: THREE.Vector3,
    player: Player
  ): void {
    // Look at player
    this.mesh.lookAt(playerPosition.x, this.mesh.position.y, playerPosition.z);

    // Attack if cooldown has passed
    const currentTime = Date.now();
    if (currentTime - this.lastAttackTime > this.attackCooldown) {
      this.attackPlayer(player);
      this.lastAttackTime = currentTime;
    }
  }

  public moveTowards(target: THREE.Vector3, speed: number): void {
    // Calculate direction to target
    this.moveDirection.subVectors(target, this.mesh.position).normalize();

    // Keep y-coordinate constant (don't fly or sink)
    this.moveDirection.y = 0;

    // Move towards target
    this.mesh.position.addScaledVector(this.moveDirection, speed);
  }

  public moveTowardsWithCollision(
    target: THREE.Vector3,
    speed: number,
    collisionSystem: CollisionSystem
  ): void {
    // Calculate direction to target
    this.moveDirection.subVectors(target, this.mesh.position).normalize();

    // Keep y-coordinate constant
    this.moveDirection.y = 0;

    // Store current position for rollback if needed
    const originalPosition = this.mesh.position.clone();

    // Calculate potential new position
    const moveVector = this.moveDirection.clone().multiplyScalar(speed);
    const newPosition = originalPosition.clone().add(moveVector);

    // Check for collision, ignoring self
    const collisionInfo = collisionSystem.getCollisionInfo(
      newPosition,
      this.collisionRadius,
      this // Pass the enemy itself to ignore self-collision
    );

    if (!collisionInfo.collision) {
      // No collision, move freely
      this.mesh.position.copy(newPosition);
      return;
    }

    console.log("COLLISION", collisionInfo.collidable);

    // If there's a collision, implement wall sliding

    // 1. First attempt: Project movement along the wall
    if (collisionInfo.penetration && collisionInfo.collidable) {
      // Get the wall normal (direction to push enemy out)
      const wallNormal = collisionInfo.penetration.clone().normalize();

      // Project the movement vector onto the wall plane
      const dot = moveVector.dot(wallNormal);
      const projectedMove = moveVector
        .clone()
        .sub(wallNormal.clone().multiplyScalar(dot));

      // Scale back to original speed
      if (projectedMove.length() > 0) {
        projectedMove.normalize().multiplyScalar(speed);

        // Try the projected movement
        const slidingPosition = originalPosition.clone().add(projectedMove);

        if (
          !collisionSystem.checkCollision(slidingPosition, this.collisionRadius)
        ) {
          // Sliding successful
          this.mesh.position.copy(slidingPosition);
          return;
        }
      }
    }

    // 2. Second attempt: Try moving along each axis individually
    const xOnlyMove = new THREE.Vector3(moveVector.x, 0, 0);
    const xOnlyPosition = originalPosition.clone().add(xOnlyMove);

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
      this.mesh.position.x = xOnlyPosition.x;
    }

    if (canMoveZ) {
      this.mesh.position.z = zOnlyPosition.z;
    }

    // If we moved in at least one direction, we've successfully slid along the wall
    if (canMoveX || canMoveZ) {
      return;
    }

    // 3. Final attempt: Find the best sliding direction
    this.findBestSlidingDirection(
      originalPosition,
      moveVector,
      collisionSystem
    );

    // Rest of the wall sliding logic...
    // Also update all collisionSystem.checkCollision calls to pass 'this' as ignoreObject
    // For example:
    // if (!collisionSystem.checkCollision(slidingPosition, this.collisionRadius, this))
  }

  public createCollisionVisualization(scene: THREE.Scene): void {
    // Create a wireframe sphere to show the collision radius
    const geo = new THREE.SphereGeometry(this.collisionRadius, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
    });
    const sphere = new THREE.Mesh(geo, mat);

    // Position at the enemy's position
    sphere.position.copy(this.mesh.position);

    // Add to scene
    scene.add(sphere);

    // Update position in the update method
    const updatePosition = () => {
      sphere.position.copy(this.mesh.position);
      requestAnimationFrame(updatePosition);
    };
    updatePosition();
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
      rotatedDir.multiplyScalar(moveVector.length());

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
      this.mesh.position.copy(bestPosition);
    }
  }

  public generatePatrolPath(): void {
    // Generate a random patrol path around current position
    this.patrolPath = [];
    const numPoints = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const radius = 5 + Math.random() * 5;

      const x = this.mesh.position.x + Math.cos(angle) * radius;
      const z = this.mesh.position.z + Math.sin(angle) * radius;

      this.patrolPath.push(new THREE.Vector3(x, this.mesh.position.y, z));
    }
  }

  public attackPlayer(player: Player): void {
    console.log(`Enemy attacking player with ${this.damage} damage`);
    // In an actual implementation, you would call a damage function on the player
    player.takeDamage(this.damage);

    // Play attack animation
    this.playAnimation("attack");
  }

  public takeDamage(amount: number): boolean {
    this.health -= amount;

    // Enter damaged state
    this.setState(EnemyState.DAMAGED);

    // Check if dead
    if (this.health <= 0) {
      this.die();
      return true; // Enemy died
    }

    return false; // Enemy still alive
  }

  public die(): void {
    this.setState(EnemyState.DYING);
    // In a real implementation, you would play death animation and then remove the enemy
  }

  public getBoundingBox(): THREE.Box3 {
    // Create a box that's the right size for the enemy
    const box = new THREE.Box3();
    const position = this.mesh.position.clone();

    box.min.set(
      position.x - this.collisionRadius,
      position.y - this.collisionRadius,
      position.z - this.collisionRadius
    );

    box.max.set(
      position.x + this.collisionRadius,
      position.y + this.collisionRadius,
      position.z + this.collisionRadius
    );

    return box;
  }

  public getOrientedBoundingBox(): OrientedBoundingBox {
    // For enemies, we'll use a simple OBB (essentially an AABB since enemies don't rotate)
    const center = this.mesh.position.clone();
    const halfSize = new THREE.Vector3(
      this.collisionRadius,
      this.collisionRadius,
      this.collisionRadius
    );

    return new OrientedBoundingBox(center, halfSize);
  }
}
