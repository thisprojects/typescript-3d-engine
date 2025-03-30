// File: src/index.ts
import { Game } from "./engine/game";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("game-container");
  if (!container) {
    throw new Error("Game container element not found");
  }

  // Initialize game
  new Game(container);
});
