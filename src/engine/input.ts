export enum Key {
  W = "KeyW",
  A = "KeyA",
  S = "KeyS",
  D = "KeyD",
  SPACE = "Space",
  SHIFT = "ShiftLeft",
}

export class InputManager {
  private keys: Map<string, boolean>;
  private mouseX: number = 0;
  private mouseY: number = 0;
  private mouseMovement: { x: number; y: number } = { x: 0, y: 0 };

  constructor() {
    this.keys = new Map();

    window.addEventListener("keydown", this.onKeyDown.bind(this));
    window.addEventListener("keyup", this.onKeyUp.bind(this));
    window.addEventListener("mousemove", this.onMouseMove.bind(this));

    // Lock pointer for FPS controls
    document.addEventListener("click", () => {
      document.body.requestPointerLock();
    });
  }

  public isKeyPressed(key: Key): boolean {
    return this.keys.get(key) || false;
  }

  public getMouseMovement(): { x: number; y: number } {
    const movement = { ...this.mouseMovement };
    // Reset movement after reading
    this.mouseMovement = { x: 0, y: 0 };
    return movement;
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.keys.set(event.code, true);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.set(event.code, false);
  }

  private onMouseMove(event: MouseEvent): void {
    this.mouseX = event.clientX;
    this.mouseY = event.clientY;

    if (document.pointerLockElement === document.body) {
      this.mouseMovement.x += event.movementX;
      this.mouseMovement.y += event.movementY;
    }
  }
}
