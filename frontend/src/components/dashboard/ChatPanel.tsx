import { useRef, useState, type FormEvent } from 'react';
import { chat } from '../../api/ai';
import type { ChatHistoryItem } from '../../api/types';
import { errorMessage } from '../../utils/format';
import { AiUnavailable } from '../Feedback';

const suggestions = [
  'What should I do this week?',
  'Where can I save money?',
  'Which vendors need attention?',
];

interface DisplayMessage extends ChatHistoryItem {
  id: number;
  fallback?: boolean;
}

export function ChatPanel({ eventId }: { eventId: string }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(true);
  const [announcement, setAnnouncement] = useState({ id: 0, text: '' });
  const nextId = useRef(1);

  const send = async (event?: FormEvent, suggested?: string) => {
    event?.preventDefault();
    const content = (suggested ?? message).trim();
    if (!content || loading) return;
    const history = messages.slice(-10).map(({ role, content: text }) => ({
      role,
      content: text,
    }));
    const userMessage: DisplayMessage = {
      id: nextId.current++,
      role: 'user',
      content,
    };
    setMessages((old) => [...old, userMessage]);
    setMessage('');
    setLoading(true);
    setError('');
    try {
      const result = await chat(eventId, content, history);
      const assistantMessage: DisplayMessage = {
        id: nextId.current++,
        role: 'assistant',
        content: result.reply,
        fallback: !result.aiAvailable,
      };
      setAvailable(result.aiAvailable);
      setMessages((old) => [...old, assistantMessage]);
      setAnnouncement((old) => ({
        id: old.id + 1,
        text: `${result.aiAvailable ? 'Assistant' : 'Planning fallback'} replied: ${result.reply}`,
      }));
    } catch (reason) {
      setMessages((old) => old.filter((item) => item.id !== userMessage.id));
      setMessage(content);
      setError(`${errorMessage(reason)} Your message is ready to retry.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="assistant-title">
      <h2 id="assistant-title">Planning assistant</h2>
      {!available && <AiUnavailable />}
      <div className="suggestions" aria-label="Suggested prompts">
        {suggestions.map((text) => (
          <button
            className="secondary"
            type="button"
            key={text}
            disabled={loading}
            onClick={() => void send(undefined, text)}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="messages" aria-label="Conversation">
        {messages.length === 0 ? (
          <p className="muted">Ask a question about this plan.</p>
        ) : (
          messages.map((item) => (
            <div className={`message ${item.role}`} key={item.id}>
              <strong>
                {item.role === 'user'
                  ? 'You'
                  : item.fallback
                    ? 'Planning fallback'
                    : 'Assistant'}
              </strong>
              <p>{item.content}</p>
            </div>
          ))
        )}
        {loading && <p role="status">Assistant is thinking…</p>}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement.text}
        {announcement.text ? ` Message ${announcement.id}.` : ''}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <form className="chat-form" onSubmit={(event) => void send(event)}>
        <label htmlFor="chat-message">Message</label>
        <textarea
          id="chat-message"
          rows={3}
          maxLength={500}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button disabled={loading || !message.trim()}>Send</button>
      </form>
    </section>
  );
}
