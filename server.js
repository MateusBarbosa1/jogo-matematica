const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const QUEUE = [];
const ROOMS = {}; // salaID -> { players: [id,id], points: {}, progress: {}, questions: [], timer }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateQuestions() {
  const pool = [
    { q: "Quanto é 7 × 8?", choices: ["54","56","63","58"], a: "56" },
    { q: "Raiz quadrada de 81?", choices: ["7","8","9","10"], a: "9" },
    { q: "120 ÷ 3 = ?", choices: ["40","30","20","60"], a: "40" },
    { q: "Qual é 15% de 200?", choices: ["20","25","30","35"], a: "30" },
    { q: "2³ + 4 = ?", choices: ["12","10","11","8"], a: "12" },
    { q: "Qual é 11 × 11?", choices: ["111","121","101","131"], a: "121" },
    { q: "Qual o valor de π aproximado?", choices: ["2.14","3.14","3.41","4.13"], a: "3.14" },
    { q: "Quanto é 9 × 6?", choices: ["54","56","49","52"], a: "54" },
    { q: "Se x=5, 2x+3 = ?", choices: ["13","12","11","10"], a: "13" },
    { q: "Qual é 100 - 37?", choices: ["63","73","67","53"], a: "63" },
    { q: "Quanto é 14 × 3?", choices: ["42","36","48","39"], a: "42" },
    { q: "Raiz quadrada de 144?", choices: ["10","11","12","13"], a: "12" },
    { q: "250 ÷ 5 = ?", choices: ["40","45","50","55"], a: "50" },
    { q: "Qual é 20% de 150?", choices: ["20","25","30","35"], a: "30" },
    { q: "3² + 5 = ?", choices: ["11","12","14","15"], a: "14" },
    { q: "Quanto é 8 × 7?", choices: ["54","56","58","60"], a: "56" },
    { q: "Qual é 90 - 28?", choices: ["52","62","72","58"], a: "62" },
    { q: "Se x=4, 3x+2 = ?", choices: ["12","13","14","15"], a: "14" },
    { q: "Quanto é 18 ÷ 2?", choices: ["8","9","10","12"], a: "9" },
    { q: "Raiz quadrada de 25?", choices: ["4","5","6","7"], a: "5" },
    { q: "5! (fatorial de 5) é?", choices: ["60","120","24","20"], a: "120" },
    { q: "Quanto é 7 × 9?", choices: ["56","63","72","81"], a: "63" },
    { q: "Qual é 12²?", choices: ["124","144","154","164"], a: "144" },
    { q: "30% de 90 é?", choices: ["27","21","33","18"], a: "27" },
    { q: "2⁴ = ?", choices: ["8","12","16","18"], a: "16" }
  ];
  return shuffle(pool.slice());
}

io.on("connection", socket => {
  console.log("conectado:", socket.id);

  socket.on("joinQueue", ({ character }) => {
    console.log("joinQueue", socket.id, character);
    socket.data.character = character;
    QUEUE.push(socket.id);

    if (QUEUE.length >= 2) {
      const p1 = QUEUE.shift();
      const p2 = QUEUE.shift();
      const roomID = "room_" + Date.now() + "_" + Math.floor(Math.random()*1000);

      ROOMS[roomID] = {
        players: [p1, p2],
        points: { [p1]: 0, [p2]: 0 },
        progress: { [p1]: 0, [p2]: 0 },
        answered: { [p1]: [], [p2]: [] },
        questions: generateQuestions(),
        started: Date.now()
      };

      const s1 = io.sockets.sockets.get(p1);
      const s2 = io.sockets.sockets.get(p2);
      if (s1) s1.join(roomID);
      if (s2) s2.join(roomID);

      io.to(roomID).emit("matchFound", {
        room: roomID,
        players: [
          { id: p1, character: io.sockets.sockets.get(p1).data.character || "player1" },
          { id: p2, character: io.sockets.sockets.get(p2).data.character || "player2" }
        ],
        time: 120
      });

      ROOMS[roomID].timeout = setTimeout(() => {
        endRoom(roomID);
      }, 120000);
    } else {
      socket.emit("waiting");
    }
  });

  socket.on("requestQuestion", ({ room }) => {
    const r = ROOMS[room];
    if (!r) return;
    const pid = socket.id;
    const idx = r.progress[pid] || 0;

    if (idx >= r.questions.length) {
      r.questions = r.questions.concat(generateQuestions());
    }

    const q = r.questions[idx];
    r.progress[pid] = idx + 1;

    socket.emit("question", { index: idx, q: q.q, choices: q.choices });
  });

  socket.on("answer", ({ room, index, answer }) => {
    const r = ROOMS[room];
    if (!r) return;

    const pid = socket.id;

    if (r.answered[pid].includes(index)) return;
    r.answered[pid].push(index);

    const q = r.questions[index];
    if (q && q.a === answer) {
      r.points[pid] = (r.points[pid] || 0) + 1;
    }

    io.to(room).emit("scoreUpdate", r.points);
  });

  socket.on("disconnect", () => {
    console.log("disconnect:", socket.id);

    const qi = QUEUE.indexOf(socket.id);
    if (qi !== -1) QUEUE.splice(qi,1);

    for (const room in ROOMS) {
      const r = ROOMS[room];
      if (r.players.includes(socket.id)) {
        if (r.timeout) clearTimeout(r.timeout);

        const other = r.players.find(x => x !== socket.id);
        if (other) {
          ROOMS[room].points[other] = (ROOMS[room].points[other] || 0);
        }

        io.to(room).emit("playerDisconnected", { id: socket.id });
        endRoom(room);
      }
    }
  });
});


// ✅ FUNÇÃO ATUALIZADA COM O VENCEDOR
function endRoom(roomID) {
  const r = ROOMS[roomID];
  if (!r) return;

  if (r.timeout) clearTimeout(r.timeout);

  const [p1, p2] = r.players;
  const p1Points = r.points[p1];
  const p2Points = r.points[p2];

  let winner = null;

  if (p1Points > p2Points) winner = p1;
  else if (p2Points > p1Points) winner = p2;
  else winner = "empate";

  const char1 = io.sockets.sockets.get(p1)?.data.character;
  const char2 = io.sockets.sockets.get(p2)?.data.character;

  let winnerCharacter = null;

  if (winner === p1) winnerCharacter = char1;
  else if (winner === p2) winnerCharacter = char2;

  io.to(roomID).emit("matchEnded", {
    points: r.points,
    winner,
    winnerCharacter
  });

  delete ROOMS[roomID];
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
