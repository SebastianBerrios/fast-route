import { NextResponse } from "next/server";
import {
  optimizeRoute,
  optimizeLockedRoute,
  OpenRouteServiceError,
} from "@/features/routing/services/openrouteservice";
import type {
  Coordinate,
  OptimizeInput,
  Stop,
  Vehicle,
} from "@/features/routing/domain/types";

interface LockedStop {
  id: string;
  coordinate: Coordinate;
}
type ParsedInput = OptimizeInput & { locked?: LockedStop };

function isCoordinate(v: unknown): v is Coordinate {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Coordinate).lng === "number" &&
    typeof (v as Coordinate).lat === "number"
  );
}

function parseInput(payload: unknown): ParsedInput {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid request body.");
  }
  const { vehicle, stops, locked } = payload as {
    vehicle?: unknown;
    stops?: unknown;
    locked?: unknown;
  };

  if (
    typeof vehicle !== "object" ||
    vehicle === null ||
    !isCoordinate((vehicle as Vehicle).start)
  ) {
    throw new Error("A vehicle with a valid start coordinate is required.");
  }
  const v = vehicle as Vehicle;
  if (v.end !== undefined && !isCoordinate(v.end)) {
    throw new Error("Vehicle end must be a valid coordinate when provided.");
  }

  let lockedStop: LockedStop | undefined;
  if (locked !== undefined && locked !== null) {
    if (
      typeof locked !== "object" ||
      typeof (locked as LockedStop).id !== "string" ||
      !isCoordinate((locked as LockedStop).coordinate)
    ) {
      throw new Error("Locked stop needs an id and a valid coordinate.");
    }
    lockedStop = locked as LockedStop;
  }

  if (!Array.isArray(stops)) {
    throw new Error("Stops must be an array.");
  }
  // Stops may be empty only when there's a locked stop to head to.
  if (stops.length === 0 && !lockedStop) {
    throw new Error("At least one stop is required.");
  }
  for (const s of stops) {
    if (
      typeof s !== "object" ||
      s === null ||
      typeof (s as Stop).id !== "string" ||
      !isCoordinate((s as Stop).coordinate)
    ) {
      throw new Error("Each stop needs an id and a valid coordinate.");
    }
  }

  return { vehicle: v, stops: stops as Stop[], locked: lockedStop };
}

export async function POST(request: Request) {
  let input: ParsedInput;
  try {
    input = parseInput(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request." },
      { status: 400 },
    );
  }

  try {
    const route = input.locked
      ? await optimizeLockedRoute({ ...input, locked: input.locked })
      : await optimizeRoute(input);
    return NextResponse.json(route);
  } catch (err) {
    const message =
      err instanceof OpenRouteServiceError
        ? err.message
        : "Failed to optimize route.";
    const status = err instanceof OpenRouteServiceError ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
