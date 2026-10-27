import { Link } from 'react-router-dom';
import { PageShell } from '../components/layout/PageShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <PageShell>
      <section className="state">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>The page you requested does not exist.</p>
        <Link className="button" to="/">
          Return home
        </Link>
      </section>
    </PageShell>
  );
}
