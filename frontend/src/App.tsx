import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
// The landing page is the first screen most visitors see: ship it in the main
// bundle instead of paying for a second round trip.
import LandingPage from './pages/LandingPage';

const AuthPage = lazy(() => import('./pages/AuthPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const NewEventPage = lazy(() => import('./pages/NewEventPage'));
const EventDashboardPage = lazy(() => import('./pages/EventDashboardPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense
          fallback={
            <div className="route-loading" role="status">
              Loading page…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/new" element={<NewEventPage />} />
              <Route path="/events/:id" element={<EventDashboardPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
