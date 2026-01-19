// js/app.js

// --- CONFIGURACIÓN ---
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxDMkP5NKfdb9xOjVBe20h7vff7KX4OR_8GKEsm42aszgq2ZgnOmXOX68pXSK0SB6Vw/exec';
const GEOJSON_URL = 'zonas.geojson';
const DISTRICTS_URL = 'distritoslocales.geojson';

let globalData = [];
let uniqueDistricts = new Set();
let selectedDistricts = new Set();
let sectionMaps = {};
let mapInstance = null;
let geoJsonLayer = null;

// --- FUNCIONES DE NAVEGACIÓN ---
function openGeneralMap() {
    window.open('https://www.google.com/maps/d/edit?mid=1HLbLlf1Gl4OuR6RwUd0zENjCmhoA4II&usp=sharing', '_blank');
}

// --- CARRUSEL DE DISTRITOS (SOLO PARA INDEX.HTML) ---
const districtsData = [
    { id: 2, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-02-chihuahua' },
    { id: 3, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-03-chihuahua' },
    { id: 4, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-04-chihuahua' },
    { id: 5, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-05-chihuahua' },
    { id: 6, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-06-chihuahua' },
    { id: 7, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-07-chihuahua' },
    { id: 8, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-08-chihuahua' },
    { id: 9, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-09-chihuahua' },
    { id: 10, url: 'https://distrito-local-1-ca46yhg.gamma.site/distrito-local-10-chihuahua' }
];

function renderDistrictsCarousel() {
    const container = document.getElementById('districtsContainer');
    if (!container) return;

    container.innerHTML = '';
    districtsData.forEach(dist => {
        const card = document.createElement('div');
        card.className = "flex-none w-72 md:w-80 glass-panel rounded-2xl p-6 flex flex-col items-center justify-center gap-4 snap-center border border-white/40 shadow-xl group cursor-pointer carousel-card bg-white/95";
        card.onclick = () => window.open(dist.url, '_blank');
        card.innerHTML = `<div class="size-16 rounded-full bg-gradient-to-tr from-primary to-primary-dark flex items-center justify-center text-white font-black text-2xl shadow-lg group-hover:shadow-primary/50 transition-all">${dist.id}</div><div class="text-center"><h3 class="text-xl font-bold text-text-main dark:text-white">Distrito Local ${dist.id}</h3><p class="text-sm text-text-sub dark:text-gray-300 mt-1">Juárez</p></div><span class="mt-4 px-6 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white font-bold text-sm shadow-lg shadow-primary/30 group-hover:shadow-primary/50 group-hover:scale-105 transition-all flex items-center gap-2">Explorar <span class="material-symbols-outlined text-sm">arrow_forward</span></span>`;
        container.appendChild(card);
    });
}

let carouselInterval;
function startCarousel() {
    const c = document.getElementById('districtsContainer');
    if (!c) return;
    if (carouselInterval) clearInterval(carouselInterval);
    carouselInterval = setInterval(() => {
        if (c.scrollLeft + c.clientWidth >= c.scrollWidth - 50) c.scrollTo({ left: 0, behavior: 'smooth' });
        else c.scrollBy({ left: 340, behavior: 'smooth' });
    }, 3000);
}
function stopCarousel() { clearInterval(carouselInterval); }
function scrollDistricts(dir) {
    const c = document.getElementById('districtsContainer');
    if (c) c.scrollBy({ left: dir === 'left' ? -340 : 340, behavior: 'smooth' });
}

// --- LOGICA ZONAS (SOLO PARA ZONAS.HTML) ---

async function fetchSheetData() {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.classList.remove('hidden');

    try {
        const res = await fetch(APPS_SCRIPT_URL);
        const result = await res.json();
        const data = result.mainData || result;
        sectionMaps = result.sectionMaps || {}; // Aquí cargamos los mapas de sección
        uniqueDistricts.clear();

        globalData = data.map((item, index) => {
            const sections = item.zone ? String(item.zone).split(/[,|\/\-\n]/).map(s => s.trim()).filter(s => s.length > 0) : [];
            if (sections.length === 0 && item.zone) sections.push(item.zone);
            if (sections.length === 0) sections.push("Sin asignación");

            let dist = item.district ? String(item.district).trim() : "N/A";
            if (dist === "") dist = "N/A";
            uniqueDistricts.add(dist);

            let orderVal = item.order ? item.order : (index + 1).toString();

            return {
                ...item,
                zoneSections: sections,
                order: orderVal,
                district: dist,
                assigned: (item.status && (item.status.toLowerCase().includes('assigned') || item.status.toLowerCase().includes('asignada')))
            };
        });

        globalData.sort((a, b) => parseInt(a.order) - parseInt(b.order));

        // Si estamos en la página de zonas, renderizar
        if (document.getElementById('distritosCheckboxContainer')) {
            populateDistricts(Array.from(uniqueDistricts));
            filterAndRender();
        }

        // Si el mapa dinámico está abierto, actualizarlo
        updateMapColors();

    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

async function updateSheet(id, field, value, el) {
    if (el) el.classList.add('saving-pulse');
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ id, field, value })
        });

        // Actualizar datos locales
        const row = globalData.find(r => r.id === id);
        if (row) {
            if (field === 'status') row.assigned = (value === 'assigned');
            else if (field === 'brigadista') row.brigadista = value;
            else if (field === 'phone') row.phone = value;
            updateMapColors(); // Repintar mapa si cambia estatus
        }

        const s = document.getElementById('save-status');
        if (s) {
            s.classList.remove('hidden'); s.classList.add('flex');
            setTimeout(() => { s.classList.add('hidden'); s.classList.remove('flex'); }, 3000);
        }
    } catch (error) { console.error("Save Error:", error); alert("Error al guardar."); }
    finally { if (el) el.classList.remove('saving-pulse'); }
}

function handleStatusChange(s, id) {
    s.className = s.value === 'assigned'
        ? "appearance-none cursor-pointer pl-3 pr-8 py-1.5 rounded-full text-xs font-bold border focus:ring-2 transition-all outline-none bg-green-100/80 text-green-700 border-green-200 backdrop-blur-sm shadow-sm"
        : "appearance-none cursor-pointer pl-3 pr-8 py-1.5 rounded-full text-xs font-bold border focus:ring-2 transition-all outline-none bg-gray-100/80 dark:bg-white/10 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 backdrop-blur-sm shadow-sm";
    updateSheet(id, 'status', s.value, s);
}

// --- FUNCIÓN CRÍTICA CORREGIDA ---
function updateSectionMapLink(select, mapId, rowMap) {
    const sec = select.value;
    const mapAnchor = document.getElementById(mapId);
    const dataAnchor = document.getElementById(mapId.replace('map', 'data'));

    const info = sectionMaps[sec];
    let mUrl = null, dUrl = null;

    // Extraer URLs del objeto sectionMaps
    if (info) {
        if (typeof info === 'string') {
            mUrl = info;
        } else {
            mUrl = info.map;
            dUrl = info.data;
        }
    }

    // Lógica para Botón de MAPA
    if (mUrl) {
        mapAnchor.href = mUrl;
        mapAnchor.classList.remove('opacity-50', 'pointer-events-none', 'grayscale');
        mapAnchor.classList.add('hover:scale-110', 'hover:shadow-lg');
    } else if (rowMap && rowMap.length > 5) {
        // Si no hay mapa específico de sección, usa el de la Zona
        mapAnchor.href = rowMap;
        mapAnchor.classList.remove('opacity-50', 'pointer-events-none', 'grayscale');
        mapAnchor.classList.add('hover:scale-110', 'hover:shadow-lg');
    } else {
        mapAnchor.removeAttribute('href');
        mapAnchor.classList.add('opacity-50', 'pointer-events-none', 'grayscale');
        mapAnchor.classList.remove('hover:scale-110', 'hover:shadow-lg');
    }

    // Lógica para Botón de DATOS (Gamma)
    if (dUrl) {
        dataAnchor.href = dUrl;
        dataAnchor.classList.remove('opacity-50', 'pointer-events-none', 'grayscale');
        dataAnchor.classList.add('hover:scale-110', 'hover:shadow-lg');
    } else {
        dataAnchor.removeAttribute('href');
        dataAnchor.classList.add('opacity-50', 'pointer-events-none', 'grayscale');
        dataAnchor.classList.remove('hover:scale-110', 'hover:shadow-lg');
    }
}

function toggleDistritoDropdown() {
    const c = document.getElementById('distritoDropdownContent');
    if (!c) return;
    c.classList.toggle('hidden'); c.classList.toggle('flex');
    const arrow = document.getElementById('distritoArrow');
    if (arrow) arrow.style.transform = c.classList.contains('flex') ? 'rotate(180deg)' : 'rotate(0deg)';
}

function populateDistricts(dists) {
    const c = document.getElementById('distritosCheckboxContainer');
    if (!c) return;
    c.innerHTML = '';
    dists.sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));
    dists.forEach(d => {
        const l = document.createElement('label');
        l.className = "flex items-center gap-3 px-4 py-2 hover:bg-primary/10 dark:hover:bg-white/10 cursor-pointer transition-colors";
        l.innerHTML = `<input type="checkbox" value="${d}" class="form-checkbox size-4 text-primary rounded border-gray-300 dark:border-gray-500 bg-white/50 focus:ring-primary cursor-pointer" ${selectedDistricts.has(d) ? 'checked' : ''}> <span class="text-sm font-medium text-text-main dark:text-gray-200">${d.startsWith('Distrito') ? d : `Distrito ${d}`}</span>`;
        l.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) selectedDistricts.add(d); else selectedDistricts.delete(d);
            const btnText = document.getElementById('distritoButtonText');
            if (btnText) {
                if (selectedDistricts.size === 0) btnText.textContent = "Todos los Distritos";
                else if (selectedDistricts.size === 1) btnText.textContent = Array.from(selectedDistricts)[0];
                else btnText.textContent = `${selectedDistricts.size} Distritos Selecc.`;
            }
            filterAndRender();
        });
        c.appendChild(l);
    });
}

