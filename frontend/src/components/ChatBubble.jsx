import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendChat } from "../api/client.js";
import { HeatmapChart } from "./Charts.jsx";

const WELCOME_WITH_GAME = "Salut ! Je suis ton coach Rocket League. En quoi puis-je t'aider pour ce match ?";
// The question "what do you want to see?" follows as buttons, so the greeting does not ask anything.
const welcomeForPlayer = (name) => `Salut ${name} ! Je suis ton coach Rocket League.`;
const WELCOME_WITHOUT_GAME =
  "Salut ! Je suis ton coach Rocket League. Importe un replay pour une analyse chiffrée, ou pose-moi une question sur ton jeu.";
const QUESTION_PLAYER = "Quel est ton pseudo ?";
const QUESTION_GOAL = "Que veux-tu voir ?";
const GOAL_OPTIONS = ["Stats de match", "Axes d'amélioration"];

export default function ChatBubble({ hidden = false, gameId, players, selectedPlayer }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [chosenPlayer, setChosenPlayer] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, loading, error, open, pending]);

  // A new game starts a new conversation.
  useEffect(() => {
    setMessages([]);
    setPending(null);
    setChosenPlayer(null);
    setError(null);
  }, [gameId]);

  // Another player picked in the statistics page before any message: the questions below must be rebuilt.
  useEffect(() => {
    if (messages.length === 0) setPending(null);
  }, [selectedPlayer]);

  // Opening the chat on a game: ask the goal right away, preceded by the pseudo if the player is unknown.
  useEffect(() => {
    if (!open || !gameId || messages.length > 0 || pending) return;
    const goalStep = { question: QUESTION_GOAL, options: GOAL_OPTIONS };
    if (selectedPlayer ?? chosenPlayer) {
      setPending({ steps: [goalStep], answers: [] });
    } else if (players?.length) {
      setPending({ steps: [{ question: QUESTION_PLAYER, options: players }, goalStep], answers: [] });
    }
  }, [open, gameId, selectedPlayer, chosenPlayer, messages.length, pending, players]);

  const canSend = draft.trim() !== "" && !loading;

  async function send(text, player = chosenPlayer) {
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setPending(null);
    setError(null);
    setLoading(true);
    try {
      const history = next.map(({ role, content }) => ({ role, content }));
      const data = await sendChat(history, gameId ?? null, selectedPlayer ?? player ?? null);
      setMessages([...next, { role: "assistant", content: data.reply, heatmaps: data.heatmaps ?? [] }]);
      if (data.prompt?.steps?.length) setPending({ steps: data.prompt.steps, answers: [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    send(text);
  }

  function handleChoice(option) {
    if (!pending || loading) return;
    const answers = [...pending.answers, option];
    if (answers.length < pending.steps.length) {
      setPending({ ...pending, answers });
      return;
    }
    if (answers.length === 1) {
      // The player is already known: only the goal was asked.
      send(`Je veux voir : ${answers[0].toLowerCase()}.`);
      return;
    }
    setChosenPlayer(answers[0]);
    send(`Mon pseudo est « ${answers[0]} ». Je veux voir : ${answers[1].toLowerCase()}.`, answers[0]);
  }

  const currentStep = pending ? pending.steps[pending.answers.length] : null;
  // The player picked in the statistics page, or chosen with the buttons of the chat.
  const playerName = selectedPlayer ?? chosenPlayer;

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  // Hidden (e.g. on the home page) but still mounted, so the conversation survives navigation.
  if (hidden) return null;

  return (
    <div className="chat">
      {open && (
        <section className="chat-panel" aria-label="Discussion avec le coach">
          <div className="chat-header">
            <h2 className="title chat-title">Coach IA</h2>
            <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="Fermer la discussion">
              ×
            </button>
          </div>
          <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Messages">
            <p className="chat-message chat-message-assistant">{gameId ? (playerName ? welcomeForPlayer(playerName) : WELCOME_WITH_GAME) : WELCOME_WITHOUT_GAME}</p>
            {messages.map((message, index) =>
              message.role === "assistant" ? (
                <div key={index} className="chat-message chat-message-assistant chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  {message.heatmaps?.map((item) => (
                    <HeatmapChart key={item.player} player={item.player} team={item.team} heatmap={item.heatmap} />
                  ))}
                </div>
              ) : (
                <p key={index} className={`chat-message chat-message-${message.role}`}>
                  {message.content}
                </p>
              )
            )}
            {currentStep && !loading && (
              <div className="chat-choices" role="group" aria-label={currentStep.question}>
                <p className="chat-choices-question">{currentStep.question}</p>
                {currentStep.options.map((option) => (
                  <button key={option} type="button" className="chat-choice" onClick={() => handleChoice(option)}>
                    {option}
                  </button>
                ))}
              </div>
            )}
            {loading && <p className="chat-message chat-message-assistant chat-loading">Le coach réfléchit…</p>}
          </div>
          {error && <p className="alert" role="alert">{error}</p>}
          <div className="chat-form">
            <input
              type="text"
              className="chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={2000}
              placeholder="Écris ta question…"
              aria-label="Ton message"
            />
            <button type="button" className="chat-send" onClick={handleSend} disabled={!canSend}>
              Envoyer
            </button>
          </div>
        </section>
      )}
      <button
        type="button"
        className="chat-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Fermer le coach IA" : "Ouvrir le coach IA"}
        aria-expanded={open}
      >
        <span aria-hidden="true">{open ? "×" : "💬"}</span>
      </button>
    </div>
  );
}
