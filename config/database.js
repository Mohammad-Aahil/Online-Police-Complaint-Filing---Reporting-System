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
      evidence_file TEXT,
      pdf_file TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (assigned_station_id) REFERENCES police_stations(id)
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

function seedPoliceStations(database) {
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
  console.log('✅ Police stations seeded');
}

module.exports = { getDb, initializeDatabase };
