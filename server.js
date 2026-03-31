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
      for (const g of partita.giocatori) {
        io.to(g.id).emit('statoAggiornato', {
          ...partita.getStato(g.id),
          cartaGiocataId: cartaId,
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

    partita.rimuoviGiocatore(socket.id);
    io.to(codice).emit('avversarioDisconnesso');

    if (partita.giocatori.length === 0) {
      stanze.delete(codice);
      console.log(`Stanza ${codice} eliminata`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server Dieci in esecuzione su http://localhost:${PORT}`);
});
