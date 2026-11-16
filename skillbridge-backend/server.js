require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', null],
    credentials: true
}));
app.use(express.json());

// Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', 
    database: 'skillbridge'
});

db.connect(err => {
    if (err) {
        console.error('❌ CRITICAL: Database connection failed:', err);
        console.error('Make sure XAMPP (MySQL/MariaDB) is running!');
        process.exit(1);
    }
    console.log('✅ Successfully connected to MySQL database "skillbridge"');
});

// Generate UUID v4
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================
// REGISTRATION ENDPOINT - FULLY FIXED
// ============================================
app.post('/api/register', async (req, res) => {
    console.log('📥 Registration request received for:', req.body.email);

    const { name, email, phone, location, password, confirmPassword, accountType } = req.body;

    // 1. Input Validation
    if (!name || !email || !phone || !password || !confirmPassword) {
        console.log('❌ Registration failed: Missing required fields');
        return res.status(400).json({
            success: false,
            error: 'All fields are required.'
        });
    }

    if (password !== confirmPassword) {
        console.log('❌ Registration failed: Passwords do not match');
        return res.status(400).json({
            success: false,
            error: 'Passwords do not match.'
        });
    }

    if (password.length < 8) {
        console.log('❌ Registration failed: Password too short');
        return res.status(400).json({
            success: false,
            error: 'Password must be at least 8 characters.'
        });
    }

    try {
        // 2. Check if email already exists
        const [existingUsers] = await db.promise().execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            console.log('❌ Registration failed: Email already registered:', email);
            return res.status(400).json({
                success: false,
                error: 'Email already registered.'
            });
        }

        // 3. Hash the password securely
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 4. Generate a UUID for the user
        const uuid = generateUUID();

        // 5. Validate role value
        const validRoles = ['seeker', 'provider', 'both'];
        const role = accountType && validRoles.includes(accountType) ? accountType : 'seeker';

        // 6. Insert the new user into the database
        // FIXED: Only insert columns that exist and are required
        const [result] = await db.promise().execute(
            `INSERT INTO users (uuid, name, email, phone, password_hash, role, location, country) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuid, name, email, phone, passwordHash, role, location || null, 'Kenya']
        );

        const userId = result.insertId;
        console.log(`✅ SUCCESS: User registered and stored in MySQL. Email: ${email}, ID: ${userId}`);

        // 7. Send success response
        res.json({
            success: true,
            message: 'Registration successful. You can now log in.',
            userId: userId
        });

    } catch (error) {
        // 8. Handle any unexpected errors
        console.error('❌ CRITICAL ERROR during registration:', error);
        res.status(500).json({
            success: false,
            error: 'An unexpected server error occurred. Registration failed.'
        });
    }
});

// ============================================
// PAYMENT ENDPOINT (SIMULATION ONLY)
// ============================================
app.post('/api/payment/initiate', async (req, res) => {
    console.log('📥 PAYMENT REQUEST RECEIVED:', req.body);
    
    const { userId, amount, phoneNumber, accountReference } = req.body;

    if (!userId || !amount || !phoneNumber || !accountReference) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields' 
        });
    }

    try {
        const [users] = await db.promise().execute('SELECT id FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const [result] = await db.promise().execute(
            `INSERT INTO payments (user_id, amount, phone_number, status, reference)
             VALUES (?, ?, ?, 'pending', ?)`,
            [userId, amount, phoneNumber, accountReference]
        );

        const paymentId = result.insertId;
        console.log(`✅ Payment record created (ID: ${paymentId})`);

        const checkoutRequestId = `SIM-${Date.now()}`;
        
        await db.promise().execute(
            `UPDATE payments SET checkout_request_id = ?, status = 'processing' WHERE id = ?`,
            [checkoutRequestId, paymentId]
        );

        console.log(`📱 SIMULATION: STK Push "sent" to ${phoneNumber}`);
        
        res.json({
            success: true,
            message: 'STK push simulation successful',
            checkoutRequestId: checkoutRequestId,
            isSimulation: true
        });

    } catch (error) {
        console.error('❌ PAYMENT ERROR:', error);
        res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
});

// Callback endpoint
app.post('/api/mpesa/callback', async (req, res) => {
    console.log('📞 Callback received:', req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running' });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('==========================================');
    console.log(`🚀 SERVER STARTED ON http://localhost:${PORT}`);
    console.log('📡 Registration: ENABLED (stores users in MySQL)');
    console.log('📡 Payment: SIMULATION MODE ONLY');
    console.log('🛡️  CORS: Enabled for localhost:5500');
    console.log('==========================================');
    console.log('');
    console.log('✅ Registration is now active and will store users in the database.');
    console.log('✅ Check phpMyAdmin → skillbridge → users table to verify new users.');
    console.log('');
});