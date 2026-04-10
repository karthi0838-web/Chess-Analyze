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
  const [screen, setScreen] = useState("welcome");

  const engineRef = useRef(null);

  useEffect(() => {
    const engine = new Worker(
      "https://cdn.jsdelivr.net/npm/stockfish/stockfish.js"
    );
    engine.postMessage("uci");
    engineRef.current = engine;
  }, []);

  // ✅ SAFE ANALYZE
  const analyze = (fen) =>
    new Promise((resolve) => {
      if (!engineRef.current) return resolve({ eval: 0, best: null });

      let evalCp = 0;
      let best = null;

      const handler = (e) => {
        const line = e.data;

        if (line.includes("score cp")) {
          evalCp = parseInt(line.match(/score cp (-?\d+)/)?.[1] || 0);
        }

        if (line.includes("bestmove")) {
          best = line.split(" ")[1];
          engineRef.current.removeEventListener("message", handler);
          resolve({ eval: evalCp / 100, best });
        }
      };

      engineRef.current.addEventListener("message", handler);
      engineRef.current.postMessage(`position fen ${fen}`);
      engineRef.current.postMessage("go depth 10");
    });

  // ✅ ANALYSIS
  const runAnalysis = async (movesList) => {
    const chess = new Chess();
    let res = [];

    for (let m of movesList) {
      chess.move(m);
      const data = await analyze(chess.fen());

      res.push({
        move: m,
        eval: data.eval || 0,
        best: data.best || null,
      });
    }

    setAnalysis(res);
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
    for (let i = 0; i < index; i++) {
      chess.move(moves[i]);
    }
    return chess.fen();
  };

  const next = () => setIndex((i) => Math.min(i + 1, moves.length));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  // ✅ SAFE CURRENT
  const current = analysis[index] || { eval: 0, best: null };

  // ✅ SAFE ARROWS
  const arrows = current.best
    ? [[current.best.slice(0, 2), current.best.slice(2, 4), "green"]]
    : [];

  // 🎯 UI

  if (screen === "welcome") {
    return (
      <div style={{ padding: 20 }}>
        <h2>Enter Chess.com ID</h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button onClick={fetchGames}>Fetch</button>
      </div>
    );
  }

  if (screen === "games") {
    return (
      <div>
        {games.map((g, i) => (
          <div key={i} onClick={() => loadGame(g.pgn)}>
            {g.white.username} vs {g.black.username}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <Chessboard position={getFen()} customArrows={arrows} />

      <h3>Eval: {(current.eval || 0).toFixed(2)}</h3>

      <button onClick={prev}>⬅</button>
      <button onClick={next}>➡</button>
    </div>
  );
        }
