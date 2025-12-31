import { useLiveQuery } from 'dexie-react-hooks';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db, SongModule } from '@/lib/db';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function SongModules() {
	const navigate = useNavigate();
	const { user, isAdmin } = useAuth();

	const modules = useLiveQuery(async () => {
		const all = await db.songModules.toArray();
		const visible = all.filter((m) => m.visible !== false);
		if (isAdmin) return visible.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
		const userId = user?.id;
		const username = user?.username;
		if (!userId && !username) return [];
		return visible
			.filter((m) => {
				if (!Array.isArray(m.assignedUserIds)) return false;
				return (userId && m.assignedUserIds.includes(userId)) || (username && m.assignedUserIds.includes(username));
			})
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
	}, [user?.id, user?.username, isAdmin], [] as SongModule[]);

	return (
		<div className="max-w-7xl mx-auto space-y-6">
			<div>
				<h1 className="text-3xl font-bold text-foreground">Song Modules</h1>
				<p className="text-muted-foreground mt-2">Open a module to view its songs.</p>
			</div>

			<div className="space-y-4">
				{(modules ?? []).map((m) => (
					<Card key={m.id} className="flex items-stretch justify-between px-6 py-4 rounded-xl shadow-sm hover:shadow-md transition-shadow bg-green-50 border border-green-200">
						<div className="flex-1 pr-6 min-w-0">
							<h3 className="text-4xl font-semibold text-foreground truncate">{m.title}</h3>
							{m.description ? <p className="mt-2 text-sm text-foreground line-clamp-2">{m.description}</p> : null}
							<div className="mt-2 text-xs text-muted-foreground">{m.songIds.length} songs</div>
						</div>
						<div className="flex items-center justify-end gap-2">
							<Button
								className="bg-green-700 hover:bg-green-800 text-white px-6"
								onClick={() => navigate(`/song-module/${m.id}`)}
							>
								START
							</Button>
						</div>
					</Card>
				))}
				{(modules ?? []).length === 0 && (
					<Card className="p-8 text-center text-muted-foreground">No song modules to show</Card>
				)}
			</div>
		</div>
	);
}
