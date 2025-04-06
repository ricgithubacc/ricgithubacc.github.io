const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let players = {
  p1: null,
  p2: null
};

let communityCards = [];
let deck = [];
let pot = 0;
let currentTurn = 'p1';

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  let newDeck = [];
  for (let suit of suits) {
    for (let value of values) {
      newDeck.push(`${value}${suit}`);
    }
  }
  return newDeck.sort(() => Math.random() - 0.5); // shuffle
}

function getPlayerSlotBySocket(id) {
  if (players.p1?.id === id) return 'p1';
  if (players.p2?.id === id) return 'p2';
  return null;
}

function switchTurn() {
  currentTurn = currentTurn === 'p1' ? 'p2' : 'p1';
  io.emit('turn-changed', currentTurn);
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join', (username) => {
    let assignedSlot = null;

    if (!players.p1) {
      players.p1 = { id: socket.id, username, hand: [], folded: false };
      assignedSlot = 'p1';
    } else if (!players.p2) {
      players.p2 = { id: socket.id, username, hand: [], folded: false };
      assignedSlot = 'p2';
    }

    if (assignedSlot) {
      socket.emit('joined', { playerId: socket.id, slot: assignedSlot });
      io.emit('players-update', players);
    } else {
      socket.emit('room-full');
    }
  });

  socket.on('start-game', () => {
    if (!players.p1 || !players.p2) return;

    deck = createDeck();
    communityCards = [];
    pot = 0;
    currentTurn = 'p1';

    players.p1.hand = [deck.pop(), deck.pop()];
    players.p2.hand = [deck.pop(), deck.pop()];
    players.p1.folded = false;
    players.p2.folded = false;

    io.emit('game-started', {
      players,
      communityCards,
      pot,
      currentTurn
    });
  });

  socket.on('deal-flop', () => {
    communityCards = [deck.pop(), deck.pop(), deck.pop()];
    io.emit('update-community', communityCards);
  });

  socket.on('deal-turn', () => {
    communityCards.push(deck.pop());
    io.emit('update-community', communityCards);
  });

  socket.on('deal-river', () => {
    communityCards.push(deck.pop());
    io.emit('update-community', communityCards);
  });

  socket.on('bet', (amount) => {
    const slot = getPlayerSlotBySocket(socket.id);
    if (slot !== currentTurn || !players[slot]) return;

    pot += amount;
    io.emit('update-pot', pot);
    switchTurn();
  });

  socket.on('fold', () => {
    const slot = getPlayerSlotBySocket(socket.id);
    if (!slot || !players[slot]) return;

    players[slot].folded = true;
    io.emit('player-folded', slot);
    switchTurn(); // or declare winner immediately
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const slot = getPlayerSlotBySocket(socket.id);
    if (slot) {
      players[slot] = null;
      io.emit('player-disconnected', slot);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
