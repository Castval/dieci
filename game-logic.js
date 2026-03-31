// Logica del gioco Dieci (2 o 4 giocatori)

const SEMI = ['denari', 'coppe', 'bastoni', 'spade'];
const VALORI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

class Carta {
  constructor(valore, seme) {
    this.valore = valore;
    this.seme = seme;
    this.id = `${valore}_${seme}`;
  }
}

function creaMazzo() {
  const carte = [];
  for (const seme of SEMI) {
    for (const valore of VALORI) {
      carte.push(new Carta(valore, seme));
    }
  }
  return carte;
}

function mescola(carte) {
  for (let i = carte.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [carte[i], carte[j]] = [carte[j], carte[i]];
  }
}

class Giocatore {
  constructor(id, nome) {
    this.id = id;
    this.nome = nome;
    this.mano = [];
    this.prese = [];
    this.dipiù = []; // carte dei "Dieci" (scope)
    this.puntiTotali = 0;
  }

  reset() {
    this.mano = [];
    this.prese = [];
    this.dipiù = [];
  }
}

class Dieci {
  constructor(codice, numGiocatori) {
    this.codice = codice;
    this.numGiocatori = numGiocatori; // 2 o 4
    this.giocatori = [];
    this.tavolo = [];
    this.mazzo = [];
    this.cartaBriscola = null; // ultima carta del mazzo, girata
    this.turnoCorrente = 0;
    this.stato = 'attesa';
    this.mazziere = 0;
    this.puntiVittoria = 10;
    this.ultimoPresore = -1; // indice dell'ultimo giocatore che ha preso
  }

  aggiungiGiocatore(id, nome) {
    if (this.giocatori.length >= this.numGiocatori) return false;
    this.giocatori.push(new Giocatore(id, nome));
    return true;
  }

  rimuoviGiocatore(id) {
    this.giocatori = this.giocatori.filter(g => g.id !== id);
  }

  iniziaPartita() {
    const mazzo = creaMazzo();
    mescola(mazzo);

    // Reset giocatori
    for (const g of this.giocatori) {
      g.reset();
    }

    // 5 carte a ciascun giocatore
    for (const g of this.giocatori) {
      g.mano = mazzo.splice(0, 5);
    }

    // 4 carte a terra
    this.tavolo = mazzo.splice(0, 4);

    // L'ultima carta del mazzo e la briscola (girata)
    this.cartaBriscola = mazzo[mazzo.length - 1];
    this.mazzo = mazzo;

    // Se ci sono 10 a terra, vanno al mazziere
    const dieciATerra = this.tavolo.filter(c => c.valore === 10);
    if (dieciATerra.length > 0) {
      const mazziere = this.giocatori[this.mazziere];
      for (const c of dieciATerra) {
        mazziere.prese.push(c);
      }
      this.tavolo = this.tavolo.filter(c => c.valore !== 10);
    }

    // Il giocatore dopo il mazziere inizia
    this.turnoCorrente = (this.mazziere + 1) % this.giocatori.length;
    this.stato = 'inCorso';
    this.ultimoPresore = -1;
  }

  nuovoRound() {
    this.mazziere = (this.mazziere + 1) % this.giocatori.length;
    this.iniziaPartita();
  }

  // Carte dal tavolo catturabili con una data carta
  carteCatturabili(carta) {
    if (carta.valore === 10) return []; // Il 10 si cattura da solo
    const catturabili = [];
    for (const cartaTavolo of this.tavolo) {
      if (carta.valore + cartaTavolo.valore === 10) {
        catturabili.push(cartaTavolo);
      }
    }
    return catturabili;
  }

