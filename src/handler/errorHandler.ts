import { Request, Response, NextFunction } from 'express';
import Logger from '../Logger';
const log = Logger('Server');
export function unCoughtErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  log.error(JSON.stringify(err));
  res.end({ error: err });
}

export function apiErrorHandler(
  err: any,
  req: Request,
  res: Response,
  message: string
) {
  const error: object = { Message: message, Request: req, Stack: err };
  log.error(JSON.stringify(error));
  res.json({ Message: message });
}
