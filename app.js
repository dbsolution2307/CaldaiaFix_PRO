/* ==========================================================================
   CALDAIAFIX PRO - LOGICA APPLICAZIONE, GESTIONE CLIENTI & SCADENZE ALLERTA
   ========================================================================== */

// PULIZIA AUTOMATICA VECCHIA CACHE SERVICE WORKER PER EVITARE BLOCCHI
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
            registration.unregister();
        }
    }).catch(err => console.warn('PWA SW Cleanup:', err));
}

// HELPER LOCALSTORAGE SICURO
function safeGetStorage(key, defaultValue) {
    try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

function safeSetStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn("Errore salvataggio localStorage:", e);
    }
}

// STRUTTURA DATI LOCALE
let currentFilterType = 'all';
let currentBrand = '';
let favorites = safeGetStorage('caldaiafix_favs', []);
let historyGuasti = safeGetStorage('caldaiafix_history', []);
let dbIndexed = null;
let deferredPrompt = null;
let torchTrack = null;
let isTorchOn = false;

// ID CLIENTE IN FASE DI MODIFICA (null SE SI STA CREANDO UN NUOVO CLIENTE)
let editingClientId = null;

// INIZIALIZZAZIONE
function initApp() {
    try {
        aggiornaContatoreHeader();
        initIndexedDB();
        caricaImpostazioni();
        filtraErrori(false);
        gestisciPwaInstall();
        verificaStatoRete();
    } catch (err) {
        console.error("Errore inizializzazione CaldaiaFix:", err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

window.addEventListener('online', verificaStatoRete);
window.addEventListener('offline', verificaStatoRete);

function verificaStatoRete() {
    const netBadge = document.getElementById('netStatus');
    if (!netBadge) return;
    if (navigator.onLine) {
        netBadge.className = 'net-badge online';
        netBadge.textContent = '🟢 Online';
    } else {
        netBadge.className = 'net-badge offline';
        netBadge.textContent = '🔴 Offline';
    }
}

// FORZA AGGIORNAMENTO CACHE PWA E REFRESH
async function forzaAggiornamentoCache() {
    vibraTocco();
    if (confirm("Vuoi svuotare la memoria cache dell'app e scaricare la versione più recente dal server?")) {
        try {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }
            if ('caches' in window) {
                const keys = await caches.keys();
                for (let key of keys) {
                    await caches.delete(key);
                }
            }
            window.location.reload(true);
        } catch (err) {
            window.location.reload(true);
        }
    }
}

// CONTATORE INTESTAZIONE
function aggiornaContatoreHeader() {
    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    const countBox = document.getElementById('resultsCount');
    if (countBox) {
        countBox.textContent = `${dbData.length} GUASTI PRESENTI NEL DATABASE`;
    }
}

// CONTROLLO SCADENZE PER BANNER ALLERTA IN HOME
function controllaScadenzeAllerta() {
    if (!dbIndexed) return;

    try {
        const transaction = dbIndexed.transaction(['targhe'], 'readonly');
        const store = transaction.objectStore('targhe');
        const request = store.getAll();

        request.onsuccess = () => {
            const items = request.result;
            const banner = document.getElementById('maint-alert-banner');
            const titleEl = document.getElementById('maint-alert-title');
            const descEl = document.getElementById('maint-alert-desc');

            if (!banner) return;

            if (!items || items.length === 0) {
                banner.style.display = 'none';
                return;
            }

            const oggi = new Date();
            oggi.setHours(0,0,0,0);

            let scadute = 0;
            let imminenti = 0;

            items.forEach(item => {
                if (item.nextMaintenance) {
                    const dataScad = new Date(item.nextMaintenance);
                    const diffDays = Math.ceil((dataScad - oggi) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) {
                        scadute++;
                    } else if (diffDays <= 14) {
                        imminenti++;
                    }
                }
            });

            if (scadute > 0 || imminenti > 0) {
                banner.style.display = 'flex';
                let msgs = [];
                if (scadute > 0) msgs.push(`🔴 ${scadute} Scadute`);
                if (imminenti > 0) msgs.push(`🟡 ${imminenti} In Scadenza (14 gg)`);

                if (titleEl) titleEl.textContent = "⚠️ Scadenze Manutenzione Rilevate!";
                if (descEl) descEl.textContent = msgs.join(' • ') + " — Tocca per visualizzarle";
            } else {
                banner.style.display = 'none';
            }
        };
    } catch(e) {
        console.warn("Errore controllo allerta scadenze:", e);
    }
}

// FILTRAGGIO E RENDERING LISTA GUASTI
function filtraErrori(isFavOnly = false) {
    const searchEl = document.getElementById('searchInput');
    const brandEl = document.getElementById('brandFilter');

    const query = searchEl ? searchEl.value.toLowerCase().trim() : '';
    const brandSel = brandEl ? brandEl.value : '';
    currentBrand = brandSel;

    if (isFavOnly) {
        currentFilterType = 'fav';
        aggiornaStatoTab('btn-fav');
    }

    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];

    const risultati = dbData.filter(item => {
        if (!item) return false;
        if (brandSel && item.brand !== brandSel) return false;

        if (currentFilterType === 'digital' && item.type !== 'digital') return false;
        if (currentFilterType === 'led' && item.type !== 'led') return false;
        if (currentFilterType === 'fav' && !favorites.includes(item.id)) return false;

        if (query !== '') {
            const matchCode = item.code ? item.code.toLowerCase().includes(query) : false;
            const matchDesc = item.desc ? item.desc.toLowerCase().includes(query) : false;
            const matchModel = item.model ? item.model.toLowerCase().includes(query) : false;
            const matchBrand = item.brand ? item.brand.toLowerCase().includes(query) : false;
            return matchCode || matchDesc || matchModel || matchBrand;
        }

        return true;
    });

    renderListaErrori(risultati);
}

function renderListaErrori(lista) {
    const container = document.getElementById('errors-list');
    const countBox = document.getElementById('resultsCount');

    if (!container) return;
    if (countBox) countBox.textContent = `${lista.length} GUASTI PRESENTI NEL DATABASE`;

    if (!lista || lista.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:30px 15px;">
                <div style="font-size:32px; margin-bottom:8px;">🔍</div>
                <div style="font-weight:800; font-size:16px; color:#ffffff;">Nessun guasto trovato</div>
                <div style="font-size:14px; color:var(--text-sub); margin-top:4px;">Prova a cambiare la ricerca o i filtri.</div>
            </div>
        `;
        return;
    }

    let html = '';
    lista.forEach(item => {
        const isFav = favorites.includes(item.id);
        const chamberText = item.chamber || 'C/F';

        html += `
            <div class="error-item" onclick="mostraDettaglio(${item.id})">
                <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFav(${item.id}, event)" title="Preferito">
                    ${isFav ? '★' : '☆'}
                </button>

                <div class="error-main-info">
                    <div class="error-badges-row">
                        <span class="badge-brand-code">${item.brand} - ${item.code}</span>
                        <span class="error-model-text">${item.model}</span>
                        <span class="badge-chamber">${chamberText}</span>
                    </div>
                    <div class="error-title">${item.desc}</div>
                </div>

                <div class="error-chevron">›</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function filtraTipo(tipo) {
    currentFilterType = tipo;
    const tabMap = { 'all': 'btn-all', 'digital': 'btn-dig', 'led': 'btn-led', 'fav': 'btn-fav' };
    aggiornaStatoTab(tabMap[tipo]);
    filtraErrori(false);
}

function aggiornaStatoTab(activeBtnId) {
    ['btn-all', 'btn-dig', 'btn-led', 'btn-fav'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(activeBtnId);
    if (activeBtn) activeBtn.classList.add('active');
}

// ATTREZZI CONSIGLIATI
function ottieniAttrezziGuasto(item) {
    const desc = ((item.desc || "") + " " + (item.partName || "")).toLowerCase();
    let attrezzi = ["🔧 Cacciaviti Isolati 1000V", "🛠️ Chiavi a Forchetta 10-17mm"];

    if (desc.includes("pressione") || desc.includes("vaso") || desc.includes("acqua")) {
        attrezzi.push("🪠 Pompa con Manometro per Vasi", "⚖️ Manometro Idraulico");
    }
    if (desc.includes("gas") || desc.includes("valvola") || desc.includes("fiamma") || desc.includes("elettrodo")) {
        attrezzi.push("⚡ Multimetro Digitale", "🔥 Manometro Differenziale mbar", "🧹 Carta Abrasiva Fine");
    }
    if (desc.includes("fumi") || desc.includes("pressostato") || desc.includes("ventilatore") || desc.includes("venturi")) {
        attrezzi.push("💨 Pompetta Prova Pressostati", "🪛 Chiave a Pipa / Millerighe");
    }
    if (desc.includes("ntc") || desc.includes("sonda") || desc.includes("termostato") || desc.includes("scheda")) {
        attrezzi.push("⚡ Multimetro Digitale (Profe Ohm)", "🔌 Spray Pulisci Contatti");
    }

    return Array.from(new Set(attrezzi));
}

// DASHBOARD STATISTICHE
function mostraStatistiche() {
    vibraTocco();
    impostaTabNav('menu');
    cambiaVista('stats-view');
    calcolaEDisegnaStatistiche();
}

function calcolaEDisegnaStatistiche() {
    const container = document.getElementById('stats-container');
    if (!container) return;

    const totalConsultazioni = historyGuasti.length;
    
    let brandMap = {};
    historyGuasti.forEach(h => {
        if (h.brand) {
            brandMap[h.brand] = (brandMap[h.brand] || 0) + 1;
        }
    });

    let topBrand = '-';
    let topBrandCount = 0;
    Object.keys(brandMap).forEach(b => {
        if (brandMap[b] > topBrandCount) {
            topBrandCount = brandMap[b];
            topBrand = b;
        }
    });

    const generaHTML = (numTarghe) => {
        let brandBarsHTML = '';
        const total = totalConsultazioni || 1;

        Object.keys(brandMap).forEach(b => {
            const pct = Math.round((brandMap[b] / total) * 100);
            brandBarsHTML += `
                <div style="margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700;">
                        <span>${b}</span>
                        <span>${pct}% (${brandMap[b]})</span>
                    </div>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        });

        if (!brandBarsHTML) {
            brandBarsHTML = `<p style="font-size:13px; color:var(--text-sub);">Consulta alcuni guasti per iniziare a generare le statistiche per marca.</p>`;
        }

        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${numTarghe}</div>
                    <div class="stat-label">Clienti in Archivio</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${totalConsultazioni}</div>
                    <div class="stat-label">Guasti Consultati</div>
                </div>
            </div>

            <div class="card">
                <h3 style="font-size:15px; font-weight:800; color:#38bdf8; margin-bottom:10px;">🏆 Marca Più Trattata</h3>
                <div style="font-size:20px; font-weight:900; color:#ffffff;">${topBrand}</div>
                <div style="font-size:13px; color:var(--text-sub); margin-top:2px;">Basato sullo storico delle tue ricerche recenti.</div>
            </div>

            <div class="card">
                <h3 style="font-size:15px; font-weight:800; color:#ffffff; margin-bottom:12px;">📊 Ripartizione Interventi per Marca</h3>
                ${brandBarsHTML}
            </div>
        `;
    };

    if (dbIndexed) {
        const tx = dbIndexed.transaction(['targhe'], 'readonly');
        const store = tx.objectStore('targhe');
        const req = store.count();
        req.onsuccess = () => generaHTML(req.result);
        req.onerror = () => generaHTML(0);
    } else {
        generaHTML(0);
    }
}

// DETTAGLIO GUASTO & STORICO
function mostraDettaglio(id) {
    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    const item = dbData.find(e => e.id === id);
    if (!item) return;

    vibraTocco();
    salvaInStorico(item);

    const detailContent = document.getElementById('detail-content');
    if (!detailContent) return;

    const isFav = favorites.includes(item.id);

    let htmlSteps = '';
    if (item.steps && item.steps.length > 0) {
        htmlSteps = '<ol style="padding-left:20px; font-size:15px; line-height:1.5;">' + item.steps.map(step => `<li style="margin-bottom:6px;">${step}</li>`).join('') + '</ol>';
    }

    let htmlCauses = '';
    if (item.causes && item.causes.length > 0) {
        htmlCauses = '<ul style="padding-left:20px; font-size:15px; line-height:1.5;">' + item.causes.map(c => `<li style="margin-bottom:4px;">${c}</li>`).join('') + '</ul>';
    }

    const listaAttrezzi = ottieniAttrezziGuasto(item);
    const htmlAttrezzi = listaAttrezzi.map(attrezzo => {
        const cleanToolName = attrezzo.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
        const toolSearchQuery = encodeURIComponent(cleanToolName);
        const toolAmazonUrl = `https://www.amazon.it/s?k=${toolSearchQuery}&tag=dbsolution-21`;
        return `<a href="${toolAmazonUrl}" target="_blank" rel="noopener noreferrer" class="tool-tag" onclick="event.stopPropagation();">${attrezzo} ↗</a>`;
    }).join('');

    const searchQuery = encodeURIComponent(`${item.brand} ${item.partName || item.code} ricambio caldaia`);
    const amazonAffiliateUrl = `https://www.amazon.it/s?k=${searchQuery}&tag=dbsolution-21`;

    detailContent.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div>
                    <span class="badge-brand-code">${item.brand} - ${item.code}</span>
                    <h2 style="font-size:22px; font-weight:800; color:#ffffff; margin-top:8px;">${item.desc}</h2>
                    <p style="font-size:14px; color:var(--text-sub); font-weight:600; margin-top:2px;">Modelli: ${item.model}</p>
                </div>
                <button class="fav-btn ${isFav ? 'active' : ''}" style="font-size:32px;" onclick="toggleFav(${item.id}, event); mostraDettaglio(${item.id});">
                    ${isFav ? '★' : '☆'}
                </button>
            </div>

            <div style="margin-bottom:16px;">
                <h3 style="font-size:14px; font-weight:800; color:var(--primary); text-transform:uppercase; margin-bottom:6px;">⚠️ Possibili Cause:</h3>
                ${htmlCauses}
            </div>

            <div style="margin-bottom:16px;">
                <h3 style="font-size:14px; font-weight:800; color:#22c55e; text-transform:uppercase; margin-bottom:6px;">🛠️ Procedura di Risoluzione:</h3>
                ${htmlSteps}
            </div>

            <div class="tools-box">
                <div style="font-size:12px; font-weight:900; color:#cbd5e1; text-transform:uppercase;">🧰 Attrezzatura Consigliata (Clicca per acquistare su Amazon):</div>
                <div class="tools-list">
                    ${htmlAttrezzi}
                </div>
            </div>

            ${item.partName ? `
                <div style="background:#064e3b; border:1px solid #059669; padding:14px; border-radius:14px; margin-bottom:16px;">
                    <div style="font-size:12px; font-weight:800; color:#a7f3d0; text-transform:uppercase;">Ricambio Consigliato:</div>
                    <div style="font-size:16px; font-weight:800; color:#ffffff; margin-top:2px;">${item.partName}</div>
                    <div style="font-size:14px; color:#6ee7b7; font-family:monospace; margin-top:2px;">Codice: ${item.partCode}</div>
                </div>
            ` : ''}

            <a href="${amazonAffiliateUrl}" target="_blank" rel="noopener noreferrer" class="btn-amazon">
                🛒 Cerca Ricambio Principale su Amazon
            </a>

            ${item.gasParams && item.gasParams !== '-' ? `
                <div style="background:#451a03; border:1px solid #f97316; padding:14px; border-radius:14px; margin-top:16px; font-size:15px; color:#ffedd5;">
                    🔥 Parametri Combustione / Gas: <br>
                    <strong>${item.gasParams}</strong>
                </div>
            ` : ''}

            <div style="margin-top:16px;">
                <button class="btn-whatsapp" onclick="apriReportModal('${item.brand}', '${item.code}', '${item.desc}')">
                    💬 Crea Rapporto Cliente
                </button>
            </div>
        </div>
    `;

    cambiaVista('detail-view');
}

function salvaInStorico(item) {
    historyGuasti = historyGuasti.filter(h => h.id !== item.id);
    historyGuasti.unshift({ ...item, timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) });
    if (historyGuasti.length > 20) historyGuasti.pop();
    safeSetStorage('caldaiafix_history', historyGuasti);
}

function mostraStorico() {
    vibraTocco();
    impostaTabNav('history');
    const container = document.getElementById('history-list');
    if (!container) return;

    if (historyGuasti.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:20px;">
                <p style="font-size:14px; color:var(--text-sub);">Nessun guasto consultato di recente.</p>
            </div>
        `;
    } else {
        let html = '';
        historyGuasti.forEach(item => {
            html += `
                <div class="error-item" onclick="mostraDettaglio(${item.id})">
                    <div class="error-main-info">
                        <span class="badge-brand-code">${item.brand} - ${item.code}</span>
                        <div class="error-title">${item.desc}</div>
                    </div>
                    <span style="font-size:12px; color:var(--text-sub); font-weight:600;">${item.timestamp}</span>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    cambiaVista('history-view');
}

function richiediSvuotaStorico() {
    historyGuasti = [];
    localStorage.removeItem('caldaiafix_history');
    mostraStorico();
}

function toggleFav(id, event) {
    if (event) event.stopPropagation();
    vibraTocco();

    const idx = favorites.indexOf(id);
    if (idx > -1) {
        favorites.splice(idx, 1);
    } else {
        favorites.push(id);
    }
    safeSetStorage('caldaiafix_favs', favorites);
    filtraErrori(false);
}

// AREA TECNICA & GESTIONE PIN
function apriPin() {
    vibraTocco();
    const modal = document.getElementById('pin-modal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('pinInput');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 100);
        }
    }
}

function chiudiPin() {
    const modal = document.getElementById('pin-modal');
    const err = document.getElementById('pinError');
    const inp = document.getElementById('pinInput');

    if (modal) modal.style.display = 'none';
    if (err) err.style.display = 'none';
    if (inp) inp.value = '';
}

function verificaPin() {
    const pin = document.getElementById('pinInput')?.value.trim() || '';
    if (pin === '1234' || pin === '0000' || pin.length >= 4) {
        chiudiPin();
        renderAreaTecnica();
        cambiaVista('area-tecnica-view');
    } else {
        const err = document.getElementById('pinError');
        if (err) err.style.display = 'block';
    }
}

function renderAreaTecnica() {
    const container = document.getElementById('installer-content-main');
    if (!container) return;

    const menus = (typeof installerMenus !== 'undefined' && Array.isArray(installerMenus)) ? installerMenus : [];

    let html = `
        <div class="card" style="background:#2e1065; border-color:#7c3aed;">
            <h3 style="color:#d8b4fe; font-size:15px; font-weight:800; text-transform:uppercase; margin-bottom:12px;">🔑 Parametri Tecnici & Menu Segreti</h3>
    `;

    if (menus.length === 0) {
        html += `<p style="color:var(--text-sub); font-size:14px;">Nessun menu tecnico presente nel database.</p>`;
    } else {
        menus.forEach(m => {
            html += `
                <div style="background:var(--surface); border:1px solid var(--border); padding:14px; border-radius:14px; margin-bottom:10px;">
                    <div style="font-size:15px; font-weight:800; color:#c084fc;">${m.brand} (${m.model})</div>
                    <div style="font-size:14px; color:#ffffff; margin-top:6px; line-height:1.4;"><strong>Procedura:</strong> ${m.sequence}</div>
                    <div style="font-size:12px; color:var(--text-sub); margin-top:4px;"><em>${m.notes}</em></div>
                </div>
            `;
        });
    }

    html += `</div>`;
    container.innerHTML = html;
}

// QUICK-VIEWER MORSETTIERE
const morsettiereData = {
    "Baxi": {
        title: "Baxi - Luna3 / Duo-Tec / Eco",
        pins: [
            { num: "1 - 2", func: "Termostato Ambiente (TA)", note: "Tensione 230V. Rimuovere ponticello di serie." },
            { num: "3 - 4", func: "Comando Remoto / BUS OpenTherm", note: "Basso voltaggio (Polarizzato)." },
            { num: "5 - 6", func: "Sonda Esterna (SE)", note: "NTC 10k Ohm a 25°C." }
        ]
    },
    "Vaillant": {
        title: "Vaillant - ecoTEC pro / plus / AtmoTEC",
        pins: [
            { num: "3 - 4", func: "Termostato Ambiente 230V", note: "Rimuovere il cavetto ponticello rosso." },
            { num: "7 - 8 - 9", func: "Termostato Analogico Vaillant (24V)", note: "Collegare 7-8-9." },
            { num: "+ eBUS -", func: "Cronotermostato vRT / eBUS", note: "Polarizzato eBUS digitale." }
        ]
    },
    "Immergas": {
        title: "Immergas - Victrix TT / Avio / Maior",
        pins: [
            { num: "40 - 41", func: "Termostato Ambiente (TA)", note: "Contatto pulito (Rimuovere ponticello)." },
            { num: "42 - 43", func: "Comando Remoto CAR V2 (BUS)", note: "Basso voltaggio non polarizzato." },
            { num: "38 - 39", func: "Sonda Esterna", note: "NTC temperatura esterna." }
        ]
    },
    "Ariston": {
        title: "Ariston - Clas One / Genus / Cares",
        pins: [
            { num: "TA1", func: "Termostato Ambiente 1", note: "Contatto pulito. Rimuovere bridge verde." },
            { num: "B - T", func: "BUS BridgeNet Sensys", note: "Comunicazione digitale Ariston." },
            { num: "SOLAR", func: "Sonda Collettore Solare", note: "Ingresso sensore dedicato." }
        ]
    },
    "Beretta": {
        title: "Beretta - Mynute / Ciao / Paros",
        pins: [
            { num: "TA - TA", func: "Termostato Ambiente", note: "Morsettiera M2. Rimuovere cavetto." },
            { num: "OT - OT", func: "OpenTherm / BeSMART", note: "Contatto BUS Basso voltaggio." },
            { num: "SE - SE", func: "Sonda Esterna", note: "Morsetti sonda climatica." }
        ]
    },
    "Ferroli": {
        title: "Ferroli - Bluehelix / Divacondens",
        pins: [
            { num: "1 - 2", func: "Termostato Ambiente (TA)", note: "Contatto pulito. Rimuovere ponticello." },
            { num: "3 - 4", func: "Sonda Esterna / OpenTherm", note: "Configurabile da parametro scheda." }
        ]
    },
    "Hermann Saunier Duval": {
        title: "Hermann Saunier Duval - Thema / Saunier",
        pins: [
            { num: "24V = RT", func: "Termostato Ambiente 24V", note: "Togliere il ponte di fabbrica." },
            { num: "BUS (+ -)", func: "Cronotermostato Exacontrol", note: "Interfaccia BUS eBUS." }
        ]
    }
};

function mostraMorsettiere() {
    vibraTocco();
    impostaTabNav('menu');
    cambiaVista('morsettiere-view');
    const filter = document.getElementById('morsettiereBrandFilter');
    if (filter) renderMorsettieraBrand(filter.value);
}

function renderMorsettieraBrand(brandKey) {
    const container = document.getElementById('morsettiere-container');
    if (!container) return;

    const item = morsettiereData[brandKey] || morsettiereData["Baxi"];

    let htmlPins = item.pins.map(p => `
        <div class="terminal-pin-box">
            <span class="pin-num">${p.num}</span>
            <div class="pin-func">${p.func}</div>
            <div class="pin-note">${p.note}</div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="terminal-card">
            <h3 style="font-size:18px; font-weight:800; color:#38bdf8; margin-bottom:8px;">${item.title}</h3>
            <p style="font-size:13px; color:var(--text-sub); margin-bottom:14px;">Morsettiera principale di collegamento sulla scheda madre:</p>
            <div class="terminal-pin-grid">
                ${htmlPins}
            </div>
        </div>
    `;
}

// STAMPA & GENERATORE REPORT PDF
function stampaReportPDF() {
    vibraTocco();

    const company = document.getElementById('repCompany')?.value.trim() || 'Ditta Assistenza Tecnica';
    const client = document.getElementById('repClient')?.value.trim() || 'Cliente Generico';
    const boiler = document.getElementById('repBoiler')?.value.trim() || '-';
    const fault = document.getElementById('repFault')?.value.trim() || '-';
    const work = document.getElementById('repWork')?.value.trim() || 'Nessuna nota aggiuntiva';
    const price = document.getElementById('repPrice')?.value.trim() || '0.00';
    const dateStr = new Date().toLocaleDateString('it-IT');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Attiva i pop-up sul browser per generare il PDF.");
        return;
    }

    const htmlContent = `
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <title>Rapporto_Intervento_${dateStr}.pdf</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
                .header-box { border-bottom: 2px solid #ea580c; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .company-name { font-size: 22px; font-weight: bold; color: #ea580c; }
                .doc-title { font-size: 18px; font-weight: bold; text-align: right; }
                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
                .field-label { font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase; }
                .field-value { font-size: 15px; font-weight: bold; color: #0f172a; margin-top: 2px; }
                .section-title { font-size: 14px; font-weight: bold; color: #ea580c; text-transform: uppercase; margin-top: 20px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
                .work-box { background: #ffffff; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin-top: 8px; font-size: 14px; min-height: 100px; }
                .total-box { margin-top: 30px; text-align: right; font-size: 20px; font-weight: bold; color: #166534; }
                .footer-text { margin-top: 50px; font-size: 11px; text-align: center; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header-box">
                <div>
                    <div class="company-name">${company}</div>
                    <div style="font-size:12px; color:#64748b;">Rapporto Tecnico di Manutenzione / Riparazione</div>
                </div>
                <div class="doc-title">
                    <div>Data: ${dateStr}</div>
                </div>
            </div>

            <div class="info-grid">
                <div>
                    <div class="field-label">Cliente / Riferimento:</div>
                    <div class="field-value">${client}</div>
                </div>
                <div>
                    <div class="field-label">Caldaia / Impianto:</div>
                    <div class="field-value">${boiler}</div>
                </div>
            </div>

            <div class="section-title">Anomalia / Codice Guasto Riscontrato</div>
            <div class="work-box" style="min-height:auto;">
                <strong>${fault}</strong>
            </div>

            <div class="section-title">Intervento Svolto & Ricambi Sostituiti</div>
            <div class="work-box">
                ${work.replace(/\n/g, '<br>')}
            </div>

            <div class="total-box">
                IMPORTO TOTALE: € ${price}
            </div>

            <div class="footer-text">
                Documento generato tramite CaldaiaFix PRO • Copia Cliente
            </div>

            <script>
                window.onload = function() {
                    window.print();
                };
            </script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    chiudiReportModal();
}

// TROUBLESHOOTING WIZARD
const wizardTree = {
    start: {
        title: "Quale sintomo presenta la caldaia?",
        options: [
            { text: "💧 Acqua calda sanitaria tiepida o altalenante", next: "sanitaria" },
            { text: "🔌 Caldaia completamente spenta (Nessun LED/Display)", next: "spenta" },
            { text: "🔊 Rumori anomali (Ebollizione / Colpi d'ariete / Fischi)", next: "rumori" },
            { text: "📈 Pressione acqua instabile (Sale alta o cade a 0)", next: "pressione" },
            { text: "💦 Perdita d'acqua idraulica sotto la caldaia", next: "perdita" }
        ]
    },
    sanitaria: {
        title: "L'acqua riscalda quando il riscaldamento è acceso?",
        options: [
            { text: "Sì, l'acqua scalda bene solo con i termosifoni accesi", solution: "Valvola a 3 vie bloccata in posizione riscaldamento o attuatore guasto. Verificare lo spillo e la cartuccia sferica.", part: "Valvola 3 vie caldaia", tool: "⚡ Multimetro Digitale" },
            { text: "No, l'acqua cambia continuamente temperatura da calda a fredda", solution: "Scambiatore secondario a piastre intasato da calcare o Sonda NTC Sanitario ritarata.", part: "Scambiatore piastre sanitario", tool: "🛠️ Chiavi per Raccordi" },
            { text: "Il bruciatore non si accende proprio aprendo il rubinetto", solution: "Flussostato / Flussometro o microinterruttore sanitario guasto. Non rileva il flusso d'acqua.", part: "Flussostato sanitario caldaia", tool: "⚡ Multimetro Digitale" }
        ]
    },
    spenta: {
        title: "Hai verificato se c'è tensione sulla presa o sull'interruttore bipolare?",
        options: [
            { text: "C'è tensione 230V alla presa ma la caldaia è morta", solution: "Fusibile di protezione sulla scheda madre bruciato o scheda di alimentazione guasta a causa di sbalzo di tensione.", part: "Scheda madre caldaia", tool: "⚡ Multimetro Digitale" },
            { text: "Il salvavita generale di casa scatta subito appena accendo la caldaia", solution: "Dispersione verso terra. Verificare in ordine: Circolatore pompa in corto, Resistenza candeletta o Ventilatore fumi.", part: "Pompa circolatore caldaia", tool: "⚡ Multimetro Digitale" }
        ]
    },
    rumori: {
        title: "Che tipo di rumore senti durante il funzionamento?",
        options: [
            { text: "Ebollizione violenta / Gorgoglio tipo pentola a pressione", solution: "Mancanza di circolazione acqua. Pompa bloccata (sbloccare la vite centrale) o Scambiatore primario ostruito.", part: "Pompa circolatore caldaia", tool: "🪛 Cacciavite a Taglio Grosso" },
            { text: "Fischio acuto continuo durante la ventilazione", solution: "Cuscinetti del ventilatore esausti o tubetto Venturi / Pressostato fumi ostruito.", part: "Ventilatore fumi caldaia", tool: "💨 Pompetta Prova Pressostati" }
        ]
    },
    pressione: {
        title: "Cosa fa esattamente il manometro della pressione?",
        options: [
            { text: "La pressione sale oltre 2.5 - 3 bar solo quando accendo i termosifoni", solution: "Vaso d'espansione scarico d'aria o membrana bucata. Ripristinare precarica a 1.0 bar o sostituire vaso.", part: "Vaso espansione caldaia", tool: "🪠 Pompa con Manometro per Vasi" },
            { text: "La pressione scende continuamente a 0 bar ogni giorno", solution: "Perdita sull'impianto di riscaldamento o Scambiatore primario bucato con scarico in camera di combustione.", part: "Valvola sicurezza 3 bar", tool: "⚖️ Manometro Idraulico" }
        ]
    },
    perdita: {
        title: "Da dove proviene la perdita d'acqua?",
        options: [
            { text: "Dalla valvola di sicurezza con il tappino rosso (gocciola)", solution: "Valvola di sicurezza 3 bar sporca di calcare sotto la sede o pressione impianto troppo alta (> 3 bar).", part: "Valvola sicurezza 3 bar caldaia", tool: "🛠️ Chiavi per Raccordi" },
            { text: "Dal rubinetto di riempimento sotto la caldaia", solution: "Guarnizioni / OR del rubinetto di carico usurate o corpo in plastica crepato.", part: "Rubinetto di carico caldaia", tool: "🛠️ Chiavi per Raccordi" }
        ]
    }
};

function avviaWizard() {
    vibraTocco();
    impostaTabNav('home');
    cambiaVista('wizard-view');
    renderStepWizard('start');
}

function renderStepWizard(stepKey) {
    const container = document.getElementById('wizard-container');
    if (!container) return;

    const data = wizardTree[stepKey];
    if (!data) return;

    let html = `
        <div class="wizard-card">
            <div class="wizard-step-title">${data.title}</div>
            <div class="wizard-options-list">
    `;

    if (data.options) {
        data.options.forEach(opt => {
            if (opt.next) {
                html += `
                    <button class="wizard-option-btn" onclick="renderStepWizard('${opt.next}')">
                        <span>${opt.text}</span>
                        <span>›</span>
                    </button>
                `;
            } else if (opt.solution) {
                const searchPartUrl = `https://www.amazon.it/s?k=${encodeURIComponent(opt.part || "ricambio caldaia")}&tag=dbsolution-21`;
                const searchToolUrl = `https://www.amazon.it/s?k=${encodeURIComponent((opt.tool || "").replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim())}&tag=dbsolution-21`;

                html += `
                    <div class="wizard-solution-box">
                        <div style="font-size:12px; font-weight:900; color:#34d399; text-transform:uppercase; margin-bottom:6px;">🎯 Risultato Diagnostica:</div>
                        <div style="font-size:16px; font-weight:700; color:#ffffff; line-height:1.4; margin-bottom:12px;">${opt.solution}</div>

                        ${opt.tool ? `
                            <div style="margin-top:10px;">
                                <div style="font-size:12px; font-weight:800; color:#94a3b8;">🧰 Attrezzo Consigliato:</div>
                                <a href="${searchToolUrl}" target="_blank" rel="noopener noreferrer" class="tool-tag" style="margin-top:4px;">${opt.tool} ↗</a>
                            </div>
                        ` : ''}

                        ${opt.part ? `
                            <a href="${searchPartUrl}" target="_blank" rel="noopener noreferrer" class="btn-amazon" style="margin-top:14px;">
                                🛒 Cerca "${opt.part}" su Amazon
                            </a>
                        ` : ''}

                        <button class="btn-clear" style="width:100%; margin-top:12px;" onclick="renderStepWizard('start')">🔄 Ricomincia Diagnosi</button>
                    </div>
                `;
            }
        });
    }

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// BACKUP & RIPRISTINO JSON CLIENTE
function esportaBackupJSON() {
    if (!dbIndexed) {
        alert("Banca dati non ancora pronta o non supportata dal browser.");
        return;
    }
    vibraTocco();

    const transaction = dbIndexed.transaction(['targhe'], 'readonly');
    const store = transaction.objectStore('targhe');
    const request = store.getAll();

    request.onsuccess = () => {
        const data = request.result;
        if (!data || data.length === 0) {
            alert("Nessun cliente salvato nell'archivio da esportare.");
            return;
        }

        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CaldaiaFix_Backup_Clienti_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
}

function ripristinaBackupJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!Array.isArray(importedData)) {
                alert("File di backup non valido: deve contenere un elenco di clienti.");
                return;
            }

            if (!confirm(`Trovati ${importedData.length} clienti nel file. Vuoi aggiungerli all'archivio locale?`)) {
                return;
            }

            if (!dbIndexed) {
                alert("Banca dati non disponibile.");
                return;
            }

            const transaction = dbIndexed.transaction(['targhe'], 'readwrite');
            const store = transaction.objectStore('targhe');

            importedData.forEach(item => {
                delete item.id;
                store.add(item);
            });

            transaction.oncomplete = () => {
                alert("Ripristino completato con successo!");
                mostraTarghe();
                controllaScadenzeAllerta();
            };
        } catch (err) {
            alert("Errore nel caricamento del file JSON: " + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ARCHIVIO CLIENTI, INDEXED DB & SCADENZARIO
function initIndexedDB() {
    try {
        const request = indexedDB.open('CaldaiaFixTargheDB', 1);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('targhe')) {
                db.createObjectStore('targhe', { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = (e) => {
            dbIndexed = e.target.result;
            controllaScadenzeAllerta();
        };
    } catch(e) {
        console.warn("IndexedDB non disponibile:", e);
    }
}

function apriTargaModal() {
    vibraTocco();
    editingClientId = null;

    const modalTitle = document.getElementById('targa-modal-title');
    if (modalTitle) modalTitle.textContent = "📑 Nuovo Cliente";

    ['tagClient', 'tagPhone', 'tagAddress', 'tagBoiler', 'tagSerial', 'tagNotes', 'tagNextMaintenance'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const img = document.getElementById('tagImgPreview');
    if (img) {
        img.style.display = 'none';
        img.src = '';
    }

    const modal = document.getElementById('targa-modal');
    if (modal) modal.style.display = 'flex';
}

function chiudiTargaModal() {
    const modal = document.getElementById('targa-modal');
    if (modal) modal.style.display = 'none';
    editingClientId = null;

    ['tagClient', 'tagPhone', 'tagAddress', 'tagBoiler', 'tagSerial', 'tagNotes', 'tagNextMaintenance'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const img = document.getElementById('tagImgPreview');
    if (img) {
        img.style.display = 'none';
        img.src = '';
    }
}

function modificaTarga(id) {
    if (!dbIndexed) return;
    vibraTocco();

    const transaction = dbIndexed.transaction(['targhe'], 'readonly');
    const store = transaction.objectStore('targhe');
    const request = store.get(id);

    request.onsuccess = () => {
        const item = request.result;
        if (!item) return;

        editingClientId = id;

        const modalTitle = document.getElementById('targa-modal-title');
        if (modalTitle) modalTitle.textContent = "✏️ Modifica Scheda Cliente";

        const tagClient = document.getElementById('tagClient');
        const tagPhone = document.getElementById('tagPhone');
        const tagAddress = document.getElementById('tagAddress');
        const tagBoiler = document.getElementById('tagBoiler');
        const tagSerial = document.getElementById('tagSerial');
        const tagNotes = document.getElementById('tagNotes');
        const tagNextMaint = document.getElementById('tagNextMaintenance');
        const imgPreview = document.getElementById('tagImgPreview');

        if (tagClient) tagClient.value = item.client || '';
        if (tagPhone) tagPhone.value = item.phone || '';
        if (tagAddress) tagAddress.value = item.address || '';
        if (tagBoiler) tagBoiler.value = item.boiler || '';
        if (tagSerial) tagSerial.value = item.serial || '';
        if (tagNotes) tagNotes.value = item.notes || '';
        if (tagNextMaint) tagNextMaint.value = item.nextMaintenance || '';

        if (imgPreview) {
            if (item.image) {
                imgPreview.src = item.image;
                imgPreview.style.display = 'block';
            } else {
                imgPreview.src = '';
                imgPreview.style.display = 'none';
            }
        }

        const modal = document.getElementById('targa-modal');
        if (modal) modal.style.display = 'flex';
    };
}

function anteprimaFotoTarga(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('tagImgPreview');
            if (img) {
                img.src = e.target.result;
                img.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    }
}

function salvaSchedaTarga() {
    if (!dbIndexed) return;

    const client = document.getElementById('tagClient')?.value.trim() || '';
    const phone = document.getElementById('tagPhone')?.value.trim() || '';
    const address = document.getElementById('tagAddress')?.value.trim() || '';
    const boiler = document.getElementById('tagBoiler')?.value.trim() || '';
    const serial = document.getElementById('tagSerial')?.value.trim() || '';
    const notes = document.getElementById('tagNotes')?.value.trim() || '';
    const nextMaint = document.getElementById('tagNextMaintenance')?.value || '';
    const imgEl = document.getElementById('tagImgPreview');
    const imgSrc = imgEl ? imgEl.src : '';

    if (!client && !boiler) {
        alert("Inserisci almeno il Nome Cliente o il Modello Caldaia.");
        return;
    }

    const item = {
        client: client || "Cliente Generico",
        phone: phone,
        address: address,
        boiler: boiler,
        serial: serial,
        notes: notes,
        nextMaintenance: nextMaint,
        image: (imgSrc && imgSrc.startsWith('data:image')) ? imgSrc : null,
        date: new Date().toLocaleDateString('it-IT')
    };

    const transaction = dbIndexed.transaction(['targhe'], 'readwrite');
    const store = transaction.objectStore('targhe');

    if (editingClientId) {
        item.id = editingClientId;
        store.put(item);
    } else {
        store.add(item);
    }

    transaction.oncomplete = () => {
        chiudiTargaModal();
        mostraTarghe();
        controllaScadenzeAllerta();
    };
}

function mostraTarghe() {
    vibraTocco();
    impostaTabNav('targhe');
    cambiaVista('targhe-view');
    caricaTarghe();
}

function caricaTarghe() {
    if (!dbIndexed) return;

    const container = document.getElementById('targhe-list');
    if (!container) return;

    const transaction = dbIndexed.transaction(['targhe'], 'readonly');
    const store = transaction.objectStore('targhe');
    const request = store.getAll();

    request.onsuccess = () => {
        const items = request.result;
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align:center; padding:20px;">
                    <p style="font-size:14px; color:var(--text-sub);">Nessun cliente salvato nell'archivio.</p>
                </div>
            `;
            return;
        }

        const oggi = new Date();
        oggi.setHours(0,0,0,0);

        let html = '';
        items.reverse().forEach(item => {
            let statusBadge = '';
            let dateFormatted = '-';

            if (item.nextMaintenance) {
                const dataScad = new Date(item.nextMaintenance);
                const diffDays = Math.ceil((dataScad - oggi) / (1000 * 60 * 60 * 24));
                dateFormatted = dataScad.toLocaleDateString('it-IT');

                if (diffDays < 0) {
                    statusBadge = `<div class="maint-badge maint-alert">🔴 Manutenzione Scaduta (${dateFormatted})</div>`;
                } else if (diffDays <= 30) {
                    statusBadge = `<div class="maint-badge maint-warn">🟡 In Scadenza (Mancano ${diffDays} gg)</div>`;
                } else {
                    statusBadge = `<div class="maint-badge maint-ok">🟢 Regolare (Scade il ${dateFormatted})</div>`;
                }
            }

            const phoneDisplay = item.phone ? `📞 ${item.phone}` : '📞 Nessun telefono';

            html += `
                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <div style="font-size:17px; font-weight:800; color:#ffffff;">${item.client}</div>
                            <div style="font-size:13px; color:#38bdf8; font-weight:600; margin-top:2px;">${phoneDisplay}</div>
                            <div style="font-size:13px; color:var(--text-sub); font-weight:600;">📍 ${item.address || 'Nessun indirizzo'}</div>
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button style="background:none; border:none; color:#38bdf8; font-size:18px; cursor:pointer;" onclick="modificaTarga(${item.id})" title="Modifica Scheda">✏️</button>
                            <button style="background:none; border:none; color:#ef4444; font-size:18px; cursor:pointer;" onclick="eliminaTarga(${item.id})" title="Elimina Scheda">🗑️</button>
                        </div>
                    </div>

                    <div style="margin-top:10px; font-size:14px; color:#ffffff;">
                        <div>🔥 Caldaia: <strong>${item.boiler || '-'}</strong></div>
                        <div>🏷️ Matricola: <strong>${item.serial || '-'}</strong></div>
                        ${statusBadge}
                        ${item.notes ? `<div style="margin-top:6px; font-style:italic; color:var(--text-sub);">" ${item.notes} "</div>` : ''}
                    </div>

                    <!-- PULSANTI PROMEMORIA 1-CLICK -->
                    <div style="display:flex; gap:8px; margin-top:12px;">
                        <button class="btn-whatsapp" style="flex:1; padding:10px; font-size:13px;" 
                            onclick="inviaPromemoriaWhatsApp('${escapeQuotes(item.client)}', '${escapeQuotes(item.boiler)}', '${dateFormatted}', '${item.phone}')">
                            💬 Avvisa WhatsApp
                        </button>
                        <button class="btn-action" style="flex:1; padding:10px; font-size:13px; background:#2563eb;" 
                            onclick="inviaPromemoriaSMS('${escapeQuotes(item.client)}', '${escapeQuotes(item.boiler)}', '${dateFormatted}', '${item.phone}')">
                            📱 Avvisa SMS
                        </button>
                    </div>

                    ${item.image ? `<img src="${item.image}" style="width:100%; max-height:200px; object-fit:cover; border-radius:12px; margin-top:10px;" alt="Targa">` : ''}

                    <div style="font-size:11px; color:var(--text-sub); margin-top:8px; text-align:right;">Salvato il: ${item.date}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    };
}

function escapeQuotes(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function inviaPromemoriaWhatsApp(client, boiler, dateStr, phone) {
    vibraTocco();
    const company = localStorage.getItem('caldaiafix_company') || 'Assistenza Tecnica';
    const cleanPhone = (phone || '').replace(/\D/g, '');

    const testo = `Gentile ${client},\nLe ricordiamo che il controllo periodico e la manutenzione della Sua caldaia (${boiler}) è in scadenza il ${dateStr}.\n\nPer fissare un appuntamento ci contatti al più presto.\nCordiali saluti,\n*${company}*`;

    let url = '';
    if (cleanPhone) {
        const fullPhone = cleanPhone.startsWith('39') ? cleanPhone : `39${cleanPhone}`;
        url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(testo)}`;
    } else {
        url = `https://wa.me/?text=${encodeURIComponent(testo)}`;
    }

    window.open(url, '_blank');
}

function inviaPromemoriaSMS(client, boiler, dateStr, phone) {
    vibraTocco();
    const company = localStorage.getItem('caldaiafix_company') || 'Assistenza Tecnica';
    const cleanPhone = (phone || '').replace(/\D/g, '');

    if (!cleanPhone) {
        alert("Inserisci o importa il numero di telefono del cliente per inviare l'SMS.");
        return;
    }

    const testo = `Gentile ${client}, Le ricordiamo che la manutenzione della caldaia (${boiler}) scade il ${dateStr}. Ci contatti per fissare un appuntamento. - ${company}`;

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIos 
        ? `sms:${cleanPhone}&body=${encodeURIComponent(testo)}`
        : `sms:${cleanPhone}?body=${encodeURIComponent(testo)}`;

    window.location.href = url;
}

function importaClientiExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        alert("Libreria di lettura Excel in caricamento... Riprova tra 3 secondi.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

            if (!rows || rows.length === 0) {
                alert("Il file Excel è vuoto o non contiene dati validi.");
                return;
            }

            if (!confirm(`Trovati ${rows.length} clienti nel file Excel. Vuoi importarli nell'archivio clienti?`)) {
                return;
            }

            if (!dbIndexed) {
                alert("Banca dati locale non pronta.");
                return;
            }

            const transaction = dbIndexed.transaction(['targhe'], 'readwrite');
            const store = transaction.objectStore('targhe');

            let conteggio = 0;

            rows.forEach(r => {
                const getVal = (keys) => {
                    for (let k of keys) {
                        const foundKey = Object.keys(r).find(keyName => keyName.toLowerCase().trim() === k.toLowerCase());
                        if (foundKey && r[foundKey]) return String(r[foundKey]).trim();
                    }
                    return '';
                };

                const client = getVal(['cliente', 'nome', 'cognome', 'nominativo', 'ragione sociale']);
                const phone = getVal(['telefono', 'cellulare', 'tel', 'mobile']);
                const address = getVal(['indirizzo', 'via', 'citta', 'location']);
                const boiler = getVal(['caldaia', 'modello', 'marca', 'impianto']);
                const serial = getVal(['matricola', 'seriale', 'sn']);
                const nextMaintRaw = getVal(['scadenza', 'prossimo controllo', 'data', 'manutenzione']);
                const notes = getVal(['note', 'annotazioni', 'dettagli']);

                let formattedDate = '';
                if (nextMaintRaw) {
                    if (typeof nextMaintRaw === 'number') {
                        const parsedDate = XLSX.SSF.parse_date_code(nextMaintRaw);
                        if (parsedDate) {
                            formattedDate = `${parsedDate.y}-${String(parsedDate.m).padStart(2, '0')}-${String(parsedDate.d).padStart(2, '0')}`;
                        }
                    } else if (nextMaintRaw.includes('/')) {
                        const parts = nextMaintRaw.split('/');
                        if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                    } else if (nextMaintRaw.includes('-')) {
                        formattedDate = nextMaintRaw;
                    }
                }

                if (client || boiler || phone) {
                    store.add({
                        client: client || "Cliente da Excel",
                        phone: phone,
                        address: address,
                        boiler: boiler,
                        serial: serial,
                        notes: notes,
                        nextMaintenance: formattedDate,
                        image: null,
                        date: new Date().toLocaleDateString('it-IT')
                    });
                    conteggio++;
                }
            });

            transaction.oncomplete = () => {
                alert(`Importazione completata con successo! Inseriti ${conteggio} clienti.`);
                mostraTarghe();
                controllaScadenzeAllerta();
            };

        } catch (err) {
            alert("Errore nella lettura del file Excel: " + err.message);
        }
    };

    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

function eliminaTarga(id) {
    if (!confirm("Vuoi davvero eliminare questa scheda cliente?")) return;
    if (!dbIndexed) return;

    const transaction = dbIndexed.transaction(['targhe'], 'readwrite');
    const store = transaction.objectStore('targhe');
    store.delete(id);

    transaction.oncomplete = () => {
        caricaTarghe();
        controllaScadenzeAllerta();
    };
}

function richiediSvuotaTarghe() {
    if (!confirm("Sei sicuro di voler cancellare TUTTA la banca dati dei clienti salvati?")) return;
    if (!dbIndexed) return;

    const transaction = dbIndexed.transaction(['targhe'], 'readwrite');
    const store = transaction.objectStore('targhe');
    store.clear();

    transaction.oncomplete = () => {
        caricaTarghe();
        controllaScadenzeAllerta();
    };
}

// CALCOLATORI TECNICI & RENDIMENTO COMBUSTIONE (UNI 10389-1)
function mostraCalcolatori() {
    vibraTocco();
    impostaTabNav('calc');
    cambiaVista('calc-view');
}

function calcolaRendimentoCombustione() {
    const tfEl = document.getElementById('tempFumi');
    const taEl = document.getElementById('tempAmbiente');
    const co2El = document.getElementById('valoreCO2');
    const fuelEl = document.getElementById('tipoCombustibile');
    const resBox = document.getElementById('rendimentoResult');

    if (!tfEl || !taEl || !co2El || !resBox) return;

    const Tf = parseFloat(tfEl.value);
    const Ta = parseFloat(taEl.value) || 20;
    const CO2 = parseFloat(co2El.value);
    const fuel = fuelEl ? fuelEl.value : 'metano';

    if (isNaN(Tf) || isNaN(CO2) || CO2 <= 0 || Tf <= Ta) {
        resBox.textContent = 'Rendimento \u03B7: -- % | Perdita qA: -- %';
        resBox.style.color = '#93c5fd';
        return;
    }

    let A2 = 0.37;
    let B = 0.009;

    if (fuel === 'gpl') {
        A2 = 0.42;
        B = 0.008;
    }

    const qA = (Tf - Ta) * ((A2 / CO2) + B);
    const eta = 100 - qA;

    const etaFormatted = eta.toFixed(1);
    const qAFormatted = qA.toFixed(1);

    if (eta >= 90) {
        resBox.textContent = `Rendimento \u03B7: ${etaFormatted}% (CONFORME) | Perdita qA: ${qAFormatted}%`;
        resBox.style.color = '#86efac';
    } else {
        resBox.textContent = `Rendimento \u03B7: ${etaFormatted}% (NON CONFORME <90%) | Perdita qA: ${qAFormatted}%`;
        resBox.style.color = '#fca5a5';
    }
}

function calcolaPortataGas() {
    const input = document.getElementById('gasLiters');
    const resultBox = document.getElementById('gasResult');
    if (!input || !resultBox) return;

    const litri = parseFloat(input.value);
    if (isNaN(litri) || litri <= 0) {
        resultBox.textContent = '0.0 kW Termici';
        return;
    }

    const kw = (litri * 0.06 * 9.6).toFixed(1);
    resultBox.textContent = `${kw} kW Termici`;
}

function calcolaVasoEspansione() {
    const volInput = document.getElementById('waterVolume');
    const heightInput = document.getElementById('buildingHeight');
    const resultBox = document.getElementById('vasoResult');
    if (!volInput || !resultBox) return;

    const vol = parseFloat(volInput.value);
    const height = parseFloat(heightInput?.value) || 0;

    if (isNaN(vol) || vol <= 0) {
        resultBox.textContent = 'Vaso Minimo: 0 L | Precarica: 1.0 bar';
        return;
    }

    const vasoLitri = Math.ceil(vol * 0.08);
    const precaricaBar = (1.0 + (height * 0.1)).toFixed(1);

    resultBox.textContent = `Vaso Minimo: ${vasoLitri} L | Precarica: ${precaricaBar} bar`;
}

function convertiPressione(type) {
    const mbarInput = document.getElementById('inputMbar');
    const paInput = document.getElementById('inputPascal');
    if (!mbarInput || !paInput) return;

    if (type === 'mbar') {
        const val = parseFloat(mbarInput.value);
        paInput.value = isNaN(val) ? '' : Math.round(val * 100);
    } else {
        const val = parseFloat(paInput.value);
        mbarInput.value = isNaN(val) ? '' : (val / 100).toFixed(2);
    }
}

// RAPPORTO INTERVENTO WHATSAPP
function apriReportModal(brand, code, desc) {
    vibraTocco();
    const company = localStorage.getItem('caldaiafix_company') || '';
    const repCompany = document.getElementById('repCompany');
    const repBoiler = document.getElementById('repBoiler');
    const repFault = document.getElementById('repFault');
    const modal = document.getElementById('report-modal');

    if (repCompany) repCompany.value = company;
    if (repBoiler) repBoiler.value = brand;
    if (repFault) repFault.value = `${code} - ${desc}`;
    if (modal) modal.style.display = 'flex';
}

function chiudiReportModal() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.style.display = 'none';
}

function inviaRapportoWhatsApp() {
    const company = document.getElementById('repCompany')?.value.trim() || '';
    const client = document.getElementById('repClient')?.value.trim() || '';
    const boiler = document.getElementById('repBoiler')?.value.trim() || '';
    const fault = document.getElementById('repFault')?.value.trim() || '';
    const work = document.getElementById('repWork')?.value.trim() || '';
    const price = document.getElementById('repPrice')?.value.trim() || '';

    let testo = `*RAPPORTO INTERVENTO TECNICO*\n`;
    if (company) testo += `🏢 Ditta: ${company}\n`;
    if (client) testo += `👤 Cliente: ${client}\n`;
    if (boiler) testo += `🔥 Caldaia: ${boiler}\n`;
    if (fault) testo += `⚠️ Guasto: ${fault}\n`;
    if (work) testo += `🛠️ Lavoro Svolto: ${work}\n`;
    if (price) testo += `💶 Importo Totale: € ${price}\n`;
    testo += `\n_Inviato da CaldaiaFix PRO_`;

    const url = `https://wa.me/?text=${encodeURIComponent(testo)}`;
    window.open(url, '_blank');
    chiudiReportModal();
}

// NAVIGAZIONE, VISTE & MENU TENDINA
function cambiaVista(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    window.scrollTo(0, 0);
}

function tornaHome() {
    vibraTocco();
    impostaTabNav('home');
    cambiaVista('home-view');
}

function mostraImpostazioni() {
    vibraTocco();
    impostaTabNav('menu');
    cambiaVista('settings-view');
}

function toggleMenuTendina() {
    vibraTocco();
    const overlay = document.getElementById('dropup-overlay');
    const menu = document.getElementById('dropup-menu');

    if (!overlay || !menu) return;

    if (menu.classList.contains('active')) {
        menu.classList.remove('active');
        overlay.classList.remove('active');
    } else {
        overlay.classList.add('active');
        menu.classList.add('active');
    }
}

function impostaTabNav(tab) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${tab}`);
    if (navBtn) navBtn.classList.add('active');
}

// TORCIA FLASH & PWA
function toggleTorch() {
    vibraTocco();
    if (!isTorchOn) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Torcia non disponibile su questo browser.");
            return;
        }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                torchTrack = stream.getVideoTracks()[0];
                return torchTrack.applyConstraints({ advanced: [{ torch: true }] });
            })
            .then(() => {
                isTorchOn = true;
                const btn = document.getElementById('menu-torch-btn');
                if (btn) btn.style.color = '#f97316';
            })
            .catch(err => {
                alert("Torcia non disponibile o permessi negati.");
            });
    } else {
        if (torchTrack) torchTrack.stop();
        isTorchOn = false;
        const btn = document.getElementById('menu-torch-btn');
        if (btn) btn.style.color = '';
    }
}

function gestisciPwaInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.display = 'flex';
    });

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (isIos && !isStandalone) {
        const iosBanner = document.getElementById('ios-install-banner');
        if (iosBanner) iosBanner.style.display = 'flex';
    }
}

function installaPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            chiudiPwaBanner();
        });
    }
}

function chiudiPwaBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
}

function chiudiIosBanner() {
    const banner = document.getElementById('ios-install-banner');
    if (banner) banner.style.display = 'none';
}

// FEEDBACK & BUG REPORTING
function apriFeedbackModal() {
    vibraTocco();
    const modal = document.getElementById('feedback-modal');
    if (modal) modal.style.display = 'flex';
}

function chiudiFeedbackModal() {
    const modal = document.getElementById('feedback-modal');
    if (modal) modal.style.display = 'none';
}

function cambiaTabFeedback(tab) {
    vibraTocco();
    const tabCodeBtn = document.getElementById('tab-code-btn');
    const tabBugBtn = document.getElementById('tab-bug-btn');
    const formCode = document.getElementById('form-feedback-code');
    const formBug = document.getElementById('form-feedback-bug');

    if (tab === 'code') {
        if (tabCodeBtn) tabCodeBtn.classList.add('active');
        if (tabBugBtn) tabBugBtn.classList.remove('active');
        if (formCode) formCode.style.display = 'block';
        if (formBug) formBug.style.display = 'none';
    } else {
        if (tabCodeBtn) tabCodeBtn.classList.remove('active');
        if (tabBugBtn) tabBugBtn.classList.add('active');
        if (formCode) formCode.style.display = 'none';
        if (formBug) formBug.style.display = 'block';
    }
}

function inviaFeedbackEmail(type) {
    vibraTocco();
    let emailBody = '';
    const subject = type === 'code' ? 'CaldaiaFix PRO - Nuovo Codice Errore' : 'CaldaiaFix PRO - Segnalazione Bug';

    if (type === 'code') {
        const brand = document.getElementById('fbBrand')?.value.trim() || '';
        const model = document.getElementById('fbModel')?.value.trim() || '';
        const code = document.getElementById('fbCode')?.value.trim() || '';
        const sol = document.getElementById('fbSolution')?.value.trim() || '';

        if (!brand || !code) {
            alert("Inserisci almeno Marca e Codice Errore.");
            return;
        }
        emailBody = `Marca: ${brand}\nModello: ${model}\nCodice: ${code}\nSoluzione Proposta:\n${sol}`;
    } else {
        const bug = document.getElementById('fbBugDesc')?.value.trim() || '';
        if (!bug) {
            alert("Descrivi il problema riscontrato.");
            return;
        }
        emailBody = `Descrizione Bug:\n${bug}`;
    }

    const mailtoUrl = `mailto:assistenza@dbsolution.it?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    chiudiFeedbackModal();
}

// UTILITY & IMPOSTAZIONI DITTA
function salvaImpostazioniDitta() {
    const el = document.getElementById('settingCompany');
    if (el) localStorage.setItem('caldaiafix_company', el.value.trim());
}

function salvaImpostazioniVibrazione() {
    const el = document.getElementById('settingVibration');
    if (el) localStorage.setItem('caldaiafix_vibration', el.checked ? 'true' : 'false');
}

function caricaImpostazioni() {
    const comp = localStorage.getItem('caldaiafix_company');
    const compEl = document.getElementById('settingCompany');
    if (comp && compEl) compEl.value = comp;

    const vib = localStorage.getItem('caldaiafix_vibration');
    const vibEl = document.getElementById('settingVibration');
    if (vib !== null && vibEl) vibEl.checked = (vib === 'true');
}

function vibraTocco() {
    const enabled = localStorage.getItem('caldaiafix_vibration') !== 'false';
    if (enabled && navigator.vibrate) {
        navigator.vibrate(15);
    }
}
