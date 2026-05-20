import { Router } from 'express';
import { postToSlack } from '../services/slack';

const router = Router();

router.post('/send', async (req, res) => {
  try {
    const { channel, text } = req.body;
    if (!channel || !text) return res.status(400).json({ error: 'channel and text required' });
    const result = await postToSlack(channel, text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
