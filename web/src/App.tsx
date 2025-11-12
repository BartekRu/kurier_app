import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { 
  getRoute, 
  confirmPoint, 
  optimizeRoute, 
  calculateRouteLength,
  type Point  
} from "./firebase";

const meIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
  iconSize: [32, 32],
});

const pointIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [28, 28],
});

const visitedIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/190/190411.png",
  iconSize: [28, 28],
});

export default function App() {
  const [points, setPoints] = useState<Point[]>([]);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  const [distance, setDistance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);

  useEffect(() => {
    console.log("🔄 Pobieranie punktów z Firestore...");
    getRoute()
      .then((data) => {
        console.log("✅ Pobrano punkty:", data);
        if (data.length === 0) {
          setError("Brak punktów w bazie danych. Dodaj punkty w Firestore.");
        }
        setPoints(data);
        const unvisited = data.filter(p => !p.visited);
        setDistance(calculateRouteLength(unvisited));
        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Błąd pobierania punktów:", err);
        setError(`Błąd: ${err.message}`);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      console.log("📍 Uruchamiam GPS...");
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          console.log("✅ GPS:", pos.coords.latitude, pos.coords.longitude);
          setPosition([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.error("❌ Błąd GPS:", err);
        },
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  const markVisited = async (id: string) => {
    try {
      await confirmPoint(id);
      setPoints((prev) => {
        const updated = prev.map((p) => (p.id === id ? { ...p, visited: true } : p));
        const unvisited = updated.filter(p => !p.visited);
        setDistance(calculateRouteLength(unvisited));
        return updated;
      });
      console.log("✅ Punkt oznaczony:", id);
      
      const nextIndex = points.findIndex(p => !p.visited && p.id !== id);
      if (nextIndex !== -1) {
        setCurrentPointIndex(nextIndex);
      }
    } catch (err) {
      console.error("❌ Błąd potwierdzania:", err);
      alert("Nie udało się potwierdzić punktu");
    }
  };

  const handleOptimize = () => {
    const startPoint = position ? { lat: position[0], lng: position[1] } : undefined;
    const unvisitedPoints = points.filter(p => !p.visited);
    const visitedPoints = points.filter(p => p.visited);
    
    if (unvisitedPoints.length === 0) {
      alert("Wszystkie punkty zostały już odwiedzone!");
      return;
    }
    
    const optimized = optimizeRoute(unvisitedPoints, startPoint);
    setPoints([...optimized, ...visitedPoints]);
    setDistance(calculateRouteLength(optimized));
    setCurrentPointIndex(0);
    console.log("🔄 Trasa zoptymalizowana (tylko nieodwiedzone punkty)");
  };

  const navigateToPoint = (point: Point) => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      window.open(
        `maps://maps.apple.com/?daddr=${point.lat},${point.lng}&dirflg=d`,
        '_blank'
      );
    } else if (isAndroid) {
      window.open(
        `google.navigation:q=${point.lat},${point.lng}`,
        '_blank'
      );
    } else {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=driving`,
        '_blank'
      );
    }
  };

  const findNearestUnvisited = () => {
    if (!position) {
      alert("Czekam na lokalizację GPS...");
      return;
    }

    const unvisited = points.filter(p => !p.visited);
    if (unvisited.length === 0) {
      alert("Wszystkie punkty zostały odwiedzone! 🎉");
      return;
    }

    let nearest = unvisited[0];
    let minDist = calculateDistance(
      position[0], 
      position[1], 
      nearest.lat, 
      nearest.lng
    );

    for (const point of unvisited) {
      const dist = calculateDistance(
        position[0], 
        position[1], 
        point.lat, 
        point.lng
      );
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    const index = points.findIndex(p => p.id === nearest.id);
    setCurrentPointIndex(index);
    navigateToPoint(nearest);
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  if (loading) {
    return (
      <div style={{ 
        height: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        flexDirection: "column",
        gap: "20px"
      }}>
        <h2>Ładowanie mapy...</h2>
        <div style={{ fontSize: "14px", color: "#666" }}>
          Sprawdź console (F12) jeśli ładowanie trwa długo
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        height: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        flexDirection: "column",
        gap: "20px",
        padding: "20px"
      }}>
        <h2>⚠️ Błąd</h2>
        <p style={{ color: "red" }}>{error}</p>
        <a 
          href="https://console.firebase.google.com/project/kurier-2cc7f/firestore"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "10px 20px",
            backgroundColor: "#2196F3",
            color: "white",
            textDecoration: "none",
            borderRadius: "4px"
          }}
        >
          Otwórz Firestore i dodaj punkty
        </a>
      </div>
    );
  }

  const unvisitedPoints = points.filter(p => !p.visited);
  const nextPoint = unvisitedPoints[0];

  return (
    <div style={{ height: "100vh" }}>
      <MapContainer
        center={position || [52.23, 21.01]}
        zoom={12}
        style={{ height: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />

        {position && (
          <Marker position={position} icon={meIcon}>
            <Popup>📍 Twoja pozycja</Popup>
          </Marker>
        )}

        {points.map((p, index) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={p.visited ? visitedIcon : pointIcon}
          >
            <Popup>
              <div style={{ minWidth: "180px" }}>
                <h3 style={{ margin: "0 0 8px 0" }}>
                  #{index + 1} {p.name}
                </h3>
                {p.info && <p style={{ margin: "4px 0", fontSize: "12px" }}>{p.info}</p>}
                
                {!p.visited && (
                  <>
                    <button
                      onClick={() => navigateToPoint(p)}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "#FF9800",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        marginTop: "8px",
                        width: "100%",
                        fontWeight: "bold",
                      }}
                    >
                      🧭 Nawiguj
                    </button>
                    <button
                      onClick={() => markVisited(p.id)}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "#4CAF50",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        marginTop: "8px",
                        width: "100%",
                        fontWeight: "bold",
                      }}
                    >
                      ✓ Potwierdź dostawę
                    </button>
                  </>
                )}
                {p.visited && (
                  <p style={{ color: "green", fontWeight: "bold", marginTop: "8px" }}>
                    ✓ Dostarczone
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {unvisitedPoints.length > 1 && (
          <Polyline
            positions={unvisitedPoints.map((p) => [p.lat, p.lng])}
            color="blue"
            weight={4}
            opacity={0.7}
          />
        )}
      </MapContainer>

      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 9999,
          background: "white",
          padding: "12px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          minWidth: "200px",
        }}
      >
        <button
          onClick={handleOptimize}
          disabled={unvisitedPoints.length < 2}
          style={{
            padding: "10px 16px",
            backgroundColor: unvisitedPoints.length < 2 ? "#ccc" : "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: unvisitedPoints.length < 2 ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "bold",
            width: "100%",
            marginBottom: "8px",
          }}
        >
          🔁 Optymalizuj trasę
        </button>

        {nextPoint && (
          <button
            onClick={findNearestUnvisited}
            style={{
              padding: "10px 16px",
              backgroundColor: "#FF9800",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold",
              width: "100%",
              marginBottom: "8px",
            }}
          >
            🧭 Nawiguj do najbliższego
          </button>
        )}

        <div style={{ marginTop: "8px", fontSize: "12px", padding: "4px 0" }}>
          📏 Długość: <strong>{distance} km</strong>
        </div>
        <div style={{ fontSize: "12px", padding: "4px 0" }}>
          📦 Pozostało: <strong>{unvisitedPoints.length}</strong> / {points.length}
        </div>
        
        {nextPoint && (
          <div style={{ 
            marginTop: "8px", 
            padding: "8px", 
            backgroundColor: "#f0f0f0", 
            borderRadius: "4px",
            fontSize: "12px"
          }}>
            <strong>Następny:</strong><br/>
            {nextPoint.name}
          </div>
        )}

        {unvisitedPoints.length === 0 && points.length > 0 && (
          <div style={{ 
            marginTop: "8px", 
            padding: "8px", 
            backgroundColor: "#4CAF50", 
            borderRadius: "4px",
            color: "white",
            fontWeight: "bold",
            textAlign: "center"
          }}>
            🎉 Trasa ukończona!
          </div>
        )}
      </div>
    </div>
  );
}