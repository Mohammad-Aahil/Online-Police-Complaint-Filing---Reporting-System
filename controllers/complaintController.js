const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/database');
const { generateComplaintPDF, deleteOldPDF } = require('../utils/pdfGenerator');

// Generate reference number
function generateRefNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 900000) + 100000;
    return `CMP-${year}${month}-${random}`;
}

// POST /api/complaints — File a new complaint
const fileComplaint = async (req, res) => {
    try {
        const { category, description, address_text, latitude, longitude, station_id } = req.body;

        if (!category || !description || !address_text || !station_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Category, description, address, and police station are required.' 
            });
        }

        const db = getDb();
        
        // Validate station exists
        const station = db.prepare('SELECT * FROM police_stations WHERE id = ?').get(station_id);
        if (!station) {
            return res.status(400).json({ 
                success: false, 
                message: 'Selected police station is not valid.' 
            });
        }

        const reference_number = generateRefNumber();
        const evidence_file = req.file ? req.file.filename : null;
        const citizen_id = req.user.id;

        // Insert complaint with mandatory station assignment
        const result = db.prepare(`
      INSERT INTO complaints (
        reference_number, citizen_id, category, description, address_text, 
        latitude, longitude, evidence_file, assigned_station_id,
        userAssignedStationId, finalAssignedStationId, assignmentStatus
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'User Assigned')
    `).run(
            reference_number, citizen_id, category, description, address_text, 
            latitude || null, longitude || null, evidence_file, station_id,
            station_id, station_id
        );

        const complaintId = result.lastInsertRowid;
        const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').all(complaintId)[0];
        const citizen = db.prepare('SELECT name, email FROM users WHERE id = ?').all(citizen_id)[0];

        // Generate PDF
        const { filename } = await generateComplaintPDF(complaint, citizen, station);
        db.prepare('UPDATE complaints SET pdf_file = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(filename, complaintId);

        // Log history
        db.prepare(`INSERT INTO complaint_history (complaint_id, changed_by, old_status, new_status, remarks) VALUES (?, ?, ?, ?, ?)`)
            .run(complaintId, citizen_id, null, 'Pending', `Complaint filed and assigned to ${station.name}`);

        const finalComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').all(complaintId)[0];

        res.status(201).json({
            success: true,
            message: 'Complaint filed successfully!',
            complaint: finalComplaint
        });
    } catch (err) {
        console.error('File complaint error:', err);
        res.status(500).json({ success: false, message: 'Server error while filing complaint.' });
    }
};

