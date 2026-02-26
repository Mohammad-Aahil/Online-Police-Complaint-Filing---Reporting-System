const express = require('express');
const router = express.Router();
const { getAllComplaints, updateComplaintStatus, assignComplaint, reassignComplaint, downloadComplaint, getAnalytics, getComplaint } = require('../controllers/adminController');
const { authMiddleware, isAdmin } = require('../middleware/authMiddleware');

// All admin routes require auth + admin role
router.use(authMiddleware, isAdmin);

router.get('/analytics', getAnalytics);
router.get('/complaints', getAllComplaints);
router.get('/complaints/:id', getComplaint);
router.put('/complaints/:id/status', updateComplaintStatus);
router.put('/complaints/:id/assign', assignComplaint);
router.put('/complaints/:id/reassign', reassignComplaint);
router.get('/complaints/:id/download', downloadComplaint);

module.exports = router;
