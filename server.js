const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ================= App Config =================
const app = express();
const PORT = 3000;

// ================= Middleware =================
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve uploaded images

// ================= MySQL Connection =================
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Neha@2006', // your MySQL password
  database: 'artisans_bazaar' // your database name
});

db.connect(err => {
  if (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
  console.log('✅ MySQL Connected');
});

// ================= Multer Setup =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ================= Signup =================
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword],
      (err) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY')
            return res.status(409).json({ message: 'Email already exists' });
          console.error(err);
          return res.status(500).json({ message: 'Database error' });
        }
        res.status(201).json({ message: 'User registered successfully' });
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ================= Login =================
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: 'Missing credentials' });

  db.query('SELECT * FROM users WHERE email = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (results.length === 0) return res.status(401).json({ message: 'Invalid credentials' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    res.json({
      message: 'Login successful',
      user: { id: user.id, name: user.name, email: user.email }
    });
  });
});

// ================= Seller Product Submission =================
app.post('/submitProduct', upload.single('productImage'), (req, res) => {
  const {
    sellerName,
    sellerEmail,
    sellerPhone,
    productName,
    productCategory,
    productDescription,
    productPrice,
    productQuantity
  } = req.body;

  const imagePath = req.file ? '/uploads/' + req.file.filename : '';

  const sql = `
    INSERT INTO products_pending 
    (sellerName, sellerEmail, sellerPhone, productName, productCategory, productDescription, productPrice, productQuantity, productImage) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(sql, [
    sellerName,
    sellerEmail,
    sellerPhone,
    productName,
    productCategory,
    productDescription,
    productPrice,
    productQuantity,
    imagePath
  ], (err) => {
    if (err) {
      console.error('❌ Error saving product:', err);
      return res.status(500).json({ success: false, message: 'Failed to submit product' });
    }
    res.json({ success: true, message: 'Product submitted for review' });
  });
});

// ================= Admin Login =================
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Missing credentials' });

  db.query('SELECT * FROM admin_users WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    if (results.length === 0) return res.json({ success: false, message: 'Invalid username' });

    const admin = results[0];
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.json({ success: false, message: 'Invalid password' });

    res.json({ success: true, message: 'Login successful' });
  });
});

// ================= Admin: View Pending Products =================
app.get('/admin/products/pending', (req, res) => {
  db.query('SELECT * FROM products_pending', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});

// ================= Admin: Approve Product =================
app.post('/admin/approve/:id', (req, res) => {
  const productId = req.params.id;

  db.query('SELECT * FROM products_pending WHERE id = ?', [productId], (err, result) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (result.length === 0)
      return res.json({ success: false, message: 'Product not found' });

    const product = result[0];
    const sqlInsert = `
      INSERT INTO products 
      (sellerName, sellerEmail, productName, productCategory, productDescription, productPrice, productQuantity, productImage) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sqlInsert, [
      product.sellerName,
      product.sellerEmail,
      product.productName,
      product.productCategory,
      product.productDescription,
      product.productPrice,
      product.productQuantity,
      product.productImage
    ], (err2) => {
      if (err2) return res.status(500).json({ message: 'DB error while approving' });

      db.query('DELETE FROM products_pending WHERE id = ?', [productId]);
      res.json({ success: true, message: 'Product approved and moved to main list' });
    });
  });
});

// ================= Admin: Reject Product =================
app.delete('/admin/reject/:id', (req, res) => {
  const productId = req.params.id;
  db.query('DELETE FROM products_pending WHERE id = ?', [productId], (err) => {
    if (err) return res.status(500).json({ message: 'Error rejecting product' });
    res.json({ success: true, message: 'Product rejected successfully' });
  });
});

// ================= Admin: View All Approved Products =================
app.get('/admin/products/all', (req, res) => {
  db.query('SELECT * FROM products', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});

// ================= Admin: View Sales =================
app.get('/admin/sales', (req, res) => {
  db.query('SELECT * FROM sales', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});

// ================= Get Products by Category =================
app.get('/products/category/:category', (req, res) => {
  const { category } = req.params;
  db.query('SELECT * FROM products WHERE productCategory = ?', [category], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(results);
  });
});

// ================= Admin: Update Credentials =================
app.post('/admin/update', (req, res) => {
  const { oldUsername, oldPassword, newUsername, newPassword } = req.body;

  db.query('SELECT * FROM admin_users WHERE username = ?', [oldUsername], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    if (results.length === 0)
      return res.status(401).json({ success: false, message: 'Invalid old username' });

    const admin = results[0];
    const isMatch = await bcrypt.compare(oldPassword, admin.password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: 'Invalid old password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.query(
      'UPDATE admin_users SET username = ?, password = ? WHERE id = ?',
      [newUsername, hashedPassword, admin.id],
      (err2) => {
        if (err2)
          return res.status(500).json({ success: false, message: 'Failed to update credentials' });
        res.json({ success: true, message: 'Admin credentials updated successfully' });
      }
    );
  });
});

// ================= Admin: Remove Approved Product =================
app.delete('/admin/remove/:id', (req, res) => {
  const productId = req.params.id;
  db.query('DELETE FROM products WHERE id = ?', [productId], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Error removing product' });
    res.json({ success: true, message: 'Product removed successfully' });
  });
});

// ================= Upload / Update Profile Image =================
app.post('/api/upload-profile', upload.single('profileImage'), (req, res) => {
  const { userId } = req.body;
  if (!req.file)
    return res.status(400).json({ success: false, message: 'No file uploaded' });

  const imagePath = '/uploads/' + req.file.filename;
  db.query('UPDATE users SET profile_image = ? WHERE id = ?', [imagePath, userId], (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error' });
    res.json({ success: true, message: 'Profile picture updated', imagePath });
  });
});

// ================= Remove Profile Image =================
app.post('/api/remove-profile', (req, res) => {
  const { userId } = req.body;

  db.query('SELECT profile_image FROM users WHERE id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'DB error' });
    if (results.length === 0)
      return res.status(404).json({ success: false, message: 'User not found' });

    const oldImage = results[0].profile_image;
    if (oldImage) {
      const filePath = path.join(__dirname, oldImage);
      fs.unlink(filePath, (err) => {
        if (err) console.warn('⚠️ Could not delete old profile image:', err.message);
      });
    }

    db.query('UPDATE users SET profile_image = NULL WHERE id = ?', [userId], (err2) => {
      if (err2)
        return res.status(500).json({ success: false, message: 'Failed to remove profile image' });
      res.json({ success: true, message: 'Profile image removed' });
    });
  });
});

// ================= Get Orders for a User =================
app.get('/orders/:userId', (req, res) => {
  const userId = req.params.userId;

  db.query('SELECT * FROM sales WHERE userId = ?', [userId], (err, results) => {
    if (err) {
      console.error('Error fetching orders:', err);
      return res.status(500).json({ message: 'Database error' });
    }

    res.json({ orders: results });
  });
});


// ================= Place Order =================
app.post('/orders', (req, res) => {
  const { userId, productId, quantity, totalPrice } = req.body;

  if (!userId || !productId || !quantity || !totalPrice) {
    return res.status(400).json({ success: false, message: 'Missing order data' });
  }

  const sql = 'INSERT INTO sales (productId, quantity, totalPrice, userId) VALUES (?, ?, ?, ?)';
  db.query(sql, [productId, quantity, totalPrice, userId], (err) => {
    if (err) {
      console.error('Error saving order:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Order placed successfully' });
  });
});

// ================= Start Server =================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});


