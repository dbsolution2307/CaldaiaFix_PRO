/* ==========================================================================
   CALDAIAFIX PRO - LOGICA APPLICAZIONE, GESTIONE CLIENTI, LICENZA & GDPR (v5.0)
   ========================================================================== */

// CODICE DI SBLOCCO MASTER PER ATTIVARE LA LICENZA ILLIMITATA
const MASTER_LICENSE_KEY = "CFPRO-8899-DB";
const TRIAL_DAYS = 60; // 2 Mesi di prova
const AMAZON_AFFILIATE_TAG = "dbsolution-21";
const SUPPORT_EMAIL = "caldaiafixassistenza@libero.it";

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

// ID CLIENTE IN FASE DI MODIFICA
let editingClientId = null;

// INIZIALIZZAZIONE
function initApp() {
    try {
        if (!verificaConsensoGDPR()) return; // Blocco se consenso non dato
        verificaStatoLicenza60Giorni();
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

// FEEDBACK VIBRAZIONE AL TOCCO
function vibraTocco() {
    const active = safeGetStorage('caldaiafix_vibration', true);
    if (active && navigator.vibrate) {
        try {
            navigator.vibrate(25);
        } catch (e) {}
    }
}

// NAVIGATIONI E VISTE
function impostaTabNav(tabId) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const targetNav = document.getElementById(`nav-${tabId}`);
    if (targetNav) targetNav.classList.add('active');
}

function cambiaVista(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function tornaHome() {
    vibraTocco();
    impostaTabNav('home');
    cambiaVista('home-view');
    filtraErrori(false);
}

function mostraTarghe() {
    vibraTocco();
    impostaTabNav('targhe');
    cambiaVista('targhe-view');
    caricaTarghe();
}

function mostraCalcolatori() {
    vibraTocco();
    impostaTabNav('calc');
    cambiaVista('calc-view');
}

function mostraStorico() {
    vibraTocco();
    impostaTabNav('history');
    cambiaVista('history-view');
    renderStorico();
}

function mostraImpostazioni() {
    vibraTocco();
    impostaTabNav('menu');
    cambiaVista('settings-view');
    verificaStatoLicenza60Giorni();
}

function toggleMenuTendina() {
    vibraTocco();
    const menu = document.getElementById('dropup-menu');
    const overlay = document.getElementById('dropup-overlay');
    if (menu && overlay) {
        const isVisible = menu.classList.contains('active');
        if (isVisible) {
            menu.classList.remove('active');
            overlay.classList.remove('active');
        } else {
            menu.classList.add('active');
            overlay.classList.add('active');
        }
    }
}

// GESTIONE CENTRO HELP (❓ FAQ, NOTE LEGALI GDPR & ASSISTENZA)
function apriHelpModal() {
    vibraTocco();
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.style.display = 'flex';
        cambiaTabHelp('faq');
    }
}

function chiudiHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function cambiaTabHelp(tabName) {
    vibraTocco();
    ['faq', 'legal', 'contact'].forEach(t => {
        const btn = document.getElementById(`tab-${t}-btn`);
        const sec = document.getElementById(`help-section-${t}`);
        if (btn) btn.classList.remove('active');
        if (sec) sec.style.display = 'none';
    });

    const activeBtn = document.getElementById(`tab-${tabName}-btn`);
    const activeSec = document.getElementById(`help-section-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeSec) activeSec.style.display = 'block';
}

// GESTIONE CONSENSO GDPR & NOTE LEGALI AL PRIMO AVVIO
function verificaConsensoGDPR() {
    const isAccepted = localStorage.getItem('caldaiafix_gdpr_accepted') === 'true';
    const consentModal = document.getElementById('gdpr-consent-modal');

    if (!isAccepted) {
        if (consentModal) consentModal.style.display = 'flex';
        return false;
    } else {
        if (consentModal) consentModal.style.display = 'none';
        return true;
    }
}

function confermaConsensoGDPR() {
    const chk = document.getElementById('chkGdprAccept');
    if (!chk || !chk.checked) {
        alert("Per procedere è necessario accettare l'Informativa Privacy e i Termini d'Uso.");
        return;
    }

    localStorage.setItem('caldaiafix_gdpr_accepted', 'true');
    vibraTocco();
    const consentModal = document.getElementById('gdpr-consent-modal');
    if (consentModal) consentModal.style.display = 'none';
    initApp();
}

// GESTIONE LICENZA PROVA 60 GIORNI E SBLOCCO
function verificaStatoLicenza60Giorni() {
    const isUnlocked = localStorage.getItem('caldaiafix_unlocked') === 'true';
    const settingsInfo = document.getElementById('settings-license-info');
    const trialBanner = document.getElementById('license-status-banner');
    const trialDaysLeftEl = document.getElementById('trial-days-left');

    if (isUnlocked) {
        if (settingsInfo) settingsInfo.textContent = "🟢 Licenza ILLIMITATA Attiva";
        if (trialBanner) trialBanner.style.display = 'none';
        return true;
    }

    let installTimestamp = localStorage.getItem('caldaiafix_install_date');
    if (!installTimestamp) {
        installTimestamp = Date.now();
        localStorage.setItem('caldaiafix_install_date', installTimestamp);
    } else {
        installTimestamp = parseInt(installTimestamp, 10);
    }

    const now = Date.now();
    const elapsedMs = now - installTimestamp;
    const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
    const remainingDays = TRIAL_DAYS - elapsedDays;

    if (remainingDays <= 0) {
        const blockedModal = document.getElementById('license-blocked-modal');
        if (blockedModal) blockedModal.style.display = 'flex';
        if (settingsInfo) settingsInfo.textContent = "🔴 Periodo di prova scaduto. Licenza richiesta.";
        if (trialBanner) trialBanner.style.display = 'none';
        return false;
    } else {
        if (trialBanner) trialBanner.style.display = 'block';
        if (trialDaysLeftEl) trialDaysLeftEl.textContent = remainingDays;
        if (settingsInfo) settingsInfo.textContent = `🟡 Periodo di Prova: ${remainingDays} giorni rimanenti su ${TRIAL_DAYS}.`;
        return true;
    }
}

function sbloccaAppConCodice() {
    const input = document.getElementById('activationCodeInput')?.value.trim().toUpperCase() || '';
    if (input === MASTER_LICENSE_KEY) {
        localStorage.setItem('caldaiafix_unlocked', 'true');
        alert("🎉 Licenza PRO Attivata con successo! L'applicazione è ora sbloccata in modo illimitato.");
        location.reload();
    } else {
        alert("❌ Codice Licenza Errato. Verifica il codice e riprova.");
    }
}

function sbloccaAppDaModaleBlocco() {
    const input = document.getElementById('blockedActivationCodeInput')?.value.trim().toUpperCase() || '';
    const errEl = document.getElementById('licenseBlockedError');
    if (input === MASTER_LICENSE_KEY) {
        localStorage.setItem('caldaiafix_unlocked', 'true');
        alert("🎉 Licenza PRO Attivata con successo!");
        location.reload();
    } else {
        if (errEl) errEl.style.display = 'block';
    }
}

// FILTRAGGIO E RENDERING LISTA ERRORI HOME
function aggiornaContatoreHeader() {
    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    const countBox = document.getElementById('resultsCount');
    if (countBox) {
        countBox.textContent = `${dbData.length} GUASTI PRESENTI NEL DATABASE`;
    }
}

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

function toggleFav(id, event) {
    if (event) event.stopPropagation();
    vibraTocco();
    const index = favorites.indexOf(id);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(id);
    }
    safeSetStorage('caldaiafix_favs', favorites);
    filtraErrori(false);
}

// DETTAGLIO GUASTO
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
        htmlSteps = '<ol style="padding-left:20px; font-size:14px; line-height:1.6; margin-top:8px;">' + 
                    item.steps.map(s => `<li style="margin-bottom:6px; color:#e2e8f0;">${s}</li>`).join('') + 
                    '</ol>';
    } else {
        htmlSteps = '<p style="font-size:14px; color:var(--text-sub); margin-top:6px;">Procedura standard di verifica componenti.</p>';
    }

    const searchQuery = encodeURIComponent(`${item.brand} ${item.partName || item.code} ricambio caldaia`);
    const amazonUrl = `https://www.amazon.it/s?k=${searchQuery}&tag=${AMAZON_AFFILIATE_TAG}`;

    detailContent.innerHTML = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <span class="badge-brand-code" style="font-size:16px;">${item.brand} - ${item.code}</span>
                    <h2 style="font-size:18px; color:#ffffff; margin-top:8px;">${item.desc}</h2>
                    <p style="font-size:13px; color:var(--text-sub); margin-top:2px;">Modello: <strong>${item.model}</strong></p>
                </div>
                <button class="fav-btn ${isFav ? 'active' : ''}" style="font-size:24px;" onclick="toggleFav(${item.id}, event)">
                    ${isFav ? '★' : '☆'}
                </button>
            </div>

            <div style="margin-top:16px; border-top:1px solid #334155; padding-top:14px;">
                <h3 style="font-size:15px; color:#38bdf8; margin-bottom:6px;">🛠️ Soluzione & Procedura di Controllo:</h3>
                ${htmlSteps}
            </div>

            ${item.partName ? `
            <div style="margin-top:16px; background:#0f172a; padding:12px; border-radius:10px; border:1px solid #334155;">
                <strong style="color:#ffffff; font-size:14px;">🔍 Ricambio Probabile:</strong>
                <p style="color:#cbd5e1; font-size:13px; margin-top:2px;">${item.partName} ${item.partCode ? `(Cod. ${item.partCode})` : ''}</p>
                <a href="${amazonUrl}" target="_blank" rel="noopener" style="display:inline-block; margin-top:8px; background:#f59e0b; color:#0f172a; padding:8px 14px; border-radius:8px; font-weight:800; text-decoration:none; font-size:13px;">
                    🛒 Cerca Ricambio su Amazon
                </a>
            </div>
            ` : ''}

            <div style="display:flex; gap:10px; margin-top:16px;">
                <button class="btn-action" style="flex:1;" onclick="apriReportModal(${item.id})">💬 Crea Rapporto Cliente</button>
            </div>
        </div>
    `;

    cambiaVista('detail-view');
}

// STORICO GUASTI RECENTI
function salvaInStorico(item) {
    historyGuasti = historyGuasti.filter(h => h.id !== item.id);
    historyGuasti.unshift({
        id: item.id,
        brand: item.brand,
        code: item.code,
        desc: item.desc,
        model: item.model,
        date: new Date().toLocaleDateString('it-IT')
    });
    if (historyGuasti.length > 20) historyGuasti.pop();
    safeSetStorage('caldaiafix_history', historyGuasti);
}

function renderStorico() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;

    if (!historyGuasti || historyGuasti.length === 0) {
        listEl.innerHTML = `
            <div class="card" style="text-align:center; padding:30px 15px;">
                <div style="font-size:32px; margin-bottom:8px;">📜</div>
                <div style="font-weight:800; font-size:16px; color:#ffffff;">Storico vuoto</div>
                <div style="font-size:14px; color:var(--text-sub); margin-top:4px;">I guasti che consulterai appariranno qui.</div>
            </div>
        `;
        return;
    }

    let html = '';
    historyGuasti.forEach(h => {
        html += `
            <div class="error-item" onclick="mostraDettaglio(${h.id})">
                <div class="error-main-info">
                    <div class="error-badges-row">
                        <span class="badge-brand-code">${h.brand} - ${h.code}</span>
                        <span class="error-model-text">${h.model}</span>
                    </div>
                    <div class="error-title">${h.desc}</div>
                    <small style="color:var(--text-sub); font-size:11px; margin-top:4px; display:block;">Consultato il ${h.date}</small>
                </div>
                <div class="error-chevron">›</div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

function richiediSvuotaStorico() {
    if (confirm("Vuoi cancellare lo storico delle ricerche recenti?")) {
        vibraTocco();
        historyGuasti = [];
        safeSetStorage('caldaiafix_history', historyGuasti);
        renderStorico();
    }
}

// INDEXEDDB GESTIONE CLIENTI & FOTO TARGHETTA
function initIndexedDB() {
    const request = indexedDB.open('CaldaiaFixDB', 1);

    request.onupgradeneeded = (e) => {
        dbIndexed = e.target.result;
        if (!dbIndexed.objectStoreNames.contains('targhe')) {
            const store = dbIndexed.createObjectStore('targhe', { keyPath: 'id', autoIncrement: true });
            store.createIndex('client', 'client', { unique: false });
            store.createIndex('boiler', 'boiler', { unique: false });
            store.createIndex('phone', 'phone', { unique: false });
        }
    };

    request.onsuccess = (e) => {
        dbIndexed = e.target.result;
        caricaTarghe();
        controllaScadenzeAllerta();
    };

    request.onerror = (e) => {
        console.warn('IndexedDB non disponibile o errore:', e);
    };
}

function caricaTarghe() {
    if (!dbIndexed) return;
    const searchVal = document.getElementById('searchClientInput')?.value.toLowerCase().trim() || '';

    try {
        const tx = dbIndexed.transaction(['targhe'], 'readonly');
        const store = tx.objectStore('targhe');
        const req = store.getAll();

        req.onsuccess = () => {
            const listEl = document.getElementById('targhe-list');
            if (!listEl) return;

            let items = req.result || [];
            if (searchVal !== '') {
                items = items.filter(item => {
                    const c = (item.client || '').toLowerCase();
                    const p = (item.phone || '').toLowerCase();
                    const a = (item.address || '').toLowerCase();
                    const b = (item.boiler || '').toLowerCase();
                    const s = (item.serial || '').toLowerCase();
                    return c.includes(searchVal) || p.includes(searchVal) || a.includes(searchVal) || b.includes(searchVal) || s.includes(searchVal);
                });
            }

            if (items.length === 0) {
                listEl.innerHTML = `
                    <div class="card" style="text-align:center; padding:30px 15px;">
                        <div style="font-size:32px; margin-bottom:8px;">📑</div>
                        <div style="font-weight:800; font-size:16px; color:#ffffff;">Nessun cliente in archivio</div>
                        <div style="font-size:14px; color:var(--text-sub); margin-top:4px;">Premi "+ Nuovo Cliente" per registrare la prima scheda.</div>
                    </div>
                `;
                return;
            }

            let html = '';
            items.forEach(item => {
                let statusBadge = '';
                if (item.nextMaintenance) {
                    const oggi = new Date();
                    oggi.setHours(0,0,0,0);
                    const dScad = new Date(item.nextMaintenance);
                    const diffDays = Math.ceil((dScad - oggi) / (1000 * 60 * 60 * 24));

                    if (diffDays < 0) {
                        statusBadge = `<span style="background:#ef4444; color:#ffffff; font-size:11px; font-weight:800; padding:2px 8px; border-radius:6px;">🔴 Scaduto (${Math.abs(diffDays)} gg)</span>`;
                    } else if (diffDays <= 14) {
                        statusBadge = `<span style="background:#f59e0b; color:#0f172a; font-size:11px; font-weight:800; padding:2px 8px; border-radius:6px;">🟡 In scadenza (${diffDays} gg)</span>`;
                    } else {
                        statusBadge = `<span style="background:#22c55e; color:#ffffff; font-size:11px; font-weight:800; padding:2px 8px; border-radius:6px;">🟢 Ok (${diffDays} gg)</span>`;
                    }
                }

                html += `
                    <div class="card" style="margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <strong style="font-size:16px; color:#ffffff; display:block;">${item.client || 'Cliente senza nome'}</strong>
                                ${item.phone ? `<a href="tel:${item.phone}" style="color:#38bdf8; font-size:13px; text-decoration:none;">📞 ${item.phone}</a>` : ''}
                                ${item.address ? `<p style="color:var(--text-sub); font-size:13px; margin-top:2px;">📍 ${item.address}</p>` : ''}
                            </div>
                            ${statusBadge}
                        </div>

                        <div style="margin-top:10px; border-top:1px solid #334155; padding-top:8px;">
                            <p style="font-size:13px; color:#ffffff;">🔥 Caldaia: <strong>${item.boiler || '-'}</strong></p>
                            ${item.serial ? `<p style="font-size:12px; color:var(--text-sub);">Matricola: ${item.serial}</p>` : ''}
                            ${item.nextMaintenance ? `<p style="font-size:12px; color:#38bdf8; margin-top:2px;">📅 Scadenza: <strong>${item.nextMaintenance}</strong></p>` : ''}
                            ${item.notes ? `<p style="font-size:12px; color:#94a3b8; margin-top:4px; font-style:italic;">Note: ${item.notes}</p>` : ''}
                        </div>

                        ${item.image ? `
                        <div style="margin-top:10px;">
                            <img src="${item.image}" style="width:100%; max-height:160px; object-fit:cover; border-radius:8px; cursor:pointer;" onclick="ingrandisciFoto('${item.image}')" alt="Foto Targhetta">
                        </div>
                        ` : ''}

                        <div style="display:flex; gap:8px; margin-top:12px;">
                            <button class="btn-action" style="flex:1; padding:8px; font-size:13px; background:#0284c7;" onclick="modificaSchedaTarga(${item.id})">✏️ Modifica</button>
                            <button class="btn-clear" style="flex:1; padding:8px; font-size:13px;" onclick="eliminaSchedaTarga(${item.id})">🗑️ Elimina</button>
                        </div>
                    </div>
                `;
            });

            listEl.innerHTML = html;
        };
    } catch(e) {
        console.warn("Errore caricamento targhe:", e);
    }
}

function apriTargaModal() {
    vibraTocco();
    editingClientId = null;
    document.getElementById('targa-modal-title').textContent = "📑 Scheda Cliente & Manutenzione";
    document.getElementById('tagClient').value = '';
    document.getElementById('tagPhone').value = '';
    document.getElementById('tagAddress').value = '';
    document.getElementById('tagBoiler').value = '';
    document.getElementById('tagSerial').value = '';
    document.getElementById('tagNextMaintenance').value = '';
    document.getElementById('tagNotes').value = '';
    const imgPreview = document.getElementById('tagImgPreview');
    if (imgPreview) { imgPreview.src = ''; imgPreview.style.display = 'none'; }
    document.getElementById('targa-modal').style.display = 'flex';
}

function chiudiTargaModal() {
    document.getElementById('targa-modal').style.display = 'none';
}

function anteprimaFotoTarga(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const imgPreview = document.getElementById('tagImgPreview');
        if (imgPreview) {
            imgPreview.src = e.target.result;
            imgPreview.style.display = 'block';
        }
    };
    reader.readAsDataURL(file);
}

function salvaSchedaTarga() {
    if (!dbIndexed) {
        alert("Database locale non pronto.");
        return;
    }

    const client = document.getElementById('tagClient').value.trim();
    const phone = document.getElementById('tagPhone').value.trim();
    const address = document.getElementById('tagAddress').value.trim();
    const boiler = document.getElementById('tagBoiler').value.trim();
    const serial = document.getElementById('tagSerial').value.trim();
    const nextMaintenance = document.getElementById('tagNextMaintenance').value;
    const notes = document.getElementById('tagNotes').value.trim();
    const imgPreview = document.getElementById('tagImgPreview');
    const image = (imgPreview && imgPreview.style.display !== 'none') ? imgPreview.src : null;

    if (!client && !boiler) {
        alert("Inserisci almeno il Nome del Cliente o il Modello di Caldaia.");
        return;
    }

    vibraTocco();
    const tx = dbIndexed.transaction(['targhe'], 'readwrite');
    const store = tx.objectStore('targhe');

    const itemData = {
        client, phone, address, boiler, serial, nextMaintenance, notes, image,
        updatedAt: new Date().toISOString()
    };

    if (editingClientId) {
        itemData.id = editingClientId;
        store.put(itemData);
    } else {
        store.add(itemData);
    }

    tx.oncomplete = () => {
        chiudiTargaModal();
        caricaTarghe();
        controllaScadenzeAllerta();
    };
}

function modificaSchedaTarga(id) {
    if (!dbIndexed) return;
    vibraTocco();
    const tx = dbIndexed.transaction(['targhe'], 'readonly');
    const store = tx.objectStore('targhe');
    const req = store.get(id);

    req.onsuccess = () => {
        const data = req.result;
        if (!data) return;

        editingClientId = id;
        document.getElementById('targa-modal-title').textContent = "✏️ Modifica Cliente";
        document.getElementById('tagClient').value = data.client || '';
        document.getElementById('tagPhone').value = data.phone || '';
        document.getElementById('tagAddress').value = data.address || '';
        document.getElementById('tagBoiler').value = data.boiler || '';
        document.getElementById('tagSerial').value = data.serial || '';
        document.getElementById('tagNextMaintenance').value = data.nextMaintenance || '';
        document.getElementById('tagNotes').value = data.notes || '';

        const imgPreview = document.getElementById('tagImgPreview');
        if (imgPreview) {
            if (data.image) {
                imgPreview.src = data.image;
                imgPreview.style.display = 'block';
            } else {
                imgPreview.src = '';
                imgPreview.style.display = 'none';
            }
        }
        document.getElementById('targa-modal').style.display = 'flex';
    };
}

function eliminaSchedaTarga(id) {
    if (!dbIndexed) return;
    if (confirm("Vuoi eliminare definitivamente questo cliente dall'archivio?")) {
        vibraTocco();
        const tx = dbIndexed.transaction(['targhe'], 'readwrite');
        const store = tx.objectStore('targhe');
        store.delete(id);
        tx.oncomplete = () => {
            caricaTarghe();
            controllaScadenzeAllerta();
        };
    }
}

function richiediSvuotaTarghe() {
    if (!dbIndexed) return;
    if (confirm("⚠️ ATTENZIONE: Vuoi cancellare TUTTI i clienti in archivio? L'operazione non si può annullare.")) {
        vibraTocco();
        const tx = dbIndexed.transaction(['targhe'], 'readwrite');
        const store = tx.objectStore('targhe');
        store.clear();
        tx.oncomplete = () => {
            caricaTarghe();
            controllaScadenzeAllerta();
        };
    }
}

// BACKUP & RIPRISTINO JSON / EXCEL
function esportaBackupJSON() {
    if (!dbIndexed) return;
    vibraTocco();
    const tx = dbIndexed.transaction(['targhe'], 'readonly');
    const store = tx.objectStore('targhe');
    const req = store.getAll();

    req.onsuccess = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(req.result, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `CaldaiaFix_Backup_Clienti_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };
}

function ripristinaBackupJSON(event) {
    const file = event.target.files[0];
    if (!file || !dbIndexed) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const items = JSON.parse(e.target.result);
            if (!Array.isArray(items)) throw new Error("Formato non valido");

            const tx = dbIndexed.transaction(['targhe'], 'readwrite');
            const store = tx.objectStore('targhe');
            items.forEach(item => {
                delete item.id;
                store.add(item);
            });

            tx.oncomplete = () => {
                alert(`🎉 Ripristinati ${items.length} clienti con successo!`);
                caricaTarghe();
                controllaScadenzeAllerta();
            };
        } catch (err) {
            alert("❌ File JSON non valido o danneggiato.");
        }
    };
    reader.readAsText(file);
}

function importaClientiExcel(event) {
    const file = event.target.files[0];
    if (!file || !dbIndexed) return;

    if (typeof XLSX === 'undefined') {
        alert("Libreria di lettura Excel non caricata. Verifica la connessione.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

            if (!rows || rows.length === 0) {
                alert("Nessun dato trovato nel file Excel.");
                return;
            }

            const tx = dbIndexed.transaction(['targhe'], 'readwrite');
            const store = tx.objectStore('targhe');

            let inseriti = 0;
            rows.forEach(r => {
                const client = r['Cliente'] || r['Nome'] || r['Nome Cliente'] || r['client'] || '';
                const phone = r['Telefono'] || r['Cellulare'] || r['phone'] || '';
                const address = r['Indirizzo'] || r['address'] || '';
                const boiler = r['Caldaia'] || r['Modello'] || r['boiler'] || '';
                const serial = r['Matricola'] || r['serial'] || '';
                const nextMaintenance = r['Scadenza'] || r['nextMaintenance'] || '';
                const notes = r['Note'] || r['notes'] || '';

                if (client || boiler) {
                    store.add({ client, phone, address, boiler, serial, nextMaintenance, notes, updatedAt: new Date().toISOString() });
                    inseriti++;
                }
            });

            tx.oncomplete = () => {
                alert(`🎉 Importati con successo ${inseriti} clienti da Excel/CSV!`);
                caricaTarghe();
                controllaScadenzeAllerta();
            };
        } catch(err) {
            alert("❌ Errore durante la lettura del file Excel.");
        }
    };
    reader.readAsArrayBuffer(file);
}

// CALCOLATORI TECNICI HVAC
function calcolaRendimentoCombustione() {
    const tf = parseFloat(document.getElementById('tempFumi')?.value) || 0;
    const ta = parseFloat(document.getElementById('tempAmbiente')?.value) || 20;
    const co2 = parseFloat(document.getElementById('valoreCO2')?.value) || 0;
    const tipo = document.getElementById('tipoCombustibile')?.value || 'metano';
    const res = document.getElementById('rendimentoResult');

    if (tf <= 0 || co2 <= 0 || !res) return;

    const k = tipo === 'metano' ? 0.47 : 0.42;
    const qa = k * ((tf - ta) / co2);
    const eta = Math.max(0, 100 - qa).toFixed(1);

    res.textContent = `Rendimento η: ${eta}% | Perdita qA: ${qa.toFixed(1)}%`;
}

function calcolaPortataGas() {
    const litri = parseFloat(document.getElementById('gasLiters')?.value) || 0;
    const res = document.getElementById('gasResult');
    if (!res) return;

    const mcOra = (litri / 1000) * 60;
    const kw = (mcOra * 9.5).toFixed(1);

    res.textContent = `${kw} kW Termici (${mcOra.toFixed(2)} m³/h)`;
}

function calcolaVasoEspansione() {
    const litriAcqua = parseFloat(document.getElementById('waterVolume')?.value) || 0;
    const altezza = parseFloat(document.getElementById('buildingHeight')?.value) || 0;
    const res = document.getElementById('vasoResult');
    if (!res) return;

    const precarica = (0.5 + (altezza / 10)).toFixed(1);
    const vasoMinimo = Math.ceil(litriAcqua * 0.07);

    res.textContent = `Vaso Minimo: ${vasoMinimo} L | Precarica: ${precarica} bar`;
}

function convertiPressione(da) {
    const mbarEl = document.getElementById('inputMbar');
    const paEl = document.getElementById('inputPascal');
    if (!mbarEl || !paEl) return;

    if (da === 'mbar') {
        const val = parseFloat(mbarEl.value) || 0;
        paEl.value = (val * 100).toFixed(0);
    } else {
        const val = parseFloat(paEl.value) || 0;
        mbarEl.value = (val / 100).toFixed(2);
    }
}

// IMPOSTAZIONI DITTA & VIBRAZIONE
function caricaImpostazioni() {
    const comp = safeGetStorage('caldaiafix_company', '');
    const vib = safeGetStorage('caldaiafix_vibration', true);

    const compEl = document.getElementById('settingCompany');
    const vibEl = document.getElementById('settingVibration');

    if (compEl) compEl.value = comp;
    if (vibEl) vibEl.checked = vib;
}

function salvaImpostazioniDitta() {
    const val = document.getElementById('settingCompany')?.value || '';
    safeSetStorage('caldaiafix_company', val);
}

function salvaImpostazioniVibrazione() {
    const val = document.getElementById('settingVibration')?.checked;
    safeSetStorage('caldaiafix_vibration', val);
}

// AREA TECNICA & PIN
function apriPin() {
    vibraTocco();
    document.getElementById('pinInput').value = '';
    document.getElementById('pinError').style.display = 'none';
    document.getElementById('pin-modal').style.display = 'flex';
}

function chiudiPin() {
    document.getElementById('pin-modal').style.display = 'none';
}

function verificaPin() {
    const input = document.getElementById('pinInput')?.value || '';
    if (input === '1234' || input === '8899') {
        chiudiPin();
        impostaTabNav('menu');
        cambiaVista('area-tecnica-view');
        caricaAreaTecnica();
    } else {
        document.getElementById('pinError').style.display = 'block';
    }
}

function caricaAreaTecnica() {
    const container = document.getElementById('installer-content-main');
    if (!container) return;

    container.innerHTML = `
        <div class="card">
            <h3 style="color:#38bdf8;">🔑 Funzioni Avanzate Tecnico</h3>
            <p style="font-size:13px; color:var(--text-sub); margin-top:4px;">Accesso riservato per sblocco parametri e diagnostica avanzata.</p>
            
            <div style="margin-top:15px; display:flex; flex-direction:column; gap:10px;">
                <button class="btn-action" onclick="forzaAggiornamentoCache()">🔄 Reset Cache & Forza Update PWA</button>
                <button class="btn-clear" onclick="esportaBackupJSON()">💾 Download Backup Completo IndexedDB</button>
            </div>
        </div>
    `;
}

// TORCIA FLASH
async function toggleTorch() {
    vibraTocco();
    try {
        if (!isTorchOn) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            torchTrack = stream.getVideoTracks()[0];
            const imageCapture = new ImageCapture(torchTrack);
            const capabilities = await torchTrack.getCapabilities();

            if (capabilities.torch) {
                await torchTrack.applyConstraints({ advanced: [{ torch: true }] });
                isTorchOn = true;
                const btn = document.getElementById('menu-torch-btn');
                if (btn) btn.textContent = '🔦 Spegni Torcia Flash';
            } else {
                alert("Flash non supportato dal dispositivo.");
            }
        } else {
            if (torchTrack) {
                torchTrack.stop();
                torchTrack = null;
            }
            isTorchOn = false;
            const btn = document.getElementById('menu-torch-btn');
            if (btn) btn.textContent = '🔦 Torcia Flash';
        }
    } catch(e) {
        alert("Impossibile accedere alla torcia del dispositivo.");
    }
}

// PWA INSTALL BANNER
function gestisciPwaInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.display = 'flex';
    });

    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone;
    if (isIos && !localStorage.getItem('ios_pwa_closed')) {
        const iosBanner = document.getElementById('ios-install-banner');
        if (iosBanner) iosBanner.style.display = 'flex';
    }
}

function installaPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
            chiudiPwaBanner();
        });
    }
}

function chiudiPwaBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
}

function chiudiIosBanner() {
    localStorage.setItem('ios_pwa_closed', 'true');
    const banner = document.getElementById('ios-install-banner');
    if (banner) banner.style.display = 'none';
}

// SEGNAZIONI BUG / NUOVI CODICI VIA EMAIL
function apriFeedbackModal() {
    vibraTocco();
    document.getElementById('feedback-modal').style.display = 'flex';
}

function chiudiFeedbackModal() {
    document.getElementById('feedback-modal').style.display = 'none';
}

function cambiaTabFeedback(tab) {
    vibraTocco();
    if (tab === 'code') {
        document.getElementById('tab-code-btn').classList.add('active');
        document.getElementById('tab-bug-btn').classList.remove('active');
        document.getElementById('form-feedback-code').style.display = 'block';
        document.getElementById('form-feedback-bug').style.display = 'none';
    } else {
        document.getElementById('tab-bug-btn').classList.add('active');
        document.getElementById('tab-code-btn').classList.remove('active');
        document.getElementById('form-feedback-bug').style.display = 'block';
        document.getElementById('form-feedback-code').style.display = 'none';
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

    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    chiudiFeedbackModal();
}

// MORSETTIERE VIEW
function mostraMorsettiere() {
    vibraTocco();
    impostaTabNav('menu');
    cambiaVista('morsettiere-view');
    renderMorsettieraBrand('Baxi');
}

function avviaWizard() {
    vibraTocco();
    impostaTabNav('menu');
    cambiaVista('wizard-view');
    renderWizardStep('start');
}

function renderMorsettieraBrand(brand) {
    const container = document.getElementById('morsettiere-container');
    if (!container) return;

    const data = {
        'Baxi': [
            { model: 'Luna3 / Duo-Tec', ta: 'M1 morsetti 1 e 2 (Togliere ponte 230V o BUS)', bus: 'M2 Morsetti 1-2 per cronotermostato Baxi Mago' },
            { model: 'Eco3 / Main', ta: 'M1 morsetti 1-2 (Tensione 230V / pulito)', bus: 'Non presente' }
        ],
        'Vaillant': [
            { model: 'ecoTEC plus / pro', ta: 'Morsetti 3 e 4 (Togliere ponte 24V)', bus: 'Morsetti BUS + e - (eRELAX / vSMART)' }
        ],
        'Immergas': [
            { model: 'Victrix Tera / TT', ta: 'Morsetti 40 e 41 (Togliere ponte)', bus: 'Morsetti 40-41 o scheda CAR V2' }
        ],
        'Ariston': [
            { model: 'Clas B / Genus One', ta: 'TA1 morsetti 1 e 2', bus: 'BUS BridgeNet T-BUS' }
        ]
    };

    const list = data[brand] || [{ model: brand, ta: 'Morsetti TA dedicati (Togliere ponte)', bus: 'Morsetti BUS dedicati' }];

    let html = '';
    list.forEach(item => {
        html += `
            <div class="card" style="margin-bottom:12px;">
                <h3 style="color:#ffffff;">${brand} - ${item.model}</h3>
                <div style="margin-top:8px; font-size:13px;">
                    <p style="color:#38bdf8;"><strong>🔌 Termostato Ambiente (TA):</strong> ${item.ta}</p>
                    <p style="color:#a855f7; margin-top:4px;"><strong>📡 Connessione BUS:</strong> ${item.bus}</p>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderWizardStep(step) {
    const container = document.getElementById('wizard-container');
    if (!container) return;

    if (step === 'start') {
        container.innerHTML = `
            <div class="card" style="text-align:center;">
                <h3>🩺 Qual è il sintomo principale?</h3>
                <div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                    <button class="btn-action" onclick="renderWizardStep('blocco_fiamma')">🔥 Caldaia in Blocco Fiamma / Nessuna Accensione</button>
                    <button class="btn-action" onclick="renderWizardStep('no_acqua_calda')">🚿 Acqua Calda Fredda o Tiepida</button>
                    <button class="btn-action" onclick="renderWizardStep('pressione')">💧 Problemi di Pressione (Bassa / Alta)</button>
                </div>
            </div>
        `;
    } else if (step === 'blocco_fiamma') {
        container.innerHTML = `
            <div class="card">
                <h3>🔥 Blocco Fiamma / Mancata Accensione</h3>
                <ol style="padding-left:18px; font-size:14px; line-height:1.6; margin-top:10px;">
                    <li>Verificare se il rubinetto del gas sotto la caldaia è aperto.</li>
                    <li>Controllare se si sente la scarica dell'elettrodo di accensione.</li>
                    <li>Verificare la pressione del gas in ingresso con un manometro mbar.</li>
                    <li>Pulire l'elettrodo di rilevazione fiamma con carta abrasiva fine.</li>
                </ol>
                <button class="back-btn" style="margin-top:15px;" onclick="renderWizardStep('start')">⬅ Torna alle domande</button>
            </div>
        `;
    } else if (step === 'no_acqua_calda') {
        container.innerHTML = `
            <div class="card">
                <h3>🚿 Acqua Calda Fredda / Tiepida</h3>
                <ol style="padding-left:18px; font-size:14px; line-height:1.6; margin-top:10px;">
                    <li>Verificare la portata dell'acqua in litri/minuto dal rubinetto.</li>
                    <li>Controllare il flussostato o flussometro (se l'icona sanitario si accende sul display).</li>
                    <li>Verificare lo scambiatore secondario a piastre (possibile intasamento da calcare).</li>
                    <li>Verificare la valvola a 3 vie (motorino attuatore bloccato su riscaldamento).</li>
                </ol>
                <button class="back-btn" style="margin-top:15px;" onclick="renderWizardStep('start')">⬅ Torna alle domande</button>
            </div>
        `;
    } else if (step === 'pressione') {
        container.innerHTML = `
            <div class="card">
                <h3>💧 Pressione Idraulica Errata</h3>
                <ol style="padding-left:18px; font-size:14px; line-height:1.6; margin-top:10px;">
                    <li>Se Pressione < 0.8 bar: Aprire il rubinetto di riempimento fino a 1.2-1.5 bar.</li>
                    <li>Se sale oltre 3 bar a caldaia calda: Vaso d'espansione scarico o bucato (precaricare a 1.0 bar).</li>
                    <li>Se gocciola dalla valvola di sicurezza 3 bar: Sostituire la valvola di sicurezza o verificare il vaso.</li>
                </ol>
                <button class="back-btn" style="margin-top:15px;" onclick="renderWizardStep('start')">⬅ Torna alle domande</button>
            </div>
        `;
    }
}
