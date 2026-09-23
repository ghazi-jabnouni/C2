import { DatabaseSync } from 'node:sqlite';

console.log('TEST 1 - node:sqlite imported');

try {
    const db = new DatabaseSync('./database/test.db');

    console.log('TEST 2 - SQLite database opened');

    const result = db
        .prepare('SELECT 1 AS test')
        .get();

    console.log('TEST 3 - Query result:', result);

    db.close();

    console.log('TEST 4 - Database closed');
    console.log('✅ SQLite works');
} catch (error) {
    console.error('❌ SQLite ERROR');
    console.error(error);
}