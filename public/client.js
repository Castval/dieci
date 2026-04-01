const socket = io();

const NOMI_VALORI = {
  1: 'Asso', 2: 'Due', 3: 'Tre', 4: 'Quattro', 5: 'Cinque',
  6: 'Sei', 7: 'Sette', 8: 'Otto', 9: 'Nove', 10: 'Dieci'
};
const OFFSET_SEMI = { denari: 0, coppe: 10, spade: 20, bastoni: 30 };
const NOMI_SEMI = { denari: 'Denari', coppe: 'Coppe', bastoni: 'Bastoni', spade: 'Spade' };

function getImmagineCarta(valore, seme) {
  const numero = OFFSET_SEMI[seme] + valore;
  const numeroStr = numero.toString().padStart(2, '0');
  const nomeValore = NOMI_VALORI[valore];
  const nomeSeme = (numero === 40) ? 'Bastoni' : seme;
  return `immagini/${numeroStr}_${nomeValore}_di_${nomeSeme}.jpg`;
}

let statoGioco = null;
let cartaSelezionata = null;

const schermate = {
  lobby: document.getElementById('lobby'),
  attesa: document.getElementById('attesa'),
  gioco: document.getElementById('gioco'),
  fineRound: document.getElementById('fineRound')
};

function mostraSchermata(nome) {
  Object.values(schermate).forEach(s => s.classList.remove('attiva'));
  schermate[nome].classList.add('attiva');
}

function creaCartaElemento(carta) {
  const div = document.createElement('div');
  div.className = 'carta';
  div.dataset.id = carta.id;
  const imgSrc = getImmagineCarta(carta.valore, carta.seme);
  div.innerHTML = `<img src="${imgSrc}" alt="${carta.valore} di ${carta.seme}">`;
  if (carta.valore === 10) div.classList.add('carta-dieci');
  return div;
}

// --- CLICK ---

function clickCartaMano(carta, elemento) {
  if (!statoGioco || !statoGioco.turnoMio) {
    mostraMessaggio('Non e il tuo turno', 'errore');
    return;
  }

  // Se e' un 10, giocalo subito (auto-cattura)
  if (carta.valore === 10) {
    socket.emit('giocaCarta', { cartaId: carta.id, cartaTavoloId: null });
    cartaSelezionata = null;
    return;
  }

  // Trova la mossa per questa carta
  const mossa = statoGioco.mossePossibili.find(m => m.cartaId === carta.id);
  if (!mossa) return;

  // Se non ha catture possibili, posa direttamente
  if (mossa.tipo === 'posa') {
    socket.emit('giocaCarta', { cartaId: carta.id, cartaTavoloId: null });
    cartaSelezionata = null;
    return;
  }

  // Se ha una sola cattura possibile, eseguila
  if (mossa.catturabili.length === 1) {
    socket.emit('giocaCarta', { cartaId: carta.id, cartaTavoloId: mossa.catturabili[0] });
    cartaSelezionata = null;
    return;
  }

  // Piu catture possibili: seleziona carta e mostra opzioni
  document.querySelectorAll('.mano-carte:not(.dorso) .carta').forEach(c => c.classList.remove('selezionata'));
  document.querySelectorAll('#tavolo .carta').forEach(c => c.classList.remove('catturabile'));

  cartaSelezionata = carta;
  elemento.classList.add('selezionata');

  // Evidenzia carte catturabili
  for (const id of mossa.catturabili) {
    const el = document.querySelector(`#tavolo .carta[data-id="${id}"]`);
    if (el) el.classList.add('catturabile');
  }
}

function clickCartaTavolo(carta) {
  if (!statoGioco || !statoGioco.turnoMio || !cartaSelezionata) return;

  const mossa = statoGioco.mossePossibili.find(m => m.cartaId === cartaSelezionata.id);
  if (!mossa || !mossa.catturabili.includes(carta.id)) {
    mostraMessaggio('Non puoi prendere questa carta', 'errore');
    return;
  }

  socket.emit('giocaCarta', { cartaId: cartaSelezionata.id, cartaTavoloId: carta.id });
  cartaSelezionata = null;
}

// --- RENDERING ---

