import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Shield, Sliders, Lock, Layers, BarChart3 } from 'lucide-react';

export default function SettingsPracticeAdmin() {
  const navigate = useNavigate();

  return (
    <div className="max-w-6xl mx-auto space-y-8 px-4 md:px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Practice Admin</h1>
          </div>
          <p className="text-muted-foreground mt-2 leading-relaxed">
            Advanced practice configuration for admins.
          </p>
        </div>
      </div>

      <Card className="p-6 rounded-2xl shadow-sm border-border/70 bg-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 rounded-xl border bg-gradient-to-br from-muted/40 to-background p-2.5 shadow-sm">
            <Shield className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold tracking-tight">Tools</div>
              <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Open a tool page. This area only contains practice admin settings.
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-5" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link to="/settings/practice-admin/frequency" className="block">
            <Card className="p-4 rounded-xl border-border/70 hover:bg-muted/20 hover:shadow-sm hover:-translate-y-0.5 transition-all">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl border bg-background p-2.5 shadow-sm">
                  <Sliders className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">Frequency Controls</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Weight variants per user and mixed-module items.
                  </div>
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/settings/practice-admin/topic-locks" className="block">
            <Card className="p-4 rounded-xl border-border/70 hover:bg-muted/20 hover:shadow-sm hover:-translate-y-0.5 transition-all">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl border bg-background p-2.5 shadow-sm">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">Topic Locks</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Lock/unlock individual practice topics.
                  </div>
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/settings/practice-admin/mixed-modules" className="block">
            <Card className="p-4 rounded-xl border-border/70 hover:bg-muted/20 hover:shadow-sm hover:-translate-y-0.5 transition-all">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl border bg-background p-2.5 shadow-sm">
                  <Layers className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">Mixed Modules</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Create modules combining multiple topics/difficulties.
                  </div>
                </div>
              </div>
            </Card>
          </Link>

          <Link to="/settings/practice-admin/analytics" className="block">
            <Card className="p-4 rounded-xl border-border/70 hover:bg-muted/20 hover:shadow-sm hover:-translate-y-0.5 transition-all">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl border bg-background p-2.5 shadow-sm">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">Analytics</div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Daily performance and question timelines.
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        </div>
      </Card>
    </div>
  );
}
