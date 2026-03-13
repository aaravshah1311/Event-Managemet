// server.js
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const cors = require('cors');
const exceljs = require('exceljs');
const session = require('express-session'); // Sessions
const bcrypt = require('bcrypt');          // Password hashing
const winston = require('winston');        // Logging
const { format } = require('winston');     // Logging format helpers
const fs = require('fs'); // Added for checking 404 file existence

const app = express();
const PORT = 1311;

// --- Setup Logger ---
const logger = winston.createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS ZZ' }), // Precise timestamp
        format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'action.log' }) // Log file
    ]
});

// Middleware
app.use(cors()); // Allow requests from frontend (if on different port during dev)
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.set('trust proxy', true); // Get real IP behind proxy

// --- Setup Session Middleware ---
app.use(session({
    secret: 'replace-this-with-a-long-random-string-in-production', // IMPORTANT: Change this!
    resave: false,
    saveUninitialized: false, // Don't save sessions until login
    cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true, // Prevent client-side JS access
        maxAge: 24 * 60 * 60 * 1000 // Session duration: 1 day
    }
}));

// Serve static files from 'public' directory AFTER session setup
app.use(express.static(path.join(__dirname, 'public')));

// Database Connection Pool
const dbConfig = {
    host: 'localhost',
    user: 'root', // Your MySQL username
    password: '', // Your MySQL password
    database: 'event_manager',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig);

// --- Authentication Middleware ---
const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        logger.warn(`Unauthorized access attempt to ${req.originalUrl} from IP: ${req.ip}`);
        if (req.originalUrl.startsWith('/api/')) {
           return res.status(401).json({ success: false, message: 'Authentication required.' });
        } else {
           return res.redirect('/Login');
        }
    }
    next();
};

// --- Log Action Function ---
const logAction = (username, action, ipAddress, details = '') => {
    const message = `Admin: ${username}, IP: ${ipAddress}, Action: ${action}${details ? `, Details: ${details}` : ''}`;
    logger.info(message);
};

// --- API ENDPOINTS ---

// Login, Logout, Auth Status
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const ipAddress = req.ip;
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT * FROM admins WHERE username = ?', [username]);
        connection.release();

        if (rows.length === 0) {
            logger.warn(`Login Failed: Username '${username}' not found. IP: ${ipAddress}`);
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        const admin = rows[0];
        const match = await bcrypt.compare(password, admin.password);

        if (match) {
            req.session.userId = admin.id;
            req.session.username = admin.username;
            logAction(admin.username, 'Logged In', ipAddress);
            res.json({ success: true, message: 'Login successful!' });
        } else {
            logger.warn(`Login Failed: Incorrect password for username '${username}'. IP: ${ipAddress}`);
            res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }
    } catch (error) {
        if (connection) connection.release();
        logger.error(`Login Error: ${error.message}. Username: ${username}, IP: ${ipAddress}`);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

app.post('/api/logout', (req, res) => {
    const username = req.session.username || 'Unknown user';
    const ipAddress = req.ip;
    req.session.destroy(err => {
        if (err) {
            logger.error(`Logout Error for ${username}: ${err.message}. IP: ${ipAddress}`);
            return res.status(500).json({ success: false, message: 'Logout failed.' });
        }
        logAction(username, 'Logged Out', ipAddress);
        res.clearCookie('connect.sid'); // Clear the session cookie
        res.json({ success: true, message: 'Logged out successfully.' });
    });
});

app.get('/api/auth/status', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username });
    } else {
        res.json({ loggedIn: false });
    }
});


// --- PROTECTED API ENDPOINTS (require requireLogin middleware) ---

