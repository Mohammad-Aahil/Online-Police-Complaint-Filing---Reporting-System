const { getDb } = require('../config/database');

// Haversine formula to calculate distance in km
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/stations/nearby
const getNearbyStations = (req, res) => {
    try {
        const { latitude, longitude, limit = 5 } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({ success: false, message: 'Latitude and longitude are required.' });
        }

        const db = getDb();
        const stations = db.prepare('SELECT * FROM police_stations').all();

        const stationsWithDistance = stations.map(station => ({
            ...station,
            distance: haversineDistance(parseFloat(latitude), parseFloat(longitude), station.latitude, station.longitude)
        }));

        stationsWithDistance.sort((a, b) => a.distance - b.distance);
        const nearest = stationsWithDistance.slice(0, parseInt(limit));

        res.json({
            success: true,
            stations: nearest.map(s => ({ ...s, distance: Math.round(s.distance * 10) / 10 }))
        });
    } catch (err) {
        console.error('Nearby stations error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/stations — Get all stations
const getAllStations = (req, res) => {
    try {
        const db = getDb();
        const stations = db.prepare('SELECT * FROM police_stations ORDER BY name').all();
        res.json({ success: true, stations });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/stations/:id
const getStation = (req, res) => {
    try {
        const db = getDb();
        const station = db.prepare('SELECT * FROM police_stations WHERE id = ?').all(req.params.id)[0];
        if (!station) return res.status(404).json({ success: false, message: 'Station not found.' });
        res.json({ success: true, station });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { getNearbyStations, getAllStations, getStation };
