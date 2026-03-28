// server.js
require("dotenv").config();

const express = require("express");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// OJO: 2 KEYS (como tú lo tienes)
const GOOGLE_MAPS_WEB_KEY = process.env.GOOGLE_MAPS_WEB_KEY || "";       // para cargar Maps JS en el navegador
const GOOGLE_MAPS_SERVER_KEY = process.env.GOOGLE_MAPS_SERVER_KEY || ""; // para geocode desde servidor

// Views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static
app.use(express.static(path.join(__dirname, "public")));

// Home
app.get("/", (req, res) => {
  const initialLocation = {
    name: "Xicotepec de Juárez, Puebla",
    lat: 20.2775,
    lng: -97.9569,
  };

  res.render("index", {
    initialLocation,
    initialLocationJSON: JSON.stringify(initialLocation),
    // IMPORTANTE: esto es lo que te faltaba
    googleMapsApiKey: GOOGLE_MAPS_WEB_KEY,
  });
});

// Health
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    port: String(PORT),
    webKeyLoaded: Boolean(GOOGLE_MAPS_WEB_KEY),
    serverKeyLoaded: Boolean(GOOGLE_MAPS_SERVER_KEY),
  });
});

/**
 * GET /nominatim-geocode?q=Direccion
 * Usa Nominatim (OpenStreetMap) para geocoding
 */
app.get("/nominatim-geocode", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ ok: false, error: "Falta query param ?q=" });

    const url = "https://nominatim.openstreetmap.org/search";
    const { data } = await axios.get(url, {
      params: {
        q: q,
        format: "json",
        limit: 10,
        countrycodes: "mx",
        accept_language: "es",
      },
      timeout: 15000,
      headers: {
        "User-Agent": "MapaPractica/1.0",
      },
    });

    if (!Array.isArray(data) || data.length === 0) {
      return res.json({
        ok: false,
        results: [],
      });
    }

    // Convertir respuesta de Nominatim al formato de Google Maps
    const results = data.map((place) => ({
      formatted_address: place.display_name,
      geometry: {
        location: {
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lon),
        },
      },
      name: place.name,
    }));

    res.json({
      ok: true,
      results: results,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Error en /nominatim-geocode",
      detail: err?.message || String(err),
    });
  }
});

/**
 * GET /nominatim-reverse?lat=..&lng=..
 * Usa Nominatim para reverse geocoding
 */
app.get("/nominatim-reverse", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ ok: false, error: "lat/lng inválidos" });
    }

    const url = "https://nominatim.openstreetmap.org/reverse";
    const { data } = await axios.get(url, {
      params: {
        lat: lat,
        lon: lng,
        format: "json",
        accept_language: "es",
      },
      timeout: 15000,
      headers: {
        "User-Agent": "MapaPractica/1.0",
      },
    });

    res.json({
      ok: true,
      address: data.address?.country_code === "mx" ? data.display_name : data.display_name,
      formatted_address: data.display_name,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Error en /nominatim-reverse",
      detail: err?.message || String(err),
    });
  }
});

/**
 * GET /geocode?q=Direccion
 */
app.get("/geocode", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ ok: false, error: "Falta query param ?q=" });

    // Si no hay Google Key, usa Nominatim
    if (!GOOGLE_MAPS_SERVER_KEY) {
      try {
        const { data } = await axios.get("https://nominatim.openstreetmap.org/search", {
          params: {
            q: q,
            format: "json",
            limit: 10,
            countrycodes: "mx",
            accept_language: "es",
          },
          timeout: 15000,
          headers: {
            "User-Agent": "MapaPractica/1.0",
          },
        });
        if (!Array.isArray(data) || data.length === 0) {
          return res.json({ ok: false, results: [] });
        }
        const results = data.map((place) => ({
          formatted_address: place.display_name,
          geometry: {
            location: {
              lat: parseFloat(place.lat),
              lng: parseFloat(place.lon),
            },
          },
        }));
        return res.json({ ok: true, results: results });
      } catch (err) {
        return res.status(500).json({ ok: false, error: "Error en geocoding", detail: err.message });
      }
    }

    const url = "https://maps.googleapis.com/maps/api/geocode/json";
    const { data } = await axios.get(url, {
      params: {
        address: q,
        key: GOOGLE_MAPS_SERVER_KEY,
        language: "es",
        region: "mx",
      },
      timeout: 15000,
    });

    res.json({
      ok: data.status === "OK",
      status: data.status,
      results_len: data.results?.length || 0,
      results: data.results || [],
      error_message: data.error_message || null,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Error en /geocode",
      detail: err?.message || String(err),
    });
  }
});

/**
 * GET /reverse-geocode?lat=..&lng=..
 */
app.get("/reverse-geocode", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ ok: false, error: "lat/lng inválidos" });
    }

    // Si no hay Google Key, usa Nominatim
    if (!GOOGLE_MAPS_SERVER_KEY) {
      try {
        const { data } = await axios.get("https://nominatim.openstreetmap.org/reverse", {
          params: {
            lat: lat,
            lon: lng,
            format: "json",
            accept_language: "es",
          },
          timeout: 15000,
          headers: {
            "User-Agent": "MapaPractica/1.0",
          },
        });
        return res.json({
          ok: true,
          address: data.display_name,
          formatted_address: data.display_name,
        });
      } catch (err) {
        return res.status(500).json({ ok: false, error: "Error en reverse geocoding", detail: err.message });
      }
    }

    const url = "https://maps.googleapis.com/maps/api/geocode/json";
    const { data } = await axios.get(url, {
      params: {
        latlng: `${lat},${lng}`,
        key: GOOGLE_MAPS_SERVER_KEY,
        language: "es",
      },
      timeout: 15000,
    });

    const formatted = data.results?.[0]?.formatted_address || null;

    res.json({
      ok: data.status === "OK",
      status: data.status,
      address: formatted,
      results: data.results || [],
      error_message: data.error_message || null,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: "Error en /reverse-geocode",
      detail: err?.message || String(err),
    });
  }
});

// Start
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