// Dashboard Summary (Updated for Today's Attendance)
app.get('/api/summary', requireLogin, async (req, res) => {
    const { gender } = req.query; // Get gender filter from query params ('all', 'Male', 'Female')
    let connection;
    try {
        connection = await pool.getConnection();

        // Stats queries
        const [candidateRows] = await connection.execute('SELECT COUNT(*) as total FROM candidates');
        const [pointsRows] = await connection.execute('SELECT COALESCE(SUM(points), 0) as total FROM points_log');
        // --- Updated Query: Count attendance only for today ---
        const [attendanceRows] = await connection.execute('SELECT COUNT(*) as total FROM attendance WHERE attended_at = CURDATE()');
        // --- End Update ---

        // Bar Chart query
        const [barChartData] = await connection.execute(`SELECT DATE(awarded_at) as date, SUM(points) as total FROM points_log GROUP BY DATE(awarded_at) ORDER BY date DESC LIMIT 7`);

        // Top Users query (with gender filter)
        let topUsersQuery = `SELECT c.uid, c.name, COALESCE(SUM(pl.points), 0) as total
                             FROM candidates c
                             LEFT JOIN points_log pl ON c.uid = pl.candidate_uid `;
        const queryParams = [];
        if (gender === 'Male' || gender === 'Female') {
            topUsersQuery += `WHERE c.gender = ? `;
            queryParams.push(gender);
        }
        topUsersQuery += `GROUP BY c.uid, c.name ORDER BY total DESC LIMIT 3`;
        const [topUsersData] = await connection.execute(topUsersQuery, queryParams);

        // Activity Feed query
        const [activityFeed] = await connection.execute(
            `SELECT c.uid as candidate_uid, c.name, pl.reason, pl.points, pl.awarded_at, pl.admin_username
             FROM points_log pl
             JOIN candidates c ON c.uid = pl.candidate_uid
             ORDER BY pl.awarded_at DESC LIMIT 5`
        );

        connection.release();
        res.json({
            success: true,
            stats: { totalCandidates: candidateRows[0].total, totalPoints: pointsRows[0].total, todayAttendance: attendanceRows[0].total }, // <-- Changed to todayAttendance
            charts: { pointsPerDay: barChartData.reverse(), topUsers: topUsersData },
            feed: activityFeed,
        });
    } catch (error) {
        if (connection) connection.release();
        logger.error(`Dashboard Summary Error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to load dashboard data.' });
    }
});

// Excel Backup
app.get('/api/backup/excel', requireLogin, async (req, res) => {
    const username = req.session.username;
    const ipAddress = req.ip;
    let connection;
    try {
        connection = await pool.getConnection();
        const [candidates] = await connection.execute('SELECT * FROM candidates');
        const [points_log] = await connection.execute('SELECT log_id, candidate_uid, points, reason, admin_username, awarded_at FROM points_log');
        const [attendance] = await connection.execute('SELECT * FROM attendance');
        connection.release();

        const workbook = new exceljs.Workbook();
        workbook.creator = 'Aarav Programmers';
        workbook.created = new Date();
        const candidateSheet = workbook.addWorksheet('Candidates');
        candidateSheet.columns = [ { header: 'uid', key: 'uid', width: 10 }, { header: 'name', key: 'name', width: 30 }, { header: 'age', key: 'age', width: 10 }, { header: 'phone', key: 'phone', width: 15 }, { header: 'gender', key: 'gender', width: 10 }, { header: 'created_at', key: 'created_at', width: 25 }, ];
        candidateSheet.addRows(candidates);
        const pointsSheet = workbook.addWorksheet('Points Log');
        pointsSheet.columns = [ { header: 'log_id', key: 'log_id', width: 10 }, { header: 'candidate_uid', key: 'candidate_uid', width: 15 }, { header: 'points', key: 'points', width: 10 }, { header: 'reason', key: 'reason', width: 40 }, { header: 'admin_username', key: 'admin_username', width: 20 }, { header: 'awarded_at', key: 'awarded_at', width: 25 }, ];
        pointsSheet.addRows(points_log);
        const attendanceSheet = workbook.addWorksheet('Attendance');
        attendanceSheet.columns = [ { header: 'attendance_id', key: 'attendance_id', width: 10 }, { header: 'candidate_uid', key: 'candidate_uid', width: 15 }, { header: 'event_day', key: 'event_day', width: 10 }, { header: 'attended_at', key: 'attended_at', width: 25 }, ];
        attendanceSheet.addRows(attendance);

        logAction(username, 'Downloaded Backup', ipAddress, 'Success');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="EventBackup-' + Date.now() + '.xlsx"');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        if (connection) connection.release();
        logger.error(`Backup Error by ${username}, IP: ${ipAddress}: ${error.message}`);
        logAction(username, 'Attempted Download Backup', ipAddress, `Failed - Error: ${error.message}`);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Excel backup failed.' });
        }
    }
});

// Create Candidate
app.post('/api/candidates', requireLogin, async (req, res) => {
    const { name, age, phone, gender } = req.body;
    const username = req.session.username;
    const ipAddress = req.ip;
    const ageInt = parseInt(age, 10);
    if (isNaN(ageInt) || ageInt < 4) {
        logAction(username, 'Attempted Create Candidate', ipAddress, `Failed - Invalid Age: ${age}, Name: ${name}`);
        return res.status(400).json({ success: false, message: 'Age must be 4 or greater.' });
    }
    const phoneRegex = /^\d{10}$/;
    if (!phone || !phoneRegex.test(phone)) {
         logAction(username, 'Attempted Create Candidate', ipAddress, `Failed - Invalid Phone: ${phone}, Name: ${name}`);
        return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
    }
    if (gender !== 'Male' && gender !== 'Female') {
        logAction(username, 'Attempted Create Candidate', ipAddress, `Failed - Invalid Gender: ${gender}, Name: ${name}`);
        return res.status(400).json({ success: false, message: 'Invalid gender selected.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [result] = await connection.execute(
            'INSERT INTO candidates (name, age, phone, gender) VALUES (?, ?, ?, ?)',
            [name, ageInt, phone, gender]
        );
        connection.release();
        logAction(username, 'Created Candidate', ipAddress, `UID: ${result.insertId}, Name: ${name}`);
        res.status(201).json({ success: true, uid: result.insertId });
    } catch (error) {
        if (connection) connection.release();
        logger.error(`Create Candidate Error by ${username}, IP: ${ipAddress}: ${error.message}`);
        logAction(username, 'Attempted Create Candidate', ipAddress, `Failed - Name: ${name}, Error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to create candidate.' });
    }
});


// View Candidate
app.get('/api/candidates', requireLogin, async (req, res) => {
    const { searchTerm } = req.query;
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT * FROM candidates WHERE uid = ? OR name LIKE ?', [searchTerm, `%${searchTerm}%`]);
        if (rows.length === 0) {
            connection.release();
            return res.status(404).json({ success: false, message: 'Candidate not found' });
        }
        const candidate = rows[0];
        const [pointsRows] = await connection.execute('SELECT SUM(points) as total_points FROM points_log WHERE candidate_uid = ?', [candidate.uid]);
        candidate.total_points = pointsRows[0].total_points || 0;
        const [attendanceRows] = await connection.execute('SELECT event_day FROM attendance WHERE candidate_uid = ?', [candidate.uid]);
        candidate.attendance = attendanceRows.map(row => row.event_day);
        const [logs] = await connection.execute(
            'SELECT points, reason, admin_username, awarded_at FROM points_log WHERE candidate_uid = ? ORDER BY awarded_at DESC',
            [candidate.uid]
        );
        candidate.logs = logs;
        connection.release();
        res.json({ success: true, data: candidate });
    } catch (error) {
        if (connection) connection.release();
         logger.error(`View Candidate Error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Error fetching candidate data.' });
    }
});

// View ALL Candidates
app.get('/api/candidates/all', requireLogin, async (req, res) => {
     let connection;
     try {
        connection = await pool.getConnection();
        // *** CORRECTED QUERY ***
        const [rows] = await connection.execute(
            `SELECT 
                c.uid, c.name, c.age, c.phone, c.gender,
                COALESCE(pl.total_points, 0) as total_points,
                COALESCE(pl.today_points, 0) as today_points,
                a.attended_days
            FROM candidates c
            LEFT JOIN (
                SELECT 
                    candidate_uid,
                    SUM(points) as total_points,
                    SUM(CASE WHEN DATE(awarded_at) = CURDATE() THEN points ELSE 0 END) as today_points
                FROM points_log
                GROUP BY candidate_uid
            ) pl ON c.uid = pl.candidate_uid
            LEFT JOIN (
                SELECT 
                    candidate_uid,
                    GROUP_CONCAT(DISTINCT event_day ORDER BY event_day ASC) as attended_days
                FROM attendance
                GROUP BY candidate_uid
            ) a ON c.uid = a.candidate_uid
            ORDER BY c.uid ASC`
        );
        // *** END CORRECTED QUERY ***
        connection.release();
        res.json({ success: true, data: rows });
     } catch (error) {
        if (connection) connection.release();
         logger.error(`View All Candidates Error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Error fetching all candidates.' });
     }
});

// Add event points (Bulk)
app.post('/api/event-points', requireLogin, async (req, res) => {
    const { uids, points, eventName } = req.body;
    const adminUsername = req.session.username;
    const ipAddress = req.ip;
    const uidArray = [...new Set(uids.split(/[\s,;]+/))].filter(uid => uid.trim() !== '' && !isNaN(uid.trim()));
    let successUIDs = [];
    let failedUIDs = [];
    let connection;
    let overallError = null;
    try {
        connection = await pool.getConnection();
        for (const uid of uidArray) {
            const trimmedUid = uid.trim();
            try {
                const [rows] = await connection.execute('SELECT uid FROM candidates WHERE uid = ?', [trimmedUid]);
                if (rows.length === 0) {
                    failedUIDs.push(trimmedUid);
                    continue;
                }
                await connection.execute(
                    'INSERT INTO points_log (candidate_uid, points, reason, admin_username) VALUES (?, ?, ?, ?)',
                    [trimmedUid, points, eventName, adminUsername]
                );
                successUIDs.push(trimmedUid);
            } catch (insertError) {
                failedUIDs.push(trimmedUid);
                logger.error(`Bulk Event Points Error for UID ${trimmedUid} by ${adminUsername}, IP: ${ipAddress}: ${insertError.message}`);
                overallError = insertError;
            }
        }
        connection.release();
        let message = '';
        if (successUIDs.length > 0) message += `Points added to ${successUIDs.length} user(s). `;
        if (failedUIDs.length > 0) message += `Failed for UID(s): ${failedUIDs.join(', ')}.`;
        const logStatus = failedUIDs.length === 0 ? 'Success' : 'Partial Failure';
        const logDetails = `Event: ${eventName}, Points: ${points}, Success UIDs: ${successUIDs.join(',') || 'None'}, Failed UIDs: ${failedUIDs.join(',') || 'None'}`;
        logAction(adminUsername, 'Added Event Points (Bulk)', ipAddress, `${logStatus} - ${logDetails}`);
        res.json({ success: failedUIDs.length === 0, message: message.trim() || "No valid UIDs provided." });
    } catch (error) {
        if (connection) connection.release();
        overallError = error;
        logger.error(`Bulk Event Points Main Error by ${adminUsername}, IP: ${ipAddress}: ${error.message}`);
        logAction(adminUsername, 'Attempted Add Event Points (Bulk)', ipAddress, `Failed - Error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Server error during bulk points add.' });
    }
});


// Mark Bulk Attendance (Includes duplicate check)
app.post('/api/attendance/bulk', requireLogin, async (req, res) => {
    const { uids, day } = req.body;
    const adminUsername = req.session.username;
    const ipAddress = req.ip;
    const uidArray = [...new Set(uids.split(/[\s,;]+/))].filter(uid => uid.trim() !== '' && !isNaN(uid.trim()));
    const points = 100;
    const reason = `Attendance Day ${day}`;
    let successUIDs = [];
    let failedUIDs = [];
    let duplicateUIDs = [];
    let overallError = null;

    for (const uid of uidArray) {
        const trimmedUid = uid.trim();
        let connection;
        try {
            connection = await pool.getConnection();
            const [candidateRows] = await connection.execute('SELECT uid FROM candidates WHERE uid = ?', [trimmedUid]);
            if (candidateRows.length === 0) {
                failedUIDs.push(trimmedUid);
                connection.release();
                continue;
            }
            const [existingAttendance] = await connection.execute(
                'SELECT attendance_id FROM attendance WHERE candidate_uid = ? AND event_day = ?',
                [trimmedUid, day]
            );
            if (existingAttendance.length > 0) {
                duplicateUIDs.push(trimmedUid);
                connection.release();
                logger.warn(`Attendance (Bulk) Duplicate for UID ${trimmedUid}, Day ${day} by ${adminUsername}, IP: ${ipAddress}`);
                continue;
            }
            await connection.beginTransaction();
            await connection.execute(
                'INSERT INTO points_log (candidate_uid, points, reason, admin_username) VALUES (?, ?, ?, ?)',
                [trimmedUid, points, reason, adminUsername]
            );
            await connection.execute(
                'INSERT INTO attendance (candidate_uid, event_day, attended_at) VALUES (?, ?, CURDATE())',
                 [trimmedUid, day]
            );
            await connection.commit();
            successUIDs.push(trimmedUid);
        } catch (error) {
            if (connection) await connection.rollback();
            failedUIDs.push(trimmedUid);
            logger.error(`Attendance (Bulk) Error for UID ${trimmedUid} by ${adminUsername}, IP: ${ipAddress}: ${error.message}`);
            overallError = error;
        } finally {
            if (connection) connection.release();
        }
    }

    let message = '';
    if (successUIDs.length > 0) message += `Attendance marked for ${successUIDs.length} user(s). `;
    if (duplicateUIDs.length > 0) message += `Already marked for UID(s): ${duplicateUIDs.join(', ')}. `;
    if (failedUIDs.length > 0) message += `Failed (not found or error) for UID(s): ${failedUIDs.join(', ')}.`;

    const logStatus = (failedUIDs.length === 0 && duplicateUIDs.length === 0) ? 'Success' :
                      (failedUIDs.length === 0 && duplicateUIDs.length > 0) ? 'Partial (Duplicates)' : 'Partial Failure';
    const logDetails = `Day: ${day}, Success: ${successUIDs.join(',') || 'None'}, Duplicates: ${duplicateUIDs.join(',') || 'None'}, Failed: ${failedUIDs.join(',') || 'None'}`;
    logAction(adminUsername, 'Marked Attendance (Bulk)', ipAddress, `${logStatus} - ${logDetails}`);

    res.json({ success: failedUIDs.length === 0, message: message.trim() || "No valid UIDs provided." });
});

// Delete a Candidate
app.delete('/api/candidates/:uid', requireLogin, async (req, res) => {
    const { uid } = req.params;
    const username = req.session.username;
    const ipAddress = req.ip;
    let connection;
    try {
        connection = await pool.getConnection();
        const [deleteResult] = await connection.execute('DELETE FROM candidates WHERE uid = ?', [uid]);
        connection.release();
        if (deleteResult.affectedRows > 0) {
            logAction(username, 'Deleted Candidate', ipAddress, `UID: ${uid}`);
            res.json({ success: true, message: `Candidate ${uid} deleted successfully.` });
        } else {
             logger.warn(`Delete Failed by ${username}, IP: ${ipAddress}: Candidate UID ${uid} not found.`);
             logAction(username, 'Attempted Delete Candidate', ipAddress, `Failed - UID ${uid} not found`);
             res.status(404).json({ success: false, message: `Candidate UID ${uid} not found.` });
        }
    } catch (error) {
        if (connection) connection.release();
        logger.error(`Delete Candidate Error by ${username}, IP: ${ipAddress}: ${error.message}`);
        logAction(username, 'Attempted Delete Candidate', ipAddress, `Failed - UID: ${uid}, Error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to delete candidate.' });
    }
});

// --- Event Search Endpoints (Updated to fetch all by default) ---
app.get('/api/events/search', requireLogin, async (req, res) => {
    const { term } = req.query;
    let connection;
    try {
        connection = await pool.getConnection();
        let query;
        let params;

        if (term) {
            // Search with term (limited)
            query = 'SELECT DISTINCT reason FROM points_log WHERE reason LIKE ? ORDER BY reason LIMIT 20';
            params = [`%${term}%`];
        } else {
            // Get all distinct events (no term)
            query = 'SELECT DISTINCT reason FROM points_log ORDER BY reason';
            params = [];
        }

        const [rows] = await connection.execute(query, params);
        connection.release();
        res.json({ success: true, events: rows.map(r => r.reason) }); // Return array of reason strings
    } catch (error) {
        if (connection) connection.release();
        logger.error(`Event Search Error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Error searching events.' });
    }
});


app.get('/api/events/participants', requireLogin, async (req, res) => {
    const { eventName } = req.query;
    if (!eventName) {
        return res.status(400).json({ success: false, message: 'Event name is required.' });
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(
            `SELECT DISTINCT c.uid, c.name
             FROM candidates c
             JOIN points_log pl ON c.uid = pl.candidate_uid
             WHERE pl.reason = ?
             ORDER BY c.name ASC`,
            [eventName]
        );
        connection.release();
        res.json({ success: true, participants: rows });
    } catch (error) {
        if (connection) connection.release();
        logger.error(`Get Participants Error: ${error.message}`);
        res.status(500).json({ success: false, message: 'Error fetching participants.' });
    }
});
// --- END Event Search Endpoints ---

// --- Serve Login Page ---
app.get('/Login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- Serve Dashboard Page (Protected) ---
app.get('*', requireLogin, (req, res) => {
    if (path.extname(req.path).length > 0 && req.path !== '/') {
        logger.warn(`Resource not found: ${req.path} from IP: ${req.ip}`);
        const fourOhFourPath = path.join(__dirname, 'public', '404.html');
        if (fs.existsSync(fourOhFourPath)) {
            return res.status(404).sendFile(fourOhFourPath);
        } else {
            return res.status(404).send('Not found');
        }
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Start Server
app.listen(PORT, () => {
    console.log(`Server is running! Access your app at http://localhost:${PORT}\n\n`);
    logger.info(`Server started on port ${PORT}`);

});
