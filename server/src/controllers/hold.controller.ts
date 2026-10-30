import { Request, Response } from 'express';
import { holdService } from '../services/hold.service.js';

export class HoldController {
  async createHold(req: Request, res: Response): Promise<void> {
    const userId = req.user!.userId;
    const hold = await holdService.createHold(userId, req.body);

    res.status(201).json({
      success: true,
      data: hold,
    });
  }

  async getHold(req: Request, res: Response): Promise<void> {
    const userId = req.user!.userId;
    const hold = await holdService.getHold(req.params.id, userId);

    res.status(200).json({
      success: true,
      data: hold,
    });
  }

  async releaseHold(req: Request, res: Response): Promise<void> {
    const userId = req.user!.userId;
    await holdService.releaseHold(req.params.id, userId);

    res.status(200).json({
      success: true,
      message: 'Seat hold released successfully',
    });
  }
}

export const holdController = new HoldController();

