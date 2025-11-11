import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

/**
 * Pobierz listę punktów dostaw
 */
export const route = functions.https.onCall(async () => {
  try {
    const snapshot = await db.collection("route").get();
    const points = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {points};
  } catch (err) {
    console.error(err);
    throw new functions.https.HttpsError(
      "internal",
      "Błąd pobierania punktów"
    );
  }
});

/**
 * Optymalizacja trasy (Nearest Neighbor)
 */
export const optimize = functions.https.onCall(async (request) => {
  try {
    const {points, start} = request.data;

    if (!Array.isArray(points)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Brak punktów"
      );
    }

    const order = nearestNeighbor(points, start);
    const optimized = order.map((id) =>
      points.find((p: Point) => p.id === id)
    );

    return {
      points: optimized,
      distance_km: routeLength(optimized),
    };
  } catch (err) {
    console.error(err);
    throw new functions.https.HttpsError(
      "internal",
      "Błąd optymalizacji"
    );
  }
});

/**
 * Potwierdź dostarczenie punktu
 */
export const confirm = functions.https.onCall(async (request) => {
  try {
    const {pointId} = request.data;

    if (!pointId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Brak ID punktu"
      );
    }

    await db.collection("route").doc(pointId).update({
      visited: true,
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {ok: true};
  } catch (err) {
    console.error(err);
    throw new functions.https.HttpsError(
      "internal",
      "Błąd potwierdzania punktu"
    );
  }
});

/**
 * Typ punktu
 */
interface Point {
  id: string;
  lat: number;
  lng: number;
  name?: string;
  visited?: boolean;
}

/**
 * Oblicz odległość między dwoma punktami (Haversine)
 * @param {Point} a - Punkt A
 * @param {Point} b - Punkt B
 * @return {number} Odległość w km
 */
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

/**
 * Algorytm najbliższego sąsiada
 * @param {Point[]} points - Lista punktów
 * @param {object} start - Punkt startowy
 * @return {string[]} Kolejność ID punktów
 */
function nearestNeighbor(
  points: Point[],
  start?: {lat: number; lng: number}
): string[] {
  const ids = points.map((p) => p.id);
  const visited: string[] = [];
  let current = start ?? {lat: points[0].lat, lng: points[0].lng};

  while (visited.length < ids.length) {
    let next = null;
    let best = Infinity;
    for (const p of points) {
      if (visited.includes(p.id)) continue;
      const d = dist(current as Point, p);
      if (d < best) {
        best = d;
        next = p;
      }
    }
    if (!next) break;
    visited.push(next.id);
    current = next;
  }
  return visited;
}

/**
 * Oblicz długość trasy
 * @param {Point[]} points - Lista punktów
 * @return {number} Długość trasy w km
 */
function routeLength(points: Point[]): number {
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) {
    d += dist(points[i], points[i + 1]);
  }
  return d;
}
