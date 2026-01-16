import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { db, AppSettings, initializeSettings } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { PRACTICE_TOPICS } from '@/lib/practiceTopics';

export default function SettingsPracticeAdminTopicLocks() {
  const navigate = useNavigate();

  const settings = useLiveQuery(() => db.settings.get('1'), [], null as any);
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (settings === undefined) return;
    if (!settings) void initializeSettings();
  }, [settings]);

  const handleUpdateSettings = async (updates: Partial<AppSettings>) => {
    if (!localSettings) return;
    const newSettings = { ...localSettings, ...updates };
    setLocalSettings(newSettings);

    try {
      await db.settings.update('1', updates);
      toast.success('Settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
      console.error(error);
    }
  };

  if (!localSettings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/settings/practice-admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-foreground">Topic Locks</h1>
          </div>
          <p className="text-muted-foreground mt-2">Lock or unlock individual practice topics for students.</p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Lock className="h-5 w-5 text-primary mt-0.5" />
          <div className="min-w-0">
            <div className="text-lg font-semibold">Topics</div>
            <div className="text-sm text-muted-foreground mt-1">
              Toggle a topic to make it available/unavailable in Practice.
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {PRACTICE_TOPICS.map((t) => {
            const locked = !!(localSettings?.practiceTopicLocks as any)?.[t.id];
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{t.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{locked ? 'Locked' : 'Open'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!locked}
                    onCheckedChange={async (checked) => {
                      const nextLocks = { ...(localSettings.practiceTopicLocks ?? {}) } as any;
                      nextLocks[t.id] = !checked;
                      await handleUpdateSettings({ practiceTopicLocks: nextLocks });
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
