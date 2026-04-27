import request from 'supertest';
import app from '../src/index';

describe('GET /health', () => {
  it('200 döner', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});
