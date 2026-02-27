console.log('Testing database migration...');
try {
  const { initializeDatabase } = require('./config/database.js');
  initializeDatabase();
  console.log('Migration completed successfully');
} catch (error) {
  console.error('Migration failed:', error);
}
