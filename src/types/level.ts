import { Enemy } from "../engine/enemy";

export interface IPosition {
  x: number;
  y: number;
  z: number;
  rotation: number;
}

export interface ITexture {
  type: string;
  name: string;
  path: string;
}

interface Wall {
  x: number;
  y: number;
  z: number;
  depth: number;
  normal: { x: number; y: number; z: number };
  rotation: number;
  width: number;
  height: number;
  texture: string;
}

interface Floor {
  y: number;
  rotation: number;
  z: number;
  texture: string;
  width: number;
  length: number;
  x: number;
}

export interface IRoom {
  walls: Wall[];
  floors: Floor[];
}

interface Entity {
  type: string;
  position: { x: number; y: number; z: number };
  properties: Record<string, any>;
}

export interface IEnemyLocations {
  x: number;
  y: number;
  z: number;
  type: string;
}

// Add this to your types/level.ts file

export interface IStep {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
  texture: string;
  normal: {
    x: number;
    y: number;
    z: number;
  };
}

export interface IRoom {
  walls: IWall[];
  floors: IFloor[];
  steps?: IStep[]; // Make steps optional since old maps might not have them
}

export interface ILevel {
  name: string;
  spawnPoint: {
    x: number;
    y: number;
    z: number;
    rotation: number;
  };
  textures: ITexture[];
  rooms: IRoom[];
  enemies?: any[];
  entities?: any[];
}

// Existing interfaces
export interface IWall {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
  texture: string;
  normal: {
    x: number;
    y: number;
    z: number;
  };
}

export interface IFloor {
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  texture: string;
  rotation: number;
}

export interface ITexture {
  type: string;
  name: string;
  path: string;
}

export interface IPosition {
  x: number;
  y: number;
  z: number;
  rotation: number;
}
