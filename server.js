// server.js
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(cors());            // allow cross-origin requests (safe for dev)
app.use(express.json());    // parse JSON bodies
app.use(express.static(path.join(__dirname, 'public'))); // serve login/signup pages

// MySQL connection pool (change credentials as required)
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Neha@2006', // set your MySQL password
  database: 'artisans_bazaar',
  waitForConnections: true,
  connectionLimit: 10,
});

// Helper to run queries using promises
const dbQuery = (sql, params) => db.promise().query(sql, params);

// SIGNUP
app.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Missing fields' });
    }

    // check existing email
    const [rows] = await dbQuery('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    // hash password
    const hashed = await bcrypt.hash(password, 10);

    // insert user
    await dbQuery('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashed]);
    return res.status(201).json({ message: 'User created' });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// LOGIN
app.post('/login', async (req, res) => {
  try {
    // Your login form used "username" field for email; keep same name or change on frontend.
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Missing fields' });

    const [rows] = await dbQuery('SELECT id, name, email, password FROM users WHERE email = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    // login success: return basic user info (do not return hashed password)
    return res.status(200).json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
});
