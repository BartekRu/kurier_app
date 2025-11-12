import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  updateDoc,
  serverTimestamp 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAyqCZewH2FbgOcKr4ZauzVQRhJvZsGIsE",
  authDomain: "kurier-2cc7f.firebaseapp.com",
  projectId: "kurier-2cc7f",
  storageBucket: "kurier-2cc7f.firebasestorage.app",
  messagingSenderId: "810156969883",
  appId: "1:810156969883:web:9ab06d373499525877db3e",
  measurementId: "G-W91PB9WY1M"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export type Point = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  visited?: boolean;
  info?: string;
};

export async function getRoute(): Promise<Point[]> {
  const snapshot = await getDocs(collection(db, "route"));
  const points: Point[] = [];
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    points.push({
      id: doc.id,
      name: data.name || "",
      lat: data.lat || 0,
      lng: data.lng || 0,
      visited: data.visited || false,
      info: data.info || "",
    });
  });
  
  return points;
}

export async function confirmPoint(pointId: string): Promise<void> {
  const pointRef = doc(db, "route", pointId);
  await updateDoc(pointRef, {
    visited: true,
    confirmedAt: serverTimestamp(),
  });
}

function dist(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function optimizeRoute(
  points: Point[],
  start?: { lat: number; lng: number }
): Point[] {
  if (points.length === 0) return [];
  
  const visited: Point[] = [];
  const remaining = [...points];
  let current = start ?? { lat: points[0].lat, lng: points[0].lng };

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = dist(current as Point, remaining[i]);
      if (d < minDistance) {
        minDistance = d;
        nearestIndex = i;
      }
    }

    const nearest = remaining.splice(nearestIndex, 1)[0];
    visited.push(nearest);
    current = nearest;
  }

  return visited;
}

export function calculateRouteLength(points: Point[]): number {
  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalDistance += dist(points[i], points[i + 1]);
  }
  return Math.round(totalDistance * 10) / 10; 
}