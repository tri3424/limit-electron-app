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
import { HOME_ROUTE, LOGIN_ROUTE } from "./constants/routes";
import { setupCodeBlockCopy } from "./utils/codeBlockCopy";
import { runDisableAutoFeaturesCleanup } from "./lib/cleanupAutoFeatures";
import SongsAdmin from "./pages/SongsAdmin";
import SongModules from "./pages/SongModules";
import SongModulesAdmin from "./pages/SongModulesAdmin";
import SongModuleRunner from "./pages/SongModuleRunner";
import SongRecognition from "./pages/SongRecognition";
import Practice from "./pages/Practice";
import SettingsPracticeAdmin from "./pages/SettingsPracticeAdmin";
import SettingsPracticeAdminFrequency from "./pages/SettingsPracticeAdminFrequency";
import SettingsPracticeAdminTopicLocks from "./pages/SettingsPracticeAdminTopicLocks";
import SettingsPracticeAdminMixedModules from "./pages/SettingsPracticeAdminMixedModules";
import Scorecard from "./pages/Scorecard";
import SettingsPracticeAdminAnalytics from "./pages/SettingsPracticeAdminAnalytics";
 

const queryClient = new QueryClient();

const MIN_KATEX_SCALE = 0.78;

function setupGlobalKatexAutoFit() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const roByEl = new WeakMap<Element, ResizeObserver>();

  const applyToDisplayContainer = (container: HTMLElement) => {
    if (container.getAttribute('data-tk-autofit') === '1') return;

    const katex = container.querySelector<HTMLElement>('.katex');
    if (!katex) return;

    container.classList.add('tk-math-block');

    let fit = container.querySelector<HTMLElement>(':scope > .tk-math-fit');
    if (!fit) {
      const wrapper = document.createElement('span');
      wrapper.className = 'tk-math-fit';
      wrapper.appendChild(katex);
      container.appendChild(wrapper);
      fit = wrapper;
    }

    const compute = () => {
      container.classList.remove('tk-math-scroll');
      fit!.style.transform = 'scale(1)';

      const cw = container.clientWidth;
      const iw = fit!.scrollWidth;
      if (!cw || !iw) return;
      if (iw <= cw) return;

      const s = Math.min(1, cw / iw);
      if (s >= MIN_KATEX_SCALE) {
        fit!.style.transform = `scale(${s})`;
      } else {
        container.classList.add('tk-math-scroll');
        fit!.style.transform = 'scale(1)';
      }
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(container);
    roByEl.set(container, ro);
    container.setAttribute('data-tk-autofit', '1');
  };

  const scan = (root: ParentNode) => {
    const nodes = root.querySelectorAll<HTMLElement>('.katex-display');
    nodes.forEach((n) => applyToDisplayContainer(n));
  };

  scan(document);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches('.katex-display')) applyToDisplayContainer(node);
        scan(node);
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  return () => {
    mo.disconnect();
    // ResizeObservers will be GC'd via WeakMap.
  };
}

const App = () => {
  useEffect(() => {
    // Initialize database only (no demo data seeding)
    initializeSettings();
    // Setup code block copy functionality
    setupCodeBlockCopy();
    void runDisableAutoFeaturesCleanup();
    const cleanupKatex = setupGlobalKatexAutoFit();
    return () => {
      cleanupKatex?.();
    };
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
      path: "/settings/practice-admin",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <SettingsPracticeAdmin />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/settings/practice-admin/frequency",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <SettingsPracticeAdminFrequency />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/settings/practice-admin/topic-locks",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <SettingsPracticeAdminTopicLocks />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/settings/practice-admin/mixed-modules",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <SettingsPracticeAdminMixedModules />
          </Layout>
        </ProtectedRoute>
      ),
    },
		{
			path: "/settings/practice-admin/analytics",
			element: (
				<ProtectedRoute requireAdmin>
					<Layout>
						<SettingsPracticeAdminAnalytics />
					</Layout>
				</ProtectedRoute>
			),
		},
    {
      path: "/songs",
      element: (
        <ProtectedRoute>
          <Layout>
            <SongModules />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/song-recognition",
      element: (
        <ProtectedRoute>
          <Layout>
            <SongRecognition />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/songs-admin",
      element: (
        <ProtectedRoute requireAdmin>
          <Layout>
            <SongsAdmin />
          </Layout>
        </ProtectedRoute>
      ),
    },
		{
			path: "/song-modules-admin",
			element: (
				<ProtectedRoute requireAdmin>
					<Layout>
						<SongModulesAdmin />
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
      path: "/practice",
      element: (
        <ProtectedRoute>
          <Layout>
            <Practice />
          </Layout>
        </ProtectedRoute>
      ),
    },
    {
      path: "/scorecard",
      element: (
        <ProtectedRoute>
          <Layout>
            <Scorecard />
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
