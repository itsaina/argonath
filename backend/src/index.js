require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const claimsRoutes = require('./routes/claims');
const otpRoutes = require('./routes/otp');
const repoRoutes = require('./routes/repo');
const hcsRoutes  = require('./routes/hcs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/repo', repoRoutes);
app.use('/api/hcs', hcsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Argonath backend running on http://localhost:${PORT}`);
});
