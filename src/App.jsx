import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import axios from "axios";

export default function App() {
  const [username, setUsername] = useState("");
  const [games, setGames] = useState([]);
  const [moves, setMoves] = useState([]);
  const [analysis, setAnalysis] = useState([]);
  const [index, setIndex] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [screen, setScreen] = useState("welcome");
  const [opening, setOpening] = useState("");

  const engineRef = useRef(null);

  useEffect(() => {
    const engine = new Worker(
      "https://cdn.jsdelivr.net/npm/stockfish/stockfish.js"
    );
    engine.postMessage("uci");
    engineRef.current = engine;
  }, []);

  // 🔥 ANALYZE POSITION
  const analyze = (fen) =>
    new Promise((resolve) => {
      const engine = engineRef.current;
      let evalCp = 0;
      let best = null;

      const handler = (e) => {
        const line = e.data;

        if (line.includes("score cp")) {
          evalCp = parseInt(line.match(/score cp (-?\d+)/)?.[1] || 0);
        }

        if (line.includes("bestmove")) {
          best = line.split(" ")[1];
          engine.removeEventListener("message", handler);
          resolve({ eval: evalCp / 100, best });
        }
      };

      engine.addEventListener("message", handler);
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage("go depth 14");
    });

  // 🧠 LOGISTIC ACCURACY
  const logistic = (diff) => 100 / (1 + Math.exp(0.7 * Math.abs(diff)));

  const classify = (diff) => {
    if (Math.abs(diff) > 2) return "Blunder";
    if (Math.abs(diff) > 1) return "Mistake";
    if (Math.abs(diff) > 0.5) return "Inaccuracy";
    return "Best";
  };

  // 📚 OPENING
  const openings = [
    { moves: ["e4", "e5", "Nf3", "Nc6"], name: "Ruy Lopez" },
    { moves: ["d4", "d5", "c4"], name: "Queen's Gambit" },
  ];

  const detectOpening = (moves) => {
    for (let op of openings) {
      if (op.moves.every((m, i) => moves[i] === m)) return op.name;
    }
    return "Unknown Opening";
  };

  // 🚀 FULL ANALYSIS
  const runAnalysis = async (movesList) => {
    const chess = new Chess();
    let res = [];

    for (let m of movesList) {
      chess.move(m);
      const data = await analyze(chess.fen());

      res.push({
        move: m,
        eval: data.eval,
        best: data.best,
      });
    }

    for (let i = 1; i < res.length; i++) {
      const diff = res[i].eval - res[i - 1].eval;
      res[i].type = classify(diff);
    }

    setAnalysis(res);

    const total =
      res.reduce((acc, r, i) => {
        if (i === 0) return acc;
        const diff = r.eval - res[i - 1].eval;
        return acc + logistic(diff);
      }, 0) / res.length;

    setAccuracy(total.toFixed(1));
    setOpening(detectOpening(movesList));
  };

  const fetchGames = async () => {
    const res = await axios.get(
      `https://api.chess.com/pub/player/${username}/games/archives`
    );

    const latest = res.data.archives.slice(-1)[0];
    const gamesRes = await axios.get(latest);

    setGames(gamesRes.data.games);
    setScreen("games");
  };

  const loadGame = (pgn) => {
    const chess = new Chess();
    chess.loadPgn(pgn);

    const movesList = chess.history();

    setMoves(movesList);
    setIndex(0);
    setScreen("analysis");

    runAnalysis(movesList);
  };

  const getFen = () => {
    const chess = new Chess();
    for (let i = 0; i < index; i++) chess.move(moves[i]);
    return chess.fen();
  };

  const next = () => setIndex((i) => Math.min(i + 1, moves.length));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const uci = (m) => ({
    from: m?.slice(0, 2),
    to: m?.slice(2, 4),
  });

  const current = analysis[index] || {};

  // 🎯 UI

  if (screen === "welcome") {
    return (
      <div className="center">
        <h2>Enter Chess.com ID</h2>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
        <button onClick={fetchGames}>Fetch</button>
      </div>
    );
  }

  if (screen === "games") {
    return (
      <div className="list">
        {games.map((g, i) => (
          <div key={i} onClick={() => loadGame(g.pgn)} className="card">
            {g.white.username} vs {g.black.username}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="board-section">
        <Chessboard
          position={getFen()}
          customArrows={[
            current.best && [uci(current.best).from, uci(current.best).to, "green"],
          ].filter(Boolean)}
        />
      </div>

      <div className="panel">
        <h3>{opening}</h3>
        <h2>Accuracy: {accuracy}%</h2>

        <div className="evalbar">
          <div
            className="fill"
            style={{ height: `${50 + (current.eval || 0) * 10}%` }}
          />
        </div>

        <p>{current.eval?.toFixed(2)}</p>

        <div className="graph">
          {analysis.map((m, i) => (
            <div
              key={i}
              style={{
                height: `${50 + m.eval * 12}%`,
                background: m.eval > 0 ? "#22c55e" : "#ef4444",
              }}
            />
          ))}
        </div>

        <div className="moves">
          {analysis.map((m, i) => (
            <div key={i} className={i === index ? "active" : ""}>
              {m.move} - {m.type}
            </div>
          ))}
        </div>
      </div>

      {/* 🔥 FLOATING CONTROLS */}
      <div className="controls">
        <button onClick={prev}>⏮</button>
        <button onClick={prev}>◀</button>
        <button onClick={next}>▶</button>
        <button onClick={next}>⏭</button>
      </div>
    </div>
  );
}
