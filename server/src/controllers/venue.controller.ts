import { Request, Response, NextFunction } from 'express';
import { venueService } from '../services/venue.service.js';

export class VenueController {
  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      const venues = await venueService.getAllVenues();
      res.status(200).json({
        success: true,
        data: venues,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = await venueService.getVenueById(id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const venue = await venueService.createVenue(req.body);
      res.status(201).json({
        success: true,
        message: 'Venue created successfully',
        data: venue,
      });
    } catch (error) {
      next(error);
    }
  }

  async createScreen(req: Request, res: Response, next: NextFunction) {
    try {
      const { venueId } = req.params;
      const screen = await venueService.createScreen(venueId, req.body);
      res.status(201).json({
        success: true,
        message: 'Screen created successfully',
        data: screen,
      });
    } catch (error) {
      next(error);
    }
  }

  async getScreenSeats(req: Request, res: Response, next: NextFunction) {
    try {
      const { screenId } = req.params;
      const seats = await venueService.getScreenSeats(screenId);
      res.status(200).json({
        success: true,
        data: seats,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const venueController = new VenueController();
