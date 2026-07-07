"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Coordinate } from "@/features/routing/domain/types";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER: [number, number] = [-70.2463, -18.0066]; // Tacna, Perú

interface LocationPickerProps {
 value: Coordinate | null;
 /** When this changes to a coordinate, the map flies to it (e.g. geocoding). */
 focus?: Coordinate | null;
 /** Initial center when no pin is set yet (the tenant's region). */
 defaultCenter?: Coordinate;
 onChange: (coord: Coordinate) => void;
}

/** A small map where clicking drops/moves a pin to pick a location. */
export default function LocationPicker({
 value,
 focus,
 defaultCenter,
 onChange,
}: LocationPickerProps) {
 const containerRef = useRef<HTMLDivElement>(null);
 const mapRef = useRef<maplibregl.Map | null>(null);
 const markerRef = useRef<maplibregl.Marker | null>(null);
 const changeRef = useRef(onChange);
 changeRef.current = onChange;

 useEffect(() => {
 if (!containerRef.current || mapRef.current) return;

 const initialCenter: [number, number] = value
 ? [value.lng, value.lat]
 : defaultCenter
 ? [defaultCenter.lng, defaultCenter.lat]
 : DEFAULT_CENTER;
 const map = new maplibregl.Map({
 container: containerRef.current,
 style: MAP_STYLE,
 center: initialCenter,
 zoom: value ? 14 : 11,
 });
 mapRef.current = map;
 map.addControl(new maplibregl.NavigationControl(), "top-right");

 map.on("click", (e) => {
 changeRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
 });

 return () => {
 map.remove();
 mapRef.current = null;
 };
 }, []); // init once

 // Keep the marker in sync with the selected value.
 useEffect(() => {
 const map = mapRef.current;
 if (!map) return;

 if (!value) {
 markerRef.current?.remove();
 markerRef.current = null;
 return;
 }

 if (!markerRef.current) {
 markerRef.current = new maplibregl.Marker({ color: "#ea580c" });
 }
 markerRef.current.setLngLat([value.lng, value.lat]).addTo(map);
 }, [value]);

 // Fly to a focus coordinate (e.g. a geocoding result).
 useEffect(() => {
 const map = mapRef.current;
 if (!map || !focus) return;
 map.flyTo({ center: [focus.lng, focus.lat], zoom: 16, duration: 800 });
 }, [focus]);

 return (
 <div
 ref={containerRef}
 className="h-56 w-full overflow-hidden rounded-lg border border-line "
 />
 );
}
