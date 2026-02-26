const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
  }
  return db;
}

function initializeDatabase() {
  const database = getDb();
  
  // Create users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'citizen' CHECK(role IN ('citizen', 'admin')),
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create police_stations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS police_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      contact TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create complaints table
  database.exec(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_number TEXT UNIQUE NOT NULL,
      citizen_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      address_text TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'In Progress', 'Resolved')),
      assigned_station_id INTEGER,
      userAssignedStationId INTEGER NOT NULL,
      finalAssignedStationId INTEGER NOT NULL,
      assignmentStatus TEXT NOT NULL DEFAULT 'User Assigned' CHECK(assignmentStatus IN ('User Assigned', 'Admin Overridden')),
      assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      evidence_file TEXT,
      pdf_file TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (assigned_station_id) REFERENCES police_stations(id),
      FOREIGN KEY (userAssignedStationId) REFERENCES police_stations(id),
      FOREIGN KEY (finalAssignedStationId) REFERENCES police_stations(id)
    )
  `);

  // Create complaint_history table
  database.exec(`
    CREATE TABLE IF NOT EXISTS complaint_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      changed_by INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT,
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    )
  `);

  // Run migrations for existing data
  runMigrations(database);

  // Seed police stations if empty
  const stationCount = database.prepare('SELECT COUNT(*) as count FROM police_stations').all()[0];
  if (stationCount.count < 4) { // Wipe and re-seed if less than our new set
    database.exec('DELETE FROM police_stations');
    seedPoliceStations(database);
  }

  // Seed admin user if no admin exists
  const adminCount = database.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").all()[0];
  if (adminCount.count === 0) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    database.prepare(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')"
    ).run('System Admin', 'admin@police.gov', hashedPassword);
    console.log('✅ Default admin created: admin@police.gov / admin123');
  }

  console.log('✅ Database initialized successfully');
}

function runMigrations(database) {
  // Check if new columns exist, add them if they don't
  try {
    // Add new assignment columns if they don't exist
    const tableInfo = database.prepare("PRAGMA table_info(complaints)").all();
    const hasUserAssigned = tableInfo.some(col => col.name === 'userAssignedStationId');
    const hasFinalAssigned = tableInfo.some(col => col.name === 'finalAssignedStationId');
    const hasAssignmentStatus = tableInfo.some(col => col.name === 'assignmentStatus');
    const hasAssignedAt = tableInfo.some(col => col.name === 'assignedAt');

    if (!hasUserAssigned) {
      database.exec('ALTER TABLE complaints ADD COLUMN userAssignedStationId INTEGER NOT NULL DEFAULT 1');
    }
    if (!hasFinalAssigned) {
      database.exec('ALTER TABLE complaints ADD COLUMN finalAssignedStationId INTEGER NOT NULL DEFAULT 1');
    }
    if (!hasAssignmentStatus) {
      database.exec("ALTER TABLE complaints ADD COLUMN assignmentStatus TEXT NOT NULL DEFAULT 'User Assigned' CHECK(assignmentStatus IN ('User Assigned', 'Admin Overridden'))");
    }
    if (!hasAssignedAt) {
      database.exec('ALTER TABLE complaints ADD COLUMN assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP');
    }

    // Migrate existing complaints
    const existingComplaints = database.prepare('SELECT id, assigned_station_id FROM complaints WHERE userAssignedStationId = 1 AND assigned_station_id IS NOT NULL').all();
    existingComplaints.forEach(complaint => {
      database.prepare(`
        UPDATE complaints 
        SET userAssignedStationId = ?, finalAssignedStationId = ?, assignmentStatus = 'User Assigned'
        WHERE id = ?
      `).run(complaint.assigned_station_id, complaint.assigned_station_id, complaint.id);
    });

    console.log('✅ Database migrations completed');
  } catch (error) {
    console.log('ℹ️ Migration info: Columns may already exist');
  }
}

function seedPoliceStations(database) {
  // Try to load Chennai stations from JSON file
  try {
    const fs = require('fs');
    const path = require('path');
    const stationsPath = path.join(__dirname, '..', 'seeds', 'police_stations_chennai.json');
    
    if (fs.existsSync(stationsPath)) {
      const stations = JSON.parse(fs.readFileSync(stationsPath, 'utf8'));
      const insert = database.prepare(
        'INSERT INTO police_stations (name, address, contact, latitude, longitude) VALUES (?, ?, ?, ?, ?)'
      );
      stations.forEach(s => insert.run(s.name, s.address, s.contact, s.latitude, s.longitude));
      console.log(`✅ Chennai police stations seeded: ${stations.length} stations`);
      return;
    }
  } catch (error) {
    console.log('⚠️ Could not load Chennai stations, using default stations');
  }

  // Fallback to default stations
  const stations = [
    { name: 'T. Nagar Police Station (R-1)', address: '45/2, Thanikachalam Rd, T. Nagar, Chennai', contact: '044-23452581', latitude: 13.0418, longitude: 80.2341 },
    { name: 'Adyar Police Station (J-2)', address: 'LB Rd, Adyar, Chennai', contact: '044-23452586', latitude: 13.0067, longitude: 80.2578 },
    { name: 'Anna Nagar Police Station (K-4)', address: '2nd Ave, Anna Nagar, Chennai', contact: '044-23452602', latitude: 13.0850, longitude: 80.2101 },
    { name: 'Marina Police Station (D-5)', address: 'Kamarajar Salai, Marina Beach, Chennai', contact: '044-23452571', latitude: 13.0500, longitude: 80.2824 },
    { name: 'Nungambakkam Police Station (F-3)', address: 'Valluvar Kottam High Rd, Nungambakkam, Chennai', contact: '044-23452588', latitude: 13.0597, longitude: 80.2444 }
  ];

  const insert = database.prepare(
    'INSERT INTO police_stations (name, address, contact, latitude, longitude) VALUES (?, ?, ?, ?, ?)'
  );
  stations.forEach(s => insert.run(s.name, s.address, s.contact, s.latitude, s.longitude));
  console.log('✅ Default police stations seeded');
}

module.exports = { getDb, initializeDatabase };
