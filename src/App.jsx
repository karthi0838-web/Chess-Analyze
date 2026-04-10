import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import axios from "axios";

// --- helpers ---
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const logistic = (x) => 1 / (1 + Math.exp(-x / 2.2)); // smoother win-prob

function classify(delta) {
  // delta = drop in eval (from side to move perspective)
  if (delta < 0.3) return "best";
  if (delta < 0.8) return "good";
  if (delta < 1.5) return "inaccuracy";
  if (delta < 3) return "mistake";
  return "blunder";
}

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [username, setUsername] = useState("");
  const [games, setGames] = useState([]);

  const [baseGame, setBaseGame] = useState(new Chess()); // full game
  const [moves, setMoves] = useState([]); // SAN moves
  const [index, setIndex] = useState(0); // current ply index
  const [position, setPosition] = useState(new Chess()); // current position

  const [evals, setEvals] = useState([]); // per-move eval
  const [classes, setClasses] = useState([]); // per-move classification
  const [bestMoves, setBestMoves] = useState([]); // per-move best move (uci)
  const [accuracy, setAccuracy] = useState(0);

  const [currentEval, setCurrentEval] = useState(0);
  const engineRef = useRef(null);

  // --- Stockfish (safe) ---
  useEffect(() => {
    try {
      const w = new Worker(
        "https://cdn.jsdelivr.net/npm/stockfish/stockfish.js"
      );
      w.postMessage("uci");
      w.postMessage("setoption name Threads value 1");

      w.onmessage = (e) => {
        const line = e.data;

        // live eval for current position
        if (line.includes("score cp")) {
          const v = parseInt(line.match(/score cp (-?\d+)/)?.[1] || 0);
          setCurrentEval(v / 100);
        }
      };

      engineRef.current = w;
    } catch {
      console.log("Worker not supported");
    }
  }, []);

  // --- analyze one position (returns eval + best move) ---
  const analyzeOnce = (fen, movetime = 700) =>
    new Promise((resolve) => {
      const engine = engineRef.current;
      if (!engine) return resolve({ eval: 0, best: null });

      let best = null;
      let evalCp = 0;

      const handler = (e) => {
        const line = e.data;

        if (line.startsWith("info") && line.includes("score cp")) {
          const v = parseInt(line.match(/score cp (-?\d+)/)?.[1] || 0);
          evalCp = v;
        }

        if (line.startsWith("bestmove")) {
          best = line.split(" ")[1];
          engine.removeEventListener("message", handler);
          resolve({ eval: evalCp / 100, best });
        }
      };

      engine.addEventListener("message", handler);
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go movetime ${movetime}`);
    });

  // --- fetch games ---
  const fetchGames = async () => {
    try {
      const res = await axios.get(
        `https://api.chess.com/pub/player/${username}/games/archives`
      );
      const latest = res.data.archives.slice(-1)[0];
      const gamesRes = await axios.get(latest);
      setGames(gamesRes.data.games);
      setScreen("games");
    } catch {
      alert("Invalid username / network");
    }
  };

  // --- load game ---
  const loadGame = (pgn) => {
    const g = new Chess();
    g.loadPgn(pgn);
    const hist = g.history();

    setBaseGame(g);
    setMoves(hist);
    setIndex(0);

    const start = new Chess();
    setPosition(start);

    setEvals([]);
    setClasses([]);
    setBestMoves([]);
    setAccuracy(0);

    setScreen("analysis");

    // kick off background review
    reviewGame(hist);
  };

  // --- build position up to index ---
  const buildPosition = (idx) => {
    const t = new Chess();
    for (let i = 0; i < idx; i++) t.move(moves[i]);
    return t;
  };

  // --- navigation ---
  const goTo = (idx) => {
    const i = clamp(idx, 0, moves.length);
    setIndex(i);
    const pos = buildPosition(i);
    setPosition(pos);

    // live eval for this position
    const engine = engineRef.current;
    if (engine) {
      engine.postMessage(`position fen ${pos.fen()}`);
      engine.postMessage("go movetime 400");
    }
  };

  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1);

  // --- background review (evals + best moves + classes + accuracy) ---
  const reviewGame = async (hist) => {
    const t = new Chess();
    const e = [];
    const b = [];
    const c = [];

    // initial position eval
    const first = await analyzeOnce(t.fen(), 600);
    e.push(first.eval);
    b.push(first.best);

    for (let i = 0; i < hist.length; i++) {
      t.move(hist[i]);

      const { eval: ev, best } = await analyzeOnce(t.fen(), 700);
      e.push(ev);
      b.push(best);

      // classify move by drop from previous ply
      const prevEval = e[i]; // before move
      const curEval = ev; // after move

      // flip sign for side-to-move perspective
      const drop = Math.max(0, prevEval - curEval);
      c.push(classify(drop));
    }

    setEvals(e);
    setBestMoves(b);
    setClasses(c);

    // accuracy (logistic, chess.com-like)
    let total = 0;
    for (let i = 1; i < e.length; i++) {
      const p1 = logistic(e[i - 1]);
      const p2 = logistic(e[i]);
      const loss = Math.max(0, p1 - p2); // probability drop
      total += loss;
    }
    const acc = clamp(100 - total * 100, 0, 100);
    setAccuracy(acc.toFixed(1));
  };

  // --- arrow for best move at current index ---
  const arrows = (() => {
    const best = bestMoves[index];
    if (!best || best.length < 4) return [];
    const from = best.slice(0, 2);
    const to = best.slice(2, 4);
    return [[from, to, "rgba(0,200,0,0.7)"]]; // green
  })();

  // --- UI screens ---
  if (screen === "welcome") {
    return (
      <div className="center">
        <h2>Welcome 👋</h2>
        <p>Enter your Chess.com ID</p>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button onClick={fetchGames}>Fetch Games</button>
      </div>
    );
  }

  if (screen === "games") {
    return (
      <div className="container">
        <h3>Select Game</h3>
        {games.map((g, i) => (
          <div key={i} onClick={() => loadGame(g.pgn)} className="card">
            {g.white.username} vs {g.black.username}
          </div>
        ))}
      </div>
    );
  }

  // --- analysis UI ---
  return (
    <div className="layout">
      <div className="board">
        <Chessboard
          position={position.fen()}
          boardWidth={Math.min(window.innerWidth - 20, 420)}
          customArrows={arrows}
        />

        <div className="controls">
          <button onClick={prev}>⏮</button>
          <span>
            {index}/{moves.length}
          </span>
          <button onClick={next}>⏭</button>
        </div>
      </div>

      <div className="sidebar">
        <h3>Evaluation</h3>

        <div className="evalbar">
          <div
            className="fill"
            style={{ height: `${50 + currentEval * 10}%` }}
          />
        </div>

        <p>{currentEval.toFixed(2)}</p>

        <h4>Accuracy: {accuracy}%</h4>

        {/* 📈 graph */}
        <div className="graph">
          {evals.map((v, i) => (
            <div
              key={i}
              className="bar"
              style={{
                height: `${50 + v * 8}%`,
                background:
                  classes[i - 1] === "blunder"
                    ? "red"
                    : classes[i - 1] === "mistake"
                    ? "orange"
                    : "lime",
              }}
            />
          ))}
        </div>

        <h4>Game Review</h4>
        {moves.map((m, i) => (
          <div
            key={i}
            className={`move ${classes[i] || ""} ${
              i === index - 1 ? "active" : ""
            }`}
            onClick={() => goTo(i + 1)}
          >
            {m} ({evals[i + 1]?.toFixed(2) || "..."})
          </div>
        ))}
      </div>
    </div>
  );
            }
