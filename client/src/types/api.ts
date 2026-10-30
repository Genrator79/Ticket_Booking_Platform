export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  stack?: string;
}

export interface HealthCheckData {
  status: string;
  service: string;
  database?: string;
  redis?: string;
  timestamp: string;
  uptime: number;
  environment: string;
  memoryUsage: {
    rss: string;
    heapTotal: string;
    heapUsed: string;
  };
}
