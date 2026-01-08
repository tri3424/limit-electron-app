import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, Song } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import AudioPlayer from "@/components/AudioPlayer";

// Note: This page is retained for backwards compatibility, but the main
// student-facing entrypoint is now Song Modules at /songs.

export default function Songs() {
	const songs = useLiveQuery(
		async () => {
			const all = await db.songs.toArray();
			return all
				.filter((s) => s.visible !== false)
				.slice()
				.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
		},
		[],
		[] as Song[],
	);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [searchText, setSearchText] = useState("");

	const filteredSongs = useMemo(() => {
		const list = songs ?? [];
		const q = searchText.trim().toLowerCase();
		if (!q) return list;
		return list.filter((s) => {
			const hay = `${s.title || ''} ${s.singer || ''} ${s.writer || ''} ${s.lyrics || ''}`.toLowerCase();
			return hay.includes(q);
		});
	}, [songs, searchText]);

	const selected = useMemo(() => {
		const list = filteredSongs ?? [];
		if (!list.length) return null;
		const found = selectedId ? list.find((s) => s.id === selectedId) : null;
		return found ?? list[list.length - 1];
	}, [filteredSongs, selectedId]);

	return (
		<div className="max-w-7xl mx-auto space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-foreground">Songs</h1>
				<p className="text-muted-foreground mt-2">Pick a song to start playing and view its details.</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<Card className="p-4 lg:col-span-1">
					<div className="text-sm font-semibold mb-3">Song list</div>
					<Input
						value={searchText}
						onChange={(e) => setSearchText(e.target.value)}
						placeholder="Search songs..."
						className="mb-3"
					/>
					<div className="space-y-2">
						{filteredSongs.map((s) => (
							<Button
								key={s.id}
								variant="ghost"
								className={cn(
									"w-full justify-start h-auto py-3 px-3 rounded-md border",
									selected?.id === s.id ? "bg-muted" : "bg-background",
								)}
								onClick={() => setSelectedId(s.id)}
							>
								<div className="min-w-0 text-left">
									<div className="font-medium truncate">{s.title}</div>
									<div className="text-xs text-muted-foreground truncate">{s.singer}</div>
								</div>
							</Button>
						))}
						{filteredSongs.length === 0 && (
							<div className="text-sm text-muted-foreground">No songs available.</div>
						)}
					</div>
				</Card>

				<Card className="p-4 lg:col-span-2">
					{!selected ? (
						<div className="text-sm text-muted-foreground">Select a song to begin.</div>
					) : (
						<div className="space-y-4">
							<div>
								<div className="text-2xl font-semibold">{selected.title}</div>
								<div className="text-sm text-muted-foreground mt-1">
									Singer: <span className="text-foreground font-medium">{selected.singer}</span>
								</div>
								<div className="text-sm text-muted-foreground">
									Writer: <span className="text-foreground font-medium">{selected.writer}</span>
								</div>
							</div>

							<div>
								<AudioPlayer src={selected.audioFileUrl} title={selected.title} />
							</div>

							<div>
								<div className="text-sm font-semibold mb-2">Lyrics</div>
								<div className="whitespace-pre-wrap border rounded-md bg-muted/30 p-4 text-sm">
									{selected.lyrics}
								</div>
							</div>
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
