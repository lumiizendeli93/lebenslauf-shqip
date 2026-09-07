import Stripe from 'stripe';

const ALLOWED_HOST = /(^|\.)lebenslauf-shqip\.de$|^lebenslauf-shqip[a-z0-9-]*\.vercel\.app$/;
function foreignOrigin(req) {
  const src = req.headers.origin || req.headers.referer;
  if (!src) return false;
  try { return !ALLOWED_HOST.test(new URL(src).hostname); } catch (e) { return true; }
}

export default async function handler(req, res) {
  if (foreignOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid') {
      res.status(200).json({
        success: true,
        order: {
          session_id: session.id,
          amount_total: session.amount_total,
          currency: session.currency,
          created: session.created,
          consent_timestamp: (session.metadata && session.metadata.consent_timestamp) || null
        }
      });
    } else {
      res.status(400).json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
