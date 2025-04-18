import * as THREE from "three";

export class OrientedBoundingBox {
  public center: THREE.Vector3;
  public halfSize: THREE.Vector3;
  public rotation: THREE.Quaternion;
  public axes: THREE.Vector3[];

  constructor(
    center: THREE.Vector3,
    halfSize: THREE.Vector3,
    rotation: THREE.Quaternion = new THREE.Quaternion()
  ) {
    this.center = center;
    this.halfSize = halfSize;
    this.rotation = rotation;
    this.axes = this.computeAxes();
  }

  /**
   * Creates an OBB from a THREE.Mesh object
   */
  public static fromMesh(mesh: THREE.Mesh): OrientedBoundingBox {
    // Get the mesh's geometry
    const geometry = mesh.geometry;

    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    // Get the bounding box dimensions in local space
    const boundingBox = geometry.boundingBox!;
    const halfSize = new THREE.Vector3()
      .subVectors(boundingBox.max, boundingBox.min)
      .multiplyScalar(0.5);

    // Apply the mesh's scale to the half-size
    halfSize.multiply(mesh.scale);

    // Get the center point of the bounding box in world space
    const center = mesh.position.clone();

    // Get the mesh's rotation as a quaternion
    const rotation = mesh.quaternion.clone();

    return new OrientedBoundingBox(center, halfSize, rotation);
  }

