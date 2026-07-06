"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Coordinate, OptimizedRoute, Stop } from "@/features/routing/domain/types";

// OpenFreeMap: community-hosted vector tiles. 100% free, no API key.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER: [number, number] = [-70.2463, -18.0066]; // Tacna, Perú
const DEFAULT_ZOOM = 13;
const ROUTE_SOURCE = "route";
const ROUTE_LAYER = "route-line";

interface RouteMapProps {
  driver: Coordinate | null;
  orderedStops: Stop[];
  route: OptimizedRoute | null;
  onMapClick: (coord: Coordinate) => void;
}

function driverMarkerElement(): HTMLElement {
  const el = document.createElement("div");
  el.textContent = "🚚";
  Object.assign(el.style, {
    fontSize: "22px",
    lineHeight: "1",
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#2563eb",
    borderRadius: "50%",
    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
    cursor: "default",
  } satisfies Partial<CSSStyleDeclaration>);
  return el;
}

function stopMarkerElement(order: number): HTMLElement {
  const el = document.createElement("div");
  el.textContent = String(order);
  Object.assign(el.style, {
    fontSize: "13px",
    fontWeight: "700",
    color: "#fff",
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ea580c",
    borderRadius: "50%",
    border: "2px solid #fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
    cursor: "default",
  } satisfies Partial<CSSStyleDeclaration>);
  return el;
}

export default function RouteMap({
  driver,
  orderedStops,
  route,
  onMapClick,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Keep the latest click handler without re-initializing the map.
  const clickHandlerRef = useRef(onMapClick);
  clickHandlerRef.current = onMapClick;

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );

    map.on("load", () => {
      loadedRef.current = true;
      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#2563eb", "line-width": 5, "line-opacity": 0.8 },
      });
    });

    map.on("click", (e) => {
      clickHandlerRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Sync markers (driver + numbered stops) on every relevant change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (driver) {
      const marker = new maplibregl.Marker({ element: driverMarkerElement() })
        .setLngLat([driver.lng, driver.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    orderedStops.forEach((stop, index) => {
      const marker = new maplibregl.Marker({
        element: stopMarkerElement(index + 1),
      })
        .setLngLat([stop.coordinate.lng, stop.coordinate.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 24 }).setText(
            stop.customerName || stop.label,
          ),
        )
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [driver, orderedStops]);

  // Sync the route line geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(ROUTE_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source) return;
      const coordinates = route?.geometry.map((c) => [c.lng, c.lat]) ?? [];
      source.setData({
        type: "FeatureCollection",
        features: coordinates.length
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates },
              },
            ]
          : [],
      });
    };

    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [route]);

  // Fit the map to the current points when they change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: [number, number][] = [];
    if (driver) points.push([driver.lng, driver.lat]);
    orderedStops.forEach((s) => points.push([s.coordinate.lng, s.coordinate.lat]));
    if (points.length < 2) return;

    const bounds = points.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(points[0], points[0]),
    );
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 500 });
  }, [driver, orderedStops]);

  return <div ref={containerRef} className="h-full w-full" />;
}
