export interface IdempotencyRecord {
  key: string;
  user_id: string;
  request_path: string;
  request_params_hash: string;
  status_code: number;
  response_body: any;
  created_at: Date;
  updated_at: Date;
}

export interface CachedIdempotentResponse {
  statusCode: number;
  body: any;
  paramsHash: string;
  createdAt: string;
}

export interface CreateIdempotencyDTO {
  key: string;
  userId: string;
  requestPath: string;
  requestParamsHash: string;
  statusCode: number;
  responseBody: any;
}