  /**
   * Compute the local axes of the OBB
   */
  private computeAxes(): THREE.Vector3[] {
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.rotation);
    const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rotation);
    const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(this.rotation);

    return [xAxis, yAxis, zAxis];
  }

  /**
   * Update the OBB based on the current mesh transformation
   */
  public update(mesh: THREE.Mesh): void {
    this.center.copy(mesh.position);
    this.rotation.copy(mesh.quaternion);
    this.axes = this.computeAxes();
  }

  /**
   * Project the OBB onto an axis
   */
  public projectOntoAxis(axis: THREE.Vector3): { min: number; max: number } {
    // Project center onto axis
    const centerProjection = this.center.dot(axis);

    // Calculate the radius of the projection (the "half-width" of the projected OBB)
    let radius = 0;
    for (let i = 0; i < 3; i++) {
      radius += Math.abs(
        this.axes[i].dot(axis) * this.halfSize.getComponent(i)
      );
    }

    return {
      min: centerProjection - radius,
      max: centerProjection + radius,
    };
  }

  /**
   * Check if two projections overlap
   */
  private static projectionsOverlap(
    p1: { min: number; max: number },
    p2: { min: number; max: number }
  ): boolean {
    return !(p1.max < p2.min || p2.max < p1.min);
  }

  /**
   * Calculate the penetration depth between two projections
   */
  private static penetrationDepth(
    p1: { min: number; max: number },
    p2: { min: number; max: number }
  ): number {
    if (!OrientedBoundingBox.projectionsOverlap(p1, p2)) {
      return 0;
    }

    // Return the minimum distance needed to separate the projections
    return Math.min(p1.max - p2.min, p2.max - p1.min);
  }

  /**
   * Check if this OBB intersects with another OBB
   */
  public intersectsOBB(other: OrientedBoundingBox): boolean {
    // Test all 15 potential separating axes
    // 6 face normals (3 from each box)
    const axes: THREE.Vector3[] = [...this.axes, ...other.axes];

    // 9 edge-edge cross products
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const crossAxis = new THREE.Vector3().crossVectors(
          this.axes[i],
          other.axes[j]
        );

        // Skip if the cross product is zero (parallel edges)
        if (crossAxis.lengthSq() > 0.0001) {
          crossAxis.normalize();
          axes.push(crossAxis);
        }
      }
    }

    // Test each axis
    for (const axis of axes) {
      const p1 = this.projectOntoAxis(axis);
      const p2 = other.projectOntoAxis(axis);

      // If we find a separating axis, the boxes don't intersect
      if (!OrientedBoundingBox.projectionsOverlap(p1, p2)) {
        return false;
      }
    }

    // No separating axis found, the boxes intersect
    return true;
  }

  /**
   * Check if this OBB intersects with a sphere
   */
  public intersectsSphere(sphere: THREE.Sphere): boolean {
    // Find the closest point on the OBB to the sphere center
    const closestPoint = this.closestPointToPoint(sphere.center);

    // Check if the closest point is within the sphere
    const distanceSquared = closestPoint.distanceToSquared(sphere.center);
    return distanceSquared <= sphere.radius * sphere.radius;
  }

  /**
   * Get collision info with a sphere
   */
  public sphereCollisionInfo(sphere: THREE.Sphere): {
    collision: boolean;
    penetration: THREE.Vector3 | null;
  } {
    // Find the closest point on the OBB to the sphere center
    const closestPoint = this.closestPointToPoint(sphere.center);

    // Vector from closest point to sphere center
    const toSphere = new THREE.Vector3().subVectors(
      sphere.center,
      closestPoint
    );
    const distance = toSphere.length();

    // Check for collision
    if (distance <= sphere.radius) {
      // Calculate penetration vector - points away from OBB to resolve collision
      let penetrationDepth = sphere.radius - distance;

      // If sphere center is inside OBB, we need a different approach
      if (distance < 0.0001) {
        // Sphere center is inside or extremely close to OBB surface
        // Find the face normal that requires the minimum displacement
        const penetration = this.getMinPenetrationVector(sphere.center);
        return {
          collision: true,
          penetration: penetration.multiplyScalar(penetrationDepth + 0.01), // Small buffer
        };
      }

      // Normal case: sphere intersects OBB from outside
      // Use the vector from closest point to sphere center as direction
      const penetrationDirection = toSphere.clone().normalize();
      const penetration = penetrationDirection.multiplyScalar(
        penetrationDepth + 0.01
      ); // Small buffer

      return {
        collision: true,
        penetration,
      };
    }

    return {
      collision: false,
      penetration: null,
    };
  }

  // Add this new method to your OrientedBoundingBox class
  private getMinPenetrationVector(point: THREE.Vector3): THREE.Vector3 {
    // When point is inside the OBB, find the face requiring minimum displacement
    // Transform point to local space
    const localPoint = new THREE.Vector3().subVectors(point, this.center);

    // Find the penetration depth along each axis
    const depths = [];
    for (let i = 0; i < 3; i++) {
      // Project point onto this axis
      const projection = localPoint.dot(this.axes[i]);

      // Distance to the "positive" face along this axis
      const distToPosFace = this.halfSize.getComponent(i) - projection;

      // Distance to the "negative" face along this axis
      const distToNegFace = this.halfSize.getComponent(i) + projection;

      // Store both with their axis and direction
      depths.push({
        axis: i,
        dist: distToPosFace,
        dir: 1, // Positive direction
      });

      depths.push({
        axis: i,
        dist: distToNegFace,
        dir: -1, // Negative direction
      });
    }

    // Sort by penetration depth (smallest first)
    depths.sort((a, b) => a.dist - b.dist);

    // The first element is our minimum penetration
    const minPen = depths[0];

    // Create the penetration vector in world space
    const penVector = this.axes[minPen.axis].clone().multiplyScalar(minPen.dir);

    return penVector;
  }

  /**
   * Find the closest point on the OBB to a given point
   */
  public closestPointToPoint(point: THREE.Vector3): THREE.Vector3 {
    // Transform the point into the OBB's local space
    const localPoint = new THREE.Vector3().subVectors(point, this.center);

    // Find the closest point in local space
    const closestLocal = new THREE.Vector3();

    for (let i = 0; i < 3; i++) {
      // Project the point onto the axis
      const projection = localPoint.dot(this.axes[i]);

      // Clamp to the box's half-size
      const clamped = Math.max(
        -this.halfSize.getComponent(i),
        Math.min(projection, this.halfSize.getComponent(i))
      );

      // Add the clamped projection to the closest point
      closestLocal.addScaledVector(this.axes[i], clamped);
    }

    // Transform back to world space
    return new THREE.Vector3().addVectors(this.center, closestLocal);
  }

  /**
   * Get the normal vector at a specific point on the OBB's surface
   * This is an approximation and works best for points exactly on the surface
   */
  private getNormalAtPoint(point: THREE.Vector3): THREE.Vector3 {
    // Transform point to local space
    const localPoint = new THREE.Vector3().subVectors(point, this.center);

    // Find which face this point is closest to
    const absX = Math.abs(localPoint.dot(this.axes[0]) / this.halfSize.x);
    const absY = Math.abs(localPoint.dot(this.axes[1]) / this.halfSize.y);
    const absZ = Math.abs(localPoint.dot(this.axes[2]) / this.halfSize.z);

    let normal = new THREE.Vector3();

    // The largest component indicates the closest face
    if (absX > absY && absX > absZ) {
      // X-face - determine sign
      const sign = Math.sign(localPoint.dot(this.axes[0]));
      normal = this.axes[0].clone().multiplyScalar(sign);
    } else if (absY > absZ) {
      // Y-face
      const sign = Math.sign(localPoint.dot(this.axes[1]));
      normal = this.axes[1].clone().multiplyScalar(sign);
    } else {
      // Z-face
      const sign = Math.sign(localPoint.dot(this.axes[2]));
      normal = this.axes[2].clone().multiplyScalar(sign);
    }

    return normal;
  }

  /**
   * Draw debug visualization of the OBB
   */
  public createDebugMesh(): THREE.LineSegments {
    // Create the 8 vertices of the box
    const vertices = [];

    for (let i = 0; i < 8; i++) {
      const x = ((i & 1) * 2 - 1) * this.halfSize.x;
      const y = (((i >> 1) & 1) * 2 - 1) * this.halfSize.y;
      const z = (((i >> 2) & 1) * 2 - 1) * this.halfSize.z;

      const vertex = new THREE.Vector3(x, y, z)
        .applyQuaternion(this.rotation)
        .add(this.center);

      vertices.push(vertex);
    }

    // Create the 12 edges of the box
    const indices = [
      0,
      1,
      1,
      3,
      3,
      2,
      2,
      0, // bottom face
      4,
      5,
      5,
      7,
      7,
      6,
      6,
      4, // top face
      0,
      4,
      1,
      5,
      2,
      6,
      3,
      7, // connecting edges
    ];

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(indices.length * 3);

    for (let i = 0; i < indices.length; i++) {
      const vertex = vertices[indices[i]];
      positions[i * 3] = vertex.x;
      positions[i * 3 + 1] = vertex.y;
      positions[i * 3 + 2] = vertex.z;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    return new THREE.LineSegments(geometry, material);
  }
}