function renderizzaGioco() {
  if (!statoGioco) return;

  // Info giocatore
  document.getElementById('nomeGiocatoreDisplay').textContent = statoGioco.nomeGiocatore;
  document.getElementById('puntiGiocatore').textContent = statoGioco.puntiGiocatore;
  document.getElementById('preseGiocatore').textContent = statoGioco.preseGiocatore;
  document.getElementById('mazzoRimanenti').textContent = statoGioco.mazzoRimanenti;

  // Turno
  const turnoInd = document.getElementById('turnoIndicatore');
  if (statoGioco.turnoMio) {
    turnoInd.textContent = 'Tocca a te!';
    turnoInd.classList.add('mio-turno');
  } else {
    turnoInd.textContent = 'Turno avversario';
    turnoInd.classList.remove('mio-turno');
  }

  // Avversari info
  const infoAvv = document.getElementById('infoAvversari');
  infoAvv.innerHTML = '';
  for (const avv of statoGioco.avversari) {
    const div = document.createElement('div');
    div.className = 'info-avversario';
    div.innerHTML = `
      <span class="nome">${avv.nome}</span>
      <span class="dettagli">Pt: ${avv.puntiTotali} | Prese: ${avv.numPrese} | Dieci: ${avv.numDipiù}</span>
    `;
    infoAvv.appendChild(div);
  }

  // Mani avversari (dorso)
  const areaAvv = document.getElementById('areaAvversari');
  areaAvv.innerHTML = '';
  for (const avv of statoGioco.avversari) {
    const div = document.createElement('div');
    div.className = 'avversario-mano';
    div.innerHTML = `<h4>${avv.nome}</h4>`;
    const mano = document.createElement('div');
    mano.className = 'mano-carte dorso';
    for (let i = 0; i < avv.carteInMano; i++) {
      const carta = document.createElement('div');
      carta.className = 'carta';
      mano.appendChild(carta);
    }
    div.appendChild(mano);
    areaAvv.appendChild(div);
  }

  // Briscola
  const briscolaDisplay = document.getElementById('briscolaDisplay');
  briscolaDisplay.innerHTML = '';
  if (statoGioco.cartaBriscola) {
    const el = creaCartaElemento(statoGioco.cartaBriscola);
    el.style.cursor = 'default';
    briscolaDisplay.appendChild(el);
  }

  // Tavolo
  const tavolo = document.getElementById('tavolo');
  tavolo.innerHTML = '';
  for (const carta of statoGioco.tavolo) {
    const el = creaCartaElemento(carta);
    el.addEventListener('click', () => clickCartaTavolo(carta));
    tavolo.appendChild(el);
  }

  // Mano giocatore
  const manoEl = document.getElementById('manoGiocatore');
  manoEl.innerHTML = '';
  const ordSemi = { denari: 0, coppe: 1, bastoni: 2, spade: 3 };
  const manoOrd = [...statoGioco.manoGiocatore].sort((a, b) => {
    if (a.valore !== b.valore) return a.valore - b.valore;
    return ordSemi[a.seme] - ordSemi[b.seme];
  });

  for (const carta of manoOrd) {
    const el = creaCartaElemento(carta);
    const mossa = statoGioco.mossePossibili.find(m => m.cartaId === carta.id);
    if (statoGioco.turnoMio && mossa) {
      if (mossa.tipo === 'cattura' || mossa.tipo === 'auto') {
        el.style.borderBottom = '3px solid #4caf50';
      }
    }
    el.addEventListener('click', () => clickCartaMano(carta, el));
    manoEl.appendChild(el);
  }

  cartaSelezionata = null;

  // Mazzi prese
  renderizzaMazzoPrese();
  renderizzaMazzoPreseAvversario();
}

// Renderizza il mazzo delle prese del giocatore con dieci di traverso
function renderizzaMazzoPrese() {
  const mazzoPrese = document.getElementById('mazzoPrese');
  mazzoPrese.innerHTML = '';
  if (!statoGioco) return;

  const numPrese = statoGioco.preseGiocatore;
  const dieci = statoGioco.dieciGiocatore || [];

  if (numPrese === 0 && dieci.length === 0) return;

  const carteNormaliDaMostrare = Math.min(3, Math.max(1, numPrese - dieci.length));
  for (let i = 0; i < carteNormaliDaMostrare; i++) {
    const cartaPresa = document.createElement('div');
    cartaPresa.className = 'carta-presa';
    cartaPresa.style.top = (i * 2) + 'px';
    cartaPresa.style.left = (i * 1) + 'px';
    cartaPresa.style.zIndex = i;
    mazzoPrese.appendChild(cartaPresa);
  }

  const maxVisibili = 7;
  const dieciDaMostrare = dieci.slice(-maxVisibili);
  dieciDaMostrare.forEach((d, idx) => {
    const parti = d.carta.split('_');
    const valore = parseInt(parti[0]);
    const seme = parti[1];

    const cartaDieci = document.createElement('div');
    cartaDieci.className = 'carta-dieci-presa';
    const baseTop = (carteNormaliDaMostrare * 2) + 5;
    cartaDieci.style.top = (baseTop + idx * 18) + 'px';
    cartaDieci.style.left = '-15px';
    cartaDieci.style.zIndex = 50 + idx;

    const imgSrc = getImmagineCarta(valore, seme);
    cartaDieci.innerHTML = `<img src="${imgSrc}" alt="${valore} di ${seme}">`;

    const puntiDiv = document.createElement('div');
    puntiDiv.className = 'dieci-punti';
    puntiDiv.textContent = '+' + d.valore;
    cartaDieci.appendChild(puntiDiv);
    mazzoPrese.appendChild(cartaDieci);
  });

  const contatore = document.createElement('div');
  contatore.className = 'contatore-prese';
  if (dieci.length > 0) {
    contatore.innerHTML = `${numPrese} carte<br><strong>${dieci.length} dieci (+${dieci.length})</strong>`;
  } else {
    contatore.textContent = `${numPrese} carte`;
  }
  mazzoPrese.appendChild(contatore);
}

