import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_nexeditor_2026';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

// ─── Passport Google Strategy ──────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const CALLBACK_URL         = process.env.CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback';

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID:     GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL:  '/api/auth/google/callback',
      proxy:        true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email       = profile.emails?.[0]?.value || `google_${profile.id}@nexeditor.local`;
        const displayName = profile.displayName || profile.id;

        let user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
          user = await prisma.user.create({
            data: { email, displayName, authProvider: 'google' }
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
}

// Middleware to initialise passport (added per-router so it doesn't pollute global app)
router.use(passport.initialize());

// ─── Google OAuth routes ───────────────────────────────────────────────────
router.get(
  '/google',
  (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(503).json({
        error: 'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.'
      });
    }
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get(
  '/google/callback',
  (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.redirect('/?error=google_not_configured');
    }
    next();
  },
  passport.authenticate('google', { session: false, failureRedirect: '/?error=google_auth_failed' }),
  (req, res) => {
    const user  = req.user;
    const token = jwt.sign({ id: user.id, name: user.displayName }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, cookieOptions);
    res.redirect('/');
  }
);

// ─── Email / Password ──────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing required fields' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'User already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: name, authProvider: 'local' }
    });

    const token = jwt.sign({ id: user.id, name: user.displayName }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, cookieOptions);
    res.json({ success: true, user: { id: user.id, name: user.displayName } });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.authProvider !== 'local') return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, name: user.displayName }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, cookieOptions);
    res.json({ success: true, user: { id: user.id, name: user.displayName } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Guest ─────────────────────────────────────────────────────────────────
router.post('/guest', async (req, res) => {
  try {
    const guestNumber = Math.floor(Math.random() * 900) + 100;
    const displayName = `Guest${guestNumber}`;

    const user = await prisma.user.create({
      data: {
        email: `guest_${Date.now()}_${guestNumber}@nexeditor.local`,
        displayName,
        authProvider: 'guest'
      }
    });

    const token = jwt.sign({ id: user.id, name: user.displayName }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('auth_token', token, cookieOptions);
    res.json({ success: true, user: { id: user.id, name: user.displayName } });
  } catch (err) {
    console.error('Guest login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Session check ─────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) return res.json({ user: null });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: { id: decoded.id, name: decoded.name } });
  } catch {
    res.json({ user: null });
  }
});

// ─── Logout ────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

export default router;
