// TAG AFFILIATO AMAZON RIPRISTINATO
const amazonAffiliateTag = "dbsolution-21";

// RIFERIMENTO NELLA FUNZIONE DI INVIO EMAIL
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

    const mailtoUrl = `mailto:caldaiafixassistenza@libero.it?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    chiudiFeedbackModal();
}
