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

export interface ILevel {
  name: string;
  textures: ITexture[];
  rooms: IRoom[];
  entities: Entity[];
  spawnPoint: IPosition;
  enemies: IEnemyLocations[];
}
