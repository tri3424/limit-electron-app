import { v4 as uuidv4 } from 'uuid';
import { db, Tag } from './db';

// Sample tags
const sampleTags: Omit<Tag, 'createdAt'>[] = [
  { id: uuidv4(), name: 'Biology' },
  { id: uuidv4(), name: 'Chemistry' },
  { id: uuidv4(), name: 'Physics' },
  { id: uuidv4(), name: 'Mathematics' },
  { id: uuidv4(), name: 'Computer Science' },
  { id: uuidv4(), name: 'History' },
  { id: uuidv4(), name: 'Geography' },
  { id: uuidv4(), name: 'Literature' },
];

export async function seedDatabase() {
  // Check if already seeded
  const existingQuestions = await db.questions.count();
  if (existingQuestions > 0) {
    console.log('Database already seeded');
    return;
  }

  const now = Date.now();

  // Add tags only (no example questions or modules)
  const tags = sampleTags.map(tag => ({
    ...tag,
    createdAt: now,
  }));
  await db.tags.bulkAdd(tags);
  console.log(`Added ${tags.length} tags`);

  console.log('Database seeding complete (tags only, no example questions/modules).');
}
