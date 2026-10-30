import { useState, useEffect } from 'react';
import { movieService } from '../services/movieService';
import { showService } from '../services/showService';
import { bookingService } from '../services/bookingService';
import { holdService } from '../services/holdService';
import { paymentService } from '../services/paymentService';
import { authService } from '../services/authService';
import type { Movie, Show, ShowSeat } from '../types/catalog';
import type { BookingWithDetails } from '../types/booking';
import type { SeatHold } from '../types/hold';
import type { PaymentReceipt } from '../types/payment';

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

  // Seat selection & booking state
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<BookingWithDetails | null>(null);

  // Temporary Seat Hold state (M08)
  const [activeHold, setActiveHold] = useState<SeatHold | null>(null);
  const [holdRemainingSeconds, setHoldRemainingSeconds] = useState<number>(0);
  const [holdingLoading, setHoldingLoading] = useState(false);

  // Payment simulation state (M09)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [cardToken, setCardToken] = useState<string>('tok_visa_success');
  const [lastReceipt, setLastReceipt] = useState<PaymentReceipt | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // User booking history modal state
  const [myBookings, setMyBookings] = useState<BookingWithDetails[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [loadingMovies, setLoadingMovies] = useState(true);
  const [loadingShows, setLoadingShows] = useState(false);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState<string | null>(null);

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
    setSelectedSeatIds([]);
    setLoadingShows(true);
    setError(null);
    setBookingSuccessMsg(null);

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
    setSelectedSeatIds([]);
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

  const toggleSeatSelection = (seat: ShowSeat) => {
    if (seat.status !== 'AVAILABLE') return;

    setError(null);
    if (selectedSeatIds.includes(seat.id)) {
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seat.id));
    } else {
      if (selectedSeatIds.length >= 10) {
        setError('Maximum 10 seats allowed per booking.');
        return;
      }
      setSelectedSeatIds([...selectedSeatIds, seat.id]);
    }
  };

  // Countdown timer for active temporary seat hold (M08)
  useEffect(() => {
    if (!activeHold || holdRemainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setHoldRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setActiveHold(null);
          setError('Seat reservation expired. Please select seats again.');
          if (selectedShow) {
            showService.getShowSeats(selectedShow.id).then(setSeatLayout).catch(() => {});
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeHold, holdRemainingSeconds, selectedShow]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlaceHold = async () => {
    if (!selectedShow || selectedSeatIds.length === 0) return;
    const token = authService.getToken();
    if (!token) {
      setError('Please log in above before reserving seats.');
      return;
    }

    setHoldingLoading(true);
    setError(null);

    try {
      const hold = await holdService.createHold({
        show_id: selectedShow.id,
        show_seat_ids: selectedSeatIds,
      });

      setActiveHold(hold);
      setHoldRemainingSeconds(hold.expiresInSeconds);
      const layout = await showService.getShowSeats(selectedShow.id);
      setSeatLayout(layout);
    } catch (err: any) {
      setError(err.message || 'Failed to place seat hold');
    } finally {
      setHoldingLoading(false);
    }
  };

  const handleReleaseHold = async () => {
    if (!activeHold) return;
    try {
      await holdService.releaseHold(activeHold.holdId);
    } catch {
      // ignore
    } finally {
      setActiveHold(null);
      setHoldRemainingSeconds(0);
      setSelectedSeatIds([]);
      if (selectedShow) {
        showService.getShowSeats(selectedShow.id).then(setSeatLayout).catch(() => {});
      }
    }
  };

  const handleProcessPayment = async () => {
    if (!activeHold && selectedSeatIds.length === 0) return;
    const token = authService.getToken();
    if (!token) {
      setError('Please log in above before processing payment.');
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);

    try {
      const receipt = await paymentService.processPayment({
        hold_id: activeHold?.holdId,
        card_token: cardToken,
      });

      setLastReceipt(receipt);

      if (receipt.status === 'SUCCESS') {
        setShowPaymentModal(false);
        setActiveHold(null);
        setHoldRemainingSeconds(0);
        setSelectedSeatIds([]);
        setBookingSuccessMsg(`Payment Confirmed! Ref: ${receipt.transactionReference}`);

        const list = await bookingService.getMyBookings();
        const latest = list.find((b) => b.id === receipt.bookingId);
        if (latest) {
          setConfirmedBooking(latest);
        }

        if (selectedShow) {
          const refreshedLayout = await showService.getShowSeats(selectedShow.id);
          setSeatLayout(refreshedLayout);
        }
      } else {
        setPaymentError(receipt.failureReason || 'Payment declined by issuer');
        if (selectedShow) {
          showService.getShowSeats(selectedShow.id).then(setSeatLayout).catch(() => {});
        }
      }
    } catch (err: any) {
      setPaymentError(err.message || 'Payment processing failed');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedShow) return;

    const token = authService.getToken();
    if (!token) {
      setError('Please log in above before booking seats.');
      return;
    }

    setBookingLoading(true);
    setError(null);
    setBookingSuccessMsg(null);

    try {
      const payload = activeHold
        ? { hold_id: activeHold.holdId }
        : { show_id: selectedShow.id, show_seat_ids: selectedSeatIds };

      const booking = await bookingService.createBooking(payload);

      setConfirmedBooking(booking);
      setBookingSuccessMsg(`Booking #${booking.id.slice(0, 8)} confirmed successfully!`);
      setSelectedSeatIds([]);
      setActiveHold(null);
      setHoldRemainingSeconds(0);

      // Refresh seat layout immediately so booked seats turn grey
      const refreshedLayout = await showService.getShowSeats(selectedShow.id);
      setSeatLayout(refreshedLayout);
    } catch (err: any) {
      setError(err.message || 'Booking failed');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleOpenHistory = async () => {
    const token = authService.getToken();
    if (!token) {
      setError('Please log in to view your booking history.');
      return;
    }

    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const list = await bookingService.getMyBookings();
      setMyBookings(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load booking history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectedSeatsList = seatLayout
    ? seatLayout.seats.filter((s) => selectedSeatIds.includes(s.id))
    : [];
  const totalAmount = selectedSeatsList.reduce((sum, s) => sum + Number(s.price), 0);

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
              <h3 className="font-semibold text-slate-100 text-base">Select Movie & Screening</h3>
              <p className="text-xs text-slate-400">Discover screenings, select seats, and book tickets (M05)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenHistory}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-colors shadow-sm"
            >
              🎟️ My Bookings
            </button>
            <span className="text-xs font-mono text-slate-400 hidden sm:inline">
              {movies.length} Title{movies.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex justify-between items-center">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200 text-sm ml-2">
              ×
            </button>
          </div>
        )}

        {bookingSuccessMsg && (
          <div className="mb-6 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs flex justify-between items-center">
            <span>✓ {bookingSuccessMsg}</span>
            <button
              onClick={() => setBookingSuccessMsg(null)}
              className="text-emerald-400 hover:text-emerald-200 text-sm ml-2"
            >
              ×
            </button>
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

      {/* Screenings & Interactive Seat Grid */}
      {selectedMovie && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800/60">
            <div>
              <h3 className="font-semibold text-slate-100 text-base">
                Screenings for <span className="text-indigo-400">{selectedMovie.title}</span>
              </h3>
              <p className="text-xs text-slate-400">
                {selectedMovie.description || 'Select showtime to choose seats.'}
              </p>
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

              {/* Seat Layout View with Clickable Selection */}
              {selectedShow && (
                <div className="mt-8 pt-6 border-t border-slate-800/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                    <div>
                      <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-300">
                        Select Seats ({selectedShow.venue_name} — {selectedShow.screen_name})
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Click on available seats to add them to your booking.
                      </p>
                    </div>

                    {seatLayout && (
                      <div className="flex flex-wrap items-center gap-4 text-[11px]">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>
                          Available
                        </span>
                        <span className="flex items-center gap-1.5 text-indigo-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span>
                          Selected ({selectedSeatIds.length})
                        </span>
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500"></span>
                          Held
                        </span>
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <span className="w-2.5 h-2.5 rounded-sm bg-slate-700"></span>
                          Booked
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
                                    const isSelected = selectedSeatIds.includes(seat.id);
                                    const isAvailable = seat.status === 'AVAILABLE';
                                    const isHeld = seat.status === 'HELD';

                                    let badgeColor = 'bg-slate-800/60 border border-slate-700/60 text-slate-400 cursor-not-allowed';
                                    if (isSelected) {
                                      badgeColor =
                                        'bg-indigo-600 border border-indigo-400 text-white font-bold ring-2 ring-indigo-400 scale-105 cursor-pointer shadow-md';
                                    } else if (isAvailable) {
                                      badgeColor =
                                        'bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 hover:bg-emerald-600 hover:text-white cursor-pointer';
                                    } else if (isHeld) {
                                      badgeColor =
                                        'bg-amber-950/80 border border-amber-600/60 text-amber-300 cursor-not-allowed';
                                    }

                                    return (
                                      <div
                                        key={seat.id}
                                        onClick={() => toggleSeatSelection(seat)}
                                        title={`${seat.seat_label} (${seat.tier}) - $${Number(seat.price).toFixed(2)}`}
                                        className={`w-7 h-7 rounded text-[10px] font-mono flex items-center justify-center transition-all ${badgeColor}`}
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

                      {/* Checkout Action Panel with Redis Temporary Hold & Timer (M08) */}
                      {(selectedSeatIds.length > 0 || activeHold) && (
                        <div className="mt-8 w-full max-w-lg p-5 rounded-2xl bg-slate-900 border border-indigo-500/50 shadow-2xl flex flex-col gap-4">
                          {activeHold ? (
                            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="relative flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                                </span>
                                <div>
                                  <div className="text-xs font-bold text-amber-200">Seats Temporarily Reserved</div>
                                  <div className="text-[11px] text-amber-300/80">Expires in: <span className="font-mono font-bold text-white text-xs">{formatTimer(holdRemainingSeconds)}</span></div>
                                </div>
                              </div>
                              <button
                                onClick={handleReleaseHold}
                                className="px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:text-white bg-amber-900/60 hover:bg-amber-800 rounded-lg transition-colors"
                              >
                                Release
                              </button>
                            </div>
                          ) : null}

                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs text-slate-300">
                                Seats: <span className="font-bold text-indigo-400">
                                  {activeHold
                                    ? activeHold.seatLabels.join(', ')
                                    : selectedSeatsList.map((s) => s.seat_label).join(', ')}
                                </span>
                              </div>
                              <div className="text-lg font-extrabold text-white">
                                Total: ${activeHold ? activeHold.totalAmount.toFixed(2) : totalAmount.toFixed(2)}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {!activeHold ? (
                                <>
                                  <button
                                    onClick={handlePlaceHold}
                                    disabled={holdingLoading || selectedSeatIds.length === 0}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-all shadow-lg shadow-amber-600/30 disabled:opacity-50"
                                  >
                                    {holdingLoading ? 'Holding Seats...' : 'Hold (10m)'}
                                  </button>
                                  <button
                                    onClick={handleConfirmBooking}
                                    disabled={bookingLoading || selectedSeatIds.length === 0}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                                  >
                                    {bookingLoading ? 'Booking...' : 'Direct Book'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => {
                                    setShowPaymentModal(true);
                                    setPaymentError(null);
                                  }}
                                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/30"
                                >
                                  Proceed to Payment (${activeHold.totalAmount.toFixed(2)})
                                </button>
                              )}
                            </div>
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
      )}

      {/* Payment Processing Modal (M09) */}
      {showPaymentModal && activeHold && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900 border border-indigo-500/50 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-base">
                <span>💳</span> Simulated Payment Gateway
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={paymentLoading}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Summary */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Movie:</span>
                <span className="font-semibold text-white">{selectedMovie?.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reserved Seats:</span>
                <span className="font-mono text-indigo-300 font-bold">{activeHold.seatLabels.join(', ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Payable:</span>
                <span className="text-sm font-extrabold text-emerald-400">${activeHold.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Reservation Lease:</span>
                <span className="font-mono text-amber-400">{formatTimer(holdRemainingSeconds)}</span>
              </div>
            </div>

            {/* Simulated Payment Cards / Scenarios */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Select Simulation Scenario:</label>
              <div className="space-y-2">
                <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${cardToken === 'tok_visa_success' ? 'bg-indigo-950/60 border-indigo-500' : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'}`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="cardToken"
                      value="tok_visa_success"
                      checked={cardToken === 'tok_visa_success'}
                      onChange={() => setCardToken('tok_visa_success')}
                      className="text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-100">🟢 Visa Debit (Success)</div>
                      <div className="text-[10px] text-slate-400">•••• 4242 · Normal approved transaction</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-400">200 OK</span>
                </label>

                <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${cardToken === 'tok_decline_insufficient_funds' ? 'bg-indigo-950/60 border-indigo-500' : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'}`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="cardToken"
                      value="tok_decline_insufficient_funds"
                      checked={cardToken === 'tok_decline_insufficient_funds'}
                      onChange={() => setCardToken('tok_decline_insufficient_funds')}
                      className="text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-100">🔴 Card Declined (Simulation)</div>
                      <div className="text-[10px] text-slate-400">•••• 0002 · Insufficient funds decline</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-rose-400">402 DECLINED</span>
                </label>

                <label className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${cardToken === 'tok_timeout' ? 'bg-indigo-950/60 border-indigo-500' : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'}`}>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="cardToken"
                      value="tok_timeout"
                      checked={cardToken === 'tok_timeout'}
                      onChange={() => setCardToken('tok_timeout')}
                      className="text-indigo-600"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-100">🟡 Gateway Timeout (Simulation)</div>
                      <div className="text-[10px] text-slate-400">Simulates upstream bank network timeout</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-400">TIMEOUT</span>
                </label>
              </div>
            </div>

            {paymentError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
                <span className="font-bold">Payment Error: </span>{paymentError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowPaymentModal(false)}
                disabled={paymentLoading}
                className="w-1/3 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleProcessPayment}
                disabled={paymentLoading}
                className="w-2/3 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {paymentLoading ? (
                  <>
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                    Authorizing...
                  </>
                ) : (
                  `Pay $${activeHold.totalAmount.toFixed(2)}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Confirmation Modal (Section 23) */}
      {confirmedBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 rounded-2xl bg-slate-900 border border-emerald-500/50 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <span>🎉</span> Booking Confirmed!
              </div>
              <button
                onClick={() => setConfirmedBooking(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Booking ID:</span>
                <span className="font-mono text-[11px] text-indigo-300">{confirmedBooking.id}</span>
              </div>
              {lastReceipt?.transactionReference && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Transaction Ref:</span>
                  <span className="font-mono text-[11px] text-emerald-400 font-bold">{lastReceipt.transactionReference}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Movie:</span>
                <span className="font-semibold text-white">{confirmedBooking.movie_title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Venue & Screen:</span>
                <span>{confirmedBooking.venue_name} ({confirmedBooking.screen_name})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Seats:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {confirmedBooking.seats.map((s) => s.seat_label).join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Amount:</span>
                <span className="font-bold text-white">${Number(confirmedBooking.total_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {confirmedBooking.status}
                </span>
              </div>
            </div>

            <button
              onClick={() => setConfirmedBooking(null)}
              className="w-full mt-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Booking History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full max-h-[80vh] flex flex-col p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="font-semibold text-white text-base">Your Booking History</h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {loadingHistory ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading history...</div>
              ) : myBookings.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">You have no bookings recorded yet.</div>
              ) : (
                myBookings.map((b) => (
                  <div key={b.id} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-white">{b.movie_title}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {b.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {b.venue_name} • {b.screen_name}
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/60">
                      <span className="text-slate-400">
                        Seats: <span className="font-mono text-indigo-300">{b.seats.map((s) => s.seat_label).join(', ')}</span>
                      </span>
                      <span className="font-bold text-white">${Number(b.total_amount).toFixed(2)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowHistoryModal(false)}
              className="mt-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
