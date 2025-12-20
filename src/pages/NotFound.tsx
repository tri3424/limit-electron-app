import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { HOME_ROUTE } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Search } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
      <div className="text-center space-y-6 max-w-md w-full">
        <div className="space-y-4">
          <div className="relative inline-block">
            <h1 className="text-9xl font-bold text-primary/20 select-none">404</h1>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
                <Search className="w-12 h-12 text-destructive/40" />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-foreground">Page Not Found</h2>
            <p className="text-muted-foreground">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <p className="text-sm text-muted-foreground font-mono bg-muted/50 px-3 py-1 rounded-md inline-block">
              {location.pathname}
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-4">
          <Button
            onClick={() => navigate(HOME_ROUTE)}
            className="w-full sm:w-auto"
            size="lg"
          >
            <Home className="mr-2 h-4 w-4" />
            Go to Home
          </Button>
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="w-full sm:w-auto"
            size="lg"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
