import { useState, type FormEvent } from 'react';
import { generateIdeas } from '../../api/ai';
import type { Idea, IdeaCategory } from '../../api/types';
import { AiUnavailable, ErrorState, Loading } from '../Feedback';
import { currency, errorMessage } from '../../utils/format';
const categories: IdeaCategory[] = [
  'theme',
  'menu',
  'activities',
  'decor',
  'gifts',
];
export function IdeasPanel({
  eventId,
  code,
}: {
  eventId: string;
  code: string;
}) {
  const [category, setCategory] = useState<IdeaCategory>('theme');
  const [notes, setNotes] = useState('');
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const generate = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await generateIdeas(eventId, {
        category,
        ...(notes.trim() ? { extraNotes: notes.trim() } : {}),
      });
      setIdeas(result.ideas);
      setAvailable(result.aiAvailable);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };
  return (
    <section aria-labelledby="ideas-title">
      <h2 id="ideas-title">Ideas</h2>
      <form className="toolbar" onSubmit={(e) => void generate(e)}>
        <div className="field">
          <label htmlFor="idea-category">Category</label>
          <select
            id="idea-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as IdeaCategory)}
          >
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="idea-notes">Notes (optional)</label>
          <input
            id="idea-notes"
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <button disabled={loading}>
          {loading ? 'Generating…' : 'Generate ideas'}
        </button>
      </form>
      {loading ? (
        <Loading>Generating ideas…</Loading>
      ) : error ? (
        <ErrorState message={error} retry={() => void generate()} />
      ) : ideas === null ? (
        <p className="state">
          Choose a category and generate ideas when you’re ready.
        </p>
      ) : (
        <>
          {!available && <AiUnavailable />}
          {ideas.length === 0 ? (
            <p className="state">
              No ideas were returned. Try another category or note.
            </p>
          ) : (
            <div className="card-grid">
              {ideas.map((idea) => (
                <article
                  className="card"
                  key={`${idea.title}-${idea.description}`}
                >
                  <p className="eyebrow">
                    {available ? 'AI-generated idea' : 'Planning suggestion'}
                  </p>
                  <h3>{idea.title}</h3>
                  <p>{idea.description}</p>
                  <p>
                    <strong>Estimated cost:</strong>{' '}
                    {currency(idea.estimatedCost, code)}
                  </p>
                  <p>
                    <strong>Why it fits:</strong> {idea.whyItFits}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