// Renderizza il mazzo delle prese dell'avversario
function renderizzaMazzoPreseAvversario() {
  const mazzoPrese = document.getElementById('mazzoPreseAvversario');
  mazzoPrese.innerHTML = '';
  if (!statoGioco) return;

  // Somma prese di tutti gli avversari
  let numPrese = 0;
  let dieci = [];
  for (const avv of statoGioco.avversari) {
    numPrese += avv.numPrese;
    dieci = dieci.concat(avv.dipiù || []);
  }

  if (numPrese === 0 && dieci.length === 0) return;

  const carteNormaliDaMostrare = Math.min(3, Math.max(1, numPrese - dieci.length));
  for (let i = 0; i < carteNormaliDaMostrare; i++) {
    const cartaPresa = document.createElement('div');
    cartaPresa.className = 'carta-presa';
    cartaPresa.style.top = (i * 2) + 'px';
    cartaPresa.style.left = (i * 1) + 'px';
    cartaPresa.style.zIndex = i;
    mazzoPrese.appendChild(cartaPresa);
  }

  const maxVisibili = 7;
  const dieciDaMostrare = dieci.slice(-maxVisibili);
  dieciDaMostrare.forEach((d, idx) => {
    const parti = d.carta.split('_');
    const valore = parseInt(parti[0]);
    const seme = parti[1];

    const cartaDieci = document.createElement('div');
    cartaDieci.className = 'carta-dieci-presa';
    const baseTop = (carteNormaliDaMostrare * 2) + 5;
    cartaDieci.style.top = (baseTop + idx * 18) + 'px';
    cartaDieci.style.left = '-15px';
    cartaDieci.style.zIndex = 50 + idx;

    const imgSrc = getImmagineCarta(valore, seme);
    cartaDieci.innerHTML = `<img src="${imgSrc}" alt="${valore} di ${seme}">`;

    const puntiDiv = document.createElement('div');
    puntiDiv.className = 'dieci-punti';
    puntiDiv.textContent = '+' + d.valore;
    cartaDieci.appendChild(puntiDiv);
    mazzoPrese.appendChild(cartaDieci);
  });

  const contatore = document.createElement('div');
  contatore.className = 'contatore-prese';
  if (dieci.length > 0) {
    contatore.innerHTML = `${numPrese} carte<br><strong>${dieci.length} dieci (+${dieci.length})</strong>`;
  } else {
    contatore.textContent = `${numPrese} carte`;
  }
  mazzoPrese.appendChild(contatore);
}

function mostraMessaggio(testo, tipo = '') {
  const msgLobby = document.getElementById('messaggioLobby');
  const msgGioco = document.getElementById('messaggioGioco');
  const msg = schermate.gioco.classList.contains('attiva') ? msgGioco : msgLobby;
  msg.textContent = testo;
  msg.className = 'messaggio';
  if (tipo) msg.classList.add(tipo);
  setTimeout(() => { msg.textContent = ''; msg.className = 'messaggio'; }, 3000);
}

// --- EVENTS ---

document.querySelector('.sezione-regole h3')?.addEventListener('click', () => {
  document.querySelector('.sezione-regole').classList.toggle('chiusa');
});

document.getElementById('btnCreaStanza').addEventListener('click', () => {
  const nome = document.getElementById('nomeGiocatore').value.trim();
  if (!nome) { mostraMessaggio('Inserisci il tuo nome', 'errore'); return; }
  const numGiocatori = parseInt(document.getElementById('numGiocatori').value);
  socket.emit('creaStanza', { nome, numGiocatori });
});

