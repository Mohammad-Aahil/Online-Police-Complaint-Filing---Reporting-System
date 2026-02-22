const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/database');
const { generateComplaintPDF, deleteOldPDF } = require('../utils/pdfGenerator');

// GET /api/admin/complaints
const getAllComplaints = (req, res) => {
    try {
        const db = getDb();
        const { status, category, page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let query = `
      SELECT c.*, u.name as citizen_name, u.email as citizen_email,
             ps.name as station_name
      FROM complaints c
      JOIN users u ON c.citizen_id = u.id
      LEFT JOIN police_stations ps ON c.assigned_station_id = ps.id
      WHERE c.is_deleted = 0
    `;
        const params = [];
        if (status) { query += ' AND c.status = ?'; params.push(status); }
        if (category) { query += ' AND c.category = ?'; params.push(category); }
        query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const complaints = db.prepare(query).all(...params);

        let countQuery = 'SELECT COUNT(*) as count FROM complaints c WHERE c.is_deleted = 0';
        const countParams = [];
        if (status) { countQuery += ' AND c.status = ?'; countParams.push(status); }
        if (category) { countQuery += ' AND c.category = ?'; countParams.push(category); }
        const total = db.prepare(countQuery).all(...countParams)[0];

        res.json({
            success: true,
            complaints,
            pagination: { page: parseInt(page), limit: parseInt(limit), total: total.count, pages: Math.ceil(total.count / parseInt(limit)) }
        });
    } catch (err) {
        console.error('Admin get complaints error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/admin/complaints/:id/status
const updateComplaintStatus = async (req, res) => {
    try {
        const { status, remarks } = req.body;
        const validStatuses = ['Pending', 'In Progress', 'Resolved'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}` });
        }

        const db = getDb();
        const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND is_deleted = 0').get(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

        const oldStatus = complaint.status;
        db.prepare('UPDATE complaints SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, complaint.id);

        db.prepare('INSERT INTO complaint_history (complaint_id, changed_by, old_status, new_status, remarks) VALUES (?, ?, ?, ?, ?)')
            .run(complaint.id, req.user.id, oldStatus, status, remarks || `Status updated by admin`);

        // Regenerate PDF with new status (Background Task)
        setImmediate(async () => {
            try {
                const updatedComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaint.id);
                const citizen = db.prepare('SELECT name, email FROM users WHERE id = ?').get(complaint.citizen_id);
                const station = updatedComplaint.assigned_station_id
                    ? db.prepare('SELECT * FROM police_stations WHERE id = ?').get(updatedComplaint.assigned_station_id)
                    : null;

                deleteOldPDF(complaint.pdf_file);
                const { filename } = await generateComplaintPDF(updatedComplaint, citizen, station);
                db.prepare('UPDATE complaints SET pdf_file = ? WHERE id = ?').run(filename, complaint.id);
                console.log(`✅ PDF Regenerated (Status) for Complaint: ${complaint.id}`);
            } catch (pdfErr) {
                console.error('❌ Background PDF Regenerate Error (Status):', pdfErr);
            }
        });

        res.json({ success: true, message: `Complaint status updated to ${status}`, complaint: db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaint.id) });
    } catch (err) {
        console.error('Update status error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/admin/complaints/:id/assign
const assignComplaint = async (req, res) => {
    try {
        const complaintId = parseInt(req.params.id);
        const stationId = parseInt(req.body.station_id);

        if (isNaN(complaintId) || isNaN(stationId)) {
            return res.status(400).json({ success: false, message: 'Invalid ID format. Both complaint ID and station ID must be numbers.' });
        }

        if (!stationId) return res.status(400).json({ success: false, message: 'station_id is required.' });

        const db = getDb();
        const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND is_deleted = 0').get(complaintId);
        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

        const station = db.prepare('SELECT * FROM police_stations WHERE id = ?').get(stationId);
        if (!station) return res.status(404).json({ success: false, message: 'Station not found.' });

        db.prepare('UPDATE complaints SET assigned_station_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(stationId, complaintId);
        db.prepare('INSERT INTO complaint_history (complaint_id, changed_by, old_status, new_status, remarks) VALUES (?, ?, ?, ?, ?)')
            .run(complaintId, req.user.id, complaint.status, complaint.status, `Assigned to ${station.name}`);

        // Regenerate PDF with assigned station (Background Task)
        setImmediate(async () => {
            try {
                const updatedComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
                const citizen = db.prepare('SELECT name, email FROM users WHERE id = ?').get(complaint.citizen_id);

                deleteOldPDF(complaint.pdf_file);
                const { filename } = await generateComplaintPDF(updatedComplaint, citizen, station);
                db.prepare('UPDATE complaints SET pdf_file = ? WHERE id = ?').run(filename, complaintId);
                console.log(`✅ PDF Regenerated for Complaint: ${complaintId}`);
            } catch (pdfErr) {
                console.error('❌ Background PDF Regenerate Error:', pdfErr);
            }
        });

        console.log(`📡 Sending success response for assignment to station: ${stationId}`);
        res.json({
            success: true,
            message: `Complaint assigned to ${station.name}`,
            station,
            complaint: db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId)
        });
    } catch (err) {
        console.error('Assign error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/admin/complaints/:id/download
const downloadComplaint = (req, res) => {
    try {
        const db = getDb();
        const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND is_deleted = 0').all(req.params.id)[0];
        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
        if (!complaint.pdf_file) return res.status(404).json({ success: false, message: 'PDF not generated.' });

        const pdfPath = path.join(__dirname, '..', 'reports', complaint.pdf_file);
        if (!fs.existsSync(pdfPath)) return res.status(404).json({ success: false, message: 'PDF file not found.' });
        res.download(pdfPath, complaint.pdf_file);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/admin/analytics
const getAnalytics = (req, res) => {
    try {
        const db = getDb();
        const total = db.prepare('SELECT COUNT(*) as count FROM complaints WHERE is_deleted = 0').all()[0].count;
        const pending = db.prepare("SELECT COUNT(*) as count FROM complaints WHERE status = 'Pending' AND is_deleted = 0").all()[0].count;
        const inProgress = db.prepare("SELECT COUNT(*) as count FROM complaints WHERE status = 'In Progress' AND is_deleted = 0").all()[0].count;
        const resolved = db.prepare("SELECT COUNT(*) as count FROM complaints WHERE status = 'Resolved' AND is_deleted = 0").all()[0].count;
        const byCategory = db.prepare("SELECT category, COUNT(*) as count FROM complaints WHERE is_deleted = 0 GROUP BY category ORDER BY count DESC").all();
        const recentComplaints = db.prepare(`
      SELECT c.*, u.name as citizen_name FROM complaints c JOIN users u ON c.citizen_id = u.id
      WHERE c.is_deleted = 0 ORDER BY c.created_at DESC LIMIT 5
    `).all();
        const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'citizen' AND is_deleted = 0").all()[0].count;

        res.json({
            success: true,
            analytics: { total, pending, inProgress, resolved, byCategory, recentComplaints, totalUsers }
        });
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/admin/complaints/:id — View single complaint
const getComplaint = (req, res) => {
    try {
        const db = getDb();
        const complaint = db.prepare(`
      SELECT c.*, u.name as citizen_name, u.email as citizen_email,
             ps.name as station_name, ps.address as station_address, ps.contact as station_contact
      FROM complaints c JOIN users u ON c.citizen_id = u.id
      LEFT JOIN police_stations ps ON c.assigned_station_id = ps.id
      WHERE c.id = ? AND c.is_deleted = 0
    `).all(req.params.id)[0];
        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

        const history = db.prepare(`
      SELECT ch.*, u.name as changed_by_name FROM complaint_history ch
      JOIN users u ON ch.changed_by = u.id WHERE ch.complaint_id = ? ORDER BY ch.created_at DESC
    `).all(req.params.id);

        res.json({ success: true, complaint, history });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { getAllComplaints, updateComplaintStatus, assignComplaint, downloadComplaint, getAnalytics, getComplaint };
