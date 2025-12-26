import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashRouter, RouterProvider, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Questions from "./pages/Questions";
import CreateQuestion from "./pages/CreateQuestion";
import Settings from "./pages/Settings";
import ModulesPage from "./pages/Modules";
import NotFound from "./pages/NotFound";
import { initializeSettings } from "./lib/db";
import ModuleCreator from "./pages/ModuleCreator";
import ModuleEditor from "./pages/ModuleEditor";
import ModuleRunner from "./pages/ModuleRunner";
import DailyLimitReached from "./pages/DailyLimitReached";
import { CHAT_ROUTE, HOME_ROUTE, LOGIN_ROUTE } from "./constants/routes";
import { setupCodeBlockCopy } from "./utils/codeBlockCopy";
import { startSemanticBackgroundQueue } from "./lib/semanticQueue";
import Chat from "./pages/Chat";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Initialize database only (no demo data seeding)
    initializeSettings();
    // Setup code block copy functionality
    setupCodeBlockCopy();
    // Start offline semantic analysis in the background (CPU-throttled)
    startSemanticBackgroundQueue();
  }, []);

  const router = createHashRouter([
    {
      path: LOGIN_ROUTE,
      element: <Login />,
    },
    {
      path: "/login",
      element: <Navigate to={LOGIN_ROUTE} replace />,
    },
    {
      path: HOME_ROUTE,
      element: (
        <ProtectedRoute>
          <Layout>
            <Home />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/questions",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <Questions />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/questions/create",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <CreateQuestion />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/questions/edit/:id",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <CreateQuestion />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/modules",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <ModulesPage />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/modules/new",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <ModuleCreator />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/modules/:id/edit",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <ModuleEditor />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/module/:id",
      element: (
        <ProtectedRoute>
          <Layout>
            <ModuleRunner />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/settings",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <Settings />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: CHAT_ROUTE,
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <Chat />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/daily-limit/:moduleId",
      element: (
        <ProtectedRoute>
          <Layout>
            <DailyLimitReached />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "*",
      element: (
        <Layout>
          <NotFound />
        </Layout>
      ),
    },
  ]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