document.getElementById('btnUnisciti').addEventListener('click', () => {
  const nome = document.getElementById('nomeGiocatore').value.trim();
  const codice = document.getElementById('codiceStanza').value.trim().toUpperCase();
  if (!nome) { mostraMessaggio('Inserisci il tuo nome', 'errore'); return; }
  if (!codice) { mostraMessaggio('Inserisci il codice stanza', 'errore'); return; }
  socket.emit('uniscitiStanza', { codice, nome });
});

document.getElementById('btnMostraStanze').addEventListener('click', () => {
  socket.emit('richiediStanzeDisponibili');
});
document.getElementById('codiceStanza').addEventListener('focus', () => {
  socket.emit('richiediStanzeDisponibili');
});
document.addEventListener('click', (e) => {
  const lista = document.getElementById('listaStanze');
  const container = document.querySelector('.input-stanza-container');
  if (!container.contains(e.target) && !lista.contains(e.target)) {
    lista.classList.add('nascosto');
  }
});

document.getElementById('btnProssimoRound').addEventListener('click', () => {
  socket.emit('nuovoRound');
});
document.getElementById('btnNuovaPartita').addEventListener('click', () => {
  socket.emit('nuovaPartita');
});

// --- SOCKET ---

socket.on('stanzeDisponibili', (stanze) => {
  const lista = document.getElementById('listaStanze');
  lista.innerHTML = '';
  if (stanze.length === 0) {
    lista.innerHTML = '<div class="nessuna-stanza">Nessuna stanza disponibile</div>';
  } else {
    stanze.forEach(stanza => {
      const item = document.createElement('div');
      item.className = 'stanza-item';
      item.innerHTML = `
        <span class="codice">${stanza.codice}</span>
        <span class="creatore">di ${stanza.creatore} (${stanza.giocatoriPresenti}/${stanza.numGiocatori})</span>
      `;
      item.addEventListener('click', () => {
        document.getElementById('codiceStanza').value = stanza.codice;
        lista.classList.add('nascosto');
      });
      lista.appendChild(item);
    });
  }
  lista.classList.remove('nascosto');
});

socket.on('stanzaCreata', ({ codice, numGiocatori }) => {
  document.getElementById('codiceStanzaDisplay').textContent = codice;
  document.getElementById('attesaInfo').textContent =
    `In attesa degli altri giocatori (1/${numGiocatori})...`;
  mostraSchermata('attesa');
});

socket.on('unitoAStanza', () => { mostraSchermata('attesa'); });

socket.on('errore', (messaggio) => { mostraMessaggio(messaggio, 'errore'); });

socket.on('giocatoreUnito', ({ giocatori, numGiocatori }) => {
  const info = document.getElementById('attesaInfo');
  if (info) {
    info.textContent = `In attesa (${giocatori.length}/${numGiocatori})...`;
  }
  const lista = document.getElementById('listaGiocatoriAttesa');
  if (lista) {
    lista.innerHTML = giocatori.map(g => `<p>${g.nome}</p>`).join('');
  }
});

socket.on('partitaIniziata', (stato) => {
  statoGioco = stato;
  mostraSchermata('gioco');
  renderizzaGioco();
});

socket.on('statoAggiornato', (dati) => {
  const { cartaGiocata, giocatoreId, dipiù, presa, ...stato } = dati;

  if (cartaGiocata && giocatoreId !== socket.id) {
    mostraCartaAvversario(cartaGiocata, () => {
      statoGioco = stato;
      renderizzaGioco();
      if (dipiù) {
        mostraMessaggio('L\'avversario ha fatto Dieci!', 'info');
      }
    });
  } else {
    statoGioco = stato;
    renderizzaGioco();
    if (dipiù && giocatoreId === socket.id) {
      mostraMessaggio('Dieci!', 'successo');
    }
  }
});

// Mostra la carta giocata dall'avversario
function mostraCartaAvversario(carta, callback) {
  const tavoloContainer = document.querySelector('.tavolo-container');

  const cartaDiv = document.createElement('div');
  cartaDiv.className = 'carta carta-avversario-giocata';
  if (carta.valore === 10) {
    cartaDiv.classList.add('carta-dieci');
  }

  const imgSrc = getImmagineCarta(carta.valore, carta.seme);
  cartaDiv.innerHTML = `<img src="${imgSrc}" alt="${carta.valore} di ${carta.seme}">`;

  tavoloContainer.appendChild(cartaDiv);

  setTimeout(() => {
    cartaDiv.remove();
    callback();
  }, 1000);
}

