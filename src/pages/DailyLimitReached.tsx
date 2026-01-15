import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Home, Calendar } from 'lucide-react';
import { db } from '@/lib/db';
import { checkDailyLimit } from '@/lib/dailyLimit';
import { useAuth } from '@/contexts/AuthContext';
import { HOME_ROUTE } from '@/constants/routes';

export default function DailyLimitReached() {
  const navigate = useNavigate();
  const { moduleId } = useParams();
  const module = useLiveQuery(() => moduleId ? db.modules.get(moduleId) : undefined, [moduleId]);
  const [limitInfo, setLimitInfo] = useState<{ current: number; limit: number } | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (moduleId) {
      checkDailyLimit(moduleId, user?.id).then(info => {
        setLimitInfo({ current: info.current, limit: info.limit });
      });
    }
  }, [moduleId, user?.id]);

  return (
    <div className="flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full p-8 text-center space-y-6">
        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">
              Daily Limit Reached
            </h1>
            {module && (
              <p className="text-sm font-medium text-muted-foreground">
                {module.title}
              </p>
            )}
            <p className="text-muted-foreground">
              You have reached your daily limit, please come back tomorrow for more.
            </p>
            {limitInfo && (
              <p className="text-sm text-muted-foreground">
                You've completed {limitInfo.current} of {limitInfo.limit} questions today.
              </p>
            )}
          </div>
        </div>
        
        <div className="pt-4">
          <Button
            onClick={() => navigate(HOME_ROUTE)}
            className="w-full"
            size="lg"
          >
            <Home className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </Card>
    </div>
  );
}
