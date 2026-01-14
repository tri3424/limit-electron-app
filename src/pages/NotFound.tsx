import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { HOME_ROUTE } from "@/constants/routes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Home, ArrowLeft, Search } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="w-full py-10">
      <Card className="max-w-xl mx-auto p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Search className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-muted-foreground">404</div>
            <div className="text-xl font-semibold">Page not found</div>
            <div className="text-sm text-muted-foreground mt-1">
              The page you’re looking for doesn’t exist or has been moved.
            </div>
            <div className="mt-3">
              <div className="text-xs text-muted-foreground">Requested path</div>
              <div className="mt-1 text-sm font-mono bg-muted/50 px-3 py-2 rounded-md break-all">
                {location.pathname}
              </div>
            </div>
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <Button onClick={() => navigate(HOME_ROUTE)} className="w-full sm:w-auto">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Button>
              <Button onClick={() => navigate(-1)} variant="outline" className="w-full sm:w-auto">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default NotFound;
