import { useState, useEffect } from 'react';
import { movieService } from '../services/movieService';
import { showService } from '../services/showService';
import type { Movie, Show, ShowSeat } from '../types/catalog';

export function MovieCatalog() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [selectedShow, setSelectedShow] = useState<Show | null>(null);
  const [seatLayout, setSeatLayout] = useState<{
    totalSeats: number;
    availableSeats: number;
    seats: ShowSeat[];
  } | null>(null);

  const [loadingMovies, setLoadingMovies] = useState(true);
  const [loadingShows, setLoadingShows] = useState(false);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load movies on mount
  useEffect(() => {
    movieService
      .getMovies()
      .then((data) => {
        setMovies(data);
        if (data.length > 0) {
          handleSelectMovie(data[0]);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMovies(false));
  }, []);

  const handleSelectMovie = async (movie: Movie) => {
    setSelectedMovie(movie);
    setSelectedShow(null);
    setSeatLayout(null);
    setLoadingShows(true);
    setError(null);

    try {
      const showList = await showService.getShows({ movieId: movie.id });
      setShows(showList);
      if (showList.length > 0) {
        handleSelectShow(showList[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load shows');
    } finally {
      setLoadingShows(false);
    }
  };

  const handleSelectShow = async (show: Show) => {
    setSelectedShow(show);
    setLoadingSeats(true);
    setError(null);

    try {
      const layout = await showService.getShowSeats(show.id);
      setSeatLayout(layout);
    } catch (err: any) {
      setError(err.message || 'Failed to load seat layout');
    } finally {
      setLoadingSeats(false);
    }
  };

  return (
    <div className="w-full max-w-5xl space-y-8">
      {/* Movies Carousel / Grid */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-950/80 border border-violet-800/60 flex items-center justify-center text-lg">
              🎬
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-base">Browse Movies & Events (M04 CRUD)</h3>
              <p className="text-xs text-slate-400">Live catalog and scheduled screenings from PostgreSQL</p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {movies.length} Title{movies.length === 1 ? '' : 's'} Available
          </span>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs">
            ⚠️ {error}
          </div>
        )}

        {loadingMovies ? (
          <div className="py-12 text-center text-xs text-slate-400 animate-pulse">Loading movies catalog...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {movies.map((movie) => {
              const isSelected = selectedMovie?.id === movie.id;
              return (
                <div
                  key={movie.id}
                  onClick={() => handleSelectMovie(movie)}
                  className={`group cursor-pointer rounded-xl overflow-hidden border transition-all duration-200 ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500 shadow-lg shadow-indigo-500/20'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="aspect-[2/3] w-full bg-slate-900 overflow-hidden relative">
                    {movie.poster_url ? (
                      <img
                        src={movie.poster_url}
                        alt={movie.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl">🎞️</div>
                    )}
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-950/80 border border-slate-700 text-slate-300">
                      {movie.rating || 'PG-13'}
                    </span>
                  </div>
                  <div className="p-3">
                    <h4 className="font-semibold text-xs text-slate-100 truncate group-hover:text-indigo-300 transition-colors">
                      {movie.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{movie.genre}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400">
                      <span>⏱️ {movie.duration_minutes}m</span>
                      {isSelected && <span className="font-bold text-indigo-400">Selected</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Screenings & Seat Layout for Selected Movie */}
      {selectedMovie && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/60">
            <div>
              <h3 className="font-semibold text-slate-100 text-base">
                Screenings for <span className="text-indigo-400">{selectedMovie.title}</span>
              </h3>
              <p className="text-xs text-slate-400">{selectedMovie.description || 'Select a showtime to view live seat layout.'}</p>
            </div>
            {selectedShow && (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-950 border border-indigo-800/60 text-indigo-300">
                ${Number(selectedShow.base_price).toFixed(2)} base
              </span>
            )}
          </div>

          {loadingShows ? (
            <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading showtimes...</div>
          ) : shows.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No scheduled shows for this title currently.</div>
          ) : (
            <div className="space-y-6">
              {/* Show Pills */}
              <div className="flex flex-wrap gap-3">
                {shows.map((show) => {
                  const isSelected = selectedShow?.id === show.id;
                  const dateStr = new Date(show.start_time).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  });
                  const timeStr = new Date(show.start_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <button
                      key={show.id}
                      onClick={() => handleSelectShow(show)}
                      className={`px-4 py-2.5 rounded-xl text-left border transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-600/20 text-white ring-1 ring-indigo-500 shadow-md'
                          : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-100">{timeStr} ({dateStr})</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {show.venue_name} • {show.screen_name}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Seat Layout View (Section 11) */}
              {selectedShow && (
                <div className="mt-8 pt-6 border-t border-slate-800/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                    <div>
                      <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-300">
                        Auditorium Seating Grid (GET /api/shows/:showId/seats)
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {selectedShow.venue_name} — {selectedShow.screen_name}
                      </p>
                    </div>

                    {seatLayout && (
                      <div className="flex items-center gap-4 text-[11px]">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                          Available ({seatLayout.availableSeats})
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
                          Held (0)
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <span className="w-2.5 h-2.5 rounded-sm bg-slate-700"></span>
                          Booked ({seatLayout.totalSeats - seatLayout.availableSeats})
                        </span>
                      </div>
                    )}
                  </div>

                  {loadingSeats ? (
                    <div className="py-12 text-center text-xs text-slate-400 animate-pulse">Loading seat grid...</div>
                  ) : !seatLayout || seatLayout.seats.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">No seats registered for this screen.</div>
                  ) : (
                    <div className="p-6 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col items-center">
                      {/* Screen Representation */}
                      <div className="w-3/4 max-w-md h-2 rounded-full bg-indigo-500/40 mb-2 shadow-lg shadow-indigo-500/20"></div>
                      <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-8 font-semibold">
                        Cinema Screen
                      </div>

                      {/* Seating Grid */}
                      <div className="space-y-2">
                        {Array.from(new Set(seatLayout.seats.map((s) => s.row)))
                          .sort()
                          .map((row) => {
                            const rowSeats = seatLayout.seats
                              .filter((s) => s.row === row)
                              .sort((a, b) => a.number - b.number);

                            return (
                              <div key={row} className="flex items-center gap-2">
                                <span className="w-4 text-xs font-mono font-bold text-slate-400 text-center">
                                  {row}
                                </span>
                                <div className="flex gap-1.5">
                                  {rowSeats.map((seat) => {
                                    const isAvailable = seat.status === 'AVAILABLE';
                                    const isHeld = seat.status === 'HELD';

                                    return (
                                      <div
                                        key={seat.id}
                                        title={`${seat.seat_label} (${seat.tier}) - $${Number(seat.price).toFixed(2)}`}
                                        className={`w-7 h-7 rounded text-[10px] font-mono flex items-center justify-center transition-all ${
                                          isAvailable
                                            ? 'bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 hover:bg-emerald-600 hover:text-white cursor-pointer'
                                            : isHeld
                                            ? 'bg-amber-950/80 border border-amber-600/60 text-amber-300 cursor-not-allowed'
                                            : 'bg-slate-800/60 border border-slate-700/60 text-slate-400 cursor-not-allowed'
                                        }`}
                                      >
                                        {seat.number}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      <div className="mt-6 text-[11px] text-slate-400">
                        Showing live availability from PostgreSQL <code className="text-indigo-300">show_seats</code> table.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
