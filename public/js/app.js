// public/js/app.js
(() => {
  "use strict";

  /* =====================
     CONFIG INICIAL
     ===================== */
  const initial = window.__INITIAL__ || {
    lat: 20.2775,
    lng: -97.9569,
    name: "Xicotepec de Juárez, Puebla",
  };

  const $ = (id) => document.getElementById(id);

  /* =====================
     DOM
     ===================== */
  const searchInput = $("searchInput");
  const btnSearch = $("btnSearch");

  const latInput = $("latInput");
  const lngInput = $("lngInput");
  const btnGoCoords = $("btnGoCoords");
  const btnMyLocation = $("btnMyLocation");

  const currentCoords = $("currentCoords");
  const currentAddress = $("currentAddress");

  // Google chips
  const btnGoogleRoad = $("btnGoogleRoad");
  const btnGoogleSat = $("btnGoogleSat");
  const btnGoogleTer = $("btnGoogleTer");

  // Leaflet chips
  const btnLeafRoad = $("btnLeafRoad");
  const btnLeafSat = $("btnLeafSat");
  const btnLeafTer = $("btnLeafTer");

  // Historial/Favoritos UI
  const historyList = $("historyList");
  const favoritesList = $("favoritesList");
  const btnClearHistory = $("btnClearHistory");
  const btnClearFavorites = $("btnClearFavorites");

  // Guardar / Favorito (panel coords)
  const btnSavePoint = $("btnSavePoint");
  const btnToggleFavorite = $("btnToggleFavorite");

  // Distancia / cobertura / export
  const distanceValue = $("distanceValue");
  const coverageRadius = $("coverageRadius");
  const btnToggleCoverage = $("btnToggleCoverage");
  const btnExportJSON = $("btnExportJSON");
  const btnExportCSV = $("btnExportCSV");
  const btnExportGeoJSON = $("btnExportGeoJSON");

  // Street View UI (Google)
  const googlePanoEl = $("googlePano");
  const gmResizer = $("gmResizer");
  const btnPegman = $("btnPegman");
  const btnClosePano = $("btnClosePano");
  const gmapsMsg = $("gmapsMsg");

  /* =====================
     STATE MAPS
     ===================== */
  let gmap = null;
  let gmarker = null;
  let gCoverageCircle = null;

  // Street View state
  let gPanorama = null;
  let gSvService = null;
  let lastPanoRequestAt = 0;
  const PANO_COOLDOWN_MS = 1400;

  let lmap = null;
  let lmarker = null;
  let lRoad = null;
  let lSat = null;
  let lTer = null;
  let lCoverageCircle = null;

  let placesAutocomplete = null;

  // Cobertura
  let coverageEnabled = false;

  /* =====================
     STORAGE
     ===================== */
  const LS_HISTORY = "maps_demo_history_v1";
  const LS_FAVORITES = "maps_demo_favorites_v1";
  const LS_POINTS = "maps_demo_points_v1";

  const loadLS = (key, fallback = []) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const saveLS = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  /* =====================
     HELPERS UI
     ===================== */
  const setChips = (active, ...others) => {
    active?.classList.add("active");
    others.forEach((b) => b?.classList.remove("active"));
  };

  const setUIPosition = (lat, lng) => {
    latInput.value = Number(lat).toFixed(6);
    lngInput.value = Number(lng).toFixed(6);
    currentCoords.textContent = `Lat: ${Number(lat).toFixed(6)} | Lng: ${Number(lng).toFixed(6)}`;
  };

  const isValidLatLng = (lat, lng) =>
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  function nowString() {
    const d = new Date();
    return d.toLocaleString();
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function setMsg(t) {
    if (gmapsMsg) gmapsMsg.textContent = t || "";
  }

  function openPanoUI() {
    googlePanoEl?.classList.remove("hidden");
    gmResizer?.classList.remove("hidden");
    btnClosePano?.classList.remove("hidden");

    // OJO: si lo creas oculto se buguea, por eso se crea al abrir
    if (!gPanorama && googlePanoEl) {
      gPanorama = new google.maps.StreetViewPanorama(googlePanoEl, {
        visible: true,
        disableDefaultUI: false,
      });
      gmap.setStreetView(gPanorama);
      gSvService = new google.maps.StreetViewService();
    } else if (gPanorama) {
      gPanorama.setVisible(true);
    }

    setTimeout(() => {
      if (gPanorama) google.maps.event.trigger(gPanorama, "resize");
      if (gmap) google.maps.event.trigger(gmap, "resize");
    }, 80);
  }

  function closePanoUI() {
    if (gPanorama) gPanorama.setVisible(false);
    googlePanoEl?.classList.add("hidden");
    gmResizer?.classList.add("hidden");
    btnClosePano?.classList.add("hidden");
    setMsg("");
  }

  function requestPanoramaNear(latLng) {
    const now = Date.now();
    if (now - lastPanoRequestAt < PANO_COOLDOWN_MS) {
      setMsg("Espera… (evitando demasiadas solicitudes a Street View)");
      return;
    }
    lastPanoRequestAt = now;

    if (!gSvService || !gPanorama) return;

    setMsg("Buscando Street View cercano…");

    gSvService.getPanorama({ location: latLng, radius: 120 }, (data, status) => {
      if (status === google.maps.StreetViewStatus.OK && data?.location?.pano) {
        openPanoUI();
        gPanorama.setPano(data.location.pano);
        gPanorama.setPov({ heading: 0, pitch: 0 });
        gPanorama.setVisible(true);
        setTimeout(() => google.maps.event.trigger(gPanorama, "resize"), 80);
        setMsg("Street View listo ✅");
      } else {
        setMsg("No hay Street View cerca de ese punto.");
      }
    });
  }

  /* =====================
     SERVER CALLS
     ===================== */
  async function geocode(query) {
    const res = await fetch(`/geocode?q=${encodeURIComponent(query)}`);
    return res.json();
  }

  async function reverseGeocode(lat, lng) {
    const res = await fetch(`/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
    return res.json();
  }

  async function setAddressFromReverse(lat, lng) {
    try {
      const data = await reverseGeocode(lat, lng);
      if (data.ok) {
        currentAddress.textContent =
          data.address || data.formatted_address || "Dirección no disponible";
      } else {
        currentAddress.textContent = "Dirección no disponible";
      }
    } catch {
      currentAddress.textContent = "Error obteniendo dirección";
    }
  }

  /* =====================
     MAP MOVE
     ===================== */
  function moveGoogle(lat, lng) {
    if (!gmap) return;
    const pos = { lat, lng };

    gmap.panTo(pos);
    gmap.setZoom(Math.max(gmap.getZoom() || 14, 14));

    if (!gmarker) {
      gmarker = new google.maps.Marker({
        position: pos,
        map: gmap,
        draggable: true,
        title: "Arrástrame",
      });

      gmarker.addListener("dragend", async (e) => {
        await goTo(e.latLng.lat(), e.latLng.lng(), true, "ui");
        setMsg("Marcador actualizado. Street View con el botón.");
      });
    } else {
      gmarker.setPosition(pos);
    }

    updateCoverage(lat, lng);
  }

  function moveLeaflet(lat, lng) {
    if (!lmap) return;
    const pos = [lat, lng];

    lmap.setView(pos, Math.max(lmap.getZoom() || 14, 14));

    if (!lmarker) {
      lmarker = L.marker(pos, { draggable: true }).addTo(lmap);
      lmarker.on("dragend", async () => {
        const p = lmarker.getLatLng();
        await goTo(p.lat, p.lng, true, "ui");
      });
    } else {
      lmarker.setLatLng(pos);
    }

    updateCoverage(lat, lng);
  }

  async function goTo(lat, lng, updateAddress = true, source = "ui") {
    lat = Number(lat);
    lng = Number(lng);

    if (!isValidLatLng(lat, lng)) {
      alert("Coordenadas inválidas");
      return;
    }

    setUIPosition(lat, lng);

    // sincroniza ambos mapas (evita loops)
    if (source !== "google") moveGoogle(lat, lng);
    if (source !== "leaflet") moveLeaflet(lat, lng);

    if (updateAddress) await setAddressFromReverse(lat, lng);

    refreshFavoriteButton();
  }

  /* =====================
     LEAFLET INIT
     ===================== */
  function initLeaflet() {
    lmap = L.map("leafletMap", {
      zoomControl: true,
      attributionControl: true,
    }).setView([initial.lat, initial.lng], 14);

    lRoad = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    });

    lSat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri",
      }
    );

    lTer = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: "&copy; OpenTopoMap",
    });

    lRoad.addTo(lmap);

    lmarker = L.marker([initial.lat, initial.lng], { draggable: true }).addTo(lmap);
    lmarker.on("dragend", async () => {
      const p = lmarker.getLatLng();
      await goTo(p.lat, p.lng, true, "ui");
    });

    lmap.on("click", async (e) => {
      await goTo(e.latlng.lat, e.latlng.lng, true, "ui");
    });

    btnLeafRoad?.addEventListener("click", () => {
      if (lmap.hasLayer(lSat)) lmap.removeLayer(lSat);
      if (lmap.hasLayer(lTer)) lmap.removeLayer(lTer);
      if (!lmap.hasLayer(lRoad)) lRoad.addTo(lmap);
      setChips(btnLeafRoad, btnLeafSat, btnLeafTer);
    });

    btnLeafSat?.addEventListener("click", () => {
      if (lmap.hasLayer(lRoad)) lmap.removeLayer(lRoad);
      if (lmap.hasLayer(lTer)) lmap.removeLayer(lTer);
      if (!lmap.hasLayer(lSat)) lSat.addTo(lmap);
      setChips(btnLeafSat, btnLeafRoad, btnLeafTer);
    });

    btnLeafTer?.addEventListener("click", () => {
      if (lmap.hasLayer(lRoad)) lmap.removeLayer(lRoad);
      if (lmap.hasLayer(lSat)) lmap.removeLayer(lSat);
      if (!lmap.hasLayer(lTer)) lTer.addTo(lmap);
      setChips(btnLeafTer, btnLeafRoad, btnLeafSat);
    });
  }

  /* =====================
     GOOGLE INIT
     ===================== */
  function initPlacesAutocomplete() {
    if (!window.google || !google.maps || !google.maps.places) return;

    placesAutocomplete = new google.maps.places.Autocomplete(searchInput, {
      fields: ["formatted_address", "geometry", "name"],
      componentRestrictions: { country: "mx" },
    });

    placesAutocomplete.addListener("place_changed", async () => {
      const place = placesAutocomplete.getPlace();
      const loc = place?.geometry?.location;
      if (!loc) return;

      currentAddress.textContent =
        place.formatted_address || place.name || searchInput.value || "Ubicación seleccionada";

      await goTo(loc.lat(), loc.lng(), false, "ui");

      addToHistory({
        label: currentAddress.textContent,
        lat: loc.lat(),
        lng: loc.lng(),
      });
    });
  }

  window.initGoogleMap = function initGoogleMap() {
    if (!window.google || !google.maps) {
      console.error("Google Maps no cargó.");
      return;
    }

    gmap = new google.maps.Map($("googleMap"), {
      center: { lat: initial.lat, lng: initial.lng },
      zoom: 14,
      mapTypeId: "roadmap",
      streetViewControl: true, // pegman nativo, pero pano lo controlamos nosotros
      fullscreenControl: true,
      mapTypeControl: false,
      zoomControl: true,
    });

    gmarker = new google.maps.Marker({
      position: { lat: initial.lat, lng: initial.lng },
      map: gmap,
      draggable: true,
      title: "Arrástrame",
    });

    // ✅ FIX: click en mapa SÍ mueve el marcador
    gmap.addListener("click", async (e) => {
      if (!e?.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      // mueve marcador inmediatamente
      gmarker.setPosition(e.latLng);

      // sincroniza todo (no uses source="google")
      await goTo(lat, lng, true, "ui");
      setMsg("Punto seleccionado. Street View con el botón.");
    });

    // drag marcador
    gmarker.addListener("dragend", async (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      await goTo(lat, lng, true, "ui");
      setMsg("Marcador actualizado. Street View con el botón.");
    });

    // chips de capas
    btnGoogleRoad?.addEventListener("click", () => {
      gmap.setMapTypeId("roadmap");
      setChips(btnGoogleRoad, btnGoogleSat, btnGoogleTer);
    });

    btnGoogleSat?.addEventListener("click", () => {
      gmap.setMapTypeId("hybrid");
      setChips(btnGoogleSat, btnGoogleRoad, btnGoogleTer);
    });

    btnGoogleTer?.addEventListener("click", () => {
      gmap.setMapTypeId("terrain");
      setChips(btnGoogleTer, btnGoogleRoad, btnGoogleSat);
    });

    initPlacesAutocomplete();

    // Street View controlado por botón
    btnPegman?.addEventListener("click", () => {
      const pos = gmarker?.getPosition();
      if (!pos) return;

      openPanoUI();

      if (!gSvService) gSvService = new google.maps.StreetViewService();
      if (!gPanorama && googlePanoEl) {
        gPanorama = new google.maps.StreetViewPanorama(googlePanoEl, {
          visible: true,
          disableDefaultUI: false,
        });
        gmap.setStreetView(gPanorama);
      }

      requestPanoramaNear(pos);
    });

    btnClosePano?.addEventListener("click", () => {
      closePanoUI();
    });

    // ✅ Resizer arrastrable (ajusta solo pano)
    if (gmResizer && googlePanoEl) {
      let dragging = false;

      const onMove = (clientY) => {
        if (!dragging) return;

        const rect = googlePanoEl.parentElement.getBoundingClientRect();
        const minPano = 180;
        const maxPano = Math.max(220, rect.height - 260);

        // altura deseada tomando el mouse
        let desired = rect.bottom - clientY;
        desired = Math.max(minPano, Math.min(maxPano, desired));

        googlePanoEl.style.height = desired + "px";

        if (gPanorama) google.maps.event.trigger(gPanorama, "resize");
      };

      gmResizer.addEventListener("mousedown", () => {
        if (googlePanoEl.classList.contains("hidden")) return;
        dragging = true;
        document.body.style.userSelect = "none";
        setMsg("Arrastrando tamaño de Street View…");
      });

      window.addEventListener("mousemove", (ev) => onMove(ev.clientY));
      window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = "";
        setMsg("Street View listo ✅");
      });

      // touch
      gmResizer.addEventListener("touchstart", () => {
        if (googlePanoEl.classList.contains("hidden")) return;
        dragging = true;
        document.body.style.userSelect = "none";
      }, { passive: true });

      window.addEventListener("touchmove", (ev) => {
        if (!dragging) return;
        const t = ev.touches?.[0];
        if (!t) return;
        onMove(t.clientY);
      }, { passive: true });

      window.addEventListener("touchend", () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = "";
      });
    }

    setUIPosition(initial.lat, initial.lng);
    refreshFavoriteButton();
    setMsg("Google Maps cargado ✅");
  };

  /* =====================
     HISTORIAL / FAVORITOS / PUNTOS
     ===================== */
  function getCurrentLatLng() {
    return {
      lat: Number(latInput.value),
      lng: Number(lngInput.value),
      label: (currentAddress?.textContent || "").trim() || "Ubicación",
      ts: Date.now(),
      time: nowString(),
    };
  }

  function normalizeKey(lat, lng) {
    return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  }

  function addToHistory({ label, lat, lng }) {
    const history = loadLS(LS_HISTORY, []);
    const item = {
      id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
      label: label || "Ubicación",
      lat: Number(lat),
      lng: Number(lng),
      ts: Date.now(),
      time: nowString(),
    };

    const last = history[0];
    if (last && normalizeKey(last.lat, last.lng) === normalizeKey(item.lat, item.lng)) {
      renderHistory();
      return;
    }

    history.unshift(item);
    saveLS(LS_HISTORY, history.slice(0, 20));
    renderHistory();
  }

  function addToPoints(point) {
    const points = loadLS(LS_POINTS, []);
    const item = {
      id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
      label: point.label,
      lat: point.lat,
      lng: point.lng,
      ts: point.ts,
      time: point.time,
    };
    points.unshift(item);
    saveLS(LS_POINTS, points.slice(0, 100));
    renderDistanceFromPoints();
  }

  function isFavorite(lat, lng) {
    const favs = loadLS(LS_FAVORITES, []);
    const k = normalizeKey(lat, lng);
    return favs.some((f) => normalizeKey(f.lat, f.lng) === k);
  }

  function toggleFavoriteCurrent() {
    const cur = getCurrentLatLng();
    const favs = loadLS(LS_FAVORITES, []);
    const k = normalizeKey(cur.lat, cur.lng);

    const idx = favs.findIndex((f) => normalizeKey(f.lat, f.lng) === k);

    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.unshift({
        id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
        label: cur.label,
        lat: cur.lat,
        lng: cur.lng,
        ts: Date.now(),
        time: nowString(),
      });
    }

    saveLS(LS_FAVORITES, favs.slice(0, 50));
    renderFavorites();
    refreshFavoriteButton();
  }

  function refreshFavoriteButton() {
    if (!btnToggleFavorite) return;
    const cur = getCurrentLatLng();
    const fav = isFavorite(cur.lat, cur.lng);
    btnToggleFavorite.textContent = fav ? "★ Favorito" : "☆ Favorito";
  }

  function renderHistory() {
    if (!historyList) return;
    const history = loadLS(LS_HISTORY, []);

    if (!history.length) {
      historyList.innerHTML = `<div class="item"><div class="meta"><div class="title">Sin historial aún.</div><div class="sub">Haz una búsqueda o selecciona una ubicación.</div></div></div>`;
      return;
    }

    historyList.innerHTML = history
      .map(
        (h) => `
        <div class="item">
          <div class="meta">
            <div class="title">${escapeHtml(h.label)}</div>
            <div class="sub">${Number(h.lat).toFixed(6)}, ${Number(h.lng).toFixed(6)} • ${escapeHtml(h.time)}</div>
          </div>
          <div class="actions">
            <button class="icon-btn" data-act="go" data-lat="${h.lat}" data-lng="${h.lng}">Ir</button>
            <button class="icon-btn" data-act="fav" data-lat="${h.lat}" data-lng="${h.lng}" data-label="${escapeHtmlAttr(h.label)}">★</button>
            <button class="icon-btn" data-act="del" data-id="${h.id}">✕</button>
          </div>
        </div>
      `
      )
      .join("");

    historyList.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async () => {
        const act = b.dataset.act;
        if (act === "go") {
          await goTo(Number(b.dataset.lat), Number(b.dataset.lng), true, "ui");
        }
        if (act === "fav") {
          const favs = loadLS(LS_FAVORITES, []);
          const lat = Number(b.dataset.lat);
          const lng = Number(b.dataset.lng);
          const label = b.dataset.label || "Favorito";
          if (!isFavorite(lat, lng)) {
            favs.unshift({
              id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
              label,
              lat,
              lng,
              ts: Date.now(),
              time: nowString(),
            });
            saveLS(LS_FAVORITES, favs.slice(0, 50));
            renderFavorites();
            refreshFavoriteButton();
          } else {
            const k = normalizeKey(lat, lng);
            const filtered = favs.filter((f) => normalizeKey(f.lat, f.lng) !== k);
            saveLS(LS_FAVORITES, filtered);
            renderFavorites();
            refreshFavoriteButton();
          }
        }
        if (act === "del") {
          const history = loadLS(LS_HISTORY, []);
          saveLS(LS_HISTORY, history.filter((x) => x.id !== b.dataset.id));
          renderHistory();
        }
      });
    });
  }

  function renderFavorites() {
    if (!favoritesList) return;
    const favs = loadLS(LS_FAVORITES, []);

    if (!favs.length) {
      favoritesList.innerHTML = `<div class="item"><div class="meta"><div class="title">Sin favoritos aún.</div><div class="sub">Marca con ☆ para guardar.</div></div></div>`;
      return;
    }

    favoritesList.innerHTML = favs
      .map(
        (f) => `
        <div class="item">
          <div class="meta">
            <div class="title">${escapeHtml(f.label)}</div>
            <div class="sub">${Number(f.lat).toFixed(6)}, ${Number(f.lng).toFixed(6)} • ${escapeHtml(f.time)}</div>
          </div>
          <div class="actions">
            <button class="icon-btn" data-act="go" data-lat="${f.lat}" data-lng="${f.lng}">Ir</button>
            <button class="icon-btn" data-act="del" data-id="${f.id}">✕</button>
          </div>
        </div>
      `
      )
      .join("");

    favoritesList.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async () => {
        const act = b.dataset.act;
        if (act === "go") {
          await goTo(Number(b.dataset.lat), Number(b.dataset.lng), true, "ui");
        }
        if (act === "del") {
          const favs = loadLS(LS_FAVORITES, []);
          saveLS(LS_FAVORITES, favs.filter((x) => x.id !== b.dataset.id));
          renderFavorites();
          refreshFavoriteButton();
        }
      });
    });
  }

  btnClearHistory?.addEventListener("click", () => {
    saveLS(LS_HISTORY, []);
    renderHistory();
  });

  btnClearFavorites?.addEventListener("click", () => {
    saveLS(LS_FAVORITES, []);
    renderFavorites();
    refreshFavoriteButton();
  });

  btnSavePoint?.addEventListener("click", () => {
    const cur = getCurrentLatLng();
    addToPoints(cur);
    addToHistory({ label: cur.label, lat: cur.lat, lng: cur.lng });
    alert("Punto guardado ✅");
  });

  btnToggleFavorite?.addEventListener("click", () => {
    toggleFavoriteCurrent();
  });

  /* =====================
     DISTANCIA (Haversine)
     ===================== */
  function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;

    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);

    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    return R * c;
  }

  function formatMeters(m) {
    if (!Number.isFinite(m)) return "—";
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(2)} km`;
  }

  function renderDistanceFromPoints() {
    if (!distanceValue) return;
    const pts = loadLS(LS_POINTS, []);
    if (pts.length < 2) {
      distanceValue.textContent = "—";
      return;
    }
    const a = pts[1];
    const b = pts[0];
    const m = haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    distanceValue.textContent = formatMeters(m);
  }

  /* =====================
     COBERTURA (CÍRCULO)
     ===================== */
  function getRadiusMeters() {
    const r = Number(coverageRadius?.value ?? 500);
    return clamp(r || 500, 50, 50000);
  }

  function updateCoverage(lat, lng) {
    if (!coverageEnabled) {
      if (gCoverageCircle) {
        gCoverageCircle.setMap(null);
        gCoverageCircle = null;
      }
      if (lCoverageCircle && lmap) {
        lmap.removeLayer(lCoverageCircle);
        lCoverageCircle = null;
      }
      return;
    }

    const radius = getRadiusMeters();

    if (gmap) {
      if (!gCoverageCircle) {
        gCoverageCircle = new google.maps.Circle({
          map: gmap,
          center: { lat, lng },
          radius,
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillOpacity: 0.15,
        });
      } else {
        gCoverageCircle.setCenter({ lat, lng });
        gCoverageCircle.setRadius(radius);
      }
    }

    if (lmap) {
      if (!lCoverageCircle) {
        lCoverageCircle = L.circle([lat, lng], {
          radius,
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0.15,
        }).addTo(lmap);
      } else {
        lCoverageCircle.setLatLng([lat, lng]);
        lCoverageCircle.setRadius(radius);
      }
    }
  }

  btnToggleCoverage?.addEventListener("click", () => {
    coverageEnabled = !coverageEnabled;
    btnToggleCoverage.textContent = coverageEnabled ? "Ocultar cobertura" : "Mostrar cobertura";
    const cur = getCurrentLatLng();
    updateCoverage(cur.lat, cur.lng);
  });

  coverageRadius?.addEventListener("input", () => {
    const cur = getCurrentLatLng();
    updateCoverage(cur.lat, cur.lng);
  });

  /* =====================
     EXPORT
     ===================== */
  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  function exportJSON() {
    const pts = loadLS(LS_POINTS, []);
    downloadFile("puntos_guardados.json", JSON.stringify(pts, null, 2), "application/json");
  }

  function exportCSV() {
    const pts = loadLS(LS_POINTS, []);
    const header = "id,label,lat,lng,time\n";
    const rows = pts
      .map((p) =>
        [
          p.id,
          `"${String(p.label || "").replaceAll('"', '""')}"`,
          Number(p.lat).toFixed(6),
          Number(p.lng).toFixed(6),
          `"${String(p.time || "").replaceAll('"', '""')}"`
        ].join(",")
      )
      .join("\n");
    downloadFile("puntos_guardados.csv", header + rows + "\n", "text/csv");
  }

  function exportGeoJSON() {
    const pts = loadLS(LS_POINTS, []);
    const geo = {
      type: "FeatureCollection",
      features: pts.map((p) => ({
        type: "Feature",
        properties: {
          id: p.id,
          label: p.label,
          time: p.time,
          ts: p.ts,
        },
        geometry: {
          type: "Point",
          coordinates: [Number(p.lng), Number(p.lat)],
        },
      })),
    };
    downloadFile("puntos_guardados.geojson", JSON.stringify(geo, null, 2), "application/geo+json");
  }

  btnExportJSON?.addEventListener("click", () => {
    const pts = loadLS(LS_POINTS, []);
    if (!pts.length) return alert("No hay puntos guardados. Presiona “Guardar punto” primero.");
    exportJSON();
  });

  btnExportCSV?.addEventListener("click", () => {
    const pts = loadLS(LS_POINTS, []);
    if (!pts.length) return alert("No hay puntos guardados. Presiona “Guardar punto” primero.");
    exportCSV();
  });

  btnExportGeoJSON?.addEventListener("click", () => {
    const pts = loadLS(LS_POINTS, []);
    if (!pts.length) return alert("No hay puntos guardados. Presiona “Guardar punto” primero.");
    exportGeoJSON();
  });

  /* =====================
     SEARCH FALLBACK
     ===================== */
  btnSearch?.addEventListener("click", async () => {
    const q = (searchInput.value || "").trim();
    if (!q) return;

    const data = await geocode(q);
    if (!data.ok) {
      alert("No se encontró la ubicación");
      return;
    }

    const r = data.results?.[0];
    const loc = r?.geometry?.location;

    if (!loc) {
      alert("No se encontró la ubicación");
      return;
    }

    currentAddress.textContent = r.formatted_address || q;
    await goTo(loc.lat, loc.lng, false, "ui");

    addToHistory({
      label: currentAddress.textContent,
      lat: loc.lat,
      lng: loc.lng,
    });
  });

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnSearch?.click();
  });

  btnGoCoords?.addEventListener("click", async () => {
    const lat = Number(latInput.value);
    const lng = Number(lngInput.value);
    await goTo(lat, lng, true, "ui");
    addToHistory({ label: "Coordenadas", lat, lng });
  });

  btnMyLocation?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocalización no disponible en este navegador");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await goTo(pos.coords.latitude, pos.coords.longitude, true, "ui");
        addToHistory({
          label: "Mi ubicación",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => alert("No se pudo obtener tu ubicación. Revisa permisos del navegador."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  /* =====================
     ESCAPES
     ===================== */
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeHtmlAttr(str) {
    return escapeHtml(str).replaceAll("`", "&#096;");
  }

  /* =====================
     INIT
     ===================== */
  initLeaflet();
  setUIPosition(initial.lat, initial.lng);
  setAddressFromReverse(initial.lat, initial.lng);

  renderHistory();
  renderFavorites();
  renderDistanceFromPoints();
  refreshFavoriteButton();
})();