  eseguiMossa(giocatoreId, cartaId, cartaTavoloId) {
    if (this.stato !== 'inCorso') {
      return { valida: false, errore: 'Partita non in corso' };
    }

    const idxGiocatore = this.giocatori.findIndex(g => g.id === giocatoreId);
    if (idxGiocatore !== this.turnoCorrente) {
      return { valida: false, errore: 'Non è il tuo turno' };
    }

    const giocatore = this.giocatori[idxGiocatore];
    const carta = giocatore.mano.find(c => c.id === cartaId);
    if (!carta) {
      return { valida: false, errore: 'Carta non trovata nella mano' };
    }

    let risultato = { valida: true, dipiù: false, presa: false };

    if (carta.valore === 10) {
      // Il 10 va direttamente nelle prese
      giocatore.mano = giocatore.mano.filter(c => c.id !== cartaId);
      giocatore.prese.push(carta);
      this.ultimoPresore = idxGiocatore;
      risultato.presa = true;

      // Se il tavolo aveva 0 carte non e' un Dieci
      // Il 10 non prende dal tavolo, si cattura da solo

    } else if (cartaTavoloId) {
      // Tenta cattura: carta + cartaTavolo = 10
      const cartaTavolo = this.tavolo.find(c => c.id === cartaTavoloId);
      if (!cartaTavolo) {
        return { valida: false, errore: 'Carta non trovata sul tavolo' };
      }

      if (carta.valore + cartaTavolo.valore !== 10) {
        return { valida: false, errore: 'Le due carte devono fare somma 10' };
      }

      // Cattura
      giocatore.mano = giocatore.mano.filter(c => c.id !== cartaId);
      this.tavolo = this.tavolo.filter(c => c.id !== cartaTavoloId);
      giocatore.prese.push(carta);
      giocatore.prese.push(cartaTavolo);
      this.ultimoPresore = idxGiocatore;
      risultato.presa = true;

      // Dieci! (come scopa: tavolo svuotato con 1 carta presente)
      if (this.tavolo.length === 0) {
        risultato.dipiù = true;
        giocatore.dipiù.push({ carta: carta.id, valore: 1 });
      }

    } else {
      // Nessuna cattura: controlla che non ci siano catture obbligatorie
      const catturabili = this.carteCatturabili(carta);
      if (catturabili.length > 0) {
        return { valida: false, errore: 'Devi prendere! C\'è una carta che fa somma 10' };
      }

      // Posa la carta al tavolo
      giocatore.mano = giocatore.mano.filter(c => c.id !== cartaId);
      this.tavolo.push(carta);
    }

    // Pesca dal mazzo (se disponibile)
    if (this.mazzo.length > 1) {
      // >1 perche l'ultima e la briscola
      const cartaPescata = this.mazzo.shift();
      giocatore.mano.push(cartaPescata);
      risultato.cartaPescata = { id: cartaPescata.id, valore: cartaPescata.valore, seme: cartaPescata.seme };
    } else if (this.mazzo.length === 1) {
      // Ultima carta: la briscola
      const cartaPescata = this.mazzo.shift();
      giocatore.mano.push(cartaPescata);
      risultato.cartaPescata = { id: cartaPescata.id, valore: cartaPescata.valore, seme: cartaPescata.seme };
    }

    // Prossimo giocatore
    this.turnoCorrente = (this.turnoCorrente + 1) % this.giocatori.length;

    // Controlla fine round
    if (this.mazzo.length === 0 && this.giocatori.every(g => g.mano.length === 0)) {
      // Carte rimaste al tavolo vanno all'ultimo che ha preso
      if (this.ultimoPresore >= 0 && this.tavolo.length > 0) {
        this.giocatori[this.ultimoPresore].prese.push(...this.tavolo);
        this.tavolo = [];
      }
      this.terminaRound();
    }

    return risultato;
  }

  terminaRound() {
    const punti = this.calcolaPuntiRound();
    for (const g of this.giocatori) {
      g.puntiTotali += punti[g.id].totale;
    }

    if (this.giocatori.some(g => g.puntiTotali >= this.puntiVittoria)) {
      this.stato = 'finePartita';
    } else {
      this.stato = 'fineRound';
    }
  }

