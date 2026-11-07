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

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
}));
// rawBody est conservé pour la vérification HMAC des webhooks (signature calculée
// sur les octets exacts reçus — un JSON re-sérialisé ne donnerait pas le même hash).
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.use('/api/auth', authRoutes);
app.use('/api/claims', claimsRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/repo', repoRoutes);
app.use('/api/hcs', hcsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '3.0.0-receipt-nft' }));

app.listen(PORT, () => {
  console.log(`Argonath backend running on http://localhost:${PORT}`);
});
