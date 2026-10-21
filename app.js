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
        return val !== null ? JSON.parse(val) : defaultValue;
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
let currentReportError = null;
let editingClientId = null;

// INIZIALIZZAZIONE APPLICAZIONE
function initApp() {
    try {
        filtraErrori(false);
        aggiornaContatoreHeader();
        caricaImpostazioni();
        initIndexedDB();
        gestisciPwaInstall();
        verificaStatoRete();
        verificaStatoLicenza60Giorni();
        verificaConsensoGDPR();
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

// NAVIGAZIONE E VISTE
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

// CENTRO HELP: FAQ, ASSISTENZA & GDPR
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
    if (modal) modal.style.display = 'none';
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
    filtraErrori(false);
}

// LICENZA PROVA 60 GIORNI
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
    const elapsedDays = Math.floor((now - installTimestamp) / (1000 * 60 * 60 * 24));
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
        alert("🎉 Licenza PRO Attivata con successo!");
        location.reload();
    } else {
        alert("❌ Codice Licenza Errato.");
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

// RENDERING E FILTRO ERRORI
function aggiornaContatoreHeader() {
    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    const countBox = document.getElementById('resultsCount');
    if (countBox) countBox.textContent = `${dbData.length} GUASTI PRESENTI NEL DATABASE`;
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
    if (index > -1) favorites.splice(index, 1);
    else favorites.push(id);
    safeSetStorage('caldaiafix_favs', favorites);
    filtraErrori(false);
}

// DETTAGLIO GUASTO & RAPPORTO CLIENTE
function mostraDettaglio(id) {
    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    const item = dbData.find(e => e.id === id);
    if (!item) return;

    currentReportError = item;
    vibraTocco();
    salvaInStorico(item);

    const detailContent = document.getElementById('detail-content');
    if (!detailContent) return;

    const isFav = favorites.includes(item.id);
    let htmlSteps = item.steps && item.steps.length > 0
        ? '<ol style="padding-left:20px; font-size:14px; line-height:1.6; margin-top:8px;">' + item.steps.map(s => `<li style="margin-bottom:6px; color:#e2e8f0;">${s}</li>`).join('') + '</ol>'
        : '<p style="font-size:14px; color:var(--text-sub); margin-top:6px;">Procedura standard di verifica componenti.</p>';

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

function apriReportModal(id) {
    vibraTocco();
    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    const item = dbData.find(e => e.id === id) || currentReportError;
    if (!item) return;

    currentReportError = item;
    const company = safeGetStorage('caldaiafix_company', '');

    const repCompany = document.getElementById('repCompany');
    const repClient = document.getElementById('repClient');
    const repBoiler = document.getElementById('repBoiler');
    const repFault = document.getElementById('repFault');

    if (repCompany) repCompany.value = company;
    if (repClient) repClient.value = '';
    if (repBoiler) repBoiler.value = `${item.brand} ${item.model}`;
    if (repFault) repFault.value = `Errore ${item.code} - ${item.desc}`;

    const modal = document.getElementById('report-modal');
    if (modal) modal.style.display = 'flex';
}

function chiudiReportModal() {
    const modal = document.getElementById('report-modal');
    if (modal) modal.style.display = 'none';
}

function inviaRapportoWhatsApp() {
    vibraTocco();
    const company = document.getElementById('repCompany')?.value.trim() || 'Assistenza Tecnica';
    const client = document.getElementById('repClient')?.value.trim() || 'Gentile Cliente';
    const boiler = document.getElementById('repBoiler')?.value.trim() || '';
    const fault = document.getElementById('repFault')?.value.trim() || '';
    const work = document.getElementById('repWork')?.value.trim() || '';
    const price = document.getElementById('repPrice')?.value.trim() || '';

    let text = `*RAPPORTO INTERVENTO TECNICO*\n*Ditta:* ${company}\n*Cliente:* ${client}\n`;
    if (boiler) text += `*Caldaia:* ${boiler}\n`;
    if (fault) text += `*Anomalia:* ${fault}\n`;
    if (work) text += `*Intervento:* ${work}\n`;
    if (price) text += `*Totale:* € ${price}\n`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    chiudiReportModal();
}

function stampaReportPDF() {
    vibraTocco();
    const company = document.getElementById('repCompany')?.value.trim() || 'CaldaiaFix PRO';
    const client = document.getElementById('repClient')?.value.trim() || 'Cliente';
    const boiler = document.getElementById('repBoiler')?.value.trim() || '-';
    const fault = document.getElementById('repFault')?.value.trim() || '-';
    const work = document.getElementById('repWork')?.value.trim() || '-';
    const price = document.getElementById('repPrice')?.value.trim() || '-';

    const printWin = window.open('', '_blank');
    if (!printWin) return alert("Abilita i popup nel browser.");

    printWin.document.write(`
        <!DOCTYPE html><html><head><title>Report - ${client}</title>
        <style>body{font-family:Arial,sans-serif;padding:25px;} h1{color:#0284c7;}</style></head>
        <body><h1>${company}</h1><p><strong>Cliente:</strong> ${client}</p><p><strong>Caldaia:</strong> ${boiler}</p><p><strong>Guasto:</strong> ${fault}</p><p><strong>Lavoro Svolto:</strong> ${work}</p><h3>Totale: € ${price}</h3>
        <script>window.onload=function(){window.print();}</script></body></html>
    `);
    printWin.document.close();
    chiudiReportModal();
}

function ingrandisciFoto(src) {
    if (!src) return;
    vibraTocco();
    const modal = document.getElementById('photo-lightbox-modal');
    const img = document.getElementById('lightbox-img');
    if (modal && img) {
        img.src = src;
        modal.style.display = 'flex';
    }
}

function chiudiLightbox() {
    const modal = document.getElementById('photo-lightbox-modal');
    if (modal) modal.style.display = 'none';
}

function mostraStatistiche() {
    vibraTocco();
    impostaTabNav('menu');
    cambiaVista('stats-view');

    const container = document.getElementById('stats-container');
    if (!container) return;

    const dbData = (typeof errori !== 'undefined' && Array.isArray(errori)) ? errori : [];
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${dbData.length}</div>
                <div class="stat-label">Guasti in Database</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color:#f59e0b;">${favorites.length}</div>
                <div class="stat-label">Preferiti Salvati</div>
            </div>
        </div>
    `;
}

function controllaScadenzeAllerta() {
    if (!dbIndexed) return;
    try {
        const tx = dbIndexed.transaction(['targhe'], 'readonly');
        const req = tx.objectStore('targhe').getAll();
        req.onsuccess = () => {
            const items = req.result || [];
            const oggi = new Date();
            oggi.setHours(0,0,0,0);
            let inScadenza = 0, scaduti = 0;

            items.forEach(item => {
                if (item.nextMaintenance) {
                    const diffDays = Math.ceil((new Date(item.nextMaintenance) - oggi) / (1000 * 60 * 60 * 24));
                    if (diffDays < 0) scaduti++;
                    else if (diffDays <= 14) inScadenza++;
                }
            });

            const banner = document.getElementById('maint-alert-banner');
            if (banner && (inScadenza > 0 || scaduti > 0)) {
                banner.style.display = 'flex';
                document.getElementById('maint-alert-desc').textContent = `${scaduti} manutenzioni scadute | ${inScadenza} nei prossimi 14 giorni.`;
            } else if (banner) {
                banner.style.display = 'none';
            }
        };
    } catch(e) {}
}

function verificaStatoRete() {
    window.addEventListener('online', () => console.log('Online'));
    window.addEventListener('offline', () => console.log('Offline'));
}

function forzaAggiornamentoCache() {
    vibraTocco();
    if (confirm("Reset cache per aggiornare all'ultima versione?")) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                for (let r of regs) r.unregister();
            });
        }
        location.reload(true);
    }
}

// STORICO RECENTI
function salvaInStorico(item) {
    historyGuasti = historyGuasti.filter(h => h.id !== item.id);
    historyGuasti.unshift({
        id: item.id, brand: item.brand, code: item.code, desc: item.desc, model: item.model, date: new Date().toLocaleDateString('it-IT')
    });
    if (historyGuasti.length > 20) historyGuasti.pop();
    safeSetStorage('caldaiafix_history', historyGuasti);
}

function renderStorico() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;

    if (!historyGuasti || historyGuasti.length === 0) {
        listEl.innerHTML = `<div class="card" style="text-align:center; padding:20px;">📜 Storico vuoto</div>`;
        return;
    }

    let html = '';
    historyGuasti.forEach(h => {
        html += `
            <div class="error-item" onclick="mostraDettaglio(${h.id})">
                <div class="error-main-info">
                    <span class="badge-brand-code">${h.brand} - ${h.code}</span>
                    <div class="error-title">${h.desc}</div>
                </div>
                <div class="error-chevron">›</div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

function richiediSvuotaStorico() {
    if (confirm("Cancellare lo storico recente?")) {
        vibraTocco();
        historyGuasti = [];
        safeSetStorage('caldaiafix_history', historyGuasti);
        renderStorico();
    }
}

// INDEXEDDB GESTIONE CLIENTI
function initIndexedDB() {
    const request = indexedDB.open('CaldaiaFixDB', 1);
    request.onupgradeneeded = (e) => {
        dbIndexed = e.target.result;
        if (!dbIndexed.objectStoreNames.contains('targhe')) {
            const store = dbIndexed.createObjectStore('targhe', { keyPath: 'id', autoIncrement: true });
            store.createIndex('client', 'client', { unique: false });
        }
    };
    request.onsuccess = (e) => {
        dbIndexed = e.target.result;
        caricaTarghe();
        controllaScadenzeAllerta();
    };
}

function caricaTarghe() {
    if (!dbIndexed) return;
    const searchVal = document.getElementById('searchClientInput')?.value.toLowerCase().trim() || '';

    const tx = dbIndexed.transaction(['targhe'], 'readonly');
    const req = tx.objectStore('targhe').getAll();

    req.onsuccess = () => {
        const listEl = document.getElementById('targhe-list');
        if (!listEl) return;
        let items = req.result || [];

        if (searchVal !== '') {
            items = items.filter(i => (i.client || '').toLowerCase().includes(searchVal) || (i.boiler || '').toLowerCase().includes(searchVal));
        }

        if (items.length === 0) {
            listEl.innerHTML = `<div class="card" style="text-align:center; padding:20px;">📑 Nessun cliente in archivio</div>`;
            return;
        }

        let html = '';
        items.forEach(item => {
            html += `
                <div class="card">
                    <strong style="color:#ffffff;">${item.client || 'Cliente senza nome'}</strong>
                    <p style="font-size:13px; color:var(--text-sub);">Caldaia: ${item.boiler || '-'}</p>
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button class="btn-action" onclick="modificaSchedaTarga(${item.id})">✏️ Modifica</button>
                        <button class="btn-clear" onclick="eliminaSchedaTarga(${item.id})">🗑️ Elimina</button>
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = html;
    };
}

function apriTargaModal() {
    vibraTocco();
    editingClientId = null;
    document.getElementById('tagClient').value = '';
    document.getElementById('tagBoiler').value = '';
    document.getElementById('targa-modal').style.display = 'flex';
}

function chiudiTargaModal() {
    document.getElementById('targa-modal').style.display = 'none';
}

function salvaSchedaTarga() {
    if (!dbIndexed) return;
    const client = document.getElementById('tagClient').value.trim();
    const boiler = document.getElementById('tagBoiler').value.trim();
    if (!client && !boiler) return alert("Inserisci Nome o Modello.");

    vibraTocco();
    const tx = dbIndexed.transaction(['targhe'], 'readwrite');
    const store = tx.objectStore('targhe');
    const data = { client, boiler, updatedAt: new Date().toISOString() };
    if (editingClientId) data.id = editingClientId;
    store.put(data);
    tx.oncomplete = () => { chiudiTargaModal(); caricaTarghe(); controllaScadenzeAllerta(); };
}

function modificaSchedaTarga(id) {
    if (!dbIndexed) return;
    const tx = dbIndexed.transaction(['targhe'], 'readonly');
    const req = tx.objectStore('targhe').get(id);
    req.onsuccess = () => {
        const d = req.result;
        if (!d) return;
        editingClientId = id;
        document.getElementById('tagClient').value = d.client || '';
        document.getElementById('tagBoiler').value = d.boiler || '';
        document.getElementById('targa-modal').style.display = 'flex';
    };
}

function eliminaSchedaTarga(id) {
    if (!dbIndexed) return;
    if (confirm("Eliminare la scheda cliente?")) {
        vibraTocco();
        const tx = dbIndexed.transaction(['targhe'], 'readwrite');
        tx.objectStore('targhe').delete(id);
        tx.oncomplete = () => { caricaTarghe(); controllaScadenzeAllerta(); };
    }
}

function richiediSvuotaTarghe() {
    if (!dbIndexed) return;
    if (confirm("Cancellare tutti i clienti?")) {
        vibraTocco();
        const tx = dbIndexed.transaction(['targhe'], 'readwrite');
        tx.objectStore('targhe').clear();
        tx.oncomplete = () => { caricaTarghe(); controllaScadenzeAllerta(); };
    }
}

function esportaBackupJSON() {
    if (!dbIndexed) return;
    vibraTocco();
    const tx = dbIndexed.transaction(['targhe'], 'readonly');
    const req = tx.objectStore('targhe').getAll();
    req.onsuccess = () => {
        const a = document.createElement('a');
        a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(req.result, null, 2));
        a.download = `CaldaiaFix_Backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    };
}

function ripristinaBackupJSON(e) {
    const file = e.target.files[0];
    if (!file || !dbIndexed) return;
    const r = new FileReader();
    r.onload = function(evt) {
        try {
            const items = JSON.parse(evt.target.result);
            const tx = dbIndexed.transaction(['targhe'], 'readwrite');
            const store = tx.objectStore('targhe');
            items.forEach(i => { delete i.id; store.add(i); });
            tx.oncomplete = () => { alert("Backup ripristinato!"); caricaTarghe(); };
        } catch(err) { alert("File non valido"); }
    };
    r.readAsText(file);
}

function importaClientiExcel(e) {
    const file = e.target.files[0];
    if (!file || !dbIndexed || typeof XLSX === 'undefined') return;
    const r = new FileReader();
    r.onload = function(evt) {
        try {
            const rows = XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(evt.target.result), {type:'array'}).Sheets[0]);
            const tx = dbIndexed.transaction(['targhe'], 'readwrite');
            const store = tx.objectStore('targhe');
            rows.forEach(row => store.add({ client: row['Cliente'] || row['client'] || '', boiler: row['Caldaia'] || row['boiler'] || '' }));
            tx.oncomplete = () => { alert("Importazione completata!"); caricaTarghe(); };
        } catch(err) {}
    };
    r.readAsArrayBuffer(file);
}

// CALCOLATORI TECNICI
function calcolaRendimentoCombustione() {
    const tf = parseFloat(document.getElementById('tempFumi')?.value) || 0;
    const ta = parseFloat(document.getElementById('tempAmbiente')?.value) || 20;
    const co2 = parseFloat(document.getElementById('valoreCO2')?.value) || 0;
    const tipo = document.getElementById('tipoCombustibile')?.value || 'metano';
    const res = document.getElementById('rendimentoResult');
    if (tf <= 0 || co2 <= 0 || !res) return;

    const k = tipo === 'metano' ? 0.47 : 0.42;
    const qa = k * ((tf - ta) / co2);
    res.textContent = `Rendimento η: ${(100 - qa).toFixed(1)}% | Perdita qA: ${qa.toFixed(1)}%`;
}

function calcolaPortataGas() {
    const litri = parseFloat(document.getElementById('gasLiters')?.value) || 0;
    const res = document.getElementById('gasResult');
    if (res) res.textContent = `${(((litri / 1000) * 60) * 9.5).toFixed(1)} kW Termici`;
}

function calcolaVasoEspansione() {
    const litri = parseFloat(document.getElementById('waterVolume')?.value) || 0;
    const alt = parseFloat(document.getElementById('buildingHeight')?.value) || 0;
    const res = document.getElementById('vasoResult');
    if (res) res.textContent = `Vaso Minimo: ${Math.ceil(litri * 0.07)} L | Precarica: ${(0.5 + (alt / 10)).toFixed(1)} bar`;
}

function convertiPressione(da) {
    const mbarEl = document.getElementById('inputMbar'), paEl = document.getElementById('inputPascal');
    if (!mbarEl || !paEl) return;
    if (da === 'mbar') paEl.value = ((parseFloat(mbarEl.value) || 0) * 100).toFixed(0);
    else mbarEl.value = ((parseFloat(paEl.value) || 0) / 100).toFixed(2);
}

function caricaImpostazioni() {
    const compEl = document.getElementById('settingCompany'), vibEl = document.getElementById('settingVibration');
    if (compEl) compEl.value = safeGetStorage('caldaiafix_company', '');
    if (vibEl) vibEl.checked = safeGetStorage('caldaiafix_vibration', true);
}

function salvaImpostazioniDitta() { safeSetStorage('caldaiafix_company', document.getElementById('settingCompany')?.value || ''); }
function salvaImpostazioniVibrazione() { safeSetStorage('caldaiafix_vibration', document.getElementById('settingVibration')?.checked); }

function apriPin() { vibraTocco(); document.getElementById('pinInput').value = ''; document.getElementById('pin-modal').style.display = 'flex'; }
function chiudiPin() { document.getElementById('pin-modal').style.display = 'none'; }
function verificaPin() {
    const val = document.getElementById('pinInput')?.value || '';
    if (val === '1234' || val === '8899') {
        chiudiPin(); impostaTabNav('menu'); cambiaVista('area-tecnica-view'); caricaAreaTecnica();
    } else { document.getElementById('pinError').style.display = 'block'; }
}

function caricaAreaTecnica() {
    const c = document.getElementById('installer-content-main');
    if (c) c.innerHTML = `<div class="card"><h3>🔑 Area Tecnica Sbloccata</h3><button class="btn-action" onclick="forzaAggiornamentoCache()">🔄 Reset Cache & Update</button></div>`;
}

async function toggleTorch() {
    vibraTocco();
    try {
        if (!isTorchOn) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            torchTrack = stream.getVideoTracks()[0];
            await torchTrack.applyConstraints({ advanced: [{ torch: true }] });
            isTorchOn = true;
        } else {
            if (torchTrack) torchTrack.stop();
            isTorchOn = false;
        }
    } catch(e) {}
}

function gestisciPwaInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); deferredPrompt = e;
        const b = document.getElementById('pwa-install-banner'); if (b) b.style.display = 'flex';
    });
}

