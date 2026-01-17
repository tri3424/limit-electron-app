import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { db, AppSettings, initializeSettings } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { PRACTICE_TOPICS } from '@/lib/practiceTopics';

export default function SettingsPracticeAdminTopicLocks() {
  const navigate = useNavigate();

  const settings = useLiveQuery(() => db.settings.get('1'), [], null as any);
  const users = useLiveQuery(() => db.users.toArray()) || [];
  const [localSettings, setLocalSettings] = useState<AppSettings | null>(null);
  const [userKey, setUserKey] = useState<string>('');

  const NO_USER = '__none__';

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

  const userLocksAll = (localSettings as any).practiceTopicLocksByUserKey ?? {};
  const userLocks = (userKey ? userLocksAll?.[userKey] : null) ?? {};

  const userHiddenAll = (localSettings as any).practiceTopicHiddenByUserKey ?? {};
  const userHidden = (userKey ? userHiddenAll?.[userKey] : null) ?? {};

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
              You can lock or hide topics for everyone (Global), and also apply additional rules for a specific user.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>User</Label>
            <Select value={userKey || NO_USER} onValueChange={(v) => setUserKey(v === NO_USER ? '' : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select user (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_USER}>No user selected</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              Global locks affect everyone. User locks apply only to the selected user.
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {PRACTICE_TOPICS.map((t) => {
            const globalLocked = !!(localSettings?.practiceTopicLocks as any)?.[t.id];
            const perUserLocked = !!(userLocks as any)?.[t.id];
            const effectiveLocked = globalLocked || perUserLocked;

            const globalHidden = !!(localSettings?.practiceTopicHidden as any)?.[t.id];
            const perUserHidden = !!(userHidden as any)?.[t.id];
            const effectiveHidden = globalHidden || perUserHidden;
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-3">
                <div className="min-w-0">
                  <div className="font-medium text-foreground">{t.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {effectiveHidden ? 'Hidden' : effectiveLocked ? 'Locked' : 'Open'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-[10px] text-muted-foreground">Global</div>
                    <Switch
                      checked={!globalLocked}
                      onCheckedChange={async (checked) => {
                        const nextLocks = { ...(localSettings.practiceTopicLocks ?? {}) } as any;
                        nextLocks[t.id] = !checked;
                        await handleUpdateSettings({ practiceTopicLocks: nextLocks });
                      }}
                    />
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="text-[10px] text-muted-foreground">Global hide</div>
                    <Switch
                      checked={!globalHidden}
                      onCheckedChange={async (checked) => {
                        const nextHidden = { ...((localSettings as any).practiceTopicHidden ?? {}) } as any;
                        nextHidden[t.id] = !checked;
                        await handleUpdateSettings({ practiceTopicHidden: nextHidden } as any);
                      }}
                    />
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="text-[10px] text-muted-foreground">User</div>
                    <Switch
                      disabled={!userKey}
                      checked={!perUserLocked}
                      onCheckedChange={async (checked) => {
                        if (!userKey) return;
                        const nextAll = { ...userLocksAll };
                        const nextUser = { ...(nextAll[userKey] ?? {}) } as any;
                        nextUser[t.id] = !checked;
                        nextAll[userKey] = nextUser;
                        await handleUpdateSettings({ practiceTopicLocksByUserKey: nextAll } as any);
                      }}
                    />
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="text-[10px] text-muted-foreground">User hide</div>
                    <Switch
                      disabled={!userKey}
                      checked={!perUserHidden}
                      onCheckedChange={async (checked) => {
                        if (!userKey) return;
                        const nextAll = { ...userHiddenAll };
                        const nextUser = { ...(nextAll[userKey] ?? {}) } as any;
                        nextUser[t.id] = !checked;
                        nextAll[userKey] = nextUser;
                        await handleUpdateSettings({ practiceTopicHiddenByUserKey: nextAll } as any);
                      }}
                    />
                  </div>

                  <Switch
                    className="hidden"
                    checked
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
