      import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard"; // ✅ FIXED IMPORT
import { Chess } from "chess.js";
import axios from "axios";

export default function App() {
  const [screen, setScreen] = useState("welcome");
  const [username, setUsername] = useState("");
  const [games, setGames] = useState([]);
  const [game, setGame] = useState(new Chess());
  const [evalScore, setEvalScore] = useState(0);
  const [review, setReview] = useState([]);

  const engineRef = useRef(null);

  // 🔧 Stockfish setup
  useEffect(() => {
    const engine = new Worker(
      "https://cdn.jsdelivr.net/npm/stockfish/stockfish.js"
    );

    engine.postMessage("uci");
    engine.postMessage("setoption name Threads value 2");

    engine.onmessage = (e) => {
      const line = e.data;
      if (line.includes("score cp")) {
        const val = parseInt(line.match(/score cp (-?\d+)/)?.[1] || 0);
        setEvalScore(val / 100);
      }
    };

    engineRef.current = engine;
  }, []);

  // 🔍 Analyze position
  const analyze = (fen) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.postMessage(`position fen ${fen}`);
    engine.postMessage("go movetime 700");
  };

  // 🌐 Fetch games from Chess.com
  const fetchGames = async () => {
    try {
      const res = await axios.get(
        `https://api.chess.com/pub/player/${username}/games/archives`
      );

      const latest = res.data.archives.slice(-1)[0];
      const gamesRes = await axios.get(latest);

      setGames(gamesRes.data.games);
      setScreen("games");
    } catch (err) {
      alert("Failed to fetch games. Check username.");
    }
  };

  // ♟ Load selected game
  const loadGame = (pgn) => {
    const newGame = new Chess();
    newGame.loadPgn(pgn);
    setGame(newGame);
    setScreen("analysis");
    runReview(newGame);
  };

  // 📊 Analyze full game
  const runReview = async (fullGame) => {
    const temp = new Chess();
    setReview([]);

    for (let move of fullGame.history()) {
      temp.move(move);
      analyze(temp.fen());

      await new Promise((r) => setTimeout(r, 700));

      setReview((prev) => [
        ...prev,
        { move, eval: evalScore.toFixed(2) },
      ]);
    }
  };

  // 🟢 Welcome Screen
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

  // 🟡 Game Selection Screen
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

  // 🔴 Analysis Screen
  return (
    <div className="layout">
      <div className="board">
        <Chessboard position={game.fen()} />
      </div>

      <div className="sidebar">
        <h3>Evaluation</h3>

        <div className="evalbar">
          <div
            className="fill"
            style={{ height: `${50 + evalScore * 10}%` }}
          />
        </div>

        <p>{evalScore.toFixed(2)}</p>

        <h4>Game Review</h4>
        {review.map((r, i) => (
          <div key={i}>
            {r.move} ({r.eval})
          </div>
        ))}
      </div>
    </div>
  );
                        }
