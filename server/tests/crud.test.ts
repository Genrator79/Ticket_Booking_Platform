import request from 'supertest';
import { createApp } from '../src/app';
import { closePool, query } from '../src/db/index';

describe('Basic CRUD & Show Management Integration Tests (M04)', () => {
  const app = createApp();

  let testMovieId = '';
  let testVenueId = '';
  let testScreenId = '';
  let testShowId = '';

  beforeAll(async () => {
    // Check if seeded movies exist, else insert fixture
    const movieRes = await query<{ id: string }>('SELECT id FROM movies LIMIT 1');
    if (movieRes.rows.length > 0) {
      testMovieId = movieRes.rows[0].id;
    } else {
      const ins = await query<{ id: string }>(
        `INSERT INTO movies (title, duration_minutes, genre) 
         VALUES ('Test Matrix', 136, 'Sci-Fi') RETURNING id`
      );
      testMovieId = ins.rows[0].id;
    }

    // Check if venue & screen exist
    const screenRes = await query<{ id: string; venue_id: string }>(
      'SELECT id, venue_id FROM screens LIMIT 1'
    );
    if (screenRes.rows.length > 0) {
      testScreenId = screenRes.rows[0].id;
      testVenueId = screenRes.rows[0].venue_id;
    }

    // Check if show exists
    const showRes = await query<{ id: string }>('SELECT id FROM shows LIMIT 1');
    if (showRes.rows.length > 0) {
      testShowId = showRes.rows[0].id;
    }
  });

  afterAll(async () => {
    await closePool();
  });

  describe('Movies API (/api/movies)', () => {
    it('GET /api/movies should return list of movies', async () => {
      const res = await request(app).get('/api/movies');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/movies?genre=Sci-Fi should filter by genre', async () => {
      const res = await request(app).get('/api/movies?genre=Sci-Fi');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.forEach((m: any) => {
        expect(m.genre.toLowerCase()).toContain('sci-fi');
      });
    });

    it('GET /api/movies/:id should return single movie details', async () => {
      const res = await request(app).get(`/api/movies/${testMovieId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testMovieId);
    });

    it('POST /api/movies should create a new movie', async () => {
      const newMovie = {
        title: 'The Dark Knight',
        description: 'Batman raises the stakes in his war on crime.',
        duration_minutes: 152,
        genre: 'Action',
        rating: 'PG-13',
        release_date: '2008-07-18',
      };

      const res = await request(app).post('/api/movies').send(newMovie);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe(newMovie.title);

      // Clean up newly created movie
      await query('DELETE FROM movies WHERE id = $1', [res.body.data.id]);
    });

    it('PUT /api/movies/:id should update movie attributes', async () => {
      // Create temporary movie to update
      const ins = await query<{ id: string }>(
        `INSERT INTO movies (title, duration_minutes, genre) 
         VALUES ('Temp Movie', 100, 'Drama') RETURNING id`
      );
      const tempId = ins.rows[0].id;

      const res = await request(app)
        .put(`/api/movies/${tempId}`)
        .send({ title: 'Updated Movie Title' });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Movie Title');

      // Clean up
      await query('DELETE FROM movies WHERE id = $1', [tempId]);
    });

    it('GET /api/movies/:id should return 404 for non-existent UUID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/movies/${nonExistentId}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Venues & Screens API (/api/venues)', () => {
    it('GET /api/venues should return list of venues', async () => {
      const res = await request(app).get('/api/venues');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/venues/:id should return venue and its screens', async () => {
      const res = await request(app).get(`/api/venues/${testVenueId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.venue.id).toBe(testVenueId);
      expect(Array.isArray(res.body.data.screens)).toBe(true);
    });

    it('POST /api/venues should create a new venue', async () => {
      const newVenue = {
        name: 'Grand IMAX Palace',
        city: 'Metropolis',
        address: '100 Downtown Plaza',
      };

      const res = await request(app).post('/api/venues').send(newVenue);
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe(newVenue.name);

      // Clean up
      await query('DELETE FROM venues WHERE id = $1', [res.body.data.id]);
    });
  });

  describe('Shows & Seat Layout API (/api/shows)', () => {
    it('GET /api/shows should list scheduled shows with movie and screen metadata', async () => {
      const res = await request(app).get('/api/shows');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        const show = res.body.data[0];
        expect(show.movie_title).toBeDefined();
        expect(show.screen_name).toBeDefined();
        expect(show.venue_name).toBeDefined();
      }
    });

    it('GET /api/shows/:id should return specific show details', async () => {
      const res = await request(app).get(`/api/shows/${testShowId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testShowId);
    });

    it('GET /api/shows/:showId/seats should return layout and seat availability (Section 11)', async () => {
      const res = await request(app).get(`/api/shows/${testShowId}/seats`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.showId).toBe(testShowId);
      expect(typeof res.body.data.totalSeats).toBe('number');
      expect(typeof res.body.data.availableSeats).toBe('number');
      expect(Array.isArray(res.body.data.seats)).toBe(true);

      if (res.body.data.seats.length > 0) {
        const seat = res.body.data.seats[0];
        expect(seat.seat_label).toBeDefined();
        expect(seat.row).toBeDefined();
        expect(seat.number).toBeDefined();
        expect(seat.tier).toBeDefined();
        expect(['AVAILABLE', 'HELD', 'BOOKED']).toContain(seat.status);
      }
    });

    it('POST /api/shows should create a show and automatically populate show_seats', async () => {
      const start = new Date(Date.now() + 86400000 * 5); // 5 days in future
      const end = new Date(start.getTime() + 7200000); // 2 hours duration

      const newShow = {
        movie_id: testMovieId,
        screen_id: testScreenId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        base_price: 15.5,
      };

      const res = await request(app).post('/api/shows').send(newShow);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const createdShow = res.body.data;
      expect(createdShow.id).toBeDefined();

      // Verify that show_seats were automatically generated
      const seatsRes = await request(app).get(`/api/shows/${createdShow.id}/seats`);
      expect(seatsRes.status).toBe(200);
      expect(seatsRes.body.data.totalSeats).toBeGreaterThan(0);
      expect(seatsRes.body.data.availableSeats).toBe(seatsRes.body.data.totalSeats);

      // Clean up show (cascades to show_seats)
      await query('DELETE FROM shows WHERE id = $1', [createdShow.id]);
    });
  });
});

