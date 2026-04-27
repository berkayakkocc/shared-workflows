import express from 'express';

const app = express();
const port = process.env.APP_PORT ?? 3000;

app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: '{{PROJECT_NAME}} çalışıyor.' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy' });
});

app.listen(port, () => {
  console.log(`{{PROJECT_NAME}} http://localhost:${port} adresinde çalışıyor`);
});

export default app;
