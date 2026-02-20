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
  if (stationCount.count === 0) {
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
    { name: 'Central Police Station', address: '1 MG Road, City Center', contact: '100', latitude: 19.0760, longitude: 72.8777 },
    { name: 'North District Station', address: '45 North Ave, Andheri', contact: '022-26831000', latitude: 19.1136, longitude: 72.8697 },
    { name: 'South District Station', address: '12 Marine Lines, Colaba', contact: '022-22634000', latitude: 18.9322, longitude: 72.8264 },
    { name: 'East Division Station', address: '78 Eastern Express Hwy, Kurla', contact: '022-25013000', latitude: 19.0728, longitude: 72.8826 },
    { name: 'West Precinct Station', address: '33 Linking Road, Bandra', contact: '022-26402000', latitude: 19.0596, longitude: 72.8295 },
    { name: 'Airport Zone Station', address: '5 Airport Road, Sahar', contact: '022-26820000', latitude: 19.0968, longitude: 72.8742 },
    { name: 'Harbour Station', address: '22 Dock Yard Rd, Mazgaon', contact: '022-23760000', latitude: 18.9622, longitude: 72.8463 },
    { name: 'Suburban Station', address: '99 Station Road, Borivali', contact: '022-28901000', latitude: 19.2307, longitude: 72.8567 }
  ];

  const insert = database.prepare(
    'INSERT INTO police_stations (name, address, contact, latitude, longitude) VALUES (?, ?, ?, ?, ?)'
  );
  stations.forEach(s => insert.run(s.name, s.address, s.contact, s.latitude, s.longitude));
  console.log('✅ Police stations seeded');
}

module.exports = { getDb, initializeDatabase };
