"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LiveDriver } from "@/features/tracking/hooks/useTenantDrivers";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER: [number, number] = [-70.2463, -18.0066]; // Tacna, Perú

function driverEl(name: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = "🛵";
  Object.assign(el.style, {
    fontSize: "20px",
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#16a34a",
    borderRadius: "50%",
    border: "2px solid #fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
  } satisfies Partial<CSSStyleDeclaration>);
  el.title = name;
  return el;
}

export default function FleetMap({ drivers }: { drivers: LiveDriver[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: 12,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = drivers.map((d) =>
      new maplibregl.Marker({ element: driverEl(d.name) })
        .setLngLat([d.lng, d.lat])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setText(`🛵 ${d.name}`))
        .addTo(map),
    );

    if (drivers.length === 1) {
      map.easeTo({ center: [drivers[0].lng, drivers[0].lat], zoom: 14 });
    } else if (drivers.length > 1) {
      const bounds = drivers.reduce(
        (b, d) => b.extend([d.lng, d.lat]),
        new maplibregl.LngLatBounds(
          [drivers[0].lng, drivers[0].lat],
          [drivers[0].lng, drivers[0].lat],
        ),
      );
      map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 500 });
    }
  }, [drivers]);

  return <div ref={containerRef} className="h-full w-full" />;
}
