const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
}

function generateComplaintPDF(complaint, citizen, station) {
    return new Promise((resolve, reject) => {
        try {
            const filename = `complaint-${complaint.reference_number}.pdf`;
            const filepath = path.join(reportsDir, filename);

            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filepath);

            doc.pipe(stream);

            // Header
            doc.rect(0, 0, doc.page.width, 100).fill('#1a237e');
            doc.fill('white').fontSize(22).font('Helvetica-Bold')
                .text('ONLINE POLICE COMPLAINT REPORT', 50, 30, { align: 'center' });
            doc.fontSize(11).font('Helvetica')
                .text('Official Document - Government of India', 50, 60, { align: 'center' });

            doc.moveDown(3);

            // Reference box
            doc.fill('#e8eaf6').rect(50, 115, doc.page.width - 100, 40).fill();
            doc.fill('#1a237e').fontSize(13).font('Helvetica-Bold')
                .text(`Reference Number: ${complaint.reference_number}`, 60, 128);

            doc.moveDown(2);

            // Section: Complaint Details
            const sectionY = 175;
            doc.fill('#1a237e').rect(50, sectionY, doc.page.width - 100, 25).fill();
            doc.fill('white').fontSize(12).font('Helvetica-Bold')
                .text('COMPLAINT DETAILS', 60, sectionY + 7);

            doc.fill('black').fontSize(11).font('Helvetica');
            const fields = [
                ['Complaint ID', complaint.id],
                ['Reference Number', complaint.reference_number],
                ['Complainant Name', citizen.name],
                ['Complainant Email', citizen.email],
                ['Category', complaint.category],
                ['Status', complaint.status],
                ['Filed On', new Date(complaint.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })],
                ['Last Updated', new Date(complaint.updated_at || complaint.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })],
                ['Incident Address', complaint.address_text],
                ['GPS Coordinates', complaint.latitude ? `${complaint.latitude}, ${complaint.longitude}` : 'Not provided'],
                ['Assigned Station', station ? station.name : 'Not yet assigned'],
                ['Station Address', station ? station.address : 'N/A'],
                ['Station Contact', station ? station.contact : 'N/A'],
            ];

            let y = sectionY + 35;
            fields.forEach(([label, value], i) => {
                if (i % 2 === 0) {
                    doc.fill('#f5f5f5').rect(50, y, doc.page.width - 100, 22).fill();
                }
                doc.fill('#555').fontSize(10).font('Helvetica-Bold').text(label + ':', 60, y + 6);
                doc.fill('#222').fontSize(10).font('Helvetica').text(String(value || 'N/A'), 200, y + 6, { width: 330 });
                y += 22;
            });

            // Description section
            y += 15;
            doc.fill('#1a237e').rect(50, y, doc.page.width - 100, 25).fill();
            doc.fill('white').fontSize(12).font('Helvetica-Bold').text('DESCRIPTION OF INCIDENT', 60, y + 7);
            y += 35;

            doc.fill('#f9f9f9').rect(50, y, doc.page.width - 100, 100).fill();
            doc.fill('#222').fontSize(10).font('Helvetica').text(complaint.description, 60, y + 10, {
                width: doc.page.width - 120,
                height: 80,
                align: 'left'
            });
            y += 110;

            // Footer
            doc.fill('#e0e0e0').rect(50, y + 20, doc.page.width - 100, 1).fill();
            y += 30;
            doc.fill('#888').fontSize(9).font('Helvetica')
                .text('This is a computer-generated document. For official use only.', 50, y, { align: 'center' })
                .text(`Generated on: ${new Date().toLocaleString('en-IN')}`, 50, y + 14, { align: 'center' })
                .text('Police Complaint Management System - Government Portal', 50, y + 28, { align: 'center' });

            // Status watermark
            if (complaint.status === 'Resolved') {
                doc.save();
                doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
                doc.fill('#4caf50').opacity(0.08).fontSize(80).font('Helvetica-Bold')
                    .text('RESOLVED', 80, 300, { align: 'center' });
                doc.restore();
            }

            doc.end();

            stream.on('finish', () => resolve({ filename, filepath }));
            stream.on('error', reject);
        } catch (err) {
            reject(err);
        }
    });
}

function deleteOldPDF(filename) {
    if (filename) {
        try {
            const filepath = path.join(reportsDir, filename);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        } catch (err) {
            console.error('Error deleting old PDF:', err);
        }
    }
}

module.exports = { generateComplaintPDF, deleteOldPDF };
