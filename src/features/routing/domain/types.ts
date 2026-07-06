/**
 * Core domain model for delivery route optimization.
 * These types are transport-agnostic: they describe the problem
 * (a driver, a set of delivery stops, an optimized route),
 * not any particular API or UI.
 */

/** A geographic point. Order is [lng, lat] when serialized for routing APIs. */
export interface Coordinate {
  lng: number;
  lat: number;
}

/** A single delivery destination. */
export interface Stop {
  id: string;
  coordinate: Coordinate;
  /** Human label shown in the UI (customer name, address, or note). */
  label: string;
  customerName?: string;
  note?: string;
}

/** The delivery vehicle / driver. */
export interface Vehicle {
  id: string;
  start: Coordinate;
  /** Optional return point. When set, the route ends here (e.g. back to depot). */
  end?: Coordinate;
}

export type RouteStepType = "start" | "job" | "end";

/** One waypoint in the computed route, in traversal order. */
export interface RouteStep {
  type: RouteStepType;
  /** Matches Stop.id for job steps; undefined for start/end. */
  stopId?: string;
  coordinate: Coordinate;
  /** Seconds elapsed since the driver left the start. */
  arrivalSeconds: number;
}

/** Result of optimizing a set of stops for one vehicle. */
export interface OptimizedRoute {
  /** Ordered list of stop ids, in the sequence they should be visited. */
  order: string[];
  steps: RouteStep[];
  /** Decoded path geometry for drawing on the map. */
  geometry: Coordinate[];
  durationSeconds: number;
  distanceMeters: number;
}

/** Input payload for an optimization request. */
export interface OptimizeInput {
  vehicle: Vehicle;
  stops: Stop[];
}
