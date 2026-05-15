import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";

const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/login"));
const Home = lazy(() => import("@/pages/home"));
const PlayerPage = lazy(() => import("@/pages/player"));
const VodPlayerPage = lazy(() => import("@/pages/vod-player"));
const AdminPanel = lazy(() => import("@/pages/admin"));
const SubadminPanel = lazy(() => import("@/pages/subadmin"));
const MovieDetail = lazy(() => import("@/pages/movie-detail"));
const SeriesDetail = lazy(() => import("@/pages/series-detail"));
const MiniPlayer = lazy(() =>
  import("@/components/MiniPlayer").then((m) => ({ default: m.MiniPlayer }))
);
const TvKeyboard = lazy(() =>
  import("@/components/TvKeyboard").then((m) => ({ default: m.TvKeyboard }))
);

setAuthTokenGetter(() => {
  const path = window.location.pathname;
  if (path.includes('/admin') || path.includes('/subadmin')) {
    return getToken("admin") ?? getToken("subadmin") ?? null;
  }
  return getToken("user") ?? null;
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/home" component={Home} />
      <Route path="/player" component={PlayerPage} />
      <Route path="/vod-player" component={VodPlayerPage} />
      <Route path="/pelicula/:id" component={MovieDetail} />
      <Route path="/serie/:id" component={SeriesDetail} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/subadmin" component={SubadminPanel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Suspense fallback={null}>
            <Router />
            <MiniPlayer />
          </Suspense>
        </WouterRouter>
        <Suspense fallback={null}>
          <TvKeyboard />
        </Suspense>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
