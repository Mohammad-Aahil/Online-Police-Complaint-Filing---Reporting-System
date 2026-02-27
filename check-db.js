
const { getDb } = require('./config/database.js');

console.log('Checking database schema...');
const db = getDb();

try {
  // Check table info
  const tableInfo = db.prepare("PRAGMA table_info(complaints)").all();
  console.log('Table columns:', tableInfo.map(col => col.name));
  
  // Check if assignedAt column exists
  const hasAssignedAt = tableInfo.some(col => col.name === 'assignedAt');
  console.log('Has assignedAt column:', hasAssignedAt);
  
  // Check if other new columns exist
  const hasUserAssigned = tableInfo.some(col => col.name === 'userAssignedStationId');
  const hasFinalAssigned = tableInfo.some(col => col.name === 'finalAssignedStationId');
  const hasAssignmentStatus = tableInfo.some(col => col.name === 'assignmentStatus');
  
  console.log('Has userAssignedStationId:', hasUserAssigned);
  console.log('Has finalAssignedStationId:', hasFinalAssigned);
  console.log('Has assignmentStatus:', hasAssignmentStatus);
  
  if (hasAssignedAt) {
    // Test a simple query
    const testQuery = db.prepare('SELECT COUNT(*) as count FROM complaints LIMIT 1').get();
    console.log('Test query result:', testQuery);
  } else {
    console.log('assignedAt column is missing - migration may have failed');
  }
  
  process.exit(0);
} catch (error) {
  console.error('Database check error:', error);
  process.exit(1);
}
