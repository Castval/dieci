const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Dieci } = require('./game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3003;

app.use(express.static(path.join(__dirname, 'public')));

const stanze = new Map();
const disconnessioniPendenti = new Map(); // chiave: `${codice}_${nome}`, valore: timeout

function generaCodiceStanza() {
  const caratteri = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let codice = '';
  for (let i = 0; i < 6; i++) {
    codice += caratteri.charAt(Math.floor(Math.random() * caratteri.length));
  }
  return codice;
}

io.on('connection', (socket) => {
  console.log(`Giocatore connesso: ${socket.id}`);

  socket.on('richiediStanzeDisponibili', () => {
    const stanzeDisponibili = [];
    for (const [codice, partita] of stanze) {
      if (partita.giocatori.length < partita.numGiocatori && partita.stato === 'attesa') {
        stanzeDisponibili.push({
          codice,
          creatore: partita.giocatori[0].nome,
          numGiocatori: partita.numGiocatori,
          giocatoriPresenti: partita.giocatori.length
        });
      }
    }
    socket.emit('stanzeDisponibili', stanzeDisponibili);
  });

  socket.on('creaStanza', ({ nome, numGiocatori }) => {
    const codice = generaCodiceStanza();
    const num = [2, 4].includes(numGiocatori) ? numGiocatori : 2;
    const partita = new Dieci(codice, num);
    partita.aggiungiGiocatore(socket.id, nome);

    stanze.set(codice, partita);
    socket.join(codice);
    socket.codiceStanza = codice;

    socket.emit('stanzaCreata', { codice, nome, numGiocatori: num });
    console.log(`Stanza ${codice} creata da ${nome} (${num} giocatori)`);
  });

  socket.on('uniscitiStanza', ({ codice, nome }) => {
    const partita = stanze.get(codice);

    if (!partita) {
      socket.emit('errore', 'Stanza non trovata');
      return;
    }

    // Controlla se è una riconnessione
    const chiaveDisc = `${codice}_${nome}`;
    const giocatoreDisconnesso = partita.giocatori.find(g => g.nome === nome && g.disconnesso);

    if (giocatoreDisconnesso) {
      // Riconnessione: aggiorna il socket ID
      const vecchioId = giocatoreDisconnesso.id;
      giocatoreDisconnesso.id = socket.id;
      giocatoreDisconnesso.disconnesso = false;

      // Cancella il timeout di rimozione
      if (disconnessioniPendenti.has(chiaveDisc)) {
        clearTimeout(disconnessioniPendenti.get(chiaveDisc));
        disconnessioniPendenti.delete(chiaveDisc);
      }

      socket.join(codice);
      socket.codiceStanza = codice;

      // Invia lo stato corrente al giocatore riconnesso
      if (partita.stato === 'inCorso') {
        socket.emit('partitaIniziata', partita.getStato(socket.id));
      } else if (partita.stato === 'fineRound' || partita.stato === 'finePartita') {
        socket.emit('partitaIniziata', partita.getStato(socket.id));
      }

      // Notifica gli altri
      io.to(codice).emit('giocatoreRiconnesso', { nome });
      console.log(`Giocatore ${nome} riconnesso nella stanza ${codice}`);
      return;
    }

    if (partita.giocatori.length >= partita.numGiocatori) {
      socket.emit('errore', 'Stanza piena');
      return;
    }

    partita.aggiungiGiocatore(socket.id, nome);
    socket.join(codice);
    socket.codiceStanza = codice;

    socket.emit('unitoAStanza', { codice, nome });

    io.to(codice).emit('giocatoreUnito', {
      giocatori: partita.giocatori.map(g => ({ id: g.id, nome: g.nome })),
      numGiocatori: partita.numGiocatori
    });

    if (partita.giocatori.length === partita.numGiocatori) {
      partita.iniziaPartita();

      for (const g of partita.giocatori) {
        io.to(g.id).emit('partitaIniziata', partita.getStato(g.id));
      }

      console.log(`Partita iniziata nella stanza ${codice}`);
    }
  });

  socket.on('giocaCarta', ({ cartaId, cartaTavoloId }) => {
    const codice = socket.codiceStanza;
    const partita = stanze.get(codice);

    if (!partita) {
      socket.emit('errore', 'Partita non trovata');
      return;
    }

    const risultato = partita.eseguiMossa(socket.id, cartaId, cartaTavoloId || null);

    if (!risultato.valida) {
      socket.emit('mossaNonValida', risultato.errore);
      return;
    }

    if (partita.stato === 'fineRound' || partita.stato === 'finePartita') {
      const punti = partita.calcolaPuntiRound();

      for (const g of partita.giocatori) {
        io.to(g.id).emit('fineRound', {
          stato: partita.getStato(g.id),
          puntiRound: punti,
          finePartita: partita.stato === 'finePartita',
          vincitore: partita.stato === 'finePartita' ?
            partita.giocatori.reduce((max, g) => g.puntiTotali > max.puntiTotali ? g : max).nome : null,
          cartaGiocataId: cartaId,
          giocatoreId: socket.id,
          dipiù: risultato.dipiù
        });
      }
    } else {
      // Ricostruisci l'oggetto carta dal suo ID per mostrarlo agli avversari
      const [valStr, seme] = cartaId.split('_');
      const cartaGiocata = { id: cartaId, valore: parseInt(valStr), seme };

      for (const g of partita.giocatori) {
        io.to(g.id).emit('statoAggiornato', {
          ...partita.getStato(g.id),
          cartaGiocata,
          giocatoreId: socket.id,
          dipiù: risultato.dipiù,
          presa: risultato.presa
        });
      }
    }
  });

  socket.on('nuovoRound', () => {
    const codice = socket.codiceStanza;
    const partita = stanze.get(codice);
    if (!partita || partita.stato !== 'fineRound') return;

    partita.nuovoRound();
    for (const g of partita.giocatori) {
      io.to(g.id).emit('partitaIniziata', partita.getStato(g.id));
    }
  });

  socket.on('nuovaPartita', () => {
    const codice = socket.codiceStanza;
    const partita = stanze.get(codice);
    if (!partita) return;

    for (const g of partita.giocatori) {
      g.puntiTotali = 0;
    }
    partita.iniziaPartita();
    for (const g of partita.giocatori) {
      io.to(g.id).emit('partitaIniziata', partita.getStato(g.id));
    }
  });

  socket.on('disconnect', () => {
    console.log(`Giocatore disconnesso: ${socket.id}`);
    const codice = socket.codiceStanza;
    if (!codice) return;

    const partita = stanze.get(codice);
    if (!partita) return;

    const giocatore = partita.giocatori.find(g => g.id === socket.id);
    if (!giocatore) return;

    // Se la partita è in corso, metti in pausa per 60 secondi
    if (partita.stato === 'inCorso' || partita.stato === 'fineRound') {
      giocatore.disconnesso = true;
      const nome = giocatore.nome;
      const chiaveDisc = `${codice}_${nome}`;

      io.to(codice).emit('avversarioDisconnesso', { nome, timeout: 180 });
      console.log(`Giocatore ${nome} disconnesso dalla stanza ${codice}, attendo riconnessione...`);

      // Timeout: se non si riconnette entro 60s, rimuovi
      const timer = setTimeout(() => {
        disconnessioniPendenti.delete(chiaveDisc);
        partita.rimuoviGiocatore(giocatore.id);
        io.to(codice).emit('avversarioAbbandonato', { nome });
        console.log(`Giocatore ${nome} rimosso dalla stanza ${codice} (timeout)`);

        if (partita.giocatori.filter(g => !g.disconnesso).length === 0) {
          stanze.delete(codice);
          console.log(`Stanza ${codice} eliminata`);
        }
      }, 180000);

      disconnessioniPendenti.set(chiaveDisc, timer);
    } else {
      // Partita in attesa o finita: rimuovi subito
      partita.rimuoviGiocatore(socket.id);
      io.to(codice).emit('avversarioAbbandonato', { nome: giocatore.nome });

      if (partita.giocatori.length === 0) {
        stanze.delete(codice);
        console.log(`Stanza ${codice} eliminata`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server Dieci in esecuzione su http://localhost:${PORT}`);
});
