const express = require('express');
const router = express.Router();
const { getNearbyStations, getAllStations, getStation } = require('../controllers/stationController');

router.get('/', getAllStations);
router.get('/:id', getStation);
router.post('/nearby', getNearbyStations);

module.exports = router;
