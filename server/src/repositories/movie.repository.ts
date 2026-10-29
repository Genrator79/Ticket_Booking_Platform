import { query } from '../db/index.js';
import { CreateMovieDTO, Movie, UpdateMovieDTO } from '../types/entities.js';

export class MovieRepository {
  async findAll(filters?: { genre?: string; search?: string }): Promise<Movie[]> {
    let sql = 'SELECT * FROM movies WHERE 1=1';
    const params: any[] = [];

    if (filters?.genre) {
      params.push(filters.genre);
      sql += ` AND LOWER(genre) = LOWER($${params.length})`;
    }

    if (filters?.search) {
      params.push(`%${filters.search}%`);
      sql += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query<Movie>(sql, params);
    return result.rows;
  }

  async findById(id: string): Promise<Movie | null> {
    const sql = 'SELECT * FROM movies WHERE id = $1 LIMIT 1';
    const result = await query<Movie>(sql, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateMovieDTO): Promise<Movie> {
    const sql = `
      INSERT INTO movies (title, description, duration_minutes, genre, rating, poster_url, release_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [
      data.title,
      data.description || null,
      data.duration_minutes,
      data.genre,
      data.rating || 'PG-13',
      data.poster_url || null,
      data.release_date || null,
    ];
    const result = await query<Movie>(sql, values);
    return result.rows[0];
  }

  async update(id: string, data: UpdateMovieDTO): Promise<Movie | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      values.push(data.title);
      fields.push(`title = $${values.length}`);
    }
    if (data.description !== undefined) {
      values.push(data.description);
      fields.push(`description = $${values.length}`);
    }
    if (data.duration_minutes !== undefined) {
      values.push(data.duration_minutes);
      fields.push(`duration_minutes = $${values.length}`);
    }
    if (data.genre !== undefined) {
      values.push(data.genre);
      fields.push(`genre = $${values.length}`);
    }
    if (data.rating !== undefined) {
      values.push(data.rating);
      fields.push(`rating = $${values.length}`);
    }
    if (data.poster_url !== undefined) {
      values.push(data.poster_url);
      fields.push(`poster_url = $${values.length}`);
    }
    if (data.release_date !== undefined) {
      values.push(data.release_date);
      fields.push(`release_date = $${values.length}`);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(new Date());
    fields.push(`updated_at = $${values.length}`);

    values.push(id);
    const sql = `
      UPDATE movies
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await query<Movie>(sql, values);
    return result.rows[0] || null;
  }

  async delete(id: string): Promise<boolean> {
    const sql = 'DELETE FROM movies WHERE id = $1';
    const result = await query(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const movieRepository = new MovieRepository();
