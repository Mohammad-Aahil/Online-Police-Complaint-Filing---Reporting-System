const { getDb } = require('./config/database.js');

console.log('Checking database schema...');
const db = getDb();

try {
  const tableInfo = db.prepare("PRAGMA table_info(complaints)").all();
  console.log('Table columns:', tableInfo.map(col => col.name));
  
  const hasAssignedAt = tableInfo.some(col => col.name === 'assignedAt');
  console.log('Has assignedAt column:', hasAssignedAt);
  
  if (hasAssignedAt) {
    const testQuery = db.prepare('SELECT COUNT(*) as count FROM complaints LIMIT 1').get();
    console.log('Test query result:', testQuery);
  }
  
  process.exit(0);
} catch (error) {
  console.error('Database check error:', error);
  process.exit(1);
}