function filterAndRender() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    const statusFilter = document.getElementById('statusFilter');
    const statusValue = statusFilter ? statusFilter.value : 'all';

    const term = searchInput.value.toLowerCase();
    const filtered = globalData.filter(i => {
        const matches = i.zoneSections.join(" ").toLowerCase().includes(term) || (i.brigadista || "").toLowerCase().includes(term) || String(i.id || "").toLowerCase().includes(term);
        const distMatch = selectedDistricts.size === 0 || selectedDistricts.has(i.district);

        let statusMatch = true;
        if (statusValue === 'assigned') statusMatch = i.assigned;
        else if (statusValue === 'pending') statusMatch = !i.assigned;

        return matches && distMatch && statusMatch;
    });
    renderTable(filtered);

    const count = document.getElementById('result-count');
    if (count) count.textContent = filtered.length;
    updateStats(filtered);
}

function renderTable(data) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) { tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-text-sub font-medium">No se encontraron resultados</td></tr>`; return; }

    data.forEach(r => {
        const tr = document.createElement('tr');
        const isPending = !r.assigned;
        tr.className = `group transition-colors border-b border-gray-100/30 dark:border-white/5 hover:bg-white/40 dark:hover:bg-white/5 ${isPending ? 'bg-orange-50/20 dark:bg-orange-900/10' : ''}`;

        const inpCls = isPending ? "glass-input w-full px-3 py-2 text-sm rounded-lg transition-all focus:ring-2 focus:ring-primary/50 outline-none shadow-sm" : "w-full px-3 py-2 text-sm rounded-lg transition-all focus:ring-2 focus:ring-primary/50 outline-none backdrop-blur-sm bg-transparent border-transparent hover:bg-white/40 dark:hover:bg-white/10 focus:bg-white/80 dark:focus:bg-slate-800/80 border hover:border-white/30";
        const stCls = r.assigned ? "bg-green-100/80 text-green-700 border-green-200 focus:ring-green-500" : "bg-gray-100/80 dark:bg-white/10 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 focus:ring-gray-500";

        const mapId = `map-link-${r.id}`, dataId = `data-link-${r.id}`;

        tr.innerHTML = `
            <td class="px-6 py-4 align-middle font-mono text-xs text-text-sub font-bold opacity-60">${r.order}</td>
            <td class="px-6 py-4 align-middle"><span class="text-xs font-extrabold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-md whitespace-nowrap shadow-sm backdrop-blur-sm">${r.id}</span></td>
            <td class="px-6 py-4 align-middle">
                <div class="flex items-center gap-2">
                    <select class="w-full bg-transparent border-none text-sm font-bold text-text-main dark:text-white p-0 focus:ring-0 cursor-pointer appearance-none truncate pr-4 outline-none">
                        ${r.zoneSections.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                     <a id="${mapId}" href="#" target="_blank" class="flex items-center justify-center size-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 shadow-sm hover:bg-blue-600 hover:text-white transition-all pointer-events-none opacity-50 grayscale"><span class="material-symbols-outlined text-[18px]">public</span></a>
                     <a id="${dataId}" href="#" target="_blank" class="flex items-center justify-center size-8 rounded-full bg-purple-50 border border-purple-200 text-purple-600 shadow-sm hover:bg-purple-600 hover:text-white transition-all pointer-events-none opacity-50 grayscale"><span class="material-symbols-outlined text-[18px]">analytics</span></a>
                </div>
                <div class="text-[10px] font-semibold text-text-sub/70 mt-0.5 truncate max-w-[200px] flex items-center gap-1"><span class="size-1.5 rounded-full bg-primary/50"></span> Distrito: ${r.district || 'N/A'}</div>
            </td>
            <td class="px-6 py-4 align-middle"><div class="relative inline-block"><select onchange="handleStatusChange(this, '${r.id}')" class="appearance-none cursor-pointer pl-3 pr-8 py-1.5 rounded-full text-xs font-bold border focus:ring-2 transition-all outline-none shadow-sm backdrop-blur-sm ${stCls}"><option value="pending" ${!r.assigned ? 'selected' : ''}>Pendiente</option><option value="assigned" ${r.assigned ? 'selected' : ''}>Asignada</option></select></div></td>
            <td class="px-6 py-4 align-middle"><input class="${inpCls}" placeholder="Nombre" value="${r.brigadista || ''}" onchange="updateSheet('${r.id}', 'brigadista', this.value, this)"></td>
            <td class="px-6 py-4 align-middle"><input class="${inpCls}" placeholder="Teléfono" value="${r.phone || ''}" onchange="updateSheet('${r.id}', 'phone', this.value, this)"></td>
            <td class="px-6 py-4 align-middle text-center">
                <div class="flex items-center justify-center gap-2">
                    ${r.mapLink && r.mapLink.length > 5 ? `<a href="${r.mapLink}" target="_blank" class="inline-flex items-center justify-center size-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-all shadow-sm group/map" title="Ver en Mapa"><span class="material-symbols-outlined text-[18px]">map</span></a>` : `<span class="inline-flex items-center justify-center size-8 rounded-full bg-gray-100/50 dark:bg-white/5 text-gray-300 cursor-not-allowed"><span class="material-symbols-outlined text-[18px]">map_off</span></span>`}
                    <button onclick="openFicha('${r.id}')" class="inline-flex items-center justify-center size-8 rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-all shadow-sm group/pdf" title="Generar Ficha PDF">
                        <span class="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        // Agregar listener para actualizar los links cuando cambie la sección
        const sel = tr.querySelector('select');
        if (sel) {
            // Inicializar links
            updateSectionMapLink(sel, mapId, r.mapLink);
            // Escuchar cambios
            sel.addEventListener('change', () => updateSectionMapLink(sel, mapId, r.mapLink));
        }
    });
}

function updateStats(data) {
    const total = document.getElementById('stat-total-zonas');
    if (!total) return;
    total.textContent = data.length;
    const asg = data.filter(d => d.assigned).length;
    document.getElementById('stat-asignadas').textContent = asg;
    document.getElementById('stat-pendientes').textContent = data.length - asg;
}

// --- MAPA DINÁMICO ---
// --- MANEJO DE PESTAÑAS ---
function switchTab(tabId) {
    console.log("Switching tab to:", tabId); // Debug log
    // Definir elementos
    const tabList = document.getElementById('tab-content-list');
    const tabMap = document.getElementById('tab-content-map');
    const btnList = document.getElementById('tab-btn-list');
    const btnMap = document.getElementById('tab-btn-map');

    // Clases de estado
    const activeClasses = ['bg-white', 'text-primary', 'shadow-sm', 'dark:bg-slate-800', 'dark:text-white'];
    const inactiveClasses = ['text-text-sub', 'dark:text-gray-400', 'hover:text-text-main', 'button-ghost'];

    // Resetear botones
    btnList.className = `flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${tabId === 'list' ? activeClasses.join(' ') : inactiveClasses.join(' ')}`;
    btnMap.className = `flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${tabId === 'map' ? activeClasses.join(' ') : inactiveClasses.join(' ')}`;

    // Alternar Visibilidad
    if (tabId === 'list') {
        tabList.classList.remove('hidden');
        tabMap.classList.add('hidden');
    } else {
        tabList.classList.add('hidden');
        tabMap.classList.remove('hidden');

        // Inicializar o Actualizar Mapa cuando se hace visible
        // Incrementamos timeout a 300ms para asegurar renderizado DOM
        setTimeout(async () => {
            console.log("Initializing map logic...");
            if (!mapInstance) {
                await initLeafletMap();
            }
            // SIEMPRE invalidar tamaño al mostrar, incluso si acaba de crearse
            if (mapInstance) {
                mapInstance.invalidateSize();
                updateMapColors();
                console.log("Map size invalidated");
            }
        }, 300);
    }
}

async function initLeafletMap() {
    if (!document.getElementById('leafletMap')) {
        console.error("No map container found!");
        return;
    }

    // Evitar doble instancia
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    console.log("Creating new Leaflet map instance");
    mapInstance = L.map('leafletMap').setView([31.73, -106.48], 11);

    // Crear Panes personalizados para control de Z-Index
    mapInstance.createPane('zonesPane');
    mapInstance.getPane('zonesPane').style.zIndex = 400; // Por defecto overlay es 400, pero explicitamos

    mapInstance.createPane('districtsPane');
    mapInstance.getPane('districtsPane').style.zIndex = 500; // ENCIMA de las zonas

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(mapInstance);

    // Forzar resize inicial
    setTimeout(() => { mapInstance.invalidateSize(); }, 200);

    try {
        const response = await fetch(GEOJSON_URL);
        if (response.ok) {
            const geoJsonData = await response.json();
            geoJsonLayer = L.geoJSON(geoJsonData, { style: styleFeature, onEachFeature: onEachFeature }).addTo(mapInstance);
            if (geoJsonData.features && geoJsonData.features.length > 0) mapInstance.fitBounds(geoJsonLayer.getBounds());
            console.log("GeoJSON loaded");
        }
    } catch (e) { console.error("Error mapa:", e); }

    // Cargar Distritos Locales (Solo contornos rojos)
    try {
        const distResponse = await fetch(DISTRICTS_URL);
        if (distResponse.ok) {
            const distData = await distResponse.json();
            const distLayer = L.geoJSON(distData, {
                style: {
                    color: '#dc2626', // Red-600
                    weight: 3,
                    opacity: 1,
                    fillColor: 'transparent',
                    fillOpacity: 0
                },
                pane: 'districtsPane', // Usar pane con z-index alto
                interactive: false,
                onEachFeature: function (feature, layer) {
                    if (feature.properties && feature.properties.DISTRITO_L) {
                        layer.bindTooltip(
                            `Dtto ${feature.properties.DISTRITO_L}`,
                            {
                                permanent: true,
                                direction: "center",
                                className: "district-label-tooltip"
                            }
                        );
                    }
                }
            }).addTo(mapInstance);
            distLayer.bringToFront();
            console.log("Districts loaded");
        }
    } catch (e) { console.error("Error distritos:", e); }
}

function styleFeature(feature) {
    const props = feature.properties;
    const geoId = props.ID_Zona || props.id || props.Name || "";
    const cleanGeoId = String(geoId).trim();
    const zoneData = globalData.find(z => String(z.id).trim() === cleanGeoId);
    let color = '#94a3b8', opacity = 0.4;
    if (zoneData) {
        if (zoneData.assigned) { color = '#2563eb'; opacity = 0.6; } // Azul Primary
        else { color = '#94a3b8'; opacity = 0.6; } // Gris Slate-400
    }
    return { fillColor: color, weight: 2, opacity: 1, color: 'white', dashArray: '3', fillOpacity: opacity };
}

function updateMapColors() { if (geoJsonLayer) geoJsonLayer.setStyle(styleFeature); }

function onEachFeature(feature, layer) {
    const props = feature.properties;
    const geoId = props.ID_Zona || props.id || props.Name || "Sin ID";
    const cleanGeoId = String(geoId).trim();
    const zoneData = globalData.find(z => String(z.id).trim() === cleanGeoId);
    let popupContent = `<div class="font-sans p-1"><h3 class="font-bold text-lg border-b border-gray-200 pb-1 mb-2">Zona: ${cleanGeoId}</h3>`;
    if (zoneData) {
        const badge = zoneData.assigned ? `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">ASIGNADA</span>` : `<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">PENDIENTE</span>`;
        popupContent += `<div class="mb-2">${badge}</div><p class="text-sm"><strong>Brigadista:</strong> ${zoneData.brigadista || 'Sin asignar'}</p><p class="text-sm"><strong>Tel:</strong> ${zoneData.phone || '--'}</p><p class="text-xs text-gray-500 mt-2">Distrito: ${zoneData.district}</p>`;
    } else popupContent += `<p class="text-sm text-gray-500 italic">No hay datos en el Excel.</p>`;
    popupContent += `</div>`;
    layer.bindPopup(popupContent);
}

// --- FICHA PDF LOGIC ---
let currentFichaId = null;

function openFicha(id) {
    currentFichaId = id;
    const row = globalData.find(r => String(r.id) === String(id));
    if (!row) return;

    // Poblar Datos Básicos
    document.getElementById('pdf-nombre').textContent = row.brigadista || "Sin Asignar";
    document.getElementById('pdf-telefono').textContent = row.phone || "No registrado";
    document.getElementById('pdf-zona').textContent = row.id;
    document.getElementById('pdf-distrito').textContent = row.district;
    document.getElementById('pdf-fecha').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Poblar Grid de Secciones
    const grid = document.getElementById('pdf-secciones-grid');
    grid.innerHTML = '';

    row.zoneSections.forEach(sec => {
        const cleanSec = String(sec).trim();
        let mapUrl = null;
        if (sectionMaps[cleanSec]) {
            mapUrl = typeof sectionMaps[cleanSec] === 'string' ? sectionMaps[cleanSec] : sectionMaps[cleanSec].map;
        }

        const secEl = document.createElement('div');
        secEl.className = "flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100";

        // Contenido de la celda de sección
        let htmlContent = `<div class="flex items-center gap-2"><span class="size-2 rounded-full bg-primary"></span><span class="font-bold text-gray-700">Secc. ${cleanSec}</span></div>`;

        if (mapUrl) {
            // Nota: En PDF impreso el link clickeable funciona si es digital. Si es para imprimir papel, podríamos poner un QR en el futuro.
            htmlContent += `<a href="${mapUrl}" target="_blank" class="text-[10px] uppercase font-bold text-primary hover:underline flex items-center gap-1">Ver Mapa <span class="material-symbols-outlined text-[10px]">open_in_new</span></a>`;
        } else {
            htmlContent += `<span class="text-[10px] text-gray-400 italic">Sin mapa</span>`;
        }

        secEl.innerHTML = htmlContent;
        grid.appendChild(secEl);
    });

    // Mostrar Modal
    const modal = document.getElementById('ficha-overlay');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeFicha() {
    const modal = document.getElementById('ficha-overlay');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function downloadPDF() {
    const row = globalData.find(r => String(r.id) === String(currentFichaId));
    if (!row) return;

    // 1. Obtener HTML del contenido
    const content = document.getElementById('ficha-printable').innerHTML;

    // 2. Abrir ventana de impresión
    const printWindow = window.open('', '_blank');

    // 3. Escribir documento completo
    printWindow.document.write(`
        <html>
        <head>
            <title>Ficha Brigadista - Zona ${row.id}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;700;900&display=swap" rel="stylesheet" />
            <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
            <style>
                body { font-family: 'Public Sans', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                @page { size: A4; margin: 0; }
                @media print {
                    body { padding: 20px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            ${content}
            <script>
                // Esperar a que carguen fuentes y estilos
                window.onload = function() {
                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);

    printWindow.document.close();
}

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    renderDistrictsCarousel();
    if (document.getElementById('table-body')) {
        fetchSheetData();
        const search = document.getElementById('searchInput');
        if (search) search.addEventListener('input', filterAndRender);
    }
    startCarousel();
});

// Listo