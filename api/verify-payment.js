import Stripe from 'stripe';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid') {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
