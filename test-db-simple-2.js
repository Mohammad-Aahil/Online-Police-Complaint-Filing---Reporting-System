const path = require('path');
const dbPath = path.join(__dirname, 'config', 'database.js');

console.log('Testing database...');
try {
  delete require.cache[require.resolve(dbPath)];
  const { getDb } = require(dbPath);
  const db = getDb();
  
  const tableInfo = db.prepare("PRAGMA table_info(complaints)").all();
  console.log('Table columns:', tableInfo.map(col => col.name));
  
  const hasAssignedAt = tableInfo.some(col => col.name === 'assignedAt');
  console.log('Has assignedAt column:', hasAssignedAt);
  
  process.exit(0);
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
