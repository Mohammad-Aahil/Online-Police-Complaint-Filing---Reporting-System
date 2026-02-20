const express = require('express');
const router = express.Router();
const { fileComplaint, getMyComplaints, getComplaint, updateComplaint, downloadComplaint, deleteComplaint } = require('../controllers/complaintController');
const { authMiddleware, isCitizen } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

// All routes require authentication
router.use(authMiddleware);

router.post('/', upload.single('evidence'), fileComplaint);
router.get('/', getMyComplaints);
router.get('/:id', getComplaint);
router.put('/:id', upload.single('evidence'), updateComplaint);
router.get('/:id/download', downloadComplaint);
router.delete('/:id', deleteComplaint);

module.exports = router;
