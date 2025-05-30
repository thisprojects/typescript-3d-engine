import * as THREE from "three";
import { Renderer } from "./renderer";
import { InputManager, Key } from "./input";
import { Player } from "./player";
import { Level } from "./level";
import { EnemyManager } from "./enemyManager";

export class Game {
  private renderer: Renderer;
  private inputManager: InputManager;
  private player: Player;
  private level: Level;
  private enemyManager: EnemyManager;
  private lastFrameTime: number = 0;
  private gameOver: boolean = false;

  constructor(container: HTMLElement) {
    // Initialize systems
    this.renderer = new Renderer(container);
    this.inputManager = new InputManager();
    this.level = new Level();
    const spawnPoint = this.level.getSpawnPoint();

    // Create the player with the camera from the renderer
    this.player = new Player(this.renderer.getCamera(), spawnPoint);

    // Add the player's camera holder to the scene
    this.renderer.addObject(this.player.getCameraHolder());

    this.enemyManager = new EnemyManager(
      this.renderer.getScene(),
      this.level.collisionSystem
    );

    // Spawn enemies from level data
    this.enemyManager.spawnEnemiesFromPoints(this.level.enemySpawnPoints);

    // Add level objects to renderer
    this.level.objects.forEach((object) => {
      this.renderer.addObject(object);
    });

    // Start game loop
    this.gameLoop(0);

    document.addEventListener("mousedown", (event) => {
      if (event.button === 0) {
        // Left mouse button
        this.player.shoot(this.enemyManager.getEnemies());
      }
    });
  }

  private gameLoop(timestamp: number): void {
    // Calculate delta time
    const deltaTime = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    // Update game state
    this.update(deltaTime);

    // Render frame
    this.renderer.render();

    // Request next frame
    if (!this.gameOver) {
      requestAnimationFrame(this.gameLoop.bind(this));
    }
  }
  private update(deltaTime: number): void {
    // Check if player is dead
    if (this.player.isPlayerDead()) {
      this.gameOver = true;
      // Show game over screen or restart prompt
      console.log("GAME OVER");
      return;
    }

    // Update player based on input, passing collision system
    this.player.update(
      this.inputManager,
      this.level.collisionSystem,
      deltaTime
    );

    // Update enemies
    this.enemyManager.update(deltaTime, this.player);
    this.enemyManager.removeDeadEnemies();
  }

  public restart(): void {
    // Reset player
    const spawnPoint = this.level.getSpawnPoint();

    // Remove old camera holder from scene
    this.renderer.removeObject(this.player.getCameraHolder());

    // Create new player
    this.player = new Player(this.renderer.getCamera(), spawnPoint);

    // Add new camera holder to scene
    this.renderer.addObject(this.player.getCameraHolder());

    // Reset enemies
    this.enemyManager.clearEnemies();
    this.enemyManager.spawnEnemiesFromPoints(this.level.enemySpawnPoints);

    // Reset game state
    this.gameOver = false;

    // Restart game loop
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
}