// GET /api/complaints — Get citizen's own complaints (paginated)
const getMyComplaints = (req, res) => {
    try {
        const db = getDb();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const status = req.query.status;

        let query = `
      SELECT c.*, ps.name as station_name
      FROM complaints c
      LEFT JOIN police_stations ps ON c.assigned_station_id = ps.id
      WHERE c.citizen_id = ? AND c.is_deleted = 0
    `;
        const params = [req.user.id];

        if (status) { query += ' AND c.status = ?'; params.push(status); }
        query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const complaints = db.prepare(query).all(...params);
        const totalRow = db.prepare(`SELECT COUNT(*) as count FROM complaints WHERE citizen_id = ? AND is_deleted = 0 ${status ? 'AND status = ?' : ''}`).all(...(status ? [req.user.id, status] : [req.user.id]))[0];

        res.json({
            success: true,
            complaints,
            pagination: { page, limit, total: totalRow.count, pages: Math.ceil(totalRow.count / limit) }
        });
    } catch (err) {
        console.error('Get complaints error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/complaints/:id — Get single complaint
const getComplaint = (req, res) => {
    try {
        const db = getDb();
        const complaint = db.prepare(`
      SELECT c.*, u.name as citizen_name, u.email as citizen_email,
             ps.name as station_name, ps.address as station_address, ps.contact as station_contact
      FROM complaints c
      JOIN users u ON c.citizen_id = u.id
      LEFT JOIN police_stations ps ON c.assigned_station_id = ps.id
      WHERE c.id = ? AND c.is_deleted = 0
    `).all(req.params.id)[0];

        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found.' });
        }

        // Citizens can only view their own complaints
        if (req.user.role === 'citizen' && complaint.citizen_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const history = db.prepare(`
      SELECT ch.*, u.name as changed_by_name
      FROM complaint_history ch
      JOIN users u ON ch.changed_by = u.id
      WHERE ch.complaint_id = ?
      ORDER BY ch.created_at DESC
    `).all(req.params.id);

        res.json({ success: true, complaint, history });
    } catch (err) {
        console.error('Get complaint error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/complaints/:id — Update complaint (citizen, only if Pending)
const updateComplaint = async (req, res) => {
    try {
        const db = getDb();
        const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND is_deleted = 0').get(req.params.id);

        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
        if (complaint.citizen_id !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied.' });
        if (complaint.status !== 'Pending') {
            return res.status(400).json({ success: false, message: `Cannot update complaint with status: ${complaint.status}. Only Pending complaints can be updated.` });
        }

        const { category, description, address_text, latitude, longitude } = req.body;
        const evidence_file = req.file ? req.file.filename : complaint.evidence_file;

        // Delete old evidence if new one uploaded
        if (req.file && complaint.evidence_file) {
            const oldEvidencePath = path.join(__dirname, '..', 'uploads', complaint.evidence_file);
            if (fs.existsSync(oldEvidencePath)) fs.unlinkSync(oldEvidencePath);
        }

        db.prepare(`
      UPDATE complaints SET category = ?, description = ?, address_text = ?, latitude = ?, longitude = ?, evidence_file = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(category || complaint.category, description || complaint.description, address_text || complaint.address_text,
            latitude || complaint.latitude, longitude || complaint.longitude, evidence_file, complaint.id);

        const updatedComplaint = db.prepare('SELECT * FROM complaints WHERE id = ?').all(complaint.id)[0];
        const citizen = db.prepare('SELECT name, email FROM users WHERE id = ?').all(req.user.id)[0];
        const station = updatedComplaint.assigned_station_id
            ? db.prepare('SELECT * FROM police_stations WHERE id = ?').all(updatedComplaint.assigned_station_id)[0]
            : null;

        // Delete old PDF and regenerate
        deleteOldPDF(complaint.pdf_file);
        const { filename } = await generateComplaintPDF(updatedComplaint, citizen, station);
        db.prepare('UPDATE complaints SET pdf_file = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(filename, complaint.id);

        db.prepare('INSERT INTO complaint_history (complaint_id, changed_by, old_status, new_status, remarks) VALUES (?, ?, ?, ?, ?)')
            .run(complaint.id, req.user.id, complaint.status, complaint.status, 'Complaint details updated by citizen');

        res.json({ success: true, message: 'Complaint updated successfully!', complaint: db.prepare('SELECT * FROM complaints WHERE id = ?').all(complaint.id)[0] });
    } catch (err) {
        console.error('Update complaint error:', err);
        res.status(500).json({ success: false, message: 'Server error while updating.' });
    }
};

// GET /api/complaints/:id/download
const downloadComplaint = (req, res) => {
    try {
        const db = getDb();
        const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND is_deleted = 0').get(req.params.id);

        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
        if (req.user.role === 'citizen' && complaint.citizen_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        if (!complaint.pdf_file) return res.status(404).json({ success: false, message: 'PDF not generated yet.' });

        const pdfPath = path.join(__dirname, '..', 'reports', complaint.pdf_file);
        if (!fs.existsSync(pdfPath)) return res.status(404).json({ success: false, message: 'PDF file not found.' });

        res.download(pdfPath, complaint.pdf_file);
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// DELETE /api/complaints/:id (soft delete)
const deleteComplaint = (req, res) => {
    try {
        const db = getDb();
        const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND is_deleted = 0').get(req.params.id);
        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
        if (complaint.citizen_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }
        db.prepare('UPDATE complaints SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(complaint.id);
        res.json({ success: true, message: 'Complaint deleted successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { fileComplaint, getMyComplaints, getComplaint, updateComplaint, downloadComplaint, deleteComplaint };
