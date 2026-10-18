/* ==========================================================================
   CALDAIAFIX PRO - LOGICA APPLICAZIONE & GESTIONE STATO
   ========================================================================== */

// STRUTTURA DATI LOCALE
let currentFilterType = 'all';
let currentBrand = '';
let favorites = JSON.parse(localStorage.getItem('caldaiafix_favs') || '[]');
let historyGuasti = JSON.parse(localStorage.getItem('caldaiafix_history') || '[]');
let dbIndexed = null;
let deferredPrompt = null;
let torchTrack = null;
let isTorchOn = false;

// 1. INIZIALIZZAZIONE ALLA CARICA DELLA PAGINA
window.addEventListener('DOMContentLoaded', () => {
    aggiornaContatoreHeader();
    initIndexedDB();
    caricaImpostazioni();
    filtraErrori(false);
    gestisciPwaInstall();
    vericaStatoRete();
});

window.addEventListener('online', vericaStatoRete);
window.addEventListener('offline', vericaStatoRete);

function vericaStatoRete() {
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

// 2. AGGIORNAMENTO AUTOMATICO CONTATORE INTESTAZIONE
function aggiornaContatoreHeader() {
    const subHeader = document.getElementById('sub-header-count');
    if (subHeader && typeof errori !== 'undefined') {
        subHeader.textContent = `Diagnostica & Parametri HVAC (${errori.length} Guasti)`;
    }
}

// 3. FILTRAGGIO E RENDERING LISTA GUASTI
function filtraErrori(isFavOnly = false) {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const brandSel = document.getElementById('brandFilter').value;
    currentBrand = brandSel;

    if (isFavOnly) {
        currentFilterType = 'fav';
        aggiornaStatoTab('btn-fav');
    }

    const risultati = errori.filter(item => {
        // Filtro Marca
        if (brandSel && item.brand !== brandSel) return false;

        // Filtro Tipo (Dig / Led / Fav)
        if (currentFilterType === 'digital' && item.type !== 'digital') return false;
        if (currentFilterType === 'led' && item.type !== 'led') return false;
        if (currentFilterType === 'fav' && !favorites.includes(item.id)) return false;

        // Filtro Testo (Codice, Descrizione, Modello, Marca)
        if (query !== '') {
            const matchCode = item.code.toLowerCase().includes(query);
            const matchDesc = item.desc.toLowerCase().includes(query);
            const matchModel = item.model.toLowerCase().includes(query);
            const matchBrand = item.brand.toLowerCase().includes(query);
            return matchCode || matchDesc || matchModel || matchBrand;
        }

        return true;
    });

    renderListaErrori(risultati);
}

function renderListaErrori(lista) {
    const container = document.getElementById('errors-list');
    const countBox = document.getElementById('resultsCount');

    if (!container || !countBox) return;

    countBox.textContent = `${lista.length} GUASTI TROVATI`;

    if (lista.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:30px 15px;">
                <div style="font-size:32px; margin-bottom:8px;">🔍</div>
                <div style="font-weight:800; font-size:14px; color:var(--text-main);">Nessun guasto trovato</div>
                <div style="font-size:12px; color:var(--text-sub); margin-top:4px;">Prova a cambiare la ricerca o i filtri selezionati.</div>
            </div>
        `;
        return;
    }

    let html = '';
    lista.forEach(item => {
        const isFav = favorites.includes(item.id);
        const badgeClass = item.chamber.includes('F') ? 'b-code' : 'b-cham';
        
        html += `
            <div class="error-item" onclick="mostraDettaglio(${item.id})">
                <div style="flex:1; padding-right:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="badge ${badgeClass}">${item.brand}</span>
                        <span class="badge b-code" style="font-size:11px;">${item.code}</span>
                    </div>
                    <div class="error-title">${item.desc}</div>
                    <div class="error-model">Modelli: ${item.model}</div>
                </div>
                <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFav(${item.id}, event)">
                    ${isFav ? '★' : '☆'}
                </button>
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

// 4. DETTAGLIO GUASTO & STORICO
function mostraDettaglio(id) {
    const item = errori.find(e => e.id === id);
    if (!item) return;

    vibraTocco();
    salvaInStorico(item);

    const detailContent = document.getElementById('detail-content');
    const isFav = favorites.includes(item.id);

    let htmlSteps = '';
    if (item.steps && item.steps.length > 0) {
        htmlSteps = '<ol>' + item.steps.map(step => `<li>${step}</li>`).join('') + '</ol>';
    }

    let htmlCauses = '';
    if (item.causes && item.causes.length > 0) {
        htmlCauses = '<ul>' + item.causes.map(c => `<li>${c}</li>`).join('') + '</ul>';
    }

    detailContent.innerHTML = `
        <div class="detail-box">
            <div style="display:flex; justify-space-between; align-items:flex-start; margin-bottom:12px;">
                <div>
                    <span class="badge b-code">${item.brand}</span>
                    <h2 style="font-size:20px; font-weight:800; color:var(--text-main); margin-top:6px;">Errore ${item.code}</h2>
                    <p style="font-size:12px; color:var(--text-sub); font-weight:600;">Modelli: ${item.model}</p>
                </div>
                <button class="fav-btn ${isFav ? 'active' : ''}" style="font-size:26px;" onclick="toggleFav(${item.id}, event); mostraDettaglio(${item.id});">
                    ${isFav ? '★' : '☆'}
                </button>
            </div>

            <div style="background:var(--surface-secondary); border:1px solid var(--border); padding:12px; border-radius:14px; margin-bottom:14px;">
                <div style="font-size:11px; font-weight:800; color:var(--text-sub); text-transform:uppercase;">Descrizione Guasto:</div>
                <div style="font-size:14px; font-weight:700; color:var(--text-main); margin-top:2px;">${item.desc}</div>
            </div>

            <div style="margin-bottom:14px;">
                <h3 style="font-size:12px; font-weight:800; color:var(--primary); text-transform:uppercase; margin-bottom:6px;">⚠️ Possibili Cause:</h3>
                ${htmlCauses}
            </div>

            <div style="margin-bottom:14px;">
                <h3 style="font-size:12px; font-weight:800; color:#10b981; text-transform:uppercase; margin-bottom:6px;">🛠️ Procedura di Risoluzione:</h3>
                ${htmlSteps}
            </div>

            ${item.partName ? `
                <div class="part-box">
                    <div style="font-size:11px; font-weight:800; color:var(--text-sub); text-transform:uppercase;">Ricambio Consigliato:</div>
                    <div style="font-size:13px; font-weight:700; color:var(--text-main);">${item.partName}</div>
                    <div style="font-size:11px; color:var(--primary); font-family:monospace; margin-top:2px;">Codice: ${item.partCode}</div>
                </div>
            ` : ''}

            ${item.gasParams && item.gasParams !== '-' ? `
                <div class="gas-box">
                    🔥 Parametri Combustione / Gas: <br>
                    <strong>${item.gasParams}</strong>
                </div>
            ` : ''}

            <div style="display:flex; gap:8px; margin-top:16px;">
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
    localStorage.setItem('caldaiafix_history', JSON.stringify(historyGuasti));
}

function mostraStorico() {
    vibraTocco();
    const container = document.getElementById('history-list');
    if (!container) return;

    if (historyGuasti.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:20px;">
                <p style="font-size:13px; color:var(--text-sub);">Nessun guasto consultato di recente.</p>
            </div>
        `;
    } else {
        let html = '';
        historyGuasti.forEach(item => {
            html += `
                <div class="error-item" onclick="mostraDettaglio(${item.id})">
                    <div>
                        <span class="badge b-code">${item.brand} ${item.code}</span>
                        <div class="error-title">${item.desc}</div>
                    </div>
                    <span style="font-size:11px; color:var(--text-sub); font-weight:600;">${item.timestamp}</span>
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
    localStorage.setItem('caldaiafix_favs', JSON.stringify(favorites));
    filtraErrori(false);
}

// 5. RICERCA VOCALE
function avviaRicercaVocale() {
    vibraTocco();
    const btn = document.getElementById('micBtn');
    const input = document.getElementById('searchInput');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("La ricerca vocale non è supportata dal tuo browser.");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.interimResults = false;

    recognition.onstart = () => {
        if (btn) btn.classList.add('listening');
    };

    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        if (input) {
            input.value = text;
            filtraErrori(false);
        }
    };

    recognition.onerror = () => {
        if (btn) btn.classList.remove('listening');
    };

    recognition.onend = () => {
        if (btn) btn.classList.remove('listening');
    };

    recognition.start();
}

// 6. ARCHIVIO TARGHE & INDEXED DB
function initIndexedDB() {
    const request = indexedDB.open('CaldaiaFixTargheDB', 1);

    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('targhe')) {
            db.createObjectStore('targhe', { keyPath: 'id', autoIncrement: true });
        }
    };

    request.onsuccess = (e) => {
        dbIndexed = e.target.result;
    };
}

function apriTargaModal() {
    vibraTocco();
    document.getElementById('targa-modal').style.display = 'flex';
}

function chiudiTargaModal() {
    document.getElementById('targa-modal').style.display = 'none';
    document.getElementById('tagClient').value = '';
    document.getElementById('tagAddress').value = '';
    document.getElementById('tagBoiler').value = '';
    document.getElementById('tagSerial').value = '';
    document.getElementById('tagNotes').value = '';
    document.getElementById('tagImgPreview').style.display = 'none';
    document.getElementById('tagImgPreview').src = '';
}

function anteprimaFotoTarga(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('tagImgPreview');
            img.src = e.target.result;
            img.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function salvaSchedaTarga() {
    if (!dbIndexed) return;

    const client = document.getElementById('tagClient').value.trim();
    const address = document.getElementById('tagAddress').value.trim();
    const boiler = document.getElementById('tagBoiler').value.trim();
    const serial = document.getElementById('tagSerial').value.trim();
    const notes = document.getElementById('tagNotes').value.trim();
    const imgSrc = document.getElementById('tagImgPreview').src;

    if (!client && !boiler) {
        alert("Inserisci almeno il Nome Cliente o il Modello Caldaia.");
        return;
    }

    const item = {
        client: client || "Cliente Generico",
        address: address,
        boiler: boiler,
        serial: serial,
        notes: notes,
        image: imgSrc.startsWith('data:image') ? imgSrc : null,
        date: new Date().toLocaleDateString('it-IT')
    };

    const transaction = dbIndexed.transaction(['targhe'], 'readwrite');
    const store = transaction.objectStore('targhe');
    store.add(item);

    transaction.oncomplete = () => {
        chiudiTargaModal();
        mostraTarghe();
    };
}

function mostraTarghe() {
    vibraTocco();
    cambiaVista('targhe-view');
    caricaTarghe();
}

function caricaTarghe() {
    if (!dbIndexed) return;

    const container = document.getElementById('targhe-list');
    const transaction = dbIndexed.transaction(['targhe'], 'readonly');
    const store = transaction.objectStore('targhe');
    const request = store.getAll();

    request.onsuccess = () => {
        const items = request.result;
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="card" style="text-align:center; padding:20px;">
                    <p style="font-size:13px; color:var(--text-sub);">Nessuna targa salvata nell'archivio.</p>
                </div>
            `;
            return;
        }

        let html = '';
        items.reverse().forEach(item => {
            html += `
                <div class="card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <div style="font-size:15px; font-weight:800; color:var(--text-main);">${item.client}</div>
                            <div style="font-size:12px; color:var(--text-sub); font-weight:600;">📍 ${item.address || 'Nessun indirizzo'}</div>
                        </div>
                        <button style="background:none; border:none; color:#ef4444; font-size:16px; cursor:pointer;" onclick="eliminaTarga(${item.id})">🗑️</button>
                    </div>

                    <div style="margin-top:10px; font-size:12.5px; color:var(--text-main);">
                        <div>🔥 Caldaia: <strong>${item.boiler || '-'}</strong></div>
                        <div>🏷️ Matricola: <strong>${item.serial || '-'}</strong></div>
                        ${item.notes ? `<div style="margin-top:4px; font-style:italic; color:var(--text-sub);">" ${item.notes} "</div>` : ''}
                    </div>

                    ${item.image ? `<img src="${item.image}" class="client-img-preview" style="display:block;" alt="Targa">` : ''}

                    <div style="font-size:10px; color:var(--text-sub); margin-top:8px; text-align:right;">Salvato il: ${item.date}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    };
}

function eliminaTarga(id) {
    if (!confirm("Vuoi davvero eliminare questa scheda targa?")) return;
    if (!dbIndexed) return;

    const transaction = dbIndexed.transaction(['targhe'], 'readwrite');
    const store = transaction.objectStore('targhe');
    store.delete(id);

    transaction.oncomplete = () => {
        caricaTarghe();
    };
}

function richiediSvuotaTarghe() {
    if (!confirm("Sei sicuro di voler cancellare TUTTA la banca dati delle targhe salvate?")) return;
    if (!dbIndexed) return;

    const transaction = dbIndexed.transaction(['targhe'], 'readwrite');
    const store = transaction.objectStore('targhe');
    store.clear();

    transaction.oncomplete = () => {
        caricaTarghe();
    };
}

// 7. CALCOLATORI TECNICI
function mostraCalcolatori() {
    vibraTocco();
    cambiaVista('calc-view');
}

function calcolaPortataGas() {
    const litri = parseFloat(document.getElementById('gasLiters').value);
    const resultBox = document.getElementById('gasResult');

    if (isNaN(litri) || litri <= 0) {
        resultBox.textContent = '0.0 kW';
        return;
    }

    // Calcolo: kW = (Litri in 60s * 60 * 9.6 kWh/m3) / 1000
    const kw = (litri * 0.06 * 9.6).toFixed(1);
    resultBox.textContent = `${kw} kW Termici`;
}

function calcolaVasoEspansione() {
    const vol = parseFloat(document.getElementById('waterVolume').value);
    const height = parseFloat(document.getElementById('buildingHeight').value) || 0;
    const resultBox = document.getElementById('vasoResult');

    if (isNaN(vol) || vol <= 0) {
        resultBox.textContent = 'Vaso Minimo: 0 L | Precarica: 1.0 bar';
        return;
    }

    const vasoLitri = Math.ceil(vol * 0.08); // Approssimazione 8%
    const precaricaBar = (1.0 + (height * 0.1)).toFixed(1);

    resultBox.textContent = `Vaso Minimo: ${vasoLitri} L | Precarica: ${precaricaBar} bar`;
}

function convertiPressione(type) {
    const mbarInput = document.getElementById('inputMbar');
    const paInput = document.getElementById('inputPascal');

    if (type === 'mbar') {
        const val = parseFloat(mbarInput.value);
        paInput.value = isNaN(val) ? '' : Math.round(val * 100);
    } else {
        const val = parseFloat(paInput.value);
        mbarInput.value = isNaN(val) ? '' : (val / 100).toFixed(2);
    }
}

// 8. RAPPORTO INTERVENTO WHATSAPP
function apriReportModal(brand, code, desc) {
    vibraTocco();
    const company = localStorage.getItem('caldaiafix_company') || '';
    document.getElementById('repCompany').value = company;
    document.getElementById('repBoiler').value = brand;
    document.getElementById('repFault').value = `${code} - ${desc}`;
    document.getElementById('report-modal').style.display = 'flex';
}

function chiudiReportModal() {
    document.getElementById('report-modal').style.display = 'none';
}

function inviaRapportoWhatsApp() {
    const company = document.getElementById('repCompany').value.trim();
    const client = document.getElementById('repClient').value.trim();
    const boiler = document.getElementById('repBoiler').value.trim();
    const fault = document.getElementById('repFault').value.trim();
    const work = document.getElementById('repWork').value.trim();
    const price = document.getElementById('repPrice').value.trim();

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

// 9. AREA TECNICA & PIN
function apriPin() {
    vibraTocco();
    document.getElementById('pin-modal').style.display = 'flex';
}

function chiudiPin() {
    document.getElementById('pin-modal').style.display = 'none';
    document.getElementById('pinError').style.display = 'none';
    document.getElementById('pinInput').value = '';
}

function verificaPin() {
    const pin = document.getElementById('pinInput').value.trim();
    if (pin === '1234' || pin === '0000' || pin.length >= 4) {
        chiudiPin();
        renderAreaTecnica();
    } else {
        document.getElementById('pinError').style.display = 'block';
    }
}

function renderAreaTecnica() {
    const container = document.getElementById('installer-content');
    if (!container) return;

    let html = `
        <div class="card" style="background:#f3e8ff; border-color:#d8b4fe;">
            <h3 style="color:#6d28d9; font-size:13px; font-weight:800; text-transform:uppercase; margin-bottom:10px;">🔑 Parametri Tecnici & Menu Segreti</h3>
    `;

    installerMenus.forEach(m => {
        html += `
            <div style="background:#ffffff; border:1px solid #e9d5ff; padding:12px; border-radius:14px; margin-bottom:8px;">
                <div style="font-size:13px; font-weight:800; color:#581c87;">${m.brand} (${m.model})</div>
                <div style="font-size:12px; color:var(--text-main); margin-top:4px;"><strong>Procedura:</strong> ${m.sequence}</div>
                <div style="font-size:11px; color:var(--text-sub); margin-top:2px;"><em>${m.notes}</em></div>
            </div>
        `;
    });

    html += `</div>`;
    container.innerHTML = html;
    container.style.display = 'block';
}

// 10. NAVIGAZIONE, VISTE & MENU TENDINA
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
    impostaTabNav('settings');
    cambiaVista('settings-view');
}

function toggleMenuTendina() {
    vibraTocco();
    const overlay = document.getElementById('dropup-overlay');
    const menu = document.getElementById('dropup-menu');

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

// 11. TORCIA FLASH & PWA
function toggleTorch() {
    vibraTocco();
    if (!isTorchOn) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                torchTrack = stream.getVideoTracks()[0];
                return torchTrack.applyConstraints({ advanced: [{ torch: true }] });
            })
            .then(() => {
                isTorchOn = true;
                const btn = document.getElementById('menu-torch-btn');
                if (btn) btn.style.color = '#f59e0b';
            })
            .catch(err => {
                alert("Torcia non disponibile o permessi fotocamera negati.");
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

// 12. UTILITY & IMPOSTAZIONI DITTA
function salvaImpostazioniDitta() {
    const val = document.getElementById('settingCompany').value.trim();
    localStorage.setItem('caldaiafix_company', val);
}

function salvaImpostazioniVibrazione() {
    const chk = document.getElementById('settingVibration').checked;
    localStorage.setItem('caldaiafix_vibration', chk ? 'true' : 'false');
}

function caricaImpostazioni() {
    const comp = localStorage.getItem('caldaiafix_company');
    if (comp && document.getElementById('settingCompany')) {
        document.getElementById('settingCompany').value = comp;
    }

    const vib = localStorage.getItem('caldaiafix_vibration');
    if (vib !== null && document.getElementById('settingVibration')) {
        document.getElementById('settingVibration').checked = (vib === 'true');
    }
}

function vibraTocco() {
    const enabled = localStorage.getItem('caldaiafix_vibration') !== 'false';
    if (enabled && navigator.vibrate) {
        navigator.vibrate(15);
    }
}