  calcolaPuntiRound() {
    const risultati = {};
    const semeBriscola = this.cartaBriscola.seme;

    for (const g of this.giocatori) {
      risultati[g.id] = {
        dipiù: g.dipiù.length,
        totaleCarte: g.prese.length,
        carte: 0,
        carteSemeBriscola: g.prese.filter(c => c.seme === semeBriscola).length,
        seme: 0,
        dieciBriscola: 0,
        totale: 0
      };
    }

    // Punto carte: chi ha piu di 20 carte (per 2 giocatori)
    // Per 4 giocatori: chi ha piu di 10
    const sogliaCarte = this.numGiocatori === 2 ? 20 : 10;
    for (const g of this.giocatori) {
      if (g.prese.length > sogliaCarte) {
        risultati[g.id].carte = 1;
      }
    }

    // Punto seme: chi ha piu carte del seme briscola
    let maxSeme = 0;
    let giocatoreMaxSeme = null;
    let parita = false;
    for (const g of this.giocatori) {
      const count = risultati[g.id].carteSemeBriscola;
      if (count > maxSeme) {
        maxSeme = count;
        giocatoreMaxSeme = g.id;
        parita = false;
      } else if (count === maxSeme) {
        parita = true;
      }
    }
    if (giocatoreMaxSeme && !parita) {
      risultati[giocatoreMaxSeme].seme = 1;
    }

    // Punto 10 del seme briscola
    const dieciBriscolaId = `10_${semeBriscola}`;
    for (const g of this.giocatori) {
      if (g.prese.some(c => c.id === dieciBriscolaId)) {
        risultati[g.id].dieciBriscola = 1;
      }
    }

    // Calcola totali
    for (const g of this.giocatori) {
      const r = risultati[g.id];
      r.totale = r.dipiù + r.carte + r.seme + r.dieciBriscola;
    }

    return risultati;
  }

  getStato(giocatoreId) {
    const giocatore = this.giocatori.find(g => g.id === giocatoreId);
    const idxGiocatore = this.giocatori.findIndex(g => g.id === giocatoreId);

    const avversari = this.giocatori
      .filter(g => g.id !== giocatoreId)
      .map(g => ({
        nome: g.nome,
        carteInMano: g.mano.length,
        numPrese: g.prese.length,
        numDipiù: g.dipiù.length,
        puntiTotali: g.puntiTotali
      }));

    // Mosse possibili
    const mossePossibili = [];
    if (giocatore && idxGiocatore === this.turnoCorrente) {
      for (const carta of giocatore.mano) {
        if (carta.valore === 10) {
          mossePossibili.push({ cartaId: carta.id, tipo: 'auto', catturabili: [] });
        } else {
          const catturabili = this.carteCatturabili(carta);
          if (catturabili.length > 0) {
            mossePossibili.push({
              cartaId: carta.id,
              tipo: 'cattura',
              catturabili: catturabili.map(c => c.id)
            });
          } else {
            mossePossibili.push({ cartaId: carta.id, tipo: 'posa', catturabili: [] });
          }
        }
      }
    }

    return {
      tavolo: this.tavolo.map(c => ({ id: c.id, valore: c.valore, seme: c.seme })),
      cartaBriscola: this.cartaBriscola ? { id: this.cartaBriscola.id, valore: this.cartaBriscola.valore, seme: this.cartaBriscola.seme } : null,
      manoGiocatore: giocatore ? giocatore.mano.map(c => ({ id: c.id, valore: c.valore, seme: c.seme })) : [],
      preseGiocatore: giocatore ? giocatore.prese.length : 0,
      dieciGiocatore: giocatore ? giocatore.dipiù : [],
      puntiGiocatore: giocatore ? giocatore.puntiTotali : 0,
      avversari,
      turnoMio: idxGiocatore === this.turnoCorrente,
      nomeGiocatore: giocatore ? giocatore.nome : '',
      stato: this.stato,
      puntiVittoria: this.puntiVittoria,
      mazzoRimanenti: this.mazzo.length,
      numGiocatori: this.numGiocatori,
      mossePossibili
    };
  }
}

module.exports = { Dieci };
