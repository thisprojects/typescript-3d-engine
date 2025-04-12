import * as THREE from "three";
import { Enemy, EnemyType } from "./enemy";
import { CollisionSystem } from "./collision";
import { Player } from "./player";

export interface EnemySpawnPoint {
  position: THREE.Vector3;
  type: EnemyType;
}

export class EnemyManager {
  private enemies: Enemy[] = [];
  private collisionSystem: CollisionSystem;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, collisionSystem: CollisionSystem) {
    this.scene = scene;
    this.collisionSystem = collisionSystem;
  }

  public spawnEnemy(
    position: THREE.Vector3,
    type: EnemyType = EnemyType.IMP
  ): Enemy {
    const enemy = new Enemy(position, type);

    // Add enemy mesh to scene
    this.scene.add(enemy.mesh);

    // Add enemy to collision system
    this.collisionSystem.addCollidable(enemy);

    // Add to enemies array
    this.enemies.push(enemy);

    return enemy;
  }

  public spawnEnemiesFromPoints(spawnPoints: EnemySpawnPoint[]): void {
    spawnPoints.forEach((spawnPoint) => {
      this.spawnEnemy(spawnPoint.position, spawnPoint.type);
    });
  }

  public update(deltaTime: number, player: Player): void {
    this.enemies.forEach((enemy) => {
      enemy.update(deltaTime, player);
    });
  }

  public removeDeadEnemies(): void {
    this.enemies = this.enemies.filter((enemy) => {
      // Check if enemy is dead and should be removed
      if (enemy.health <= 0) {
        // Remove from scene
        this.scene.remove(enemy.mesh);

        // You might want to add death effects or sounds here

        return false; // Remove from array
      }
      return true; // Keep in array
    });
  }

  public getEnemies(): Enemy[] {
    return this.enemies;
  }

  public clearEnemies(): void {
    this.enemies.forEach((enemy) => {
      this.scene.remove(enemy.mesh);
    });
    this.enemies = [];
  }
}
