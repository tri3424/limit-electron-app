import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookText, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { db, normalizeDictionaryWord } from '@/lib/db';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import RichTextEditor from '@/components/RichTextEditor';
import { toast } from 'sonner';

export default function CustomDictionary() {
  const entries = useLiveQuery(
    () => db.customDictionary.orderBy('updatedAt').reverse().toArray(),
    [],
    [],
  );

  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = entries ?? [];
    if (!q) return list;
    return list.filter((e) => {
      return (
        e.word.toLowerCase().includes(q) ||
        e.meaning.toLowerCase().includes(q) ||
        e.normalizedWord.toLowerCase().includes(q)
      );
    });
  }, [entries, search]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookText className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Custom Dictionary</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Add Bengali or English words with meanings. Users can click on words anywhere in the app to see meanings.
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-4 border border-border/70 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Word</Label>
            <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="e.g., Photosynthesis / প্রকাশ" />
          </div>
          <div className="space-y-2">
            <Label>Meaning</Label>
            <div className="rounded-md border bg-background">
              <RichTextEditor
                value={meaning}
                onChange={setMeaning}
                placeholder="Write the meaning here (supports formatting)…"
                enableBlanksButton={false}
                className="min-h-[220px]"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button
            onClick={async () => {
              const w = word.trim();
              const m = meaning.trim();
              if (!w || !m) {
                toast.error('Please enter both word and meaning');
                return;
              }
              const normalizedWord = normalizeDictionaryWord(w);
              if (!normalizedWord) {
                toast.error('Invalid word');
                return;
              }
              const now = Date.now();
              await db.customDictionary.put({
                id: uuidv4(),
                word: w,
                normalizedWord,
                meaning: m,
                createdAt: now,
                updatedAt: now,
              });
              setWord('');
              setMeaning('');
              toast.success('Dictionary entry added');
            }}
          >
            Add
          </Button>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved words…"
            className="sm:max-w-sm"
          />
        </div>

        <Separator />

        <div className="space-y-2">
          {filtered.slice(0, 200).map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-3 rounded-md border bg-background p-3">
              <div className="min-w-0">
                <div className="font-semibold text-foreground break-words">{entry.word}</div>
                <div
                  className="prose prose-sm max-w-none text-sm text-muted-foreground break-words"
                  dangerouslySetInnerHTML={{ __html: entry.meaning }}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  await db.customDictionary.delete(entry.id);
                  toast.success('Deleted');
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No custom dictionary entries.</div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
