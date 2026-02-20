const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'No token provided. Access denied.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const db = getDb();
        const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ? AND is_deleted = 0').get(decoded.id);

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid token. User not found.' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
        }
        return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
};

const isCitizen = (req, res, next) => {
    if (req.user && req.user.role === 'citizen') {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied. Citizens only.' });
};

module.exports = { authMiddleware, isAdmin, isCitizen };
