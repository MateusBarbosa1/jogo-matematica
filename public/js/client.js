const socket = io();

const chooseScreen = document.getElementById("choose-screen");
const waitingScreen = document.getElementById("waiting-screen");
const gameScreen = document.getElementById("game-screen");

const waitingInfo = document.getElementById("waiting-info");
const timerEl = document.getElementById("timer");
const scoreEl = document.getElementById("score");
const qText = document.getElementById("question-text");
const choicesEl = document.getElementById("choices");
const endBox = document.getElementById("end-box");
const btnNext = document.getElementById("btn-next");

let currentRoom = null;
let myPoints = 0;
let remotePoints = 0;
let timeLeft = 120;
let myId = null;
let opponentId = null;
let localIndex = 0;
let answeredIndices = new Set();

document.querySelectorAll(".player").forEach(p => {
  p.addEventListener("click", () => {
    const char = p.dataset.char;
    socket.emit("joinQueue", { character: char });
    chooseScreen.style.display = "none";
    waitingScreen.style.display = "block";
    waitingInfo.innerText = "Procurando outro jogador...";
  });
});

socket.on("waiting", () => {
  waitingInfo.innerText = "Aguardando jogadores na fila...";
});

socket.on("matchFound", data => {
  currentRoom = data.room;
  waitingScreen.style.display = "none";
  gameScreen.style.display = "block";
  myId = socket.id;

  // find opponent id
  const other = data.players.find(pl => pl.id !== myId);
  opponentId = other ? other.id : null;

  myPoints = 0;
  remotePoints = 0;
  updateScore();

  // start timer
  timeLeft = data.time || 120;
  updateTimerDisplay();
  startLocalTimer();

  // request first question
  requestQuestion();
});

socket.on("question", ({ index, q, choices }) => {
  // show question
  qText.innerText = q;
  choicesEl.innerHTML = "";
  choices.forEach(c => {
    const btn = document.createElement("button");
    btn.innerText = c;
    btn.onclick = () => {
      // send answer to server
      socket.emit("answer", { room: currentRoom, index, answer: c });
      answeredIndices.add(index);
      // immediate local feedback
      btn.style.background = "#ddd";
      // after answering, request next question
      setTimeout(requestQuestion, 250);
    };
    choicesEl.appendChild(btn);
  });
});

socket.on("scoreUpdate", points => {
  myPoints = points[socket.id] || 0;
  const otherId = Object.keys(points).find(id => id !== socket.id);
  remotePoints = points[otherId] || 0;
  updateScore();
});

socket.on("playerDisconnected", data => {
  endBox.style.display = "block";
  endBox.innerHTML = "<h3>Oponente desconectou. Você venceu por W.O.</h3>";
  gameScreen.style.display = "none";
});

socket.on("matchEnded", data => {
  // Salva o resultado inteiro para a próxima página
  localStorage.setItem("matchResult", JSON.stringify({
      points: data.points,
      winner: data.winner,
      winnerCharacter: data.winnerCharacter
  }));

  // Redireciona
  window.location.href = "/victory.html";
});

function requestQuestion() {
  if (!currentRoom) return;
  socket.emit("requestQuestion", { room: currentRoom });
}

function updateScore() {
  scoreEl.innerText = `Você: ${myPoints} | Oponente: ${remotePoints}`;
}

function updateTimerDisplay() {
  const m = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const s = String(timeLeft % 60).padStart(2, "0");
  timerEl.innerText = `${m}:${s}`;
}

let timerInterval = null;
function startLocalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      // wait for server to send matchEnded
    }
  }, 1000);
}
