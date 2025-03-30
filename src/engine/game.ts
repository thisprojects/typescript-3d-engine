// File: src/engine/game.ts
import * as THREE from "three";
import { Renderer } from "./renderer";
import { InputManager } from "./input";
import { Player } from "./player";
import { Level } from "./level";

export class Game {
  private renderer: Renderer;
  private inputManager: InputManager;
  private player: Player;
  private level: Level;
  private lastFrameTime: number = 0;

  constructor(container: HTMLElement) {
    // Initialize systems
    this.renderer = new Renderer(container);
    this.inputManager = new InputManager();
    this.level = new Level();
    const spawnPoint = this.level.getSpawnPoint();
    this.player = new Player(this.renderer["camera"], spawnPoint); // Access camera from renderer

    // Add level objects to renderer
    this.level.objects.forEach((object) => {
      this.renderer.addObject(object);
    });

    // Start game loop
    this.gameLoop(0);
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
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  private update(deltaTime: number): void {
    // Update player based on input, passing collision system
    this.player.update(this.inputManager, this.level.collisionSystem);

    // Additional game logic would go here
  }
}