function installaPWA() { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; chiudiPwaBanner(); } }
function chiudiPwaBanner() { const b = document.getElementById('pwa-install-banner'); if (b) b.style.display = 'none'; }
function chiudiIosBanner() { localStorage.setItem('ios_pwa_closed', 'true'); const b = document.getElementById('ios-install-banner'); if (b) b.style.display = 'none'; }

function apriFeedbackModal() { vibraTocco(); document.getElementById('feedback-modal').style.display = 'flex'; }
function chiudiFeedbackModal() { document.getElementById('feedback-modal').style.display = 'none'; }
function cambiaTabFeedback(tab) {
    vibraTocco();
    const isCode = tab === 'code';
    document.getElementById('tab-code-btn').classList.toggle('active', isCode);
    document.getElementById('tab-bug-btn').classList.toggle('active', !isCode);
    document.getElementById('form-feedback-code').style.display = isCode ? 'block' : 'none';
    document.getElementById('form-feedback-bug').style.display = isCode ? 'none' : 'block';
}

function inviaFeedbackEmail(type) {
    vibraTocco();
    const body = type === 'code' ? `Codice: ${document.getElementById('fbCode')?.value}` : `Bug: ${document.getElementById('fbBugDesc')?.value}`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=CaldaiaFix PRO&body=${encodeURIComponent(body)}`;
    chiudiFeedbackModal();
}

function mostraMorsettiere() { vibraTocco(); impostaTabNav('menu'); cambiaVista('morsettiere-view'); renderMorsettieraBrand('Baxi'); }
function avviaWizard() { vibraTocco(); impostaTabNav('menu'); cambiaVista('wizard-view'); renderWizardStep('start'); }

function renderMorsettieraBrand(brand) {
    const c = document.getElementById('morsettiere-container');
    if (c) c.innerHTML = `<div class="card"><h3>${brand}</h3><p>TA: Morsetti dedicati | BUS: Connessione digitale</p></div>`;
}

function renderWizardStep(step) {
    const c = document.getElementById('wizard-container');
    if (!c) return;
    if (step === 'start') {
        c.innerHTML = `<div class="card"><h3>🩺 Diagnosi Guidata</h3><button class="btn-action" onclick="renderWizardStep('blocco_fiamma')">🔥 Blocco Fiamma</button></div>`;
    } else {
        c.innerHTML = `<div class="card"><h3>Controlli consigliati</h3><button class="back-btn" onclick="renderWizardStep('start')">⬅ Indietro</button></div>`;
    }
}