socket.on('mossaNonValida', (errore) => {
  mostraMessaggio(errore, 'errore');
});

socket.on('fineRound', ({ stato, puntiRound, finePartita, vincitore }) => {
  statoGioco = stato;

  const titoloEl = document.getElementById('titoloFineRound');
  const btnProssimo = document.getElementById('btnProssimoRound');
  const btnNuova = document.getElementById('btnNuovaPartita');

  if (finePartita) {
    titoloEl.textContent = vincitore === statoGioco.nomeGiocatore
      ? 'Hai vinto la partita!' : `${vincitore} ha vinto!`;
    btnProssimo.classList.add('nascosto');
    btnNuova.classList.remove('nascosto');
  } else {
    titoloEl.textContent = 'Fine Smazzata';
    btnProssimo.classList.remove('nascosto');
    btnNuova.classList.add('nascosto');
  }

  // Briscola riepilogo
  const briscolaRiep = document.getElementById('briscolaRiepilogo');
  if (statoGioco.cartaBriscola) {
    const cs = statoGioco.cartaBriscola;
    briscolaRiep.innerHTML = `<span class="seme-label">Seme: <strong>${NOMI_SEMI[cs.seme]}</strong></span>`;
    const cartaEl = creaCartaElemento(cs);
    cartaEl.style.cursor = 'default';
    briscolaRiep.prepend(cartaEl);
  }

  // Riepilogo punti per tutti i giocatori
  const riepilogo = document.getElementById('riepilogoPunti');
  riepilogo.innerHTML = '';

  // Ordina: giocatore corrente prima, poi avversari
  const tuttiIds = [statoGioco.nomeGiocatore, ...statoGioco.avversari.map(a => a.nome)];
  const tuttiPunti = {};

  // Mappa nome -> id per cercare nei puntiRound
  // puntiRound ha come chiave gli ID socket, ci serve mapparli
  for (const [id, dati] of Object.entries(puntiRound)) {
    tuttiPunti[id] = dati;
  }

  // Trova i dati per ogni giocatore
  const giocatoreIds = Object.keys(puntiRound);

  for (const gId of giocatoreIds) {
    const dati = puntiRound[gId];
    const isMe = gId === socket.id;
    const avv = statoGioco.avversari.find(a => !isMe);

    const col = document.createElement('div');
    col.className = 'colonna-punti';

    let nome;
    if (isMe) {
      nome = statoGioco.nomeGiocatore;
    } else {
      // Trova nome dell'avversario con questo ID
      // Non abbiamo l'ID diretto, usiamo l'ordine
      const idx = giocatoreIds.indexOf(gId);
      const avvIdx = giocatoreIds.filter(id => id !== socket.id).indexOf(gId);
      nome = statoGioco.avversari[avvIdx]?.nome || 'Giocatore';
    }

    const puntiTot = isMe ? statoGioco.puntiGiocatore :
      (statoGioco.avversari.find((a, i) => giocatoreIds.filter(id => id !== socket.id)[i] === gId)?.puntiTotali || 0);

    col.innerHTML = `
      <h3>${nome}</h3>
      <table class="tabella-punti">
        <tr><td>Dieci</td><td></td><td class="${dati.dipiù > 0 ? 'punto-si' : 'punto-no'}">${dati.dipiù > 0 ? '+' + dati.dipiù : '0'}</td></tr>
        <tr><td>Carte</td><td>(${dati.totaleCarte})</td><td class="${dati.carte ? 'punto-si' : 'punto-no'}">${dati.carte ? '+1' : '0'}</td></tr>
        <tr><td>Seme</td><td>(${dati.carteSemeBriscola})</td><td class="${dati.seme ? 'punto-si' : 'punto-no'}">${dati.seme ? '+1' : '0'}</td></tr>
        <tr><td>10 del seme</td><td></td><td class="${dati.dieciBriscola ? 'punto-si' : 'punto-no'}">${dati.dieciBriscola ? '+1' : '0'}</td></tr>
        <tr class="riga-totale"><td>Totale round</td><td></td><td>${dati.totale}</td></tr>
      </table>
      <p class="punti-totali">Punteggio: <strong>${puntiTot}</strong></p>
    `;
    riepilogo.appendChild(col);
  }

  mostraSchermata('fineRound');
});

socket.on('avversarioDisconnesso', () => {
  mostraMessaggio('Un giocatore si e disconnesso', 'errore');
  setTimeout(() => mostraSchermata('lobby'), 2000);
});
